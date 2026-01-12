/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

export default function ProfileClient() {
  const me = trpc.auth.me.useQuery();
  const profile = trpc.profile.get.useQuery();
  const update = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.push({ title: "Gespeichert", description: "Profil wurde aktualisiert.", tone: "success" });
      profile.refetch();
    },
    onError: (err) => toast.push({ title: "Fehler beim Speichern", description: err.message, tone: "error" })
  });
  const toast = useToast();

  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [birthPlace, setBirthPlace] = useState("");
  const [occupation, setOccupation] = useState("");
  const [bio, setBio] = useState("");
  const [websites, setWebsites] = useState<string[]>([]);
  const [websiteInput, setWebsiteInput] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [fediverseUrl, setFediverseUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [twitchUrl, setTwitchUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarStoragePath, setAvatarStoragePath] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.displayName ?? "");
      setAvatarUrl(profile.data.avatarUrl ?? "");
      setAvatarStoragePath(profile.data.avatarStoragePath ?? null);
      setAvatarMime(profile.data.avatarMime ?? null);
      setFirstName(profile.data.firstName ?? "");
      setLastName(profile.data.lastName ?? "");
      setPronouns(profile.data.pronouns ?? "");
      setPhone(profile.data.phone ?? "");
      setStreet(profile.data.street ?? "");
      setHouseNumber(profile.data.houseNumber ?? "");
      setPostalCode(profile.data.postalCode ?? "");
      setCity(profile.data.city ?? "");
      const birth = profile.data.birthDate ? new Date(profile.data.birthDate as any) : null;
      setBirthDate(birth ? birth.toISOString().slice(0, 10) : "");
      setBirthPlace(profile.data.birthPlace ?? "");
      setOccupation(profile.data.occupation ?? "");
      setWebsites(profile.data.websites ?? []);
      setXUrl(profile.data.xUrl ?? "");
      setFediverseUrl(profile.data.fediverseUrl ?? "");
      setInstagramUrl(profile.data.instagramUrl ?? "");
      setYoutubeUrl(profile.data.youtubeUrl ?? "");
      setTwitchUrl(profile.data.twitchUrl ?? "");
      setBio(profile.data.bio ?? "");
      setPublicProfile(profile.data.publicProfile ?? false);
      setProfileUrl(profile.data.profileUrl ?? "");
    }
  }, [profile.data]);

  const handleSave = async () => {
    update.mutate({
      displayName,
      avatarUrl: avatarUrl || undefined,
      avatarStoragePath: avatarStoragePath || undefined,
      avatarMime: avatarMime || undefined,
      firstName,
      lastName,
      pronouns,
      phone,
      street,
      houseNumber,
      postalCode,
      city,
      birthDate: birthDate ? new Date(birthDate) : undefined,
      birthPlace,
      occupation,
      websites,
      xUrl,
      fediverseUrl,
      instagramUrl,
      youtubeUrl,
      twitchUrl,
      bio,
      publicProfile,
      profileUrl
    });
  };

  const setGravatar = () => {
    const email = me.data?.user?.email?.trim().toLowerCase() || "";
    const fallback = "identicon";
    if (!email) {
      setAvatarUrl("/images/avatar-default.svg");
      return;
    }
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(email)).then((buf) => {
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setAvatarUrl(`https://www.gravatar.com/avatar/${hex}?d=${fallback}`);
    });
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleAvatarUpload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/user/avatar", { method: "POST", body: form });
    if (!res.ok) {
      alert("Upload fehlgeschlagen.");
      return;
    }
    const data = await res.json();
    setAvatarStoragePath(data.storagePath);
    setAvatarMime(file.type);
    // Wir nutzen die gespeicherte Version über avatarStoragePath; leeren deshalb avatarUrl,
    // damit das Backend keinen absoluten URL-Check triggert.
    setAvatarUrl("");
  };

  const addWebsite = () => {
    if (!websiteInput.trim()) return;
    try {
      const url = new URL(websiteInput.trim());
      setWebsites((prev) => Array.from(new Set([...prev, url.toString()])));
      setWebsiteInput("");
    } catch (_) {
      alert("Bitte eine gültige URL eingeben.");
    }
  };

  const removeWebsite = (link: string) => {
    setWebsites((prev) => prev.filter((w) => w !== link));
  };

  const avatarOwnerId = profile.data?.userId || me.data?.user?.id;
  const avatarPreview = avatarUrl || (avatarStoragePath && avatarOwnerId ? `/api/avatar/${avatarOwnerId}` : "/images/avatar-default.svg");
  const publicSlug = profileUrl || me.data?.user?.id || "user";
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}` : "";
  const publicHref = `${appDomain}/u/${publicSlug}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">User</p>
        <h1 className="text-2xl font-semibold text-slate-50">Profil</h1>
        <p className="text-sm text-slate-300">Pflege dein persönliches und öffentliches Profil – klar strukturiert und vollständig.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden shadow-inner shadow-slate-900/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-200">Avatar</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={setGravatar}>Gravatar</Button>
                  <Button size="sm" type="button" variant="secondary" onClick={openFilePicker}>Upload</Button>
                  <Button size="sm" variant="outline" onClick={() => { setAvatarUrl(""); setAvatarStoragePath(null); }}>Standard</Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                    }}
                  />
                </div>
                <Input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://... (optional eigenes Bild via URL)"
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-slate-200">Anzeigename</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Wie andere dich sehen" className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Pronomen</Label>
                <Input value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="z.B. sie/ihr" className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Vorname</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Nachname</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Beruf</Label>
                <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Telefon</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">Adresse & Geburtsdaten</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-slate-200">Straße</Label>
                <Input value={street} onChange={(e) => setStreet(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Hausnummer</Label>
                <Input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">PLZ</Label>
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Ort</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Geburtsdatum</Label>
                <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Geburtsort</Label>
                <Input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">Online Präsenz</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-slate-200">X / Twitter</Label>
                <Input value={xUrl} onChange={(e) => setXUrl(e.target.value)} placeholder="https://x.com/..." className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Fediverse</Label>
                <Input value={fediverseUrl} onChange={(e) => setFediverseUrl(e.target.value)} placeholder="https://mastodon.social/@user" className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Instagram</Label>
                <Input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/..." className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">YouTube</Label>
                <Input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/@..." className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
              <div>
                <Label className="text-slate-200">Twitch</Label>
                <Input value={twitchUrl} onChange={(e) => setTwitchUrl(e.target.value)} placeholder="https://twitch.tv/..." className="mt-2 bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Webseiten</Label>
              <div className="flex gap-2">
                <Input
                  value={websiteInput}
                  onChange={(e) => setWebsiteInput(e.target.value)}
                  placeholder="https://meinportfolio.com"
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWebsite(); } }}
                />
                <Button type="button" onClick={addWebsite}>Hinzufügen</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {websites.map((w) => (
                  <span key={w} className="inline-flex items-center gap-2 rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs text-cyan-200">
                    {w}
                    <button className="text-slate-400 hover:text-slate-200" onClick={() => removeWebsite(w)}>×</button>
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3">
            <Label className="text-slate-200">Biographie</Label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={6}
              className="w-full rounded-xl bg-slate-800 border border-slate-700 text-slate-100 p-3 text-sm"
              placeholder="Schreibe ausführlich über dich, deine Arbeit, Interessen und Ziele."
            />
          </section>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? "Speichert..." : "Speichern"}
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-100 font-medium">Öffentliches Profil</p>
                <p className="text-xs text-slate-400">Erstelle eine schöne öffentliche Seite unter /u/&lt;slug&gt;.</p>
              </div>
              <Switch checked={publicProfile} onCheckedChange={setPublicProfile} />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Dein Handle (Slug)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">/u/</span>
                <Input
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  placeholder="z.B. christin"
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <p className="text-xs text-slate-500">Lasse leer für Standard: deine User-ID. Erlaubt sind Buchstaben, Zahlen, - und _.</p>
            </div>

            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-200 space-y-1">
              <p>Öffentliche URL</p>
              <code className="text-xs text-cyan-300 break-all">
                {publicProfile ? publicHref : "Deaktiviert"}
              </code>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
