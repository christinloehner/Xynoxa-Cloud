/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { calendarGoogleCalendars } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { calendarQueue } from "@/server/jobs/queue";

export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const resourceId = req.headers.get("x-goog-resource-id");
  if (!channelId || !resourceId) {
    return new NextResponse("missing headers", { status: 400 });
  }

  const [cal] = await db
    .select()
    .from(calendarGoogleCalendars)
    .where(eq(calendarGoogleCalendars.channelId, channelId))
    .limit(1);

  if (!cal || cal.resourceId !== resourceId) {
    return new NextResponse("not found", { status: 404 });
  }

  await calendarQueue().add("google-sync", { kind: "google-sync", userId: cal.userId, reason: "push" });
  return new NextResponse("ok");
}
