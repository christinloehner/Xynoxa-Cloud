/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Module Template - tRPC Router
 */

import "server-only";

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { moduleTemplateItems } from "./schema";
import type { ModuleEntityType } from "@/server/module-router-registry";

export const entityTypes: Omit<ModuleEntityType, "moduleId">[] = [
  {
    name: "module-item",
    tableName: "mod_module_template",
    idColumn: "id",
    ownerIdColumn: "owner_id",
    shareFkColumn: "moduleTemplateId",
    embeddingFkColumn: "module_template_id",
    entityTagFkColumn: "moduleTemplateId",
    searchIndexName: "module_template",
    displayName: "Module Item",
    hasVaultField: false,
    shareable: true
  }
];

export default router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      return ctx.db
        .select()
        .from(moduleTemplateItems)
        .where(eq(moduleTemplateItems.ownerId, ctx.userId!))
        .orderBy(desc(moduleTemplateItems.createdAt))
        .limit(limit);
    }),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(255), content: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(moduleTemplateItems)
        .values({
          ownerId: ctx.userId!,
          title: input.title.trim(),
          content: input.content ?? null,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), title: z.string().min(1).max(255).optional(), content: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(moduleTemplateItems)
        .set({
          title: input.title?.trim(),
          content: input.content ?? null,
          updatedAt: new Date()
        })
        .where(eq(moduleTemplateItems.id, input.id))
        .returning();
      return row ?? null;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(moduleTemplateItems).where(eq(moduleTemplateItems.id, input.id));
      return { ok: true };
    })
});
