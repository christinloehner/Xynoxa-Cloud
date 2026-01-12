/*
 * Copyright (C) 2025 Christin Löhner
 */

import { writeFile, mkdir, readFile as fsReadFile, unlink, stat, rename, rm, readdir } from "fs/promises";
import { join, resolve, dirname, posix as pathPosix } from "path";
import { existsSync, createReadStream, createWriteStream } from "fs";
import { calculateHash, calculateFileHash } from "./hashing";
import { pipeline } from "stream/promises";
import { Client } from "minio";
import { statSync } from "fs";

export const DRIVER = process.env.STORAGE_DRIVER || "local";
export const STORAGE_PATH =
  process.env.STORAGE_PATH || resolve(process.cwd(), "storage", "files"); // fallback if /data not writable
export const THUMBNAIL_PATH =
  process.env.THUMBNAIL_PATH || resolve(STORAGE_PATH, "..", "thumbnails");
export const MINIO_BUCKET = process.env.MINIO_BUCKET || "xynoxa-files";

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

/**
 * Initialize storage directory
 */
export async function initStorage() {
  if (DRIVER === "minio" && minioClient) {
    const exists = await minioClient.bucketExists(MINIO_BUCKET).catch(async () => {
      return false;
    });
    if (!exists) {
      await minioClient.makeBucket(MINIO_BUCKET, "");
    }
    return;
  }
  if (!existsSync(STORAGE_PATH)) {
    await mkdir(STORAGE_PATH, { recursive: true });
  }
  if (!existsSync(THUMBNAIL_PATH)) {
    await mkdir(THUMBNAIL_PATH, { recursive: true });
  }
}

export function getUserRoot(userId: string): string {
  return join(STORAGE_PATH, userId);
}

function getThumbnailKey(fileId: string, versionId: string, size: number) {
  const name = `${versionId}_${size}.webp`;
  return { name, key: pathPosix.join("thumbnails", fileId, name) };
}

