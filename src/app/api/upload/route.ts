/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { saveFile, formatBytes } from "@/server/services/storage";
import { INDEXES, indexDocument } from "@/server/services/search";
import { calculateHash } from "@/server/services/hashing";
import { eq, and, desc, isNull } from "drizzle-orm";
import { ensureVaultFolder } from "@/server/services/vault";
import { decideAndSaveVersion, getLatestVersion } from "@/server/services/file-versioning";
import { enqueueThumbnailJob } from "@/server/services/thumbnails";
import crypto from "crypto";
import { getUserFromRequest } from "@/server/auth/api-helper";
import { recordChange } from "@/server/services/sync-journal";
import { basename, dirname } from "path";
import { ensureFolderPath, ensureGroupFolderPath, findAccessibleGroupFolderByName } from "@/server/services/folder-paths";
import { logFileUpload, logFileUpdate } from "@/server/services/file-activities";
import { upsertEmbedding } from "@/server/services/embeddings";
import { extractText, saveExtractedText, sanitizeTextForIndex } from "@/server/services/extract";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

async function safeIndexAndEmbed(params: {
  id: string;
  ownerId: string | null;
  folderId: string | null;
  groupFolderId: string | null;
  path: string;
  mime: string | null;
  size: string | null;
  content: string;
  createdOrUpdatedAt: Date;
}) {
  try {
    await indexDocument(INDEXES.FILES, {
      id: params.id,
      ownerId: params.ownerId,
      folderId: params.folderId,
      groupFolderId: params.groupFolderId,
      path: params.path,
      mime: params.mime,
      size: params.size,
      updatedAt: params.createdOrUpdatedAt.toISOString(),
      createdAt: params.createdOrUpdatedAt.toISOString(),
      type: "file",
      content: params.content
    });

    if (params.content) {
      await saveExtractedText(db, params.id, params.content);
    }

    await upsertEmbedding({
      db,
      ownerId: params.ownerId,
      entity: "file",
      entityId: params.id,
      title: params.path,
      text: `${params.mime ?? ""} ${params.size ?? ""} ${params.content}`
    });
  } catch (err) {
    console.error("Search/Embedding update failed", err);
  }
}

