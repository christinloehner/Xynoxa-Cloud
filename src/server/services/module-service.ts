/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Module Service
 * 
 * Server-seitiger Service für Module-Verwaltung
 * - Auto-Discovery von Modulen aus /modules Verzeichnis
 * - Registrierung in Datenbank
 * - Installation/Deinstallation von Modulen
 */

import { db } from "../db";
import { modules } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import type { XynoxaModule } from "@/types/module";
import { discoverModulesRuntime, loadModuleRuntime, invalidateModuleCache } from "./module-discovery";

/**
 * Module werden zur Laufzeit aus dem Dateisystem gescannt
 * Kein Server-Neustart nötig - echtes Plug & Play!
 */

export class ModuleService {
  /**
   * Scannt alle Module zur Laufzeit und registriert sie in der Datenbank
   * Echtes Plug & Play - kein Server-Neustart nötig!
   */
  static async discoverAndRegisterModules(): Promise<void> {
    console.log("[ModuleService] Discovering modules from filesystem...");
    
    // Invalidiere Cache um sicherzustellen dass wir die neuesten Module finden
    invalidateModuleCache();
    
    // Scanne Dateisystem nach Modulen
    const discoveredModules = discoverModulesRuntime(true);
    
    console.log(`[ModuleService] Found ${discoveredModules.length} modules in filesystem`);
    
    // Lade und registriere jedes gefundene Modul
    for (const discovered of discoveredModules) {
      try {
        // Dynamischer Import zur Laufzeit
        const module = await loadModuleRuntime(discovered.name);
        
        if (!module || !module.metadata) {
          console.error(`[ModuleService] Invalid module: ${discovered.name}`);
          continue;
        }

        await this.registerModuleInDb(module);
      } catch (error) {
        console.error(`[ModuleService] Failed to load module ${discovered.name}:`, error);
      }
    }
    
    console.log("[ModuleService] Module discovery completed");
  }

  /**
   * Registriert ein Modul in der Datenbank (falls noch nicht vorhanden)
   */
  private static async registerModuleInDb(module: XynoxaModule): Promise<void> {
    const { id, name, description, version, author, logoUrl } = module.metadata;
    
    try {
      // Prüfe ob modules Tabelle existiert
      try {
        await db.execute(sql`SELECT 1 FROM "modules" LIMIT 1`);
      } catch (tableError) {
        console.error("[ModuleService] modules table does not exist yet. Run migrations first.");
        return;
      }
      
      // Prüfe ob Modul bereits existiert
      const existing = await db
        .select()
        .from(modules)
        .where(eq(modules.moduleId, id))
        .limit(1);

      if (existing.length > 0) {
        // Modul existiert - update nur Version/Metadata
        await db
          .update(modules)
          .set({
            name,
            description,
            version,
            author,
            logoUrl: logoUrl || null,
            updatedAt: new Date()
          })
          .where(eq(modules.moduleId, id));
        
        console.log(`[ModuleService] Updated module metadata: ${name} v${version}`);
      } else {
        // Neues Modul - als "inactive" registrieren
        await db.insert(modules).values({
          moduleId: id,
          name,
          description,
          version,
          author,
          logoUrl: logoUrl || null,
          status: "inactive" // Neue Module sind standardmäßig inaktiv
        });
        
        console.log(`[ModuleService] Registered new module: ${name} v${version} (inactive)`);
      }
    } catch (error) {
      console.error(`[ModuleService] Failed to register module ${id}:`, error);
    }
  }

  /**
   * Lädt alle aktiven Module aus der Datenbank
   */
  static async getActiveModules(): Promise<string[]> {
    try {
      const activeModules = await db
        .select({ moduleId: modules.moduleId })
        .from(modules)
        .where(eq(modules.status, "active"));
      
      return activeModules.map(m => m.moduleId);
    } catch (error) {
      console.error("[ModuleService] Failed to get active modules:", error);
      return [];
    }
  }

  /**
   * Lädt alle aktiven Module als vollständige Modul-Objekte
   * (für Hooks wie onReindex, etc.)
   */
  static async getActiveModuleObjects(): Promise<XynoxaModule[]> {
    try {
      const activeModuleIds = await this.getActiveModules();
      const moduleObjects: XynoxaModule[] = [];
      
      for (const moduleId of activeModuleIds) {
        const module = await this.loadModule(moduleId);
        if (module) {
          moduleObjects.push(module);
        }
      }
      
      return moduleObjects;
    } catch (error) {
      console.error("[ModuleService] Failed to get active module objects:", error);
      return [];
    }
  }

