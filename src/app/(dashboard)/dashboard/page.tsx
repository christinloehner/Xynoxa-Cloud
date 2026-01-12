/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import {
  LayoutDashboard,
  File,
  Calendar,
  Shield,
  Sparkles,
  Clock,
  CheckCircle2,
  Link as LinkIcon,
  MousePointer2
} from "lucide-react";
import clsx from "clsx";

export default function DashboardPage() {
  const me = trpc.auth.me.useQuery();
  const files = trpc.files.list.useQuery({ folderId: null });
  const fileCount = trpc.files.countAll.useQuery();
  const events = trpc.calendar.listEvents.useQuery();
  const tasks = trpc.calendar.listTasks.useQuery();
  const vaultStatus = trpc.vault.status.useQuery();
  const recentNotifications = trpc.notifications.list.useQuery({ limit: 20, includeRead: true });
  const updateEvent = trpc.calendar.updateEvent.useMutation({
    onSuccess: () => events.refetch()
  });
  const deleteEvent = trpc.calendar.deleteEvent.useMutation({
    onSuccess: () => events.refetch()
  });

  const profile = trpc.profile.get.useQuery(undefined, { enabled: !!me.data?.user });

  const userName = profile.data?.displayName
    || me.data?.user?.email?.split("@")[0]
    || "Du";

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<any | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventRecurrence, setEventRecurrence] = useState("");

  const toLocalInputValue = (d: Date) => {
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  };

  const openEventModal = (ev: any) => {
    setActiveEvent(ev);
    setEventTitle(ev.title ?? "");
    setEventStart(ev.startsAt ? toLocalInputValue(new Date(ev.startsAt)) : "");
    setEventEnd(ev.endsAt ? toLocalInputValue(new Date(ev.endsAt)) : "");
    setEventLocation(ev.location ?? "");
    setEventDescription(ev.description ?? "");
    setEventRecurrence(ev.recurrence ?? "");
    setEventModalOpen(true);
  };

  const saveEvent = () => {
    if (!activeEvent) return;
    updateEvent.mutate({
      id: activeEvent.id,
      title: eventTitle,
      startsAt: eventStart ? new Date(eventStart).toISOString() : undefined,
      endsAt: eventEnd ? new Date(eventEnd).toISOString() : undefined,
      location: eventLocation || undefined,
      description: eventDescription || undefined,
      recurrence: eventRecurrence || undefined
    });
    setEventModalOpen(false);
  };

  const recentFiles = useMemo(() => (files.data ?? [])
    .slice()
    .sort((a: any, b: any) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())
    .slice(0, 5), [files.data]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return (events.data ?? [])
      .filter((e: any) => e.startsAt && new Date(e.startsAt).getTime() >= now.getTime())
      .slice()
      .sort((a: any, b: any) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 3);
  }, [events.data]);

  const colorFor = (ev: any) => ev?.calendarColor || "#45E6C5";

  const openTasks = useMemo(() => (tasks.data ?? [])
    .filter((t: any) => t.status !== "done")
    .slice()
    .sort((a: any, b: any) => new Date(a.dueAt ?? a.createdAt ?? 0).getTime() - new Date(b.dueAt ?? b.createdAt ?? 0).getTime())
    .slice(0, 4), [tasks.data]);

  const fallbackNow = useMemo(() => Date.now(), []);

  const activities = useMemo(() => {
    const items: Array<{ at: Date; label: string; link: string; external?: boolean }> = [];

    // Add file activities from implicit data (fallback for old data)
    (files.data ?? []).forEach((f: any) => items.push({
      at: new Date(f.updatedAt ?? f.createdAt ?? fallbackNow),
      label: `Datei "${f.path}" ${f.updatedAt ? "aktualisiert" : "hochgeladen"}`,
      link: `/files?file=${f.id}`
    }));

    // Add explicit file notifications (new activity logging)
    (recentNotifications.data?.items ?? []).forEach((n: any) => {
      items.push({
        at: new Date(n.createdAt ?? fallbackNow),
        label: n.body || n.title,
        link: n.href || "#"
      });
    });

    (events.data ?? []).forEach((e: any) => items.push({
      at: new Date(e.createdAt ?? e.startsAt ?? fallbackNow),
      label: `Termin "${e.title}" erstellt`,
      link: `/calendar?event=${e.id}`
    }));

    // Remove duplicates and sort by date
    return items
      .filter(i => !Number.isNaN(i.at.getTime()))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8);
  }, [files.data, events.data, recentNotifications.data]);

  return (
    <>
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-aurora-mint/12 to-xynoxa-cyan/16 p-6 md:p-8 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-xynoxa-cyan/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-aurora-mint">Dashboard</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-semibold text-slate-900 flex items-center gap-2 dark:text-white">
              <LayoutDashboard size={26} className="text-xynoxa-cyan dark:text-aurora-mint" />
              Willkommen zurück, {userName}!
            </h1>
            <p className="mt-2 text-slate-600 max-w-2xl dark:text-slate-300">
              Dein persönlicher Überblick über Dateien, Kalender, Aktivitäten und den Vault-Status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/files"><Button variant="outline" className="border-xynoxa-cyan/60 text-xynoxa-cyan">Datei hochladen</Button></Link>
            <Link href="/calendar"><Button className="bg-xynoxa-cyan text-white hover:bg-cyan-500"><Calendar size={16} className="mr-2" />Neuer Termin</Button></Link>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/files"><StatCard icon={File} label="Dateien" value={fileCount.data?.count ?? 0} accent="from-cyan-500/30 to-cyan-500/5" /></Link>
        <Link href="/calendar"><StatCard icon={Calendar} label="Kalender" value={events.data?.length ?? 0} accent="from-aurora-mint/30 to-aurora-mint/5" /></Link>
        <Link href="/vault"><StatCard icon={Shield} label="Vault" value={vaultStatus.data?.hasEnvelope ? "aktiv" : "Setup"} accent="from-amber-400/30 to-amber-400/5" /></Link>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Recent activity */}
        <Card className="border-slate-800 bg-slate-950/60">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-50 flex items-center gap-2"><Sparkles size={16} className="text-aurora-mint" />Letzte Aktivitäten</h3>
              <div className="text-sm text-slate-500 flex items-center gap-2"><MousePointer2 size={14}/>klick zum Öffnen</div>
            </div>
            <div className="space-y-3">
              {activities.map((a, idx) => {
                const wrapperProps = a.external
                  ? { href: a.link, target: "_blank", rel: "noreferrer" }
                  : { href: a.link as any };
                return (
                  <Link key={idx} {...wrapperProps} className="block group">
                    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 transition hover:-translate-y-[1px] hover:border-slate-600 hover:bg-slate-900/70">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-slate-800/60 p-2 text-aurora-mint group-hover:scale-105 transition"><LinkIcon size={16} /></div>
                        <div>
                          <p className="text-sm text-slate-100 group-hover:text-white">{a.label}</p>
                          <p className="text-xs text-slate-500">{a.at.toLocaleString("de-DE")}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {activities.length === 0 && (
                <div className="text-sm text-slate-400">Noch keine Aktivitäten.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming */}
        <div className="space-y-4">
          <Card className="border-slate-800 bg-slate-950/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-50 flex items-center gap-2"><Clock size={16} className="text-aurora-mint" />Bevorstehende Termine</h3>
                <Link href="/calendar" className="text-xs text-cyan-300">Kalender</Link>
              </div>
              {upcomingEvents.length === 0 && <p className="text-sm text-slate-500">Keine Termine in Sicht.</p>}
              {upcomingEvents.map((e: any) => (
                <Popover key={e.id}>
                  <PopoverTrigger asChild>
                    <div
                      className="relative rounded-lg border bg-slate-900/50 p-3 pl-4 cursor-pointer transition hover:border-slate-700"
                      style={{ borderColor: `${colorFor(e)}55` }}
                      onClick={() => openEventModal(e)}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 w-[6px] rounded-l-lg"
                        style={{ background: colorFor(e) }}
                      />
                      <p className="text-sm text-slate-100">{e.title}</p>
                      <p className="text-xs text-slate-500">{new Date(e.startsAt).toLocaleString("de-DE")}</p>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start">
                    <div className="space-y-1 text-sm text-slate-100">
                      <div className="font-semibold">{e.title}</div>
                      {e.location && <div className="text-xs text-slate-300">Ort: {e.location}</div>}
                      <div className="text-xs text-slate-300">
                        {new Date(e.startsAt).toLocaleString("de-DE")} – {new Date(e.endsAt).toLocaleString("de-DE")}
                      </div>
                      {e.description && <p className="text-xs text-slate-200 whitespace-pre-line">{e.description}</p>}
                      {e.recurrence && <Badge tone="cyan" className="text-[10px]">RRULE {e.recurrence}</Badge>}
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-950/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-50 flex items-center gap-2"><CheckCircle2 size={16} className="text-aurora-mint" />Offene Tasks</h3>
                <Link href="/calendar" className="text-xs text-cyan-300">Aufgaben</Link>
              </div>
              {openTasks.length === 0 && <p className="text-sm text-slate-500">Keine offenen Tasks.</p>}
              {openTasks.map((t: any) => (
                <Link key={t.id} href={`/calendar?task=${t.id}`} className="block group">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 transition hover:border-slate-700 hover:-translate-y-[1px]">
                    <p className="text-sm text-slate-100 group-hover:text-white">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {t.dueAt ? `Fällig: ${new Date(t.dueAt).toLocaleDateString("de-DE")}` : "Ohne Fälligkeitsdatum"}
                    </p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>

    <Dialog open={eventModalOpen} onOpenChange={setEventModalOpen}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-slate-50">Termin bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-200">Titel</Label>
            <Input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-100"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-200">Start</Label>
              <Input
                type="datetime-local"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-200">Ende</Label>
              <Input
                type="datetime-local"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-200">Ort</Label>
            <Input
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-100"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-200">Beschreibung</Label>
            <textarea
              value={eventDescription}
              onChange={(e) => setEventDescription(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-100 p-2 text-sm"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-200">Recurrence (RRULE optional)</Label>
            <Input
              value={eventRecurrence}
              onChange={(e) => setEventRecurrence(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEventModalOpen(false)}>Schließen</Button>
            {activeEvent && (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteEvent.mutate({ id: activeEvent.id });
                  setEventModalOpen(false);
                }}
                disabled={deleteEvent.isPending}
              >
                {deleteEvent.isPending ? "Lösche..." : "Löschen"}
              </Button>
            )}
            <Button onClick={saveEvent} disabled={!eventTitle || !eventStart || !eventEnd || updateEvent.isPending}>
              {updateEvent.isPending ? "Speichere..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent: string }) {
  return (
    <div className={clsx("rounded-2xl border border-slate-800 bg-gradient-to-br p-4 shadow-lg", accent)}>
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-slate-900/60 p-2 text-aurora-mint">
          <Icon size={18} />
        </span>
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-xl font-semibold text-slate-50">{value}</p>
        </div>
      </div>
    </div>
  );
}
