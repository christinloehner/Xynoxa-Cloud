/*
 * Copyright (C) 2025 Christin Löhner
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, HardDrive, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

type JobType = "orphan" | "reset";

export function DatabaseMaintenance() {
    const [jobIds, setJobIds] = useState<{ orphan?: string | null; reset?: string | null }>(() => {
        if (typeof window === "undefined") return {};
        const orphanId =
            localStorage.getItem("xynoxa-maint-orphan") ||
            localStorage.getItem("xynoxa-maint-orphan");
        const resetId =
            localStorage.getItem("xynoxa-maint-reset") ||
            localStorage.getItem("xynoxa-maint-reset");
        return { orphan: orphanId, reset: resetId };
    });
    const [isStarting, setIsStarting] = useState<{ orphan?: boolean; reset?: boolean }>({});
    const [folderName, setFolderName] = useState("");
    const [searchName, setSearchName] = useState<string | null>(null);
    const [folderResults, setFolderResults] = useState<{ id: string; name: string; path: string }[]>([]);

    const statusOrphan = trpc.maintenance.status.useQuery(
        { jobId: jobIds.orphan! },
        { enabled: !!jobIds.orphan, refetchInterval: statusRefetch }
    );
    const statusReset = trpc.maintenance.status.useQuery(
        { jobId: jobIds.reset! },
        { enabled: !!jobIds.reset, refetchInterval: statusRefetch }
    );

    const orphanMutation = trpc.maintenance.startOrphanRepair.useMutation({
        onSuccess: (data) => {
            persistJob("orphan", data.jobId, setJobIds);
            setIsStarting((s) => ({ ...s, orphan: false }));
            toast.success("Orphan-Reparatur gestartet");
        },
        onError: (err) => {
            setIsStarting((s) => ({ ...s, orphan: false }));
            toast.error(err.message);
        }
    });

    const resetMutation = trpc.maintenance.startFullReset.useMutation({
        onSuccess: (data) => {
            persistJob("reset", data.jobId, setJobIds);
            setIsStarting((s) => ({ ...s, reset: false }));
            toast.success("Globaler Reset gestartet");
        },
        onError: (err) => {
            setIsStarting((s) => ({ ...s, reset: false }));
            toast.error(err.message);
        }
    });

    const findFoldersQuery = trpc.maintenance.findFoldersByName.useQuery(
        { name: searchName ?? "" },
        { enabled: !!searchName }
    );

    const deleteFolderMutation = trpc.maintenance.forceDeleteFolder.useMutation({
        onSuccess: (_data, variables) => {
            toast.success("Ordner gelöscht.");
            setFolderResults((items) => items.filter((i) => i.id !== variables.id));
        },
        onError: (err) => {
            toast.error(err.message);
        }
    });

    const startOrphan = () => {
        setIsStarting((s) => ({ ...s, orphan: true }));
        orphanMutation.mutate();
    };

    const startReset = () => {
        const text = prompt('Sicher? Tippe bitte genau: DELETE ALL FILES');
        if (text !== "DELETE ALL FILES") {
            toast.error("Abgebrochen. Bestätigung fehlt.");
            return;
        }
        setIsStarting((s) => ({ ...s, reset: true }));
        resetMutation.mutate({ confirm: text });
    };

    const findFolders = () => {
        const name = folderName.trim();
        if (!name) {
            toast.error("Bitte Ordnernamen eingeben.");
            return;
        }
        setSearchName(name);
    };

    const forceDelete = (id: string) => {
        const text = prompt('Sicher? Tippe bitte genau: DELETE FOLDER');
        if (text !== "DELETE FOLDER") {
            toast.error("Abgebrochen. Bestätigung fehlt.");
            return;
        }
        deleteFolderMutation.mutate({ id, confirm: text });
    };

    useEffect(() => {
        if (!findFoldersQuery.data) return;
        const items = findFoldersQuery.data.items ?? [];
        setFolderResults(items);
        if (!items.length) {
            toast.message("Keine Ordner gefunden.");
        }
    }, [findFoldersQuery.data]);

    const orphanState = jobState(statusOrphan.data);
    const resetState = jobState(statusReset.data);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-amber-400" />
                <span className="text-slate-100 font-semibold">Datenbank Maintenance</span>
            </div>
            <p className="text-sm text-slate-400">
                Reparatur und Reset von Dateieinträgen. Läuft im Hintergrund über den Worker.
            </p>

            <div className="space-y-2 rounded-lg border border-slate-800/70 bg-slate-800/40 p-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-200 font-medium">Verwaiste Dateien reparieren</p>
                        <p className="text-xs text-slate-400">Scant Storage, legt DB-Einträge & Journal an.</p>
                    </div>
                    <Button
                        size="sm"
                        onClick={startOrphan}
                        disabled={isStarting.orphan || orphanState.running}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {isStarting.orphan && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Starten
                    </Button>
                </div>
                {orphanState.show && (
                    <StatusBar state={orphanState} onClear={() => clearJob("orphan", setJobIds)} />
                )}
            </div>

            <div className="space-y-2 rounded-lg border border-red-900/50 bg-red-900/20 p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                        <div>
                            <p className="text-sm text-red-100 font-semibold">Alle Dateien löschen (Hard Reset)</p>
                            <p className="text-xs text-red-200/80">
                                Entfernt Dateien in DB & Storage, setzt Journal auf 0. Nutzer bleiben bestehen.
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={startReset}
                        disabled={isStarting.reset || resetState.running}
                    >
                        {isStarting.reset && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Löschen
                    </Button>
                </div>
                {resetState.show && (
                    <StatusBar state={resetState} onClear={() => clearJob("reset", setJobIds)} danger />
                )}
            </div>

            <div className="space-y-3 rounded-lg border border-amber-900/40 bg-amber-900/10 p-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-300" />
                    <div>
                        <p className="text-sm text-amber-100 font-semibold">Ordner gezielt löschen (Fallback)</p>
                        <p className="text-xs text-amber-200/80">
                            Nur verwenden, wenn ein Ordner im UI nicht löschbar ist.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Input
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        placeholder="Ordnername (exakt)"
                        className="bg-slate-900/40 border-slate-700"
                    />
                    <Button
                        size="sm"
                        onClick={findFolders}
                        disabled={findFoldersQuery.isFetching}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        {findFoldersQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Suchen
                    </Button>
                </div>
                {folderResults.length > 0 && (
                    <div className="space-y-2 text-xs text-amber-100/90">
                        {folderResults.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-900/30 bg-amber-950/30 p-2">
                                <div className="min-w-0">
                                    <p className="truncate text-amber-100">{item.path}</p>
                                    <p className="truncate text-amber-200/70">{item.id}</p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => forceDelete(item.id)}
                                    disabled={deleteFolderMutation.isPending}
                                >
                                    Löschen
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

type Status = { status?: string; progress?: number; failedReason?: string };
type JobState = {
    running: boolean;
    completed: boolean;
    failed: boolean;
    progress: number;
    reason?: string;
    show: boolean;
};

const jobState = (data?: Status): JobState => {
    const running = data?.status === "active" || data?.status === "waiting" || data?.status === "delayed";
    const completed = data?.status === "completed";
    const failed = data?.status === "failed";
    return {
        running,
        completed,
        failed,
        progress: typeof data?.progress === "number" ? data.progress : 0,
        reason: data?.failedReason,
        show: !!data
    };
};

const statusRefetch = (query: any) => {
    const state = query.state.data?.status;
    if (state === "completed" || state === "failed") return false;
    return 1000;
};

const persistJob = (
    type: JobType,
    id: string,
    setJobIds: React.Dispatch<React.SetStateAction<{ orphan?: string | null; reset?: string | null }>>
) => {
    const key = type === "orphan" ? "xynoxa-maint-orphan" : "xynoxa-maint-reset";
    localStorage.setItem(key, id);
    setJobIds((s) => ({ ...s, [type]: id }));
};

const clearJob = (
    type: JobType,
    setJobIds: React.Dispatch<React.SetStateAction<{ orphan?: string | null; reset?: string | null }>>
) => {
    const key = type === "orphan" ? "xynoxa-maint-orphan" : "xynoxa-maint-reset";
    localStorage.removeItem(key);
    localStorage.removeItem(type === "orphan" ? "xynoxa-maint-orphan" : "xynoxa-maint-reset");
    setJobIds((s) => ({ ...s, [type]: null }));
};

function StatusBar({ state, onClear, danger = false }: { state: JobState; onClear: () => void; danger?: boolean }) {
    const color = danger
        ? state.failed
            ? "text-red-300"
            : state.completed
                ? "text-red-200"
                : "text-red-200 animate-pulse"
        : state.failed
            ? "text-red-300"
            : state.completed
                ? "text-emerald-300"
                : "text-amber-300 animate-pulse";

    const bg = danger ? "bg-red-500" : "bg-cyan-500";

    return (
        <div className="space-y-2 rounded-md border border-slate-700 bg-slate-800/60 p-3">
            <div className="flex items-center justify-between text-sm">
                <span className="text-slate-200">Status</span>
                <span className={color}>
                    {state.running ? "Läuft..." :
                     state.completed ? "Fertig" :
                     state.failed ? "Fehlgeschlagen" : "Wartet..."}
                </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                <div className={`${bg} h-full transition-all duration-500`} style={{ width: `${state.progress}%` }} />
            </div>
            <div className="text-right text-xs text-slate-400">{state.progress}%</div>
            {state.failed && state.reason && (
                <p className="text-xs text-red-300">Grund: {state.reason}</p>
            )}
            {(state.completed || state.failed) && (
                <Button variant="outline" size="sm" className="w-full border-slate-600 text-slate-200 hover:bg-slate-700" onClick={onClear}>
                    Fertig / Ausblenden
                </Button>
            )}
        </div>
    );
}
