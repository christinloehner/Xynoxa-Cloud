/*
 * Copyright (C) 2025 Christin Löhner
 */

import { Badge } from "@/components/ui/badge";
import { LoaderState } from "@/components/ui/state-cards";

const steps = [
  "Env aus .env.example setzen (APP_URL, DB, Meili, MinIO, Secrets)",
  "docker compose up --build starten (Traefik proxy Netzwerk)",
  "Ersten User registrieren, 2FA optional aktivieren",
  "Files/Notes anlegen, Module aktivieren, Suche testen",
  "Vault-Key setzen und verschlüsselte Bereiche prüfen"
];

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-aurora-mint">Onboarding</p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50">Start in unter 5 Minuten</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Folgen Sie der Checkliste, um Xynoxa lokal via Docker/Traefik zu booten und sofort eine
          klickbare Oberfläche zu haben.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-aurora-mint/12 to-xynoxa-cyan/10 p-5 shadow-md dark:border-slate-800 dark:bg-slate-900/60">
          <ol className="space-y-3 text-sm text-slate-800 dark:text-slate-200">
            {steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="mt-[2px] h-5 w-5 rounded-full border border-xynoxa-cyan/30 bg-xynoxa-cyan/10 text-center text-xs text-xynoxa-cyan dark:border-aurora-mint/50 dark:bg-aurora-mint/15 dark:text-aurora-mint">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="cyan">Docker Compose</Badge>
            <Badge tone="emerald">Traefik proxy</Badge>
            <Badge tone="slate">Postgres + Meili</Badge>
            <Badge tone="amber">Vault Client-Side Crypto</Badge>
          </div>
        </div>

        <div className="space-y-3">
          <LoaderState label="Compose stack wird vorbereitet…" />
          <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            Tipp: `npm run dev` für reines Frontend-Iterieren, `docker compose up --build` für den
            vollen Stack.
          </div>
        </div>
      </div>
    </div>
  );
}
