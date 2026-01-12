/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { tenants, tenantMembers, users } from "@/server/db/schema";
import { requireRole } from "@/server/middleware/rbac";
import { z } from "zod";
import { eq } from "drizzle-orm";

export const tenantsRouter = router({
  list: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .query(async ({ ctx }) => {
      const all = await ctx.db.select().from(tenants);
      return all;
    }),

  create: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [tenant] = await ctx.db.insert(tenants).values({ name: input.name }).returning();
      // Ensure creator is member
      await ctx.db
        .insert(tenantMembers)
        .values({ tenantId: tenant.id, userId: ctx.userId!, role: "owner" });
      return tenant;
    }),

  members: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: tenantMembers.id,
          userId: tenantMembers.userId,
          email: users.email,
          role: tenantMembers.role
        })
        .from(tenantMembers)
        .leftJoin(users, eq(users.id, tenantMembers.userId))
        .where(eq(tenantMembers.tenantId, input.tenantId));
    }),

  addMember: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(
      z.object({
        tenantId: z.string(),
        userId: z.string(),
        role: z.enum(["owner", "admin", "member", "viewer"]).default("member")
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.db
        .insert(tenantMembers)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          role: input.role
        })
        .returning();
      return member;
    }),

  updateMember: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ memberId: z.string(), role: z.enum(["owner", "admin", "member", "viewer"]) }))
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.db
        .update(tenantMembers)
        .set({ role: input.role })
        .where(eq(tenantMembers.id, input.memberId))
        .returning();
      return member;
    })
});

