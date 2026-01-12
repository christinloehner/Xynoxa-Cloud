/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { ensureVaultFolder } from "@/server/services/vault";
import { folders, files } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit } from "@/server/services/audit";

export const vaultRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const folder = await ensureVaultFolder(ctx.db, ctx.userId!);
    return {
      folderId: folder.id,
      hasEnvelope: !!(folder.envelopeCipher && folder.envelopeIv),
      envelopeCipher: folder.envelopeCipher,
      envelopeIv: folder.envelopeIv,
      envelopeSalt: folder.envelopeSalt
    };
  }),

  saveEnvelope: protectedProcedure
    .input(z.object({ cipher: z.string().min(16), iv: z.string().min(8), salt: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const folder = await ensureVaultFolder(ctx.db, ctx.userId!);
      const [updated] = await ctx.db
        .update(folders)
        .set({
          envelopeCipher: input.cipher,
          envelopeIv: input.iv,
          envelopeSalt: input.salt,
          isVault: true
        })
        .where(eq(folders.id, folder.id))
        .returning();
      await logAudit(ctx.db, ctx.userId!, "vault_envelope_saved", `folder=${updated.id}`);
      return { folderId: updated.id, hasEnvelope: true };
    }),

  items: protectedProcedure.query(async ({ ctx }) => {
    const vaultFiles = await ctx.db
      .select({
        id: files.id,
        name: files.path,
        size: files.size,
        iv: files.iv,
        updatedAt: files.updatedAt,
        originalName: files.originalName,
        mime: files.mime
      })
      .from(files)
      .where(and(eq(files.ownerId, ctx.userId!), eq(files.isVault, true)));

    const folder = await ensureVaultFolder(ctx.db, ctx.userId!);
    return { folderId: folder.id, files: vaultFiles };
  }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    // 1. Find all vault files to delete physically
    const vaultFiles = await ctx.db
      .select()
      .from(files)
      .where(and(eq(files.ownerId, ctx.userId!), eq(files.isVault, true)));

    const { deleteFile } = await import("@/server/services/storage");
    const { fileVersions } = await import("@/server/db/schema");

    for (const file of vaultFiles) {
      // Find versions
      const versions = await ctx.db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, file.id));

      const paths = new Set<string>();
      if (file.storagePath) paths.add(file.storagePath);
      versions.forEach(v => {
        if (v.storagePath) paths.add(v.storagePath);
      });

      for (const p of paths) {
        try { await deleteFile(p); } catch (e) { }
      }
    }

    // 2. Delete DB records
    // Deleting files triggers cascade to versions?
    // Schema: `files` -> `fileVersions` (Cascade). Yes.
    await ctx.db
      .delete(files)
      .where(and(eq(files.ownerId, ctx.userId!), eq(files.isVault, true)));

    // 3. Reset Vault Folder Envelope
    const folder = await ensureVaultFolder(ctx.db, ctx.userId!);
    await ctx.db
      .update(folders)
      .set({
        envelopeCipher: null,
        envelopeIv: null,
        envelopeSalt: null,
        isVault: true // bleibt als Vault-Ordner markiert, aber ohne Schlüssel; Status meldet setup nötig
      })
      .where(eq(folders.id, folder.id));

    await logAudit(ctx.db, ctx.userId!, "vault_reset", "Delete all vault data and reset keys");

    return { success: true };
  })
});
