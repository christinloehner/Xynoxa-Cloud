/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { apiTokens } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { requireRole } from "@/server/middleware/rbac";

export const apiTokensRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        const tokens = await ctx.db
            .select({
                id: apiTokens.id,
                name: apiTokens.name,
                lastUsedAt: apiTokens.lastUsedAt,
                createdAt: apiTokens.createdAt
            })
            .from(apiTokens)
            .where(eq(apiTokens.ownerId, ctx.userId!));
        return tokens;
    }),

    create: protectedProcedure
        .input(z.object({ name: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            // Generate secure token with prefix
            const randomPart = randomBytes(32).toString("hex");
            const token = `xyn-${randomPart}`;

            // Hash everything for storage
            const tokenHash = createHash("sha256").update(token).digest("hex");

            const [record] = await ctx.db
                .insert(apiTokens)
                .values({
                    ownerId: ctx.userId!,
                    name: input.name,
                    tokenHash
                })
                .returning({ id: apiTokens.id });

            return {
                id: record.id,
                token: token // Only returned once!
            };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(apiTokens)
                .where(
                    and(
                        eq(apiTokens.id, input.id),
                        eq(apiTokens.ownerId, ctx.userId!)
                    )
                );
            return { success: true };
        })
});
