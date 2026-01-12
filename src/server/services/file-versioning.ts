/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "../db";
import { fileVersions, fileVersionChunks, fileDeltas, chunks } from "../db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { calculateHash } from "./hashing";
import { chunkBuffer, ensureChunk, readChunk, releaseChunk } from "./chunk-store";
import { deleteThumbnailsForVersion, formatBytes } from "./storage";
import { applyPatch, createPatch } from "diff";

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/javascript", "application/xml"]; // simple heuristic
const CHECKPOINT_INTERVAL = 10;
const DELTA_SAVINGS_RATIO = 0.7;
const MAX_DELTA_SIZE = 1_000_000; // 1MB

export async function getLatestVersion(fileId: string) {
  const [row] = await db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.fileId, fileId))
    .orderBy(desc(fileVersions.version))
    .limit(1);
  return row || null;
}

export async function getVersionById(versionId: string) {
  const [row] = await db.select().from(fileVersions).where(eq(fileVersions.id, versionId)).limit(1);
  return row || null;
}

export async function buildBufferFromVersion(versionId: string): Promise<Buffer> {
  const { logDebug, logError } = await import("./logger");
  const version = await getVersionById(versionId);
  if (!version) {
    logError("Version not found", undefined, { versionId });
    throw new Error("Version nicht gefunden");
  }
  
  logDebug("Building buffer from version", { versionId, fileId: version.fileId, isSnapshot: version.isSnapshot });
  
  if (version.isSnapshot) {
    const parts = await db
      .select({ chunkId: fileVersionChunks.chunkId })
      .from(fileVersionChunks)
      .where(eq(fileVersionChunks.versionId, version.id))
      .orderBy(fileVersionChunks.idx);
    
    logDebug("Loading snapshot chunks", { versionId, chunkCount: parts.length });
    
    if (parts.length === 0) {
      logError("No chunks found for snapshot version", undefined, { versionId, fileId: version.fileId });
      throw new Error("File content missing on storage");
    }
    
    const buffers: Buffer[] = [];
    for (const p of parts) {
      try {
        const buf = await readChunkById(p.chunkId);
        buffers.push(buf);
      } catch (e: any) {
        logError("Failed to read chunk", e, { versionId, chunkId: p.chunkId });
        throw new Error("File content missing on storage");
      }
    }
    const result = Buffer.concat(buffers);
    logDebug("Buffer built successfully", { versionId, size: result.length });
    return result;
  }
  // delta: reconstruct base then apply patch
  if (!version.baseVersionId) throw new Error("Delta ohne Basisversion");
  const baseBuffer = await buildBufferFromVersion(version.baseVersionId);
  const [delta] = await db.select().from(fileDeltas).where(eq(fileDeltas.versionId, version.id)).limit(1);
  if (!delta) throw new Error("Delta Daten fehlen");
  const baseText = baseBuffer.toString("utf8");
  const patched = applyPatch(baseText, delta.patch);
  if (patched === false) throw new Error("Patch konnte nicht angewendet werden");
  return Buffer.from(patched, "utf8");
}

async function readChunkById(chunkId: string) {
  const { logDebug, logError } = await import("./logger");
  const [row] = await db.select().from(chunks).where(eq(chunks.id, chunkId)).limit(1);
  if (!row) {
    logError("Chunk not found in database", undefined, { chunkId });
    throw new Error("Chunk nicht gefunden");
  }
  logDebug("Reading chunk from storage", { chunkId, storagePath: row.storagePath });
  return readChunk(row.storagePath);
}

function isTextMime(mime?: string | null) {
  if (!mime) return false;
  return TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p)) || mime.endsWith("+xml") || mime.includes("javascript");
}

