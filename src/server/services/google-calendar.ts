/*
 * Copyright (C) 2025 Christin Löhner
 */

import { randomUUID } from "crypto";
import { calendarEvents, calendarGoogleCalendars, calendarProviderAccounts } from "../db/schema";
import { DB } from "../db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getSystemSetting } from "./system-settings";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function assertGoogleConfig(cfg: Partial<GoogleConfig>): GoogleConfig {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error("Google OAuth ist nicht konfiguriert. Bitte in den Admin-Einstellungen Client ID, Secret und Redirect hinterlegen.");
  }
  return cfg as GoogleConfig;
}

export async function getGoogleConfig(): Promise<GoogleConfig> {
  const clientId = (await getSystemSetting("google_client_id")) ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = (await getSystemSetting("google_client_secret")) ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri = (await getSystemSetting("google_oauth_redirect")) ?? process.env.GOOGLE_OAUTH_REDIRECT ?? `${process.env.APP_URL || ""}/api/google/oauth/callback`;
  return assertGoogleConfig({ clientId, clientSecret, redirectUri });
}

function encodeQuery(obj: Record<string, string>) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export function buildGoogleAuthUrl(cfg: GoogleConfig, state: string) {
  const params = {
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state
  };
  return `${GOOGLE_AUTH_BASE}?${encodeQuery(params)}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCode(cfg: GoogleConfig, code: string) {
  const body = {
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code"
  };
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeQuery(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return data;
}

export async function refreshAccessToken(cfg: GoogleConfig, refreshToken: string) {
  const body = {
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token"
  };
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeQuery(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Refresh token failed: ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return data;
}

async function ensureAccessToken(db: DB, cfg: GoogleConfig, userId: string) {
  const [account] = await db.select().from(calendarProviderAccounts).where(eq(calendarProviderAccounts.userId, userId)).limit(1);
  if (!account) throw new Error("Google-Konto nicht verbunden.");

  const now = new Date();
  if (account.accessToken && account.tokenExpiresAt && account.tokenExpiresAt.getTime() > now.getTime() + 60_000) {
    return { account, accessToken: account.accessToken };
  }

  const refreshed = await refreshAccessToken(cfg, account.refreshToken!);
  const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000);
  const [updated] = await db
    .update(calendarProviderAccounts)
    .set({ accessToken: refreshed.access_token, tokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(calendarProviderAccounts.userId, userId))
    .returning();
  return { account: updated, accessToken: refreshed.access_token };
}

// ---- Calendar List Handling ----
type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary?: boolean;
  timeZone?: string;
  backgroundColor?: string;
};

async function listRemoteCalendars(cfg: GoogleConfig, accessToken: string): Promise<GoogleCalendarListEntry[]> {
  let url = `${GOOGLE_API_BASE}/users/me/calendarList`;
  const items: GoogleCalendarListEntry[] = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google calendarList failed: ${text}`);
    }
    const data = await res.json();
    items.push(...(data.items ?? []));
    url = data.nextPageToken ? `${GOOGLE_API_BASE}/users/me/calendarList?pageToken=${data.nextPageToken}` : "";
  }
  return items;
}

export async function syncGoogleCalendarList(db: DB, userId: string) {
  const cfg = await getGoogleConfig();
  const { account, accessToken } = await ensureAccessToken(db, cfg, userId);
  const remote = await listRemoteCalendars(cfg, accessToken);

  const existing = await db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, userId));
  const existingMap = new Map(existing.map((c) => [c.calendarId, c]));

  const toUpsert = remote.map((cal) => {
    const prev = existingMap.get(cal.id);
    return {
      userId,
      calendarId: cal.id,
      summary: cal.summary || cal.id,
      timezone: cal.timeZone ?? prev?.timezone ?? null,
      isPrimary: !!cal.primary,
      isSelected: prev?.isSelected ?? !!cal.primary,
      isDefault: prev?.isDefault ?? !!cal.primary,
      color: prev?.color ?? cal.backgroundColor ?? "#7A4CE0",
      syncToken: prev?.syncToken ?? null,
      channelId: prev?.channelId ?? null,
      resourceId: prev?.resourceId ?? null,
      channelExpiresAt: prev?.channelExpiresAt ?? null,
      updatedAt: new Date()
    };
  });

  if (toUpsert.length > 0) {
    await db
      .insert(calendarGoogleCalendars)
      .values(toUpsert)
      .onConflictDoUpdate({
        target: [calendarGoogleCalendars.userId, calendarGoogleCalendars.calendarId],
        set: {
          summary: sql`excluded.summary`,
          timezone: sql`excluded.timezone`,
          isPrimary: sql`excluded.is_primary`,
          updatedAt: new Date()
        }
      });
  }

  const remoteIds = remote.map((r) => r.id);
  const stale = existing.filter((e) => !remoteIds.includes(e.calendarId));
  if (stale.length) {
    await db.delete(calendarGoogleCalendars).where(
      and(eq(calendarGoogleCalendars.userId, userId), inArray(calendarGoogleCalendars.calendarId, stale.map((s) => s.calendarId)))
    );
  }

  const defaultCal = toUpsert.find((c) => c.isDefault) ?? toUpsert.find((c) => c.isPrimary);
  await db
    .update(calendarProviderAccounts)
    .set({ defaultCalendarId: defaultCal?.calendarId ?? account.defaultCalendarId ?? "primary", updatedAt: new Date() })
    .where(eq(calendarProviderAccounts.userId, userId));

  return db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, userId));
}

