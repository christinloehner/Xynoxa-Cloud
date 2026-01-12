/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import {
  files,
  folders,
  groupFolderAccess,
  groupMembers,
  groups,
  notes,
  shares,
  shareRecipients,
  tasks,
  tenantMembers,
  users
} from "@/server/db/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireRole } from "@/server/middleware/rbac";
import { createNotification } from "@/server/services/notifications";
import { checkGroupFolderAccess } from "./files";
import { moduleRouterRegistry, type ModuleEntityType } from "@/server/module-router-registry";

// Core Entity-Typen - Module registrieren ihre eigenen via moduleRouterRegistry
const CORE_ENTITY_TYPES = ["file", "folder", "note", "task"] as const;

// Dynamisches Zod Schema - enthält Core + registrierte Modul-Entities
const getEntityEnum = () => {
  const moduleTypes = moduleRouterRegistry.getShareableEntityTypes().map(et => et.name);
  const allTypes = [...new Set([...CORE_ENTITY_TYPES, ...moduleTypes])];
  return z.enum(allTypes as [string, ...string[]]);
};

// Fallback für statische Typisierung
const entityEnum = z.enum(["file", "folder", "note", "task", "bookmark"]);

type EntityType = z.infer<typeof entityEnum>;

export const sharesRouter = router({
  list: protectedProcedure
    .input(z.object({ entityType: entityEnum, entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const cond = buildShareWhere(input.entityType, input.entityId);
      const rows = await ctx.db.select().from(shares).where(cond);

      const recipientRows = await ctx.db
        .select()
        .from(shareRecipients)
        .where(inArray(shareRecipients.shareId, rows.map((r) => r.id)));

      return rows.map((row) => ({
        ...row,
        recipients: recipientRows.filter((r) => r.shareId === row.id)
      }));
    }),

  recipientOptions: protectedProcedure.query(async ({ ctx }) => {
    // Users & Gruppen innerhalb desselben Tenants
    const [membership] = await ctx.db
      .select({ tenantId: tenantMembers.tenantId })
      .from(tenantMembers)
      .where(eq(tenantMembers.userId, ctx.userId!))
      .limit(1);

    if (!membership) return { users: [], groups: [] };

    const usersInTenant = await ctx.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .innerJoin(tenantMembers, eq(users.id, tenantMembers.userId))
      .where(eq(tenantMembers.tenantId, membership.tenantId));

    const groupsInTenant = await ctx.db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .innerJoin(tenantMembers, eq(groups.ownerId, tenantMembers.userId))
      .where(eq(tenantMembers.tenantId, membership.tenantId));

    return {
      users: usersInTenant,
      groups: groupsInTenant
    };
  }),

  createLink: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        entityType: entityEnum,
        entityId: z.string(),
        expiresAt: z.string().nullable().optional(),
        expiresInDays: z.number().int().positive().max(365).optional(),
        password: z.string().min(3).max(64).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ownerId } = await ensureEntityAccess(ctx.userId!, ctx.db, input.entityType, input.entityId);

      const expiresAt =
        input.expiresAt && input.expiresAt !== "null"
          ? new Date(input.expiresAt)
          : input.expiresInDays
            ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
            : null;

      const token = randomBytes(16).toString("hex");
      const passwordHash = input.password
        ? await (await import("argon2")).default.hash(input.password)
        : null;

      const values = buildShareInsert(input.entityType, input.entityId, {
        token,
        expiresAt,
        passwordHash,
        internal: false,
        createdBy: ctx.userId!
      });

      const [row] = await ctx.db.insert(shares).values(values).returning();

      await createNotification({
        userId: ownerId ?? ctx.userId!,
        title: "Freigabe erstellt",
        body: humanReadableTitle(input.entityType),
        href: undefined,
        level: "success"
      }).catch(() => { });

      return row;
    }),

  createInternal: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        entityType: entityEnum,
        entityId: z.string(),
        users: z.array(z.string()).default([]),
        groups: z.array(z.string()).default([])
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.users.length && !input.groups.length) throw new Error("Mindestens ein Empfänger nötig.");

      const { ownerId } = await ensureEntityAccess(ctx.userId!, ctx.db, input.entityType, input.entityId);

      const token = randomBytes(16).toString("hex");

      const values = buildShareInsert(input.entityType, input.entityId, {
        token,
        internal: true,
        expiresAt: null,
        passwordHash: null,
        createdBy: ctx.userId!
      });

      const [shareRow] = await ctx.db.insert(shares).values(values).returning();

      const recipientRows = [
        ...input.users.map((userId) => ({ shareId: shareRow.id, userId })),
        ...input.groups.map((groupId) => ({ shareId: shareRow.id, groupId }))
      ];

      if (recipientRows.length) {
        await ctx.db.insert(shareRecipients).values(recipientRows).onConflictDoNothing();
      }

      // Notifications für User
      for (const u of input.users) {
        createNotification({
          userId: u,
          title: "Neuer Share",
          body: `Dir wurde ein ${humanReadableTitle(input.entityType)} geteilt.`,
          href: undefined
        }).catch(() => { });
      }
      // Notifications für Gruppenmitglieder
      if (input.groups.length) {
        const members = await ctx.db
          .select({ userId: groupMembers.userId, groupId: groupMembers.groupId })
          .from(groupMembers)
          .where(inArray(groupMembers.groupId, input.groups));
        for (const m of members) {
          createNotification({
            userId: m.userId,
            title: "Neuer Gruppen-Share",
            body: `Deiner Gruppe wurde ein ${humanReadableTitle(input.entityType)} geteilt.`,
            href: undefined
          }).catch(() => { });
        }
      }

      await createNotification({
        userId: ownerId ?? ctx.userId!,
        title: "Interner Share erstellt",
        body: humanReadableTitle(input.entityType),
        href: undefined,
        level: "success"
      }).catch(() => { });

      return { share: shareRow, recipients: recipientRows };
    }),

  revoke: protectedProcedure
    .input(z.object({ shareId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Nur Ersteller oder Besitzer darf revoken
      const [row] = await ctx.db.select().from(shares).where(eq(shares.id, input.shareId)).limit(1);
      if (!row) throw new Error("Share nicht gefunden");

      const { ownerId } = await resolveOwner(ctx.db, row);
      if (row.createdBy !== ctx.userId && ownerId !== ctx.userId) {
        throw new Error("Keine Berechtigung");
      }

      await ctx.db.delete(shares).where(eq(shares.id, input.shareId));
      return { success: true };
    })
});

