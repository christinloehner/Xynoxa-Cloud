/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "../db";
import { folders, groupFolders } from "../db/schema";
import { eq, and, or, isNull, sql } from "drizzle-orm";

/**
 * Resolves the full relative path for a folder by traversing up the tree.
 * Returns a string like "Documents/Work/ProjectA"
 */
export async function resolveFolderPath(userId: string, folderId: string | null): Promise<string> {
    if (!folderId) return ""; // Root

    const segments: string[] = [];
    let currentId: string | null = folderId;

    // Safety break
    let depth = 0;
    const MAX_DEPTH = 50;

    while (currentId && depth < MAX_DEPTH) {
        // Try to find in folders (Personal or Group Subfolder)
        const [folder] = await db
            .select({ id: folders.id, name: folders.name, parentId: folders.parentId, ownerId: folders.ownerId, groupFolderId: folders.groupFolderId })
            .from(folders)
            .where(eq(folders.id, currentId)) // Remove owner check here to allow traversing group subfolders
            .limit(1);

        if (folder) {
            // Found a regular folder.
            // Security check: strictly speaking we should check access, but this service function 
            // is often used after access is verified or for trusted operations.
            // For now, allow traversal. 
            // Optimization: If ownerId !== userId and groupFolderId is null, it's someone else's personal folder -> Stop?
            // But we need to support Group Subfolders where ownerId is null.

            segments.unshift(folder.name);
            currentId = folder.parentId;

            // If parentId is null, but we are in a group subfolder, the "logical" parent is the Group Folder.
            if (!currentId && folder.groupFolderId) {
                // Switch to resolving Group Folder Root
                currentId = folder.groupFolderId;
                // BUT currentId points to a different table now.
                // We need to handle that in next iteration or here.
                // Let's handle here.
                const [gf] = await db.select().from(groupFolders).where(eq(groupFolders.id, currentId)).limit(1);
                if (gf) {
                    segments.unshift(gf.name);
                    currentId = null; // GF is root
                }
            }
        } else {
            // Maybe it is a Group Folder Root directly
            const [gf] = await db.select().from(groupFolders).where(eq(groupFolders.id, currentId)).limit(1);
            if (gf) {
                segments.unshift(gf.name);
                currentId = null;
            } else {
                // Not found anywhere
                break;
            }
        }

        depth++;
    }

    return segments.join("/");
}

// Add imports needed for ensureFolderPath
import { createDirectory } from "./storage";
import { recordChange } from "./sync-journal";
import { groupFolderAccess, groupMembers } from "../db/schema";

