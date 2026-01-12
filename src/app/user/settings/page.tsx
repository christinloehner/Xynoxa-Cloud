/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

type CalSel = {
  calendarId: string;
  summary?: string | null;
  isSelected: boolean;
  color?: string;
  isDefault?: boolean;
  isPrimary?: boolean;
};

function UserSettingsForm({
  calendarStatus,
  connectUrl,
  syncNow,
  googleCalendars,
  refreshGoogleCalendars,
  saveGoogleCalendars,
  updateProfile,
  disconnect,
  initialCalendarSelection,
  initialSearchIndexing
}: {
  calendarStatus: ReturnType<typeof trpc.calendar.integrationStatus.useQuery>;
  connectUrl: ReturnType<typeof trpc.calendar.connectGoogleUrl.useQuery>;
  syncNow: ReturnType<typeof trpc.calendar.syncGoogle.useMutation>;
  googleCalendars: ReturnType<typeof trpc.calendar.googleCalendars.useQuery>;
  refreshGoogleCalendars: ReturnType<typeof trpc.calendar.refreshGoogleCalendars.useMutation>;
  saveGoogleCalendars: ReturnType<typeof trpc.calendar.saveGoogleCalendars.useMutation>;
  updateProfile: ReturnType<typeof trpc.profile.update.useMutation>;
  disconnect: ReturnType<typeof trpc.calendar.disconnectGoogle.useMutation>;
  initialCalendarSelection: CalSel[];
  initialSearchIndexing: boolean;
}) {
  const [calendarSelection, setCalendarSelection] = useState<CalSel[]>(initialCalendarSelection);
  const [searchIndexing, setSearchIndexing] = useState(initialSearchIndexing);
  const [reindexJobId, setReindexJobId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return (
      localStorage.getItem("xynoxa-user-reindex-job") ||
      localStorage.getItem("xynoxa-user-reindex-job")
    );
  });
  const [isStartingReindex, setIsStartingReindex] = useState(false);

  const reindexMutation = trpc.search.reindexSelf.useMutation({
    onSuccess: (data) => {
      if (!data.jobId) return;
      setReindexJobId(data.jobId);
      localStorage.setItem("xynoxa-user-reindex-job", data.jobId);
      setIsStartingReindex(false);
    },
    onError: () => {
      setIsStartingReindex(false);
    }
  });
  const { data: reindexStatus } = trpc.search.reindexStatusSelf.useQuery(
    { jobId: reindexJobId! },
    {
      enabled: !!reindexJobId,
      refetchInterval: (query) => {
        const state = query.state.data?.status;
        if (state === "completed" || state === "failed") return false;
        return 1000;
      }
    }
  );

  const handleSaveCalendars = () => {
    const withDefault = calendarSelection.some((c) => c.isDefault);
    const selection = calendarSelection.map((c, idx) => ({
      ...c,
      isDefault: withDefault ? c.isDefault : idx === 0 // fallback erster Eintrag
    }));
    saveGoogleCalendars.mutate({
      calendars: selection.map((c) => ({
        calendarId: c.calendarId,
        isSelected: c.isSelected,
        color: c.color,
        isDefault: c.isDefault
      }))
    });
  };

  const handleSearchIndexingToggle = (checked: boolean) => {
    const previous = searchIndexing;
    setSearchIndexing(checked);
    updateProfile.mutate(
      { searchAutoReindex: checked },
      { onError: () => setSearchIndexing(previous) }
    );
  };

  const handleReindex = () => {
    setIsStartingReindex(true);
    reindexMutation.mutate();
  };

  const handleClearReindex = () => {
    setReindexJobId(null);
    localStorage.removeItem("xynoxa-user-reindex-job");
    localStorage.removeItem("xynoxa-user-reindex-job");
  };

  const isReindexRunning = reindexStatus?.status === "active" || reindexStatus?.status === "waiting" || reindexStatus?.status === "delayed";
  const isReindexCompleted = reindexStatus?.status === "completed";
  const isReindexFailed = reindexStatus?.status === "failed";
  const reindexProgress = typeof reindexStatus?.progress === "number" ? reindexStatus.progress : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-xynoxa-cyan">User</p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Einstellungen</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Kalender, Suche und weitere persönliche Optionen.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white/85 shadow-md p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Kalender-Synchronisation</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Google Calendar verbinden, bidirektionale Sync.</p>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Status:{" "}
              <span className={calendarStatus.data?.connected ? "text-emerald-400" : "text-amber-300"}>
                {calendarStatus.data?.connected ? "verbunden" : "nicht verbunden"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {!calendarStatus.data?.connected ? (
              <Button
                onClick={async () => {
                  const res = await connectUrl.refetch();
                  if (res.data?.url) window.location.href = res.data.url;
                }}
              >
                Mit Google verbinden
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => syncNow.mutate()} disabled={syncNow.isPending}>
                  {syncNow.isPending ? "Sync läuft..." : "Jetzt synchronisieren"}
                </Button>
                <Button variant="outline" onClick={() => refreshGoogleCalendars.mutate()} disabled={refreshGoogleCalendars.isPending}>
                  {refreshGoogleCalendars.isPending ? "Aktualisiere..." : "Kalenderliste aktualisieren"}
                </Button>
                <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => disconnect.mutate()}>
                  Verbindung trennen
                </Button>
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Channel läuft bis {calendarStatus.data?.channelExpiresAt ? new Date(calendarStatus.data.channelExpiresAt).toLocaleString("de-DE") : "–"}
                </p>
              </>
            )}
          </div>

          {calendarStatus.data?.connected && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-300">Wähle Kalender und Farben.</p>
                <Button size="sm" variant="outline" onClick={handleSaveCalendars} disabled={saveGoogleCalendars.isPending}>
                  {saveGoogleCalendars.isPending ? "Speichere..." : "Auswahl speichern"}
                </Button>
              </div>
              <div className="space-y-2">
                {calendarSelection.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-500">Keine Kalender geladen. „Kalenderliste aktualisieren“ klicken.</p>
                )}
                {calendarSelection.map((cal) => (
                  <div key={cal.calendarId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={cal.isSelected}
                        onCheckedChange={(checked) => {
                          setCalendarSelection((prev) => prev.map((c) => (c.calendarId === cal.calendarId ? { ...c, isSelected: checked } : c)));
                        }}
                      />
                      <div>
                        <p className="text-sm text-slate-900 font-medium dark:text-slate-100">
                          {cal.summary || cal.calendarId} {cal.isPrimary ? "(Primär)" : ""}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500">{cal.calendarId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="text-xs text-slate-600 flex items-center gap-2 dark:text-slate-400">
                        Farbe
                        <input
                          type="color"
                          value={cal.color || "#45E6C5"}
                          onChange={(e) => {
                            const value = e.target.value;
                            setCalendarSelection((prev) => prev.map((c) => (c.calendarId === cal.calendarId ? { ...c, color: value } : c)));
                          }}
                          className="h-8 w-12 rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                        />
                      </label>
                      <label className="text-xs text-slate-600 flex items-center gap-2 dark:text-slate-400">
                        Standard
                        <input
                          type="radio"
                          name="defaultCalendar"
                          checked={cal.isDefault === true}
                          onChange={() => {
                            setCalendarSelection((prev) => prev.map((c) => ({ ...c, isDefault: c.calendarId === cal.calendarId })));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/85 shadow-md p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900/60">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Suche & Indexe</h3>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <div>
              <Label className="text-slate-800 dark:text-slate-200">Automatisches Reindexing</Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dateien/Notizen bei Änderungen neu indexieren.</p>
            </div>
            <Switch checked={searchIndexing} onCheckedChange={handleSearchIndexingToggle} />
          </div>
          {!reindexJobId && (
            <Button variant="outline" onClick={handleReindex} disabled={isStartingReindex}>
              {isStartingReindex && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Manuell reindexen
            </Button>
          )}
          {reindexJobId && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white/80 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Status</span>
                <span className={
                  isReindexRunning ? "text-amber-500 animate-pulse" :
                  isReindexCompleted ? "text-emerald-500" :
                  isReindexFailed ? "text-red-500" : "text-slate-400"
                }>
                  {reindexStatus?.status === "active" ? "Index läuft..." :
                    reindexStatus?.status === "waiting" ? "In Warteschlange..." :
                    reindexStatus?.status === "completed" ? "Abgeschlossen" :
                    reindexStatus?.status === "failed" ? "Fehlgeschlagen" :
                    reindexStatus?.status || "Lade..."}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-xynoxa-cyan transition-all duration-500"
                  style={{ width: `${reindexProgress}%` }}
                />
              </div>
              <div className="text-right text-xs text-slate-500 dark:text-slate-400">{reindexProgress}%</div>
              {isReindexFailed && (
                <p className="text-xs text-red-500">{reindexStatus?.failedReason ?? "Unbekannter Fehler"}</p>
              )}
              {(isReindexCompleted || isReindexFailed) && (
                <Button variant="outline" size="sm" onClick={handleClearReindex}>
                  Fertig / Ausblenden
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserSettingsPage() {
  const calendarStatus = trpc.calendar.integrationStatus.useQuery();
  const connectUrl = trpc.calendar.connectGoogleUrl.useQuery(undefined, { enabled: false });
  const syncNow = trpc.calendar.syncGoogle.useMutation();
  const googleCalendars = trpc.calendar.googleCalendars.useQuery(undefined, { enabled: !!calendarStatus.data?.connected });
  const refreshGoogleCalendars = trpc.calendar.refreshGoogleCalendars.useMutation({
    onSuccess: () => googleCalendars.refetch()
  });
  const saveGoogleCalendars = trpc.calendar.saveGoogleCalendars.useMutation({
    onSuccess: () => googleCalendars.refetch()
  });
  const profile = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => profile.refetch()
  });
  const disconnect = trpc.calendar.disconnectGoogle.useMutation({
    onSuccess: () => {
      calendarStatus.refetch();
      googleCalendars.refetch();
    }
  });

  const initialCalendarSelection = useMemo<CalSel[]>(() => {
    if (!googleCalendars.data) return [];
    return googleCalendars.data.map((c) => ({
      calendarId: c.calendarId,
      summary: c.summary,
      isSelected: c.isSelected,
      color: c.color ?? "#45E6C5",
      isDefault: c.isDefault,
      isPrimary: c.isPrimary
    }));
  }, [googleCalendars.data]);
  const initialSearchIndexing = profile.data?.searchAutoReindex ?? true;
  const formKey = useMemo(() => {
    const calKey = (googleCalendars.data ?? [])
      .map((c) => `${c.calendarId}:${c.isSelected}:${c.color ?? ""}:${c.isDefault}`)
      .join("|");
    return `${calendarStatus.data?.connected}-${calKey}-${initialSearchIndexing}`;
  }, [calendarStatus.data?.connected, googleCalendars.data, initialSearchIndexing]);

  return (
    <UserSettingsForm
      key={formKey}
      calendarStatus={calendarStatus}
      connectUrl={connectUrl}
      syncNow={syncNow}
      googleCalendars={googleCalendars}
      refreshGoogleCalendars={refreshGoogleCalendars}
      saveGoogleCalendars={saveGoogleCalendars}
      updateProfile={updateProfile}
      disconnect={disconnect}
      initialCalendarSelection={initialCalendarSelection}
      initialSearchIndexing={initialSearchIndexing}
    />
  );
}
