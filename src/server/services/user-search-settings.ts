/*
 * Copyright (C) 2025 Christin Löhner
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { userProfiles } from "../db/schema";

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();

export async function getSearchAutoReindex(userId: string): Promise<boolean> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [row] = await db
    .select({ searchAutoReindex: userProfiles.searchAutoReindex })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const value = row?.searchAutoReindex ?? true;
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateSearchAutoReindexCache(userId?: string) {
  if (!userId) {
    cache.clear();
    return;
  }
  cache.delete(userId);
}
