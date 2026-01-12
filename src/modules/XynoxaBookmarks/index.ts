/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Bookmarks Modul
 * 
 * Vollständige Bookmark-Verwaltung mit Metadata-Fetching, Tags und Import/Export.
 * 
 * WICHTIG: Server-only Imports (router.ts, entityTypes) werden nur dynamisch
 * in onLoad/onUnload geladen, um Client-Bundle-Probleme zu vermeiden.
 */

import { XynoxaModule } from "@/types/module";
import { Bookmark } from "lucide-react";
import BookmarksComponent from "./BookmarksComponent";
import BookmarkDetailComponent from "./BookmarkDetailComponent";
// KEIN statischer Import von router.ts hier! Würde Server-only Module in Client-Bundle ziehen.

const bookmarksModule: XynoxaModule = {
  metadata: {
    id: "bookmarks",
    name: "Bookmarks",
    description: "Vollständige Bookmark-Verwaltung mit Metadata-Fetching, Tags und Import/Export",
    version: "1.0.0",
    author: "Xynoxa Team",
    icon: Bookmark
  },

  navigation: [
    {
      id: "bookmarks-nav",
      label: "Bookmarks",
      href: "/bookmarks",
      icon: Bookmark
    }
  ],

  routes: [
    {
      path: "/bookmarks",
      component: BookmarksComponent,
      requiresAuth: true
    },
    {
      path: "/bookmarks/[id]",
      component: BookmarkDetailComponent,
      requiresAuth: true,
      getProps: (params) => ({ bookmarkId: params.id as string })
    }
  ],

  /**
   * URL Generation Hook
   * Generiert URLs für Bookmark-Suchergebnisse
   */
  getSearchResultUrl: (entityId: string, entityType?: string) => {
    // Nur für bookmark-Entities URLs generieren
    if (entityType === "bookmark") {
      return `/bookmarks/${entityId}`;
    }
    return ""; // Leerer String = kein Match, nächstes Modul probieren
  },

  onLoad: async () => {
    console.warn("[BookmarksModule] Modul wird geladen...");
    
    // Registriere Entity-Typen im Module Router Registry
    // WICHTIG: Beide Imports müssen dynamisch sein, um Client-Bundle-Probleme zu vermeiden
    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { default: bookmarksRouter, entityTypes } = await import("./router");
      
      if (!moduleRouterRegistry.has("bookmarks")) {
        moduleRouterRegistry.register("bookmarks", bookmarksRouter, "bookmarks");
      }

      for (const et of entityTypes) {
        if (!moduleRouterRegistry.getEntityType(et.name)) {
          moduleRouterRegistry.registerEntityType({
            ...et,
            moduleId: "bookmarks"
          });
        }
      }
      
      console.warn("[BookmarksModule] Entity-Typen registriert");
    } catch (error) {
      // Client-seitig wird dieser Import fehlschlagen, das ist OK
      console.warn("[BookmarksModule] Entity-Typ Registrierung übersprungen (Client-Seite)");
    }
    
    console.warn("[BookmarksModule] Modul wurde geladen");
  },

  onUnload: async () => {
    console.warn("[BookmarksModule] Modul wird entladen...");
    
    // Deregistriere Entity-Typen
    // WICHTIG: Beide Imports müssen dynamisch sein, um Client-Bundle-Probleme zu vermeiden
    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { entityTypes } = await import("./router");
      
      for (const et of entityTypes) {
        moduleRouterRegistry.unregisterEntityType(et.name);
      }
      moduleRouterRegistry.unregister("bookmarks");
      
      console.warn("[BookmarksModule] Entity-Typen deregistriert");
    } catch (error) {
      // Client-seitig wird dieser Import fehlschlagen, das ist OK
    }
    
    console.warn("[BookmarksModule] Modul wurde entladen");
  },

  /**
   * Installation Hook
   * Erstellt die benötigten Datenbank-Tabellen für das Bookmarks-Modul
   */
  onInstall: async () => {
    console.warn("[BookmarksModule] Starting installation...");
    
    const sqlStatements: string[] = [];

    // Erstelle mod_bookmarks Tabelle (falls nicht existiert)
    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS "mod_bookmarks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "title" varchar(255),
        "description" text,
        "favicon_url" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // Falls alte 'bookmarks' Tabelle existiert, migriere Daten
    sqlStatements.push(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'bookmarks') THEN
          -- Migriere Daten von alter Tabelle
          INSERT INTO "mod_bookmarks" 
            SELECT * FROM "bookmarks"
            ON CONFLICT (id) DO NOTHING;
          
          -- Lösche alte Tabelle
          DROP TABLE "bookmarks";
          
          RAISE NOTICE 'Migrated data from bookmarks to mod_bookmarks';
        END IF;
      END $$;
    `);

    console.warn("[BookmarksModule] Installation completed successfully");
    return sqlStatements;
  },

  /**
   * Deinstallation Hook
   * Entfernt die Modul-Tabellen (optional - könnte auch Daten behalten)
   */
  onUninstall: async () => {
    console.warn("[BookmarksModule] Starting uninstallation...");
    
    // Warnung: Dies löscht alle Bookmark-Daten!
    // In Production könnte man hier nur die Tabelle umbenennen oder archivieren
    const sqlStatements: string[] = [
      // 'DROP TABLE IF EXISTS "mod_bookmarks" CASCADE;'
      // Kommentiert aus - wir wollen Daten nicht löschen bei Deaktivierung
    ];

    console.warn("[BookmarksModule] Uninstallation completed (no data deleted)");
    return sqlStatements;
  },

  /**
   * Search Integration Hook
   * Indexiert alle Bookmarks für die Volltext- und semantische Suche
   */
  onReindex: async (ownerId, context) => {
    console.warn(`[BookmarksModule] Indexing bookmarks for user ${ownerId}`);
    
    try {
      // Dynamischer Import um Server-Code nur auf Server zu laden
      const { bookmarks: bookmarksTable } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      
      // Lade alle Bookmarks des Users aus der mod_bookmarks Tabelle
      const bookmarks = await context.db.select().from(bookmarksTable).where(eq(bookmarksTable.ownerId, ownerId));

      console.warn(`[BookmarksModule] Found ${bookmarks.length} bookmarks to index`);

      // Indexiere jeden Bookmark in Meilisearch
      for (const bookmark of bookmarks) {
        // Fulltext-Index für schnelle Suche
        await context.indexDocument("bookmarks", {
          id: bookmark.id,
          ownerId: bookmark.ownerId,
          url: bookmark.url,
          title: bookmark.title || "",
          description: bookmark.description || "",
          faviconUrl: bookmark.faviconUrl || "",
          createdAt: bookmark.createdAt.toISOString(),
          type: "bookmark"
        });

        // Semantischer Index für intelligente Suche
        await context.upsertEmbedding({
          ownerId: bookmark.ownerId,
          entity: "bookmark",
          entityId: bookmark.id,
          title: bookmark.title || bookmark.url,
          text: `${bookmark.title || ""} ${bookmark.description || ""} ${bookmark.url}`
        });
      }

      console.warn(`[BookmarksModule] Successfully indexed ${bookmarks.length} bookmarks`);
      return bookmarks.length;
    } catch (error) {
      console.error("[BookmarksModule] Failed to index bookmarks:", error);
      return 0;
    }
  }
};

export default bookmarksModule;
