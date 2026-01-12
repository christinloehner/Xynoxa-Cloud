/*
 * Copyright (C) 2025 Christin Löhner
 */

import { folders } from "../db/schema";
import { and, eq } from "drizzle-orm";
import type { DB } from "../db";

/**
 * Ensure a dedicated vault folder exists for the user. Returns the folder row.
 */
export async function ensureVaultFolder(db: DB, ownerId: string) {
  const [existing] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.ownerId, ownerId), eq(folders.isVault, true)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(folders)
    .values({ ownerId, name: "Vault", isVault: true })
    .returning();

  return created;
}

export async function getVaultFolder(db: DB, ownerId: string) {
  const [existing] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.ownerId, ownerId), eq(folders.isVault, true)))
    .limit(1);
  return existing ?? null;
}
