/*
 * Copyright (C) 2025 Christin Löhner
 */

import "server-only";

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  projects,
  projectMembers,
  projectSections,
  projectTasks,
  projectTaskComments,
  projectMilestones,
  users,
  userProfiles,
  groupMembers,
  groups
} from "@/server/db/schema";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { ModuleEntityType } from "@/server/module-router-registry";
import { ensureIndex, indexDocument, updateDocument, deleteDocument } from "@/server/services/search";

const PROJECT_INDEX = "projects";
const TASK_INDEX = "project_tasks";
let taskCommentSchemaEnsured = false;

const roleRank: Record<string, number> = {
  owner: 4,
  manager: 3,
  member: 2,
  viewer: 1
};

function hasRole(current: string, required: string) {
  return (roleRank[current] ?? 0) >= (roleRank[required] ?? 0);
}

async function getProjectAccess(ctx: any, projectId: string) {
  const [project] = await ctx.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Projekt nicht gefunden." });
  }

  const userId = ctx.userId!;
  if (project.ownerId === userId) {
    return { project, role: "owner" };
  }

  const [member] = await ctx.db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);

  if (member) {
    return { project, role: member.role };
  }

  if (project.groupId) {
    const [groupMember] = await ctx.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, project.groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    if (groupMember) {
      return { project, role: "member" };
    }
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf dieses Projekt." });
}

async function getProjectMemberIds(ctx: any, project: any): Promise<string[]> {
  const memberRows = await ctx.db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, project.id));
  const memberIds = new Set<string>(memberRows.map((row: { userId: string }) => row.userId));
  memberIds.add(project.ownerId);

  if (project.groupId) {
    const groupRows = await ctx.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, project.groupId));
    for (const row of groupRows as { userId: string }[]) memberIds.add(row.userId);
  }

  return Array.from(memberIds);
}

async function ensureProjectIndexes() {
  await ensureIndex(PROJECT_INDEX, {
    searchableAttributes: ["name", "description", "tags", "status"]
  });
  await ensureIndex(TASK_INDEX, {
    searchableAttributes: ["title", "content", "tags", "priority", "status"]
  });
}

async function ensureTaskCommentSchema(ctx: any) {
  if (taskCommentSchemaEnsured) return;
  try {
    await ctx.db.execute(sql`
      ALTER TABLE "mod_project_task_comments"
      ADD COLUMN IF NOT EXISTS "parent_id" uuid REFERENCES "mod_project_task_comments"("id") ON DELETE CASCADE;
    `);
    await ctx.db.execute(sql`
      CREATE INDEX IF NOT EXISTS "mod_project_task_comments_parent_idx"
      ON "mod_project_task_comments"("parent_id");
    `);
    taskCommentSchemaEnsured = true;
  } catch (error) {
    // Falls DDL nicht möglich ist, vermeiden wir Hard-Failure im Request.
    taskCommentSchemaEnsured = false;
  }
}

async function refreshProjectSearch(ctx: any, project: any) {
  await ensureProjectIndexes();
  const memberIds = await getProjectMemberIds(ctx, project);

  await updateDocument(PROJECT_INDEX, {
    id: project.id,
    ownerId: project.ownerId,
    memberIds,
    name: project.name,
    description: project.description ?? "",
    content: project.description ?? "",
    tags: project.tags ?? [],
    status: project.status,
    createdAt: project.createdAt?.toISOString?.(),
    updatedAt: project.updatedAt?.toISOString?.(),
    type: "project"
  });

  const tasks = await ctx.db
    .select()
    .from(projectTasks)
    .where(eq(projectTasks.projectId, project.id));

  await Promise.all(
    tasks.map((task: any) =>
      updateDocument(TASK_INDEX, {
        id: task.id,
        ownerId: project.ownerId,
        memberIds,
        projectId: task.projectId,
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
      })
    )
  );
}

export const entityTypes: Omit<ModuleEntityType, "moduleId">[] = [
  {
    name: "project",
    tableName: "mod_projects",
    idColumn: "id",
    ownerIdColumn: "owner_id",
    searchIndexName: PROJECT_INDEX,
    displayName: "Projekt",
    shareable: false
  },
  {
    name: "project_task",
    tableName: "mod_project_tasks",
    idColumn: "id",
    ownerIdColumn: "project_id",
    searchIndexName: TASK_INDEX,
    displayName: "Projekt-Task",
    shareable: false
  }
];

