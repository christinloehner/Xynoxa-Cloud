/*
 * Copyright (C) 2025 Christin Löhner
 */

import { TRPCError } from "@trpc/server";
import { t } from "@/server/trpc";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const requireRole = (roles: string[]) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    // Use the role from the session (populated in context)
    const role = ctx.session.userRole || "member";

    if (!roles.includes(role)) throw new TRPCError({ code: "FORBIDDEN" });
    return next();
  });