/**
 * Baut das Insert-Objekt für einen Share basierend auf Entity-Typ
 * Unterstützt Core-Entities und dynamische Modul-Entities
 */
function buildShareInsert(
  entityType: EntityType,
  entityId: string,
  meta: { token: string; expiresAt: Date | null; passwordHash: string | null; internal: boolean; createdBy: string }
) {
  const base = {
    token: meta.token,
    expiresAt: meta.expiresAt,
    passwordHash: meta.passwordHash,
    internal: meta.internal,
    createdBy: meta.createdBy
  };

  // Core Entity Types
  switch (entityType) {
    case "file":
      return { ...base, fileId: entityId };
    case "folder":
      return { ...base, folderId: entityId };
    case "note":
      return { ...base, noteId: entityId };
    case "task":
      return { ...base, taskId: entityId };
  }

  // Module Entity Types - nutze Registry für FK-Spalte
  const moduleEntity = moduleRouterRegistry.getEntityType(entityType);
  if (moduleEntity?.shareFkColumn) {
    return { ...base, [moduleEntity.shareFkColumn]: entityId };
  }

  // Fallback für unbekannte Typen
  throw new Error(`Unknown entity type: ${entityType}`);
}

/**
 * Baut die WHERE-Bedingung für Share-Queries
 */
function buildShareWhere(entityType: EntityType, entityId: string) {
  // Core Entity Types
  switch (entityType) {
    case "file":
      return eq(shares.fileId, entityId);
    case "folder":
      return eq(shares.folderId, entityId);
    case "note":
      return eq(shares.noteId, entityId);
    case "task":
      return eq(shares.taskId, entityId);
  }

  // Module Entity Types
  const moduleEntity = moduleRouterRegistry.getEntityType(entityType);
  if (moduleEntity?.shareFkColumn) {
    // Dynamische Spalte - nutze raw SQL
    return sql`${sql.identifier(moduleEntity.shareFkColumn)} = ${entityId}`;
  }

  throw new Error(`Unknown entity type: ${entityType}`);
}

/**
 * Prüft Zugriffsberechtigung auf eine Entity
 * Unterstützt Core-Entities und dynamische Modul-Entities
 */
