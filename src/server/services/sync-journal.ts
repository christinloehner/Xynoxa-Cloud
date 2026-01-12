/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "../db";
import { syncJournal } from "../db/schema";

type JournalAction = "create" | "update" | "move" | "delete";
type EntityType = "file" | "folder" | "group_folder";

/**
 * Records a change in the sync journal.
 * This should be called whenever a file or folder is modified.
 * Ideally, this should be part of the transaction where the change happens.
 */
export async function recordChange(
    tx: typeof db, // Allow passing a transaction object
    ownerId: string | null,
    entityType: EntityType,
    entityId: string,
    action: JournalAction,
    opts?: { versionId?: string | null; baseVersionId?: string | null }
) {
    const versionId = opts?.versionId ?? null;
    const baseVersionId = opts?.baseVersionId ?? null;

    // 1. Personal File/Folder (ownerId present)
    if (ownerId) {
        await tx.insert(syncJournal).values({
            ownerId,
            entityType,
            entityId,
            action,
            versionId,
            baseVersionId
        });
        return;
    }

    // 2. Group Context (ownerId is null)
    // We need to resolve the Group Folder ID to find the Group and its Members.
    const { files, folders, groupFolders, groupMembers } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");

    let groupFolderId: string | null = null;

    if (entityType === "file") {
        const [file] = await tx.select({ groupFolderId: files.groupFolderId, folderId: files.folderId }).from(files).where(eq(files.id, entityId));
        if (file) {
            if (file.groupFolderId) {
                groupFolderId = file.groupFolderId;
            } else if (file.folderId) {
                // Check if parent folder describes the group context
                const [parent] = await tx.select({ groupFolderId: folders.groupFolderId }).from(folders).where(eq(folders.id, file.folderId));
                if (parent?.groupFolderId) {
                    groupFolderId = parent.groupFolderId;
                }
            }
        }
    } else if (entityType === "folder") {
        const [folder] = await tx.select({ groupFolderId: folders.groupFolderId }).from(folders).where(eq(folders.id, entityId));
        if (folder) groupFolderId = folder.groupFolderId;
    } else if (entityType === "group_folder") {
        // For group_folder, entityId IS the groupFolderId
        groupFolderId = entityId;
    }

    if (!groupFolderId) {
        console.warn(`SyncJournal: Skipping record for ${entityType} ${entityId} because ownerId is missing and no groupFolderId could be resolved.`);
        return;
    }


    // 3. Fan-Out to Group Members
    const { groupFolderAccess } = await import("../db/schema");

    // Find all Groups that have access to this Group Folder
    const accessRows = await tx.select({ groupId: groupFolderAccess.groupId })
        .from(groupFolderAccess)
        .where(eq(groupFolderAccess.groupFolderId, groupFolderId));

    if (accessRows.length === 0) {
        console.warn(`SyncJournal: No groups have access to Group Folder ${groupFolderId}.`);
        return;
    }

    const groupIds = accessRows.map(a => a.groupId);

    // Find all members of these groups
    // Use 'inArray'
    const { inArray } = await import("drizzle-orm");
    const members = await tx.select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(inArray(groupMembers.groupId, groupIds));

    if (members.length === 0) return;

    // Batch insert for unique users (deduplicate if user checks multiple groups)
    const uniqueUserIds = Array.from(new Set(members.map(m => m.userId)));

    await tx.insert(syncJournal).values(
        uniqueUserIds.map(uid => ({
            ownerId: uid,
            entityType,
            entityId,
            action,
            versionId,
            baseVersionId
        }))
    );
}
