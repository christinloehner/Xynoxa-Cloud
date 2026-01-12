/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest } from "next/server";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { apiTokens } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function getUserFromRequest(req: NextRequest): Promise<string | null> {
    // 1. Try Bearer Token (Prioritize for API Clients and Performance)
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer xyn-") || authHeader?.startsWith("Bearer syn-")) {
        const token = authHeader.replace("Bearer ", "");
        const hash = crypto.createHash("sha256").update(token).digest("hex");

        const [tokenRecord] = await db
            .select({ id: apiTokens.id, ownerId: apiTokens.ownerId })
            .from(apiTokens)
            .where(eq(apiTokens.tokenHash, hash))
            .limit(1);

        if (tokenRecord) {
            // Update lastUsedAt async
            db.update(apiTokens)
                .set({ lastUsedAt: new Date() })
                .where(eq(apiTokens.id, tokenRecord.id))
                .catch(console.error);

            return tokenRecord.ownerId;
        }
    }

    // 2. Try Session (Fallback for Browser Uploads)
    try {
        const session = await getSession();
        if (session?.userId) return session.userId;
    } catch (e) {
        // Ignore session errors (like missing context in scripts)
    }

    return null;
}
