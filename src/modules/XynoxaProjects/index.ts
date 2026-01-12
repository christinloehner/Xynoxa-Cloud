/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Projects Modul
 *
 * Vollständige Projektverwaltung mit Boards, Tasks, Milestones und Team-Management.
 */

import { XynoxaModule } from "@/types/module";
import { FolderKanban } from "lucide-react";
import ProjectsComponent from "./ProjectsComponent";
import ProjectDetailComponent from "./ProjectDetailComponent";
import TaskDetailPage from "./TaskDetailPage";

const projectsModule: XynoxaModule = {
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
    {
      path: "/projects",
      component: ProjectsComponent,
      requiresAuth: true
    },
    {
      path: "/projects/[projectId]",
      component: ProjectDetailComponent,
      requiresAuth: true,
      getProps: (params) => ({ projectId: params.projectId as string })
    },
    {
      path: "/projects/task/[taskId]",
      component: TaskDetailPage,
      requiresAuth: true,
      getProps: (params) => ({ taskId: params.taskId as string })
    }
  ],

  getSearchResultUrl: (entityId, entityType) => {
    if (entityType === "project") return `/projects/${entityId}`;
    if (entityType === "project_task") return `/projects/task/${entityId}`;
    return "";
  },

  onLoad: async () => {
    console.warn("[ProjectsModule] Modul wird geladen...");
    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { default: projectsRouter, entityTypes } = await import("./router");

      if (!moduleRouterRegistry.has("projects")) {
        moduleRouterRegistry.register("projects", projectsRouter, "projects");
      }

      for (const et of entityTypes) {
        if (!moduleRouterRegistry.getEntityType(et.name)) {
          moduleRouterRegistry.registerEntityType({
            ...et,
            moduleId: "projects"
          });
        }
      }

      console.warn("[ProjectsModule] Entity-Typen registriert");
    } catch (error) {
      console.warn("[ProjectsModule] Entity-Typ Registrierung übersprungen (Client-Seite)");
    }
  },

  onUnload: async () => {
    console.warn("[ProjectsModule] Modul wird entladen...");
    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { entityTypes } = await import("./router");
      for (const et of entityTypes) {
        moduleRouterRegistry.unregisterEntityType(et.name);
      }
      moduleRouterRegistry.unregister("projects");
    } catch (error) {
      // Client-seitig ok
    }
  },

  onInstall: async () => {
    console.warn("[ProjectsModule] Installation gestartet...");
    const sqlStatements: string[] = [];

    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS "mod_projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "group_id" uuid REFERENCES "groups"("id") ON DELETE SET NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "status" varchar(32) DEFAULT 'active' NOT NULL,
        "visibility" varchar(32) DEFAULT 'private' NOT NULL,
        "tags" text[],
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS "mod_project_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "mod_projects"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(32) DEFAULT 'member' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        UNIQUE ("project_id", "user_id")
      );
    `);

    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS "mod_project_sections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "mod_projects"("id") ON DELETE CASCADE,
        "name" varchar(128) NOT NULL,
        "color" varchar(32),
        "position" integer DEFAULT 0 NOT NULL,
        "is_default" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS "mod_project_milestones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "mod_projects"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "description" text,
        "due_at" timestamp with time zone,
        "status" varchar(32) DEFAULT 'open' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS "mod_project_tasks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "mod_projects"("id") ON DELETE CASCADE,
        "milestone_id" uuid REFERENCES "mod_project_milestones"("id") ON DELETE SET NULL,
        "section_id" uuid REFERENCES "mod_project_sections"("id") ON DELETE SET NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "priority" varchar(16) DEFAULT 'medium' NOT NULL,
        "status" varchar(32) DEFAULT 'open' NOT NULL,
        "tags" text[],
        "assignee_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "reporter_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "start_at" timestamp with time zone,
        "due_at" timestamp with time zone,
        "estimate_hours" integer,
        "order" integer DEFAULT 0 NOT NULL,
        "is_archived" boolean DEFAULT false NOT NULL,
        "completed_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS "mod_project_task_comments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "task_id" uuid NOT NULL REFERENCES "mod_project_tasks"("id") ON DELETE CASCADE,
        "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "content" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    sqlStatements.push(`
      CREATE INDEX IF NOT EXISTS "mod_project_tasks_project_idx" ON "mod_project_tasks"("project_id");
      CREATE INDEX IF NOT EXISTS "mod_project_members_project_idx" ON "mod_project_members"("project_id");
      CREATE INDEX IF NOT EXISTS "mod_project_sections_project_idx" ON "mod_project_sections"("project_id");
      CREATE INDEX IF NOT EXISTS "mod_project_milestones_project_idx" ON "mod_project_milestones"("project_id");
    `);

    console.warn("[ProjectsModule] Installation abgeschlossen");
    return sqlStatements;
  },

  onUninstall: async () => {
    console.warn("[ProjectsModule] Deinstallation abgeschlossen (keine Daten gelöscht)");
    return [];
  },

  onReindex: async (ownerId, context) => {
    console.warn(`[ProjectsModule] Reindexing projects for user ${ownerId}`);

    await context.ensureIndex("projects", { searchableAttributes: ["name", "description", "tags", "status"] });
    await context.ensureIndex("project_tasks", { searchableAttributes: ["title", "content", "tags", "priority", "status"] });

    const { projects: projectsTable, projectMembers: membersTable, projectTasks: tasksTable, groupMembers: groupMembersTable } = await import("@/server/db/schema");
    const { inArray, eq, or, sql } = await import("drizzle-orm");

    const membershipRows = await context.db
      .select({ projectId: membersTable.projectId })
      .from(membersTable)
      .where(eq(membersTable.userId, ownerId));
    const memberProjectIds = membershipRows.map((row: any) => row.projectId);

    const groupRows = await context.db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, ownerId));
    const groupIds = groupRows.map((row: any) => row.groupId);

    const projectsList = await context.db
      .select()
      .from(projectsTable)
      .where(or(
        eq(projectsTable.ownerId, ownerId),
        memberProjectIds.length ? inArray(projectsTable.id, memberProjectIds) : sql`false`,
        groupIds.length ? inArray(projectsTable.groupId, groupIds) : sql`false`
      ));

    let count = 0;

    for (const project of projectsList) {
      const memberRows = await context.db
        .select({ userId: membersTable.userId })
        .from(membersTable)
        .where(eq(membersTable.projectId, project.id));
      const memberIds = new Set<string>(memberRows.map((row: any) => row.userId));
      memberIds.add(project.ownerId);
      if (project.groupId) {
        const groupRows = await context.db
          .select({ userId: groupMembersTable.userId })
          .from(groupMembersTable)
          .where(eq(groupMembersTable.groupId, project.groupId));
        for (const row of groupRows) memberIds.add(row.userId);
      }

      await context.indexDocument("projects", {
        id: project.id,
        ownerId: project.ownerId,
        memberIds: Array.from(memberIds),
        name: project.name,
        description: project.description ?? "",
        content: project.description ?? "",
        tags: project.tags ?? [],
        status: project.status,
        createdAt: project.createdAt?.toISOString?.(),
        updatedAt: project.updatedAt?.toISOString?.(),
        type: "project"
      });

      const tasks = await context.db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.projectId, project.id));

      for (const task of tasks) {
        await context.indexDocument("project_tasks", {
          id: task.id,
          ownerId: project.ownerId,
          memberIds: Array.from(memberIds),
          projectId: project.id,
          title: task.title,
          content: task.description ?? "",
          tags: task.tags ?? [],
          status: task.status,
          priority: task.priority,
          assigneeId: task.assigneeId,
          dueAt: task.dueAt?.toISOString?.(),
          createdAt: task.createdAt?.toISOString?.(),
          updatedAt: task.updatedAt?.toISOString?.(),
          type: "project_task"
        });
        count += 1;
      }
      count += 1;
    }

    console.warn(`[ProjectsModule] Indexed ${count} documents`);
    return count;
  }
};

export default projectsModule;
