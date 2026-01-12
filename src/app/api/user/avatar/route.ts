/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/auth/api-helper";
import { saveFile } from "@/server/services/storage";
import { db } from "@/server/db";
import { userProfiles } from "@/server/db/schema";
import { eq } from "drizzle-orm";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Kein Datei-Upload gefunden." }, { status: 400 });
  }

  const fileObj = file as File;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength > MAX_SIZE) {
    return NextResponse.json({ error: "Datei zu groß (max 5MB)." }, { status: 413 });
  }

  const mime = fileObj.type || "application/octet-stream";
  const ext = mime.split("/")[1] || "bin";
  const filename = `${userId}-${Date.now()}.${ext}`;

  const { storagePath } = await saveFile(buffer, "avatars", filename);

  const updated = await db
    .update(userProfiles)
    .set({
      avatarStoragePath: storagePath,
      avatarMime: mime,
      avatarUrl: null // bevorzugt gespeicherte Version
    })
    .where(eq(userProfiles.userId, userId))
    .returning({ avatarStoragePath: userProfiles.avatarStoragePath });

  if (updated.length === 0) {
    await db.insert(userProfiles).values({
      userId,
      avatarStoragePath: storagePath,
      avatarMime: mime
    });
  }

  return NextResponse.json({
    ok: true,
    storagePath,
    url: `/api/avatar/${userId}`
  });
}
