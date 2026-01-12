/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { requireRole } from "@/server/middleware/rbac";
import { maintenanceQueue } from "@/server/jobs/queue";
import { folders, files } from "@/server/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { resolveFolderPath } from "@/server/services/folder-paths";
import { deletePath } from "@/server/services/storage";
import { deleteDocument, INDEXES } from "@/server/services/search";
import { recordChange } from "@/server/services/sync-journal";

export const maintenanceRouter = router({
  startOrphanRepair: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .mutation(async () => {
      const job = await maintenanceQueue().add("orphan-repair", { kind: "orphan-repair" });
      return { jobId: job.id as string };
    }),

  startFullReset: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({
      confirm: z.string()
    }))
    .mutation(async ({ input }) => {
      if (input.confirm !== "DELETE ALL FILES") {
        throw new Error('Bitte gib exakt "DELETE ALL FILES" ein, um den Reset zu bestätigen.');
      }
      const job = await maintenanceQueue().add("full-reset", { kind: "full-reset" });
      return { jobId: job.id as string };
    }),

  status: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await maintenanceQueue().getJob(input.jobId);
      if (!job) return { status: "unknown", progress: 0 };
      const state = await job.getState();
      return {
        status: state,
        progress: typeof job.progress === "number" ? job.progress : 0,
        failedReason: job.failedReason
      };
    }),

  findFoldersByName: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ name: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const name = input.name.trim();
      const rows = await ctx.db
        .select({
          id: folders.id,
          name: folders.name,
          parentId: folders.parentId
        })
        .from(folders)
        .where(and(eq(folders.ownerId, ctx.userId!), eq(folders.name, name)));

      const result = [];
      for (const row of rows) {
        const parentPath = await resolveFolderPath(ctx.userId!, row.parentId);
        const fullPath = parentPath ? `${parentPath}/${row.name}` : row.name;
        result.push({
          id: row.id,
          name: row.name,
          path: fullPath
        });
      }

      return { items: result };
    }),

  forceDeleteFolder: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ id: z.string().uuid(), confirm: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.confirm !== "DELETE FOLDER") {
        throw new Error('Bitte gib exakt "DELETE FOLDER" ein, um fortzufahren.');
      }

      const [current] = await ctx.db.select().from(folders).where(eq(folders.id, input.id));
      if (!current) throw new Error("Ordner nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Zugriff verweigert");
      }
      if (!current.ownerId && current.groupFolderId) {
        throw new Error("Gruppenordner können hier nicht gelöscht werden.");
      }

      const parentPath = await resolveFolderPath(ctx.userId!, current.parentId);
      const relativePath = parentPath ? `${parentPath}/${current.name}` : current.name;

      const descendantsQuery = sql`
        WITH RECURSIVE subfolders AS (
          SELECT id FROM folders WHERE id = ${input.id}
          UNION
          SELECT f.id FROM folders f
          INNER JOIN subfolders s ON f.parent_id = s.id
        )
        SELECT id FROM subfolders;
      `;
      const descendantsResult = await ctx.db.execute(descendantsQuery);
      const allFolderIds = descendantsResult.rows.map((r: any) => r.id);

      const filesInFolders = await ctx.db
        .select({ id: files.id })
        .from(files)
        .where(and(
          inArray(files.folderId, allFolderIds),
          eq(files.ownerId, ctx.userId!)
        ));
      const allFileIds = filesInFolders.map((f) => f.id);

      try {
        await deletePath(ctx.userId!, relativePath);
      } catch (e) {
        console.error("Force delete storage path failed.", e);
      }

      await ctx.db.delete(folders).where(inArray(folders.id, allFolderIds));

      await recordChange(ctx.db, current.ownerId, "folder", input.id, "delete");
      for (const fid of allFileIds) {
        await deleteDocument(INDEXES.FILES, fid, current.ownerId);
        await recordChange(ctx.db, current.ownerId, "file", fid, "delete");
      }
      const subFolderIds = allFolderIds.filter((id: string) => id !== input.id);
      for (const sfid of subFolderIds) {
        await deleteDocument(INDEXES.FOLDERS, sfid, current.ownerId);
        await recordChange(ctx.db, current.ownerId, "folder", sfid, "delete");
      }

      return { success: true };
    })
});
