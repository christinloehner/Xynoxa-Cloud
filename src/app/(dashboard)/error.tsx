/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
      <div className="text-lg font-semibold">Es ist ein Server‑Fehler aufgetreten</div>
      <div className="mt-2 text-sm">Message: {error.message || "Keine Nachricht verfügbar"}</div>
      <div className="mt-1 text-xs opacity-80">Digest: {error.digest ?? "n/a"}</div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => reset()}>
          Erneut versuchen
        </Button>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Seite neu laden
        </Button>
      </div>
    </div>
  );
}
