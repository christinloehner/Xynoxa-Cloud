/*
 * Copyright (C) 2025 Christin Löhner
 */

import { ReactNode } from "react";
import { AlertTriangle, Loader2, Ghost } from "lucide-react";

export function LoaderState({ label = "Lädt…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-sm text-slate-300">
      <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-300">
      <Ghost className="h-6 w-6 text-slate-500" />
      <span className="font-medium text-slate-100">{title}</span>
      {detail && <span className="text-slate-400">{detail}</span>}
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-6 text-sm text-amber-100">
      <AlertTriangle className="h-6 w-6" />
      <span className="font-medium">{title}</span>
      {detail && <span className="text-amber-200">{detail}</span>}
    </div>
  );
}
