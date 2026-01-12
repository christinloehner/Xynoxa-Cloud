/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { files, fileVersions, shares, tags, entityTags, folders, groupFolders, groupFolderAccess, groupMembers, users } from "@/server/db/schema";
import { eq, desc, and, isNull, or, inArray, sql } from "drizzle-orm";
import { INDEXES, indexDocument, updateDocument, deleteDocument } from "@/server/services/search";
import { requireRole } from "@/server/middleware/rbac";
import { logAudit } from "@/server/services/audit";
import { randomBytes } from "crypto";
import { upsertEmbedding, deleteEmbedding } from "@/server/services/embeddings";
import { ensureVaultFolder } from "@/server/services/vault";
import { v4 as uuidv4 } from "uuid";
import { cloneFileWithTags } from "@/server/services/storage-files";
import { resolveFolderPath } from "@/server/services/folder-paths";
import { movePath, deleteFile, deleteThumbnailsForFile } from "@/server/services/storage";
import { recordChange } from "@/server/services/sync-journal";
import { buildBufferFromVersion, decideAndSaveVersion, getLatestVersion, getVersionById, releaseVersions } from "@/server/services/file-versioning";
import { enqueueThumbnailJob } from "@/server/services/thumbnails";
import { createPatch } from "diff";
import { logFileRename, logFileMove, logFileCopy, logFileDelete, logFilePermanentDelete, logFileRestore, logFileVersionRestore } from "@/server/services/file-activities";

