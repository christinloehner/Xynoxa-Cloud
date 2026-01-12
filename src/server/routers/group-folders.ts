/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { groupFolders, groupFolderAccess, groups } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "@/server/middleware/rbac";
import { TRPCError } from "@trpc/server";
import { recordChange } from "@/server/services/sync-journal";

export const groupFoldersRouter = router({
    list: protectedProcedure
        .use(requireRole(["owner", "admin"]))
        .query(async ({ ctx }) => {
            const allFolders = await ctx.db.select().from(groupFolders).orderBy(groupFolders.name);

            const foldersWithAccess = await Promise.all(allFolders.map(async (folder) => {
                const access = await ctx.db
                    .select({
                        groupId: groups.id,
                        groupName: groups.name,
                        accessId: groupFolderAccess.id
                    })
                    .from(groupFolderAccess)
                    .innerJoin(groups, eq(groups.id, groupFolderAccess.groupId))
                    .where(eq(groupFolderAccess.groupFolderId, folder.id));

                return { ...folder, groups: access };
            }));

            return foldersWithAccess;
        }),

    create: protectedProcedure
        .use(requireRole(["owner", "admin"]))
        .input(z.object({ name: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const [folder] = await ctx.db.insert(groupFolders).values({ name: input.name }).returning();
            // Generate sync event for all users who will have access
            await recordChange(ctx.db, null, "group_folder", folder.id, "create");
            return folder;
        }),

    delete: protectedProcedure
        .use(requireRole(["owner", "admin"]))
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Generate delete sync event before deletion
            await recordChange(ctx.db, null, "group_folder", input.id, "delete");
            await ctx.db.delete(groupFolders).where(eq(groupFolders.id, input.id));
            return { success: true };
        }),

    addGroup: protectedProcedure
        .use(requireRole(["owner", "admin"]))
        .input(z.object({ folderId: z.string(), groupId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.insert(groupFolderAccess).values({
                groupFolderId: input.folderId,
                groupId: input.groupId
            });
            // Generate sync event so new group members see the folder
            await recordChange(ctx.db, null, "group_folder", input.folderId, "create");
            return { success: true };
        }),

    removeGroup: protectedProcedure
        .use(requireRole(["owner", "admin"]))
        .input(z.object({ accessId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(groupFolderAccess).where(eq(groupFolderAccess.id, input.accessId));
            return { success: true };
        })
});
