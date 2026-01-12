/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";
import { ProfileView } from "@/components/profile/profile-view";

export default function MyProfilePage() {
  const profile = trpc.profile.get.useQuery();
  const me = trpc.auth.me.useQuery();

  const isLoading = profile.isLoading || me.isLoading;

  if (isLoading) {
    return <div className="p-6 text-slate-400">Lade Profil...</div>;
  }

  if (!profile.data || !me.data?.user?.id) {
    return <div className="p-6 text-slate-400">Profil konnte nicht geladen werden.</div>;
  }

  const slugValue = profile.data.profileUrl || profile.data.userId;
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}` : "";
  const publicUrl = `${appDomain}/u/${slugValue}`;

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 md:px-6">
      <ProfileView
        profile={{ ...profile.data, email: me.data.user.email } as any}
        publicUrl={publicUrl}
        isOwner
      />
    </div>
  );
}
