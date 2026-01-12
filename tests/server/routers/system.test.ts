/*
 * Copyright (C) 2025 Christin Löhner
 */

// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { db } from "@/server/db";
import { users, systemSettings } from "@/server/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

describe("System Router", () => {
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await db.execute(sql`select 1`);
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  it("returns stored date/time formats", async () => {
    if (!dbAvailable) return;
    const userId = randomUUID();
    const email = `system-test-${Date.now()}@xynoxa.test`;

    const emailVerifiedColumn = await db.execute(sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name = 'email_verified'
      LIMIT 1
    `);
    const userValues: any = {
      id: userId,
      email,
      passwordHash: "test-hash",
      role: "admin",
      disabled: false
    };
    if (emailVerifiedColumn.rows?.length) userValues.emailVerified = true;

    await db.insert(users).values(userValues);

    const caller = appRouter.createCaller({
      db,
      userId,
      session: { userId, userRole: "admin" } as any
    });

    try {
      await db
        .insert(systemSettings)
        .values([
          { key: "date_format", value: JSON.stringify("yyyy-MM-dd") },
          { key: "time_format", value: JSON.stringify("HH:mm:ss") }
        ])
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: sql`EXCLUDED.value` }
        });

      const result = await caller.system.getFormatSettings();
      expect(result.dateFormat).toBe("yyyy-MM-dd");
      expect(result.timeFormat).toBe("HH:mm:ss");
    } finally {
      await db.delete(systemSettings).where(inArray(systemSettings.key, ["date_format", "time_format"]));
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
