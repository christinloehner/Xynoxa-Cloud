/*
 * Copyright (C) 2025 Christin Löhner
 */


import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/auth/api-helper";
import { db } from "@/server/db";
import { uploadSessions, files, fileVersions, fileVersionChunks } from "@/server/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { saveFileFromPath, formatBytes } from "@/server/services/storage";
import { indexDocument, INDEXES } from "@/server/services/search";
import { upsertEmbedding } from "@/server/services/embeddings";
import { ensureVaultFolder } from "@/server/services/vault";
import { resolveFolderPath, ensureFolderPath, ensureGroupFolderPath, findAccessibleGroupFolderByName } from "@/server/services/folder-paths";
import { recordChange } from "@/server/services/sync-journal";
import { extractText, saveExtractedText, sanitizeTextForIndex, isMimeIndexable } from "@/server/services/extract";
import { getLatestVersion } from "@/server/services/file-versioning";
import { enqueueThumbnailJob } from "@/server/services/thumbnails";
import { logInfo, logError, logUpload } from "@/server/services/logger";
import { createHash } from "crypto";
import { ensureChunk } from "@/server/services/chunk-store";
import { normalizeClientPath, splitClientPath } from "@/server/services/path-normalize";

const CHUNK_DIR = join(process.cwd(), "storage", "chunks");
const MAX_EXTRACT_BYTES = 50 * 1024 * 1024; // 50 MB

async function writeMergedFile(uploadId: string, totalChunks: number): Promise<string> {
  const { createWriteStream } = await import("fs");
  const mergedPath = join(CHUNK_DIR, `${uploadId}.merged`);
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(mergedPath);
    stream.on("error", reject);
    stream.on("finish", resolve);

    (async () => {
      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = join(CHUNK_DIR, `${uploadId}.${i}.part`);
          const buffer = await readFile(chunkPath);
          if (!stream.write(buffer)) {
            await new Promise<void>((resolve) => stream.once("drain", () => resolve()));
          }
        }
        stream.end();
      } catch (err) {
        stream.destroy(err as Error);
      }
    })();
  });
  return mergedPath;
}

async function saveSnapshotFromChunks(params: {
  fileId: string;
  version: number;
  uploadId: string;
  totalChunks: number;
  mime?: string | null;
  originalName?: string | null;
  collectForExtract?: boolean;
}): Promise<{ versionId: string; hash: string; sizeBytes: number; sizeString: string; extractBuffer?: Buffer }> {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const chunkIds: string[] = [];
  const extractBuffers: Buffer[] = [];

  for (let i = 0; i < params.totalChunks; i++) {
    const chunkPath = join(CHUNK_DIR, `${params.uploadId}.${i}.part`);
    const buffer = await readFile(chunkPath);
    sizeBytes += buffer.length;
    hash.update(buffer);
    const ref = await ensureChunk(buffer);
    chunkIds.push(ref.id);
    if (params.collectForExtract) {
      extractBuffers.push(buffer);
    }
  }

  const fileHash = hash.digest("hex");
  const sizeString = formatBytes(sizeBytes);
  const [versionRow] = await db
    .insert(fileVersions)
    .values({
      fileId: params.fileId,
      version: params.version,
      size: sizeString,
      mime: params.mime ?? "application/octet-stream",
      hash: fileHash,
      storagePath: null,
      originalName: params.originalName ?? null,
      isSnapshot: true,
      chunkCount: chunkIds.length
    })
    .returning();

  await db.insert(fileVersionChunks).values(
    chunkIds.map((chunkId, idx) => ({
      versionId: versionRow.id,
      chunkId,
      idx
    }))
  );

  return {
    versionId: versionRow.id,
    hash: versionRow.hash ?? fileHash,
    sizeBytes,
    sizeString,
    extractBuffer: params.collectForExtract ? Buffer.concat(extractBuffers) : undefined
  };
}

async function cleanupChunks(uploadId: string, totalChunks: number) {
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = join(CHUNK_DIR, `${uploadId}.${i}.part`);
    await unlink(chunkPath).catch(() => { });
  }
  await unlink(join(CHUNK_DIR, `${uploadId}.merged`)).catch(() => { });
}

