/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextResponse } from "next/server";
import { authRouter } from "@/server/routers/auth";
import { createContext } from "@/server/context";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const base = process.env.APP_URL || new URL(req.url).origin;
  if (!token) return NextResponse.redirect(`${base}/auth/login?verify=missing`);
  try {
    const ctx = await createContext();
    await authRouter.createCaller(ctx).verifyEmail({ token });
    return NextResponse.redirect(`${base}/auth/login?verified=1`);
  } catch (e: any) {
    return NextResponse.redirect(`${base}/auth/login?verify_error=${encodeURIComponent(e?.message || "invalid")}`);
  }
}
