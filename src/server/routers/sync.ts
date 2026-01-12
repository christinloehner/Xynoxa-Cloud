/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { syncJournal, files, folders } from "@/server/db/schema";
import { and, eq, gt, asc, or } from "drizzle-orm";
import { resolveFolderPath } from "@/server/services/folder-paths";

export const syncRouter = router({
    pull: protectedProcedure
        .input(z.object({
            cursor: z.number().optional(), // Cursor is now sync_journal.id (BigInt as number safe up to 2^53)
        }))
        .query(async ({ ctx, input }) => {
            const cursor = input.cursor ?? 0;

            console.log(`Sync pull (Journal) for user ${ctx.userId} since cursor ${cursor}`);

            const events = await ctx.db
                .select()
                .from(syncJournal)
                .where(
                    and(
                        eq(syncJournal.ownerId, ctx.userId!),
                        gt(syncJournal.id, cursor)
                    )
                )
                .orderBy(asc(syncJournal.id)) // Ensure order
                .limit(100); // Pagination limit


            // Enrich events with current state if "active" (not deleted)
            const fileIds = events.filter(e => e.entityType === "file" && e.action !== "delete").map(e => e.entityId);
            const folderIds = events.filter(e => e.entityType === "folder" && e.action !== "delete").map(e => e.entityId);
            const groupFolderIds = events.filter(e => e.entityType === "group_folder" && e.action !== "delete").map(e => e.entityId);

            let fileMap = new Map();
            let folderMap = new Map();

            // Use inArray for better performance/readability
            const { inArray } = await import("drizzle-orm");
            const { groupFolders } = await import("@/server/db/schema");

            if (fileIds.length > 0) {
                // Removed ownerId filter to support files in Group Folders (ownerId is null)
                // Access is guaranteed because the User received the Journal Event.
                const fileRows = await ctx.db.select().from(files).where(inArray(files.id, fileIds));
                fileRows.forEach(f => fileMap.set(f.id, f));
            }

            if (folderIds.length > 0) {
                // 1. Try finding regular folders
                // Removed ownerId filter
                const folderRows = await ctx.db.select().from(folders).where(inArray(folders.id, folderIds));
                folderRows.forEach(f => folderMap.set(f.id, f));

                // 2. Find IDs that were NOT specific folders (potentially Group Folders)
                const foundIds = new Set(folderRows.map(f => f.id));
                const missingIds = folderIds.filter(id => !foundIds.has(id));

                if (missingIds.length > 0) {
                    const groupRows = await ctx.db.select().from(groupFolders).where(inArray(groupFolders.id, missingIds));
                    groupRows.forEach(gf => {
                        // Map Group Folder to match "Folder" shape for Client
                        folderMap.set(gf.id, {
                            id: gf.id,
                            name: gf.name,
                            ownerId: null, // Group owned
                            groupFolderId: gf.id, // Reference to self as group context
                            parentId: null, // Roots
                            isVault: false,
                            createdAt: gf.createdAt,
                            updatedAt: gf.createdAt // GF has no updatedAt in schema currently? Use createdAt.
                        });
                    });
                }
            }

            // Load group_folder entities
            if (groupFolderIds.length > 0) {
                const groupRows = await ctx.db.select().from(groupFolders).where(inArray(groupFolders.id, groupFolderIds));
                groupRows.forEach(gf => {
                    folderMap.set(gf.id, {
                        id: gf.id,
                        name: gf.name,
                        ownerId: null,
                        groupFolderId: gf.id, // Self-reference for group context
                        parentId: null,
                        isVault: false,
                        createdAt: gf.createdAt,
                        updatedAt: gf.createdAt
                    });
                });
            }

            const enrichedEvents = await Promise.all(events.map(async event => {
                let payload = null;
                
                if (event.action !== "delete") {
                    if (event.entityType === "file") {
                        const file = fileMap.get(event.entityId);
                        if (file) {
                            // Extract filename from DB path field
                            const fileName = file.path.split("/").pop() || file.path;
                            // Resolve folder path - use folderId, or fall back to groupFolderId for files at group folder root
                            const parentId = file.folderId || file.groupFolderId || null;
                            const folderPath = await resolveFolderPath(ctx.userId!, parentId);
                            const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
                            payload = { ...file, name: fileName, path: fullPath };
                        }
                    }
                    if (event.entityType === "folder" || event.entityType === "group_folder") {
                        const folder = folderMap.get(event.entityId);
                        if (folder) {
                            // Resolve full folder path (including the folder itself)
                            let fullPath: string;
                            if (event.entityType === "group_folder") {
                                // Group folders are always at root level, path is just the name
                                fullPath = folder.name;
                            } else {
                                // Regular folders: use parentId, or fall back to groupFolderId for folders at group folder root
                                const parentId = folder.parentId || folder.groupFolderId || null;
                                const parentPath = await resolveFolderPath(ctx.userId!, parentId);
                                fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
                            }
                            payload = { ...folder, path: fullPath };
                        }
                    }
                }
                
                return {
                    ...event,
                    id: Number(event.id), // Convert BigInt to Number for JSON
                    versionId: event.versionId ?? null,
                    baseVersionId: event.baseVersionId ?? null,
                    data: payload // Attach current state (Hash, Name, Path, etc.)
                };
            }));

            // If no events, nextCursor is same as input. If events, it's the last ID.
            const lastEvent = events[events.length - 1];
            const nextCursor = lastEvent ? Number(lastEvent.id) : cursor;

            return {
                events: enrichedEvents,
                nextCursor
            };
        })
});