export const filesRouter = router({
  list: protectedProcedure
    .input(z.object({ folderId: z.string().uuid().nullable().optional(), trashed: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const trashed = input?.trashed ?? false;
      const folderId = input?.folderId ?? null;

      // Logic:
      // 1. If folderId is a "Group Folder" ID (root of a group folder), return files where groupFolderId = ID and folderId IS NULL.
      // 2. If folderId is a regular folder, return files where folderId = ID.
      // 3. To differentiate, we try to find the folder in 'folders' table first. Use efficient lookup?
      // Or just logical OR?

      // Personal files condition
      const personalCondition = and(
        eq(files.ownerId, ctx.userId!),
        eq(files.isDeleted, trashed),
        folderId === null ? isNull(files.folderId) : eq(files.folderId, folderId)
      );

      // Group files condition
      // A file is visible if:
      // - It belongs to a group folder that the user has access to.
      // - AND it matches the current folder view.

      // If folderId is provided, we need to know if it's a real folder or a group folder root.
      // If it's a real folder, it might belong to a group folder (inherited).

      // Let's simplify:
      // If folderId is NULL (User Root), we ONLY show personal root files. Group Folders are shown as *Folders*, so files are not involved here unless we mix root files? 
      // User requirements: "Group Folder ... has this folder ... in his file management".
      // Assuming Group Folders appear as folders in the root. So `files.list` at root should NOT return group files (they are inside the group folder).
      // So only personalCondition applies at Root.

      if (folderId === null) {
        // Root view - only personal files
        return ctx.db
          .select()
          .from(files)
          .where(personalCondition);
      }

      // If in a folder, check if we have access
      // Check if folder is a personal folder
      const [personalFolder] = await ctx.db
        .select()
        .from(folders)
        .where(eq(folders.id, folderId))
        .limit(1);

      if (personalFolder) {
        // It's a regular folder.
        // It could be a personal folder OR a folder inside a Group Folder.

        // If ownerId matches, it's personal.
        if (personalFolder.ownerId === ctx.userId) {
          return ctx.db.select().from(files).where(and(eq(files.folderId, folderId), eq(files.isDeleted, trashed)));
        }

        // If ownerId is null, it MUST be a group folder sub-folder.
        if (!personalFolder.ownerId && personalFolder.groupFolderId) {
          // Check Access
          const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, personalFolder.groupFolderId);
          if (hasAccess) {
            return ctx.db.select().from(files).where(and(eq(files.folderId, folderId), eq(files.isDeleted, trashed)));
          }
        }

        // No access or not found
        return [];
      }

      // If not in 'folders', maybe 'folderId' IS a Group Folder ID (Virtual Root)?
      const [groupFolder] = await ctx.db
        .select()
        .from(groupFolders)
        .where(eq(groupFolders.id, folderId))
        .limit(1);

      if (groupFolder) {
        // It is a group folder root.
        // Check Access
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, groupFolder.id);
        if (hasAccess) {
          // Return files at the root of this group folder
          return ctx.db.select().from(files).where(and(
            eq(files.groupFolderId, groupFolder.id),
            isNull(files.folderId),
            eq(files.isDeleted, trashed)
          ));
        }
      }

      return [];
    }),
  listDeleted: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(files)
      .where(and(eq(files.ownerId, ctx.userId!), eq(files.isDeleted, true)));
    return rows;
  }),

  locate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [file] = await ctx.db
        .select({
          id: files.id,
          ownerId: files.ownerId,
          folderId: files.folderId,
          groupFolderId: files.groupFolderId,
          path: files.path,
          mime: files.mime,
          updatedAt: files.updatedAt
        })
        .from(files)
        .where(eq(files.id, input.id))
        .limit(1);

      if (!file) {
        throw new Error("Datei nicht gefunden");
      }

      if (file.ownerId && file.ownerId !== ctx.userId) {
        throw new Error("Kein Zugriff");
      }

      if (!file.ownerId && file.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, file.groupFolderId);
        if (!hasAccess) throw new Error("Kein Zugriff");
      }

      return {
        id: file.id,
        folderId: file.folderId,
        groupFolderId: file.groupFolderId,
        path: file.path,
        mime: file.mime,
        updatedAt: file.updatedAt
      };
    }),

  countAll: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(and(eq(files.ownerId, ctx.userId!), eq(files.isDeleted, false)));
    return { count: Number(row?.count ?? 0) };
  }),

  tagsList: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({ name: tags.name })
        .from(entityTags)
        .innerJoin(tags, eq(tags.id, entityTags.tagId))
        .where(and(eq(entityTags.entityType, "file"), eq(entityTags.entityId, input.fileId)));
      return rows.map((r) => r.name);
    }),
  create: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        name: z.string().min(1),
        size: z.string().default("—"),
        vault: z.boolean().default(false),
        folderId: z.string().uuid().nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.vault) {
        throw new Error("Vault-Dateien müssen über den verschlüsselten Upload hochgeladen werden.");
      }

      let ownerId: string | null = ctx.userId!;
      let groupFolderId: string | null = null;

      // Determine context (Personal or Group Folder)
      if (input.folderId) {
        // Check if input.folderId is a real folder
        const [parent] = await ctx.db.select().from(folders).where(eq(folders.id, input.folderId)).limit(1);

        if (parent) {
          // Inheritance
          if (parent.groupFolderId) {
            // It is inside a group folder
            const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, parent.groupFolderId);
            if (!hasAccess) throw new Error("Zugriff verweigert");
            ownerId = null;
            groupFolderId = parent.groupFolderId;
          } else if (parent.ownerId !== ctx.userId) {
            throw new Error("Zugriff verweigert");
          }
        } else {
          // Maybe input.folderId IS the Group Folder Root?
          const [gf] = await ctx.db.select().from(groupFolders).where(eq(groupFolders.id, input.folderId)).limit(1);
          if (gf) {
            const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, gf.id);
            if (!hasAccess) throw new Error("Zugriff verweigert");
            ownerId = null;
            groupFolderId = gf.id;
            // When creating in root of GF, folderId should be NULL, but groupFolderId set.
            // Input.folderId was passed as the GF ID. So we must set `files.folderId` to null.
            // Wait, we can't mutate input.folderId easily.
            // Actually, `files.folderId` expects a FK to `folders`. GF is not in `folders`.
            // So we must pass NULL to `files.folderId`.
            // Modifying values below.
          } else {
            throw new Error("Ordner nicht gefunden");
          }
        }
      }

      const now = new Date();
      // Determine final folderId for DB
      // If we found it was a GF Root, DB folderId should be null.
      // If we found it was a regular folder, DB folderId is input.folderId.
      const dbFolderId = groupFolderId && input.folderId === groupFolderId ? null : (input.folderId ?? null);

      const existing = await ctx.db
        .select()
        .from(files)
        .where(
          and(
            ownerId ? eq(files.ownerId, ownerId) : isNull(files.ownerId),
            dbFolderId ? eq(files.folderId, dbFolderId) : isNull(files.folderId),
            groupFolderId ? eq(files.groupFolderId, groupFolderId) : isNull(files.groupFolderId),
            eq(files.path, input.name),
            eq(files.isDeleted, false)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Eine Datei mit diesem Namen existiert bereits.");
      }

      const [row] = await ctx.db
        .insert(files)
        .values({
          ownerId: ownerId,
          groupFolderId: groupFolderId,
          folderId: dbFolderId,
          path: input.name,
          size: input.size,
          mime: "application/octet-stream",
          hash: "",
          isDeleted: false,
          isVault: input.vault,
          updatedAt: now,
          createdAt: now
        })
        .returning();
      await ctx.db
        .insert(fileVersions)
        .values({
          fileId: row.id,
          version: 1,
          size: input.size,
          mime: "application/octet-stream",
          hash: "",
          createdAt: now
        });

      await indexDocument(INDEXES.FILES, {
        id: row.id,
        ownerId,
        folderId: dbFolderId,
        groupFolderId: groupFolderId,
        path: row.path,
        mime: row.mime,
        size: row.size,
        tags: [],
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
        type: "file"
      });
      await upsertEmbedding({
        db: ctx.db,
        ownerId,
        entity: "file",
        entityId: row.id,
        title: row.path,
        text: `${row.mime ?? ""} ${row.size ?? ""}`
      });

      if (ownerId) {
        await recordChange(ctx.db, ownerId, "file", row.id, "create");
      }

      return row;
    }),

  rename: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db.select().from(files).where(eq(files.id, input.id));
      if (!current) throw new Error("Datei nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Kein Zugriff");
      }
      if (!current.ownerId && current.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Kein Zugriff");
      }

      // Decode name
      let name = input.name;
      try {
        name = decodeURIComponent(input.name);
      } catch (e) {
        // Ignore
      }

      // Check for duplicate name in same folder
      const existing = await ctx.db
        .select()
        .from(files)
        .where(and(
          current.folderId ? eq(files.folderId, current.folderId) : isNull(files.folderId),
          // Ensure we check groupFolderId if it exists, or ensure we are just looking at "files in this folder"
          // Since files.folderId is set, that scopes it to the folder.
          // BUT if folderId is null (root), we need to check owner scopes.
          current.folderId ? undefined : (current.groupFolderId ? eq(files.groupFolderId, current.groupFolderId) : isNull(files.groupFolderId)),
          current.folderId ? undefined : (current.ownerId ? eq(files.ownerId, current.ownerId) : isNull(files.ownerId)),

          eq(files.path, name),
          eq(files.isDeleted, false)
        ));

      if (existing.length > 0) {
        throw new Error("Eine Datei mit diesem Namen existiert bereits.");
      }

      const parentPath = await resolveFolderPath(ctx.userId!, current.folderId);
      // current.path is the filename
      const oldRelativePath = parentPath ? `${parentPath}/${current.path}` : current.path;
      const newRelativePath = parentPath ? `${parentPath}/${name}` : name;

      // Prepare update payload
      const updatePayload: any = {
        path: name,
        updatedAt: new Date()
      };

      // Only update storagePath for Vault files (normal files use chunks, storagePath must remain null)
      if (current.isVault && current.storagePath) {
        updatePayload.storagePath = `${ctx.userId!}/${newRelativePath}`;
      }

      const [row] = await ctx.db
        .update(files)
        .set(updatePayload)
        .where(eq(files.id, input.id))
        .returning();

      if (row) {
        // Only physically move/rename Vault files (normal files are stored in chunks)
        if (row.isVault && current.storagePath) {
          await movePath(ctx.userId!, oldRelativePath, newRelativePath);
        }

        await updateDocument(INDEXES.FILES, {
          id: row.id,
          ownerId: row.ownerId,
          folderId: row.folderId,
          groupFolderId: row.groupFolderId,
          path: row.path,
          mime: row.mime,
          size: row.size,
          updatedAt: new Date().toISOString(),
          type: "file"
        });
        await upsertEmbedding({
          db: ctx.db,
          ownerId: row.ownerId,
          entity: "file",
          entityId: row.id,
          title: row.path,
          text: `${row.mime ?? ""} ${row.size ?? ""}`
        });

        await recordChange(ctx.db, row.ownerId, "file", row.id, "move");
        // Log activity
        await logFileRename(ctx.userId!, current.path, name, row.id);
      }
      return row;
    }),

  tags: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string(), tags: z.array(z.string()).default([]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(entityTags)
        .where(and(eq(entityTags.entityId, input.id), eq(entityTags.entityType, "file")));

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
          .values({ entityId: input.id, entityType: "file", tagId, fileId: input.id })
          .onConflictDoNothing?.();
      }
      return { success: true };
    }),
  toggleVault: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string(), vault: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db.select().from(files).where(eq(files.id, input.id)).limit(1);
      if (!current) throw new Error("Datei nicht gefunden");

      // Zugriff prüfen
      if (current.ownerId !== ctx.userId) {
        if (!current.groupFolderId) {
          throw new Error("Zugriff verweigert");
        }
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Zugriff verweigert");
      }

      // Entschlüsselung serverseitig nicht möglich -> Deaktivieren untersagen
      if (current.isVault && !input.vault) {
        throw new Error("Vault kann nicht deaktiviert werden. Bitte Datei unverschlüsselt neu hochladen.");
      }
      // Vault in Gruppenordnern nicht erlauben
      if (input.vault && current.groupFolderId) {
        throw new Error("Vault-Dateien sind in Gruppenordnern nicht erlaubt.");
      }

      if (input.vault && !current.iv) {
        throw new Error("Vault-Konvertierung erfordert einen verschlüsselten Upload (IV fehlt).");
      }
      let folderId = current.folderId;
      if (input.vault && !folderId) {
        const vaultFolder = await ensureVaultFolder(ctx.db, ctx.userId!);
        folderId = vaultFolder.id;
      }
      const updated = await ctx.db
        .update(files)
        .set({ isVault: input.vault, folderId, updatedAt: new Date() })
        .where(eq(files.id, input.id))
        .returning();
      if (updated[0]) {
        if (updated[0].isVault) {
          await deleteDocument(INDEXES.FILES, updated[0].id, updated[0].ownerId ?? ctx.userId);
          await deleteEmbedding({ db: ctx.db, entity: "file", entityId: updated[0].id, ownerId: updated[0].ownerId ?? ctx.userId });
        } else {
          await updateDocument(INDEXES.FILES, {
            id: updated[0].id,
            ownerId: ctx.userId!,
            folderId: updated[0].folderId,
            groupFolderId: updated[0].groupFolderId,
            path: updated[0].path,
            mime: updated[0].mime,
            size: updated[0].size,
            updatedAt: new Date().toISOString(),
            type: "file"
          });
        }
        await logAudit(ctx.db, ctx.userId!, "vault_toggle", `file=${updated[0].id};vault=${input.vault}`);
      }
      return updated[0] ?? null;
    }),
  versions: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ ctx, input }) =>
      ctx.db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId))
        .orderBy(desc(fileVersions.version))
    ),
  diff: protectedProcedure
    .input(z.object({ fileId: z.string(), fromVersionId: z.string(), toVersionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [file] = await ctx.db.select().from(files).where(eq(files.id, input.fileId)).limit(1);
      if (!file) throw new Error("Datei nicht gefunden");
      if (file.isVault) throw new Error("Vault-Dateien unterstützen keinen Diff");

      const [fromVersion, toVersion] = await Promise.all([
        getVersionById(input.fromVersionId),
        getVersionById(input.toVersionId)
      ]);
      if (!fromVersion || !toVersion) throw new Error("Version nicht gefunden");

      const mime = toVersion.mime ?? file.mime ?? "text/plain";
      if (!mime.startsWith("text/") && !mime.includes("json") && !mime.includes("xml")) {
        throw new Error("Diff nur für Text-Dateien verfügbar");
      }

      const [fromBuf, toBuf] = await Promise.all([
        buildBufferFromVersion(fromVersion.id),
        buildBufferFromVersion(toVersion.id)
      ]);
      const fromText = fromBuf.toString("utf8");
      const toText = toBuf.toString("utf8");
      const diffText = createPatch(file.path, fromText, toText);
      return {
        mime,
        from: { id: fromVersion.id, version: fromVersion.version, createdAt: fromVersion.createdAt },
        to: { id: toVersion.id, version: toVersion.version, createdAt: toVersion.createdAt },
        diff: diffText,
        fromContent: fromText,
        toContent: toText
      };
    }),
  newVersion: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ fileId: z.string(), size: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId))
        .orderBy(desc(fileVersions.version))
        .limit(1);
      const nextVersion = (last[0]?.version ?? 0) + 1;
      const [row] = await ctx.db
        .insert(fileVersions)
        .values({
          fileId: input.fileId,
          version: nextVersion,
          size: input.size ?? last[0]?.size ?? "—",
          mime: last[0]?.mime ?? "application/octet-stream",
          hash: "",
          createdAt: new Date()
        })
        .returning();
      const [file] = await ctx.db.select().from(files).where(eq(files.id, input.fileId)).limit(1);
      await updateDocument(INDEXES.FILES, {
        id: input.fileId,
        ownerId: file?.ownerId ?? ctx.userId!,
        folderId: file?.folderId,
        groupFolderId: file?.groupFolderId,
        path: file?.path ?? "",
        mime: row.mime,
        size: row.size,
        updatedAt: new Date().toISOString(),
        type: "file"
      });
      await upsertEmbedding({
        db: ctx.db,
        ownerId: ctx.userId!,
        entity: "file",
        entityId: input.fileId,
        title: file?.path ?? "",
        text: `${row.mime ?? ""} ${row.size ?? ""}`
      });
      return row;
    }),

  move: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string(), folderId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db.select().from(files).where(eq(files.id, input.id));
      if (!current) throw new Error("Datei nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Kein Zugriff");
      }
      if (!current.ownerId && current.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Kein Zugriff");
      }

      const oldParentPath = await resolveFolderPath(ctx.userId!, current.folderId);
      const oldRelativePath = oldParentPath ? `${oldParentPath}/${current.path}` : current.path;

      const newParentPath = await resolveFolderPath(ctx.userId!, input.folderId || null);
      const newRelativePath = newParentPath ? `${newParentPath}/${current.path}` : current.path;

      // Check for duplicate in destination
      // We need to know context of destination
      // input.folderId
      let destGroupFolderId: string | null = null;
      let destOwnerId: string | null = ctx.userId;
      let destFolderId: string | null = input.folderId ?? null;

      if (input.folderId) {
        const [destFolder] = await ctx.db.select().from(folders).where(eq(folders.id, input.folderId));
        if (destFolder) {
          if (destFolder.groupFolderId) {
            destGroupFolderId = destFolder.groupFolderId;
            destOwnerId = null;
            const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, destFolder.groupFolderId);
            if (!hasAccess) throw new Error("Zugriff verweigert");
          } else if (destFolder.ownerId !== ctx.userId) {
            throw new Error("Zugriff verweigert");
          }
        } else {
          const [destGF] = await ctx.db.select().from(groupFolders).where(eq(groupFolders.id, input.folderId));
          if (destGF) {
            destGroupFolderId = destGF.id;
            destOwnerId = null;
            destFolderId = null;
            const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, destGF.id);
            if (!hasAccess) throw new Error("Zugriff verweigert");
          }
        }
      }

      const existing = await ctx.db.select().from(files).where(
        and(
          eq(files.path, current.path), // Name doesn't change on move usually
          eq(files.isDeleted, false),
          destFolderId ? eq(files.folderId, destFolderId) : isNull(files.folderId),
          // If we are moving to Root (folderId arg null), we check owner root.
          input.folderId ? undefined : eq(files.ownerId, ctx.userId!),
          // Group Folder Root logic handles implicitly if input.folderId was mapped to Null but we have GF ID.
          // Logic in 'Move' implementation below sets input.folderId directly to files.folderId column.
          // If input.folderId IS a GF ID (virtual root), we technically should set files.folderId=NULL and files.groupFolderId=GFID.
          // BUT check logic first:
          // The original implementation just sets `folderId: input.folderId`.
          // It implies `input.folderId` refers to a row in `folders` table.
          // If user tries to move to a GroupFolder Root, the frontend might send GF ID.
          // If GF ID is not in `folders` table, FK constraint triggers?
          // YES. `files.folderId` refs `folders.id`.
          // So we cannot move to GF Root with `files.folderId = gfId`.
          // We must set `folderId = null` and `groupFolderId = gfId`.
          // The current implementation of `move` blindly sets `folderId: input.folderId`.
          // This suggests moving to Group Root is broken or handled upstream?
          // Assuming standard folder move.
        )
      );

      // Let's stick to simple duplicate check for the target `files.folderId`.
      // If we are strictly checking conflict in the DB column `files.folderId` with `input.folderId`.

      // If input.folderId is passed, we check duplicates there
      const existingInDest = await ctx.db.select().from(files).where(
        and(
          eq(files.path, current.path), // Name
          eq(files.isDeleted, false),
          destFolderId ? eq(files.folderId, destFolderId) : and(isNull(files.folderId), destGroupFolderId ? eq(files.groupFolderId, destGroupFolderId) : eq(files.ownerId, ctx.userId!))
        )
      );

      if (existingInDest.length > 0) {
        throw new Error("Eine Datei mit diesem Namen existiert bereits im Zielordner.");
      }

      if (current.groupFolderId && current.groupFolderId !== destGroupFolderId) {
        await recordChange(ctx.db, null, "file", current.id, "delete");
      }

      // Prepare update payload
      const updatePayload: any = {
        folderId: destFolderId,
        groupFolderId: destGroupFolderId ?? null,
        ownerId: destOwnerId,
        updatedAt: new Date()
      };

      // Only update storagePath for Vault files (normal files use chunks, storagePath must remain null)
      if (current.isVault && current.storagePath) {
        updatePayload.storagePath = `${ctx.userId!}/${newRelativePath}`;
      }

      const [row] = await ctx.db
        .update(files)
        .set(updatePayload)
        .where(eq(files.id, input.id))
        .returning();

      if (row) {
        // Only physically move Vault files (normal files are stored in chunks)
        if (row.isVault && current.storagePath) {
          await movePath(ctx.userId!, oldRelativePath, newRelativePath);
        }
        await updateDocument(INDEXES.FILES, {
          id: row.id,
          ownerId: row.ownerId,
          folderId: row.folderId,
          groupFolderId: row.groupFolderId,
          path: row.path,
          mime: row.mime,
          size: row.size,
          updatedAt: new Date().toISOString(),
          type: "file"
        });
        if (row.ownerId) {
          await ctx.db.execute(sql`UPDATE embeddings SET owner_id = ${row.ownerId} WHERE file_id = ${row.id}`);
        } else {
          await ctx.db.execute(sql`UPDATE embeddings SET owner_id = NULL WHERE file_id = ${row.id}`);
        }
        await recordChange(ctx.db, row.ownerId, "file", row.id, "move");
        // Log activity
        await logFileMove(ctx.userId!, row.path, row.id);
      }
      return row;
    }),

  copy: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string(), folderId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      // Get source file for logging
      const [srcFile] = await ctx.db.select().from(files).where(eq(files.id, input.id)).limit(1);
      if (!srcFile) throw new Error("Datei nicht gefunden");
      if (srcFile.ownerId && srcFile.ownerId !== ctx.userId) {
        throw new Error("Kein Zugriff");
      }
      if (!srcFile.ownerId && srcFile.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, srcFile.groupFolderId);
        if (!hasAccess) throw new Error("Kein Zugriff");
      }

      let destGroupFolderId: string | null = null;
      let destOwnerId: string | null = ctx.userId;
      let destFolderId: string | null = input.folderId ?? null;

      if (input.folderId) {
        const [destFolder] = await ctx.db.select().from(folders).where(eq(folders.id, input.folderId));
        if (destFolder) {
          if (destFolder.groupFolderId) {
            destGroupFolderId = destFolder.groupFolderId;
            destOwnerId = null;
            const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, destFolder.groupFolderId);
            if (!hasAccess) throw new Error("Zugriff verweigert");
          } else if (destFolder.ownerId !== ctx.userId) {
            throw new Error("Zugriff verweigert");
          }
        } else {
          const [destGF] = await ctx.db.select().from(groupFolders).where(eq(groupFolders.id, input.folderId));
          if (destGF) {
            destGroupFolderId = destGF.id;
            destOwnerId = null;
            destFolderId = null;
            const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, destGF.id);
            if (!hasAccess) throw new Error("Zugriff verweigert");
          }
        }
      }

      if (srcFile.isVault && destGroupFolderId) {
        throw new Error("Vault-Dateien können nicht in Gruppenordner kopiert werden.");
      }

      const { id: newId, versionId } = await cloneFileWithTags({
        db: ctx.db,
        ownerId: destOwnerId,
        groupFolderId: destGroupFolderId,
        srcId: input.id,
        targetFolderId: destFolderId
      });
      // Copy creates a new file, so record 'create'
      await recordChange(ctx.db, destOwnerId, "file", newId, "create", { versionId });

      // Log activity
      await logFileCopy(ctx.userId!, srcFile.path, newId);

      return { id: newId };
    }),
  restoreVersion: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const version = await getVersionById(input.versionId);
      if (!version) throw new Error("Version nicht gefunden");
      const [fileMeta] = await ctx.db.select().from(files).where(eq(files.id, version.fileId)).limit(1);
      if (!fileMeta) throw new Error("Datei nicht gefunden");
      if (fileMeta.isVault) throw new Error("Vault-Dateien unterstützen kein Restore");

      const buffer = await buildBufferFromVersion(version.id);
      const last = await getLatestVersion(version.fileId);
      const nextVersion = (last?.version ?? version.version) + 1;

      const versionRow = await decideAndSaveVersion({
        fileId: version.fileId,
        nextVersion,
        buffer,
        mime: version.mime,
        originalName: version.originalName ?? fileMeta.path
      });
      await enqueueThumbnailJob({
        fileId: version.fileId,
        versionId: versionRow.id,
        mime: version.mime
      });

      await ctx.db
        .update(files)
        .set({
          updatedAt: new Date(),
          size: version.size,
          mime: version.mime,
          hash: version.hash ?? null,
          storagePath: null,
          iv: null
        })
        .where(eq(files.id, version.fileId));

      await updateDocument(INDEXES.FILES, {
        id: version.fileId,
        ownerId: fileMeta?.ownerId ?? ctx.userId!,
        folderId: fileMeta?.folderId,
        groupFolderId: fileMeta?.groupFolderId,
        path: fileMeta?.path ?? version.originalName ?? "",
        mime: version.mime,
        size: version.size,
        updatedAt: new Date().toISOString(),
        type: "file"
      });

      await logAudit(
        ctx.db,
        ctx.userId!,
        "version_restore",
        `file=${version.fileId};version=${version.version}`
      );

      await recordChange(ctx.db, ctx.userId!, "file", version.fileId, "update", {
        versionId: versionRow.id,
        baseVersionId: versionRow.baseVersionId ?? null
      });

      // Log activity
      await logFileVersionRestore(ctx.userId!, fileMeta.path, version.version, version.fileId);

      return { success: true, versionId: versionRow.id };
    }),
  listShares: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ ctx, input }) =>
      ctx.db.select().from(shares).where(eq(shares.fileId, input.fileId))
    ),
  createShare: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        fileId: z.string(),
        expiresAt: z.string().optional(),
        password: z.string().min(3).max(64).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [file] = await ctx.db.select().from(files).where(eq(files.id, input.fileId)).limit(1);
      if (!file) throw new Error("Datei nicht gefunden");
      if (file.isVault) {
        throw new Error("Vault-Dateien können nicht geteilt werden.");
      }
      const token = randomBytes(12).toString("hex");
      const passwordHash = input.password
        ? await (await import("argon2")).default.hash(input.password)
        : null;
      const [row] = await ctx.db
        .insert(shares)
        .values({
          fileId: input.fileId,
          token,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          passwordHash
        })
        .returning();
      await logAudit(ctx.db, ctx.userId!, "share_created", `file=${input.fileId}`);
      return row;
    }),
  softDelete: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db.select().from(files).where(eq(files.id, input.fileId)).limit(1);
      if (!current) throw new Error("Datei nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Kein Zugriff");
      }
      if (!current.ownerId && current.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Kein Zugriff");
      }
      const [row] = await ctx.db
        .update(files)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(files.id, input.fileId))
        .returning();
      if (row) {
        await deleteThumbnailsForFile(row.id);
        await recordChange(ctx.db, row.ownerId, "file", row.id, "delete");
        // Log activity
        await logFileDelete(ctx.userId!, row.path);
      }
      return row;
    }),
  restore: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db.select().from(files).where(eq(files.id, input.fileId)).limit(1);
      if (!current) throw new Error("Datei nicht gefunden");
      if (current.ownerId && current.ownerId !== ctx.userId) {
        throw new Error("Kein Zugriff");
      }
      if (!current.ownerId && current.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, current.groupFolderId);
        if (!hasAccess) throw new Error("Kein Zugriff");
      }
      const [row] = await ctx.db
        .update(files)
        .set({ isDeleted: false, updatedAt: new Date() })
        .where(eq(files.id, input.fileId))
        .returning();
      if (row) {
        await recordChange(ctx.db, row.ownerId, "file", row.id, "create");
        // Log activity
        await logFileRestore(ctx.userId!, row.path, row.id);
      }
      return row;
    }),
  permanentDelete: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);

      if (!file) throw new Error("Datei nicht gefunden");
      if (file.ownerId && file.ownerId !== ctx.userId) {
        throw new Error("Kein Zugriff");
      }
      if (!file.ownerId && file.groupFolderId) {
        const hasAccess = await checkGroupFolderAccess(ctx.db, ctx.userId!, file.groupFolderId);
        if (!hasAccess) throw new Error("Kein Zugriff");
      }

      const versions = await ctx.db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId));
      const versionIds = versions.map(v => v.id);
      await releaseVersions(versionIds);

      // Delete from DB
      const [row] = await ctx.db
        .delete(files)
        .where(eq(files.id, input.fileId))
        .returning();

      if (row) {
        await deleteThumbnailsForFile(row.id);
        await deleteDocument(INDEXES.FILES, input.fileId, row.ownerId ?? ctx.userId);
        await logAudit(ctx.db, ctx.userId!, "file_permanent_delete", `file=${input.fileId}`);
        await recordChange(ctx.db, row.ownerId, "file", input.fileId, "delete");
        // Log activity
        await logFilePermanentDelete(ctx.userId!, row.path);
      }
      return row;
    })
});

export async function checkGroupFolderAccess(db: any, userId: string, groupFolderId: string) {
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
