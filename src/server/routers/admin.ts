/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { systemSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/server/middleware/rbac";
import { logAudit } from "@/server/services/audit";

export const adminRouter = router({
    getSettings: protectedProcedure
        .use(requireRole(["owner", "admin"]))
        .query(async ({ ctx }) => {
            const startTime = Date.now();
            const settings = await ctx.db.select().from(systemSettings);
            const duration = Date.now() - startTime;
            
            const result = settings.reduce((acc, curr) => {
                try {
                    acc[curr.key] = JSON.parse(curr.value);
                } catch {
                    acc[curr.key] = curr.value;
                }
                return acc;
            }, {} as Record<string, any>);
            result["app_url"] = process.env.APP_URL ?? null;
            
            // Log timing info without using console.time() to avoid label conflicts in concurrent requests
            if (duration > 100) {
                console.warn(`[admin.getSettings] Query took ${duration}ms`);
            }
            
            return result;
        }),

    updateSetting: protectedProcedure
        .use(requireRole(["owner", "admin"]))
        .input(
            z.object({
                key: z.string(),
                value: z.any(),
                description: z.string().optional()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const stringifiedValue = JSON.stringify(input.value);

            await ctx.db
                .insert(systemSettings)
                .values({
                    key: input.key,
                    value: stringifiedValue,
                    description: input.description,
                    updatedAt: new Date()
                })
                .onConflictDoUpdate({
                    target: systemSettings.key,
                    set: {
                        value: stringifiedValue,
                        description: input.description,
                        updatedAt: new Date()
                    }
                });

            await logAudit(
                ctx.db,
                ctx.userId!,
                "system_setting_update",
                `key=${input.key};value=${stringifiedValue}`
            );

            return { success: true };
        })
});
