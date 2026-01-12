/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Module Template - Client-Safe Exports
 *
 * Diese Datei darf nur client-sichere Imports enthalten.
 */

import { Puzzle } from "lucide-react";
import type { ClientXynoxaModule } from "@/types/module";

const moduleTemplateClient: ClientXynoxaModule = {
  metadata: {
    id: "module-template",
    name: "Module Template",
    description: "Beispielmodul mit kompletter Struktur",
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
    { path: "/module-template", requiresAuth: true },
    { path: "/module-template/[id]", requiresAuth: true }
  ],

  getSearchResultUrl: (entityId, entityType) => {
    if (entityType === "module-item") return `/module-template/${entityId}`;
    return "";
  }
};

export default moduleTemplateClient;

export const moduleId = "module-template";
export const moduleName = "Module Template";
export const navigation = moduleTemplateClient.navigation;
export const routes = moduleTemplateClient.routes;
export const userNavigation = moduleTemplateClient.userNavigation;
export const adminNavigation = moduleTemplateClient.adminNavigation;
export const getSearchResultUrl = moduleTemplateClient.getSearchResultUrl;
