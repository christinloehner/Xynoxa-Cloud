/*
 * Copyright (C) 2025 Christin Löhner
 */

import "server-only";

import { router, protectedProcedure } from "@/server/trpc";
import { notes, tags, entityTags } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { indexDocument, updateDocument, deleteDocument, INDEXES } from "@/server/services/search";
import { requireRole } from "@/server/middleware/rbac";
import { z } from "zod";
import { markdownToTxt } from "@/server/services/markdown";
import { upsertEmbedding, deleteEmbedding } from "@/server/services/embeddings";
import { ensureVaultFolder } from "@/server/services/vault";
import type { ModuleEntityType } from "@/server/module-router-registry";

export const entityTypes: Omit<ModuleEntityType, "moduleId">[] = [
  {
    name: "note",
    tableName: "notes",
    idColumn: "id",
    ownerIdColumn: "owner_id",
    shareFkColumn: "noteId",
    embeddingFkColumn: "note_id",
    entityTagFkColumn: "noteId",
    searchIndexName: "notes",
    displayName: "Notiz",
    hasVaultField: true,
    shareable: true,
    getShareUrl: (entityId: string) => `/notes?open=${entityId}`
  }
];

const notesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(notes).where(eq(notes.ownerId, ctx.userId!));
    const notesWithTags = await Promise.all(
      rows.map(async (note) => {
        const noteTags = await ctx.db
          .select({ id: tags.id, name: tags.name })
          .from(entityTags)
          .innerJoin(tags, eq(entityTags.tagId, tags.id))
          .where(and(eq(entityTags.entityType, "note"), eq(entityTags.entityId, note.id)));
        return { ...note, tags: noteTags };
      })
    );
    return notesWithTags;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [note] = await ctx.db
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.id), eq(notes.ownerId, ctx.userId!)))
        .limit(1);
      if (!note) throw new Error("Note not found");

      const noteTags = await ctx.db
        .select({ id: tags.id, name: tags.name })
        .from(entityTags)
        .innerJoin(tags, eq(entityTags.tagId, tags.id))
        .where(and(eq(entityTags.entityType, "note"), eq(entityTags.entityId, note.id)));

      return { ...note, tags: noteTags };
    }),

  create: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        title: z.string().min(1),
        content: z.string().default(""),
        ciphertext: z.string().optional(),
        iv: z.string().optional(),
        isVault: z.boolean().optional(),
        tags: z.array(z.string()).default([])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isVault = input.isVault ?? false;
      if (isVault && (!input.ciphertext || !input.iv)) {
        throw new Error("Vault-Notizen benötigen ciphertext und iv.");
      }
      const vaultFolderId = isVault ? (await ensureVaultFolder(ctx.db, ctx.userId!)).id : null;
      const now = new Date();
      const [row] = await ctx.db
        .insert(notes)
        .values({
          ownerId: ctx.userId!,
          folderId: isVault ? vaultFolderId : null,
          title: input.title,
          content: isVault ? "" : input.content,
          ciphertext: input.ciphertext,
          iv: input.iv,
          isVault,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      for (const tagName of input.tags) {
        if (!tagName.trim()) continue;

        let [tag] = await ctx.db
          .select()
          .from(tags)
          .where(and(eq(tags.name, tagName), eq(tags.ownerId, ctx.userId!)))
          .limit(1);

        if (!tag) {
          [tag] = await ctx.db
            .insert(tags)
            .values({ name: tagName, ownerId: ctx.userId! })
            .returning();
        }

        await ctx.db
          .insert(entityTags)
          .values({ tagId: tag.id, entityId: row.id, entityType: "note", noteId: row.id });
      }

      if (!isVault) {
        await indexDocument(INDEXES.NOTES, {
          id: row.id,
          ownerId: ctx.userId!,
          title: row.title,
          content: row.content,
          tags: input.tags,
          createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
          type: "note"
        });
        await upsertEmbedding({
          db: ctx.db,
          ownerId: ctx.userId!,
          entity: "note",
          entityId: row.id,
          title: row.title,
          text: markdownToTxt(row.content ?? "")
        });
      }

      return row;
    }),

  update: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        content: z.string().optional(),
        ciphertext: z.string().optional(),
        iv: z.string().optional(),
        isVault: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        autosave: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isVault = input.isVault;
      if (isVault && (!input.ciphertext || !input.iv)) {
        throw new Error("Vault-Notizen benötigen ciphertext und iv.");
      }
      const vaultFolderId = isVault ? (await ensureVaultFolder(ctx.db, ctx.userId!)).id : undefined;
      const [updated] = await ctx.db
        .update(notes)
        .set({
          title: input.title,
          content: isVault ? "" : input.content,
          ciphertext: input.ciphertext,
          iv: input.iv,
          isVault: isVault ?? undefined,
          folderId: isVault ? vaultFolderId : input.isVault === false ? null : undefined,
          updatedAt: new Date()
        })
        .where(and(eq(notes.id, input.id), eq(notes.ownerId, ctx.userId!)))
        .returning();

      if (!updated) throw new Error("Note not found");

      if (input.tags) {
        await ctx.db
          .delete(entityTags)
          .where(and(eq(entityTags.entityType, "note"), eq(entityTags.entityId, input.id)));

        for (const tagName of input.tags) {
          if (!tagName.trim()) continue;

          let [tag] = await ctx.db
            .select()
            .from(tags)
            .where(and(eq(tags.name, tagName), eq(tags.ownerId, ctx.userId!)))
            .limit(1);

          if (!tag) {
            [tag] = await ctx.db
              .insert(tags)
              .values({ name: tagName, ownerId: ctx.userId! })
              .returning();
          }

          await ctx.db
            .insert(entityTags)
            .values({ tagId: tag.id, entityId: updated.id, entityType: "note", noteId: updated.id });
        }
      }

      if (!updated.isVault) {
        await updateDocument(INDEXES.NOTES, {
          id: updated.id,
          ownerId: ctx.userId!,
          title: updated.title,
          content: updated.content,
          tags: input.tags ?? [],
          updatedAt: new Date().toISOString(),
          type: "note"
        });
        await upsertEmbedding({
          db: ctx.db,
          ownerId: ctx.userId!,
          entity: "note",
          entityId: updated.id,
          title: updated.title,
          text: markdownToTxt(updated.content ?? "")
        });
      } else {
        await deleteDocument(INDEXES.NOTES, updated.id);
        await deleteEmbedding({ db: ctx.db, entity: "note", entityId: updated.id });
      }

      return updated;
    }),

  delete: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(notes)
        .where(and(eq(notes.id, input.id), eq(notes.ownerId, ctx.userId!)));
      await deleteEmbedding({ db: ctx.db, entity: "note", entityId: input.id });
      await deleteDocument(INDEXES.NOTES, input.id);
      return { success: true };
    }),

  export: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [note] = await ctx.db
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.id), eq(notes.ownerId, ctx.userId!)))
        .limit(1);
      if (!note) throw new Error("Note not found");
      if (note.isVault) throw new Error("Vault-Notizen können nicht exportiert werden.");
      const markdown = `# ${note.title}\n\n${markdownToTxt(note.content)}`;
      return { markdown };
    }),

  summary: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [note] = await ctx.db
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.id), eq(notes.ownerId, ctx.userId!)))
        .limit(1);
      if (!note) throw new Error("Note not found");
      if (note.isVault) throw new Error("Vault-Notizen können nicht zusammengefasst werden.");
      const plain = markdownToTxt(note.content ?? "");
      const sentences = plain.split(/(?<=[.!?])\s+/).filter(Boolean);
      const joined = sentences.slice(0, 3).join(" ") || plain;
      const summary = joined.length > 320 ? `${joined.slice(0, 320)}…` : joined;
      return { summary };
    })
});

export default notesRouter;