const projectsRouter = router({
  listProjects: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId!;

    const membershipRows = await ctx.db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    const memberProjectIds = membershipRows.map((row) => row.projectId);

    const groupRows = await ctx.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));
    const groupIds = groupRows.map((row) => row.groupId);

    const accessibleProjects = await ctx.db
      .select()
      .from(projects)
      .where(or(
        eq(projects.ownerId, userId),
        memberProjectIds.length ? inArray(projects.id, memberProjectIds) : sql`false`,
        groupIds.length ? inArray(projects.groupId, groupIds) : sql`false`
      ))
      .orderBy(desc(projects.updatedAt));

    if (accessibleProjects.length === 0) return [];

    const ids = accessibleProjects.map((p) => p.id);
    const taskCounts = await ctx.db
      .select({
        projectId: projectTasks.projectId,
        total: sql<number>`count(*)`,
        open: sql<number>`sum(case when ${projectTasks.completedAt} is null and ${projectTasks.isArchived} = false then 1 else 0 end)`,
        done: sql<number>`sum(case when ${projectTasks.completedAt} is not null then 1 else 0 end)`
      })
      .from(projectTasks)
      .where(inArray(projectTasks.projectId, ids))
      .groupBy(projectTasks.projectId);

    const countsMap = new Map<string, { total: number; open: number; done: number }>();
    taskCounts.forEach((row) => {
      countsMap.set(row.projectId, {
        total: Number(row.total ?? 0),
        open: Number(row.open ?? 0),
        done: Number(row.done ?? 0)
      });
    });

    return accessibleProjects.map((project) => ({
      ...project,
      stats: countsMap.get(project.id) ?? { total: 0, open: 0, done: 0 }
    }));
  }),

  getProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);

      const [ownerProfile] = await ctx.db
        .select({
          userId: users.id,
          email: users.email,
          displayName: userProfiles.displayName
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, access.project.ownerId))
        .limit(1);

      const sections = await ctx.db
        .select()
        .from(projectSections)
        .where(eq(projectSections.projectId, access.project.id))
        .orderBy(asc(projectSections.position));

      const milestones = await ctx.db
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, access.project.id))
        .orderBy(asc(projectMilestones.dueAt));

      return {
        project: access.project,
        role: access.role,
        owner: ownerProfile,
        sections,
        milestones
      };
    }),

  listGroupsForUser: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, ctx.userId!))
      .orderBy(asc(groups.name));
    return rows;
  }),

  listGroupMembers: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [membership] = await ctx.db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, ctx.userId!)))
        .limit(1);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf diese Gruppe." });
      }

      const members = await ctx.db
        .select({
          userId: users.id,
          email: users.email,
          displayName: userProfiles.displayName
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(groupMembers.groupId, input.groupId))
        .orderBy(asc(users.email));

      return members;
    }),

  createProject: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(5000).optional(),
      groupId: z.string().uuid().optional(),
      tags: z.array(z.string()).max(20).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.groupId) {
        const [member] = await ctx.db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, ctx.userId!)))
          .limit(1);
        if (!member) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung für diese Gruppe." });
        }
      }

      const now = new Date();
      const [project] = await ctx.db
        .insert(projects)
        .values({
          ownerId: ctx.userId!,
          groupId: input.groupId ?? null,
          name: input.name,
          description: input.description ?? null,
          tags: input.tags ?? [],
          status: "active",
          visibility: input.groupId ? "group" : "private",
          createdAt: now,
          updatedAt: now
        })
        .returning();

      await ctx.db
        .insert(projectMembers)
        .values({
          projectId: project.id,
          userId: ctx.userId!,
          role: "owner"
        })
        .onConflictDoNothing();

      const defaultSections = [
        { name: "Backlog", position: 0, color: "#64748b", isDefault: true },
        { name: "Todo", position: 1, color: "#38bdf8", isDefault: false },
        { name: "In Progress", position: 2, color: "#fbbf24", isDefault: false },
        { name: "Review", position: 3, color: "#a855f7", isDefault: false },
        { name: "Done", position: 4, color: "#22c55e", isDefault: false }
      ];

      await ctx.db.insert(projectSections).values(
        defaultSections.map((section) => ({
          projectId: project.id,
          name: section.name,
          color: section.color,
          position: section.position,
          isDefault: section.isDefault,
          createdAt: now,
          updatedAt: now
        }))
      );

      await ensureProjectIndexes();
      const memberIds = await getProjectMemberIds(ctx, project);

      await indexDocument(PROJECT_INDEX, {
        id: project.id,
        ownerId: project.ownerId,
        memberIds,
        name: project.name,
        description: project.description ?? "",
        content: project.description ?? "",
        tags: project.tags ?? [],
        status: project.status,
        createdAt: project.createdAt?.toISOString?.() ?? now.toISOString(),
        updatedAt: project.updatedAt?.toISOString?.() ?? now.toISOString(),
        type: "project"
      });

      return project;
    }),

  updateProject: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      name: z.string().min(2).max(255).optional(),
      description: z.string().max(5000).optional(),
      status: z.enum(["active", "archived"]).optional(),
      tags: z.array(z.string()).max(20).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung zum Bearbeiten." });
      }

      const [updated] = await ctx.db
        .update(projects)
        .set({
          name: input.name ?? access.project.name,
          description: input.description ?? access.project.description,
          status: input.status ?? access.project.status,
          tags: input.tags ?? access.project.tags,
          updatedAt: new Date()
        })
        .where(eq(projects.id, access.project.id))
        .returning();

      await ensureProjectIndexes();
      const memberIds = await getProjectMemberIds(ctx, updated);

      await updateDocument(PROJECT_INDEX, {
        id: updated.id,
        ownerId: updated.ownerId,
        memberIds,
        name: updated.name,
        description: updated.description ?? "",
        content: updated.description ?? "",
        tags: updated.tags ?? [],
        status: updated.status,
        createdAt: updated.createdAt?.toISOString?.(),
        updatedAt: updated.updatedAt?.toISOString?.(),
        type: "project"
      });

      return updated;
    }),

  deleteProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);
      if (!hasRole(access.role, "owner")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Nur Owner können Projekte löschen." });
      }

      await ensureProjectIndexes();
      await ctx.db.delete(projects).where(eq(projects.id, access.project.id));
      await deleteDocument(PROJECT_INDEX, access.project.id, access.project.ownerId);
      return { success: true };
    }),

  listMembers: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);

      const members = await ctx.db
        .select({
          id: projectMembers.id,
          userId: projectMembers.userId,
          role: projectMembers.role,
          email: users.email,
          displayName: userProfiles.displayName
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(projectMembers.projectId, input.projectId))
        .orderBy(asc(users.email));

      if (!access.project.groupId) {
        return members;
      }

      const groupUsers = await ctx.db
        .select({
          userId: users.id,
          email: users.email,
          displayName: userProfiles.displayName
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(groupMembers.groupId, access.project.groupId))
        .orderBy(asc(users.email));

      const memberIds = new Set(members.map((m) => m.userId));
      const merged = [
        ...members.map((m) => ({ ...m, source: "project" })),
        ...groupUsers
          .filter((u) => !memberIds.has(u.userId))
          .map((u) => ({
            id: `group-${u.userId}`,
            userId: u.userId,
            role: "member",
            email: u.email,
            displayName: u.displayName,
            source: "group"
          }))
      ];

      return merged;
    }),

  addMemberByEmail: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(["manager", "member", "viewer"]).default("member")
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung zum Einladen." });
      }

      const [user] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User nicht gefunden." });
      }

      const [member] = await ctx.db
        .insert(projectMembers)
        .values({
          projectId: input.projectId,
          userId: user.id,
          role: input.role
        })
        .onConflictDoNothing()
        .returning();

      const updatedProject = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);

      if (updatedProject[0]) {
        await refreshProjectSearch(ctx, updatedProject[0]);
      }

      return member ?? { success: true };
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({
      memberId: z.string().uuid(),
      role: z.enum(["manager", "member", "viewer"])
    }))
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.id, input.memberId))
        .limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Mitglied nicht gefunden." });

      const access = await getProjectAccess(ctx, member.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      const [updated] = await ctx.db
        .update(projectMembers)
        .set({ role: input.role })
        .where(eq(projectMembers.id, input.memberId))
        .returning();

      return updated;
    }),

  removeMember: protectedProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.id, input.memberId))
        .limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Mitglied nicht gefunden." });

      const access = await getProjectAccess(ctx, member.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      await ctx.db.delete(projectMembers).where(eq(projectMembers.id, input.memberId));

      const [project] = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, member.projectId))
        .limit(1);

      if (project) {
        await refreshProjectSearch(ctx, project);
      }

      return { success: true };
    }),

  listSections: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await getProjectAccess(ctx, input.projectId);
      return ctx.db
        .select()
        .from(projectSections)
        .where(eq(projectSections.projectId, input.projectId))
        .orderBy(asc(projectSections.position));
    }),

  createSection: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(128),
      color: z.string().max(32).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      const [posRow] = await ctx.db
        .select({ maxPos: sql<number>`max(${projectSections.position})` })
        .from(projectSections)
        .where(eq(projectSections.projectId, input.projectId));

      const [section] = await ctx.db
        .insert(projectSections)
        .values({
          projectId: input.projectId,
          name: input.name,
          color: input.color ?? null,
          position: Number(posRow?.maxPos ?? 0) + 1,
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return section;
    }),

  updateSection: protectedProcedure
    .input(z.object({
      sectionId: z.string().uuid(),
      name: z.string().min(1).max(128).optional(),
      color: z.string().max(32).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const [section] = await ctx.db
        .select()
        .from(projectSections)
        .where(eq(projectSections.id, input.sectionId))
        .limit(1);
      if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "Spalte nicht gefunden." });

      const access = await getProjectAccess(ctx, section.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      const [updated] = await ctx.db
        .update(projectSections)
        .set({
          name: input.name ?? section.name,
          color: input.color ?? section.color,
          updatedAt: new Date()
        })
        .where(eq(projectSections.id, input.sectionId))
        .returning();
      return updated;
    }),

  reorderSections: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      sectionIds: z.array(z.string().uuid())
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      await Promise.all(
        input.sectionIds.map((id, idx) =>
          ctx.db.update(projectSections).set({ position: idx }).where(eq(projectSections.id, id))
        )
      );
      return { success: true };
    }),

  deleteSection: protectedProcedure
    .input(z.object({ sectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [section] = await ctx.db
        .select()
        .from(projectSections)
        .where(eq(projectSections.id, input.sectionId))
        .limit(1);
      if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "Spalte nicht gefunden." });

      const access = await getProjectAccess(ctx, section.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      const [defaultSection] = await ctx.db
        .select()
        .from(projectSections)
        .where(and(eq(projectSections.projectId, section.projectId), eq(projectSections.isDefault, true)))
        .limit(1);

      if (defaultSection && defaultSection.id !== section.id) {
        await ctx.db
          .update(projectTasks)
          .set({ sectionId: defaultSection.id })
          .where(eq(projectTasks.sectionId, section.id));
      }

      await ctx.db.delete(projectSections).where(eq(projectSections.id, section.id));
      return { success: true };
    }),

  listTasks: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      sectionId: z.string().uuid().nullable().optional(),
      milestoneId: z.string().uuid().optional()
    }))
    .query(async ({ ctx, input }) => {
      await getProjectAccess(ctx, input.projectId);

      const conditions = [eq(projectTasks.projectId, input.projectId)];
      if (input.sectionId) conditions.push(eq(projectTasks.sectionId, input.sectionId));
      if (input.milestoneId) conditions.push(eq(projectTasks.milestoneId, input.milestoneId));

      const tasks = await ctx.db
        .select({
          id: projectTasks.id,
          title: projectTasks.title,
          description: projectTasks.description,
          priority: projectTasks.priority,
          status: projectTasks.status,
          tags: projectTasks.tags,
          assigneeId: projectTasks.assigneeId,
          reporterId: projectTasks.reporterId,
          milestoneId: projectTasks.milestoneId,
          sectionId: projectTasks.sectionId,
          startAt: projectTasks.startAt,
          dueAt: projectTasks.dueAt,
          estimateHours: projectTasks.estimateHours,
          order: projectTasks.order,
          isArchived: projectTasks.isArchived,
          completedAt: projectTasks.completedAt,
          createdAt: projectTasks.createdAt,
          updatedAt: projectTasks.updatedAt,
          commentCount: sql<number>`(
            select count(*) from ${projectTaskComments} where ${projectTaskComments.taskId} = ${projectTasks.id}
          )`,
          assigneeEmail: users.email,
          assigneeName: userProfiles.displayName
        })
        .from(projectTasks)
        .leftJoin(users, eq(projectTasks.assigneeId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(and(...conditions))
        .orderBy(asc(projectTasks.order));

      return tasks;
    }),

  getTask: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select({
          id: projectTasks.id,
          projectId: projectTasks.projectId,
          title: projectTasks.title,
          description: projectTasks.description,
          priority: projectTasks.priority,
          status: projectTasks.status,
          tags: projectTasks.tags,
          assigneeId: projectTasks.assigneeId,
          reporterId: projectTasks.reporterId,
          milestoneId: projectTasks.milestoneId,
          sectionId: projectTasks.sectionId,
          startAt: projectTasks.startAt,
          dueAt: projectTasks.dueAt,
          estimateHours: projectTasks.estimateHours,
          order: projectTasks.order,
          isArchived: projectTasks.isArchived,
          completedAt: projectTasks.completedAt,
          createdAt: projectTasks.createdAt,
          updatedAt: projectTasks.updatedAt,
          assigneeEmail: users.email,
          assigneeName: userProfiles.displayName
        })
        .from(projectTasks)
        .leftJoin(users, eq(projectTasks.assigneeId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(eq(projectTasks.id, input.taskId))
        .limit(1);

      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task nicht gefunden." });

      const access = await getProjectAccess(ctx, task.projectId);
      return { ...task, role: access.role };
    }),

  createTask: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      title: z.string().min(1).max(255),
      description: z.string().max(10000).optional(),
      sectionId: z.string().uuid().optional(),
      milestoneId: z.string().uuid().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      assigneeId: z.string().uuid().optional(),
      dueAt: z.string().optional(),
      startAt: z.string().optional(),
      estimateHours: z.number().int().min(0).max(1000).optional(),
      tags: z.array(z.string()).max(20).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);
      if (!hasRole(access.role, "member")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      let sectionId = input.sectionId ?? null;
      if (!sectionId) {
        const [defaultSection] = await ctx.db
          .select()
          .from(projectSections)
          .where(and(eq(projectSections.projectId, input.projectId), eq(projectSections.isDefault, true)))
          .limit(1);
        sectionId = defaultSection?.id ?? null;
      } else {
        const [section] = await ctx.db
          .select({ projectId: projectSections.projectId })
          .from(projectSections)
          .where(eq(projectSections.id, sectionId))
          .limit(1);
        if (!section || section.projectId !== input.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültige Spalte." });
        }
      }

      if (input.milestoneId) {
        const [milestone] = await ctx.db
          .select({ projectId: projectMilestones.projectId })
          .from(projectMilestones)
          .where(eq(projectMilestones.id, input.milestoneId))
          .limit(1);
        if (!milestone || milestone.projectId !== input.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültiger Meilenstein." });
        }
      }

      if (input.assigneeId) {
        const memberIds = await getProjectMemberIds(ctx, access.project);
        if (!memberIds.includes(input.assigneeId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee ist kein Projektmitglied." });
        }
      }

      const [orderRow] = await ctx.db
        .select({ maxOrder: sql<number>`max(${projectTasks.order})` })
        .from(projectTasks)
        .where(and(eq(projectTasks.projectId, input.projectId), sectionId ? eq(projectTasks.sectionId, sectionId) : sql`true`));

      const [task] = await ctx.db
        .insert(projectTasks)
        .values({
          projectId: input.projectId,
          title: input.title,
          description: input.description ?? null,
          sectionId,
          milestoneId: input.milestoneId ?? null,
          priority: input.priority ?? "medium",
          status: "open",
          tags: input.tags ?? [],
          assigneeId: input.assigneeId ?? null,
          reporterId: ctx.userId!,
          startAt: input.startAt ? new Date(input.startAt) : null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          estimateHours: input.estimateHours ?? null,
          order: Number(orderRow?.maxOrder ?? 0) + 1,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      await ensureProjectIndexes();
      const memberIds = await getProjectMemberIds(ctx, access.project);
      await indexDocument(TASK_INDEX, {
        id: task.id,
        ownerId: access.project.ownerId,
        memberIds,
        projectId: task.projectId,
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

      return task;
    }),

  updateTask: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(10000).optional(),
      sectionId: z.string().uuid().optional(),
      milestoneId: z.string().uuid().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      assigneeId: z.string().uuid().optional(),
      dueAt: z.string().optional(),
      startAt: z.string().optional(),
      estimateHours: z.number().int().min(0).max(1000).optional(),
      tags: z.array(z.string()).max(20).optional(),
      status: z.enum(["open", "blocked", "done"]).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task nicht gefunden." });

      const access = await getProjectAccess(ctx, task.projectId);
      if (!hasRole(access.role, "member")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      if (input.sectionId !== undefined && input.sectionId !== null) {
        const [section] = await ctx.db
          .select({ projectId: projectSections.projectId })
          .from(projectSections)
          .where(eq(projectSections.id, input.sectionId))
          .limit(1);
        if (!section || section.projectId !== task.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültige Spalte." });
        }
      }

      if (input.milestoneId) {
        const [milestone] = await ctx.db
          .select({ projectId: projectMilestones.projectId })
          .from(projectMilestones)
          .where(eq(projectMilestones.id, input.milestoneId))
          .limit(1);
        if (!milestone || milestone.projectId !== task.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültiger Meilenstein." });
        }
      }

      if (input.assigneeId) {
        const memberIds = await getProjectMemberIds(ctx, access.project);
        if (!memberIds.includes(input.assigneeId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee ist kein Projektmitglied." });
        }
      }

      const [updated] = await ctx.db
        .update(projectTasks)
        .set({
          title: input.title ?? task.title,
          description: input.description ?? task.description,
          sectionId: input.sectionId === null ? null : input.sectionId ?? task.sectionId,
          milestoneId: input.milestoneId ?? task.milestoneId,
          priority: input.priority ?? task.priority,
          status: input.status ?? task.status,
          tags: input.tags ?? task.tags,
          assigneeId: input.assigneeId ?? task.assigneeId,
          startAt: input.startAt ? new Date(input.startAt) : task.startAt,
          dueAt: input.dueAt ? new Date(input.dueAt) : task.dueAt,
          estimateHours: input.estimateHours ?? task.estimateHours,
          updatedAt: new Date()
        })
        .where(eq(projectTasks.id, input.taskId))
        .returning();

      await ensureProjectIndexes();
      const memberIds = await getProjectMemberIds(ctx, access.project);
      await updateDocument(TASK_INDEX, {
        id: updated.id,
        ownerId: access.project.ownerId,
        memberIds,
        projectId: updated.projectId,
        title: updated.title,
        content: updated.description ?? "",
        tags: updated.tags ?? [],
        status: updated.status,
        priority: updated.priority,
        assigneeId: updated.assigneeId,
        dueAt: updated.dueAt?.toISOString?.(),
        createdAt: updated.createdAt?.toISOString?.(),
        updatedAt: updated.updatedAt?.toISOString?.(),
        type: "project_task"
      });

      return updated;
    }),

  moveTask: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      sectionId: z.string().uuid().nullable(),
      order: z.number().int().min(0).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task nicht gefunden." });

      const access = await getProjectAccess(ctx, task.projectId);
      if (!hasRole(access.role, "member")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      if (input.sectionId) {
        const [section] = await ctx.db
          .select({ projectId: projectSections.projectId })
          .from(projectSections)
          .where(eq(projectSections.id, input.sectionId))
          .limit(1);
        if (!section || section.projectId !== task.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültige Spalte." });
        }
      }

      let orderValue = input.order;
      if (orderValue === undefined) {
        const [orderRow] = await ctx.db
          .select({ maxOrder: sql<number>`max(${projectTasks.order})` })
          .from(projectTasks)
          .where(and(eq(projectTasks.projectId, task.projectId), input.sectionId ? eq(projectTasks.sectionId, input.sectionId) : sql`true`));
        orderValue = Number(orderRow?.maxOrder ?? 0) + 1;
      }

      const [updated] = await ctx.db
        .update(projectTasks)
        .set({
          sectionId: input.sectionId,
          order: orderValue,
          updatedAt: new Date()
        })
        .where(eq(projectTasks.id, input.taskId))
        .returning();

      return updated;
    }),

  toggleTaskComplete: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      completed: z.boolean()
    }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task nicht gefunden." });

      const access = await getProjectAccess(ctx, task.projectId);
      if (!hasRole(access.role, "member")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      const [updated] = await ctx.db
        .update(projectTasks)
        .set({
          completedAt: input.completed ? new Date() : null,
          status: input.completed ? "done" : "open",
          updatedAt: new Date()
        })
        .where(eq(projectTasks.id, input.taskId))
        .returning();

      await ensureProjectIndexes();
      const memberIds = await getProjectMemberIds(ctx, access.project);
      await updateDocument(TASK_INDEX, {
        id: updated.id,
        ownerId: access.project.ownerId,
        memberIds,
        projectId: updated.projectId,
        title: updated.title,
        content: updated.description ?? "",
        tags: updated.tags ?? [],
        status: updated.status,
        priority: updated.priority,
        assigneeId: updated.assigneeId,
        dueAt: updated.dueAt?.toISOString?.(),
        createdAt: updated.createdAt?.toISOString?.(),
        updatedAt: updated.updatedAt?.toISOString?.(),
        type: "project_task"
      });

      return updated;
    }),

  deleteTask: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task nicht gefunden." });

      const access = await getProjectAccess(ctx, task.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      await ensureProjectIndexes();
      await ctx.db.delete(projectTasks).where(eq(projectTasks.id, input.taskId));
      await deleteDocument(TASK_INDEX, input.taskId, access.project.ownerId);
      return { success: true };
    }),

  listTaskComments: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select({ projectId: projectTasks.projectId })
        .from(projectTasks)
        .where(eq(projectTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task nicht gefunden." });

      await getProjectAccess(ctx, task.projectId);

      await ensureTaskCommentSchema(ctx);
      const comments = await ctx.db
        .select({
          id: projectTaskComments.id,
          authorId: projectTaskComments.authorId,
          parentId: projectTaskComments.parentId,
          content: projectTaskComments.content,
          createdAt: projectTaskComments.createdAt,
          email: users.email,
          displayName: userProfiles.displayName
        })
        .from(projectTaskComments)
        .innerJoin(users, eq(projectTaskComments.authorId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(eq(projectTaskComments.taskId, input.taskId))
        .orderBy(asc(projectTaskComments.createdAt));

      return comments;
    }),

  addTaskComment: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      content: z.string().min(1).max(5000),
      parentId: z.string().uuid().optional().nullable()
    }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select({ projectId: projectTasks.projectId })
        .from(projectTasks)
        .where(eq(projectTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task nicht gefunden." });

      const access = await getProjectAccess(ctx, task.projectId);
      if (!hasRole(access.role, "member")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      await ensureTaskCommentSchema(ctx);
      const inserted = await ctx.db
        .insert(projectTaskComments)
        .values({
          taskId: input.taskId,
          authorId: ctx.userId!,
          content: input.content,
          parentId: input.parentId ?? null
        })
        .returning();
      const comment = Array.isArray(inserted) ? inserted[0] : undefined;
      return comment ?? null;
    }),

  listMilestones: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await getProjectAccess(ctx, input.projectId);
      return ctx.db
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, input.projectId))
        .orderBy(asc(projectMilestones.dueAt));
    }),

  createMilestone: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
      dueAt: z.string().optional(),
      status: z.enum(["open", "closed"]).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx, input.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      const [milestone] = await ctx.db
        .insert(projectMilestones)
        .values({
          projectId: input.projectId,
          name: input.name,
          description: input.description ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          status: input.status ?? "open",
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return milestone;
    }),

  updateMilestone: protectedProcedure
    .input(z.object({
      milestoneId: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(5000).optional(),
      dueAt: z.string().optional(),
      status: z.enum(["open", "closed"]).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const [milestone] = await ctx.db
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.id, input.milestoneId))
        .limit(1);
      if (!milestone) throw new TRPCError({ code: "NOT_FOUND", message: "Meilenstein nicht gefunden." });

      const access = await getProjectAccess(ctx, milestone.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      const [updated] = await ctx.db
        .update(projectMilestones)
        .set({
          name: input.name ?? milestone.name,
          description: input.description ?? milestone.description,
          dueAt: input.dueAt ? new Date(input.dueAt) : milestone.dueAt,
          status: input.status ?? milestone.status,
          updatedAt: new Date()
        })
        .where(eq(projectMilestones.id, input.milestoneId))
        .returning();
      return updated;
    }),

  deleteMilestone: protectedProcedure
    .input(z.object({ milestoneId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [milestone] = await ctx.db
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.id, input.milestoneId))
        .limit(1);
      if (!milestone) throw new TRPCError({ code: "NOT_FOUND", message: "Meilenstein nicht gefunden." });

      const access = await getProjectAccess(ctx, milestone.projectId);
      if (!hasRole(access.role, "manager")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung." });
      }

      await ctx.db.delete(projectMilestones).where(eq(projectMilestones.id, input.milestoneId));
      return { success: true };
    })
});

export default projectsRouter;
