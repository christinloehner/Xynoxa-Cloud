/*
 * Copyright (C) 2025 Christin Löhner
 */

import { TRPCError } from "@trpc/server";
import { t } from "@/server/trpc";

type RateLimitOptions = {
  key: (ctx: any) => string;
  limit: number;
  windowMs: number;
};

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

export const rateLimit = ({ key, limit, windowMs }: RateLimitOptions) =>
  t.middleware(async ({ ctx, next }) => {
    const bucketKey = key(ctx);
    if (!checkLimit(bucketKey, limit, windowMs)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
    }
    return next();
  });

