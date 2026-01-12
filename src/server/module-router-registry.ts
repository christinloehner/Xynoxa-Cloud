/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Module Router Registry
 * 
 * Ermöglicht es Modulen, ihre eigenen tRPC-Router dynamisch zu registrieren.
 * Dies ist der Kern des Plug&Play Module API Systems.
 * 
 * ACHTUNG: Diese Datei ist Server-only und darf NICHT im Client-Bundle landen!
 * 
 * Usage in Modul:
 * ```typescript
 * import { moduleRouterRegistry } from "@/server/module-router-registry";
 * moduleRouterRegistry.register("bookmarks", bookmarksRouter);
 * ```
 */

// Guard against accidental client-side imports without breaking the worker runtime.
if (typeof window !== "undefined") {
  throw new Error("module-router-registry is server-only.");
}
import { AnyRouter } from "@trpc/server";

export interface ModuleRouterRegistration {
  /** Eindeutige Router-ID (z.B. "bookmarks") */
  routerId: string;
  /** Der tRPC Router */
  router: AnyRouter;
  /** Modul-ID zu dem der Router gehört */
  moduleId: string;
}

/**
 * Ergebnis von buildShareHtml für API Share Route
 */
export interface ShareHtmlResult {
  /** Generiertes HTML/Content */
  html: string;
  /** Content-Type Header */
  contentType?: string;
  /** Dateiname für Download */
  filename: string;
  /** Titel der Entity */
  title: string;
  /** Owner ID für Benachrichtigungen */
  ownerId?: string | null;
  /** Zusätzliche Metadaten für JSON-Response */
  metadata?: Record<string, unknown>;
}

/**
 * Entity Type Registration für Shares/Embeddings/Search
 * Erlaubt Modulen, ihre Entity-Typen zu registrieren
 */
export interface ModuleEntityType {
  /** Entity-Typ Name (z.B. "bookmark") - wird intern als `type` verwendet */
  name: string;
  /** Modul-ID */
  moduleId: string;
  /** Tabellen-Name in der Datenbank */
  tableName: string;
  /** ID-Spalte in der Entity-Tabelle */
  idColumn: string;
  /** Owner-ID-Spalte in der Entity-Tabelle */
  ownerIdColumn: string;
  /** FK-Spalte in shares-Tabelle (z.B. "bookmarkId") */
  shareFkColumn?: string;
  /** FK-Spalte in embeddings-Tabelle */
  embeddingFkColumn?: string;
  /** FK-Spalte in entityTags-Tabelle */
  entityTagFkColumn?: string;
  /** Index-Name für Meilisearch */
  searchIndexName?: string;
  /** Human-readable Name für UI */
  displayName: string;
  /** Vault-Feld vorhanden? */
  hasVaultField?: boolean;
  /** Share erlaubt? */
  shareable?: boolean;
  /** Share-URL Generator */
  getShareUrl?: (entityId: string) => string;
  /** 
   * Async HTML Generator für öffentliche Shares
   * Lädt Entity-Daten aus DB und generiert HTML für Download/Preview
   */
  buildShareHtml?: (db: unknown, entityId: string, download: boolean) => Promise<ShareHtmlResult | null>;
}

class ModuleRouterRegistryClass {
  private routers: Map<string, ModuleRouterRegistration> = new Map();
  private entityTypes: Map<string, ModuleEntityType> = new Map();
  private initialized = false;

  /**
   * Registriert einen Modul-Router
   */
  register(routerId: string, router: AnyRouter, moduleId: string): void {
    if (this.routers.has(routerId)) {
      console.warn(`[ModuleRouterRegistry] Router "${routerId}" already registered, overwriting`);
    }
    
    this.routers.set(routerId, { routerId, router, moduleId });
    console.log(`[ModuleRouterRegistry] Registered router: ${routerId} (module: ${moduleId})`);
  }

  /**
   * Deregistriert einen Modul-Router
   */
  unregister(routerId: string): void {
    if (this.routers.delete(routerId)) {
      console.log(`[ModuleRouterRegistry] Unregistered router: ${routerId}`);
    }
  }

  /**
   * Holt einen spezifischen Router
   */
  get(routerId: string): ModuleRouterRegistration | undefined {
    return this.routers.get(routerId);
  }

  /**
   * Gibt alle registrierten Router zurück
   */
  getAll(): ModuleRouterRegistration[] {
    return Array.from(this.routers.values());
  }

  /**
   * Gibt alle Router als Object zurück (für tRPC merge)
   */
  getAllAsObject(): Record<string, AnyRouter> {
    const result: Record<string, AnyRouter> = {};
    for (const [id, reg] of this.routers) {
      result[id] = reg.router;
    }
    return result;
  }

  /**
   * Prüft ob ein Router registriert ist
   */
  has(routerId: string): boolean {
    return this.routers.has(routerId);
  }

  /**
   * Registriert einen Entity-Typ eines Moduls
   * Wird für Shares, Embeddings und Suche verwendet
   */
  registerEntityType(entityType: ModuleEntityType): void {
    if (this.entityTypes.has(entityType.name)) {
      console.warn(`[ModuleRouterRegistry] EntityType "${entityType.name}" already registered, overwriting`);
    }
    
    this.entityTypes.set(entityType.name, entityType);
    console.log(`[ModuleRouterRegistry] Registered entity type: ${entityType.name} (module: ${entityType.moduleId})`);
  }

