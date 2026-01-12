/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Test Modul
 * 
 * Ein Beispiel-Modul das zeigt wie Module für Xynoxa Cloud entwickelt werden.
 * Dieses Modul implementiert alle verfügbaren Hooks und demonstriert die Integration.
 * 
 * HINWEIS: Dieses Modul hat keine eigene Datenbank oder API.
 * Für ein vollständiges Beispiel mit Router und Entity-Typen siehe XynoxaBookmarks.
 */

import { XynoxaModule } from "@/types/module";
import { TestTube } from "lucide-react";
import TestModulComponent from "./TestModulComponent";

/**
 * Modul-Definition
 * 
 * metadata: Pflicht - Basis-Informationen über das Modul
 * navigation: Optional - Sidebar-Einträge
 * routes: Optional - Seiten die das Modul bereitstellt
 * 
 * Lifecycle Hooks:
 * - onLoad/onUnload: Wird beim Laden/Entladen des Moduls aufgerufen
 * - onUserLogin/onUserLogout: Wird bei User-Events aufgerufen
 * - onInstall/onUninstall: Wird bei Aktivierung/Deaktivierung aufgerufen
 * - onReindex: Wird für Such-Indexierung aufgerufen
 * - getSearchResultUrl: Generiert URLs für Suchergebnisse
 */
const testModule: XynoxaModule = {
  metadata: {
    id: "test-modul",
    name: "Test Modul",
    description: "Ein Beispiel-Modul zur Demonstration des Xynoxa Modul-Systems",
    version: "1.0.0",
    author: "Xynoxa Team",
    icon: TestTube
  },

  // Navigation Item für die Sidebar
  navigation: [
    {
      id: "test-modul-nav",
      label: "Test Modul",
      href: "/test-modul",
      icon: TestTube,
      badge: "Beta"
    }
  ],

  // Routen die das Modul registriert
  routes: [
    {
      path: "/test-modul",
      component: TestModulComponent,
      requiresAuth: true
    }
  ],

  /**
   * onLoad Hook
   * 
   * Wird aufgerufen wenn das Modul geladen wird.
   * Hier können z.B. Entity-Typen im Module Router Registry registriert werden.
   * 
   * Beispiel für Module mit eigenem Router:
   * ```typescript
   * onLoad: async () => {
   *   try {
   *     const { moduleRouterRegistry } = await import("@/server/module-router-registry");
   *     const { entityTypes } = await import("./router");
   *     
   *     for (const et of entityTypes) {
   *       moduleRouterRegistry.registerEntityType({ ...et, moduleId: "mein-modul" });
   *     }
   *   } catch (e) {
   *     // Client-seitig OK - Import schlägt fehl
   *   }
   * }
   * ```
   */
  onLoad: async () => {
    console.log("[TestModul] Modul wurde geladen");
    // Dieses Modul hat keine Entity-Typen zu registrieren
  },

  /**
   * onUnload Hook
   * 
   * Wird aufgerufen wenn das Modul entladen wird.
   * Hier sollten registrierte Entity-Typen wieder deregistriert werden.
   */
  onUnload: async () => {
    console.log("[TestModul] Modul wurde entladen");
    // Dieses Modul hat keine Entity-Typen zu deregistrieren
  },

  onUserLogin: async (userId: string) => {
    console.log(`[TestModul] User ${userId} hat sich eingeloggt`);
  },

  onUserLogout: async () => {
    console.log("[TestModul] User hat sich ausgeloggt");
  },

  /**
   * onInstall Hook
   * 
   * Wird beim ersten Aktivieren des Moduls aufgerufen.
   * Hier sollten Datenbank-Tabellen erstellt werden.
   * 
   * WICHTIG: Tabellennamen müssen mit "mod_" beginnen!
   * 
   * Beispiel:
   * ```typescript
   * onInstall: async () => {
   *   return [
   *     `CREATE TABLE IF NOT EXISTS "mod_my_items" (
   *       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   *       "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
   *       "title" varchar(255),
   *       "created_at" timestamp DEFAULT now()
   *     );`
   *   ];
   * }
   * ```
   */
  onInstall: async () => {
    console.log("[TestModul] Installation started (no database changes needed)");
    // Dieses Modul braucht keine Datenbank-Tabellen
    return [];
  },

  /**
   * onUninstall Hook
   * 
   * Wird beim Deaktivieren des Moduls aufgerufen.
   * Optional zum Aufräumen von Tabellen.
   * 
   * WARNUNG: Daten werden gelöscht! Überlege gut ob du das willst.
   */
  onUninstall: async () => {
    console.log("[TestModul] Uninstallation completed");
    return [];
  }

  /**
   * Optional: onReindex Hook für Such-Integration
   * 
   * Beispiel:
   * ```typescript
   * onReindex: async (ownerId, context) => {
   *   const items = await context.db.select().from(myTable).where(eq(myTable.ownerId, ownerId));
   *   
   *   for (const item of items) {
   *     await context.indexDocument("my_items", { ... });
   *     await context.upsertEmbedding({ ... });
   *   }
   *   
   *   return items.length;
   * }
   * ```
   */

  /**
   * Optional: getSearchResultUrl für Suchergebnisse
   * 
   * Beispiel:
   * ```typescript
   * getSearchResultUrl: (entityId, entityType) => {
   *   if (entityType === "my-entity") {
   *     return `/my-module/${entityId}`;
   *   }
   *   return "";
   * }
   * ```
   */
};

export default testModule;
