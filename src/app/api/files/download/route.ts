/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { files, groupFolderAccess, groupMembers, folders } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { readFileFromStorage } from "@/server/services/storage";
import { getLatestVersion, buildBufferFromVersion } from "@/server/services/file-versioning";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "File ID missing" }, { status: 400 });

    const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);

    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let hasAccess = false;
    if (file.ownerId === session.userId) {
        hasAccess = true;
    } else {
        // Resolve Group Context
        let effectiveGroupFolderId = file.groupFolderId;

        if (!effectiveGroupFolderId && file.folderId) {
            const [parent] = await db.select({ groupFolderId: folders.groupFolderId })
                .from(folders)
                .where(eq(folders.id, file.folderId))
                .limit(1);
            if (parent?.groupFolderId) {
                effectiveGroupFolderId = parent.groupFolderId;
            }
        }

        if (effectiveGroupFolderId) {
            // Check Group Access
            const [access] = await db.select({ id: groupFolderAccess.id })
                .from(groupFolderAccess)
                .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
                .where(and(
                    eq(groupFolderAccess.groupFolderId, effectiveGroupFolderId),
                    eq(groupMembers.userId, session.userId)
                ))
                .limit(1);
            if (access) hasAccess = true;
        }
    }

    if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
        let buffer: Buffer;
        if (file.isVault) {
            buffer = await readFileFromStorage(file.storagePath || "");
        } else {
            const latest = await getLatestVersion(file.id);
            if (!latest) {
                return NextResponse.json({ error: "Keine Version gefunden" }, { status: 404 });
            }
            buffer = await buildBufferFromVersion(latest.id);
        }
        const body = new Uint8Array(buffer);
        return new NextResponse(body, {
            status: 200,
            headers: {
                // Vault-Dateien bleiben verschlüsselt; Mime wird als Binär ausgegeben, damit der Client entschlüsseln kann.
                "Content-Type": file.isVault ? "application/octet-stream" : (file.mime || "application/octet-stream"),
                "Content-Disposition": `attachment; filename="${encodeURIComponent(file.originalName || file.path || "download")}"`,
                "Content-Length": buffer.byteLength.toString(),
            }
        });
    } catch (err: any) {
        if (err?.code === "ENOENT") {
            return NextResponse.json({ error: "File content missing on storage" }, { status: 404 });
        }
        console.error("Download error", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
