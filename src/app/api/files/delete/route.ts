/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { eq } from "drizzle-orm";

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
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { fileId, restore } = body || {};
  if (!fileId) return NextResponse.json({ error: "fileId missing" }, { status: 400 });

  const [current] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!current) return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  if (current.ownerId && current.ownerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!current.ownerId && current.groupFolderId) {
    const hasAccess = await checkGroupFolderAccess(db, session.userId, current.groupFolderId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const [row] = await db
    .update(files)
    .set({ isDeleted: !restore, updatedAt: new Date() })
    .where(eq(files.id, fileId))
    .returning();

  return NextResponse.json({ file: row });
}
