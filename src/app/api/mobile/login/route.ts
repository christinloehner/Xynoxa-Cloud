/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { db } from "@/server/db";
import { apiTokens, users } from "@/server/db/schema";
import { verifyPassword } from "@/server/services/passwords";
import { logAudit } from "@/server/services/audit";

const inputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tokenName: z.string().min(1).max(64).optional()
});

const buckets = new Map<string, number[]>();

function checkLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const existing = buckets.get(key)?.filter((ts) => ts > windowStart) ?? [];
  if (existing.length >= limit) return false;
  existing.push(now);
  buckets.set(key, existing);
  return true;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  if (!checkLimit(`mobile-login:${email}`, 20, 60_000)) {
    return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      role: users.role,
      disabled: users.disabled,
      emailVerified: users.emailVerified
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }
  if (user.disabled) {
    return NextResponse.json({ error: "ACCOUNT_DISABLED" }, { status: 403 });
  }
  if (!user.emailVerified) {
    return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const token = `xyn-${randomBytes(32).toString("hex")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenName = parsed.data.tokenName?.trim() || "Mobile Client";

  const [record] = await db
    .insert(apiTokens)
    .values({
      ownerId: user.id,
      name: tokenName,
      tokenHash
    })
    .returning({ id: apiTokens.id });

  await logAudit(db, user.id, "mobile_login", `token=${record.id}`);

  return NextResponse.json({
    token,
    userId: user.id,
    role: user.role ?? "member"
  });
}
