/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Module API Router
 * 
 * Zentraler tRPC Router für alle Modul-Endpunkte.
 * Ermöglicht es Modulen, ihre eigenen Prozeduren dynamisch zu registrieren
 * ohne den Core-Router zu modifizieren.
 * 
 * Usage:
 * - Module registrieren ihre Prozeduren über moduleRouterRegistry
 * - Client ruft auf: trpc.moduleApi.invokeQuery/useQuery oder trpc.moduleApi.invoke/useMutation
 */

import { router, protectedProcedure, publicProcedure, createCallerFactory } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { moduleRouterRegistry } from "@/server/module-router-registry";
import { logDebug, logError, logWarn } from "@/server/services/logger";

/**
 * Generic Module API Router
 * Leitet Anfragen an Modul-Router weiter
 */
export const moduleApiRouter = router({
  /**
   * Generischer Invoke für Query-Prozeduren
   * Für dynamische/untypisierte Aufrufe
   */
  invokeQuery: protectedProcedure
    .input(z.object({
      moduleId: z.string(),
      procedure: z.string(),
      input: z.any().optional()
    }))
    .query(async ({ ctx, input }) => {
      const registration = moduleRouterRegistry.get(input.moduleId);

      if (!registration) {
        logWarn("[ModuleApi] Router not found", { moduleId: input.moduleId, procedure: input.procedure, userId: ctx.userId });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Module router "${input.moduleId}" not found or module not active`
        });
      }

      const createCaller = createCallerFactory(registration.router);
      const caller = createCaller(ctx);
      const procedure = (caller as any)[input.procedure];

      if (!procedure || typeof procedure !== "function") {
        logWarn("[ModuleApi] Procedure not found", { moduleId: input.moduleId, procedure: input.procedure, userId: ctx.userId });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Procedure "${input.procedure}" not found in module "${input.moduleId}"`
        });
      }

      try {
        logDebug("[ModuleApi] invokeQuery", { moduleId: input.moduleId, procedure: input.procedure, userId: ctx.userId });
        return await procedure(input.input);
      } catch (error: any) {
        logError("[ModuleApi] invokeQuery failed", error, {
          moduleId: input.moduleId,
          procedure: input.procedure,
          userId: ctx.userId
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Module procedure failed",
          cause: error
        });
      }
    }),

  /**
   * Generischer Invoke zu einem Modul
   * Für dynamische/untypisierte Aufrufe
   * 
   * HINWEIS: "call" ist ein reserviertes Wort in tRPC, daher "invoke"
   */
  invoke: protectedProcedure
    .input(z.object({
      moduleId: z.string(),
      procedure: z.string(),
      input: z.any().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const registration = moduleRouterRegistry.get(input.moduleId);
      
      if (!registration) {
        logWarn("[ModuleApi] Router not found", { moduleId: input.moduleId, procedure: input.procedure, userId: ctx.userId });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Module router "${input.moduleId}" not found or module not active`
        });
      }

      // Da tRPC Router zur Compile-Zeit statisch sind, 
      // müssen wir die Prozedur manuell aufrufen
      const createCaller = createCallerFactory(registration.router);
      const caller = createCaller(ctx);
      const procedure = (caller as any)[input.procedure];
      
      if (!procedure || typeof procedure !== "function") {
        logWarn("[ModuleApi] Procedure not found", { moduleId: input.moduleId, procedure: input.procedure, userId: ctx.userId });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Procedure "${input.procedure}" not found in module "${input.moduleId}"`
        });
      }

      // Rufe die Prozedur mit dem Context auf
      try {
        logDebug("[ModuleApi] invoke", { moduleId: input.moduleId, procedure: input.procedure, userId: ctx.userId });
        return await procedure(input.input);
      } catch (error: any) {
        logError("[ModuleApi] invoke failed", error, {
          moduleId: input.moduleId,
          procedure: input.procedure,
          userId: ctx.userId
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Module procedure failed",
          cause: error
        });
      }
    }),

  /**
   * Liste alle verfügbaren Modul-Router
   */
  listRouters: protectedProcedure.query(async () => {
    const routers = moduleRouterRegistry.getAll();
    return routers.map(r => ({
      routerId: r.routerId,
      moduleId: r.moduleId
    }));
  }),

  /**
   * Liste alle registrierten Entity-Typen
   */
  listEntityTypes: publicProcedure.query(async () => {
    const types = moduleRouterRegistry.getAllEntityTypes();
    return types.map(t => ({
      type: t.name, // Entity-Typ Name
      moduleId: t.moduleId,
      displayName: t.displayName,
      shareable: t.shareable ?? true
    }));
  }),

  /**
   * Prüfe ob ein Modul-Router verfügbar ist
   */
  hasRouter: publicProcedure
    .input(z.object({ moduleId: z.string() }))
    .query(async ({ input }) => {
      return moduleRouterRegistry.has(input.moduleId);
    })
});
