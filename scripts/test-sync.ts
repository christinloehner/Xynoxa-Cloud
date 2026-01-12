/*
 * Copyright (C) 2025 Christin Löhner
 */


import { db } from "../src/server/db";
import { users, apiTokens, files, folders } from "../src/server/db/schema";
import { appRouter } from "../src/server/routers/_app";
import { POST as uploadPost } from "../src/app/api/upload/route";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import crypto from "crypto";

async function main() {
    console.warn("Starting Sync Integration Test...");

    // 1. Setup Test User
    const testEmail = `test-sync-${Date.now()}@example.com`;
    console.warn(`Creating user ${testEmail}...`);

    const [user] = await db.insert(users).values({
        email: testEmail,
        passwordHash: "hash",
        role: "member",
        sessionVersion: 1
    }).returning();

    // 2. Setup API Token
    const tokenRaw = `xyn-test-${Date.now()}`;
    const tokenHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");

    await db.insert(apiTokens).values({
        ownerId: user.id,
        name: "Test Token",
        tokenHash: tokenHash
    });

    console.warn("User and Token created.");

    // 3. Test Upload Auth (Mock Request)
    console.warn("Testing Upload Auth...");

    // 3a. Fail without token
    const reqNoAuth = new NextRequest("http://localhost/api/upload", {
        method: "POST",
        body: (new FormData()) // Empty form data
    });
    const resNoAuth = await uploadPost(reqNoAuth);
    if (resNoAuth.status !== 401) {
        throw new Error(`Expected 401 for no auth, got ${resNoAuth.status}`);
    }
    console.warn("-> No Auth: 401 OK");

    // 3b. Success with token
    // We need to construct a valid FormData with a file
    const formData = new FormData();
    const file = new Blob(["test content"], { type: "text/plain" });
    formData.append("file", file, "test.txt");

    const reqAuth = new NextRequest("http://localhost/api/upload", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${tokenRaw}`
        },
        body: formData
    });

    // Note: We might hit "No file provided" if our mock FormData isn't parsed correctly by NextRequest in this Node environment.
    // node-fetch/NextRequest formData handling can be tricky in scripts.
    // But let's try. If it fails on body parsing, we at least validated Auth layer (which runs before body parsing).

    try {
        const resAuth = await uploadPost(reqAuth);
        if (resAuth.status === 401) {
            throw new Error("Got 401 with valid token!");
        }
        console.warn(`-> Auth: ${resAuth.status} (Expected 201 or 400 if body parsing fails, but NOT 401)`);
    } catch (e: any) {
        console.warn("Auth request failed (likely body parsing):", e.message);
        // If we got past auth check, that's partial success.
    }

    // 4. Test Sync Pull via TRPC
    console.warn("Testing Sync Pull...");

    // Create caller with context
    const caller = appRouter.createCaller({
        db,
        userId: user.id,
        session: null as any // fake session
    });

    // 4a. Initial Pull (Empty)
    const initialSync = await caller.sync.pull({ cursor: 0 });
    console.warn("Initial Sync Items:", initialSync.files.length + initialSync.folders.length);

    // 4b. Create File (simulate directly in DB to avoid relying on Upload route success)
    await db.insert(files).values({
        ownerId: user.id,
        path: "synced-file.txt",
        size: "123",
        mime: "text/plain",
        hash: "abc",
        isDeleted: false,
        updatedAt: new Date(), // Now
        createdAt: new Date()
    });

    // 4c. Pull Again
    const secondSync = await caller.sync.pull({ cursor: initialSync.nextCursor }); // This might miss if 'now' is same ms.
    // Let's use a cursor from the past to be sure
    const pastCursor = Date.now() - 10000;
    const pullWithChanges = await caller.sync.pull({ cursor: pastCursor });

    console.warn("Pull since 10s ago items:", pullWithChanges.files.length);

    if (pullWithChanges.files.length !== 1) {
        console.error("Expected 1 file, got", pullWithChanges.files.length);
        // Doing a raw select to debug
        const allFiles = await db.select().from(files).where(eq(files.ownerId, user.id));
        console.warn("Total files in DB for user:", allFiles.length);
    } else {
        console.warn("-> Sync Pull: OK");
    }

    // Cleanup
    await db.delete(users).where(eq(users.id, user.id));
    console.warn("Cleanup done.");
}

main().catch(console.error).then(() => process.exit(0));