async function ensureEntityAccess(userId: string, db: any, entityType: EntityType, entityId: string) {
  // Core Entity Types
  switch (entityType) {
    case "file": {
      const [f] = await db.select().from(files).where(eq(files.id, entityId)).limit(1);
      if (!f) throw new Error("Datei nicht gefunden");
      if (f.isVault) throw new Error("Vault-Dateien können nicht geteilt werden.");
      if (f.ownerId !== userId && !(await checkGroupAccess(db, userId, f.groupFolderId))) {
        throw new Error("Keine Berechtigung");
      }
      return { ownerId: f.ownerId };
    }
    case "folder": {
      const [fold] = await db.select().from(folders).where(eq(folders.id, entityId)).limit(1);
      if (!fold) throw new Error("Ordner nicht gefunden");
      if (fold.isVault) throw new Error("Vault-Ordner können nicht geteilt werden.");
      if (fold.ownerId !== userId && !(await checkGroupAccess(db, userId, fold.groupFolderId))) {
        throw new Error("Keine Berechtigung");
      }
      const hasVault = await folderHasVault(db, entityId);
      if (hasVault) {
        throw new Error("Ordner enthält Vault-Dateien und kann nicht geteilt werden.");
      }
      return { ownerId: fold.ownerId };
    }
    case "note": {
      const [n] = await db.select().from(notes).where(eq(notes.id, entityId)).limit(1);
      if (!n) throw new Error("Note nicht gefunden");
      if (n.isVault) throw new Error("Vault-Notizen können nicht geteilt werden.");
      if (n.ownerId !== userId) throw new Error("Keine Berechtigung");
      return { ownerId: n.ownerId };
    }
    case "task": {
      const [t] = await db.select().from(tasks).where(eq(tasks.id, entityId)).limit(1);
      if (!t) throw new Error("Task nicht gefunden");
      if (t.ownerId !== userId) throw new Error("Keine Berechtigung");
      return { ownerId: t.ownerId };
    }
  }

  // Module Entity Types - dynamische Abfrage über Registry
  const moduleEntity = moduleRouterRegistry.getEntityType(entityType);
  if (moduleEntity) {
    const result = await db.execute(sql`
      SELECT ${sql.identifier(moduleEntity.ownerIdColumn)} as owner_id
      FROM ${sql.identifier(moduleEntity.tableName)}
      WHERE ${sql.identifier(moduleEntity.idColumn)} = ${entityId}
      LIMIT 1
    `);
    
    const entity = result.rows?.[0] || result[0];
    if (!entity) throw new Error(`${moduleEntity.displayName} nicht gefunden`);
    
    const ownerId = entity.owner_id;
    if (ownerId !== userId) throw new Error("Keine Berechtigung");
    
    return { ownerId };
  }

  throw new Error(`Unknown entity type: ${entityType}`);
}

/**
 * Ermittelt den Owner einer Share-Entity
 */
async function resolveOwner(db: any, shareRow: any) {
  // Core Entity Types
  if (shareRow.fileId) {
    const [f] = await db.select({ ownerId: files.ownerId }).from(files).where(eq(files.id, shareRow.fileId)).limit(1);
    return { ownerId: f?.ownerId ?? null };
  }
  if (shareRow.folderId) {
    const [f] = await db.select({ ownerId: folders.ownerId }).from(folders).where(eq(folders.id, shareRow.folderId)).limit(1);
    return { ownerId: f?.ownerId ?? null };
  }
  if (shareRow.noteId) {
    const [n] = await db.select({ ownerId: notes.ownerId }).from(notes).where(eq(notes.id, shareRow.noteId)).limit(1);
    return { ownerId: n?.ownerId ?? null };
  }
  if (shareRow.taskId) {
    const [t] = await db.select({ ownerId: tasks.ownerId }).from(tasks).where(eq(tasks.id, shareRow.taskId)).limit(1);
    return { ownerId: t?.ownerId ?? null };
  }

  // Module Entity Types - dynamische Abfrage
  for (const moduleEntity of moduleRouterRegistry.getAllEntityTypes()) {
    if (moduleEntity.moduleId === "core") continue; // Core bereits behandelt
    
    const fkColumn = moduleEntity.shareFkColumn;
    if (fkColumn && shareRow[fkColumn]) {
      const result = await db.execute(sql`
        SELECT ${sql.identifier(moduleEntity.ownerIdColumn)} as owner_id
        FROM ${sql.identifier(moduleEntity.tableName)}
        WHERE ${sql.identifier(moduleEntity.idColumn)} = ${shareRow[fkColumn]}
        LIMIT 1
      `);
      
      const entity = result.rows?.[0] || result[0];
      return { ownerId: entity?.owner_id ?? null };
    }
  }

  return { ownerId: null };
}

async function checkGroupAccess(db: any, userId: string, groupFolderId: string | null) {
  if (!groupFolderId) return false;
  return checkGroupFolderAccess(db, userId, groupFolderId);
}

/**
 * Gibt einen lesbaren Namen für einen Entity-Typ zurück
 * Nutzt Module Registry für dynamische Modul-Entities
 */
function humanReadableTitle(entity: EntityType) {
  // Core Entity Types
  switch (entity) {
    case "file": return "Datei";
    case "folder": return "Ordner";
    case "note": return "Notiz";
    case "task": return "Aufgabe";
  }

  // Module Entity Types
  const moduleEntity = moduleRouterRegistry.getEntityType(entity);
  if (moduleEntity) {
    return moduleEntity.displayName;
  }

  return entity;
}

async function folderHasVault(db: any, folderId: string): Promise<boolean> {
  const vaultDirect = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.isVault, true)));
  if (vaultDirect.length) return true;
  const children = await db.select({ id: folders.id }).from(folders).where(eq(folders.parentId, folderId));
  for (const child of children) {
    if (await folderHasVault(db, child.id)) return true;
  }
  return false;
}
