/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "../db";
import { upsertLocalEvents, fetchGoogleDeltas, pushEventToGoogle, startWatch } from "./google-calendar";
import { calendarGoogleCalendars } from "../db/schema";
import { and, eq } from "drizzle-orm";

export async function handleGoogleSyncJob(userId: string, reason?: string) {
  console.warn(`Google Sync für ${userId} (Reason: ${reason ?? "unspecified"})`);
  const calendars = await db
    .select()
    .from(calendarGoogleCalendars)
    .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.isSelected, true)));

  for (const cal of calendars) {
    const deltas = await fetchGoogleDeltas(db, userId, { calendarId: cal.calendarId, syncToken: cal.syncToken });
    await upsertLocalEvents(db, userId, deltas, cal.calendarId);
  }
  await ensureWatchFresh(userId);
}

async function ensureWatchFresh(userId: string) {
  const cals = await db
    .select()
    .from(calendarGoogleCalendars)
    .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.isSelected, true)));
  const now = new Date();
  for (const cal of cals) {
    if (cal.channelId === "unsupported") {
      continue; // Google erlaubt Push nicht für diesen Kalender
    }
    const expiresSoon = cal.channelExpiresAt && cal.channelExpiresAt.getTime() - now.getTime() < 24 * 60 * 60 * 1000;
    if (!cal.channelId || !cal.resourceId || !cal.channelExpiresAt || expiresSoon) {
      await startWatch(db, userId, cal.calendarId);
    }
  }
}

export async function handleGooglePushJob(
  userId: string,
  eventId: string,
  action: "create" | "update" | "delete",
  snapshot?: {
    externalId?: string | null;
    externalCalendarId?: string | null;
    title?: string | null;
    description?: string | null;
    location?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
  }
) {
  await pushEventToGoogle(db, userId, eventId, action, snapshot);
}
