/*
 * Copyright (C) 2025 Christin Löhner
 */


import { db } from "../src/server/db";
import { files, users, apiTokens, syncJournal } from "../src/server/db/schema";
import { eq, gt } from "drizzle-orm";
import crypto from "crypto";
import { headers } from "next/headers";

// Mock Next.js headers/cookies context for the helper if needed,
// but our helper prioritizes headers which we can mock if we were calling via HTTP.
// For direct DB/Router tests we might need to bypass auth or mock context.
// Better: Test via API Helper logic or HTTP calls if possible, or direct DB manipulation + Router call.

// For robustness, let's test via direct DB inserts simulating app logic matches?
// Actually, we want to test that mutations TRIGGER journal entries.
// And that sync.pull RETURNS them.

// To call trpc procedures, we need a context.
// Let's create a minimal caller.

import { appRouter } from "../src/server/routers/_app";
import { createCallerFactory } from "../src/server/trpc";

async function main() {
    console.warn("Starting Journal Sync Test...");

    // 1. Create User & Token
    const email = `test-journal-${Date.now()}@example.com`;
    const [user] = await db.insert(users).values({
        email,
        passwordHash: "hash",
        role: "admin", // Need admin for some ops? Or member. create requires 'member'.
    }).returning();

    console.warn(`User created: ${user.id}`);

    // Context Mock
    const ctx = {
        userId: user.id,
        user: user,
        db: db,
        headers: new Headers(),
        session: { userId: user.id, expiresAt: new Date(Date.now() + 10000) }
    };

    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller(ctx);

    // 2. Create File -> Should create Journal Entry "create"
    console.warn("Testing Create File...");
    const file = await caller.files.create({
        name: "test-file.txt",
        size: "123",
    });
    console.warn("File created:", file.id);

    // Check Journal
    const eventsAfterCreate = await caller.sync.pull({});
    console.warn("Events after create:", eventsAfterCreate.events.length);
    const createEvent = eventsAfterCreate.events.find(e => e.entityId === file.id && e.action === "create");

    if (!createEvent) throw new Error("Journal missing CREATE event");
    console.warn("✅ Create event found");

    const cursor1 = Number(createEvent.id);

    // 3. Rename File -> Should create Journal Entry "move"
    console.warn("Testing Rename File...");
    await caller.files.rename({
        id: file.id,
        name: "renamed-file.txt"
    });

    const eventsAfterRename = await caller.sync.pull({ cursor: cursor1 });
    const moveEvent = eventsAfterRename.events.find(e => e.entityId === file.id && e.action === "move");

    if (!moveEvent) throw new Error("Journal missing MOVE event");
    console.warn("✅ Move/Rename event found");

    const cursor2 = Number(moveEvent.id);

    // 4. Soft Delete -> Should create Journal Entry "delete"
    console.warn("Testing Soft Delete...");
    await caller.files.softDelete({ fileId: file.id });

    const eventsAfterDelete = await caller.sync.pull({ cursor: cursor2 });
    const deleteEvent = eventsAfterDelete.events.find(e => e.entityId === file.id && e.action === "delete");

    if (!deleteEvent) throw new Error("Journal missing DELETE event");
    console.warn("✅ Delete event found");

    const cursor3 = Number(deleteEvent.id);

    // 5. Restore -> Should create Journal Entry "create" (re-appear)
    console.warn("Testing Restore...");
    await caller.files.restore({ fileId: file.id });

    const eventsAfterRestore = await caller.sync.pull({ cursor: cursor3 });
    const restoreEvent = eventsAfterRestore.events.find(e => e.entityId === file.id && e.action === "create");

    if (!restoreEvent) throw new Error("Journal missing CREATE (restore) event");
    console.warn("✅ Restore event found");

    // 6. Test Update via Upload (New Feature)
    console.warn("Testing Update via Upload...");

    // We need to call the API route handler directly, mocking NextRequest
    const { POST } = await import("../src/app/api/upload/route.ts");
    const { NextRequest } = await import("next/server");

    // Create a Token for Auth
    // Note: The token in DB is hashed INCLUDING the 'xyn-' prefix if the helper expects 'xyn-' in the Bearer token.
    // api-helper: const token = authHeader.replace("Bearer ", ""); -> "xyn-..."
    //             const hash = ...update(token)...
    // So we must hash the full "xyn-..." string.

    const rawTokenSuffix = "test-token-" + Date.now();
    const fullToken = `xyn-${rawTokenSuffix}`;
    const tokenHash = crypto.createHash("sha256").update(fullToken).digest("hex");

    await db.insert(apiTokens).values({
        ownerId: user.id,
        name: "Test Token",
        tokenHash
    });

    // Mock Request for UPDATE

    const formData = new FormData();
    const fileBlob = new Blob(["Updated Content"], { type: "text/plain" });
    formData.append("file", fileBlob, "updated.txt");
    formData.append("fileId", file.id); // Triggers Update

    // URL requires base
    const req = new NextRequest("http://localhost:3000/api/upload", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${fullToken}`
        },
        body: formData
    });

    const res = await POST(req);

    if (res.status !== 200) {
        const json = await res.json();
        console.error("Upload failed", json);
        throw new Error(`Upload Update failed with status ${res.status}`);
    }
    console.warn("✅ Upload Update returned 200");

    const eventsAfterUpdate = await caller.sync.pull({ cursor: Number(restoreEvent.id) });
    const updateEvent = eventsAfterUpdate.events.find(e => e.entityId === file.id && e.action === "update");

    if (!updateEvent) {
        console.warn("Events found:", eventsAfterUpdate.events);
        throw new Error("Journal missing UPDATE event");
    }
    console.warn("✅ Update event found");

    // 7. Verify Metadata Enrichment (New Feature)
    if (!updateEvent.data) throw new Error("Journal event missing enriched data payload");
    if ((updateEvent.data as any).id !== file.id) throw new Error("Enriched data mismatch");
    console.warn("✅ Metadata enrichment verified");

    // 8. Test Direct Download (New Feature)
    console.warn("Testing Direct File Download...");
    const { GET } = await import("../src/app/api/files/[fileId]/content/route.ts");

    const dlReq = new NextRequest(`http://localhost:3000/api/files/${file.id}/content`, {
        headers: { "Authorization": `Bearer ${fullToken}` }
    });

    const dlRes = await GET(dlReq, { params: { fileId: file.id } });
    if (dlRes.status !== 200) {
        const text = await dlRes.text();
        console.error("Download failed", text);
        throw new Error(`Download failed with status ${dlRes.status}`);
    }

    const dlContent = await dlRes.text();
    if (dlContent !== "Updated Content") throw new Error("Downloaded content mismatch");
    console.warn("✅ Direct Download verified");

    // Cleanup
    await db.delete(users).where(eq(users.id, user.id));
    console.warn("Cleanup done. Test Passed!");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

// Polyfill FormData/Blob if needed in older Node, but TSX/Node 20 should have it.
