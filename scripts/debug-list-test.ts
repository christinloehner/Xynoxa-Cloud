/*
 * Copyright (C) 2025 Christin Löhner
 */


import { db } from "./server/db";
import { files, folders } from "./server/db/schema";
import { eq, and, isNull } from "drizzle-orm";

async function main() {
    try {
        console.log("Checking folder 'test1'...");
        const [test1] = await db.select().from(folders).where(eq(folders.name, "test1"));

        if (!test1) {
            console.log("Folder 'test1' not found!");
            return;
        }

        console.log(`Folder 'test1' found. ID: ${test1.id}. Owner: ${test1.ownerId}`);

        console.log("Listing files in 'test1' using Drizzle...");
        const filesInFolder = await db
            .select({ id: files.id, name: files.path, folderId: files.folderId })
            .from(files)
            .where(
                and(
                    eq(files.folderId, test1.id),
                    eq(files.isDeleted, false)
                )
            );

        console.log(`Found ${filesInFolder.length} files in 'test1':`);
        filesInFolder.forEach(f => console.log(` - ${f.name} (ID: ${f.id})`));

        console.log("\nChecking 'xynoxa-logo-dark.png' specifically...");
        const [logo] = await db
            .select({ id: files.id, name: files.path, folderId: files.folderId })
            .from(files)
            .where(eq(files.path, "xynoxa-logo-dark.png")); // Note: files.path stores filename usually

        if (logo) {
            console.log(`Logo found: ${logo.name}. FolderID: ${logo.folderId}`);
            if (logo.folderId === test1.id) {
                console.log("CRITICAL: Drizzle sees the file in 'test1', but psql did not!");
            } else if (logo.folderId === null) {
                console.log("OK: Drizzle sees the file in Root (NULL).");
            } else {
                console.log(`STRANGE: File is in folder ${logo.folderId}`);
            }
        } else {
            console.log("Logo not found via Drizzle query!");
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main().then(() => process.exit(0));
