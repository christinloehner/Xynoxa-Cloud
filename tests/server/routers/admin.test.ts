/*
 * Copyright (C) 2025 Christin Löhner
 */

// @vitest-environment node
import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { db } from "@/server/db";
import { auditLogs, systemSettings, users } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

describe("Admin Router", () => {
  it("updates a setting and returns it via getSettings", async () => {
    const userId = randomUUID();
    const email = `admin-test-${Date.now()}@xynoxa.test`;
    const settingKey = `test_setting_${Date.now()}`;

    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: "test-hash",
      role: "admin",
      emailVerified: true,
      disabled: false
    });

    const caller = appRouter.createCaller({
      db,
      userId,
      session: { userId, userRole: "admin" } as any
    });

    try {
      await caller.admin.updateSetting({
        key: settingKey,
        value: { enabled: true, label: "Test Value" },
        description: "Test setting from admin router test"
      });

      const result = await caller.admin.getSettings();
      expect(result[settingKey]).toEqual({ enabled: true, label: "Test Value" });
    } finally {
      await db.delete(systemSettings).where(eq(systemSettings.key, settingKey));
      await db
        .delete(auditLogs)
        .where(and(eq(auditLogs.userId, userId), eq(auditLogs.action, "system_setting_update")));
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