export async function saveSnapshotVersion(params: {
  fileId: string;
  version: number;
  buffer: Buffer;
  mime?: string | null;
  iv?: string | null;
  originalName?: string | null;
}) {
  const { logDebug, logError } = await import("./logger");
  const { fileId, version, buffer, mime, iv, originalName } = params;
  
  logDebug("Saving snapshot version", { fileId, version, bufferSize: buffer.length });
  
  const chunksBuffers = chunkBuffer(buffer);
  let idx = 0;
  const chunkRefs = [] as { id: string }[];
  for (const chunk of chunksBuffers) {
    try {
      const ref = await ensureChunk(chunk);
      chunkRefs.push(ref as { id: string });
      logDebug(`Chunk ${idx} saved`, { fileId, chunkId: ref.id, size: chunk.length });
      idx++;
    } catch (e: any) {
      logError(`Failed to save chunk ${idx}`, e, { fileId, chunkIndex: idx });
      throw e;
    }
  }
  const hash = calculateHash(buffer);
  const sizeString = formatBytes(buffer.byteLength);
  const [row] = await db
    .insert(fileVersions)
    .values({
      fileId,
      version,
      size: sizeString,
      mime: mime ?? "application/octet-stream",
      hash,
      storagePath: null,
      iv: iv ?? null,
      originalName: originalName ?? null,
      isSnapshot: true,
      chunkCount: chunkRefs.length
    })
    .returning();

  for (const [i, c] of chunkRefs.entries()) {
    await db.insert(fileVersionChunks).values({ versionId: row.id, chunkId: c.id, idx: i });
  }
  return row;
}

export async function saveDeltaVersion(params: {
  fileId: string;
  version: number;
  buffer: Buffer;
  baseVersionId: string;
  mime?: string | null;
  originalName?: string | null;
}) {
  const { fileId, version, buffer, baseVersionId, mime, originalName } = params;
  const baseBuffer = await buildBufferFromVersion(baseVersionId);
  const baseText = baseBuffer.toString("utf8");
  const newText = buffer.toString("utf8");
  const patch = createPatch(originalName || "file", baseText, newText);
  const patchSize = Buffer.byteLength(patch, "utf8");
  const hash = calculateHash(buffer);
  const sizeString = formatBytes(buffer.byteLength);
  const [row] = await db
    .insert(fileVersions)
    .values({
      fileId,
      version,
      size: sizeString,
      mime: mime ?? "text/plain",
      hash,
      storagePath: null,
      originalName: originalName ?? null,
      isSnapshot: false,
      baseVersionId,
      deltaStrategy: "unified",
      deltaSize: patchSize,
      chunkCount: 0
    })
    .returning();

  await db.insert(fileDeltas).values({
    versionId: row.id,
    baseVersionId,
    strategy: "unified",
    patch,
    patchSize
  });
  return row;
}

export async function decideAndSaveVersion(params: {
  fileId: string;
  nextVersion: number;
  buffer: Buffer;
  mime?: string | null;
  iv?: string | null;
  originalName?: string | null;
}) {
  const { fileId, nextVersion, buffer, mime, iv, originalName } = params;
  // checkpoint rule
  const last = await getLatestVersion(fileId);
  if (!last || nextVersion % CHECKPOINT_INTERVAL === 0 || !isTextMime(mime)) {
    return saveSnapshotVersion({ fileId, version: nextVersion, buffer, mime, iv, originalName });
  }
  const baseBuffer = await buildBufferFromVersion(last.id);
  const patch = createPatch(originalName || "file", baseBuffer.toString("utf8"), buffer.toString("utf8"));
  const patchSize = Buffer.byteLength(patch, "utf8");
  if (patchSize > MAX_DELTA_SIZE || patchSize > buffer.byteLength * DELTA_SAVINGS_RATIO) {
    return saveSnapshotVersion({ fileId, version: nextVersion, buffer, mime, iv, originalName });
  }
  return saveDeltaVersion({ fileId, version: nextVersion, buffer, baseVersionId: last.id, mime, originalName });
}

export async function releaseVersions(versionIds: string[]) {
  if (versionIds.length === 0) return;
  const versions = await db
    .select({ id: fileVersions.id, fileId: fileVersions.fileId })
    .from(fileVersions)
    .where(inArray(fileVersions.id, versionIds));

  const rows = await db
    .select({ versionId: fileVersionChunks.versionId, chunkId: fileVersionChunks.chunkId })
    .from(fileVersionChunks)
    .where(inArray(fileVersionChunks.versionId, versionIds));

  for (const row of rows) {
    await releaseChunk(row.chunkId);
  }

  for (const version of versions) {
    await deleteThumbnailsForVersion(version.fileId, version.id);
  }
}
