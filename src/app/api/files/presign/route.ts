/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";

const DOWNLOAD_SECRET = process.env.DOWNLOAD_JWT_SECRET || "dev-download-secret-change-me";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { fileId } = body || {};
  if (!fileId) return NextResponse.json({ error: "fileId missing" }, { status: 400 });

  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file || file.ownerId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 10; // 10 min
  const token = await new SignJWT({ fileId, userId: session.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(DOWNLOAD_SECRET));

  return NextResponse.json({
    url: `${process.env.APP_URL || ""}/api/files/signed?token=${token}`,
    expiresAt: exp * 1000
  });
}

