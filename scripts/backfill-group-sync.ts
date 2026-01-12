/*
 * Copyright (C) 2025 Christin Löhner
 */


import { db } from "./server/db";
import { files, folders, groupFolders, groupFolderAccess, groupMembers, syncJournal } from "./server/db/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
    console.warn("Starting Group Folder Sync Backfill...");

    // 1. Get all Group Folders
    const allGroupFolders = await db.select().from(groupFolders);
    console.warn(`Found ${allGroupFolders.length} group folders.`);

    for (const gf of allGroupFolders) {
        console.warn(`Processing Group Folder: ${gf.name} (${gf.id})`);

        // 2. Find Members
        const accessRows = await db.select({ groupId: groupFolderAccess.groupId })
            .from(groupFolderAccess)
            .where(eq(groupFolderAccess.groupFolderId, gf.id));

        if (accessRows.length === 0) {
            console.warn(` - No groups have access. Skipping.`);
            continue;
        }

        const groupIds = accessRows.map(a => a.groupId);
        const members = await db.select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(inArray(groupMembers.groupId, groupIds));

        const uniqueUserIds = Array.from(new Set(members.map(m => m.userId)));
        console.warn(` - Found ${uniqueUserIds.length} members.`);

        if (uniqueUserIds.length === 0) continue;

        // 3. Find Contents
        const gfFiles = await db.select({ id: files.id }).from(files).where(and(eq(files.groupFolderId, gf.id), eq(files.isDeleted, false)));
        const gfFolders = await db.select({ id: folders.id }).from(folders).where(eq(folders.groupFolderId, gf.id));

        console.warn(` - Contents: ${gfFiles.length} files, ${gfFolders.length} sub-folders.`);

        // 4. Create Events for Members
        // Event for GF itself (as folder)
        const eventsToInsert = [];

        for (const userId of uniqueUserIds) {
            // GF Entry
            eventsToInsert.push({
                ownerId: userId,
                entityType: "folder",
                entityId: gf.id,
                action: "create"
            });

            // Files
            for (const f of gfFiles) {
                eventsToInsert.push({
                    ownerId: userId,
                    entityType: "file",
                    entityId: f.id,
                    action: "create"
                });
            }

            // Sub-Folders
            for (const f of gfFolders) {
                eventsToInsert.push({
                    ownerId: userId,
                    entityType: "folder",
                    entityId: f.id,
                    action: "create"
                });
            }
        }

        // Bulk insert chunks
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < eventsToInsert.length; i += CHUNK_SIZE) {
            const chunk = eventsToInsert.slice(i, i + CHUNK_SIZE);
            await db.insert(syncJournal).values(chunk);
        }
        console.warn(` - Inserted ${eventsToInsert.length} journal events.`);
    }

    console.warn("Backfill complete.");
}

// Helper for 'and' since I didn't import it in top level destructure above
import { and } from "drizzle-orm";

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
