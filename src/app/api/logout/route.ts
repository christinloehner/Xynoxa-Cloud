/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ success: true });
}
