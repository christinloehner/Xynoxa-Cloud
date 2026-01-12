/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type ToggleKey =
  | "showEmail"
  | "showBirthDate"
  | "showBirthPlace"
  | "showPhone"
  | "showAddress"
  | "showOccupation"
  | "showCity";

const toggles: { key: ToggleKey; title: string; description: string }[] = [
  { key: "showEmail", title: "E-Mail", description: "E-Mail-Adresse öffentlich anzeigen." },
  { key: "showPhone", title: "Telefonnummer", description: "Telefonnummer öffentlich anzeigen." },
  { key: "showAddress", title: "Adresse", description: "Straße, Hausnummer, PLZ & Ort öffentlich anzeigen." },
  { key: "showCity", title: "Ort", description: "Nur Ort/PLZ öffentlich anzeigen." },
  { key: "showBirthDate", title: "Geburtsdatum", description: "Geburtsdatum öffentlich anzeigen." },
  { key: "showBirthPlace", title: "Geburtsort", description: "Geburtsort öffentlich anzeigen." },
  { key: "showOccupation", title: "Beruf", description: "Berufsbezeichnung öffentlich anzeigen." }
];

function PrivacyForm({
  initialState,
  update
}: {
  initialState: Record<ToggleKey, boolean>;
  update: ReturnType<typeof trpc.profile.update.useMutation>;
}) {
  const [state, setState] = useState<Record<ToggleKey, boolean>>(initialState);

  const handleSave = () => {
    update.mutate(state);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Privacy</p>
        <h1 className="text-2xl font-semibold text-slate-50">Privatsphäre-Einstellungen</h1>
        <p className="text-sm text-slate-300">Steuere, welche sensiblen Daten auf deinem öffentlichen Profil sichtbar sind.</p>
      </div>

      <Card className="border-slate-800 bg-slate-900/60 text-slate-50">
        <CardHeader>
          <CardTitle className="text-lg">Öffentliche Sichtbarkeit</CardTitle>
          <CardDescription className="text-slate-400">Aktiviere nur das, was du wirklich teilen willst.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {toggles.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <div>
                <Label className="text-slate-100">{item.title}</Label>
                <p className="text-sm text-slate-400">{item.description}</p>
              </div>
              <Switch
                checked={state[item.key]}
                onCheckedChange={(v) => setState((s) => ({ ...s, [item.key]: v }))}
                disabled={update.isPending}
              />
            </div>
          ))}
          <div className="pt-2">
            <Button onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? "Speichert..." : "Speichern"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PrivacySettingsPage() {
  const toast = useToast();
  const profile = trpc.profile.get.useQuery();
  const update = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.push({ title: "Gespeichert", description: "Privatsphäre-Einstellungen aktualisiert.", tone: "success" });
      profile.refetch();
    },
    onError: (err) => toast.push({ title: "Fehler beim Speichern", description: err.message, tone: "error" })
  });

  const initialState = useMemo<Record<ToggleKey, boolean>>(() => ({
    showEmail: !!profile.data?.showEmail,
    showBirthDate: !!profile.data?.showBirthDate,
    showBirthPlace: !!profile.data?.showBirthPlace,
    showPhone: !!profile.data?.showPhone,
    showAddress: !!profile.data?.showAddress,
    showOccupation: !!profile.data?.showOccupation,
    showCity: !!profile.data?.showCity
  }), [profile.data]);
  const formKey = useMemo(() => {
    if (!profile.data) return "privacy-empty";
    return [
      profile.data.userId,
      profile.data.showEmail ? "1" : "0",
      profile.data.showBirthDate ? "1" : "0",
      profile.data.showBirthPlace ? "1" : "0",
      profile.data.showPhone ? "1" : "0",
      profile.data.showAddress ? "1" : "0",
      profile.data.showOccupation ? "1" : "0",
      profile.data.showCity ? "1" : "0"
    ].join("|");
  }, [profile.data]);

  return (
    <PrivacyForm key={formKey} initialState={initialState} update={update} />
  );
}
