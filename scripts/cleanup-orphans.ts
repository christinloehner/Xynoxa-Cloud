/*
 * Copyright (C) 2025 Christin Löhner
 */


import { db } from "./src/server/db";
import { folders } from "./src/server/db/schema";
import { inArray, eq } from "drizzle-orm";
import { deletePath } from "./src/server/services/storage";
import { resolveFolderPath } from "./src/server/services/folder-paths";

async function cleanup() {
    const targetNames = ["test1", "test2", "test3", "test5"];

    const targets = await db
        .select()
        .from(folders)
        .where(inArray(folders.name, targetNames));

    console.log(`Found ${targets.length} folders to delete.`);

    for (const folder of targets) {
        console.log(`Deleting folder: ${folder.name} (${folder.id})`);

        // Delete from DB
        await db.delete(folders).where(eq(folders.id, folder.id));

        // Resolve path and delete from FS only if ownerId is present
        if (folder.ownerId) {
            const parentPath = await resolveFolderPath(folder.ownerId, folder.parentId);
            const relativePath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

            // Delete from FS
            // We import deletePath but need to make sure we have correct context or just use fs directly if easier?
            // Using the service ensures consistency.
            try {
                await deletePath(folder.ownerId, relativePath);
                console.log(`  - FS deleted: ${relativePath}`);
            } catch (e) {
                console.error(`  - FS delete failed for ${relativePath}:`, e);
            }
        } else {
            console.log(`  - Skipping FS deletion for folder ${folder.name} due to null ownerId.`);
        }
    }
    process.exit(0);
}

cleanup().catch(console.error);
