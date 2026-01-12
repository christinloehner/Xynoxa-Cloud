/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session-options";

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Define protected routes (everything in dashboard)
    const protectedRoutes = [
        "/files",
        "/notes",
        "/calendar",
        "/search",
        "/vault",
        "/settings",
        "/admin"
    ];

    // Helper to check if path matches protected routes
    const isProtected = protectedRoutes.some(route => pathname.startsWith(route));

    if (isProtected) {
        const res = NextResponse.next();
        const session = await getIronSession(req, res, sessionOptions);

        // Casting session to any to access data or just checking emptiness
        // session is empty object if no cookie found usually, or we can check session.userId
        const { userId } = session as { userId?: string };

        if (!userId) {
            // Redirect to login, preserving the original URL as callbackUrl if desired (optional)
            const loginUrl = new URL("/auth/login", req.url);
            // loginUrl.searchParams.set("callbackUrl", pathname); // Optional
            return NextResponse.redirect(loginUrl);
        }

        return res;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - auth (login/register pages)
         * - / (root landing page, if it should be public)
         * but we are explicitly checking 'protectedRoutes' inside middleware,
         * so we can match everything or just the protected ones.
         * Efficiency: Match everything so we can control it in code, or use matcher to limit invocation.
         */
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
