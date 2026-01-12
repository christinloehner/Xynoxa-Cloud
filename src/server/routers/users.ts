/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { users, groups, groupMembers } from "@/server/db/schema";
import { requireRole } from "@/server/middleware/rbac";
import { hashPassword } from "@/server/services/passwords";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "@/server/services/audit";

export const usersRouter = router({
  list: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .query(async ({ ctx }) => {
      const allUsers = await ctx.db.select({
        id: users.id,
        email: users.email,
        role: users.role,
        disabled: users.disabled
      }).from(users).orderBy(users.email);

      const usersWithGroups = await Promise.all(allUsers.map(async (user) => {
        const userGroups = await ctx.db
          .select({
            id: groups.id,
            name: groups.name,
            membershipId: groupMembers.id
          })
          .from(groupMembers)
          .innerJoin(groups, eq(groups.id, groupMembers.groupId))
          .where(eq(groupMembers.userId, user.id));

        return { ...user, groups: userGroups };
      }));

      return usersWithGroups;
    })
  ,
  create: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(["admin", "user"]).default("user")
      })
    )
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.password);
      const userGroups = await ctx.db
        .select({
          id: groups.id,
          name: groups.name,
          membershipId: groupMembers.id
        });
      const [user] = await ctx.db
        .insert(users)
        .values({ email: input.email, passwordHash, role: input.role })
        .returning({ id: users.id, email: users.email, role: users.role });
      return user;
    }),
  updateRole: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ userId: z.string(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role. Ask another administrator to demote you."
        });
      }
      const updated = await ctx.db
        .update(users)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id, role: users.role });
      return updated[0];
    }),
  toggleDisable: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ userId: z.string(), disabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(users)
        .set({ disabled: input.disabled, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id, disabled: users.disabled });
      return updated[0];
    }),
  delete: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot delete your own account."
        });
      }

      await ctx.db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),
  impersonate: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ id: users.id, role: users.role, sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      ctx.session.impersonatorId = ctx.userId!;
      ctx.session.userId = target.id;
      ctx.session.userRole = target.role;
      ctx.session.sessionVersion = target.sessionVersion ?? 1;
      await ctx.session.save();
      await logAudit(ctx.db, ctx.userId!, "impersonate_start", `target=${target.id}`);
      return { userId: target.id, role: target.role };
    }),
  stopImpersonation: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.session.impersonatorId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Not impersonating" });
    }
    const originalId = ctx.session.impersonatorId;
    const [original] = await ctx.db
      .select({ id: users.id, role: users.role, sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, originalId))
      .limit(1);

    ctx.session.userId = originalId;
    ctx.session.impersonatorId = undefined;
    ctx.session.userRole = original?.role ?? "member";
    ctx.session.sessionVersion = original?.sessionVersion ?? 1;
    await ctx.session.save();
    await logAudit(ctx.db, originalId, "impersonate_stop");
    return { userId: originalId, role: ctx.session.userRole };
  })
});
