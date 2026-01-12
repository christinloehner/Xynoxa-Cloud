/*
 * Copyright (C) 2025 Christin Löhner
 */

export const sessionOptions = {
    password: process.env.SESSION_SECRET || "dev-secret-please-change",
    cookieName: "xynoxa.session",
    cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    }
} as const;

export type SessionData = { userId?: string; userRole?: string; googleState?: string };
export type ImpersonatingSession = SessionData & { sessionVersion?: number; impersonatorId?: string };