// Helper to check access (duplicate from files.ts or import)
// Since we can't easily import from router, implementing basic check query here
async function checkGroupFolderAccess(db: any, userId: string, groupFolderId: string) {
  const { groupMembers, groupFolderAccess } = await import("@/server/db/schema");
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
  const startTime = Date.now();
  let userId: string | null = null;
  let uploadId: string | undefined;
  
  try {
    userId = await getUserFromRequest(req);
    if (!userId) {
      logError("Upload chunk complete: Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { uploadId: reqUploadId, folderId } = body;
    uploadId = reqUploadId;

    if (!uploadId) {
      logError("Upload chunk complete: Missing uploadId");
      return NextResponse.json({ error: "Missing uploadId" }, { status: 400 });
    }

    logInfo("Upload chunk complete started", { userId, uploadId, folderId });

    const [sessionRow] = await db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, uploadId))
      .limit(1);

    if (!sessionRow) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
    }

    if (sessionRow.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (sessionRow.isVault && (!sessionRow.iv || sessionRow.iv.length < 16)) {
      return NextResponse.json({ error: "Vault Upload ohne IV nicht erlaubt" }, { status: 400 });
    }

    const totalSize = Number(sessionRow.size || 0);
    const shouldExtract =
      !sessionRow.isVault &&
      totalSize > 0 &&
      totalSize <= MAX_EXTRACT_BYTES &&
      isMimeIndexable(sessionRow.mime || undefined);
    let sanitizedContent = "";
    let extractBuffer: Buffer | undefined;

    // Resolve target folder logic
    if (sessionRow.fileId) {
      // UPDATE Existing File
      const [existingFile] = await db.select().from(files).where(eq(files.id, sessionRow.fileId)).limit(1);
      if (!existingFile) throw new Error("File not found");
      if (existingFile.ownerId && existingFile.ownerId !== userId) throw new Error("Zugriff verweigert");
      if (!existingFile.ownerId && existingFile.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(db, userId, existingFile.groupFolderId);
        if (!hasAccess) throw new Error("Zugriff verweigert");
      }

      const now = new Date();
      let updatedFile;

      if (sessionRow.isVault) {
        const relativeFolder = await resolveFolderPath(userId, existingFile.folderId);
        const mergedPath = await writeMergedFile(uploadId, sessionRow.totalChunks);
        const saved = await saveFileFromPath(mergedPath, userId, sessionRow.filename, relativeFolder || "");
        [updatedFile] = await db.update(files)
          .set({
            size: saved.size,
            mime: sessionRow.mime || "application/octet-stream",
            hash: saved.hash,
            storagePath: saved.storagePath,
            iv: sessionRow.iv,
            originalName: sessionRow.originalName,
            updatedAt: now,
            isDeleted: false
          })
          .where(eq(files.id, existingFile.id))
          .returning();
        // Keine Versionierung/Diff für Vault
      } else {
        const last = await getLatestVersion(existingFile.id);
        const nextVer = (last?.version ?? 0) + 1;
        const snapshot = await saveSnapshotFromChunks({
          fileId: existingFile.id,
          version: nextVer,
          uploadId,
          totalChunks: sessionRow.totalChunks,
          mime: sessionRow.mime || "application/octet-stream",
          originalName: sessionRow.originalName ?? sessionRow.filename,
          collectForExtract: shouldExtract
        });
        await enqueueThumbnailJob({
          fileId: existingFile.id,
          versionId: snapshot.versionId,
          mime: sessionRow.mime || "application/octet-stream"
        });
        extractBuffer = snapshot.extractBuffer;

        [updatedFile] = await db.update(files)
          .set({
            size: snapshot.sizeString,
            mime: sessionRow.mime || "application/octet-stream",
            hash: snapshot.hash,
            storagePath: null,
            iv: null,
            originalName: sessionRow.originalName,
            updatedAt: now,
            isDeleted: false
          })
          .where(eq(files.id, existingFile.id))
          .returning();

        if (shouldExtract && extractBuffer) {
          const extractedContent = await extractText({
            fileId: updatedFile.id,
            buffer: extractBuffer,
            mime: sessionRow.mime || undefined
          });
          sanitizedContent = sanitizeTextForIndex(extractedContent);
        }
        if (sanitizedContent) {
          await saveExtractedText(db, updatedFile.id, sanitizedContent);
        }

        const effectiveOwner = existingFile.ownerId ?? null;

        await indexDocument(INDEXES.FILES, {
          id: updatedFile.id,
          ownerId: effectiveOwner,
          folderId: updatedFile.folderId,
          groupFolderId: updatedFile.groupFolderId,
          path: updatedFile.path,
          mime: updatedFile.mime,
          size: updatedFile.size,
          updatedAt: now.toISOString(),
          type: "file",
          content: sanitizedContent
        });

        await upsertEmbedding({
          db,
          ownerId: effectiveOwner,
          entity: "file",
          entityId: updatedFile.id,
          title: updatedFile.path,
          text: `${updatedFile.mime ?? ""} ${updatedFile.size ?? ""} ${sanitizedContent}`
        });
        await recordChange(db, existingFile.ownerId, "file", updatedFile.id, "update", { versionId: snapshot.versionId, baseVersionId: null });
      }

      // Cleanup
      await db.delete(uploadSessions).where(eq(uploadSessions.id, uploadId));
      await cleanupChunks(uploadId, sessionRow.totalChunks);

      return NextResponse.json({ file: updatedFile });
    }

    let targetFolderId: string | null = null; // This is the 'folders.id' FK
    let groupFolderId: string | null = null;
    let ownerId: string | null = userId;

    const rawName = sessionRow.originalName ?? sessionRow.filename;
    let normalizedName: string;
    try {
      normalizedName = normalizeClientPath(rawName);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Ungültiger Pfad" }, { status: 400 });
    }

    const { fileName, dirName } = splitClientPath(normalizedName);
    if (!fileName) {
      return NextResponse.json({ error: "Ungültiger Dateiname" }, { status: 400 });
    }

    if (sessionRow.isVault) {
      const vaultFolder = await ensureVaultFolder(db, userId);
      targetFolderId = vaultFolder.id;
      // Vault ist nur persönlich
    } else if (folderId) {
      // Try to find if input.folderId is a regular folder
      const { folders, groupFolders } = await import("@/server/db/schema");
      const [parent] = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);

      if (parent) {
        if (sessionRow.isVault && parent.groupFolderId) {
          throw new Error("Vault-Uploads sind in Gruppenordnern nicht erlaubt.");
        }
        // It is a regular folder (personal or group subfolder)
        if (parent.groupFolderId) {
          // Inside Group Folder
          const hasAccess = await checkGroupFolderAccess(db, userId, parent.groupFolderId);
          if (!hasAccess) throw new Error("Zugriff verweigert");
          ownerId = null;
          groupFolderId = parent.groupFolderId;
          targetFolderId = parent.id;
        } else if (parent.ownerId === userId) {
          // Personal folder
          targetFolderId = parent.id;
        } else {
          throw new Error("Zugriff verweigert");
        }
      } else {
        // Check if it is a Group Folder Root
        // Note: input `folderId` is the Group Folder ID
        const [gf] = await db.select().from(groupFolders).where(eq(groupFolders.id, folderId)).limit(1);
        if (gf) {
          if (sessionRow.isVault) {
            throw new Error("Vault-Uploads sind in Gruppenordnern nicht erlaubt.");
          }
          const hasAccess = await checkGroupFolderAccess(db, userId, gf.id);
          if (!hasAccess) throw new Error("Zugriff verweigert");
          ownerId = null;
          groupFolderId = gf.id;
          targetFolderId = null; // Root of GF, not in 'folders' table
        } else {
          // Not found
          // Fallback to root or throw?
          // If invalid ID passed, better fail than put in root.
          throw new Error("Target folder not found");
        }
      }
    } else if (dirName && dirName !== "." && dirName !== "/") {
      const parts = dirName.split("/").filter(Boolean);
      const gf = parts.length ? await findAccessibleGroupFolderByName(userId, parts[0]) : null;
      if (gf) {
        if (sessionRow.isVault) {
          throw new Error("Vault-Uploads sind in Gruppenordnern nicht erlaubt.");
        }
        ownerId = null;
        groupFolderId = gf.id;
        if (parts.length > 1) {
          targetFolderId = await ensureGroupFolderPath(userId, gf.id, parts.slice(1).join("/"));
        } else {
          targetFolderId = null;
        }
      } else {
        const ensured = await ensureFolderPath(userId, dirName);
        if (ensured) {
          const { folders, groupFolders } = await import("@/server/db/schema");
          const [folderRow] = await db.select().from(folders).where(eq(folders.id, ensured)).limit(1);
          if (folderRow) {
            targetFolderId = folderRow.id;
            if (folderRow.groupFolderId) {
              groupFolderId = folderRow.groupFolderId;
              ownerId = null;
            }
          } else {
            const [gfFound] = await db.select().from(groupFolders).where(eq(groupFolders.id, ensured)).limit(1);
            if (gfFound) {
              targetFolderId = null;
              groupFolderId = gfFound.id;
              ownerId = null;
            } else {
              targetFolderId = ensured;
            }
          }
        }
      }
    }

    // Resolve FS path
    // If it's a GF, `targetFolderId` might be null (checking root), so we pass `folderId` which was the GF ID for path resolution?
    // Wait, `resolveFolderPath` expects a `folders` ID or `groupFolders` ID.
    // My updated `resolveFolderPath` handles `folderId` being either if I pass it correctly?
    // If `targetFolderId` is NULL (GF Root), I need to pass the GF ID to `resolveFolderPath`.
    // If `targetFolderId` is SET (Subfolder), I pass that.

    // Logic: if `targetFolderId` is set, use it. If not, but `groupFolderId` is set, use `groupFolderId`.
    const pathResolveId = targetFolderId || groupFolderId || null;

    // Also, `resolveFolderPath` takes `userId`. For GF, `ownerId` should be ignored or we pass userId for potential personal parts?
    // My updated `resolveFolderPath` ignores ownerId matching if needed.

    const relativeFolder = await resolveFolderPath(userId, pathResolveId);

    const sizeStr = totalSize > 0 ? formatBytes(totalSize) : formatBytes(0);

    const now = new Date();

    const keyFilter = and(
      groupFolderId ? eq(files.groupFolderId, groupFolderId) : isNull(files.groupFolderId),
      targetFolderId ? eq(files.folderId, targetFolderId) : isNull(files.folderId),
      ownerId ? eq(files.ownerId, ownerId) : isNull(files.ownerId),
      eq(files.path, fileName),
      eq(files.isDeleted, false)
    );

    // Try insert new row; on conflict we will update existing with a new version.
    let createdFile;
    if (sessionRow.isVault) {
      const mergedPath = await writeMergedFile(uploadId, sessionRow.totalChunks);
      const saved = await saveFileFromPath(
        mergedPath,
        userId, // File physically stored by uploader
        fileName,
        relativeFolder
      );
      [createdFile] = await db
        .insert(files)
        .values({
          ownerId: ownerId,
          folderId: targetFolderId,
          groupFolderId: groupFolderId,
          path: fileName,
          size: saved.size,
          mime: sessionRow.mime || "application/octet-stream",
          hash: saved.hash,
          storagePath: saved.storagePath,
          isVault: true,
          iv: sessionRow.iv,
          originalName: sessionRow.originalName,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoNothing()
        .returning();
    } else {
      [createdFile] = await db
        .insert(files)
        .values({
          ownerId: ownerId,
          folderId: targetFolderId,
          groupFolderId: groupFolderId,
          path: fileName,
          size: sizeStr,
          mime: sessionRow.mime || "application/octet-stream",
          hash: null,
          storagePath: null,
          isVault: false,
          iv: null,
          originalName: sessionRow.originalName,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoNothing()
        .returning();
    }

    if (!createdFile) {
      const [existing] = await db.select().from(files).where(keyFilter).limit(1);
      if (!existing) {
        throw new Error("File insert conflict but no existing record found");
      }

      // Treat as update: add new version and update file metadata/storage
      if (sessionRow.isVault) {
        const mergedPath = await writeMergedFile(uploadId, sessionRow.totalChunks);
        const saved = await saveFileFromPath(
          mergedPath,
          userId,
          sessionRow.filename,
          relativeFolder
        );
        const [updated] = await db.update(files)
          .set({
            size: saved.size,
            mime: sessionRow.mime ?? "application/octet-stream",
            hash: saved.hash,
            storagePath: saved.storagePath,
            iv: sessionRow.iv,
            originalName: sessionRow.originalName,
            updatedAt: now,
            isDeleted: false
          })
          .where(eq(files.id, existing.id))
          .returning();
        await recordChange(db, ownerId, "file", updated.id, "update");
        createdFile = updated;
      } else {
        const last = await getLatestVersion(existing.id);
        const nextVer = (last?.version ?? 0) + 1;
        const snapshot = await saveSnapshotFromChunks({
          fileId: existing.id,
          version: nextVer,
          uploadId,
          totalChunks: sessionRow.totalChunks,
          mime: sessionRow.mime ?? "application/octet-stream",
          originalName: sessionRow.originalName ?? fileName,
          collectForExtract: shouldExtract
        });
        await enqueueThumbnailJob({
          fileId: existing.id,
          versionId: snapshot.versionId,
          mime: sessionRow.mime ?? "application/octet-stream"
        });
        extractBuffer = snapshot.extractBuffer;
        const [updated] = await db.update(files)
          .set({
            size: snapshot.sizeString,
            mime: sessionRow.mime ?? "application/octet-stream",
            hash: snapshot.hash,
            storagePath: null,
            iv: null,
            originalName: sessionRow.originalName,
            updatedAt: now,
            isDeleted: false
          })
          .where(eq(files.id, existing.id))
          .returning();

        if (shouldExtract && extractBuffer) {
          const extractedContent = await extractText({
            fileId: updated.id,
            buffer: extractBuffer,
            mime: sessionRow.mime || undefined
          });
          sanitizedContent = sanitizeTextForIndex(extractedContent);
        }

        await recordChange(db, ownerId, "file", updated.id, "update", { versionId: snapshot.versionId, baseVersionId: null });
        createdFile = updated;
      }
    }

    // Version anlegen (non-vault)
    if (!createdFile.isVault) {
      const latest = await getLatestVersion(createdFile.id);
      if (!latest) {
        const snapshot = await saveSnapshotFromChunks({
          fileId: createdFile.id,
          version: 1,
          uploadId,
          totalChunks: sessionRow.totalChunks,
          mime: sessionRow.mime ?? "application/octet-stream",
          originalName: sessionRow.originalName ?? fileName,
          collectForExtract: shouldExtract
        });
        await enqueueThumbnailJob({
          fileId: createdFile.id,
          versionId: snapshot.versionId,
          mime: sessionRow.mime ?? "application/octet-stream"
        });
        extractBuffer = snapshot.extractBuffer;
        const [updated] = await db.update(files)
          .set({
            size: snapshot.sizeString,
            hash: snapshot.hash
          })
          .where(eq(files.id, createdFile.id))
          .returning();
        createdFile = updated ?? createdFile;
        await recordChange(db, ownerId, "file", createdFile.id, "create", { versionId: snapshot.versionId });
      } else {
        await recordChange(db, ownerId, "file", createdFile.id, "create");
      }
    }

    // Cleanup session
    await db.delete(uploadSessions).where(eq(uploadSessions.id, uploadId));
    await cleanupChunks(uploadId, sessionRow.totalChunks);

    // Index
    if (!createdFile.isVault) {
      if (shouldExtract && extractBuffer && !sanitizedContent) {
        const extractedContent = await extractText({
          fileId: createdFile.id,
          buffer: extractBuffer,
          mime: sessionRow.mime || undefined
        });
        sanitizedContent = sanitizeTextForIndex(extractedContent);
      }
      if (sanitizedContent) {
        await saveExtractedText(db, createdFile.id, sanitizedContent);
      }

      await indexDocument(INDEXES.FILES, {
        id: createdFile.id,
        ownerId: ownerId,
        folderId: createdFile.folderId,
        groupFolderId: createdFile.groupFolderId,
        path: createdFile.path,
        mime: createdFile.mime,
        size: createdFile.size,
        tags: [],
        createdAt: createdFile.createdAt.toISOString(),
        type: "file",
        content: sanitizedContent
      });

      await upsertEmbedding({
        db: db,
        ownerId: ownerId,
        entity: "file",
        entityId: createdFile.id,
        title: createdFile.path,
        text: `${createdFile.mime ?? ""} ${createdFile.size ?? ""} ${sanitizedContent}`
      });
    }

    const duration = Date.now() - startTime;
    logUpload(userId!, sessionRow.filename, totalSize, true);
    logInfo("Upload chunk complete succeeded", { 
      userId, 
      uploadId, 
      fileId: createdFile.id,
      filename: sessionRow.filename,
      size: createdFile.size,
      duration: `${duration}ms`
    });

    return NextResponse.json({ file: createdFile });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError("Upload chunk complete failed", error, {
      userId,
      uploadId,
      duration: `${duration}ms`,
      errorMessage: error?.message,
      errorStack: error?.stack
    });
    logUpload(userId || "unknown", uploadId || "unknown", 0, false, error);
    
    return NextResponse.json({ 
      error: error.message || "Upload failed", 
      details: process.env.NODE_ENV === "development" ? error.stack : undefined 
    }, { status: 500 });
  }
}
