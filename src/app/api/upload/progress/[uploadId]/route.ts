/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { uploadSessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;
  const session = await getSession();

  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sessionRow] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, uploadId))
    .limit(1);

  if (!sessionRow || sessionRow.userId !== session.userId) {
    return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
  }

  const uploadedChunks = (sessionRow as any).uploadedChunks || 0;
  const progress = Math.round((uploadedChunks / sessionRow.totalChunks) * 100);
  const isComplete = !!sessionRow.completedAt;

  return NextResponse.json({
    uploadId: sessionRow.id,
    filename: sessionRow.filename,
    uploadedChunks,
    totalChunks: sessionRow.totalChunks,
    progress,
    isComplete,
    completedAt: sessionRow.completedAt
  });
}