async function checkGroupFolderAccess(db: any, userId: string, groupFolderId: string) {
  const { groupMembers, groupFolderAccess } = await import("@/server/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const result = await db
    .select({ id: groupFolderAccess.id })
    .from(groupFolderAccess)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
    .where(and(
      eq(groupFolderAccess.groupFolderId, groupFolderId),
      eq(groupMembers.userId, userId)
    ))
    .limit(1);
  return result.length > 0;
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const fileId = formData.get("fileId") as string | null; // Optional: Update existing file
  const folderIdArg = formData.get("folderId") as string | null;
  const vaultFlag = formData.get("vault") === "true";
  const iv = formData.get("iv") as string | null;
  let originalName = (formData.get("originalName") as string | null) ?? file?.name ?? null;

  if (originalName) {
    try {
      originalName = decodeURIComponent(originalName);
    } catch (e) {
      // Ignore
    }
  }

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large", maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }
  if (vaultFlag && (!iv || iv.length < 16)) {
    return NextResponse.json({ error: "Missing IV for vault upload" }, { status: 400 });
  }

  // Import schemas needed for resolution if not already available
  const { folders, groupFolders } = await import("@/server/db/schema");

  // If fileId is provided, verify ownership and existence
  let existingFile: any = null;
  if (fileId) {
    const [found] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    if (!found) {
      return NextResponse.json({ error: "File to update not found or access denied" }, { status: 404 });
    }
    if (found.ownerId && found.ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!found.ownerId && found.groupFolderId) {
      const hasAccess = await checkGroupFolderAccess(db, userId, found.groupFolderId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    existingFile = found;
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const hash = calculateHash(buffer);
  const extractedContent = vaultFlag
    ? ""
    : await extractText({ fileId: existingFile?.id ?? "new", buffer, mime: file.type || undefined });
  const sanitizedContent = vaultFlag ? "" : sanitizeTextForIndex(extractedContent);

  let folderId: string | null = null;
  let groupFolderId: string | null = null;
  let ownerId: string | null = userId;

  if (vaultFlag) {
    if (existingFile && !existingFile.isVault) {
      return NextResponse.json({ error: "Cannot convert non-vault file via upload update" }, { status: 400 });
    }
    const vaultFolder = await ensureVaultFolder(db, userId);
    folderId = vaultFolder.id;
  } else if (existingFile) {
    folderId = existingFile.folderId;
    groupFolderId = existingFile.groupFolderId;
    ownerId = existingFile.ownerId ?? null;
  } else if (folderIdArg) {
    // User or Client provided a target folder ID.
    // 1. Check if it is a Regular Folder
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderIdArg)).limit(1);
    if (folder) {
      if (vaultFlag && folder.groupFolderId) {
        return NextResponse.json({ error: "Vault-Uploads sind in Gruppenordnern nicht erlaubt." }, { status: 403 });
      }
      if (folder.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(db, userId, folder.groupFolderId);
        if (!hasAccess) {
          return NextResponse.json({ error: "Zugriff verweigert" }, { status: 403 });
        }
      }
      folderId = folder.id;
      groupFolderId = folder.groupFolderId; // Propagate group context
      ownerId = folder.groupFolderId ? null : userId;
    } else {
      // 2. Check if it is a Group Folder Root
      const [gf] = await db.select().from(groupFolders).where(eq(groupFolders.id, folderIdArg)).limit(1);
      if (gf) {
        if (vaultFlag) {
          return NextResponse.json({ error: "Vault-Uploads sind in Gruppenordnern nicht erlaubt." }, { status: 403 });
        }
        const hasAccess = await checkGroupFolderAccess(db, userId, gf.id);
        if (!hasAccess) {
          return NextResponse.json({ error: "Zugriff verweigert" }, { status: 403 });
        }
        folderId = null; // Files in GF Root have no parent folder
        groupFolderId = gf.id;
        ownerId = null;
      }
    }
  }

  // Größe/Hash vorab
  const sizeString = formatBytes(buffer.byteLength);

  const now = new Date();

  if (existingFile) {
    // UPDATE FLOW
    let updatedFile;
    let versionRow: any = null;
    if (vaultFlag) {
      const saved = await saveFile(buffer, userId, file.name);
      [updatedFile] = await db
        .update(files)
        .set({
          size: saved.size,
          mime: file.type || "application/octet-stream",
          hash,
          storagePath: saved.storagePath,
          iv: iv ?? existingFile.iv,
          originalName,
          updatedAt: now,
          isDeleted: false
        })
        .where(eq(files.id, existingFile.id))
        .returning();
      // Keine Versionierung/Diff für Vault
    } else {
      const last = await getLatestVersion(existingFile.id);
      const nextVer = (last?.version ?? 0) + 1;
      versionRow = await decideAndSaveVersion({
        fileId: existingFile.id,
        nextVersion: nextVer,
        buffer,
        mime: file.type || "application/octet-stream",
        originalName
      });
      if (versionRow?.id) {
        await enqueueThumbnailJob({
          fileId: existingFile.id,
          versionId: versionRow.id,
          mime: file.type || "application/octet-stream"
        });
      }
      [updatedFile] = await db
        .update(files)
        .set({
          size: sizeString,
          mime: file.type || "application/octet-stream",
          hash,
          storagePath: null,
          iv: null,
          originalName,
          updatedAt: now,
          isDeleted: false
        })
        .where(eq(files.id, existingFile.id))
        .returning();
      await safeIndexAndEmbed({
        id: updatedFile.id,
        ownerId: updatedFile.ownerId,
        folderId: updatedFile.folderId,
        groupFolderId: updatedFile.groupFolderId,
        path: updatedFile.path,
        mime: updatedFile.mime,
        size: updatedFile.size,
        content: sanitizedContent,
        createdOrUpdatedAt: now
      });
    }

    await recordChange(db, existingFile.ownerId, "file", updatedFile.id, "update", { versionId: existingFile.isVault ? null : versionRow?.id, baseVersionId: versionRow?.baseVersionId ?? null });

    // Log activity
    await logFileUpdate(userId, updatedFile.path, updatedFile.folderId);

    return NextResponse.json({ file: updatedFile }, { status: 200 });

  } else {
    // CREATE FLOW (Existing logic)

    // Resolve Directory Structure from Filename
    const rawName = originalName ?? file.name;
    const fileName = basename(rawName);
    const dirName = dirname(rawName);

    if (!folderId && dirName !== "." && dirName !== "/") {
      const parts = dirName.split("/").filter(Boolean);
      const gf = parts.length ? await findAccessibleGroupFolderByName(userId, parts[0]) : null;
      if (gf) {
        if (vaultFlag) {
          return NextResponse.json({ error: "Vault-Uploads sind in Gruppenordnern nicht erlaubt." }, { status: 403 });
        }
        groupFolderId = gf.id;
        ownerId = null;
        if (parts.length > 1) {
          folderId = await ensureGroupFolderPath(userId, gf.id, parts.slice(1).join("/"));
        } else {
          folderId = null;
        }
      } else {
        folderId = await ensureFolderPath(userId, dirName);
      }
    }
    if (folderId && !groupFolderId) {
      const [folderRow] = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
      if (folderRow?.groupFolderId) {
        groupFolderId = folderRow.groupFolderId;
        ownerId = null;
      } else {
        const [gf] = await db.select().from(groupFolders).where(eq(groupFolders.id, folderId)).limit(1);
        if (gf) {
          groupFolderId = gf.id;
          ownerId = null;
          folderId = null;
        }
      }
    }

    // Check for duplicates
    // We must check if a file with 'fileName' already exists in 'folderId' (and ownerId/groupFolderId)
    // Note: ensureFolderPath returns a folder ID.

    const keyFilter = and(
      folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
      groupFolderId ? eq(files.groupFolderId, groupFolderId) : isNull(files.groupFolderId),
      (!folderId && !groupFolderId) ? eq(files.ownerId, userId) : undefined,
      (!folderId && !groupFolderId) ? eq(files.ownerId, userId) : (folderId ? undefined : isNull(files.ownerId)),
      eq(files.path, fileName),
      eq(files.isDeleted, false)
    );

    const existingCheck = await db
      .select({ id: files.id })
      .from(files)
      .where(keyFilter)
      .limit(1);

    if (existingCheck.length > 0) {
      return NextResponse.json(
        { error: "Eine Datei mit diesem Namen existiert bereits.", code: "FILE_EXISTS" },
        { status: 409 }
      );
    }

    let createdFile;
    if (vaultFlag) {
      const saved = await saveFile(buffer, userId, fileName);
      [createdFile] = await db
        .insert(files)
        .values({
          ownerId,
          folderId,
          groupFolderId, // Explicitly set resolved group ID
          path: fileName,
          originalName: fileName,
          size: saved.size,
          mime: file.type || "application/octet-stream",
          hash,
          storagePath: saved.storagePath,
          isDeleted: false,
          isVault: true,
          iv: iv ?? null,
          updatedAt: now,
          createdAt: now
        })
        .onConflictDoNothing()
        .returning();
    } else {
      [createdFile] = await db
        .insert(files)
        .values({
          ownerId,
          folderId,
          groupFolderId,
          path: fileName,
          originalName: fileName,
          size: sizeString,
          mime: file.type || "application/octet-stream",
          hash,
          storagePath: null,
          isDeleted: false,
          isVault: false,
          iv: null,
          updatedAt: now,
          createdAt: now
        })
        .onConflictDoNothing()
        .returning();
    }

    if (!createdFile) {
      // Conflict occurred, fetch existing
      const [existing] = await db.select().from(files).where(keyFilter).limit(1);
      if (existing) {
        return NextResponse.json({ file: existing }, { status: 200 });
      }
      // Should not happen, but guard
      return NextResponse.json({ error: "File already exists" }, { status: 409 });
    }

    if (!vaultFlag) {
      const versionRow = await decideAndSaveVersion({
        fileId: createdFile.id,
        nextVersion: 1,
        buffer,
        mime: file.type || "application/octet-stream",
        originalName: fileName
      });
      if (versionRow?.id) {
        await enqueueThumbnailJob({
          fileId: createdFile.id,
          versionId: versionRow.id,
          mime: file.type || "application/octet-stream"
        });
      }
      await safeIndexAndEmbed({
        id: createdFile.id,
        ownerId: createdFile.ownerId,
        folderId: createdFile.folderId,
        groupFolderId: createdFile.groupFolderId,
        path: createdFile.path,
        mime: createdFile.mime,
        size: createdFile.size,
        content: sanitizedContent,
        createdOrUpdatedAt: now
      });

      await recordChange(db, createdFile.ownerId, "file", createdFile.id, "create", { versionId: (versionRow as any)?.id });
    } else {
      await recordChange(db, createdFile.ownerId, "file", createdFile.id, "create");
    }

    // Log activity
    await logFileUpload(userId, createdFile.path, createdFile.folderId);

    return NextResponse.json({ file: createdFile }, { status: 201 });
  }
}
