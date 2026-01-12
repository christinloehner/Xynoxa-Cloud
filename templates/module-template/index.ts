/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Module Template
 *
 * Vollstaendige Modul-Definition mit allen optionalen Hooks.
 * Diese Datei ist SERVER-ONLY und darf server-side Abhaengigkeiten nutzen.
 */

import { XynoxaModule } from "@/types/module";
import { Puzzle } from "lucide-react";
import ModuleDashboard from "./components/ModuleDashboard";
import ModuleDetailView from "./components/ModuleDetailView";

const moduleTemplate: XynoxaModule = {
  metadata: {
    id: "module-template", // TODO: anpassen (kebab-case)
    name: "Module Template", // TODO
    description: "Beispielmodul mit kompletter Struktur", // TODO
    version: "1.0.0",
    author: "Xynoxa Team",
    icon: Puzzle
  },

  navigation: [
    {
      id: "module-template-nav",
      label: "Module Template",
      href: "/module-template",
      icon: Puzzle,
      badge: "Beta"
    }
  ],

  userNavigation: [
    {
      id: "module-template-user",
      label: "Module Template Settings",
      href: "/module-template/settings"
    }
  ],

  adminNavigation: [
    {
      id: "module-template-admin",
      label: "Module Template Admin",
      href: "/admin/module-template",
      icon: Puzzle
    }
  ],

  routes: [
    {
      path: "/module-template",
      component: ModuleDashboard,
      requiresAuth: true
    },
    {
      path: "/module-template/[id]",
      component: ModuleDetailView,
      requiresAuth: true,
      getProps: (params) => ({ id: params.id as string })
    }
  ],

  getSearchResultUrl: (entityId, entityType) => {
    if (entityType === "module-item") return `/module-template/${entityId}`;
    return "";
  },

  onLoad: async () => {
    console.log("[ModuleTemplate] Modul wird geladen...");
    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { default: moduleRouter, entityTypes } = await import("./router");

      if (!moduleRouterRegistry.has("module-template")) {
        moduleRouterRegistry.register("module-template", moduleRouter, "module-template");
      }

      for (const et of entityTypes) {
        if (!moduleRouterRegistry.getEntityType(et.name)) {
          moduleRouterRegistry.registerEntityType({
            ...et,
            moduleId: "module-template"
          });
        }
      }
    } catch (error) {
      console.log("[ModuleTemplate] Entity-Typ Registrierung uebersprungen (Client-Seite)");
    }
  },

  onUnload: async () => {
    console.log("[ModuleTemplate] Modul wird entladen...");
    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { entityTypes } = await import("./router");
      for (const et of entityTypes) {
        moduleRouterRegistry.unregisterEntityType(et.name);
      }
      moduleRouterRegistry.unregister("module-template");
    } catch {
      // Client-seitig OK
    }
  },

  onUserLogin: async (userId) => {
    console.log(`[ModuleTemplate] User ${userId} logged in`);
  },

  onUserLogout: async () => {
    console.log("[ModuleTemplate] User logged out");
  },

  onInstall: async () => {
    console.log("[ModuleTemplate] Installation gestartet...");
    // Rueckgabe von SQL Statements (optional)
    return [
      `
      CREATE TABLE IF NOT EXISTS "mod_module_template" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" varchar(255) NOT NULL,
        "content" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      `,
      `CREATE INDEX IF NOT EXISTS "mod_module_template_owner_idx" ON "mod_module_template"("owner_id");`
    ];
  },

  onUninstall: async () => {
    console.log("[ModuleTemplate] Deinstallation abgeschlossen (keine Daten geloescht)");
    return [];
  },

  onReindex: async (ownerId, context) => {
    console.log(`[ModuleTemplate] Reindex fuer User ${ownerId}`);
    const { moduleTemplateItems } = await import("./schema");
    const { eq } = await import("drizzle-orm");

    await context.ensureIndex("module_template", {
      searchableAttributes: ["title", "content"]
    });

    const rows = await context.db
      .select()
      .from(moduleTemplateItems)
      .where(eq(moduleTemplateItems.ownerId, ownerId));

    for (const row of rows) {
      await context.indexDocument("module_template", {
        id: row.id,
        ownerId: row.ownerId,
        title: row.title,
        content: row.content ?? "",
        createdAt: row.createdAt?.toISOString?.(),
        updatedAt: row.updatedAt?.toISOString?.(),
        type: "module-item"
      });

      await context.upsertEmbedding({
        ownerId: row.ownerId,
        entity: "module-item",
        entityId: row.id,
        title: row.title,
        text: row.content ?? ""
      });
    }

    return rows.length;
  }
};

export default moduleTemplate;
