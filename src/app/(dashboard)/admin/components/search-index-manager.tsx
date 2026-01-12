/*
 * Copyright (C) 2025 Christin Löhner
 */


"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SearchIndexManager({ compact = false }: { compact?: boolean }) {
    const [jobId, setJobId] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return (
            localStorage.getItem("xynoxa-reindex-job") ||
            localStorage.getItem("xynoxa-reindex-job")
        );
    });
    const [isStarting, setIsStarting] = useState(false);

    const reindexMutation = trpc.search.reindex.useMutation({
        onSuccess: (data) => {
            if (!data.jobId) return;
            setJobId(data.jobId);
            localStorage.setItem("xynoxa-reindex-job", data.jobId);
            toast.success("Re-Indexierung gestartet");
            setIsStarting(false);
        },
        onError: (err) => {
            toast.error("Fehler beim Starten: " + err.message);
            setIsStarting(false);
        }
    });

    const { data: status } = trpc.search.reindexStatus.useQuery(
        { jobId: jobId! },
        { 
            enabled: !!jobId,
            refetchInterval: (query) => {
                const state = query.state.data?.status;
                if (state === "completed" || state === "failed") return false;
                return 1000; // Poll every second
            }
        }
    );

    const handleReindex = () => {
        setIsStarting(true);
        reindexMutation.mutate();
    };

    const handleClear = () => {
        setJobId(null);
        localStorage.removeItem("xynoxa-reindex-job");
        localStorage.removeItem("xynoxa-reindex-job");
    };

    const isRunning = status?.status === "active" || status?.status === "waiting" || status?.status === "delayed";
    const isCompleted = status?.status === "completed";
    const isFailed = status?.status === "failed";
    const progress = typeof status?.progress === "number" ? status.progress : 0;

    return (
        <div className={compact ? "space-y-4" : "rounded-xl border border-slate-800 bg-slate-900/40 p-4"}>
            <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-cyan-400" />
                <span className="text-slate-100 font-semibold">Suchindex Verwaltung</span>
            </div>

            <p className="text-sm text-slate-400">
                Hier kannst du den Suchindex (MeiliSearch & Vektor-Datenbank) vollständig neu aufbauen lassen.
                Die Reindexierung läuft im Hintergrund.
            </p>

            {!jobId && (
                <Button 
                    onClick={handleReindex} 
                    disabled={isStarting}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                    {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Index neu aufbauen
                </Button>
            )}

            {jobId && (
                <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-200">Status: </span>
                        <span className={
                            isRunning ? "text-amber-400 animate-pulse" :
                            isCompleted ? "text-green-400" :
                            isFailed ? "text-red-400" : "text-slate-400"
                        }>
                            {status?.status === "active" ? "Verarbeite..." : 
                             status?.status === "waiting" ? "Warteschlange..." :
                             status?.status === "completed" ? "Abgeschlossen" :
                             status?.status === "failed" ? "Fehlgeschlagen" : status?.status || "Lade..."}
                        </span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                        <div 
                            className="h-full bg-cyan-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="text-right text-xs text-slate-400">{progress}%</div>

                    {isFailed && (
                         <p className="text-xs text-red-400">Grund: {status?.failedReason}</p>
                    )}

                    {(isCompleted || isFailed) && (
                        <Button variant="outline" size="sm" onClick={handleClear} className="w-full mt-2 border-slate-600 text-slate-300 hover:bg-slate-700">
                            Fertig / Ausblenden
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