  /**
   * Deregistriert einen Entity-Typ
   */
  unregisterEntityType(type: string): void {
    if (this.entityTypes.delete(type)) {
      console.log(`[ModuleRouterRegistry] Unregistered entity type: ${type}`);
    }
  }

  /**
   * Holt einen Entity-Typ
   */
  getEntityType(type: string): ModuleEntityType | undefined {
    return this.entityTypes.get(type);
  }

  /**
   * Gibt alle registrierten Entity-Typen zurück
   */
  getAllEntityTypes(): ModuleEntityType[] {
    return Array.from(this.entityTypes.values());
  }

  /**
   * Gibt alle Entity-Typ-Namen zurück (für Zod enum etc.)
   */
  getEntityTypeNames(): string[] {
    return Array.from(this.entityTypes.keys());
  }

  /**
   * Gibt alle teilbaren Entity-Typen zurück
   */
  getShareableEntityTypes(): ModuleEntityType[] {
    return this.getAllEntityTypes().filter(et => et.shareable !== false);
  }

  /**
   * Initialisiert die Registry - lädt alle Modul-Router
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log("[ModuleRouterRegistry] Initializing...");
    
    // Registriere Core Entity-Typen
    this.registerCoreEntityTypes();
    
    // Lade Modul-Router (werden von Modulen selbst registriert)
    await this.loadModuleRouters();
    
    this.initialized = true;
    console.log(`[ModuleRouterRegistry] Initialized with ${this.routers.size} router(s) and ${this.entityTypes.size} entity type(s)`);
  }

  /**
   * Registriert die Core Entity-Typen (file, folder, note, task)
   */
  private registerCoreEntityTypes(): void {
    // File Entity
    this.registerEntityType({
      name: "file",
      moduleId: "core",
      tableName: "files",
      idColumn: "id",
      ownerIdColumn: "owner_id", // DB-Spaltenname (snake_case)
      shareFkColumn: "fileId",
      embeddingFkColumn: "file_id",
      searchIndexName: "files",
      displayName: "Datei",
      hasVaultField: true,
      shareable: true
    });

    // Folder Entity
    this.registerEntityType({
      name: "folder",
      moduleId: "core",
      tableName: "folders",
      idColumn: "id",
      ownerIdColumn: "owner_id", // DB-Spaltenname (snake_case)
      shareFkColumn: "folderId",
      searchIndexName: "folders",
      displayName: "Ordner",
      hasVaultField: true,
      shareable: true
    });

    // Event Entity (Calendar)
    this.registerEntityType({
      name: "event",
      moduleId: "core",
      tableName: "calendar_events",
      idColumn: "id",
      ownerIdColumn: "owner_id", // DB-Spaltenname (snake_case)
      embeddingFkColumn: "event_id",
      searchIndexName: "events",
      displayName: "Termin",
      shareable: false
    });

    // Task Entity
    this.registerEntityType({
      name: "task",
      moduleId: "core",
      tableName: "tasks",
      idColumn: "id",
      ownerIdColumn: "owner_id", // DB-Spaltenname (snake_case)
      shareFkColumn: "taskId",
      embeddingFkColumn: "task_id",
      searchIndexName: "tasks",
      displayName: "Aufgabe",
      shareable: true
    });
  }

  /**
   * Lädt Modul-Router aus aktiven Modulen
   */
  private async loadModuleRouters(): Promise<void> {
    try {
      // Import Module Service to get active modules
      const { ModuleService } = await import("@/server/services/module-service");
      const activeModuleIds = await ModuleService.getActiveModules();
      
      console.log(`[ModuleRouterRegistry] Loading routers for active modules: ${activeModuleIds.join(", ")}`);

      // Dynamisch Module laden und Router registrieren
      for (const moduleId of activeModuleIds) {
        try {
          // Versuche Router zu laden - jedes Modul hat optional einen router.ts Export
          const moduleName = `Xynoxa${moduleId.charAt(0).toUpperCase() + moduleId.slice(1).replace(/-([a-z])/g, (g) => g[1].toUpperCase())}`;
          
          try {
            // Versuche den Router zu importieren
            const routerModule = await import(`@/modules/${moduleName}/router`);
            
            if (routerModule.default) {
              this.register(moduleId, routerModule.default, moduleId);
            }
            
            // Registriere Entity-Types falls vorhanden
            if (routerModule.entityTypes && Array.isArray(routerModule.entityTypes)) {
              for (const et of routerModule.entityTypes) {
                this.registerEntityType({ ...et, moduleId });
              }
            }
          } catch (routerError: any) {
            // Router ist optional - Modul kann auch ohne Router funktionieren
            if (!routerError.message?.includes("Cannot find module")) {
              console.error(`[ModuleRouterRegistry] Error loading router for ${moduleId}:`, routerError);
            }
          }
        } catch (error) {
          console.error(`[ModuleRouterRegistry] Failed to process module ${moduleId}:`, error);
        }
      }
    } catch (error) {
      console.error("[ModuleRouterRegistry] Failed to load module routers:", error);
    }
  }

  /**
   * Reset für Tests
   */
  reset(): void {
    this.routers.clear();
    this.entityTypes.clear();
    this.initialized = false;
  }
}

// Singleton Export
export const moduleRouterRegistry = new ModuleRouterRegistryClass();
