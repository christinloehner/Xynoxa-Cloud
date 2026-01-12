/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Projects Modul - Client-Safe Exports
 */

import { FolderKanban } from "lucide-react";
import type { ClientXynoxaModule } from "@/types/module";

const projectsClientModule: ClientXynoxaModule = {
  metadata: {
    id: "projects",
    name: "Projekte",
    description: "Projektverwaltung mit Boards, Tasks, Milestones und Team-Management",
    version: "1.0.0",
    author: "Xynoxa Team",
    icon: FolderKanban
  },
  navigation: [
    {
      id: "projects-nav",
      label: "Projekte",
      href: "/projects",
      icon: FolderKanban
    }
  ],
  routes: [
    { path: "/projects", requiresAuth: true },
    { path: "/projects/[projectId]", requiresAuth: true },
    { path: "/projects/task/[taskId]", requiresAuth: true }
  ],
  getSearchResultUrl: (entityId: string, entityType?: string) => {
    if (entityType === "project") return `/projects/${entityId}`;
    if (entityType === "project_task") return `/projects/task/${entityId}`;
    return "";
  }
};

export default projectsClientModule;

export const moduleId = "projects";
export const moduleName = "Projekte";
export const navigation = projectsClientModule.navigation;
export const routes = projectsClientModule.routes;
export const getSearchResultUrl = projectsClientModule.getSearchResultUrl;
export const userNavigation = projectsClientModule.userNavigation;
export const adminNavigation = projectsClientModule.adminNavigation;
