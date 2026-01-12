/*
 * Copyright (C) 2025 Christin Löhner
 */

import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Globe2, Phone, MapPin, Link2, Instagram, Twitch, Youtube, Radio } from "lucide-react";

type ProfileData = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarStoragePath: string | null;
  avatarMime: string | null;
  bio: string | null;
  publicProfile: boolean | null;
  profileUrl: string | null;
  showEmail?: boolean | null;
  showBirthDate?: boolean | null;
  showBirthPlace?: boolean | null;
  showPhone?: boolean | null;
  showAddress?: boolean | null;
  showOccupation?: boolean | null;
  showCity?: boolean | null;
  firstName: string | null;
  lastName: string | null;
  pronouns: string | null;
  phone: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  birthDate: Date | string | null;
  birthPlace: string | null;
  occupation: string | null;
  websites: string[] | null;
  xUrl: string | null;
  fediverseUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  twitchUrl: string | null;
  email?: string | null;
};

export function ProfileView({ profile, publicUrl, isOwner }: { profile: ProfileData; publicUrl?: string; isOwner?: boolean }) {
  const avatarSrc =
    profile.avatarUrl ||
    (profile.avatarStoragePath ? `/api/avatar/${profile.userId}` : "/images/avatar-default.svg");

  const formattedBirthDate = profile.birthDate ? format(new Date(profile.birthDate), "dd. MMMM yyyy", { locale: de }) : null;

  const address = [profile.street && `${profile.street} ${profile.houseNumber || ""}`.trim(), [profile.postalCode, profile.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const showEmail = !!profile.showEmail;
  const showBirthDate = !!profile.showBirthDate;
  const showBirthPlace = !!profile.showBirthPlace;
  const showPhone = !!profile.showPhone;
  const showAddress = !!profile.showAddress;
  const showOccupation = !!profile.showOccupation;
  const showCity = !!profile.showCity;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-2xl">
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative px-6 py-10 md:px-10 md:py-12 space-y-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg shadow-cyan-900/30 ring-2 ring-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarSrc} alt={profile.displayName || "Avatar"} className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Profil</p>
              <h1 className="text-3xl font-semibold text-slate-50">{profile.displayName || "Ohne Namen"}</h1>
              {(profile.pronouns || (showOccupation && profile.occupation)) && (
                <p className="text-sm text-slate-400">
                  {[profile.pronouns, showOccupation ? profile.occupation : null].filter(Boolean).join(" · ")}
                </p>
              )}
              {!profile.publicProfile && isOwner && (
                <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
                  Privat · aktiviere Öffentlich in deinen Profil-Einstellungen
                </span>
              )}
            </div>
          </div>
          {publicUrl && isOwner && (
            <div className="text-right space-y-1">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Öffentliche URL</p>
              <a href={publicUrl} className="text-sm text-cyan-300 hover:text-cyan-100 break-all" target="_blank" rel="noreferrer">
                {publicUrl}
              </a>
            </div>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {profile.bio ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-slate-50 leading-relaxed whitespace-pre-wrap shadow-inner shadow-slate-950/40">
                {profile.bio}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
                Keine Bio hinterlegt.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Vorname", value: profile.firstName },
                  { label: "Nachname", value: profile.lastName },
                  { label: "Pronomen", value: profile.pronouns },
                  { label: "Beruf", value: showOccupation ? profile.occupation : null },
                  { label: "Ort", value: showCity ? profile.city : null },
                  { label: "Geburtsort", value: showBirthPlace ? profile.birthPlace : null }
                ]
                  .filter((item) => item.value)
                  .map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                      <p className="text-xs uppercase text-slate-400">{item.label}</p>
                      <p className="text-sm text-slate-100">{item.value}</p>
                    </div>
                  ))}
              {formattedBirthDate && showBirthDate && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                  <p className="text-xs uppercase text-slate-400">Geburtsdatum</p>
                  <p className="text-sm text-slate-100">{formattedBirthDate}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-100">Kontakt</p>
              {address && showAddress && (
                <p className="flex items-start gap-2 text-sm text-slate-300">
                  <MapPin size={14} className="text-cyan-300 mt-0.5" />
                  <span>{address}</span>
                </p>
              )}
              {profile.phone && showPhone && (
                <p className="flex items-center gap-2 text-sm text-slate-300">
                  <Phone size={14} className="text-cyan-300" />
                  {profile.phone}
                </p>
              )}
              {profile.email && showEmail && (
                <p className="flex items-center gap-2 text-sm text-slate-300">
                  <Link2 size={14} className="text-cyan-300" />
                  <a href={`mailto:${profile.email}`} className="hover:text-cyan-200">{profile.email}</a>
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
              <p className="text-sm font-semibold text-slate-100">Links</p>
              <div className="space-y-2 text-sm text-cyan-200">
                {profile.websites?.map((w) => (
                  <a key={w} href={w} className="block truncate hover:text-cyan-100" target="_blank" rel="noreferrer">
                    <Globe2 size={14} className="inline mr-1 text-cyan-300" />
                    {w}
                  </a>
                ))}
                {profile.xUrl && (
                  <a href={profile.xUrl} className="block hover:text-cyan-100" target="_blank" rel="noreferrer">
                    <Radio size={14} className="inline mr-1 text-cyan-300" />𝕏 / Twitter
                  </a>
                )}
                {profile.fediverseUrl && (
                  <a href={profile.fediverseUrl} className="block hover:text-cyan-100" target="_blank" rel="noreferrer">
                    <Radio size={14} className="inline mr-1 text-cyan-300" />Fediverse
                  </a>
                )}
                {profile.instagramUrl && (
                  <a href={profile.instagramUrl} className="block hover:text-cyan-100" target="_blank" rel="noreferrer">
                    <Instagram size={14} className="inline mr-1 text-cyan-300" />Instagram
                  </a>
                )}
                {profile.youtubeUrl && (
                  <a href={profile.youtubeUrl} className="block hover:text-cyan-100" target="_blank" rel="noreferrer">
                    <Youtube size={14} className="inline mr-1 text-cyan-300" />YouTube
                  </a>
                )}
                {profile.twitchUrl && (
                  <a href={profile.twitchUrl} className="block hover:text-cyan-100" target="_blank" rel="noreferrer">
                    <Twitch size={14} className="inline mr-1 text-cyan-300" />Twitch
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
