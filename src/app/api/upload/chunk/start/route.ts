/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { uploadSessions } from "@/server/db/schema";
import { randomUUID } from "crypto";

import { getUserFromRequest } from "@/server/auth/api-helper";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

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

  const body = await req.json().catch(() => null);
  const { filename, totalChunks, size, mime, vault, iv, originalName, fileId } = body || {};

  if (!filename || !totalChunks || totalChunks < 1) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const sizeNum = typeof size === "number" ? size : Number(size || 0);
  if (sizeNum > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large", maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }

  if (fileId) {
    // Verify existence/ownership
    const { files } = await import("@/server/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const [found] = await db
      .select({ id: files.id, ownerId: files.ownerId, groupFolderId: files.groupFolderId })
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
  }

  if (vault && (!iv || iv.length < 16)) {
    return NextResponse.json({ error: "IV required for vault upload" }, { status: 400 });
  }

  const id = randomUUID();
  await db.insert(uploadSessions).values({
    id,
    userId,
    filename,
    originalName: originalName ?? filename,
    mime,
    size,
    totalChunks,
    isVault: !!vault,
    iv: iv ?? null,
    fileId: fileId ?? null
  });

  return NextResponse.json({ uploadId: id });
}
