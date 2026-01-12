/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { files, folders, groupFolderAccess, groupMembers } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { getLatestVersion, buildBufferFromVersion } from "@/server/services/file-versioning";

const SUPPORTED = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "image/tif",
  "application/pdf",
  "video/mp4",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json"
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
  tiff: "image/tiff",
  pdf: "application/pdf",
  mp4: "video/mp4",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json"
};

function resolveMime(fileMime?: string | null, name?: string | null) {
  if (fileMime && SUPPORTED.includes(fileMime)) return fileMime;
  const ext = name?.split(".").pop()?.toLowerCase();
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "fileId missing" }, { status: 400 });

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
      const [parent] = await db.select({ groupFolderId: folders.groupFolderId })
        .from(folders)
        .where(eq(folders.id, file.folderId))
        .limit(1);
      if (parent?.groupFolderId) {
        effectiveGroupFolderId = parent.groupFolderId;
      }
    }

    if (effectiveGroupFolderId) {
      const [access] = await db.select({ id: groupFolderAccess.id })
        .from(groupFolderAccess)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
        .where(and(
          eq(groupFolderAccess.groupFolderId, effectiveGroupFolderId),
          eq(groupMembers.userId, session.userId)
        ))
        .limit(1);
      if (access) hasAccess = true;
    }
  }

  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (file.isVault) {
    return NextResponse.json({ error: "Vault file cannot be previewed" }, { status: 403 });
  }

  const mime = resolveMime(file.mime, file.originalName || file.path);

  if (!mime) {
    return NextResponse.json({ error: "Preview not available" }, { status: 415 });
  }

  try {
    const latest = await getLatestVersion(file.id);
    if (!latest) {
      return NextResponse.json({ error: "Keine Version gefunden" }, { status: 404 });
    }
    const buffer = await buildBufferFromVersion(latest.id);
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return NextResponse.json({ error: "File content missing" }, { status: 404 });
    }
    console.error("Preview failed", err);
    return NextResponse.json({ error: "Preview error" }, { status: 500 });
  }
}