export async function readThumbnail(fileId: string, versionId: string, size: number): Promise<Buffer | null> {
  const { name, key } = getThumbnailKey(fileId, versionId, size);
  if (DRIVER === "minio" && minioClient) {
    try {
      await minioClient.statObject(MINIO_BUCKET, key);
      const stream = await minioClient.getObject(MINIO_BUCKET, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }
  const dir = join(THUMBNAIL_PATH, fileId);
  const fullPath = join(dir, name);
  if (!existsSync(fullPath)) return null;
  return fsReadFile(fullPath);
}

export async function writeThumbnail(
  fileId: string,
  versionId: string,
  size: number,
  buffer: Buffer
): Promise<void> {
  const { name, key } = getThumbnailKey(fileId, versionId, size);
  if (DRIVER === "minio" && minioClient) {
    await minioClient.putObject(MINIO_BUCKET, key, buffer);
    return;
  }
  const dir = join(THUMBNAIL_PATH, fileId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const fullPath = join(dir, name);
  await writeFile(fullPath, buffer);
}

export async function deleteThumbnailsForFile(fileId: string): Promise<void> {
  const prefix = pathPosix.join("thumbnails", fileId) + "/";
  if (DRIVER === "minio" && minioClient) {
    try {
      const objects: { name: string }[] = [];
      const stream = minioClient.listObjectsV2(MINIO_BUCKET, prefix, true);
      for await (const obj of stream) {
        if (obj.name) objects.push({ name: obj.name });
      }
      if (objects.length > 0) {
        await minioClient.removeObjects(MINIO_BUCKET, objects.map((o) => o.name));
      }
    } catch {
      // ignore
    }
    return;
  }

  const dir = join(THUMBNAIL_PATH, fileId);
  if (!existsSync(dir)) return;
  await rm(dir, { recursive: true, force: true });
}

export async function deleteThumbnailsForVersion(fileId: string, versionId: string): Promise<void> {
  const prefix = pathPosix.join("thumbnails", fileId, `${versionId}_`);
  if (DRIVER === "minio" && minioClient) {
    try {
      const objects: { name: string }[] = [];
      const stream = minioClient.listObjectsV2(MINIO_BUCKET, prefix, true);
      for await (const obj of stream) {
        if (obj.name) objects.push({ name: obj.name });
      }
      if (objects.length > 0) {
        await minioClient.removeObjects(MINIO_BUCKET, objects.map((o) => o.name));
      }
    } catch {
      // ignore
    }
    return;
  }

  const dir = join(THUMBNAIL_PATH, fileId);
  if (!existsSync(dir)) return;
  try {
    const entries = await readdir(dir);
    await Promise.all(
      entries
        .filter((name) => name.startsWith(`${versionId}_`))
        .map((name) => rm(join(dir, name), { force: true }))
    );
  } catch {
    // ignore
  }
}

/**
 * Save a file to storage and return hash + size
 * @param buffer File content
 * @param userId Owner ID
 * @param filename File name
 * @param relativePath Relative path within user's folder (e.g. "Docs/Work")
 */
export async function saveFile(
  buffer: Buffer,
  userId: string,
  filename: string, // This is the file name
  relativePath: string = "" // This is the folder structure
): Promise<{ hash: string; size: string; storagePath: string }> {
  await initStorage();
  const hash = calculateHash(buffer);

  if (DRIVER === "minio" && minioClient) {
    // For MinIO, we can use the path as object name
    const objectName = join(userId, relativePath, filename);
    await minioClient.putObject(MINIO_BUCKET, objectName, buffer);
    const size = formatBytes(buffer.byteLength);
    return { hash, size, storagePath: objectName };
  } else {
    // Local FS
    const userRoot = getUserRoot(userId);
    
    // Ensure user root directory exists (might be deleted after Hard Reset)
    if (!existsSync(userRoot)) {
      await mkdir(userRoot, { recursive: true });
    }
    
    const targetDir = join(userRoot, relativePath);
    const fullPath = join(targetDir, filename);
    const fullDir = dirname(fullPath);

    if (!existsSync(fullDir)) {
      await mkdir(fullDir, { recursive: true });
    }

    // Safety check just in case
    // We overwrite if it exists, as implied by "uploading same file again" usually replaces or versions.
    // But backend logic handles versions. This functions just puts bits on disk.

    await writeFile(fullPath, buffer);

    const stats = await stat(fullPath);
    const size = formatBytes(stats.size);

    // For local driver, storagePath stored in DB could be relative to STORAGE_PATH or just relative to user?
    // Existing implementation stored "userId/hash-filename".
    // New implementation stores "userId/path/to/file.ext".
    // DB `storagePath` column is used to retrieve it later.
    const storagePathResult = join(userId, relativePath, filename);

    return { hash, size, storagePath: storagePathResult };
  }
}

/**
 * Save a file from a local path to storage and return hash + size
 * Used for large uploads to avoid buffering entire files in memory.
 */
export async function saveFileFromPath(
  filePath: string,
  userId: string,
  filename: string,
  relativePath: string = ""
): Promise<{ hash: string; size: string; storagePath: string }> {
  await initStorage();
  const hash = await calculateFileHash(filePath);
  const stats = await stat(filePath);
  const size = formatBytes(stats.size);

  if (DRIVER === "minio" && minioClient) {
    const objectName = join(userId, relativePath, filename);
    const stream = createReadStream(filePath);
    await minioClient.putObject(MINIO_BUCKET, objectName, stream, stats.size);
    await unlink(filePath).catch(() => {});
    return { hash, size, storagePath: objectName };
  }

  const userRoot = getUserRoot(userId);
  if (!existsSync(userRoot)) {
    await mkdir(userRoot, { recursive: true });
  }
  const targetDir = join(userRoot, relativePath);
  const fullPath = join(targetDir, filename);
  const fullDir = dirname(fullPath);
  if (!existsSync(fullDir)) {
    await mkdir(fullDir, { recursive: true });
  }

  try {
    await rename(filePath, fullPath);
  } catch {
    await pipeline(createReadStream(filePath), createWriteStream(fullPath));
    await unlink(filePath).catch(() => {});
  }

  const storagePathResult = join(userId, relativePath, filename);
  return { hash, size, storagePath: storagePathResult };
}

/**
 * Create a directory in storage
 */
export async function createDirectory(userId: string, relativePath: string): Promise<void> {
  if (DRIVER === "minio") return; // MinIO handles folders implicitly
  
  const userRoot = getUserRoot(userId);
  // Ensure user root directory exists (might be deleted after Hard Reset)
  if (!existsSync(userRoot)) {
    await mkdir(userRoot, { recursive: true });
  }
  
  const path = join(userRoot, relativePath);
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

/**
 * Move/Rename a file or directory
 */
export async function movePath(userId: string, oldRelativePath: string, newRelativePath: string): Promise<void> {
  if (DRIVER === "minio") {
    // MinIO rename is copy + delete. Implementing for folder mv is expensive.
    // For now focusing on local driver as requested.
    return;
  }
  
  const userRoot = getUserRoot(userId);
  // Ensure user root directory exists (might be deleted after Hard Reset)
  if (!existsSync(userRoot)) {
    await mkdir(userRoot, { recursive: true });
  }
  
  const oldPath = join(userRoot, oldRelativePath);
  const newPath = join(userRoot, newRelativePath);
  const newDir = dirname(newPath);

  if (!existsSync(newDir)) {
    await mkdir(newDir, { recursive: true });
  }
  if (existsSync(oldPath)) {
    await rename(oldPath, newPath);
  }
}

/**
 * Delete a file or directory (recursive)
 */
export async function deletePath(userId: string, relativePath: string): Promise<void> {
  if (DRIVER === "minio") {
    // MinIO delete
    return;
  }
  const path = join(getUserRoot(userId), relativePath);
  if (existsSync(path)) {
    await rm(path, { recursive: true, force: true });
  }
}

/**
 * Read a file from storage
 */
export async function readFileFromStorage(storagePath: string): Promise<Buffer> {
  if (DRIVER === "minio" && minioClient) {
    const stream = await minioClient.getObject(MINIO_BUCKET, storagePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return await fsReadFile(join(STORAGE_PATH, storagePath));
}

/**
 * Delete a file from storage
 */
export async function deleteFile(storagePath: string): Promise<void> {
  if (DRIVER === "minio" && minioClient) {
    await minioClient.removeObject(MINIO_BUCKET, storagePath).catch(() => { });
  } else {
    const fullPath = join(STORAGE_PATH, storagePath);
    if (existsSync(fullPath)) {
      await unlink(fullPath);
    }
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
