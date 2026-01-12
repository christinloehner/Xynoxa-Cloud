/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { groups, groupMembers, users } from "@/server/db/schema";
import { requireRole } from "@/server/middleware/rbac";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

export const groupsRouter = router({
  list: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .query(async ({ ctx }) => {
      const allGroups = await ctx.db
        .select({
          id: groups.id,
          name: groups.name,
          ownerId: groups.ownerId,
          ownerEmail: users.email,
          createdAt: groups.createdAt
        })
        .from(groups)
        .leftJoin(users, eq(groups.ownerId, users.id));
      return allGroups;
    }),

  create: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [group] = await ctx.db
        .insert(groups)
        .values({ name: input.name, ownerId: ctx.userId! })
        .returning();
      return group;
    }),

  delete: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(groups).where(eq(groups.id, input.groupId));
      return { success: true };
    }),

  listMembers: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db
        .select({
          id: groupMembers.id,
          userId: groupMembers.userId,
          email: users.email
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, input.groupId));
      return members;
    }),

  addMember: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(
      z.object({
        groupId: z.string(),
        userId: z.string()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.db
        .insert(groupMembers)
        .values({ groupId: input.groupId, userId: input.userId })
        .returning();
      return member;
    }),

  removeMember: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(groupMembers).where(eq(groupMembers.id, input.memberId));
      return { success: true };
    })
});
