/*
 * Copyright (C) 2025 Christin Löhner
 */


const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(process.cwd(), "storage", "files");
    console.warn("STORAGE_ROOT:", STORAGE_ROOT);

    try {
        await client.connect();

        console.warn("Listing ALL Group Folders:");
        const allGroups = await client.query("SELECT id, name FROM group_folders");
        allGroups.rows.forEach(r => console.warn(`- ${r.name} (${r.id})`));

        console.warn("Listing last 10 created files:");
        const lastFiles = await client.query("SELECT id, path, original_name, group_folder_id, storage_path FROM files ORDER BY created_at DESC LIMIT 10");
        lastFiles.rows.forEach(r => {
            console.warn(`File: ${r.path} (Original: ${r.original_name}) | GF: ${r.group_folder_id} | Storage: ${r.storage_path}`);
        });

        // Exit early
        process.exit(0);

        console.warn("Searching for files...");

        let query = "SELECT id, owner_id, group_folder_id, path, storage_path FROM files WHERE path LIKE $1 OR original_name LIKE $1";
        let params = ['%harmonikas%']; // broader search

        if (gfId) {
            query = "SELECT id, owner_id, group_folder_id, path, storage_path FROM files WHERE group_folder_id = $1";
            params = [gfId];
            console.warn("Listing ALL files in Group Folder...");
        }

        const fileRes = await client.query(query, params);

        if (fileRes.rows.length === 0) {
            console.warn("File not found in DB.");
            process.exit(0);
        }

        for (const file of fileRes.rows) {
            console.warn("------------------------------------------------");
            console.warn("File ID:", file.id);
            console.warn("Owner ID:", file.owner_id);
            console.warn("Group Folder ID:", file.group_folder_id);
            console.warn("Logical Path:", file.path);
            console.warn("Storage Path (DB):", file.storage_path);

            const realPath = path.join(STORAGE_ROOT, file.storage_path);
            console.warn("Absolute FS Path:", realPath);

            if (fs.existsSync(realPath)) {
                console.warn("✅ File EXISTS on disk.");
                const stats = fs.statSync(realPath);
                console.warn("Size:", stats.size);
            } else {
                console.warn("❌ File MISSING on disk.");

                // Debug parent dir
                const parentDir = path.dirname(realPath);
                if (fs.existsSync(parentDir)) {
                    console.warn(`Parent dir (${parentDir}) exists. Contents:`);
                    console.warn(fs.readdirSync(parentDir));
                } else {
                    console.warn(`Parent dir (${parentDir}) missing.`);
                    // Check user root
                    const userRoot = path.join(STORAGE_ROOT, file.owner_id);
                    if (fs.existsSync(userRoot)) {
                        console.warn(`User root (${userRoot}) exists.`);
                    } else {
                        console.warn(`User root (${userRoot}) missing.`);
                    }
                }
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

main();
