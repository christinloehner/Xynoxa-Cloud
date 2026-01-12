/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Module System - Type Definitions
 * 
 * Definiert die Schnittstellen für das Plugin/Modul-System.
 * Jedes Modul kann Hooks implementieren um sich in die Anwendung zu integrieren.
 */

import { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Navigation Item für ein Modul
 */
export interface ModuleNavigationItem {
  /** Eindeutige ID für den Link */
  id: string;
  /** Angezeigter Text in der Navigation */
  label: string;
  /** Pfad zur Route (z.B. "/test-modul") */
  href: string;
  /** Lucide Icon für die Sidebar */
  icon: LucideIcon;
  /** Optionale Badge (z.B. "Beta", "Neu") */
  badge?: string;
  /** Nur für bestimmte Rollen sichtbar? */
  requiredRole?: "admin" | "owner" | "user";
}

/**
 * User Menu Item für Module (Topbar)
 */
export interface ModuleUserMenuItem {
  /** Eindeutige ID */
  id: string;
  /** Angezeigter Text */
  label: string;
  /** Ziel-Route */
  href: string;
  /** Nur für bestimmte Rollen sichtbar? */
  requiredRole?: "admin" | "owner" | "user";
}

/**
 * Admin Navigation Item für Module (Admin-Bereich)
 */
export interface ModuleAdminNavigationItem {
  /** Eindeutige ID */
  id: string;
  /** Angezeigter Text */
  label: string;
  /** Ziel-Route */
  href: string;
  /** Lucide Icon */
  icon: LucideIcon;
  /** Nur für bestimmte Rollen sichtbar? */
  requiredRole?: "admin" | "owner" | "user";
}

/**
 * Route Definition für ein Modul
 */
export interface ModuleRoute {
  /** Pfad der Route (z.B. "/test-modul") */
  path: string;
  /** React Component für diese Route (mit optionalen Props) */
  component: (props?: any) => ReactNode;
  /** Optional: Props Mapper für dynamische Routen */
  getProps?: (params: Record<string, string | string[]>, searchParams: Record<string, string | string[] | undefined>) => any;
  /** Erfordert Authentifizierung? (default: true) */
  requiresAuth?: boolean;
  /** Erforderliche Rolle */
  requiredRole?: "admin" | "owner" | "user";
}

/**
 * Client-Safe Route Definition (ohne Component)
 * Für Client-Bundles wo keine React-Komponenten importiert werden sollen
 */
export interface ClientModuleRoute {
  /** Pfad der Route (z.B. "/test-modul") */
  path: string;
  /** Erfordert Authentifizierung? (default: true) */
  requiresAuth?: boolean;
  /** Erforderliche Rolle */
  requiredRole?: "admin" | "owner" | "user";
}

/**
 * Modul Metadata
 */
export interface ModuleMetadata {
  /** Eindeutiger Modul-Name (z.B. "test-modul") */
  id: string;
  /** Anzeigename des Moduls */
  name: string;
  /** Beschreibung des Moduls */
  description: string;
  /** Version (SemVer) */
  version: string;
  /** Autor/Entwickler */
  author: string;
  /** Modul-Icon */
  icon?: LucideIcon;
  /** Logo URL für Admin-Interface */
  logoUrl?: string;
}

/**
 * Modul Settings Panel Hook
 */
export interface ModuleSettings {
  /** Titel des Settings-Panels */
  title: string;
  /** React Component für Settings */
  component: () => ReactNode;
}

/**
 * Haupt-Interface für ein Xynoxa Modul
 * 
 * Jedes Modul muss diese Schnittstelle implementieren:
 * 
 * @example
 * ```typescript
 * import { XynoxaModule } from "@/types/module";
 * 
 * const myModule: XynoxaModule = {
 *   metadata: {
 *     id: "my-module",
 *     name: "My Module",
 *     version: "1.0.0",
 *     author: "Your Name"
 *   },
 *   navigation: [{
 *     id: "my-module-link",
 *     label: "My Module",
 *     href: "/my-module",
 *     icon: Package
 *   }],
 *   routes: [{
 *     path: "/my-module",
 *     component: MyModuleComponent
 *   }]
 * };
 * 
 * export default myModule;
 * ```
 */
export interface XynoxaModule {
  /** Modul-Metadaten */
  metadata: ModuleMetadata;
  
  /** Navigation Items die in die Sidebar eingefügt werden */
  navigation?: ModuleNavigationItem[];

  /** User-Menü Items (Topbar) */
  userNavigation?: ModuleUserMenuItem[];

  /** Admin-Navigation Items (Adminbereich) */
  adminNavigation?: ModuleAdminNavigationItem[];
  
  /** Routen die das Modul registriert */
  routes?: ModuleRoute[];
  
  /** Optional: Settings Panel Integration */
  settings?: ModuleSettings;
  
  /** Hook: Wird beim Laden des Moduls aufgerufen */
  onLoad?: () => void | Promise<void>;
  
  /** Hook: Wird beim Entladen des Moduls aufgerufen */
  onUnload?: () => void | Promise<void>;
  
  /** Hook: Wird aufgerufen wenn User sich einloggt */
  onUserLogin?: (userId: string) => void | Promise<void>;
  
  /** Hook: Wird aufgerufen wenn User sich ausloggt */
  onUserLogout?: () => void | Promise<void>;
  
  /**
   * Installation Hook: Wird beim ersten Aktivieren des Moduls aufgerufen
   * Hier sollten Datenbank-Tabellen erstellt werden (mit "mod_" Prefix)
   * 
   * @returns SQL statements to execute oder void bei Erfolg
   * @throws Error wenn Installation fehlschlägt
   */
  onInstall?: () => string[] | Promise<string[]> | void | Promise<void>;
  
  /**
   * Deinstallation Hook: Wird beim Deaktivieren des Moduls aufgerufen
   * Hier sollten Modul-Tabellen entfernt werden (optional)
   * 
   * @returns SQL statements to execute oder void
   */
  onUninstall?: () => string[] | Promise<string[]> | void | Promise<void>;
  
  /**
   * Search Integration Hook: Wird beim Reindexing der Suche aufgerufen
   * Das Modul sollte hier alle seine Daten indexieren
   * 
   * @param ownerId - User ID für den die Daten indexiert werden sollen
   * @param context - Search context mit Helper-Funktionen
   * @returns Anzahl der indexierten Dokumente
   */
  onReindex?: (ownerId: string, context: SearchIndexContext) => Promise<number>;
  
  /**
   * URL Generation Hook: Generiert URLs für Suchergebnisse
   * Wird aufgerufen wenn ein Suchergebnis aus diesem Modul angezeigt wird
   * 
   * @param entityId - ID des Suchergebnisses
   * @param entityType - Typ des Entities (z.B. "bookmark")
   * @returns URL zur Detailseite
   */
  getSearchResultUrl?: (entityId: string, entityType?: string) => string;
}

/**
 * Client-Safe Xynoxa Module Definition
 * Für Client-Bundles ohne Server-only Dependencies (db, jsdom, etc.)
 * 
 * Enthält nur die Felder die im Browser sicher verwendet werden können:
 * - metadata (Modul-Informationen)
 * - navigation (Sidebar-Links)
 * - routes (ohne Komponenten)
 * - getSearchResultUrl (URL Generation)
 */
export interface ClientXynoxaModule {
  /** Modul-Metadaten */
  metadata: ModuleMetadata;
  
  /** Navigation Items die in die Sidebar eingefügt werden */
  navigation?: ModuleNavigationItem[];

  /** User-Menü Items (Topbar) */
  userNavigation?: ModuleUserMenuItem[];

  /** Admin-Navigation Items (Adminbereich) */
  adminNavigation?: ModuleAdminNavigationItem[];
  
  /** Routen die das Modul registriert (ohne Komponenten) */
  routes?: ClientModuleRoute[];
  
  /**
   * URL Generation Hook: Generiert URLs für Suchergebnisse
   * @param entityId - ID des Suchergebnisses
   * @param entityType - Typ des Entities (z.B. "bookmark")
   * @returns URL zur Detailseite
   */
  getSearchResultUrl?: (entityId: string, entityType?: string) => string;
}

/**
 * Context-Objekt für Search-Indexierung
 * Wird an onReindex übergeben mit Helper-Funktionen
 */
export interface SearchIndexContext {
  /** Indexiere ein einzelnes Dokument in Meilisearch */
  indexDocument: (indexName: string, document: any) => Promise<void>;
  /** Stellt sicher, dass ein Index existiert und konfiguriert ist */
  ensureIndex: (indexName: string, options?: { searchableAttributes?: string[] }) => Promise<void>;
  /** Indexiere Embedding für semantische Suche (pgvector) */
  upsertEmbedding: (params: {
    ownerId: string;
    entity: string;
    entityId: string;
    title?: string;
    text: string;
    force?: boolean;
  }) => Promise<void>;
  /** Datenbankzugriff */
  db: any;
}

/**
 * Modul Registry - Hält alle geladenen Module
 */
export interface ModuleRegistry {
  modules: Map<string, XynoxaModule>;
  register: (module: XynoxaModule) => void;
  unregister: (moduleId: string) => void;
  get: (moduleId: string) => XynoxaModule | undefined;
  getAll: () => XynoxaModule[];
  getAllNavigation: () => ModuleNavigationItem[];
}
