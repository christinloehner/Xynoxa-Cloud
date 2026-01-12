/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { readFileFromStorage } from "@/server/services/storage";
import { getLatestVersion, buildBufferFromVersion } from "@/server/services/file-versioning";

const DOWNLOAD_SECRET = process.env.DOWNLOAD_JWT_SECRET || "dev-download-secret-change-me";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token missing" }, { status: 400 });
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(DOWNLOAD_SECRET));
    const fileId = payload.fileId as string;
    const userId = payload.userId as string;
    if (!fileId || !userId) throw new Error("Invalid token");

    const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let buffer: Buffer;
    if (file.isVault) {
      buffer = await readFileFromStorage(file.storagePath || "");
    } else {
      const latest = await getLatestVersion(file.id);
      if (!latest) return NextResponse.json({ error: "Keine Version gefunden" }, { status: 404 });
      buffer = await buildBufferFromVersion(latest.id);
    }
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": file.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.originalName || file.path)}"`
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}
