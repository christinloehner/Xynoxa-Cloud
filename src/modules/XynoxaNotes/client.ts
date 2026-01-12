/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Notes Modul - Client-Safe Exports
 */

import { NotebookText } from "lucide-react";
import type { ClientXynoxaModule } from "@/types/module";

const notesClientModule: ClientXynoxaModule = {
  metadata: {
    id: "notes",
    name: "Notes",
    description: "Notizen mit Rich-Text, Tags, Vault-Mode und Export",
    version: "1.0.0",
    author: "Xynoxa Team",
    icon: NotebookText
  },

  navigation: [
    {
      id: "notes-nav",
      label: "Notes",
      href: "/notes",
      icon: NotebookText
    }
  ],

  routes: [
    {
      path: "/notes",
      requiresAuth: true
    }
  ],

  getSearchResultUrl: (entityId: string, entityType?: string): string => {
    if (entityType === "note") {
      return `/notes?open=${entityId}`;
    }
    return "";
  }
};

export default notesClientModule;

export const moduleId = "notes";
export const moduleName = "Notes";
export const navigation = notesClientModule.navigation;
export const routes = notesClientModule.routes;
export const getSearchResultUrl = notesClientModule.getSearchResultUrl;
