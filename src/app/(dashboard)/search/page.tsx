/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SearchPage() {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "file" | "note" | "event" | "task">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [combined, setCombined] = useState<any[]>([]);
  const [mode, setMode] = useState<"fulltext" | "semantic">("fulltext");
  const router = useRouter();

  const tags = trpc.tags.list.useQuery(undefined, { enabled: !!me.data?.user });

  const search = trpc.search.query.useQuery(
    { q: query, type, tags: selectedTags, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, perPage: 12 },
    {
      enabled: mode === "fulltext" && !!me.data?.user && query.trim().length > 0
    }
  );
  const semantic = trpc.search.semantic.useQuery(
    { q: query, type, page, perPage: 10 },
    { enabled: mode === "semantic" && !!me.data?.user && query.trim().length > 0 }
  );

  const resetAnd = () => {
    setPage(1);
    setCombined([]);
  };

  const reindex = trpc.search.reindex.useMutation({
    onSuccess: (res) => {
      alert(`Re-Indexierung wurde im Hintergrund gestartet. (Job ID: ${res.jobId})`);
      resetAnd();
    },
    onError: (err) => alert(`Re-index failed: ${err.message}`)
  });

  const switchMode = (m: "fulltext" | "semantic") => {
    setMode(m);
    resetAnd();
  };

  useEffect(() => {
    if (mode === "fulltext" && search.data) {
      setCombined((prev) => (page === 1 ? search.data.items : [...prev, ...search.data.items]));
    }
    if (mode === "semantic" && semantic.data) {
      setCombined((prev) => (page === 1 ? semantic.data?.items ?? [] : [...prev, ...(semantic.data?.items ?? [])]));
    }
  }, [search.data, semantic.data, page, mode]);

  const hasMore = mode === "fulltext" ? search.data?.hasMore ?? false : semantic.data?.hasMore ?? false;

  const tagOptions = useMemo(() => tags.data?.map((t) => t.name) ?? [], [tags.data]);
  const activeQuery = mode === "fulltext" ? search : semantic;
  const isLoading = activeQuery.isFetching || activeQuery.isPending;
  const errorMessage = activeQuery.error ? activeQuery.error.message : null;

  const resolveLink = (r: any) => {
    // URLs werden jetzt via Module getSearchResultUrl Hook generiert
    // Falls ein Modul eine URL registriert hat, wird diese im Backend bereits gesetzt
    if (r.url) {
      return { href: r.url, external: false };
    }
    
    // Fallback für Core-Types
    switch (r.type) {
      case "file":
        return { href: `/files?file=${r.id}`, needsLocate: true };
      case "event":
        return { href: `/calendar?event=${r.id}` };
      case "task":
        return { href: `/calendar?task=${r.id}` };
      case "folder":
        return { href: `/files?folder=${r.id}` };
      default:
        return { href: "#" };
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Search</p>
          <h1 className="text-2xl font-semibold text-slate-50">Globale Suche</h1>
          <p className="text-sm text-slate-300">
            Volltext via Meilisearch + optional Semantic Tab mit Embeddings/pgvector.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          Ergebnisse: {combined.length}
        </div>
      </header>

      {me.data?.user?.role === "owner" && (
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("This will rebuild the entire search index. Continue?")) {
                reindex.mutate();
              }
            }}
            disabled={reindex.isPending}
          >
            {reindex.isPending ? "Rebuilding..." : "Rebuild Index"}
          </Button>
        </div>
      )}

      {!me.data?.user ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
          Bitte <Link href="/auth/login" className="underline">einloggen</Link>, um die Suche zu nutzen.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="flex flex-wrap gap-3 border-b border-slate-800 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-xs">
              <Button
                size="sm"
                variant={mode === "fulltext" ? "default" : "outline"}
                onClick={() => switchMode("fulltext")}
              >
                Volltext
              </Button>
              <Button
                size="sm"
                variant={mode === "semantic" ? "default" : "outline"}
                onClick={() => switchMode("semantic")}
              >
                Semantic
              </Button>
            </div>
            <Input
              className="max-w-sm"
              placeholder="Suche nach Dateien, Projekten, Aufgaben..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetAnd();
              }}
            />
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Typ:</span>
              {["all", "file", "note", "event", "task"].map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setType(t as any);
                    resetAnd();
                  }}
                  className={`rounded px-2 py-1 capitalize transition ${type === t ? "bg-cyan-500/20 text-cyan-100" : "bg-slate-800 text-slate-300 hover:bg-slate-800/80"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Tags:</span>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() =>
                        setSelectedTags((prev) => {
                          const next = active ? prev.filter((t) => t !== tag) : [...prev, tag];
                          resetAnd();
                          return next;
                        })
                      }
                      className={`rounded px-2 py-1 transition ${active ? "bg-emerald-500/20 text-emerald-100" : "bg-slate-800 text-slate-300 hover:bg-slate-800/80"}`}
                    >
                      {tag}
                    </button>
                  );
                })}
                {tagOptions.length === 0 && <span className="text-slate-600">Keine Tags</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Datum:</span>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); resetAnd(); }} className="w-36" />
              <span className="text-slate-600">bis</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); resetAnd(); }} className="w-36" />
            </div>
          </div>
          <div className="divide-y divide-slate-800">
            {combined.map((r) => {
              const link = resolveLink(r);
              const isFileWithLocate = r.type === "file" && link.needsLocate;

              const handleClick = async (e: React.MouseEvent) => {
                if (link.external) return; // native navigation
                e.preventDefault();
                if (isFileWithLocate) {
                  try {
                    const meta = await utils.files.locate.fetch({ id: r.id });
                    if (!meta) throw new Error("Locate response leer");

                    const folderParam = meta.folderId || meta.groupFolderId;
                    const qs = new URLSearchParams();
                    if (folderParam) qs.set("folder", folderParam);
                    qs.set("file", r.id);
                    router.push(`/files?${qs.toString()}`);
                  } catch (err) {
                    alert((err as Error).message || "Locate fehlgeschlagen");
                  }
                } else {
                  if (link.href === "#") return;
                  router.push(link.href);
                }
              };

              if (link.external) {
                return (
                  <a
                    key={`${r.id}-${r.title}`}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <ResultRow r={r} />
                  </a>
                );
              }

              return (
                <button
                  key={`${r.id}-${r.title}`}
                  onClick={handleClick}
                  className="block w-full text-left"
                >
                  <ResultRow r={r} />
                </button>
              );
            })}
            {isLoading && query && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">Suche läuft…</div>
            )}
            {!isLoading && errorMessage && (
              <div className="px-4 py-6 text-center text-sm text-rose-300">
                Suche fehlgeschlagen: {errorMessage}
              </div>
            )}
            {!isLoading && !errorMessage && combined.length === 0 && query && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">Keine Treffer gefunden.</div>
            )}
          </div>
          {hasMore && (
            <div className="border-t border-slate-800 px-4 py-3 text-right">
              <Button
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={mode === "fulltext" ? search.isFetching : semantic.isFetching}
              >
                {mode === "fulltext"
                  ? search.isFetching
                    ? "Lädt..."
                    : "Mehr laden"
                  : semantic.isFetching
                    ? "Lädt..."
                    : "Mehr laden"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ score }: { score?: number | null }) {
  if (score == null) return <Badge className="bg-slate-800 text-slate-200">Semantic n/a</Badge>;
  // score kommt bereits normalisiert (0..1) aus dem Backend (1 / (1 + distance))
  const normalized = Math.min(1, Math.max(0, score));
  const label = normalized >= 0.66 ? "High" : normalized >= 0.4 ? "Medium" : "Low";
  const color =
    normalized >= 0.75
      ? "bg-emerald-500/20 text-emerald-100 border border-emerald-500/50"
      : normalized >= 0.45
        ? "bg-amber-500/20 text-amber-100 border border-amber-500/50"
        : "bg-rose-500/20 text-rose-100 border border-rose-500/50";
  return (
    <Badge className={color}>
      Semantic {label}
    </Badge>
  );
}

function ResultRow({ r }: { r: any }) {
  return (
    <div className="px-4 py-3 text-sm text-slate-100 hover:bg-slate-800/70 hover:-translate-y-[1px] transition">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{r.title}</p>
          <p className="text-xs text-slate-400">{r.snippet}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <Badge tone="cyan" className="border border-cyan-500/60 text-cyan-100 uppercase bg-transparent">
              {r.type}
            </Badge>
            {r.tags?.map((tag: string) => (
              <Badge key={tag} className="border border-slate-700 bg-slate-800 text-slate-200">
                {tag}
              </Badge>
            ))}
            {r.createdAt && <span>{new Date(r.createdAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ConfidenceBadge score={r.confidence} />
        </div>
      </div>
    </div>
  );
}
