/*
 * Copyright (C) 2025 Christin Löhner
 */

import { auditLogs } from "../db/schema";
import type { DB } from "../db";

export async function logAudit(db: DB, userId: string | null, action: string, details?: string) {
  try {
    await db.insert(auditLogs).values({ userId, action, details });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}
