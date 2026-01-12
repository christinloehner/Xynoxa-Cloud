/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { readFileFromStorage } from "@/server/services/storage";
import { buildBufferFromVersion, getLatestVersion } from "@/server/services/file-versioning";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "File ID missing" }, { status: 400 });

    const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let hasAccess = false;
    if (file.ownerId === session.userId) {
        hasAccess = true;
    } else if (file.groupFolderId) {
        // Import schema dynamically to avoid circular deps if any
        const { groupMembers, groupFolderAccess } = await import("@/server/db/schema");
        const results = await db
            .select({ id: groupFolderAccess.id })
            .from(groupFolderAccess)
            .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
            .where(and(
                eq(groupFolderAccess.groupFolderId, file.groupFolderId),
                eq(groupMembers.userId, session.userId)
            ))
            .limit(1);
        if (results.length > 0) hasAccess = true;
    }

    if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (file.isVault) {
        return NextResponse.json({ error: "Vault file cannot be viewed directly" }, { status: 403 });
    }

    try {
        let buffer: Buffer;
        let mime = file.mime || "application/octet-stream";

        if (file.storagePath) {
            // Altes Storage-Layout: Datei liegt direkt auf dem Storage-Pfad
            buffer = await readFileFromStorage(file.storagePath);
        } else {
            // Neues Versionierungs-Layout: Inhalt kommt aus den File-Version-Chunks
            const latest = await getLatestVersion(file.id);
            if (!latest) {
                return NextResponse.json({ error: "Keine Version gefunden" }, { status: 404 });
            }
            buffer = await buildBufferFromVersion(latest.id);
            mime = latest.mime || mime;
        }

        const body = new Uint8Array(buffer);
        return new NextResponse(body, {
            status: 200,
            headers: {
                "Content-Type": mime,
                "Cache-Control": "public, max-age=60",
                "Content-Length": buffer.byteLength.toString(),
            }
        });
    } catch (err: any) {
        if (err?.code === "ENOENT") {
            return NextResponse.json({ error: "File content missing on storage" }, { status: 404 });
        }
        console.error("Content read error", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
