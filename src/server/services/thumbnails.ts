/*
 * Copyright (C) 2025 Christin Löhner
 */

import sharp from "sharp";
import { db } from "../db";
import { files, fileVersions } from "../db/schema";
import { eq } from "drizzle-orm";
import { buildBufferFromVersion } from "./file-versioning";
import { readThumbnail, writeThumbnail } from "./storage";
import { logError } from "./logger";

const SUPPORTED_IMAGES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "image/tif"
];

const EXT_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff"
};

function resolveImageMime(fileMime?: string | null, name?: string | null) {
  if (fileMime && SUPPORTED_IMAGES.includes(fileMime)) return fileMime;
  const ext = name?.split(".").pop()?.toLowerCase();
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  return null;
}

function clampSize(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function generateThumbnailForVersion(params: {
  fileId: string;
  versionId: string;
  size?: number;
  mime?: string | null;
}) {
  const size = clampSize(params.size ?? 64, 16, 64);

  const [file] = await db
    .select({ id: files.id, mime: files.mime, isVault: files.isVault, originalName: files.originalName, path: files.path })
    .from(files)
    .where(eq(files.id, params.fileId))
    .limit(1);

  if (!file || file.isVault) return false;

  const [version] = await db
    .select({ id: fileVersions.id, mime: fileVersions.mime, originalName: fileVersions.originalName })
    .from(fileVersions)
    .where(eq(fileVersions.id, params.versionId))
    .limit(1);

  if (!version) return false;

  const mime = resolveImageMime(
    params.mime ?? version.mime ?? file.mime,
    version.originalName ?? file.originalName ?? file.path
  );
  if (!mime) return false;

  const cached = await readThumbnail(params.fileId, params.versionId, size);
  if (cached) return true;

  const buffer = await buildBufferFromVersion(params.versionId);
  const thumb = await sharp(buffer, { failOnError: false })
    .resize(size, size, { fit: "cover" })
    .webp({ quality: 70 })
    .toBuffer();

  await writeThumbnail(params.fileId, params.versionId, size, thumb);
  return true;
}

export async function enqueueThumbnailJob(params: {
  fileId: string;
  versionId: string;
  size?: number;
  mime?: string | null;
}) {
  try {
    const [file] = await db
      .select({ id: files.id, mime: files.mime, isVault: files.isVault, originalName: files.originalName, path: files.path })
      .from(files)
      .where(eq(files.id, params.fileId))
      .limit(1);
    if (!file || file.isVault) return;

    const mime = resolveImageMime(
      params.mime ?? file.mime,
      file.originalName ?? file.path
    );
    if (!mime) return;

    const { thumbnailQueue } = await import("@/server/jobs/queue");
    await thumbnailQueue().add(
      "generate-thumbnail",
      {
        kind: "generate-thumbnail",
        fileId: params.fileId,
        versionId: params.versionId,
        size: clampSize(params.size ?? 64, 16, 64),
        mime
      },
      { removeOnComplete: true, removeOnFail: false }
    );
  } catch (err: any) {
    logError("Failed to enqueue thumbnail job", err, { fileId: params.fileId, versionId: params.versionId });
  }
}