  /**
   * Aktiviert ein Modul und führt die Installation aus
   */
  static async activateModule(moduleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Lade das Modul
      const module = await this.loadModule(moduleId);
      if (!module) {
        return { success: false, error: "Module not found" };
      }

      // Führe Installation aus (falls definiert)
      if (module.onInstall) {
        try {
          const sqlStatements = await module.onInstall();
          
          // Wenn SQL-Statements zurückgegeben werden, führe sie aus
          if (Array.isArray(sqlStatements) && sqlStatements.length > 0) {
            for (const statement of sqlStatements) {
              await db.execute(sql.raw(statement));
            }
          }
        } catch (installError: any) {
          // Installation fehlgeschlagen
          await db
            .update(modules)
            .set({
              status: "error",
              installError: installError.message || "Installation failed",
              updatedAt: new Date()
            })
            .where(eq(modules.moduleId, moduleId));
          
          return { 
            success: false, 
            error: `Installation failed: ${installError.message}` 
          };
        }
      }

      // Markiere Modul als aktiv
      await db
        .update(modules)
        .set({
          status: "active",
          installedAt: new Date(),
          activatedAt: new Date(),
          installError: null,
          updatedAt: new Date()
        })
        .where(eq(modules.moduleId, moduleId));

      // Module Loader neu laden, damit das Modul sofort verfügbar ist
      const { moduleLoader } = await import("@/lib/module-loader");
      await moduleLoader.reload();

      // Starte Reindexierung für dieses Modul (non-blocking)
      this.reindexModule(moduleId).catch(error => {
        console.error(`[ModuleService] Failed to reindex module ${moduleId} after activation:`, error);
      });

      console.log(`[ModuleService] Module ${moduleId} activated successfully`);
      return { success: true };
    } catch (error: any) {
      console.error(`[ModuleService] Failed to activate module ${moduleId}:`, error);
      return { 
        success: false, 
        error: error.message || "Activation failed" 
      };
    }
  }

  /**
   * Deaktiviert ein Modul
   */
  static async deactivateModule(moduleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Lade das Modul
      const module = await this.loadModule(moduleId);
      if (!module) {
        return { success: false, error: "Module not found" };
      }

      // Führe Deinstallation aus (falls definiert)
      if (module.onUninstall) {
        try {
          const sqlStatements = await module.onUninstall();
          
          // Wenn SQL-Statements zurückgegeben werden, führe sie aus
          if (Array.isArray(sqlStatements) && sqlStatements.length > 0) {
            for (const statement of sqlStatements) {
              await db.execute(sql.raw(statement));
            }
          }
        } catch (uninstallError: any) {
          console.error(`[ModuleService] Uninstall error for ${moduleId}:`, uninstallError);
          // Deaktivierung wird trotzdem fortgesetzt
        }
      }

      // Markiere Modul als inaktiv
      await db
        .update(modules)
        .set({
          status: "inactive",
          activatedAt: null,
          updatedAt: new Date()
        })
        .where(eq(modules.moduleId, moduleId));

      // Module Loader neu laden, damit das Modul sofort entfernt wird
      const { moduleLoader } = await import("@/lib/module-loader");
      await moduleLoader.reload();

      console.log(`[ModuleService] Module ${moduleId} deactivated successfully`);
      return { success: true };
    } catch (error: any) {
      console.error(`[ModuleService] Failed to deactivate module ${moduleId}:`, error);
      return { 
        success: false, 
        error: error.message || "Deactivation failed" 
      };
    }
  }

  /**
   * Lädt ein spezifisches Modul zur Laufzeit
   */
  private static async loadModule(moduleId: string): Promise<XynoxaModule | null> {
    // Scanne verfügbare Module zur Laufzeit
    const discovered = discoverModulesRuntime();
    
    // Lade jedes Modul und prüfe ob die ID passt
    for (const disc of discovered) {
      try {
        const module = await loadModuleRuntime(disc.name);
        
        if (module && module.metadata.id === moduleId) {
          return module;
        }
      } catch (error) {
        console.error(`[ModuleService] Failed to load module ${disc.name}:`, error);
      }
    }
    
    return null;
  }

  /**
   * Holt alle Module aus der Datenbank
   */
  static async getAllModules() {
    try {
      return await db.select().from(modules);
    } catch (error) {
      console.error("[ModuleService] Failed to get modules:", error);
      return [];
    }
  }

  /**
   * Reindexiert ein spezifisches Modul für alle User
   * Ruft den onReindex Hook des Moduls auf
   */
  static async reindexModule(moduleId: string): Promise<{ success: boolean; indexed: number; error?: string }> {
    console.log(`[ModuleService] Starting reindex for module: ${moduleId}`);
    
    try {
      // Lade das Modul
      const module = await this.loadModule(moduleId);
      if (!module) {
        return { success: false, indexed: 0, error: "Module not found" };
      }

      // Prüfe ob das Modul einen onReindex Hook hat
      if (!module.onReindex) {
        console.log(`[ModuleService] Module ${moduleId} has no onReindex hook, skipping`);
        return { success: true, indexed: 0 };
      }

      // Hole alle User (reindexiere für alle)
      const { users } = await import("../db/schema");
      const allUsers = await db.select({ id: users.id }).from(users);
      
      let totalIndexed = 0;

      // Erstelle Search-Context für das Modul
      const { indexDocument, ensureIndex } = await import("./search");
      const { upsertEmbedding: upsertEmbeddingFn } = await import("./embeddings");
      
      // Für jeden User: Rufe onReindex auf
      for (const user of allUsers) {
        try {
          const context = {
            db,
            indexDocument,
            ensureIndex,
            upsertEmbedding: async (params: {
              ownerId: string;
              entity: string;
              entityId: string;
              title?: string;
              text: string;
            }) => {
              await upsertEmbeddingFn({
                db,
                ownerId: params.ownerId,
                entity: params.entity as any,
                entityId: params.entityId,
                title: params.title,
                text: params.text
              });
            }
          };

          const indexed = await module.onReindex(user.id, context);
          totalIndexed += indexed;
        } catch (error) {
          console.error(`[ModuleService] Failed to reindex module ${moduleId} for user ${user.id}:`, error);
        }
      }

      console.log(`[ModuleService] Successfully reindexed module ${moduleId}. Total documents: ${totalIndexed}`);
      return { success: true, indexed: totalIndexed };
    } catch (error: any) {
      console.error(`[ModuleService] Failed to reindex module ${moduleId}:`, error);
      return { 
        success: false, 
        indexed: 0,
        error: error.message || "Reindexing failed" 
      };
    }
  }
}
