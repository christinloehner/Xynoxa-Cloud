/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db as defaultDb } from "../db";
import { groupFolderAccess, groupMembers } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Liefert alle Gruppenordner-IDs, auf die der User Zugriff hat.
 */
export async function getAccessibleGroupFolderIds(userId: string, db = defaultDb): Promise<string[]> {
  const rows = await db
    .select({ groupFolderId: groupFolderAccess.groupFolderId })
    .from(groupFolderAccess)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
    .where(eq(groupMembers.userId, userId));

  return Array.from(new Set(rows.map((r) => r.groupFolderId)));
}
