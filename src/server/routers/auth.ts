/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, publicProcedure, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/server/services/passwords";
import { validatePassword } from "@/server/services/password-policy";
import { passwordResets, users, systemSettings, verificationTokens } from "@/server/db/schema";
import { eq, sql, and, isNull, gt } from "drizzle-orm";
import { rateLimit } from "@/server/middleware/rate-limit";
import { logAudit } from "@/server/services/audit";
import { randomBytes } from "crypto";

export const authRouter = router({

  register: publicProcedure
    .use(rateLimit({ key: () => "register", limit: 10, windowMs: 60_000 }))
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8)
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate password policy
      const passwordValidation = validatePassword(input.password);
      if (!passwordValidation.valid) {
        throw new Error(`Password policy violation: ${passwordValidation.errors.join(', ')}`);
      }

      // Check registration setting
      // Check registration setting
      const [setting] = await ctx.db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, "registration_disabled"))
        .limit(1);

      if (setting && setting.value === "true") {
        throw new Error("Registrierung ist derzeit deaktiviert.");
      }


      // Check if user already exists
      const existing = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Ein Konto mit dieser E-Mail existiert bereits");
      }

      const passwordHash = await hashPassword(input.password);
      const [user] = await ctx.db
        .insert(users)
        .values({ email: input.email.toLowerCase(), passwordHash, emailVerified: false })
        .returning({ id: users.id, email: users.email, role: users.role });

      const token = randomBytes(24).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await ctx.db.insert(verificationTokens).values({
        userId: user.id,
        token,
        expiresAt: expires
      });
      await logAudit(ctx.db, user.id, "register", `email=${input.email}`);

      // Send verification email
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const verifyLink = `${appUrl}/api/verify-email?token=${token}`;
      try {
        const { emailQueue } = await import("@/server/jobs/queue");
        await emailQueue().add("verify-email", { kind: "verify-email", to: input.email, verifyLink });
      } catch (e) {
        console.error("Failed to enqueue verification email", e);
      }

      return { pendingVerification: true };
    }),

  checkSetup: publicProcedure.query(async ({ ctx }) => {
    const [admin] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    return { setupNeeded: !admin };
  }),

  setup: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(8), displayName: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      // Double check no admins exist
      const [admin] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);

      if (admin) {
        throw new Error("Setup already completed");
      }

      const passwordHash = await hashPassword(input.password);
      // Create the admin user
      const [user] = await ctx.db
        .insert(users)
        .values({
          email: input.email.toLowerCase(),
          passwordHash,
          role: "admin", // Explicitly admin
          emailVerified: true
        })
        .returning();

      // Setup default session
      ctx.session.userId = user.id;
      ctx.session.userRole = "admin";
      ctx.session.sessionVersion = user.sessionVersion ?? 1;
      await ctx.session.save();

      await logAudit(ctx.db, user.id, "setup_complete");
      return { success: true };
    }),

  login: publicProcedure
    .use(rateLimit({ key: () => "login", limit: 20, windowMs: 60_000 }))
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await ctx.db
        .select({ id: users.id, email: users.email, passwordHash: users.passwordHash, role: users.role, sessionVersion: users.sessionVersion, disabled: users.disabled, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (!user) throw new Error("Invalid credentials");
      if (user.disabled) throw new Error("Account ist gesperrt.");
      if (!user.emailVerified) {
        if (user.role === "admin") {
          const [verifiedAdmin] = await ctx.db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.role, "admin"), eq(users.emailVerified, true)))
            .limit(1);

          if (!verifiedAdmin) {
            await ctx.db
              .update(users)
              .set({ emailVerified: true })
              .where(eq(users.id, user.id));
            user.emailVerified = true;
          }
        }

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }
      }
      const ok = await verifyPassword(input.password, user.passwordHash);
      if (!ok) throw new Error("Invalid credentials");
      ctx.session.userId = user.id;
      ctx.session.userRole = user.role ?? "member";
      ctx.session.sessionVersion = user.sessionVersion ?? 1;
      await ctx.session.save();
      await logAudit(ctx.db, user.id, "login", `email=${input.email}`);
      return { userId: user.id, role: ctx.session.userRole };
    }),
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return { user: null };
    const [user] = await ctx.db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    return { user: user ?? null };
  }),
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await logAudit(ctx.db, ctx.userId!, "logout");
    ctx.session.destroy();
    return { success: true };
  }),
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(users)
      .set({ sessionVersion: sql<number>`session_version + 1`, updatedAt: new Date() })
      .where(eq(users.id, ctx.userId!));
    await ctx.session.destroy();
    return { success: true };
  }),
  requestReset: publicProcedure
    .use(rateLimit({ key: () => "reset", limit: 10, windowMs: 60_000 }))
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1);
      if (!user) {
        return { ok: true }; // don't leak
      }
      const token = randomBytes(24).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await ctx.db.insert(passwordResets).values({
        userId: user.id,
        token,
        expiresAt: expires
      });
      await logAudit(ctx.db, user.id, "password_reset_requested");

      // Add to email queue
      const resetLink = `${process.env.APP_URL || "http://localhost:3000"}/auth/reset?token=${token}`;

      try {
        const { emailQueue } = await import("@/server/jobs/queue");
        await emailQueue().add("send-reset-email", {
          kind: "reset-password",
          to: input.email,
          resetLink
        });
      } catch (e) {
        console.error("Failed to enqueue email job", e);
        // We still return true to not block the flow, but log the error
      }

      return { ok: true }; // Do not return token anymore
    }),
  confirmReset: publicProcedure
    .use(rateLimit({ key: () => "reset-confirm", limit: 10, windowMs: 60_000 }))
    .input(z.object({ token: z.string().min(8), password: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const [reset] = await ctx.db
        .select({ id: passwordResets.id, userId: passwordResets.userId })
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.token, input.token),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, new Date())
          )
        )
        .limit(1);
      if (!reset) {
        throw new Error("Ungültiger oder abgelaufener Token");
      }
      const passwordHash = await hashPassword(input.password);
      await ctx.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, reset.userId));
      await ctx.db
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, reset.id));
      await logAudit(ctx.db, reset.userId, "password_reset_confirmed");
      return { ok: true };
    }),

  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const [vt] = await ctx.db.select().from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.token, input.token),
            isNull(verificationTokens.usedAt),
            gt(verificationTokens.expiresAt, new Date())
          )
        ).limit(1);
      if (!vt) {
        throw new Error("Ungültiger oder abgelaufener Verifizierungslink.");
      }
      await ctx.db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, vt.userId));
      await ctx.db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, vt.id));
      await logAudit(ctx.db, vt.userId, "email_verified");
      return { verified: true };
    }),

  resendVerification: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
      if (!user) return { ok: true }; // no leak
      if (user.emailVerified) return { ok: true };

      const token = randomBytes(24).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await ctx.db.insert(verificationTokens).values({
        userId: user.id,
        token,
        expiresAt: expires
      });

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const verifyLink = `${appUrl}/api/verify-email?token=${token}`;
      try {
        const { emailQueue } = await import("@/server/jobs/queue");
        await emailQueue().add("verify-email", { kind: "verify-email", to: user.email, verifyLink });
      } catch (e) {
        console.error("Failed to enqueue verification email (resend)", e);
      }
      await logAudit(ctx.db, user.id, "verification_resent");
      return { ok: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ id: users.id, passwordHash: users.passwordHash, sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, ctx.userId!))
        .limit(1);
      if (!user) throw new Error("User nicht gefunden");
      const ok = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!ok) throw new Error("Aktuelles Passwort ist falsch");
      const validation = validatePassword(input.newPassword);
      if (!validation.valid) throw new Error(validation.errors.join(", "));
      const newHash = await hashPassword(input.newPassword);
      await ctx.db
        .update(users)
        .set({ passwordHash: newHash, sessionVersion: (user.sessionVersion ?? 1) + 1, updatedAt: new Date() })
        .where(eq(users.id, ctx.userId!));
      await logAudit(ctx.db, ctx.userId!, "password_changed");
      return { ok: true };
    }),

  changeEmail: protectedProcedure
    .input(z.object({ newEmail: z.string().email(), currentPassword: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const newEmail = input.newEmail.toLowerCase();
      const [user] = await ctx.db
        .select({ id: users.id, passwordHash: users.passwordHash, sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, ctx.userId!))
        .limit(1);
      if (!user) throw new Error("User nicht gefunden");
      const ok = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!ok) throw new Error("Passwort falsch");
      const existing = await ctx.db.select().from(users).where(eq(users.email, newEmail)).limit(1);
      if (existing.length > 0) throw new Error("E-Mail wird bereits verwendet.");

      await ctx.db
        .update(users)
        .set({ email: newEmail, emailVerified: false, sessionVersion: (user.sessionVersion ?? 1) + 1, updatedAt: new Date() })
        .where(eq(users.id, ctx.userId!));

      const token = randomBytes(24).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await ctx.db.insert(verificationTokens).values({ userId: ctx.userId!, token, expiresAt: expires });
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const verifyLink = `${appUrl}/api/verify-email?token=${token}`;
      try {
        const { emailQueue } = await import("@/server/jobs/queue");
        await emailQueue().add("verify-email", { kind: "verify-email", to: newEmail, verifyLink });
      } catch (e) {
        console.error("Failed to enqueue verification email (changeEmail)", e);
      }
      await logAudit(ctx.db, ctx.userId!, "email_change_requested");
      return { pendingVerification: true };
    })
});
