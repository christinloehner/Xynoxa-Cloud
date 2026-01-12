/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "../db";
import { systemSettings } from "../db/schema";
import { eq } from "drizzle-orm";

export async function getSystemSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export async function requireSystemSettings(keys: string[]) {
  const result: Record<string, string> = {};
  for (const k of keys) {
    const v = await getSystemSetting(k);
    if (v) result[k] = v;
  }
  return result;
}
