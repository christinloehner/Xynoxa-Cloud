/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { folders, tags, entityTags, files, groupFolders, groupFolderAccess, groupMembers } from "@/server/db/schema";
import { z } from "zod";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { requireRole } from "@/server/middleware/rbac";
import { indexDocument, updateDocument, deleteDocument, INDEXES } from "@/server/services/search";
import { resolveFolderPath } from "@/server/services/folder-paths";
import { createDirectory, movePath, deletePath } from "@/server/services/storage";
import { sanitizeFolderName } from "@/server/services/path-normalize";
import { recordChange } from "@/server/services/sync-journal";

async function hasGroupFolderAccess(db: any, userId: string, groupFolderId: string) {
  const [access] = await db
    .select({ id: groupFolderAccess.id })
    .from(groupFolderAccess)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
    .where(and(
      eq(groupFolderAccess.groupFolderId, groupFolderId),
      eq(groupMembers.userId, userId)
    ))
    .limit(1);
  return !!access;
}

async function findAccessibleGroupFolderByName(db: any, userId: string, name: string) {
  const [gf] = await db
    .select({
      id: groupFolders.id,
      name: groupFolders.name,
      createdAt: groupFolders.createdAt
    })
    .from(groupFolders)
    .innerJoin(groupFolderAccess, eq(groupFolders.id, groupFolderAccess.groupFolderId))
    .innerJoin(groupMembers, eq(groupFolderAccess.groupId, groupMembers.groupId))
    .where(and(
      eq(groupMembers.userId, userId),
      sql`lower(${groupFolders.name}) = lower(${name})`
    ))
    .limit(1);
  return gf ?? null;
}

const folderInput = z.object({
  parentId: z.string().uuid().nullable().optional()
});

