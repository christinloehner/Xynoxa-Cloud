/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, Suspense } from "react";
import { trpc } from "@/lib/trpc-client";
import { useSearchParams } from "next/navigation";

function ResetPageContent() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [token, setToken] = useState(urlToken || "");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"request" | "confirm">(urlToken ? "confirm" : "request");
  const [info, setInfo] = useState<string | null>(null);

  const requestReset = trpc.auth.requestReset.useMutation({
    onSuccess: (data) => {
      setInfo("Eine E-Mail mit einem Reset-Link wurde an deine Adresse gesendet.");
    },
    onError: (err) => setInfo(err.message)
  });

  const confirmReset = trpc.auth.confirmReset.useMutation({
    onSuccess: () => {
      setInfo("Passwort erfolgreich zurückgesetzt. Bitte einloggen.");
    },
    onError: (err) => setInfo(err.message)
  });

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset.mutate({ email });
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    confirmReset.mutate({ token, password });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Passwort Reset</p>
        <h1 className="text-3xl font-semibold text-slate-50">Zurücksetzen</h1>
        <p className="text-sm text-slate-300">
          {step === "request"
            ? "Wir senden dir einen Link/Token zum Zurücksetzen deines Passworts."
            : "Bitte gib dein neues Passwort ein."
          }
        </p>
      </header>
      {info && <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">{info}</div>}
      {step === "request" && (
        <form onSubmit={handleRequest} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="space-y-2">
            <label className="text-sm text-slate-200">E-Mail</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <Button className="w-full" type="submit" disabled={requestReset.isPending}>
            {requestReset.isPending ? "Sende..." : "Link senden"}
          </Button>
        </form>
      )}
      {step === "confirm" && (
        <form onSubmit={handleConfirm} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="space-y-2">
            <label className="text-sm text-slate-200">Token</label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="per E-Mail erhalten" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-200">Neues Passwort</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mind. 8 Zeichen" required />
          </div>
          <Button className="w-full" type="submit" disabled={confirmReset.isPending}>
            {confirmReset.isPending ? "Speichere..." : "Passwort setzen"}
          </Button>
        </form>
      )}
      <Link href="/auth/login" className="text-sm text-cyan-300 hover:text-cyan-200">
        Zurück zum Login
      </Link>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Lade...</div>}>
      <ResetPageContent />
    </Suspense>
  );
}
