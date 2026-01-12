/*
 * Copyright (C) 2025 Christin Löhner
 */

import { DB } from "../db";
import { files, fileVersions, entityTags, tags } from "../db/schema";
import { sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { INDEXES, indexDocument } from "./search";
import { upsertEmbedding } from "./embeddings";
import { buildBufferFromVersion, decideAndSaveVersion, getLatestVersion } from "./file-versioning";
import { enqueueThumbnailJob } from "./thumbnails";
import { formatBytes } from "./storage";

export async function cloneFileWithTags(params: {
  db: DB;
  ownerId: string | null;
  groupFolderId: string | null;
  srcId: string;
  targetFolderId: string | null;
}): Promise<{ id: string; versionId?: string | null }> {
  const { db, ownerId, groupFolderId, srcId, targetFolderId } = params;
  const [src] = await db
    .select()
    .from(files)
    .where(sql`${files.id} = ${srcId}`)
    .limit(1);
  if (!src) throw new Error("Datei nicht gefunden");

  const newId = uuidv4();
  const now = new Date();

  if (src.isVault) {
    // Vault-Dateien bleiben 1:1
    await db.insert(files).values({
      id: newId,
      ownerId,
      folderId: targetFolderId,
      groupFolderId,
      path: src.path,
      size: src.size,
      mime: src.mime,
      hash: src.hash,
      storagePath: src.storagePath,
      iv: src.iv,
      originalName: src.originalName,
      isVault: true,
      createdAt: now,
      updatedAt: now
    });
    const [vrow] = await db.insert(fileVersions).values({
      fileId: newId,
      version: 1,
      size: src.size,
      mime: src.mime,
      hash: src.hash,
      storagePath: src.storagePath,
      createdAt: now
    }).returning();
    return { id: newId, versionId: vrow.id };
  } else {
    const latest = await getLatestVersion(src.id);
    if (!latest) throw new Error("Quelle hat keine Versionen");
    const buffer = await buildBufferFromVersion(latest.id);
    await db.insert(files).values({
      id: newId,
      ownerId,
      folderId: targetFolderId,
      groupFolderId,
      path: src.path,
      size: formatBytes(buffer.byteLength),
      mime: src.mime,
      hash: src.hash,
      storagePath: null,
      iv: null,
      originalName: src.originalName,
      isVault: false,
      createdAt: now,
      updatedAt: now
    });
    const vrow = await decideAndSaveVersion({
      fileId: newId,
      nextVersion: 1,
      buffer,
      mime: src.mime,
      originalName: src.originalName ?? src.path
    });
    if (vrow?.id) {
      await enqueueThumbnailJob({
        fileId: newId,
        versionId: vrow.id,
        mime: src.mime
      });
    }
  }

  const srcTags = await db
    .select({ tagId: entityTags.tagId })
    .from(entityTags)
    .where(sql`${entityTags.entityId} = ${srcId} AND ${entityTags.entityType} = 'file'`);

  for (const t of srcTags) {
    await db
      .insert(entityTags)
      .values({ entityId: newId, entityType: "file", tagId: t.tagId, fileId: newId })
      .onConflictDoNothing?.();
  }

  await indexDocument(INDEXES.FILES, {
    id: newId,
    ownerId,
    folderId: targetFolderId,
    groupFolderId,
    path: src.path,
    mime: src.mime,
    size: src.size,
    tags: [],
    createdAt: now.toISOString(),
    type: "file"
  });
  await upsertEmbedding({
    db,
    ownerId,
    entity: "file",
    entityId: newId,
    title: src.path,
    text: `${src.mime ?? ""} ${src.size ?? ""}`
  });

  return { id: newId, versionId: src.isVault ? null : (await getLatestVersion(newId))?.id ?? undefined };
}
