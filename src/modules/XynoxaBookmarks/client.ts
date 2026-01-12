/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Bookmarks Modul - Client-Safe Exports
 * 
 * Diese Datei enthält nur Informationen, die sicher im Client-Bundle
 * verwendet werden können (keine Server-only Dependencies wie DB, jsdom, etc.)
 * 
 * WICHTIG: Diese Datei exportiert ein Objekt im gleichen Format wie XynoxaModule,
 * aber ohne Server-only Hooks (onInstall, onReindex, etc.)
 */

import { Bookmark } from "lucide-react";
import type { ClientXynoxaModule } from "@/types/module";

/**
 * Client-Safe Module Definition
 * Enthält nur die Felder, die im Client-Bundle sicher verwendet werden können
 */
const bookmarksClientModule: ClientXynoxaModule = {
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
      requiresAuth: true
    },
    {
      path: "/bookmarks/[id]",
      requiresAuth: true
    }
  ],

  /**
   * URL Generation für Suchergebnisse
   */
  getSearchResultUrl: (entityId: string, entityType?: string): string => {
    if (entityType === "bookmark") {
      return `/bookmarks/${entityId}`;
    }
    return "";
  }
};

export default bookmarksClientModule;

// Named exports für direkten Zugriff
export const moduleId = "bookmarks";
export const moduleName = "Bookmarks";
export const navigation = bookmarksClientModule.navigation;
export const routes = bookmarksClientModule.routes;
export const getSearchResultUrl = bookmarksClientModule.getSearchResultUrl;
