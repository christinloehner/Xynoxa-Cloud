/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "@/server/db";
import { userProfiles, users } from "@/server/db/schema";
import { and, eq, or } from "drizzle-orm";
import { ProfileView } from "@/components/profile/profile-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export default async function PublicProfilePage({ params }: PageProps) {
  const { slug } = await params;

  const isUuidSlug = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slug);

  const whereClause = isUuidSlug
    ? and(eq(userProfiles.publicProfile, true), or(eq(userProfiles.profileUrl, slug), eq(userProfiles.userId, slug)))
    : and(eq(userProfiles.publicProfile, true), eq(userProfiles.profileUrl, slug));

  const [profile] = await db
    .select({
      displayName: userProfiles.displayName,
      avatarUrl: userProfiles.avatarUrl,
      avatarStoragePath: userProfiles.avatarStoragePath,
      avatarMime: userProfiles.avatarMime,
      bio: userProfiles.bio,
      userId: userProfiles.userId,
      profileUrl: userProfiles.profileUrl,
      publicProfile: userProfiles.publicProfile,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      pronouns: userProfiles.pronouns,
      showEmail: userProfiles.showEmail,
      showBirthDate: userProfiles.showBirthDate,
      showBirthPlace: userProfiles.showBirthPlace,
      showPhone: userProfiles.showPhone,
      showAddress: userProfiles.showAddress,
      showOccupation: userProfiles.showOccupation,
      showCity: userProfiles.showCity,
      phone: userProfiles.phone,
      street: userProfiles.street,
      houseNumber: userProfiles.houseNumber,
      postalCode: userProfiles.postalCode,
      city: userProfiles.city,
      birthDate: userProfiles.birthDate,
      birthPlace: userProfiles.birthPlace,
      occupation: userProfiles.occupation,
      websites: userProfiles.websites,
      xUrl: userProfiles.xUrl,
      fediverseUrl: userProfiles.fediverseUrl,
      instagramUrl: userProfiles.instagramUrl,
      youtubeUrl: userProfiles.youtubeUrl,
      twitchUrl: userProfiles.twitchUrl,
      email: users.email
    })
    .from(userProfiles)
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(whereClause)
    .limit(1);

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl py-16 px-6 text-center text-slate-200">
        <p className="text-sm text-slate-400">Profil nicht gefunden oder privat.</p>
      </div>
    );
  }

  const appDomain = process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : "";
  const slugValue = profile.profileUrl || profile.userId;
  const publicUrl = `${appDomain}/u/${slugValue}`;

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 md:px-6">
      <ProfileView profile={profile as any} publicUrl={publicUrl} />
    </div>
  );
}
