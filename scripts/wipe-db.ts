/*
 * Copyright (C) 2025 Christin Löhner
 */


import { db } from "../src/server/db";
import { sql } from "drizzle-orm";

async function main() {
    console.log("Wiping database...");
    await db.execute(sql`TRUNCATE TABLE "users", "groups", "group_members", "sessions", "files", "folders", "notes", "bookmarks", "calendar_events", "tasks" CASCADE;`);
    console.log("Database wiped.");
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
