/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { exchangeCode, getGoogleConfig, syncGoogleCalendarList } from "@/server/services/google-calendar";
import { db } from "@/server/db";
import { calendarProviderAccounts } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { calendarQueue } from "@/server/jobs/queue";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const origin = process.env.APP_URL || `${url.protocol}//${url.host}`;
  const targetSettings = `${origin}/user/settings`;
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }
  if (!code || !state || state !== session.googleState) {
    return NextResponse.redirect(`${targetSettings}?error=google_oauth_state`);
  }

  try {
    const cfg = await getGoogleConfig();
    const token = await exchangeCode(cfg, code);
    const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);
    const refreshToken = token.refresh_token;
    if (!refreshToken) {
      throw new Error("Kein Refresh Token erhalten (evtl. Consent nicht erteilt).");
    }
    const [existing] = await db.select().from(calendarProviderAccounts).where(eq(calendarProviderAccounts.userId, session.userId)).limit(1);
    if (existing) {
      await db.update(calendarProviderAccounts).set({
        provider: "google",
        accessToken: token.access_token,
        refreshToken,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date()
      }).where(eq(calendarProviderAccounts.userId, session.userId));
    } else {
      await db.insert(calendarProviderAccounts).values({
        userId: session.userId,
        provider: "google",
        calendarId: "primary",
        accessToken: token.access_token,
        refreshToken,
        tokenExpiresAt: expiresAt
      });
    }

    // Kalenderliste initial ziehen & Auswahl vorbelegen
    await syncGoogleCalendarList(db, session.userId);
    // Start initial sync & watch
    await calendarQueue().add("google-sync", { kind: "google-sync", userId: session.userId, reason: "connect" });
    return NextResponse.redirect(`${targetSettings}?connected=google`);
  } catch (err: any) {
    console.error("Google OAuth Callback Error", err);
    return NextResponse.redirect(`${targetSettings}?error=google_oauth`);
  }
}
