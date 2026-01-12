/*
 * Copyright (C) 2025 Christin Löhner
 */

import type { DB } from "./db";
import { db } from "./db";
import { getSession } from "@/server/auth/session";
import { users, apiTokens } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { moduleRouterRegistry } from "@/server/module-router-registry";
import { logDebug } from "@/server/services/logger";

export type Context = {
  db: DB;
  userId: string | null;
  session: Awaited<ReturnType<typeof getSession>>;
};

export async function createContext(): Promise<Context> {
  const startedAt = Date.now();
  await moduleRouterRegistry.initialize();
  const session = await getSession();
  let userId = session?.userId ?? null;

  // Check for API Token if no session user
  if (!userId) {
    const list = await headers();
    const authHeader = list.get("authorization");
    if (authHeader && (authHeader.startsWith("Bearer xyn-") || authHeader.startsWith("Bearer syn-"))) {
      const token = authHeader.replace("Bearer ", "");
      const tokenHash = createHash("sha256").update(token).digest("hex");

      const [apiToken] = await db
        .select({ ownerId: apiTokens.ownerId, id: apiTokens.id })
        .from(apiTokens)
        .where(eq(apiTokens.tokenHash, tokenHash))
        .limit(1);

      if (apiToken) {
        userId = apiToken.ownerId;
        // Update lastUsedAt asynchronously (fire and forget)
        db.update(apiTokens)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiTokens.id, apiToken.id))
          .catch(err => console.error("Failed to update token usage", err));
      }
    }
  }

  if (userId && !session?.userId) {
    // If authenticated via token, we don't have a session object for the user.
    // But we populated userId.
    // We should ensure that if we access session.* it doesn't crash or behave unexpectedly.
    // session is returned from getSession() which might be an empty object if no cookie.
    // Logic below checking session.userId will be skipped if we set userId here but session.userId is undefined.
  }

  if (session?.userId) {
    // Optimization: Trust the session cookie for role if present, only re-validate if sessionVersion mismatches or critical actions.
    const [dbUser] = await db
      .select({ id: users.id, role: users.role, sessionVersion: users.sessionVersion, disabled: users.disabled })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!dbUser || dbUser.disabled || (session.sessionVersion && dbUser.sessionVersion !== session.sessionVersion)) {
      await session.destroy();
      userId = null;
    } else {
      if (dbUser.role !== session.userRole) {
        session.userRole = dbUser.role;
        await session.save();
      }
    }
  }
  const durationMs = Date.now() - startedAt;
  logDebug("[Context] createContext", { durationMs });

  return {
    db,
    userId,
    session
  };
}
