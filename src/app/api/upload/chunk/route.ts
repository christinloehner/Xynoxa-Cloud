/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/auth/api-helper";
import { db } from "@/server/db";
import { uploadSessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { promises as fs } from "fs";
import { resolve, join } from "path";
import { logError, logDebug } from "@/server/services/logger";

const CHUNK_DIR = resolve(process.cwd(), "storage", "chunks");

async function ensureChunkDir() {
  await fs.mkdir(CHUNK_DIR, { recursive: true });
}

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let uploadId: string | undefined;
  
  try {
    userId = await getUserFromRequest(req);
    if (!userId) {
      logError("Upload chunk: Unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    uploadId = form.get("uploadId")?.toString();
    const chunkIndexRaw = form.get("chunkIndex")?.toString();
    const file = form.get("file") as File | null;

    if (!uploadId || !chunkIndexRaw || !file) {
      logError("Upload chunk: Invalid payload", undefined, { userId, uploadId });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
  const chunkIndex = Number(chunkIndexRaw);
    if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
      logError("Upload chunk: Invalid chunk index", undefined, { userId, uploadId, chunkIndex: chunkIndexRaw });
      return NextResponse.json({ error: "Invalid chunk index" }, { status: 400 });
    }

    const [sessionRow] = await db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, uploadId))
      .limit(1);

    if (!sessionRow || sessionRow.userId !== userId) {
      logError("Upload chunk: Session not found", undefined, { userId, uploadId });
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
    }

    await ensureChunkDir();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const chunkPath = join(CHUNK_DIR, `${uploadId}.${chunkIndex}.part`);
    await fs.writeFile(chunkPath, buffer);

    logDebug("Chunk uploaded", { userId, uploadId, chunkIndex, size: buffer.length });

    // Update progress
    // Skipped DB update for uploadedChunks as column does not exist and client tracks progress.

    const progress = Math.round(((chunkIndex + 1) / sessionRow.totalChunks) * 100);

    return NextResponse.json({ ok: true, progress });
  } catch (error: any) {
    logError("Upload chunk failed", error, { userId, uploadId });
    return NextResponse.json({ error: error.message || "Chunk upload failed" }, { status: 500 });
  }
}

