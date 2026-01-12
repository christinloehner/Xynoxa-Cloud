/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { files, folders, notes, shares, tasks } from "@/server/db/schema";
import { eq, and, isNull, or, gt } from "drizzle-orm";
import { readFileFromStorage } from "@/server/services/storage";
import argon2 from "argon2";
import AdmZip from "adm-zip";
import { createNotification } from "@/server/services/notifications";
import { resolveFolderPath } from "@/server/services/folder-paths";
import { moduleRouterRegistry } from "@/server/module-router-registry";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  await moduleRouterRegistry.initialize();
  const { token } = await params;
  const password = req.nextUrl.searchParams.get("password") || req.headers.get("x-share-pass") || undefined;
  const download = req.nextUrl.searchParams.get("download") === "1";

  const [share] = await db
    .select()
    .from(shares)
    .where(
      and(
        eq(shares.token, token),
        or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date()))
      )
    )
    .limit(1);

  if (!share) {
    return NextResponse.json({ error: "Share not found or expired" }, { status: 404 });
  }

  if (share.passwordHash) {
    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 401 });
    }
    const ok = await argon2.verify(share.passwordHash, password).catch(() => false);
    if (!ok) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }
  }

  // Helper to notify owner/creator
  const notifyDownload = async (ownerId: string | null | undefined, title: string) => {
    if (!ownerId) return;
    await createNotification({
      userId: ownerId,
      title: "Freigabe heruntergeladen",
      body: title
    }).catch(() => { });
  };

  if (share.fileId) {
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId)).limit(1);
    if (!file?.storagePath) {
      return NextResponse.json({ error: "File not available" }, { status: 404 });
    }
    if (download) {
      const zip = new AdmZip();
      const buffer = await readFileFromStorage(file.storagePath);
      zip.addFile(file.path, Buffer.from(buffer));
      const zipBuf = zip.toBuffer();
      const zipArray = zipBuf instanceof Uint8Array ? zipBuf : new Uint8Array(zipBuf);
      await notifyDownload(file.ownerId, file.path);
      return new NextResponse(new Blob([zipArray.buffer as ArrayBuffer]), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.path)}.zip"`
        }
      });
    }
    return NextResponse.json({
      type: "file",
      name: file.path,
      size: file.size,
      mime: file.mime,
      token,
      passwordRequired: !!share.passwordHash,
      downloadUrl: `/api/share/${token}?download=1`
    });
  }

  if (share.folderId) {
    const [folder] = await db.select().from(folders).where(eq(folders.id, share.folderId)).limit(1);
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    const filesInFolder = await collectFolderFiles(share.folderId, folder.name);
    if (download) {
      const zip = new AdmZip();
      for (const entry of filesInFolder) {
        if (!entry.file.storagePath) continue;
        const buffer = await readFileFromStorage(entry.file.storagePath);
        zip.addFile(entry.relativePath, Buffer.from(buffer));
      }
      const zipBuf = zip.toBuffer();
      const zipArray = zipBuf instanceof Uint8Array ? zipBuf : new Uint8Array(zipBuf);
      await notifyDownload(folder.ownerId, folder.name);
      return new NextResponse(new Blob([zipArray.buffer as ArrayBuffer]), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename=\"${encodeURIComponent(folder.name)}.zip\"`
        }
      });
    }
    return NextResponse.json({
      type: "folder",
      name: folder.name,
      items: filesInFolder.length,
      token,
      passwordRequired: !!share.passwordHash,
      downloadUrl: `/api/share/${token}?download=1`
    });
  }

  if (share.noteId) {
    const [note] = await db.select().from(notes).where(eq(notes.id, share.noteId)).limit(1);
    if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    if (note.isVault) return NextResponse.json({ error: "Vault note cannot be shared" }, { status: 403 });
    const markdown = `# ${note.title}\n\n${note.content}`;
    if (download) {
      await notifyDownload(note.ownerId, note.title);
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${encodeURIComponent(note.title || "note")}.md\"`
        }
      });
    }
    return NextResponse.json({
      type: "note",
      title: note.title,
      token,
      passwordRequired: !!share.passwordHash,
      downloadUrl: `/api/share/${token}?download=1`
    });
  }

  // Dynamische Module-Entity-Shares behandeln
  // Prüfe alle registrierten Entity-Typen auf ihre Share-FK-Spalten
  // Überspringe Core-Entities (file, folder, note, task) - die werden oben behandelt
  const coreEntityNames = ["file", "folder", "note", "task"];
  
  for (const entityType of moduleRouterRegistry.getAllEntityTypes()) {
    // Core-Entities überspringen
    if (coreEntityNames.includes(entityType.name)) continue;
    
    const fkColumn = entityType.shareFkColumn;
    if (!fkColumn) continue;
    
    // Prüfe ob dieser Share einen Wert für die FK-Spalte hat
    const shareRecord = share as Record<string, unknown>;
    const entityId = shareRecord[fkColumn] as string | null | undefined;
    if (!entityId) continue;
    
    // Dieser Share gehört zu einem Modul-Entity
    if (entityType.buildShareHtml) {
      // Lade Entity-Daten und baue HTML
      const result = await entityType.buildShareHtml(db, entityId, download);
      if (!result) {
        return NextResponse.json({ error: `${entityType.displayName} not found` }, { status: 404 });
      }
      
      if (download) {
        await notifyDownload(result.ownerId, result.title);
        return new NextResponse(result.html, {
          status: 200,
          headers: {
            "Content-Type": result.contentType || "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`
          }
        });
      }
      return NextResponse.json({
        type: entityType.name,
        ...result.metadata,
        token,
        passwordRequired: !!share.passwordHash,
        downloadUrl: `/api/share/${token}?download=1`
      });
    }
    
    // Fallback wenn kein buildShareHtml definiert
    return NextResponse.json({
      type: entityType.name,
      token,
      passwordRequired: !!share.passwordHash
    });
  }

  if (share.taskId) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, share.taskId)).limit(1);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const markdown = taskToMarkdown(task);
    if (download) {
      await notifyDownload(task.ownerId, task.title);
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent((task.title || "task") + ".md")}"`
        }
      });
    }
    return NextResponse.json({
      type: "task",
      title: task.title,
      status: task.status,
      token,
      passwordRequired: !!share.passwordHash,
      downloadUrl: `/api/share/${token}?download=1`
    });
  }

  return NextResponse.json({ error: "Unsupported share" }, { status: 400 });
}

async function collectFolderFiles(folderId: string, basePath = ""): Promise<{ file: any; relativePath: string }[]> {
  const currentPath = basePath;
  const directFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.isDeleted, false), eq(files.isVault, false)));

  const items = directFiles.map((file) => ({
    file,
    relativePath: currentPath ? `${currentPath}/${file.path}` : file.path
  }));

  const children = await db.select().from(folders).where(eq(folders.parentId, folderId));
  for (const child of children) {
    const childPath = currentPath ? `${currentPath}/${child.name}` : child.name;
    const childItems = await collectFolderFiles(child.id, childPath);
    items.push(...childItems);
  }
  return items;
}

// escapeHtml ist ein Helper der ggf. von Modulen benötigt wird - über module-router-registry exportieren
// buildBookmarkHtml wurde ins XynoxaBookmarks Modul verschoben

function taskToMarkdown(task: any) {
  const due = task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : "";
  return `# ${task.title}

- Status: ${task.status}
- Fällig: ${due || "—"}
- Assignee: ${task.assigneeId ? task.assigneeId : "—"}

${task.description ?? ""}`;
}
