/*
 * Copyright (C) 2025 Christin Löhner
 */

import { mkdir, writeFile, readFile as fsReadFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { db } from "../db";
import { chunks, fileVersionChunks } from "../db/schema";
import { eq, isNull, or, and } from "drizzle-orm";
import { createHash } from "crypto";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { DRIVER, MINIO_BUCKET, STORAGE_PATH } from "./storage";
import { Client } from "minio";

const gz = promisify(gzip);
const gunz = promisify(gunzip);
const DEFAULT_CHUNK_SIZE = 512 * 1024; // 512 KB für feinere Deduplizierung

let minioClient: Client | null = null;
if (DRIVER === "minio") {
  minioClient = new Client({
    endPoint: process.env.MINIO_ENDPOINT || "minio",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin"
  });
}

export type ChunkRef = {
  id: string;
  hash: string;
  size: number;
  compressedSize: number;
  storagePath: string;
};

export function chunkBuffer(buffer: Buffer, chunkSize = DEFAULT_CHUNK_SIZE): Buffer[] {
  const list: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    list.push(buffer.slice(offset, Math.min(offset + chunkSize, buffer.length)));
  }
  return list;
}

export async function ensureChunk(chunk: Buffer): Promise<ChunkRef> {
  const { logDebug, logError, logWarn } = await import("./logger");
  const hash = createHash("sha256").update(chunk).digest("hex");
  const [existing] = await db.select().from(chunks).where(eq(chunks.hash, hash)).limit(1);
  if (existing) {
    // Verify physical file exists before deduplicating
    const physicalPath = DRIVER === "minio" ? existing.storagePath : join(STORAGE_PATH, existing.storagePath);
    let fileExists = false;
    
    if (DRIVER === "minio" && minioClient) {
      try {
        await minioClient.statObject(MINIO_BUCKET, existing.storagePath);
        fileExists = true;
      } catch (e) {
        fileExists = false;
      }
    } else {
      fileExists = existsSync(physicalPath);
    }
    
    if (fileExists) {
      await db.update(chunks).set({ refCount: (existing.refCount ?? 0) + 1 }).where(eq(chunks.id, existing.id));
      logDebug("Chunk deduplicated", { chunkId: existing.id, hash, refCount: (existing.refCount ?? 0) + 1 });
      return existing as unknown as ChunkRef;
    } else {
      // Physical file missing - remove stale DB entry and recreate
      logWarn("Chunk exists in DB but physical file missing - recreating", { chunkId: existing.id, hash, storagePath: existing.storagePath });
      await db.delete(chunks).where(eq(chunks.id, existing.id));
    }
  }

  const compressed = await gz(chunk);
  const storagePath = buildChunkPath(hash);

  try {
    if (DRIVER === "minio" && minioClient) {
      await minioClient.putObject(MINIO_BUCKET, storagePath, compressed);
      logDebug("Chunk saved to MinIO", { hash, storagePath, size: chunk.length, compressed: compressed.length });
    } else {
      const full = join(STORAGE_PATH, storagePath);
      const dir = full.substring(0, full.lastIndexOf("/"));
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
        logDebug("Chunk directory created", { dir });
      }
      await writeFile(full, compressed);
      logDebug("Chunk saved to disk", { hash, storagePath: full, size: chunk.length, compressed: compressed.length });
    }
  } catch (e: any) {
    logError("Failed to save chunk to storage", e, { hash, storagePath, driver: DRIVER });
    throw e;
  }

  const [row] = await db.insert(chunks).values({
    hash,
    size: chunk.byteLength,
    compressedSize: compressed.byteLength,
    storagePath,
    refCount: 1
  }).returning();

  return row as unknown as ChunkRef;
}

export async function releaseChunk(chunkId: string) {
  const [row] = await db.select().from(chunks).where(eq(chunks.id, chunkId)).limit(1);
  if (!row) return;
  const next = Math.max((row.refCount ?? 1) - 1, 0);
  if (next > 0) {
    await db.update(chunks).set({ refCount: next }).where(eq(chunks.id, chunkId));
    return;
  }
  await db.delete(chunks).where(eq(chunks.id, chunkId));
  try {
    if (DRIVER === "minio" && minioClient) {
      await minioClient.removeObject(MINIO_BUCKET, row.storagePath);
    } else {
      await rm(join(STORAGE_PATH, row.storagePath), { force: true });
    }
  } catch (e) {
    console.error("Failed to delete chunk", row.storagePath, e);
  }
}

export async function readChunk(hashOrPath: string): Promise<Buffer> {
  const { logDebug, logError } = await import("./logger");
  const [row] = await db.select().from(chunks).where(eq(chunks.hash, hashOrPath)).limit(1);
  const path = row?.storagePath ?? hashOrPath;
  
  logDebug("Reading chunk", { hashOrPath, storagePath: path, driver: DRIVER });
  
  let compressed: Buffer;
  try {
    if (DRIVER === "minio" && minioClient) {
      const stream = await minioClient!.getObject(MINIO_BUCKET, path);
      const list: Buffer[] = [];
      for await (const part of stream) list.push(Buffer.from(part));
      compressed = Buffer.concat(list);
      logDebug("Chunk read from MinIO", { path, compressedSize: compressed.length });
    } else {
      const fullPath = join(STORAGE_PATH, path);
      compressed = await fsReadFile(fullPath);
      logDebug("Chunk read from disk", { path: fullPath, compressedSize: compressed.length });
    }
  } catch (e: any) {
    logError("Failed to read chunk file", e, { hashOrPath, path, driver: DRIVER });
    throw new Error(`Chunk file not found: ${path}`);
  }
  
  try {
    const decompressed = await gunz(compressed);
    logDebug("Chunk decompressed", { path, decompressedSize: decompressed.length });
    return decompressed;
  } catch (e: any) {
    logError("Failed to decompress chunk", e, { hashOrPath, path });
    throw new Error(`Chunk decompression failed: ${path}`);
  }
}

function buildChunkPath(hash: string) {
  const prefix = hash.slice(0, 2);
  return join("chunks", prefix, `${hash}.gz`);
}

// GC: entfernt verwaiste Chunks (ref_count <= 0 oder keine Referenz in file_version_chunks)
export async function cleanupUnusedChunks(): Promise<{ removed: number }> {
  const orphanRows = await db
    .select({ id: chunks.id, storagePath: chunks.storagePath })
    .from(chunks)
    .leftJoin(fileVersionChunks, eq(fileVersionChunks.chunkId, chunks.id))
    .where(or(eq(chunks.refCount, 0), isNull(fileVersionChunks.id)));

  let removed = 0;
  for (const row of orphanRows) {
    removed++;
    await db.delete(chunks).where(eq(chunks.id, row.id));
    try {
      if (DRIVER === "minio" && minioClient) {
        await minioClient.removeObject(MINIO_BUCKET, row.storagePath);
      } else {
        await rm(join(STORAGE_PATH, row.storagePath), { force: true });
      }
    } catch (e) {
      console.error("Chunk GC delete failed", row.storagePath, e);
    }
  }
  return { removed };
}
