/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Test Modul - Client-Safe Exports
 * 
 * Diese Datei enthält nur Informationen, die sicher im Client-Bundle
 * verwendet werden können (keine Server-only Dependencies wie DB, jsdom, etc.)
 * 
 * WICHTIG: Diese Datei exportiert ein Objekt im gleichen Format wie XynoxaModule,
 * aber ohne Server-only Hooks (onInstall, onReindex, etc.)
 */

import { TestTube } from "lucide-react";
import type { ClientXynoxaModule } from "@/types/module";

/**
 * Client-Safe Module Definition
 * Enthält nur die Felder, die im Client-Bundle sicher verwendet werden können
 */
const testModulClientModule: ClientXynoxaModule = {
  metadata: {
    id: "test-modul",
    name: "Test Modul",
    description: "Ein Beispiel-Modul zur Demonstration des Xynoxa Modul-Systems",
    version: "1.0.0",
    author: "Xynoxa Team",
    icon: TestTube
  },

  navigation: [
    {
      id: "test-modul-nav",
      label: "Test Modul",
      href: "/test-modul",
      icon: TestTube,
      badge: "Beta"
    }
  ],

  routes: [
    {
      path: "/test-modul",
      requiresAuth: true
    }
  ],

  /**
   * URL Generation für Suchergebnisse
   * Dieses Modul hat keine indexierten Entities
   */
  getSearchResultUrl: (_entityId: string, _entityType?: string): string => {
    return "";
  }
};

export default testModulClientModule;

// Named exports für direkten Zugriff
export const moduleId = "test-modul";
export const moduleName = "Test Modul";
export const navigation = testModulClientModule.navigation;
export const routes = testModulClientModule.routes;
export const getSearchResultUrl = testModulClientModule.getSearchResultUrl;