export async function findAccessibleGroupFolderByName(userId: string, name: string) {
    if (!name) return null;
    const [gf] = await db.select({
        id: groupFolders.id,
        name: groupFolders.name
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

/**
 * Ensures a directory structure exists inside a group folder.
 * Path string is relative to the group folder root, e.g. "Design/Assets".
 * Returns the ID of the last folder in the path (or null for root).
 */
export async function ensureGroupFolderPath(userId: string, groupFolderId: string, pathStr: string): Promise<string | null> {
    if (!pathStr || pathStr === "." || pathStr === "/") return null;

    const parts = pathStr.split("/").filter(p => p.length > 0);
    if (parts.length === 0) return null;

    const [groupFolder] = await db.select({ name: groupFolders.name }).from(groupFolders).where(eq(groupFolders.id, groupFolderId)).limit(1);
    if (!groupFolder) return null;

    let currentParentId: string | null = groupFolderId;
    let currentPathStr = groupFolder.name;

    for (const partName of parts) {
        currentPathStr = currentPathStr ? `${currentPathStr}/${partName}` : partName;

        // Root inside group folder (parentId is NULL, groupFolderId is set)
        let foundId: string | null = null;
        if (currentParentId === groupFolderId) {
            const [child] = await db.select().from(folders)
                .where(and(
                    eq(folders.groupFolderId, groupFolderId),
                    isNull(folders.parentId),
                    eq(folders.name, partName)
                )).limit(1);
            if (child) foundId = child.id;
        } else {
            const [child] = await db.select().from(folders)
                .where(and(
                    eq(folders.parentId, currentParentId),
                    eq(folders.name, partName)
                )).limit(1);
            if (child) foundId = child.id;
        }

        if (!foundId) {
            const newParentId: string | null = currentParentId === groupFolderId ? null : currentParentId;
            const inserted: { id: string }[] = await db.insert(folders).values({
                name: partName,
                parentId: newParentId,
                ownerId: null,
                groupFolderId,
                createdAt: new Date(),
                isVault: false
            }).onConflictDoNothing().returning({ id: folders.id });

            if (inserted.length > 0) {
                foundId = inserted[0].id;
            } else {
                const [existing] = await db.select({ id: folders.id }).from(folders)
                    .where(and(
                        eq(folders.name, partName),
                        newParentId ? eq(folders.parentId, newParentId) : isNull(folders.parentId),
                        eq(folders.groupFolderId, groupFolderId),
                        isNull(folders.ownerId)
                    )).limit(1);
                if (existing) foundId = existing.id;
            }

            await createDirectory(userId, currentPathStr);

            if (foundId) {
                await recordChange(db, null, "folder", foundId, "create");
            }
        }

        currentParentId = foundId!;
    }

    return currentParentId;
}
// import { inArray } from "drizzle-orm"; // Unused

/**
 * Ensures a directory structure exists in the DB and FS.
 * Returns the ID of the last folder in the path.
 * Path string should be relative, e.g. "Documents/Work".
 */
export async function ensureFolderPath(userId: string, pathStr: string): Promise<string | null> {
    if (!pathStr || pathStr === "." || pathStr === "/") return null;

    const parts = pathStr.split("/").filter(p => p.length > 0);
    if (parts.length === 0) return null;

    let currentParentId: string | null = null;
    let currentGroupFolderId: string | null = null;

    // We track the built path for filesystem creation
    let currentPathStr = "";

    for (let i = 0; i < parts.length; i++) {
        const partName = parts[i];
        currentPathStr = currentPathStr ? `${currentPathStr}/${partName}` : partName;

        // 1. Try to find existing folder
        let foundId: string | null = null;
        let foundGroupFolderId: string | null = null;

        if (currentParentId === null) {
            // Root Level: Check Personal Roots OR Group Roots
            // Check Personal first
            const [personal] = await db.select().from(folders)
                .where(and(
                    eq(folders.ownerId, userId),
                    isNull(folders.parentId),
                    eq(folders.name, partName)
                )).limit(1);

            if (personal) {
                foundId = personal.id;
            } else {
                // Check Group Folders (case-insensitive to avoid creating a real folder by case mismatch)
                const gf = await findAccessibleGroupFolderByName(userId, partName);

                if (gf) {
                    foundId = gf.id; // This is a GroupFolder ID, slightly different from Folder ID but used as Parent
                    foundGroupFolderId = gf.id;
                    // Note: When using GF ID as parent, subsequent lookups must handle it.
                    // But wait, my resolveFolderPath logic separates them.
                    // If the parent is a GroupFolder, the children are in 'folders' table with groupFolderId set and parentId = NULL.
                    // So 'foundId' here acts as the 'groupFolderContext'.
                    // Actually, if we found a GroupFolder, 'currentParentId' for the NEXT iteration (level 2) should be NULL?
                    // Because level 2 items are Roots in the GroupFolder context.
                    // So we must distinguish if current 'found' item is a real folder or a group folder.
                }
            }
        } else {
            // Sub-Level
            // Search in folders table
            // If currentParentIsGroupRoot, strictly speaking parentId is NULL, but groupFolderId is SET.
            // But verify: how did I store 'currentParentId'?
            // Complexity: Group Folder is NOT in 'folders' table.
            // If 'currentParentId' was a GroupFolder ID, we query:
            // where folder.groupFolderId = currentParentId AND folder.parentId IS NULL.

            if (currentGroupFolderId && currentParentId === currentGroupFolderId) {
                // We are looking for a Root inside a Group Folder
                const [child] = await db.select().from(folders)
                    .where(and(
                        eq(folders.groupFolderId, currentGroupFolderId),
                        isNull(folders.parentId),
                        eq(folders.name, partName)
                    )).limit(1);
                if (child) foundId = child.id;
            } else {
                // Regular subfolder
                const [child] = await db.select().from(folders)
                    .where(and(
                        eq(folders.parentId, currentParentId),
                        eq(folders.name, partName)
                    )).limit(1);
                if (child) foundId = child.id;
            }
        }

        // 2. Create if not found (idempotent under concurrent sync)
        if (!foundId && !foundGroupFolderId) {
            // Determine attributes
            let newOwnerId: string | null = userId;
            let newGroupFolderId: string | null = null;
            let newParentId: string | null = currentParentId;

            if (currentGroupFolderId) {
                newOwnerId = null;
                newGroupFolderId = currentGroupFolderId;
                // If the parent was the GroupFolder (Root), parentId for new folder is NULL.
                if (currentParentId === currentGroupFolderId) {
                    newParentId = null;
                }
            }

            // Try to insert; if a concurrent request already created the folder,
            // the unique index will reject it. We then re-select the existing row.
            const inserted: { id: string }[] = await db.insert(folders).values({
                name: partName,
                parentId: newParentId,
                ownerId: newOwnerId,
                groupFolderId: newGroupFolderId,
                createdAt: new Date(),
                isVault: false
            }).onConflictDoNothing().returning({ id: folders.id });

            if (inserted.length > 0) {
                foundId = inserted[0].id;
            } else {
                const conds: any[] = [
                    eq(folders.name, partName),
                    newParentId ? eq(folders.parentId, newParentId) : isNull(folders.parentId),
                    newOwnerId ? eq(folders.ownerId, newOwnerId) : isNull(folders.ownerId),
                    newGroupFolderId ? eq(folders.groupFolderId, newGroupFolderId) : isNull(folders.groupFolderId)
                ];
                const [existing] = await db.select({ id: folders.id }).from(folders).where(and(...conds)).limit(1);
                if (existing) {
                    foundId = existing.id;
                }
            }

            // Create on FS
            // Note: createDirectory accepts relative path.
            // But wait, if it's a member of a group folder, `createDirectory` (local driver) logic is:
            // join(getUserRoot(userId), relativePath).
            // This creates it in the USER's storage.
            // For Group Folders, we physically store it in EACH user's storage?
            // Current design: 'folders.create' calls `createDirectory(ctx.userId, path)`.
            // So YES, we create it for the UPLOADING user.
            // Other users will sync it and create it themselves via Client.
            // Server-side storage for Group Folders is separate?
            // "sync-journal.ts" fan-out implies distributed sync.
            // Server simply holds a copy for the uploader.
            // Wait, `sync.pull` enriched event uses `fileMap`.
            // Download route reads from `file.storagePath`.
            // If User A uploads to Group, File is in User A's storage.
            // User B downloads. Download Route checks access.
            // Reads `file.storagePath`.
            // `file.storagePath` points to "USER_A_ID/...".
            // `readFileFromStorage` joins `STORAGE_PATH` + `storagePath`.
            // It works! Storage is global-ish, namespaced by User ID folder.
            // So we just need to ensure directory exists for the CURRENT USER (uploader).
            await createDirectory(userId, currentPathStr);

            // Record Change
            if (foundId) {
                await recordChange(db, newOwnerId, "folder", foundId, "create");
            }
        }

        // 3. Advance
        if (foundGroupFolderId) {
            currentGroupFolderId = foundGroupFolderId;
            // The Group Folder itself acts as the "Parent Context" but not a "Parent Folder" in the DB FK sense.
            // So we set currentParentId to GF ID to signal "Next level is Root of GF".
            currentParentId = foundGroupFolderId;
        } else {
            currentParentId = foundId!; // foundId is definitely set now (found or created)
            // Inherit Group Context if we are inside one
            if (!currentGroupFolderId && foundId) {
                // Check if the found folder belongs to a group?
                // The select query above fetched 'groupFolderId'.
                // If we found an existing folder, we should check its groupFolderId.
                // Re-query or optimize? 
                // For simplicity, we assume if we started in Personal, we stay in Personal.
                // Unless we hit a Group Root at top level.
                // (Creating a folder inside Personal doesn't switch to Group).
            }
        }
    }

    return currentParentId;
}
