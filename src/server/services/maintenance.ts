/*
 * Copyright (C) 2025 Christin Löhner
 */

import { promises as fs, existsSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { v4 as uuidv4 } from "uuid";
import { sql, eq, isNotNull } from "drizzle-orm";

import { db } from "../db";
import {
  users,
  files,
  fileVersions,
  extractedTexts,
  embeddings,
  entityTags,
  shares,
} from "../db/schema";
import { ensureFolderPath } from "./folder-paths";
import { calculateFileHash } from "./hashing";
import { indexDocument, INDEXES, meiliClient } from "./search";
import { upsertEmbedding } from "./embeddings";
import { recordChange } from "./sync-journal";
import { DRIVER, STORAGE_PATH, THUMBNAIL_PATH, formatBytes, initStorage } from "./storage";

type ProgressFn = (percent: number, message?: string) => Promise<void>;

/**
 * Re-import orphaned files that exist on disk but not in DB.
 * - Only supports local storage driver.
 * - Creates missing folder hierarchy, DB rows, search index, embeddings, sync journal.
 */
export async function runOrphanRepair(onProgress?: ProgressFn) {
  if (DRIVER !== "local") {
    throw new Error("Orphan-Reimport ist derzeit nur für den lokalen Storage-Treiber implementiert.");
  }

  if (!existsSync(STORAGE_PATH)) {
    return { processed: 0, created: 0 };
  }

  const userDirs = await fs.readdir(STORAGE_PATH, { withFileTypes: true });

  const validUsers = new Set(
    (await db.select({ id: users.id }).from(users)).map((u) => u.id)
  );

  const filePaths: { userId: string; fullPath: string }[] = [];
  let skippedUnknownOwner = 0;

  for (const dirent of userDirs) {
    if (!dirent.isDirectory()) continue;
    const userId = dirent.name;
    // nur echte User-Verzeichnisse anfassen
    if (!validUsers.has(userId)) {
      console.warn(`[maintenance] Überspringe Directory ${userId}, kein User in DB gefunden.`);
      skippedUnknownOwner++;
      continue;
    }
    const root = join(STORAGE_PATH, userId);
    await collectFiles(root, userId, filePaths);
  }

  const total = filePaths.length;
  let processed = 0;
  let created = 0;

  for (const entry of filePaths) {
    processed++;
    const relPath = relative(join(STORAGE_PATH, entry.userId), entry.fullPath);
    const storagePath = join(entry.userId, relPath);
    const dirRel = dirname(relPath) === "." ? "" : dirname(relPath);
    const fileName = entry.fullPath.split("/").pop() || "unbenannt";

    const stat = statSync(entry.fullPath);
    if (!stat.isFile()) {
      await report(onProgress, processed, total);
      continue;
    }

    const folderId = await ensureFolderPath(entry.userId, dirRel);
    const hash = await calculateFileHash(entry.fullPath);
    const sizeString = formatBytes(stat.size);

    const fd = await fs.open(entry.fullPath, "r");
    const probe = Buffer.alloc(8192);
    await fd.read(probe, 0, 8192, 0);
    await fd.close();
    const { fileTypeFromBuffer } = await import("file-type");
    const type = await fileTypeFromBuffer(probe);
    const mime = type?.mime ?? "application/octet-stream";

    const existing = await db
      .select({
        id: files.id,
        isDeleted: files.isDeleted,
        ownerId: files.ownerId,
        folderId: files.folderId,
        groupFolderId: files.groupFolderId
      })
      .from(files)
      .where(eq(files.storagePath, storagePath))
      .limit(1);

    if (existing.length > 0) {
      const fileRow = existing[0];
      if (fileRow.isDeleted || fileRow.ownerId !== entry.userId || fileRow.folderId !== folderId) {
        const now = new Date();
        await db.update(files)
          .set({
            ownerId: entry.userId,
            folderId,
            path: fileName,
            size: sizeString,
            mime,
            hash,
            storagePath,
            isDeleted: false,
            updatedAt: now
          })
          .where(eq(files.id, fileRow.id));

        await indexDocument(INDEXES.FILES, {
          id: fileRow.id,
          ownerId: entry.userId,
          folderId: fileRow.folderId,
          groupFolderId: fileRow.groupFolderId,
          path: fileName,
          mime,
          size: sizeString,
          createdAt: now.toISOString(),
          type: "file"
        });
        await upsertEmbedding({
          db,
          ownerId: entry.userId,
          entity: "file",
          entityId: fileRow.id,
          title: fileName,
          text: `${mime} ${sizeString}`
        });
        await recordChange(db, entry.userId, "file", fileRow.id, "update");
      }
      await report(onProgress, processed, total);
      continue;
    }

    const now = new Date();
    const fileId = uuidv4();

    await db.insert(files).values({
      id: fileId,
      ownerId: entry.userId,
      folderId: folderId,
      path: fileName,
      size: sizeString,
      mime,
      hash,
      storagePath,
      isDeleted: false,
      isVault: false,
      createdAt: now,
      updatedAt: now
    });

    await db.insert(fileVersions).values({
      fileId,
      version: 1,
      size: sizeString,
      mime,
      hash,
      storagePath,
      createdAt: now
    });

    await indexDocument(INDEXES.FILES, {
      id: fileId,
      ownerId: entry.userId,
      folderId: folderId,
      groupFolderId: null,
      path: fileName,
      mime,
      size: sizeString,
      createdAt: now.toISOString(),
      type: "file"
    });

    await upsertEmbedding({
      db,
      ownerId: entry.userId,
      entity: "file",
      entityId: fileId,
      title: fileName,
      text: `${mime} ${sizeString}`
    });

    await recordChange(db, entry.userId, "file", fileId, "create");

    created++;
    await report(onProgress, processed, total);
  }

  console.log(`[maintenance] Orphan-Reparatur fertig. processed=${processed}, created=${created}, skippedUnknownOwner=${skippedUnknownOwner}`);
  return { processed, created, skippedUnknownOwner };
}

/**
 * Delete all files (DB + Storage) and reset journal.
 * Users bleiben erhalten.
 */
export async function runFullReset(onProgress?: ProgressFn) {
  const stepsTotal = 6;
  let step = 0;

  const next = async (msg?: string) => {
    step++;
    if (onProgress) await onProgress(Math.round((step / stepsTotal) * 100), msg);
  };

  // 1) Meili Search leeren (Files Index)
  try {
    await meiliClient.index(INDEXES.FILES).deleteAllDocuments();
  } catch (e) {
    console.error("Meili cleanup failed", e);
  }
  await next("Suche geleert");

  // 2) Shares -> nur File-Shares entfernen
  await db.execute(sql`DELETE FROM shares WHERE file_id IS NOT NULL`);
  await next("Shares bereinigt");

  // 3) Entity Tags zu Dateien
  await db.delete(entityTags).where(eq(entityTags.entityType, "file"));
  await next("Tags bereinigt");

  // 4) Embeddings & ExtractedTexts
  await db.delete(embeddings).where(isNotNull(embeddings.fileId));
  await db.delete(extractedTexts);
  await next("Embeddings/Text bereinigt");

  // 5) File Versions + Files + Chunks
  await db.execute(sql`TRUNCATE TABLE file_version_chunks RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE file_deltas RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE file_versions RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE chunks RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE files RESTART IDENTITY CASCADE`);
  await next("Dateitabellen geleert");

  // 6) Sync Journal
  await db.execute(sql`TRUNCATE TABLE sync_journal RESTART IDENTITY`);
  await next("Journal zurückgesetzt");

  // Physische Dateien löschen
  if (DRIVER === "local") {
    await fs.rm(STORAGE_PATH, { recursive: true, force: true }).catch(() => { });
    await fs.rm(THUMBNAIL_PATH, { recursive: true, force: true }).catch(() => { });
    await initStorage();
  } else {
    console.warn("Physischer Reset für nicht-lokale Storage-Treiber nicht implementiert.");
  }

  return { success: true };
}

async function collectFiles(root: string, userId: string, target: { userId: string; fullPath: string }[]) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const full = join(root, e.name);
    if (e.isDirectory()) {
      await collectFiles(full, userId, target);
    } else if (e.isFile()) {
      target.push({ userId, fullPath: full });
    }
  }
}

async function report(onProgress: ProgressFn | undefined, processed: number, total: number) {
  if (!onProgress || total === 0) return;
  const percent = Math.round((processed / total) * 100);
  await onProgress(percent);
}
