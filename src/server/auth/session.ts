/*
 * Copyright (C) 2025 Christin Löhner
 */

import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData, type ImpersonatingSession } from "@/lib/session-options";

export { type SessionData, type ImpersonatingSession };

export async function getSession(): Promise<IronSession<ImpersonatingSession>> {
  const cookieStore = await cookies();
  return getIronSession(cookieStore as any, sessionOptions);
}
