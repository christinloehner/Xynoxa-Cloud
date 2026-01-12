/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Module Loader (Server-Only)
 *
 * Lädt und verwaltet alle Module aus dem modules/ Verzeichnis.
 * Module werden server-seitig geladen, damit Next.js
 * Client-Komponenten korrekt im Manifest registriert.
 */

import "server-only";
import type { XynoxaModule, ModuleRegistry, ModuleNavigationItem } from "@/types/module";
import { SERVER_MODULES, MODULE_NAMES } from "@/lib/module-registry.server";
import { logDebug, logError } from "@/server/services/logger";

class ModuleLoaderClass implements ModuleRegistry {
  public modules: Map<string, XynoxaModule> = new Map();
  private initialized = false;

  /**
   * Initialisiert den Module Loader und lädt alle Module
   */
  async initialize() {
    if (this.initialized) return;
    
    logDebug("[ModuleLoader] Initializing module system...");
    
    try {
      // Lade alle Module aus dem modules/ Verzeichnis
      await this.loadModules();
      this.initialized = true;
      logDebug("[ModuleLoader] Loaded modules", { count: this.modules.size, moduleIds: Array.from(this.modules.keys()) });
    } catch (error) {
      logError("[ModuleLoader] Failed to initialize", error);
    }
  }

  /**
   * Lädt alle Module aus dem modules/ Verzeichnis
   * Module werden zur Laufzeit automatisch erkannt - echtes Plug & Play!
   * Nur aktive Module werden geladen (Status aus DB wird respektiert)
   */
  private async loadModules() {
    const moduleContexts = SERVER_MODULES.map((mod) => async () => ({ default: mod }));
    logDebug("[ModuleLoader] Using auto-generated module registry", {
      moduleNames: MODULE_NAMES
    });

    let activeModuleIds: string[] = [];
    try {
      const { ModuleService } = await import("@/server/services/module-service");
      activeModuleIds = await ModuleService.getActiveModules();
      logDebug("[ModuleLoader] Active modules from DB", { activeModuleIds });
    } catch (error) {
      logError("[ModuleLoader] Failed to get active modules", error);
    }

    for (const importModule of moduleContexts) {
      try {
        const moduleExport = await importModule();
        const moduleEntry: XynoxaModule = moduleExport.default;
        
        if (!this.validateModule(moduleEntry)) {
          continue;
        }
        
        const isActive = activeModuleIds.includes(moduleEntry.metadata.id);
        if (isActive) {
          this.register(moduleEntry);
          logDebug("[ModuleLoader] Loaded active module", { moduleId: moduleEntry.metadata.id });
        } else {
          logDebug("[ModuleLoader] Skipping inactive module", { moduleId: moduleEntry.metadata.id });
        }
      } catch (error) {
        logError("[ModuleLoader] Failed to load module", error);
      }
    }
  }

  /**
   * Validiert ein Modul
   */
  private validateModule(moduleEntry: any): moduleEntry is XynoxaModule {
    if (!moduleEntry || typeof moduleEntry !== "object") {
      console.error("[ModuleLoader] Invalid module: not an object");
      return false;
    }

    if (!moduleEntry.metadata) {
      console.error("[ModuleLoader] Invalid module: missing metadata");
      return false;
    }

    if (!moduleEntry.metadata.id || !moduleEntry.metadata.name || !moduleEntry.metadata.version) {
      console.error("[ModuleLoader] Invalid module: incomplete metadata");
      return false;
    }

    return true;
  }

  /**
   * Registriert ein Modul
   */
  register(moduleEntry: XynoxaModule) {
    if (this.modules.has(moduleEntry.metadata.id)) {
      console.warn(`[ModuleLoader] Module ${moduleEntry.metadata.id} already registered, skipping`);
      return;
    }

    logDebug("[ModuleLoader] Registering module", {
      moduleId: moduleEntry.metadata.id,
      name: moduleEntry.metadata.name,
      version: moduleEntry.metadata.version
    });
    
    this.modules.set(moduleEntry.metadata.id, moduleEntry);
    
    // Rufe onLoad Hook auf
    if (moduleEntry.onLoad) {
      try {
        moduleEntry.onLoad();
      } catch (error) {
        logError("[ModuleLoader] Error in onLoad hook", error, { moduleId: moduleEntry.metadata.id });
      }
    }
  }

  /**
   * Entfernt ein Modul aus der Registry
   */
  unregister(moduleId: string) {
    const moduleEntry = this.modules.get(moduleId);
    if (!moduleEntry) return;

    logDebug("[ModuleLoader] Unregistering module", { moduleId });
    
    // Rufe onUnload Hook auf
    if (moduleEntry.onUnload) {
      try {
        moduleEntry.onUnload();
      } catch (error) {
        logError("[ModuleLoader] Error in onUnload hook", error, { moduleId });
      }
    }

    this.modules.delete(moduleId);
  }

  /**
   * Gibt ein Modul zurück
   */
  get(moduleId: string): XynoxaModule | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Gibt alle Module zurück
   */
  getAll(): XynoxaModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Gibt alle Navigation Items aller Module zurück
   */
  getAllNavigation(): ModuleNavigationItem[] {
    const items: ModuleNavigationItem[] = [];
    
    for (const moduleEntry of this.modules.values()) {
      if (moduleEntry.navigation) {
        items.push(...moduleEntry.navigation);
      }
    }
    
    return items;
  }

  /**
   * Filtert Navigation Items nach Rolle
   */
  getNavigationForRole(userRole?: string): ModuleNavigationItem[] {
    return this.getAllNavigation().filter(item => {
      if (!item.requiredRole) return true;
      if (!userRole) return false;
      
      // owner hat Zugriff auf alles
      if (userRole === "owner") return true;
      
      // admin hat Zugriff auf admin und user
      if (userRole === "admin" && (item.requiredRole === "admin" || item.requiredRole === "user")) {
        return true;
      }
      
      // user hat nur Zugriff auf user
      if (userRole === "user" && item.requiredRole === "user") {
        return true;
      }
      
      return item.requiredRole === userRole;
    });
  }

  /**
   * Trigger onUserLogin für alle Module
   */
  async triggerUserLogin(userId: string) {
    for (const moduleEntry of this.modules.values()) {
      if (moduleEntry.onUserLogin) {
        try {
          await moduleEntry.onUserLogin(userId);
        } catch (error) {
          logError("[ModuleLoader] Error in onUserLogin hook", error, { moduleId: moduleEntry.metadata.id });
        }
      }
    }
  }

  /**
   * Trigger onUserLogout für alle Module
   */
  async triggerUserLogout() {
    for (const moduleEntry of this.modules.values()) {
      if (moduleEntry.onUserLogout) {
        try {
          await moduleEntry.onUserLogout();
        } catch (error) {
          logError("[ModuleLoader] Error in onUserLogout hook", error, { moduleId: moduleEntry.metadata.id });
        }
      }
    }
  }

  /**
   * Lädt Module neu (z.B. nach Aktivierung/Deaktivierung)
   */
  async reload() {
    logDebug("[ModuleLoader] Reloading modules...");
    this.modules.clear();
    this.initialized = false;
    await this.initialize();
  }
}

// Singleton Instance
export const moduleLoader = new ModuleLoaderClass();

// Automatische Initialisierung deaktiviert - wird manuell aufgerufen wo benötigt
