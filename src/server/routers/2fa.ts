/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { authenticator } from "otplib";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { rateLimit } from "@/server/middleware/rate-limit";
import { logAudit } from "@/server/services/audit";

export const twoFaRouter = router({
  generate: protectedProcedure.mutation(() => {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri("user", "Xynoxa", secret);
    return { secret, otpauth };
  }),
  verify: protectedProcedure
    .use(rateLimit({ key: (ctx) => `2fa-${ctx.userId ?? "anon"}`, limit: 10, windowMs: 60_000 }))
    .input(z.object({ token: z.string().length(6), secret: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const ok = authenticator.verify({ token: input.token, secret: input.secret });
      if (!ok) return { ok };
      const recovery = Array.from({ length: 8 }, () =>
        randomBytes(5).toString("hex").slice(0, 10)
      );
      await ctx.db
        .update(users)
        .set({
          totpSecret: input.secret,
          totpEnabled: true,
          recoveryCodes: recovery
        })
        .where(eq(users.id, ctx.userId!));
      await logAudit(ctx.db, ctx.userId!, "2fa_enabled");
      return { ok, recovery };
    })
});
