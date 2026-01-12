/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { requireRole } from "@/server/middleware/rbac";
import { maintenanceQueue } from "@/server/jobs/queue";

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
    })
});
