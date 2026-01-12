/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { userProfiles } from "@/server/db/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { invalidateSearchAutoReindexCache } from "@/server/services/user-search-settings";

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await ctx.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, ctx.userId!))
      .limit(1);
    return profile ?? {
      userId: ctx.userId!,
      displayName: null,
      avatarUrl: null,
      avatarStoragePath: null,
      avatarMime: null,
      locale: "de",
      bio: null,
      publicProfile: false,
      profileUrl: null,
      showEmail: false,
      showBirthDate: false,
      showBirthPlace: false,
      showPhone: false,
      showAddress: false,
      showOccupation: false,
      showCity: false,
      searchAutoReindex: true,
      firstName: null,
      lastName: null,
      pronouns: null,
      phone: null,
      street: null,
      houseNumber: null,
      postalCode: null,
      city: null,
      birthDate: null,
      birthPlace: null,
      occupation: null,
      websites: [],
      xUrl: null,
      fediverseUrl: null,
      instagramUrl: null,
      youtubeUrl: null,
      twitchUrl: null
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        displayName: z.string().optional(),
        avatarUrl: z.string().url().optional().or(z.literal("")),
        avatarStoragePath: z.string().optional(),
        avatarMime: z.string().optional(),
        locale: z.string().optional(),
        bio: z.string().max(2000).optional().or(z.literal("")),
        publicProfile: z.boolean().optional(),
        profileUrl: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(3).max(64).optional().or(z.literal("")),
        showEmail: z.boolean().optional(),
        showBirthDate: z.boolean().optional(),
        showBirthPlace: z.boolean().optional(),
        showPhone: z.boolean().optional(),
        showAddress: z.boolean().optional(),
        showOccupation: z.boolean().optional(),
        showCity: z.boolean().optional(),
        searchAutoReindex: z.boolean().optional(),
        firstName: z.string().max(128).optional().or(z.literal("")),
        lastName: z.string().max(128).optional().or(z.literal("")),
        pronouns: z.string().max(64).optional().or(z.literal("")),
        phone: z.string().max(64).optional().or(z.literal("")),
        street: z.string().max(255).optional().or(z.literal("")),
        houseNumber: z.string().max(32).optional().or(z.literal("")),
        postalCode: z.string().max(32).optional().or(z.literal("")),
        city: z.string().max(255).optional().or(z.literal("")),
        birthDate: z.coerce.date().optional(),
        birthPlace: z.string().max(255).optional().or(z.literal("")),
        occupation: z.string().max(255).optional().or(z.literal("")),
        websites: z.array(z.string().url().max(255)).optional(),
        xUrl: z.string().url().max(255).optional().or(z.literal("")),
        fediverseUrl: z.string().url().max(255).optional().or(z.literal("")),
        instagramUrl: z.string().url().max(255).optional().or(z.literal("")),
        youtubeUrl: z.string().url().max(255).optional().or(z.literal("")),
        twitchUrl: z.string().url().max(255).optional().or(z.literal(""))
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ensure unique profileUrl if provided
      if (input.profileUrl) {
        const existingSlug = await ctx.db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.profileUrl, input.profileUrl))
          .limit(1);
        if (existingSlug.length > 0 && existingSlug[0].userId !== ctx.userId) {
          throw new Error("Profil-URL bereits vergeben.");
        }
      }

      const existing = await ctx.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, ctx.userId!))
        .limit(1);

      const sanitizeString = (v?: string | null) => (v === "" ? null : v ?? null);

      if (existing.length === 0) {
        const [profile] = await ctx.db
          .insert(userProfiles)
            .values({
              userId: ctx.userId!,
              displayName: sanitizeString(input.displayName),
              avatarUrl: input.avatarUrl || null,
              avatarStoragePath: input.avatarStoragePath ?? null,
              avatarMime: input.avatarMime ?? null,
              locale: input.locale ?? "de",
              bio: input.bio ?? null,
              publicProfile: input.publicProfile ?? false,
              profileUrl: sanitizeString(input.profileUrl),
              showEmail: input.showEmail ?? false,
              showBirthDate: input.showBirthDate ?? false,
              showBirthPlace: input.showBirthPlace ?? false,
              showPhone: input.showPhone ?? false,
              showAddress: input.showAddress ?? false,
              showOccupation: input.showOccupation ?? false,
              showCity: input.showCity ?? false,
              searchAutoReindex: input.searchAutoReindex ?? true,
              firstName: sanitizeString(input.firstName),
              lastName: sanitizeString(input.lastName),
              pronouns: sanitizeString(input.pronouns),
              phone: sanitizeString(input.phone),
              street: sanitizeString(input.street),
              houseNumber: sanitizeString(input.houseNumber),
              postalCode: sanitizeString(input.postalCode),
              city: sanitizeString(input.city),
              birthDate: input.birthDate ?? null,
              birthPlace: sanitizeString(input.birthPlace),
              occupation: sanitizeString(input.occupation),
              websites: input.websites ?? [],
              xUrl: sanitizeString(input.xUrl),
              fediverseUrl: sanitizeString(input.fediverseUrl),
              instagramUrl: sanitizeString(input.instagramUrl),
              youtubeUrl: sanitizeString(input.youtubeUrl),
              twitchUrl: sanitizeString(input.twitchUrl)
            })
            .returning();
        invalidateSearchAutoReindexCache(ctx.userId!);
        return profile;
      } else {
        const [profile] = await ctx.db
          .update(userProfiles)
          .set({
            displayName: input.displayName ?? existing[0].displayName,
            avatarUrl: input.avatarUrl !== undefined ? (input.avatarUrl || null) : existing[0].avatarUrl,
            avatarStoragePath: input.avatarStoragePath ?? existing[0].avatarStoragePath ?? null,
            avatarMime: input.avatarMime ?? existing[0].avatarMime ?? null,
            locale: input.locale ?? existing[0].locale ?? "de",
            bio: input.bio ?? existing[0].bio ?? null,
            publicProfile: input.publicProfile ?? existing[0].publicProfile,
            profileUrl: input.profileUrl !== undefined ? (input.profileUrl || null) : existing[0].profileUrl,
            showEmail: input.showEmail ?? existing[0].showEmail,
            showBirthDate: input.showBirthDate ?? existing[0].showBirthDate,
            showBirthPlace: input.showBirthPlace ?? existing[0].showBirthPlace,
            showPhone: input.showPhone ?? existing[0].showPhone,
            showAddress: input.showAddress ?? existing[0].showAddress,
            showOccupation: input.showOccupation ?? existing[0].showOccupation,
            showCity: input.showCity ?? existing[0].showCity,
            searchAutoReindex: input.searchAutoReindex ?? existing[0].searchAutoReindex ?? true,
            firstName: input.firstName !== undefined ? sanitizeString(input.firstName) : existing[0].firstName,
            lastName: input.lastName !== undefined ? sanitizeString(input.lastName) : existing[0].lastName,
            pronouns: input.pronouns !== undefined ? sanitizeString(input.pronouns) : existing[0].pronouns,
            phone: input.phone !== undefined ? sanitizeString(input.phone) : existing[0].phone,
            street: input.street !== undefined ? sanitizeString(input.street) : existing[0].street,
            houseNumber: input.houseNumber !== undefined ? sanitizeString(input.houseNumber) : existing[0].houseNumber,
            postalCode: input.postalCode !== undefined ? sanitizeString(input.postalCode) : existing[0].postalCode,
            city: input.city !== undefined ? sanitizeString(input.city) : existing[0].city,
            birthDate: input.birthDate ?? existing[0].birthDate ?? null,
            birthPlace: input.birthPlace !== undefined ? sanitizeString(input.birthPlace) : existing[0].birthPlace,
            occupation: input.occupation !== undefined ? sanitizeString(input.occupation) : existing[0].occupation,
            websites: input.websites ?? existing[0].websites ?? [],
            xUrl: input.xUrl !== undefined ? sanitizeString(input.xUrl) : existing[0].xUrl,
            fediverseUrl: input.fediverseUrl !== undefined ? sanitizeString(input.fediverseUrl) : existing[0].fediverseUrl,
            instagramUrl: input.instagramUrl !== undefined ? sanitizeString(input.instagramUrl) : existing[0].instagramUrl,
            youtubeUrl: input.youtubeUrl !== undefined ? sanitizeString(input.youtubeUrl) : existing[0].youtubeUrl,
            twitchUrl: input.twitchUrl !== undefined ? sanitizeString(input.twitchUrl) : existing[0].twitchUrl
          })
          .where(eq(userProfiles.userId, ctx.userId!))
          .returning();
        invalidateSearchAutoReindexCache(ctx.userId!);
        return profile;
      }
    })
});
