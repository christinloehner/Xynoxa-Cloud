/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";

// Core Entity Types
type CoreShareData =
  | { type: "file"; name: string; size: string | null; mime: string | null; downloadUrl: string; passwordRequired?: boolean }
  | { type: "folder"; name: string; items: number; downloadUrl: string; passwordRequired?: boolean }
  | { type: "note"; title: string; downloadUrl: string; passwordRequired?: boolean }
  | { type: "task"; title: string; status: string; downloadUrl: string; passwordRequired?: boolean };

// Generischer Typ für Modul-Entities (z.B. bookmark, etc.)
type ModuleShareData = { 
  type: string; 
  title?: string | null; 
  url?: string; 
  downloadUrl?: string; 
  passwordRequired?: boolean;
  [key: string]: unknown; // Zusätzliche Modul-spezifische Felder
};

type ShareData = CoreShareData | ModuleShareData;

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(`/api/share/${token}`, window.location.origin);
        if (password) url.searchParams.set("password", password);
        const res = await fetch(url.toString());
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Link ungültig oder abgelaufen");
        }
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, searchParams, password, reload]);

  if (loading) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-12 text-slate-200">
        <p>Lade Freigabe...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-12 text-slate-200">
        <h1 className="text-2xl font-semibold text-slate-50">Freigabe</h1>
        <p className="text-sm text-rose-200">{error ?? "Unbekannter Fehler"}</p>
        <PasswordPrompt
          visible={!loading}
          password={password}
          onChange={setPassword}
          onSubmit={() => { setLoading(true); setReload((r) => r + 1); }}
        />
      </main>
    );
  }

  const showPasswordPrompt = (data as any).passwordRequired && !password;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-12 text-slate-200">
      <h1 className="text-2xl font-semibold text-slate-50">Freigabe</h1>
      {showPasswordPrompt ? (
        <PasswordPrompt
          visible
          password={password}
          onChange={setPassword}
          onSubmit={() => { setLoading(true); setReload((r) => r + 1); }}
        />
      ) : (
        <>
          {data.type === "file" && (
            <Card title={(data as CoreShareData & { name: string }).name} subtitle={`${(data as any).mime || "application/octet-stream"} • ${(data as any).size ?? "—"}`} downloadUrl={(data as any).downloadUrl} />
          )}
          {data.type === "folder" && (
            <Card title={(data as any).name} subtitle={`${(data as any).items} Dateien`} downloadUrl={(data as any).downloadUrl} />
          )}
          {data.type === "note" && (
            <Card title={(data as any).title} subtitle="Markdown-Export" downloadUrl={(data as any).downloadUrl} />
          )}
          {data.type === "task" && (
            <Card title={(data as any).title} subtitle={`Status: ${(data as any).status}`} downloadUrl={(data as any).downloadUrl} />
          )}
          {/* Generischer Handler für Modul-Entities (z.B. bookmark, etc.) */}
          {!["file", "folder", "note", "task"].includes(data.type) && (
            <Card 
              title={(data as ModuleShareData).title || (data as ModuleShareData).url || data.type} 
              subtitle={(data as ModuleShareData).url || `Typ: ${data.type}`} 
              downloadUrl={(data as ModuleShareData).downloadUrl || ""} 
            />
          )}
        </>
      )}
    </main>
  );
}

function Card({ title, subtitle, downloadUrl }: { title: string; subtitle?: string; downloadUrl: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
      <p className="text-lg font-semibold text-slate-50">{title}</p>
      {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      <Button asChild>
        <a href={downloadUrl}>Download</a>
      </Button>
    </div>
  );
}

function PasswordPrompt({ visible, password, onChange, onSubmit }: { visible: boolean; password: string; onChange: (v: string) => void; onSubmit: () => void }) {
  if (!visible) return null;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 space-y-3">
      <div className="flex items-center gap-2 text-slate-200">
        <Lock size={16} />
        <span>Passwort erforderlich</span>
      </div>
      <Input
        type="password"
        placeholder="Passwort"
        value={password}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button onClick={onSubmit} disabled={!password}>
        Entsperren
      </Button>
    </div>
  );
}
