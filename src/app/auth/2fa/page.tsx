/*
 * Copyright (C) 2025 Christin Löhner
 */

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TwoFAPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">2FA</p>
        <h1 className="text-3xl font-semibold text-slate-50">Zwei-Faktor-Code eingeben</h1>
        <p className="text-sm text-slate-300">Gib den 6-stelligen Code aus deiner Auth-App ein.</p>
      </header>
      <form className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="space-y-2">
          <label className="text-sm text-slate-200">TOTP Code</label>
          <Input inputMode="numeric" maxLength={6} placeholder="123456" />
        </div>
        <Button className="w-full">Verifizieren</Button>
      </form>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        Kein Zugriff? Nutze einen Recovery Code.
      </div>
    </div>
  );
}
