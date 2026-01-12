/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { files, folders, groupFolderAccess, groupMembers } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { getLatestVersion } from "@/server/services/file-versioning";
import { readThumbnail } from "@/server/services/storage";
import { generateThumbnailForVersion } from "@/server/services/thumbnails";

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

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "fileId missing" }, { status: 400 });

  const sizeParam = Number(req.nextUrl.searchParams.get("size") || 64);
  const size = clampSize(Number.isFinite(sizeParam) ? sizeParam : 64, 16, 64);

  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Access Check
  let hasAccess = false;
  if (file.ownerId === session.userId) {
    hasAccess = true;
  } else if (!file.ownerId) {
    // Group file - check access
    let effectiveGroupFolderId = file.groupFolderId;

    // If not set on file, check parent folder
    if (!effectiveGroupFolderId && file.folderId) {
      const [parent] = await db
        .select({ groupFolderId: folders.groupFolderId })
        .from(folders)
        .where(eq(folders.id, file.folderId))
        .limit(1);
      if (parent?.groupFolderId) {
        effectiveGroupFolderId = parent.groupFolderId;
      }
    }

    if (effectiveGroupFolderId) {
      const [access] = await db
        .select({ id: groupFolderAccess.id })
        .from(groupFolderAccess)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
        .where(
          and(
            eq(groupFolderAccess.groupFolderId, effectiveGroupFolderId),
            eq(groupMembers.userId, session.userId)
          )
        )
        .limit(1);
      if (access) hasAccess = true;
    }
  }

  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (file.isVault) {
    return NextResponse.json({ error: "Vault file cannot be previewed" }, { status: 403 });
  }

  const mime = resolveImageMime(file.mime, file.originalName || file.path);
  if (!mime) return NextResponse.json({ error: "Thumbnail not available" }, { status: 415 });

  try {
    const latest = await getLatestVersion(file.id);
    if (!latest) {
      return NextResponse.json({ error: "Keine Version gefunden" }, { status: 404 });
    }
    const cached = await readThumbnail(file.id, latest.id, size);
    if (cached) {
      return new NextResponse(new Uint8Array(cached), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    const ok = await generateThumbnailForVersion({
      fileId: file.id,
      versionId: latest.id,
      size,
      mime
    });
    if (!ok) {
      return NextResponse.json({ error: "Thumbnail not available" }, { status: 415 });
    }
    const generated = await readThumbnail(file.id, latest.id, size);
    if (!generated) {
      return NextResponse.json({ error: "Thumbnail not available" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(generated), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return NextResponse.json({ error: "File content missing" }, { status: 404 });
    }
    console.error("Thumbnail failed", err);
    return NextResponse.json({ error: "Thumbnail error" }, { status: 500 });
  }
}