// ---- Events Sync ----
type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated?: string;
  etag?: string;
  status?: string;
};

function parseGoogleDate(dateObj?: { dateTime?: string; date?: string }) {
  if (!dateObj) return null;
  if (dateObj.dateTime) return new Date(dateObj.dateTime);
  if (dateObj.date) return new Date(`${dateObj.date}T00:00:00Z`);
  return null;
}

export async function fetchGoogleDeltas(db: DB, userId: string, calendar: { calendarId: string; syncToken: string | null }) {
  const cfg = await getGoogleConfig();
  const { account, accessToken } = await ensureAccessToken(db, cfg, userId);
  const calendarId = calendar.calendarId || account.defaultCalendarId || "primary";

  let url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const params: Record<string, string> = { singleEvents: "true", maxResults: "200", showDeleted: "true" };
  if (calendar.syncToken) {
    params.syncToken = calendar.syncToken;
  } else {
    const now = new Date();
    params.timeMin = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    params.timeMax = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  }
  url += `?${encodeQuery(params)}`;

  const events: GoogleEvent[] = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 410) {
      await db
        .update(calendarGoogleCalendars)
        .set({ syncToken: null })
        .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)));
      return fetchGoogleDeltas(db, userId, { calendarId, syncToken: null });
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Google list failed: ${txt}`);
    }
    const data = await res.json();
    events.push(...(data.items ?? []));
    url = data.nextPageToken ? `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?pageToken=${data.nextPageToken}` : "";
    if (data.nextSyncToken) {
      await db
        .update(calendarGoogleCalendars)
        .set({ syncToken: data.nextSyncToken, updatedAt: new Date() })
        .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)));
      break;
    }
  }
  return events;
}

export async function upsertLocalEvents(db: DB, userId: string, gEvents: GoogleEvent[], calendarId: string) {
  for (const ge of gEvents) {
    if (!ge.id) continue;
    const existing = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.externalId, ge.id), eq(calendarEvents.ownerId, userId), eq(calendarEvents.externalCalendarId, calendarId)))
      .limit(1);
    const startsAt = parseGoogleDate(ge.start);
    const endsAt = parseGoogleDate(ge.end) || startsAt || new Date();
    const updatedAt = ge.updated ? new Date(ge.updated) : new Date();

    if (ge.status === "cancelled") {
      if (existing[0]) {
        await db.delete(calendarEvents).where(eq(calendarEvents.id, existing[0].id));
      }
      continue;
    }

    if (!existing[0]) {
      await db.insert(calendarEvents).values({
        ownerId: userId,
        title: ge.summary || "(Ohne Titel)",
        description: ge.description ?? null,
        location: ge.location ?? null,
        startsAt: startsAt || new Date(),
        endsAt: endsAt,
        recurrence: null,
        source: "google",
        externalId: ge.id,
        externalCalendarId: calendarId,
        externalSource: "google",
        externalUpdatedAt: updatedAt,
        externalEtag: ge.etag ?? null
      });
    } else {
      await db
        .update(calendarEvents)
        .set({
          title: ge.summary || existing[0].title,
          description: ge.description ?? existing[0].description,
          location: ge.location ?? existing[0].location,
          startsAt: startsAt || existing[0].startsAt,
          endsAt: endsAt || existing[0].endsAt,
          externalUpdatedAt: updatedAt,
          externalEtag: ge.etag ?? existing[0].externalEtag,
          externalSource: "google",
          externalCalendarId: calendarId,
          source: "google"
        })
        .where(eq(calendarEvents.id, existing[0].id));
    }
  }
}

// ---- Push (App -> Google) ----
type EventSnapshot = {
  externalId?: string | null;
  externalCalendarId?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

export async function pushEventToGoogle(
  db: DB,
  userId: string,
  eventId: string,
  action: "create" | "update" | "delete",
  snapshot?: EventSnapshot
) {
  const cfg = await getGoogleConfig();
  const { account, accessToken } = await ensureAccessToken(db, cfg, userId);
  const [evt] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)).limit(1);

  const event = evt ?? (snapshot
    ? {
        ...snapshot,
        startsAt: snapshot.startsAt ? new Date(snapshot.startsAt) : undefined,
        endsAt: snapshot.endsAt ? new Date(snapshot.endsAt) : undefined
      }
    : null);
  if (!event) return;

  const calendars = await db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, userId));
  const targetCalendarId =
    event.externalCalendarId ||
    calendars.find((c) => c.isDefault && c.isSelected)?.calendarId ||
    calendars.find((c) => c.isPrimary && c.isSelected)?.calendarId ||
    account.defaultCalendarId ||
    account.calendarId ||
    "primary";

  const body = {
    summary: event.title ?? undefined,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: event.startsAt ? { dateTime: new Date(event.startsAt).toISOString() } : undefined,
    end: event.endsAt ? { dateTime: new Date(event.endsAt).toISOString() } : undefined
  };

  let url = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(targetCalendarId)}/events`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };

  if (action === "create") {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    await db
      .update(calendarEvents)
      .set({
        externalId: data.id,
        externalCalendarId: targetCalendarId,
        externalSource: "google",
        externalUpdatedAt: data.updated ? new Date(data.updated) : new Date(),
        externalEtag: data.etag ?? null
      })
      .where(eq(calendarEvents.id, evt.id));
  } else if (action === "update") {
    if (!event.externalId) {
      return pushEventToGoogle(db, userId, eventId, "create");
    }
    const res = await fetch(`${url}/${encodeURIComponent(event.externalId)}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    await db
      .update(calendarEvents)
      .set({
        externalId: data.id,
        externalCalendarId: targetCalendarId,
        externalSource: "google",
        externalUpdatedAt: data.updated ? new Date(data.updated) : new Date(),
        externalEtag: data.etag ?? null
      })
      .where(eq(calendarEvents.id, evt.id));
  } else if (action === "delete") {
    const targetId = event.externalId;
    if (targetId) {
      await fetch(`${url}/${encodeURIComponent(targetId)}`, { method: "DELETE", headers });
    }
    if (evt) {
      await db
        .update(calendarEvents)
        .set({ externalId: null, externalCalendarId: null, externalSource: null, externalUpdatedAt: null, externalEtag: null })
        .where(eq(calendarEvents.id, evt.id));
    }
  }
}

// ---- Watches ----
export async function startWatch(db: DB, userId: string, calendarId: string) {
  const cfg = await getGoogleConfig();
  const { account, accessToken } = await ensureAccessToken(db, cfg, userId);
  const channelId = randomUUID();
  try {
    const res = await fetch(`${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId || account.calendarId)}/events/watch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: channelId, type: "web_hook", address: `${process.env.APP_URL}/api/google/push`, token: `${userId}:${calendarId}` })
    });
    if (!res.ok) {
      const txt = await res.text();
      const payload = safeJson(txt);
      const notSupported =
        payload?.error?.errors?.some((e: any) => e.reason === "pushNotSupportedForRequestedResource") ||
        txt.includes("pushNotSupportedForRequestedResource");
      if (notSupported) {
        console.warn(`Push watch nicht unterstützt für Calendar ${calendarId}, disable watch.`);
        const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        await db
          .update(calendarGoogleCalendars)
          .set({ channelId: "unsupported", resourceId: null, channelExpiresAt: farFuture, updatedAt: new Date() })
          .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)));
        return;
      }
      throw new Error(`Watch failed: ${txt}`);
    }
    const data = await res.json();
    const expires = data.expiration ? new Date(Number(data.expiration)) : null;
    await db
      .update(calendarGoogleCalendars)
      .set({ channelId, resourceId: data.resourceId, channelExpiresAt: expires ?? null, updatedAt: new Date() })
      .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)));
  } catch (err) {
    if (err instanceof Error && err.message.includes("pushNotSupportedForRequestedResource")) {
      const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await db
        .update(calendarGoogleCalendars)
        .set({ channelId: "unsupported", resourceId: null, channelExpiresAt: farFuture, updatedAt: new Date() })
        .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)));
      return;
    }
    throw err;
  }
}

function safeJson(txt: string) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function stopWatch(db: DB, userId: string, calendarId: string) {
  const [cal] = await db
    .select()
    .from(calendarGoogleCalendars)
    .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)))
    .limit(1);
  if (!cal?.channelId || cal.channelId === "unsupported" || !cal?.resourceId) {
    await db
      .update(calendarGoogleCalendars)
      .set({ channelId: null, resourceId: null, channelExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)));
    return;
  }
  await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: cal.channelId, resourceId: cal.resourceId })
  }).catch(() => {});
  await db
    .update(calendarGoogleCalendars)
    .set({ channelId: null, resourceId: null, channelExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(calendarGoogleCalendars.userId, userId), eq(calendarGoogleCalendars.calendarId, calendarId)));
}
