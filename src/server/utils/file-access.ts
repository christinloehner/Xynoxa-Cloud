/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "@/server/db";
import { files, folders, groupFolderAccess, groupMembers } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

export async function checkFileAccess(userId: string, fileId: string): Promise<boolean> {
    const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

    if (!file) {
        return false;
    }

    let hasAccess = false;
    if (file.ownerId === userId) {
        hasAccess = true;
    } else {
        let effectiveGroupFolderId = file.groupFolderId;

        if (!effectiveGroupFolderId && file.folderId) {
            const [parent] = await db.select({ groupFolderId: folders.groupFolderId })
                .from(folders)
                .where(eq(folders.id, file.folderId))
                .limit(1);
            if (parent?.groupFolderId) {
                effectiveGroupFolderId = parent.groupFolderId;
            }
        }

        if (effectiveGroupFolderId) {
            const [access] = await db.select({ id: groupFolderAccess.id })
                .from(groupFolderAccess)
                .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
                .where(and(
                    eq(groupFolderAccess.groupFolderId, effectiveGroupFolderId),
                    eq(groupMembers.userId, userId)
                ))
                .limit(1);
            if (access) hasAccess = true;
        }
    }
    return hasAccess;
}
