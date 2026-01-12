/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { userProfiles } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { readFileFromStorage } from "@/server/services/storage";
import { getUserFromRequest } from "@/server/auth/api-helper";

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile || (!profile.publicProfile && !(await isOwner(req, userId)))) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!profile.avatarStoragePath) {
    return NextResponse.redirect("/images/avatar-default.svg");
  }

  try {
    const file = await readFileFromStorage(profile.avatarStoragePath);
    const body = new Uint8Array(file);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": profile.avatarMime || "image/png",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=600"
      }
    });
  } catch (e) {
    console.error("Avatar fetch failed", e);
    return new NextResponse("Not found", { status: 404 });
  }
}

async function isOwner(req: NextRequest, userId: string) {
  const requester = await getUserFromRequest(req);
  return requester === userId;
}