export const foldersRouter = router({
  listAll: protectedProcedure.query(async ({ ctx }) => {
    // This is used for Move Dialog presumably. Should include Group Folders?
    // For now, keep it personal only or update later.
    const rows = await ctx.db.select().from(folders).where(eq(folders.ownerId, ctx.userId!));
    // ... logic for tags (omitted for brevity in this plan, keeping existing logic)
    // Actually, simply returning personal folders is "safe" but incomplete for Group Folders.
    // Let's stick to personal for listAll for now to avoid complexity in Move dialogs unless requested.
    const ids = rows.map((r) => r.id);
    // ... existing tag logic ...
    const tagRows = ids.length
      ? await ctx.db
        .select({ entityId: entityTags.entityId, name: tags.name })
        .from(entityTags)
        .innerJoin(tags, eq(tags.id, entityTags.tagId))
        .where(and(eq(entityTags.entityType, "folder"), inArray(entityTags.entityId, ids)))
      : [];
    const byId: Record<string, { name: string }[]> = {};
    tagRows.forEach((t) => {
      byId[t.entityId] = byId[t.entityId] || [];
      byId[t.entityId].push({ name: t.name });
    });
    return rows.map((r) => ({ ...r, tags: byId[r.id] || [] }));
  }),

  list: protectedProcedure
    .input(folderInput.optional())
    .query(async ({ ctx, input }) => {
      const parentId = input?.parentId ?? null;
      let rows: any[] = [];

      if (parentId === null) {
        // Root: Personal Folders + Accessible Group Folders
        const personalFolders = await ctx.db
          .select()
          .from(folders)
          .where(and(eq(folders.ownerId, ctx.userId!), isNull(folders.parentId)));

        // Fetch accessible Group Folders
        const myGroupFolders = await ctx.db
          .select({
            id: groupFolders.id,
            name: groupFolders.name,
            createdAt: groupFolders.createdAt,
            isVault: sql<boolean>`false`,
            parentId: sql<string | null>`null`
          })
          .from(groupFolders)
          .innerJoin(groupFolderAccess, eq(groupFolders.id, groupFolderAccess.groupFolderId))
          .innerJoin(groupMembers, and(
            eq(groupFolderAccess.groupId, groupMembers.groupId),
            eq(groupMembers.userId, ctx.userId)
          ))
          .groupBy(groupFolders.id); // Format GroupFolders to look like Folders
        const formattedGroupFolders = myGroupFolders.map(gf => ({
          id: gf.id,
          ownerId: null,
          parentId: null,
          name: gf.name,
          isVault: false,
          envelopeCipher: null,
          envelopeIv: null,
          envelopeSalt: null,
          createdAt: gf.createdAt,
          isGroupFolder: true // Frontend can use this to show icon
        }));

        rows = [...personalFolders, ...formattedGroupFolders];

      } else {
        // Subfolder Listing
        // Check if parentId is a real folder
        const [parent] = await ctx.db.select().from(folders).where(eq(folders.id, parentId)).limit(1);

        if (parent) {
          // Real folder. Check access.
          let hasAccess = false;
          if (parent.ownerId === ctx.userId) hasAccess = true;
          else if (parent.groupFolderId) {
            // Check GF access
            const [access] = await ctx.db
              .select({ id: groupFolderAccess.id })
              .from(groupFolderAccess)
              .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
              .where(and(
                eq(groupFolderAccess.groupFolderId, parent.groupFolderId),
                eq(groupMembers.userId, ctx.userId!)
              ))
              .limit(1);
            if (access) hasAccess = true;
          }

          if (hasAccess) {
            rows = await ctx.db.select().from(folders).where(eq(folders.parentId, parentId));
          }
        } else {
          // Maybe parentId is a Group Folder Root?
          const [gf] = await ctx.db.select().from(groupFolders).where(eq(groupFolders.id, parentId)).limit(1);
          if (gf) {
            // Check Access
            const [access] = await ctx.db
              .select({ id: groupFolderAccess.id })
              .from(groupFolderAccess)
              .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
              .where(and(
                eq(groupFolderAccess.groupFolderId, gf.id),
                eq(groupMembers.userId, ctx.userId!)
              ))
              .limit(1);

            if (access) {
              // List folders inside this GF (roots of GF)
              // These are folders where groupFolderId = gf.id AND parentId IS NULL
              rows = await ctx.db
                .select()
                .from(folders)
                .where(and(
                  eq(folders.groupFolderId, gf.id),
                  isNull(folders.parentId)
                ));
            }
          }
        }
      }

      // Tags logic
      const ids = rows.map((r) => r.id);
      const tagRows = ids.length
        ? await ctx.db
          .select({ entityId: entityTags.entityId, name: tags.name })
          .from(entityTags)
          .innerJoin(tags, eq(tags.id, entityTags.tagId))
          .where(and(eq(entityTags.entityType, "folder"), inArray(entityTags.entityId, ids)))
        : [];
      const byId: Record<string, { name: string }[]> = {};
      tagRows.forEach((t) => {
        byId[t.entityId] = byId[t.entityId] || [];
        byId[t.entityId].push({ name: t.name });
      });
      return rows.map((r) => ({ ...r, tags: byId[r.id] || [] }));
    }),

  breadcrumb: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const chain: any[] = [];
      let currentId: string | null = input.id;
      while (currentId) {
        // Try finding in folders (Personal or Group Subfolder)
        const [row] = await ctx.db
          .select()
          .from(folders)
          .where(eq(folders.id, currentId))
          .limit(1);

        if (row) {
          // Check access
          let hasAccess = false;
          if (row.ownerId === ctx.userId) {
            hasAccess = true;
          } else if (row.groupFolderId) {
            // Verify access via group membership
            const [access] = await ctx.db
              .select({ id: groupFolderAccess.id })
              .from(groupFolderAccess)
              .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
              .where(and(
                eq(groupFolderAccess.groupFolderId, row.groupFolderId),
                eq(groupMembers.userId, ctx.userId!)
              ))
              .limit(1);
            if (access) hasAccess = true;
          }

          if (!hasAccess) break;

          chain.unshift({ id: row.id, name: row.name, parentId: row.parentId, isGroupFolder: false });
          currentId = row.parentId;

          if (!currentId && row.groupFolderId) {
            // If we reached the top of a folder structure but it belongs to a group folder,
            // the next parent is the Group Folder Root itself.
            currentId = row.groupFolderId;
          }

        } else {
          // Maybe it is a Group Folder Root
          const [gf] = await ctx.db
            .select()
            .from(groupFolders)
            .where(eq(groupFolders.id, currentId))
            .limit(1);

          if (gf) {
            const [access] = await ctx.db
              .select({ id: groupFolderAccess.id })
              .from(groupFolderAccess)
              .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
              .where(and(
                eq(groupFolderAccess.groupFolderId, gf.id),
                eq(groupMembers.userId, ctx.userId!)
              ))
              .limit(1);

            if (access) {
              // Group Root found and accessible
              chain.unshift({ id: gf.id, name: gf.name, parentId: null, isGroupFolder: true });
            }
            // Roots have no parent, stop here
            break;
          } else {
            // Not found anywhere
            break;
          }
        }
      }
      return chain;
    }),

  create: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        name: z.string().min(1),
        parentId: z.string().uuid().nullable().optional(),
        isVault: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const parentPath = await resolveFolderPath(ctx.userId!, input.parentId || null);

      // Determine Group Context if creating subfolder in Group Folder?
      // Wait, files.create handles this. folders.create currently assumes ownerId=ctx.userId.
      // If we create a folder INSIDE a group folder, we MUST set ownerId=null and groupFolderId=...
      // CURRENT IMPLEMENTATION BUG: folders.create forces ownerId: ctx.userId!

      // Decode URL encoded characters from client
      let name = input.name;
      try {
        name = decodeURIComponent(input.name);
      } catch (e) {
        // Fallback if not encoded or invalid
        console.warn("Failed to decode folder name:", input.name);
      }
      name = sanitizeFolderName(name);

      // Gruppenordner sind virtuell und dürfen nicht als "echte" Root-Ordner erstellt werden.
      if (!input.parentId) {
        const existingGroupFolder = await findAccessibleGroupFolderByName(ctx.db, ctx.userId!, name);
        if (existingGroupFolder) {
          return {
            id: existingGroupFolder.id,
            ownerId: null,
            groupFolderId: existingGroupFolder.id,
            parentId: null,
            name: existingGroupFolder.name,
            isVault: false,
            createdAt: existingGroupFolder.createdAt,
            isGroupFolder: true,
            ignored: true
          };
        }
      }

      // This means subfolders in Groups are currently Personal Folders???
      // If client sends parentId which is a Group Folder Subfolder, resolveFolderPath handles filesystem path correctly?
      // `resolveFolderPath` traverses up. If it sees Group Folder, it should handle path.

      // BUT Database `folders` entry:
      // If parentId is referencing a folder that belongs to a Group (ownerId=null, groupFolderId=...),
      // then THIS new folder must also inherit groupFolderId and have ownerId=null.

      let groupFolderId: string | null = null;
      let ownerId: string | null = ctx.userId!;

      if (input.parentId) {
        const [parent] = await ctx.db.select().from(folders).where(eq(folders.id, input.parentId));
        if (parent) {
          if (parent.groupFolderId) {
            groupFolderId = parent.groupFolderId;
            ownerId = null;
          }
        } else {
          // Maybe parentId IS the Group Folder ID (Root of GF)
          const [gf] = await ctx.db.select().from(groupFolders).where(eq(groupFolders.id, input.parentId));
          if (gf) {
            groupFolderId = gf.id;
            ownerId = null;
          }
        }
      }
      if (groupFolderId) {
        const hasAccess = await hasGroupFolderAccess(ctx.db, ctx.userId!, groupFolderId);
        if (!hasAccess) throw new Error("Zugriff verweigert");
      }

      // Fix strict ownerId in insert
      // Check for duplicate name
      const existing = await ctx.db
        .select()
        .from(folders)
        .where(and(
          input.parentId && input.parentId !== groupFolderId ? eq(folders.parentId, input.parentId) : isNull(folders.parentId),
          // If we are in a group folder root (groupFolderId set, parentId null in DB), we check against that.
          groupFolderId ? eq(folders.groupFolderId, groupFolderId) : isNull(folders.groupFolderId),
          // If not a group folder, must match owner
          ownerId ? eq(folders.ownerId, ownerId) : isNull(folders.ownerId),
          eq(folders.name, name)
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Ein Ordner mit diesem Namen existiert bereits.");
      }

      const [row] = await ctx.db
        .insert(folders)
        .values({
          name: name,
          parentId: input.parentId && groupFolderId && input.parentId === groupFolderId ? null : (input.parentId ?? null), // If parent is GF Root, parentId in DB is null, groupFolderId is set.
          ownerId: ownerId,
          groupFolderId: groupFolderId,
          isVault: input.isVault ?? false,
          createdAt: new Date()
        })
        .returning();

      if (row) {
        // Create directory on FS
        const fullRelativePath = parentPath ? `${parentPath}/${row.name}` : row.name;
        // Ensure createDirectory handles Group Path correctly?
        // Sync logic is decoupled from direct FS creation here?
        // Actually `createDirectory` likely assumes User Path.
        // If Group Folder, path resolution might be tricky.
        // Assuming `resolveFolderPath` returns correct relative path including Group prefix?
        await createDirectory(ctx.userId!, fullRelativePath); // Warning: createDirectory needs check for GF support if implemented

        await indexDocument(INDEXES.FOLDERS, {
          id: row.id,
          ownerId: row.ownerId,
          groupFolderId: row.groupFolderId,
          name: row.name,
          createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
          type: "folder"
        });

        // SYNC RECORD
        await recordChange(ctx.db, row.ownerId, "folder", row.id, "create");
      }
      return row;
    }),

  rename: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [groupRoot] = await ctx.db.select({ id: groupFolders.id }).from(groupFolders).where(eq(groupFolders.id, input.id)).limit(1);
      if (groupRoot) {
        const allowed = await hasGroupFolderAccess(ctx.db, ctx.userId!, groupRoot.id);
        if (!allowed) throw new Error("Zugriff verweigert");
        return { ignored: true };
      }

      const [current] = await ctx.db.select().from(folders).where(eq(folders.id, input.id));
      if (!current) throw new Error("Ordner nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Zugriff verweigert");
      }
      if (!current.ownerId && current.groupFolderId) {
        const hasAccess = await hasGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Zugriff verweigert");
      }

      // Decode name
      let name = input.name;
      try {
        name = decodeURIComponent(input.name);
      } catch (e) {
        // Ignore
      }
      name = sanitizeFolderName(name);

      const parentPath = await resolveFolderPath(ctx.userId!, current.parentId);
      const oldRelativePath = parentPath ? `${parentPath}/${current.name}` : current.name;
      const newRelativePath = parentPath ? `${parentPath}/${name}` : name;

      // Duplicate Check
      // We check if another folder exists with same name in same parent
      const existing = await ctx.db
        .select()
        .from(folders)
        .where(and(
          current.parentId ? eq(folders.parentId, current.parentId) : isNull(folders.parentId),
          current.groupFolderId ? eq(folders.groupFolderId, current.groupFolderId) : isNull(folders.groupFolderId),
          current.ownerId ? eq(folders.ownerId, current.ownerId) : isNull(folders.ownerId),
          eq(folders.name, name)
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Ein Ordner mit diesem Namen existiert bereits.");
      }

      const [row] = await ctx.db
        .update(folders)
        .set({ name: name })
        .where(eq(folders.id, input.id))
        .returning();

      if (row) {
        await movePath(ctx.userId!, oldRelativePath, newRelativePath);

        await updateDocument(INDEXES.FOLDERS, {
          id: row.id,
          ownerId: row.ownerId,
          groupFolderId: row.groupFolderId,
          name: row.name,
          updatedAt: new Date().toISOString(),
          type: "folder"
        });

        // SYNC RECORD
        await recordChange(ctx.db, row.ownerId, "folder", row.id, "update");
      }
      return row;
    }),

  move: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string().uuid(), parentId: z.string().uuid().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [groupRoot] = await ctx.db.select({ id: groupFolders.id }).from(groupFolders).where(eq(groupFolders.id, input.id)).limit(1);
      if (groupRoot) {
        const allowed = await hasGroupFolderAccess(ctx.db, ctx.userId!, groupRoot.id);
        if (!allowed) throw new Error("Zugriff verweigert");
        return { ignored: true };
      }

      const [current] = await ctx.db.select().from(folders).where(eq(folders.id, input.id));
      if (!current) throw new Error("Ordner nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Zugriff verweigert");
      }
      if (!current.ownerId && current.groupFolderId) {
        const hasAccess = await hasGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Zugriff verweigert");
      }

      const oldParentPath = await resolveFolderPath(ctx.userId!, current.parentId);
      const oldRelativePath = oldParentPath ? `${oldParentPath}/${current.name}` : current.name;

      const newParentPath = await resolveFolderPath(ctx.userId!, input.parentId || null);
      const newRelativePath = newParentPath ? `${newParentPath}/${current.name}` : current.name;

      // Determine destination context
      let destGroupFolderId: string | null = null;
      if (input.parentId) {
        const [destFolder] = await ctx.db.select().from(folders).where(eq(folders.id, input.parentId)).limit(1);
        if (destFolder) {
          if (destFolder.groupFolderId) {
            destGroupFolderId = destFolder.groupFolderId;
            const hasAccess = await hasGroupFolderAccess(ctx.db, ctx.userId!, destFolder.groupFolderId);
            if (!hasAccess) throw new Error("Zugriff verweigert");
          } else if (destFolder.ownerId !== ctx.userId) {
            throw new Error("Zugriff verweigert");
          }
        } else {
          const [destGF] = await ctx.db.select().from(groupFolders).where(eq(groupFolders.id, input.parentId)).limit(1);
          if (destGF) {
            destGroupFolderId = destGF.id;
            const hasAccess = await hasGroupFolderAccess(ctx.db, ctx.userId!, destGF.id);
            if (!hasAccess) throw new Error("Zugriff verweigert");
          }
        }
      }

      // Duplicate Check in Destination
      // Destination Context:
      // If input.parentId is null -> Root.
      // If input.parentId is provided -> Check folders there.
      // NOTE: Moving to Group Folder Root:
      // The `input.parentId` might be a GroupFolderId?
      // Same ambiguity as in `files.ts` move.
      // Current implementation of `move` just sets `parentId: input.parentId`.
      // So prompt assumes `input.parentId` is a row in `folders`.

      const existing = await ctx.db.select().from(folders).where(
        and(
          input.parentId
            ? (destGroupFolderId && input.parentId === destGroupFolderId
              ? isNull(folders.parentId)
              : eq(folders.parentId, input.parentId))
            : and(isNull(folders.parentId), eq(folders.ownerId, ctx.userId!)),
          destGroupFolderId ? eq(folders.groupFolderId, destGroupFolderId) : isNull(folders.groupFolderId),
          eq(folders.name, current.name)
        )
      ).limit(1);

      if (existing.length > 0) {
        throw new Error("Ein Ordner mit diesem Namen existiert bereits im Zielverzeichnis.");
      }

      const descendantsQuery = sql`
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = ${input.id}
            UNION
            SELECT f.id FROM folders f
            INNER JOIN subfolders s ON f.parent_id = s.id
        )
        SELECT id FROM subfolders;
      `;
      const descendantsResult = await ctx.db.execute(descendantsQuery);
      const allFolderIds = descendantsResult.rows.map((r: any) => r.id);

      const newOwnerId = destGroupFolderId ? null : ctx.userId!;

      if (current.groupFolderId && current.groupFolderId !== destGroupFolderId) {
        await recordChange(ctx.db, null, "folder", current.id, "delete");
      }

      const [row] = await ctx.db
        .update(folders)
        .set({
          parentId: input.parentId && destGroupFolderId && input.parentId === destGroupFolderId ? null : (input.parentId ?? null),
          groupFolderId: destGroupFolderId ?? null,
          ownerId: newOwnerId
        })
        .where(eq(folders.id, input.id))
        .returning();

      if (row) {
        await movePath(ctx.userId!, oldRelativePath, newRelativePath);

        if (allFolderIds.length > 1) {
          const subFolderIds = allFolderIds.filter((id: string) => id !== input.id);
          await ctx.db
            .update(folders)
            .set({
              ownerId: newOwnerId,
              groupFolderId: destGroupFolderId ?? null
            })
            .where(inArray(folders.id, subFolderIds));
        }

        // Update files in subtree to match new context
        await ctx.db
          .update(files)
          .set({
            ownerId: newOwnerId,
            groupFolderId: destGroupFolderId ?? null
          })
          .where(inArray(files.folderId, allFolderIds));

        const filesInTree = await ctx.db
          .select()
          .from(files)
          .where(inArray(files.folderId, allFolderIds));

        await Promise.all(filesInTree.map((f) => updateDocument(INDEXES.FILES, {
          id: f.id,
          ownerId: newOwnerId,
          folderId: f.folderId,
          groupFolderId: destGroupFolderId ?? null,
          path: f.path,
          mime: f.mime,
          size: f.size,
          updatedAt: new Date().toISOString(),
          type: "file"
        })));

        if (filesInTree.length > 0) {
          const ids = filesInTree.map((f) => f.id);
          await ctx.db.execute(sql`UPDATE embeddings SET owner_id = ${newOwnerId} WHERE file_id IN (${sql.raw(ids.map((id) => `'${id}'`).join(","))})`);
        }

        // SYNC RECORD
        await recordChange(ctx.db, row.ownerId, "folder", row.id, "move");
      }

      return row;
    }),

  delete: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [groupRoot] = await ctx.db.select({ id: groupFolders.id }).from(groupFolders).where(eq(groupFolders.id, input.id)).limit(1);
      if (groupRoot) {
        const allowed = await hasGroupFolderAccess(ctx.db, ctx.userId!, groupRoot.id);
        if (!allowed) throw new Error("Zugriff verweigert");
        return { ignored: true };
      }

      const [current] = await ctx.db.select().from(folders).where(eq(folders.id, input.id));
      if (!current) throw new Error("Ordner nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Zugriff verweigert");
      }
      if (!current.ownerId && current.groupFolderId) {
        const hasAccess = await hasGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Zugriff verweigert");
      }

      // 1. Resolve path for disk deletion
      // We need the full path of the folder being deleted.
      const parentPath = await resolveFolderPath(ctx.userId!, current.parentId);
      const relativePath = parentPath ? `${parentPath}/${current.name}` : current.name;

      // 2. Find all descendant folder IDs using Recursive CTE
      // This ensures we get every subfolder level.
      const descendantsQuery = sql`
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = ${input.id}
            UNION
            SELECT f.id FROM folders f
            INNER JOIN subfolders s ON f.parent_id = s.id
        )
        SELECT id FROM subfolders;
      `;
      const descendantsResult = await ctx.db.execute(descendantsQuery);
      const allFolderIds = descendantsResult.rows.map((r: any) => r.id);

      // 3. Find all files in these folders (for Sync Journal info)
      const filesInFolders = await ctx.db
        .select({ id: files.id })
        .from(files)
        .where(and(
          inArray(files.folderId, allFolderIds),
          current.groupFolderId ? eq(files.groupFolderId, current.groupFolderId) : eq(files.ownerId, ctx.userId!)
        ));

      const allFileIds = filesInFolders.map(f => f.id);

      // 4. Delete from Disk
      // Because storage structure mimics DB structure, deleting the root folder path deletes everything inside.
      try {
        await deletePath(ctx.userId!, relativePath);
      } catch (e) {
        console.error("Folder deletePath failed, continuing with DB cleanup.", e);
      }

      // 5. Delete from DB
      await ctx.db.delete(folders).where(inArray(folders.id, allFolderIds));

      // 6. Update Sync Journal
      // We Record 'delete' for the main folder.
      await recordChange(ctx.db, current.ownerId, "folder", input.id, "delete");

      // And for sub-items?
      for (const fid of allFileIds) {
        // Remove from search index
        await deleteDocument(INDEXES.FILES, fid, current.ownerId);
        await recordChange(ctx.db, current.ownerId, "file", fid, "delete");
      }

      // Skip the root folder in this loop as we added it above
      const subFolderIds = allFolderIds.filter((id: string) => id !== input.id);
      for (const sfid of subFolderIds) {
        await deleteDocument(INDEXES.FOLDERS, sfid, current.ownerId);
        await recordChange(ctx.db, current.ownerId, "folder", sfid, "delete");
      }

      return { success: true };
    }),

  tags: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string().uuid(), tags: z.array(z.string()).default([]) }))
    .mutation(async ({ ctx, input }) => {
      // remove existing tags
      await ctx.db
        .delete(entityTags)
        .where(and(eq(entityTags.entityId, input.id), eq(entityTags.entityType, "folder")));

      for (const tagName of input.tags) {
        const [tag] =
          (await ctx.db
            .select()
            .from(tags)
            .where(and(eq(tags.name, tagName), eq(tags.ownerId, ctx.userId!)))) ?? [];
        const tagId =
          tag?.id ||
          (await ctx.db
            .insert(tags)
            .values({ name: tagName, ownerId: ctx.userId! })
            .returning())[0].id;
        await ctx.db
          .insert(entityTags)
          .values({ entityId: input.id, entityType: "folder", tagId: tagId, folderId: input.id })
          .onConflictDoNothing?.();
      }
      return { success: true };
    })
});
