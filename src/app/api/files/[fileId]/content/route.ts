/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/auth/api-helper";
import { db } from "@/server/db";
import { files, groupFolderAccess, groupMembers, folders } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { readFileFromStorage } from "@/server/services/storage";
import { getLatestVersion, buildBufferFromVersion } from "@/server/services/file-versioning";
import { logInfo, logError } from "@/server/services/logger";


export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const startTime = Date.now();
    let fileId: string | undefined;
    let userId: string | null = null;
    
    try {
        const resolvedParams = await params;
        fileId = resolvedParams.fileId;
        userId = await getUserFromRequest(req);
        
        logInfo("Download request started", { fileId, userId });

        if (!userId) {
            logError("Download: Unauthorized", undefined, { fileId });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [file] = await db
            .select()
            .from(files)
            .where(eq(files.id, fileId))
            .limit(1);

        if (!file) {
            logError("Download: File not found", undefined, { fileId, userId });
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Access Check
        let hasAccess = false;
        if (file.ownerId === userId) {
            hasAccess = true;
        } else {
            // Group Context Resolution
            let effectiveGroupFolderId = file.groupFolderId;

            // If not explicit on file, check parent folder
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
                const [access] = await db.select({ id: groupFolderAccess.id })
                    .from(groupFolderAccess)
                    .innerJoin(groupMembers, eq(groupMembers.groupId, groupFolderAccess.groupId))
                    .where(and(
                        eq(groupFolderAccess.groupFolderId, effectiveGroupFolderId),
                        eq(groupMembers.userId, userId)
                    ))
                    .limit(1);
                if (access) hasAccess = true;
            }
        }

        if (!hasAccess) {
            logError("Download: Access denied", undefined, { fileId, userId });
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        let fileBuffer: Buffer;
        if (file.isVault) {
            if (!file.storagePath) {
                return NextResponse.json({ error: "File has no content path" }, { status: 500 });
            }
            fileBuffer = await readFileFromStorage(file.storagePath);
        } else {
            const latest = await getLatestVersion(file.id);
            if (!latest) {
                return NextResponse.json({ error: "Keine Version gefunden" }, { status: 404 });
            }
            fileBuffer = await buildBufferFromVersion(latest.id);
        }

        const latest = file.isVault ? null : await getLatestVersion(file.id);
        const duration = Date.now() - startTime;

        logInfo("Download succeeded", { 
            fileId, 
            userId, 
            filename: file.path,
            size: fileBuffer.length,
            duration: `${duration}ms`
        });

        return new Response(fileBuffer as any, {
            status: 200,
            headers: {
                "Content-Type": file.mime ?? "application/octet-stream",
                "Content-Length": fileBuffer.length.toString(),
                "Content-Disposition": `attachment; filename="${file.originalName ?? file.path}"`,
                "X-Syn-Hash": file.hash ?? "",
                "X-Syn-Version": latest?.version?.toString() ?? "1"
            }
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logError("Download failed", error as any, { 
            fileId, 
            userId,
            duration: `${duration}ms`
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
