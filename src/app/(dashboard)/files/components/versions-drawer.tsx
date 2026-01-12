/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc-client";
import { FileItem } from "../use-files-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { FileDiff, Loader2, RotateCcw } from "lucide-react";

const MonacoDiff = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), { ssr: false });

interface VersionsDrawerProps {
  file: FileItem | null;
  open: boolean;
  onClose: () => void;
}

export function VersionsDrawer({ file, open, onClose }: VersionsDrawerProps) {
  const versionsQuery = trpc.files.versions.useQuery({ fileId: file?.id || "" }, { enabled: open && !!file });
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);

  useEffect(() => {
    if (!versionsQuery.data || versionsQuery.data.length === 0) return;
    const [latest, second] = versionsQuery.data;
    setToId(latest.id);
    setFromId(second?.id ?? latest.id);
  }, [versionsQuery.data]);

  const diffQuery = trpc.files.diff.useQuery(
    { fileId: file?.id || "", fromVersionId: fromId || "", toVersionId: toId || "" },
    { enabled: !!file && !!fromId && !!toId && open }
  );

  const restore = trpc.files.restoreVersion.useMutation({ onSuccess: () => versionsQuery.refetch() });

  const versions = versionsQuery.data ?? [];
  const loading = versionsQuery.isLoading || diffQuery.isLoading;

  const selectedTo = useMemo(() => versions.find((v) => v.id === toId), [versions, toId]);

  const canRestore = !!toId && !file?.vault && !restore.isPending;

  const originalContent = diffQuery.data?.fromContent ?? "";
  const modifiedContent = diffQuery.data?.toContent ?? "";
  const language = (diffQuery.data?.mime || "text/plain").includes("json") ? "json" : "plaintext";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl h-[80vh] bg-slate-950 border-slate-800 text-slate-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDiff className="h-4 w-4 text-cyan-400" /> Versionen • {file?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[260px_1fr] gap-4 h-full">
          <div className="border border-slate-800/60 rounded-lg bg-slate-900/40 overflow-auto max-h-[70vh]">
            <div className="p-3 space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "p-3 rounded-md border transition cursor-pointer",
                    v.id === toId ? "border-cyan-500/60 bg-cyan-500/10" : "border-slate-800 hover:border-slate-700"
                  )}
                  onClick={() => setToId(v.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Version {v.version}</div>
                    <div className="text-xs text-slate-400">{v.size}</div>
                  </div>
                  <div className="text-xs text-slate-500">{format(new Date(v.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col h-full border border-slate-800/60 rounded-lg bg-slate-900/40">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60">
              <div className="text-sm text-slate-200">Diff: {selectedTo ? `v${selectedTo.version}` : "-"}</div>
              <div className="ml-auto flex gap-2 items-center">
                <Button variant="outline" size="sm" disabled={!toId || !fromId || loading} onClick={() => setFromId(toId)}>
                  Basis = Ziel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!canRestore}
                  onClick={() => toId && restore.mutate({ versionId: toId })}
                >
                  {restore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />} Wiederherstellen
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              {loading && (
                <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lade Diff ...
                </div>
              )}
              {!loading && diffQuery.data && (
                <MonacoDiff
                  original={originalContent}
                  modified={modifiedContent}
                  options={{ readOnly: true, renderSideBySide: true, automaticLayout: true, wordWrap: "on" }}
                  language={language}
                  theme="vs-dark"
                  height="100%"
                />
              )}
              {!loading && !diffQuery.data && (
                <div className="h-full flex items-center justify-center text-slate-500">Keine Änderungen zwischen den Versionen.</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
