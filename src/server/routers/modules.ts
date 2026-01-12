/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Modules Router
 * 
 * tRPC Router für Module-Verwaltung im Admin-Bereich
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { modules } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/server/middleware/rbac";
import { ModuleService } from "@/server/services/module-service";
import { TRPCError } from "@trpc/server";

export const modulesRouter = router({
  /**
   * Listet alle Module auf (Admin only)
   */
  list: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .query(async ({ ctx }) => {
      try {
        const modules = await ModuleService.getAllModules();
        
        // Fallback: Wenn keine Module registriert sind, führe Discovery durch
        if (modules.length === 0) {
          console.warn("[modulesRouter] No modules found, running discovery...");
          await ModuleService.discoverAndRegisterModules();
          return await ModuleService.getAllModules();
        }
        
        return modules;
      } catch (error) {
        console.error("[modulesRouter] Failed to list modules:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list modules"
        });
      }
    }),

  /**
   * Gibt nur die IDs der aktiven Module zurück (für Module-Loader)
   */
  getActive: protectedProcedure
    .query(async () => {
      try {
        return await ModuleService.getActiveModules();
      } catch (error) {
        console.error("[modulesRouter] Failed to get active modules:", error);
        return [];
      }
    }),

  /**
   * Aktiviert ein Modul (führt Installation aus)
   */
  activate: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(
      z.object({
        moduleId: z.string()
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await ModuleService.activateModule(input.moduleId);
        
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Module activation failed"
          });
        }

        // Trigger Module Discovery um Status zu aktualisieren
        await ModuleService.discoverAndRegisterModules();

        return { success: true, message: "Module activated successfully" };
      } catch (error: any) {
        console.error("[modulesRouter] Failed to activate module:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to activate module"
        });
      }
    }),

  /**
   * Deaktiviert ein Modul
   */
  deactivate: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(
      z.object({
        moduleId: z.string()
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await ModuleService.deactivateModule(input.moduleId);
        
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Module deactivation failed"
          });
        }

        return { success: true, message: "Module deactivated successfully" };
      } catch (error: any) {
        console.error("[modulesRouter] Failed to deactivate module:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to deactivate module"
        });
      }
    }),

  /**
   * Scannt nach neuen Modulen und registriert sie
   */
  discoverModules: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .mutation(async () => {
      try {
        await ModuleService.discoverAndRegisterModules();
        return { 
          success: true, 
          message: "Module discovery completed. Check the list for new modules." 
        };
      } catch (error: any) {
        console.error("[modulesRouter] Module discovery failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Module discovery failed"
        });
      }
    })
});
