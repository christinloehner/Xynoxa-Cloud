/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";
import { useRef, useState, useMemo, type CSSProperties } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import Link from "next/link";
import { Calendar, CheckCircle2, Circle, Download, Pencil, Trash2, Plus, Clock, Upload, List, LayoutGrid, CalendarDays, CalendarRange, CalendarCheck, Share2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShareDialog } from "@/components/share/share-dialog";
import { useSearchParams } from "next/navigation";

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const me = trpc.auth.me.useQuery();
  const eventsQuery = trpc.calendar.listEvents.useQuery();
  const tasksQuery = trpc.calendar.listTasks.useQuery();
  const createEvent = trpc.calendar.createEvent.useMutation({
    onSuccess: () => {
      eventsQuery.refetch();
      setEventOpen(false);
      setEventTitle("");
      setEventLocation("");
      setEventDescription("");
      setEventStart("");
      setEventEnd("");
      setEventRecurrence("");
    }
  });
  const deleteEvent = trpc.calendar.deleteEvent.useMutation({
    onSuccess: () => eventsQuery.refetch()
  });
  const updateEvent = trpc.calendar.updateEvent.useMutation({
    onSuccess: () => eventsQuery.refetch()
  });
  const createTask = trpc.calendar.createTask.useMutation({
    onSuccess: () => {
      tasksQuery.refetch();
      setTaskOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskDue("");
      setTaskAssignee("");
    }
  });
  const updateTask = trpc.calendar.updateTask.useMutation({
    onSuccess: () => {
      tasksQuery.refetch();
      setEditTaskOpen(false);
      setAutoTaskId(null);
      setSelectedTask(null);
    }
  });
  const deleteTask = trpc.calendar.deleteTask.useMutation({
    onSuccess: () => tasksQuery.refetch()
  });
  const toggleStatus = trpc.calendar.toggleTaskStatus.useMutation({
    onSuccess: () => tasksQuery.refetch()
  });
  const exportICS = trpc.calendar.exportICS.useQuery(undefined, { enabled: false });
  const importICS = trpc.calendar.importICS.useMutation({
    onSuccess: (data) => {
      setImportInfo(`ICS importiert: ${data.importedEvents} Events, ${data.importedTasks} Tasks`);
      eventsQuery.refetch();
      tasksQuery.refetch();
    },
    onError: (err) => setImportInfo(err.message || "Import fehlgeschlagen")
  });

  const [eventOpen, setEventOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editTaskOpen, setEditTaskOpen] = useState(false);
  const [view, setView] = useState<"list" | "workweek" | "week" | "month" | "year">("week");
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventRecurrence, setEventRecurrence] = useState("");
  const [editEventTitle, setEditEventTitle] = useState<string | null>(null);
  const [editEventLocation, setEditEventLocation] = useState<string | null>(null);
  const [editEventDescription, setEditEventDescription] = useState<string | null>(null);
  const [editEventStart, setEditEventStart] = useState<string | null>(null);
  const [editEventEnd, setEditEventEnd] = useState<string | null>(null);
  const [editEventRecurrence, setEditEventRecurrence] = useState<string | null>(null);
  const [hoverEventId, setHoverEventId] = useState<string | null>(null);
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<any | null>(null);
  const [autoEventId, setAutoEventId] = useState<string | null>(() => searchParams.get("event"));
  const [autoTaskId, setAutoTaskId] = useState<string | null>(() => searchParams.get("task"));
  const [dragEventId, setDragEventId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [shareTask, setShareTask] = useState<any | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportICS = async () => {
    const result = await exportICS.refetch();
    if (!result.data) return;

    const blob = new Blob([result.data], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xynoxa-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEditTask = (task: any) => {
    setSelectedTask(task);
    setEditTaskOpen(true);
    setAutoTaskId(null);
  };

  const handleUpdateTask = () => {
    const targetTask = selectedTask ?? taskInView;
    if (!targetTask) return;
    updateTask.mutate({
      id: targetTask.id,
      title: targetTask.title,
      description: targetTask.description || undefined,
      status: targetTask.status,
      dueAt: targetTask.dueAt
        ? new Date(targetTask.dueAt).toISOString().slice(0, 10)
        : undefined,
      assigneeId: targetTask.assigneeId || undefined
    });
  };

  const handleICSFile = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    importICS.mutate({ ics: text });
  };

  const events = useMemo(() => (eventsQuery.data as any[]) ?? [], [eventsQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data as any[]) ?? [], [tasksQuery.data]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const autoEvent = useMemo(
    () => (autoEventId ? events.find((e) => e.id === autoEventId) ?? null : null),
    [events, autoEventId]
  );
  const autoTask = useMemo(
    () => (autoTaskId ? tasks.find((t) => t.id === autoTaskId) ?? null : null),
    [tasks, autoTaskId]
  );
  const eventInView = activeEvent ?? autoEvent;
  const taskInView = selectedTask ?? autoTask;
  const eventDialogOpen = eventDetailOpen || (!!autoEvent && !eventDetailOpen);
  const taskDialogOpen = editTaskOpen || (!!autoTask && !editTaskOpen);

  const updateTaskDraft = (patch: Partial<any>) => {
    if (!taskInView && !selectedTask) return;
    setSelectedTask((prev: any) => ({ ...(prev ?? taskInView), ...patch }));
  };

  const handleTaskDialogChange = (open: boolean) => {
    if (!open) {
      setEditTaskOpen(false);
      setAutoTaskId(null);
      setSelectedTask(null);
      return;
    }
    setEditTaskOpen(true);
    if (!selectedTask && taskInView) setSelectedTask(taskInView);
  };
  const colorFor = (ev: any) => ev?.calendarColor || "#45E6C5";

  const [focusDate, setFocusDate] = useState<Date>(today);

  const startOfWeek = (date: Date, firstDay = 1) => {
    const d = new Date(date);
    const diff = (d.getDay() + 7 - firstDay) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const dayRange = (start: Date, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const eventsOnDay = (day: Date) =>
    events.filter((event) => {
      const start = new Date(event.startsAt);
      return isSameDay(start, day);
    });
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const isPast = (d: Date) => d.getTime() < today.getTime();
  const hourSlots = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);
  const HOUR_HEIGHT = 29; // px pro Stunde (etwas großzügiger)
  const GRID_HEIGHT = HOUR_HEIGHT * 24; // 696px
  const COLUMN_HEADER = 32; // weekday+date header height
  const ALLDAY_HEIGHT = 32; // all-day lane height
  const HEADER_MARGIN = 4; // Tailwind mb-1 -> 0.25rem
  const ALLDAY_MARGIN = 8; // Tailwind mb-2 -> 0.5rem
  const TIME_SPACER = 86; // fixer Spacer für Zeitspalte (Header + All-Day + Margin)

  const weekStart = startOfWeek(focusDate, 1);
  const workweekDays = dayRange(weekStart, 5);
  const weekDays = dayRange(weekStart, 7);

  const monthGridStart = startOfWeek(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1), 1);
  const monthDays = dayRange(monthGridStart, 42);
  const currentYear = focusDate.getFullYear();

  const goWeek = (delta: number) => setFocusDate((d) => {
    const n = new Date(d);
    n.setDate(n.getDate() + delta * 7);
    return n;
  });
  const goYear = (delta: number) => setFocusDate((d) => {
    const n = new Date(d);
    n.setFullYear(n.getFullYear() + delta);
    return n;
  });
  const goMonth = (delta: number) => setFocusDate((d) => {
    const n = new Date(d);
    n.setMonth(n.getMonth() + delta);
    return n;
  });

  const isAllDay = (start: Date, end: Date) => {
    const dur = end.getTime() - start.getTime();
    return (start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 23 && end.getMinutes() >= 0) || dur >= 20 * 60 * 60 * 1000;
  };

  const toLocalInputValue = (d: Date) => {
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  };

  const nowLine = (day?: Date): CSSProperties | undefined => {
    const now = new Date();
    const reference = day ?? today;
    if (!isSameDay(now, reference)) return undefined;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const pct = (minutes / (24 * 60)) * 100;
    return { top: `${pct}%` };
  };

  const quantizeMinutes = (minutes: number) => Math.max(0, Math.min(1440, Math.round(minutes / 15) * 15));

  const handleDropOnDay = (day: Date, y: number) => {
    if (!dragEventId) return;
    const ev = events.find((e: any) => e.id === dragEventId);
    if (!ev) return;
    if (isAllDay(new Date(ev.startsAt), new Date(ev.endsAt))) return; // nicht per Drag für Ganztag

    const duration = new Date(ev.endsAt).getTime() - new Date(ev.startsAt).getTime();
    const minutes = quantizeMinutes((y / GRID_HEIGHT) * 1440);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(minutes);
    const end = new Date(start.getTime() + duration);

    updateEvent.mutate({
      id: ev.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString()
    });
    setDragEventId(null);
  };

  const openEventDetails = (ev: any) => {
    setActiveEvent(ev);
    setEditEventTitle(ev.title ?? "");
    setEditEventLocation(ev.location ?? "");
    setEditEventDescription(ev.description ?? "");
    setEditEventStart(toLocalInputValue(new Date(ev.startsAt)));
    setEditEventEnd(toLocalInputValue(new Date(ev.endsAt)));
    setEditEventRecurrence(ev.recurrence ?? "");
    setAutoEventId(null);
    setEventDetailOpen(true);
  };

  const handleEventDialogChange = (open: boolean) => {
    if (!open) {
      setEventDetailOpen(false);
      setActiveEvent(null);
      setAutoEventId(null);
      setEditEventTitle(null);
      setEditEventLocation(null);
      setEditEventDescription(null);
      setEditEventStart(null);
      setEditEventEnd(null);
      setEditEventRecurrence(null);
      return;
    }
    setEventDetailOpen(true);
  };

  const handleSaveEventDetails = () => {
    const targetEvent = eventInView;
    if (!targetEvent) return;
    updateEvent.mutate({
      id: targetEvent.id,
      title: editEventTitle ?? targetEvent.title ?? "",
      location: editEventLocation || undefined,
      description: editEventDescription || undefined,
      startsAt: (editEventStart ?? toLocalInputValue(new Date(targetEvent.startsAt))) ? new Date(editEventStart ?? toLocalInputValue(new Date(targetEvent.startsAt))).toISOString() : undefined,
      endsAt: (editEventEnd ?? toLocalInputValue(new Date(targetEvent.endsAt))) ? new Date(editEventEnd ?? toLocalInputValue(new Date(targetEvent.endsAt))).toISOString() : undefined,
      recurrence: editEventRecurrence || undefined
    });
    setEventDetailOpen(false);
    setActiveEvent(null);
    setAutoEventId(null);
    setEditEventTitle(null);
    setEditEventLocation(null);
    setEditEventDescription(null);
    setEditEventStart(null);
    setEditEventEnd(null);
    setEditEventRecurrence(null);
  };

  const eventSurface = (color: string) => ({
    border: `1px solid ${color}b0`,
    background: `linear-gradient(135deg, ${color}e6 0%, #0e1a2bcc 100%)`,
    color: "#fff",
    boxShadow: `0 8px 18px ${color}40`
  });

  const eventSurfaceSoft = (color: string) => ({
    border: `1px solid ${color}99`,
    background: `linear-gradient(135deg, ${color}40 0%, #0e1a2b70 100%)`,
    color: "#fff",
    boxShadow: `0 6px 14px ${color}26`
  });

  const handlePrev = () => {
    if (view === "month") return goMonth(-1);
    if (view === "year") return goYear(-1);
    return goWeek(-1);
  };

  const handleNext = () => {
    if (view === "month") return goMonth(1);
    if (view === "year") return goYear(1);
    return goWeek(1);
  };

  const handleToday = () => setFocusDate(today);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Calendar & Tasks</p>
          <h1 className="text-2xl font-semibold text-slate-50">Planung</h1>
          <p className="text-sm text-slate-300">
            Events, Tasks mit Status-Management und ICS-Export.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importICS.isPending}
          >
            <Upload size={16} className="mr-2" />
            {importICS.isPending ? "Importiere..." : "ICS importieren"}
          </Button>
          <Button variant="outline" onClick={handleExportICS}>
            <Download size={16} className="mr-2" />
            ICS Export
          </Button>
          <Button onClick={() => setEventOpen(true)}>
            <Plus size={16} className="mr-2" />
            Event erstellen
          </Button>
        </div>
      </header>

      {importInfo && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-100">
          {importInfo}
        </div>
      )}

      {!me.data?.user ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
          Bitte <Link href="/auth/login" className="underline">einloggen</Link>, um Kalender und Tasks zu sehen.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Kalender-Ansicht</p>
                <h2 className="text-lg font-semibold text-slate-50">Events & Verfügbarkeiten</h2>
              </div>
              <div className="flex items-center gap-3 text-slate-300">
                {view === "month" && (
                  <div className="text-sm font-semibold text-slate-100">
                    {focusDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={handlePrev} className="px-2">‹</Button>
                <Button size="sm" variant="outline" onClick={handleToday} className="px-3">Heute</Button>
                <Button size="sm" variant="outline" onClick={handleNext} className="px-2">›</Button>
                <CalendarDays size={20} className="text-slate-400" />
              </div>
            </div>

            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="mt-4">
              <TabsList className="flex flex-wrap gap-2 bg-slate-800/70 p-1 rounded-lg">
                <TabsTrigger value="list" className="gap-1">
                  <List size={14} />
                  Liste
                </TabsTrigger>
                <TabsTrigger value="workweek" className="gap-1">
                  <CalendarRange size={14} />
                  Arbeitswoche
                </TabsTrigger>
                <TabsTrigger value="week" className="gap-1">
                  <CalendarCheck size={14} />
                  Woche
                </TabsTrigger>
                <TabsTrigger value="month" className="gap-1">
                  <LayoutGrid size={14} />
                  Monat
                </TabsTrigger>
                <TabsTrigger value="year" className="gap-1">
                  <Calendar size={14} />
                  Jahr
                </TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="mt-3 space-y-2">
                {events
                  .filter((event) => new Date(event.startsAt).getTime() >= today.getTime())
                .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
                .map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 hover:border-slate-700 transition group cursor-pointer relative pl-4"
                  onClick={() => openEventDetails(event)}
                  style={{
                    borderColor: `${colorFor(event)}55`
                  }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[6px] rounded-l-lg"
                    style={{ background: colorFor(event) }}
                  />
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-slate-100">{event.title}</h3>
                      <p className="text-xs text-slate-400 mt-1">
                          {new Date(event.startsAt).toLocaleDateString("de-DE", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {" • "}
                          {new Date(event.startsAt).toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" - "}
                          {new Date(event.endsAt).toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {event.location && <p className="text-[11px] text-slate-400 mt-1">Ort: {event.location}</p>}
                        {event.description && <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{event.description}</p>}
                        {event.recurrence && (
                          <Badge tone="cyan" className="mt-2 text-[11px]">
                            {event.recurrence}
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEvent.mutate({ id: event.id });
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition"
                        aria-label="Event löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {events.filter((e) => new Date(e.startsAt) >= today).length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-8 text-center">
                    <Calendar size={32} className="mx-auto mb-2 text-slate-600" />
                    <p className="text-sm text-slate-400">Noch keine Events</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="workweek" className="mt-3">
                <div className="grid grid-cols-[64px,1fr] gap-3">
                  <div className="text-xs text-slate-400 pr-2">
                    <div style={{ height: TIME_SPACER }} />
                    <div className="relative" style={{ height: GRID_HEIGHT }}>
                      {hourSlots.map((h) => (
                        <div key={`wh-${h}`} className="leading-none relative" style={{ height: HOUR_HEIGHT }}>
                          <span className="absolute -top-2 right-1">{String(h).padStart(2, "0")}:00</span>
                          <div className="absolute left-0 right-0 h-px bg-slate-800" style={{ top: 0 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {workweekDays.map((day) => {
                      const dayEvents = eventsOnDay(day);
                      const allDay = dayEvents.filter(ev => isAllDay(new Date(ev.startsAt), new Date(ev.endsAt)));
                      const timed = dayEvents.filter(ev => !isAllDay(new Date(ev.startsAt), new Date(ev.endsAt)));
                      return (
                        <div key={day.toISOString()} className={`relative rounded-lg border border-slate-800 bg-slate-950/70 p-2 ${isPast(day) ? "opacity-75" : ""} ${isSameDay(day, today) ? "ring-1 ring-aurora-mint/60" : ""}`}>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1" style={{ height: COLUMN_HEADER }}>
                            <span className="uppercase">{day.toLocaleDateString("de-DE", { weekday: "short" })}</span>
                            <span className="text-slate-300">{day.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}</span>
                          </div>
                          <div className="flex flex-col gap-1 mb-2" style={{ height: ALLDAY_HEIGHT }}>
                            {allDay.map(event => {
                              const color = colorFor(event);
                              return (
                              <Popover
                                key={event.id}
                                open={hoverEventId === event.id}
                                onOpenChange={(o) => setHoverEventId(o ? event.id : null)}
                              >
                                <PopoverTrigger asChild>
                                  <div
                                    onClick={() => openEventDetails(event)}
                                    onMouseEnter={() => setHoverEventId(event.id)}
                                    onMouseLeave={() => setHoverEventId(null)}
                                    className="h-full rounded px-2 py-1 text-[11px] text-white cursor-pointer"
                                    style={eventSurfaceSoft(color)}
                                  >
                                    {event.title} <span className="text-[10px] text-white/85">(Ganztägig)</span>
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent side="top" align="start">
                                  <div className="space-y-1 text-sm text-slate-100">
                                    <div className="font-semibold">{event.title}</div>
                                    {event.location && <div className="text-xs text-slate-300">Ort: {event.location}</div>}
                                    <div className="text-xs text-slate-300">
                                      {new Date(event.startsAt).toLocaleDateString("de-DE")} – {new Date(event.endsAt).toLocaleDateString("de-DE")}
                                    </div>
                                    {event.description && <p className="text-xs text-slate-200 whitespace-pre-line">{event.description}</p>}
                                    {event.recurrence && <Badge tone="cyan" className="text-[10px]">RRULE {event.recurrence}</Badge>}
                                    {event.calendarName && <Badge tone="slate" className="text-[10px]">{event.calendarName}</Badge>}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                            })}
                          </div>
                          <div
                            className="relative rounded border border-slate-800 bg-slate-900/40 overflow-hidden"
                            style={{ height: GRID_HEIGHT }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const y = e.clientY - rect.top;
                              handleDropOnDay(day, y);
                            }}
                          >
                            {hourSlots.map((h) => (
                              <div key={`grid-${day.toISOString()}-${h}`} className="absolute left-0 right-0 h-px bg-slate-800" style={{ top: `${(h / 24) * 100}%` }} />
                            ))}
                            {timed.map(event => {
                              const color = colorFor(event);
                              const start = new Date(event.startsAt);
                              const end = new Date(event.endsAt);
                              const startMinutes = start.getHours() * 60 + start.getMinutes();
                              const endMinutes = end.getHours() * 60 + end.getMinutes();
                              const top = (startMinutes / 1440) * 100;
                              const heightPct = Math.max(((endMinutes - startMinutes) / 1440) * 100, 3);
                              return (
                                <Popover
                                  key={event.id}
                                  open={hoverEventId === event.id}
                                  onOpenChange={(o) => setHoverEventId(o ? event.id : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <div
                                      draggable
                                      onDragStart={(e) => {
                                        setDragEventId(event.id);
                                        e.dataTransfer.effectAllowed = "move";
                                      }}
                                      onDragEnd={() => setDragEventId(null)}
                                      onClick={() => openEventDetails(event)}
                                      onMouseEnter={() => setHoverEventId(event.id)}
                                      onMouseLeave={() => setHoverEventId(null)}
                                      className="absolute left-1 right-1 rounded px-2 py-1 text-[11px] text-white shadow-sm cursor-pointer"
                                      style={{
                                        top: `${top}%`,
                                        height: `${heightPct}%`,
                                        ...eventSurface(color)
                                      }}
                                    >
                                      <div className="font-medium line-clamp-2 text-white">{event.title}</div>
                                      <div className="text-[10px] text-white/85">
                                        {start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                                      </div>
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent side="top" align="start">
                                    <div className="space-y-1 text-sm text-slate-100">
                                      <div className="font-semibold">{event.title}</div>
                                      {event.location && <div className="text-xs text-slate-300">Ort: {event.location}</div>}
                                      <div className="text-xs text-slate-300">
                                        {start.toLocaleString("de-DE")} – {end.toLocaleString("de-DE")}
                                      </div>
                                      {event.description && (
                                        <p className="text-xs text-slate-200 whitespace-pre-line">{event.description}</p>
                                      )}
                                      {event.recurrence && <Badge tone="cyan" className="text-[10px]">RRULE {event.recurrence}</Badge>}
                                      {event.calendarName && <Badge tone="slate" className="text-[10px]">{event.calendarName}</Badge>}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              );
                            })}
                            {(() => {
                              const nl = nowLine(day);
                              return nl ? (
                                <div className="absolute left-0 right-0 h-px bg-red-400" style={nl} />
                              ) : null;
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="week" className="mt-3">
                <div className="grid grid-cols-[64px,1fr] gap-3">
                  <div className="text-xs text-slate-400 pr-2">
                    <div style={{ height: TIME_SPACER }} />
                    <div className="relative" style={{ height: GRID_HEIGHT }}>
                      {hourSlots.map((h) => (
                        <div key={`w-${h}`} className="leading-none relative" style={{ height: HOUR_HEIGHT }}>
                          <span className="absolute -top-2 right-1">{String(h).padStart(2, "0")}:00</span>
                          <div className="absolute left-0 right-0 h-px bg-slate-800" style={{ top: 0 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {weekDays.map((day) => {
                      const dayEvents = eventsOnDay(day);
                      const allDay = dayEvents.filter(ev => isAllDay(new Date(ev.startsAt), new Date(ev.endsAt)));
                      const timed = dayEvents.filter(ev => !isAllDay(new Date(ev.startsAt), new Date(ev.endsAt)));
                      const nl = nowLine(day);
                      const weekend = isWeekend(day);
                      return (
                        <div
                          key={day.toISOString()}
                          className={`relative rounded-lg border border-slate-800 p-2 ${weekend ? "bg-gradient-to-br from-slate-950/80 to-slate-900/70" : "bg-slate-950/60"} ${isPast(day) ? "opacity-70" : ""} ${isSameDay(day, today) ? "ring-1 ring-aurora-mint/60" : ""}`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1" style={{ height: COLUMN_HEADER }}>
                            <span className="uppercase">{day.toLocaleDateString("de-DE", { weekday: "short" })}</span>
                            <span className="text-slate-300">{day.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}</span>
                          </div>
                          <div className="flex flex-col gap-1 mb-2" style={{ height: ALLDAY_HEIGHT }}>
                            {allDay.map(event => {
                              const color = colorFor(event);
                              return (
                              <Popover
                                key={event.id}
                                open={hoverEventId === event.id}
                                onOpenChange={(o) => setHoverEventId(o ? event.id : null)}
                              >
                                <PopoverTrigger asChild>
                                  <div
                                    onClick={() => openEventDetails(event)}
                                    onMouseEnter={() => setHoverEventId(event.id)}
                                    onMouseLeave={() => setHoverEventId(null)}
                                    className="h-full rounded px-2 py-1 text-[11px] cursor-pointer"
                                    style={eventSurfaceSoft(color)}
                                  >
                                    {event.title}{" "}
                                    <span className="text-[10px] text-white/90">
                                      (Ganztägig)
                                    </span>
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent side="top" align="start">
                                  <div className="space-y-1 text-sm text-slate-100">
                                    <div className="font-semibold">{event.title}</div>
                                    {event.location && <div className="text-xs text-slate-300">Ort: {event.location}</div>}
                                    <div className="text-xs text-slate-300">
                                      {new Date(event.startsAt).toLocaleDateString("de-DE")} – {new Date(event.endsAt).toLocaleDateString("de-DE")}
                                    </div>
                                    {event.description && <p className="text-xs text-slate-200 whitespace-pre-line">{event.description}</p>}
                                    {event.recurrence && <Badge tone="cyan" className="text-[10px]">RRULE {event.recurrence}</Badge>}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                            })}
                            {allDay.length === 0 && (
                              <div className="h-full rounded border border-dashed border-slate-800/70 text-[10px] text-slate-500 flex items-center justify-center">
                                Ganztägig
                              </div>
                            )}
                          </div>
                          <div
                            className="relative rounded border border-slate-800 bg-slate-900/40 overflow-hidden"
                            style={{ height: GRID_HEIGHT }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const y = e.clientY - rect.top;
                              handleDropOnDay(day, y);
                            }}
                          >
                            {hourSlots.map((h) => (
                              <div key={`grid-${day.toISOString()}-${h}`} className="absolute left-0 right-0 h-px bg-slate-800" style={{ top: `${(h / 24) * 100}%` }} />
                            ))}
                            {timed.map(event => {
                              const color = colorFor(event);
                              const start = new Date(event.startsAt);
                              const end = new Date(event.endsAt);
                              const startMinutes = start.getHours() * 60 + start.getMinutes();
                              const endMinutes = end.getHours() * 60 + end.getMinutes();
                              const top = (startMinutes / 1440) * 100;
                              const heightPct = Math.max(((endMinutes - startMinutes) / 1440) * 100, 3);
                              return (
                                <Popover
                                  key={event.id}
                                  open={hoverEventId === event.id}
                                  onOpenChange={(o) => setHoverEventId(o ? event.id : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <div
                                      draggable
                                      onDragStart={(e) => {
                                        setDragEventId(event.id);
                                        e.dataTransfer.effectAllowed = "move";
                                      }}
                                      onDragEnd={() => setDragEventId(null)}
                                      onClick={() => openEventDetails(event)}
                                      onMouseEnter={() => setHoverEventId(event.id)}
                                      onMouseLeave={() => setHoverEventId(null)}
                                      className="absolute left-1 right-1 rounded px-2 py-1 text-[11px] text-white cursor-pointer"
                                      style={{
                                        top: `${top}%`,
                                        height: `${heightPct}%`,
                                        ...eventSurface(color)
                                      }}
                                    >
                                      <div className="font-medium line-clamp-2 text-white">{event.title}</div>
                                      <div className="text-[10px] text-white/80">
                                        {start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                                      </div>
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent side="top" align="start">
                                    <div className="space-y-1 text-sm text-slate-100">
                                      <div className="font-semibold">{event.title}</div>
                                      {event.location && <div className="text-xs text-slate-300">Ort: {event.location}</div>}
                                      <div className="text-xs text-slate-300">
                                        {start.toLocaleString("de-DE")} – {end.toLocaleString("de-DE")}
                                      </div>
                                      {event.description && (
                                        <p className="text-xs text-slate-200 whitespace-pre-line">{event.description}</p>
                                      )}
                                      {event.recurrence && <Badge tone="cyan" className="text-[10px]">RRULE {event.recurrence}</Badge>}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              );
                            })}
                            {nl && (
                              <div className="absolute left-0 right-0 h-px bg-red-400" style={nl} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="month" className="mt-3 space-y-2">
                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
                  {monthDays.map((day) => {
                    const isCurrentMonth = day.getMonth() === focusDate.getMonth();
                    const dayEvents = eventsOnDay(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className={`min-h-[120px] p-2 bg-gradient-to-br ${
                          isWeekend(day)
                            ? "from-slate-950/70 to-slate-900/70"
                            : "from-slate-900/70 to-slate-900/40"
                        } ${isCurrentMonth ? "" : "opacity-40"} ${isPast(day) ? "grayscale-[40%]" : ""} ${
                          isSameDay(day, today) ? "ring-1 ring-aurora-mint/60" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>{day.toLocaleDateString("de-DE", { day: "numeric" })}</span>
                          {dayEvents.length > 0 && (
                            <Badge tone="cyan" className="text-[10px] px-1 py-0">
                              {dayEvents.length}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <Popover
                              key={event.id}
                              open={hoverEventId === event.id}
                              onOpenChange={(o) => setHoverEventId(o ? event.id : null)}
                            >
                              <PopoverTrigger asChild>
                                <div
                                  onMouseEnter={() => setHoverEventId(event.id)}
                                  onMouseLeave={() => setHoverEventId(null)}
                                  onClick={() => openEventDetails(event)}
                                  className={`rounded border border-slate-800 px-1 py-[3px] cursor-pointer ${
                                    isAllDay(new Date(event.startsAt), new Date(event.endsAt))
                                      ? ""
                                      : ""
                                  }`}
                                  style={{
                                    ...eventSurfaceSoft(colorFor(event))
                                  }}
                                >
                                  <p className="text-[11px] font-medium text-white line-clamp-1">
                                    {event.title}
                                  </p>
                                  {!isAllDay(new Date(event.startsAt), new Date(event.endsAt)) && (
                                    <p className="text-[10px] text-white/85">
                                      {new Date(event.startsAt).toLocaleTimeString("de-DE", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  )}
                                  {isAllDay(new Date(event.startsAt), new Date(event.endsAt)) && (
                                    <p className="text-[10px] text-white/85">Ganztägig</p>
                                  )}
                                </div>
                              </PopoverTrigger>
                              <PopoverContent side="top" align="start">
                                <div className="space-y-1 text-sm text-slate-100">
                                  <div className="font-semibold">{event.title}</div>
                                  {event.location && <div className="text-xs text-slate-300">Ort: {event.location}</div>}
                                  <div className="text-xs text-slate-300">
                                    {new Date(event.startsAt).toLocaleString("de-DE")} – {new Date(event.endsAt).toLocaleString("de-DE")}
                                  </div>
                                  {event.description && <p className="text-xs text-slate-200 whitespace-pre-line">{event.description}</p>}
                                  {event.recurrence && <Badge tone="cyan" className="text-[10px]">RRULE {event.recurrence}</Badge>}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ))}
                          {dayEvents.length > 3 && (
                            <p className="text-[10px] text-slate-400">+{dayEvents.length - 3} mehr</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="year" className="mt-3 space-y-2">
                {Array.from({ length: 12 }, (_, month) => {
                  const monthEvents = events.filter((event) => {
                    const start = new Date(event.startsAt);
                    return start.getFullYear() === currentYear && start.getMonth() === month;
                  });
                  return (
                    <div
                      key={month}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.15em] text-slate-400">
                          {new Date(currentYear, month, 1).toLocaleDateString("de-DE", {
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-sm text-slate-200">
                          {monthEvents.length} Event{monthEvents.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {monthEvents.slice(0, 3).map((event) => (
                          <Badge key={event.id} tone="slate" className="text-xs">
                            {event.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
            </Tabs>
          </div>

          <aside className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Tasks</p>
                <h2 className="text-lg font-semibold text-slate-50">Arbeitsliste</h2>
              </div>
              <Button size="sm" onClick={() => setTaskOpen(true)}>
                <Plus size={14} className="mr-1" />
                Task
              </Button>
            </div>

            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-slate-700 transition group"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleStatus.mutate({ id: task.id })}
                      className="mt-0.5 text-slate-400 hover:text-cyan-300 transition"
                      aria-label="Status umschalten"
                    >
                      {task.status === "done" ? (
                        <CheckCircle2 size={18} className="text-emerald-400" />
                      ) : (
                        <Circle size={18} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`font-medium ${
                          task.status === "done" ? "line-through text-slate-500" : "text-slate-100"
                        }`}
                      >
                        {task.title}
                      </h3>
                      {task.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                        {task.dueAt && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(task.dueAt).toLocaleDateString("de-DE")}
                          </span>
                        )}
                        {task.assigneeId && (task.assigneeName || task.assigneeEmail) && (
                          <Badge tone="cyan" className="text-xs">
                            {task.assigneeName || task.assigneeEmail}
                          </Badge>
                        )}
                        <Badge
                          tone={task.status === "done" ? "emerald" : "slate"}
                          className="text-xs capitalize"
                        >
                          {task.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => openEditTask(task)}
                      className="text-cyan-300 hover:text-cyan-200"
                      aria-label="Task bearbeiten"
                    >
                      <Pencil size={14} />
                    </button>
                      <button
                        onClick={() => setShareTask(task)}
                        className="text-cyan-300 hover:text-cyan-200"
                        aria-label="Task teilen"
                      >
                        <Share2 size={14} />
                      </button>
                    <button
                      onClick={() => deleteTask.mutate({ id: task.id })}
                      className="text-red-400 hover:text-red-300"
                      aria-label="Task löschen"
                    >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-8 text-center">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm text-slate-400">Noch keine Tasks</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Create Event Dialog */}
      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Neues Event erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventTitle" className="text-slate-200">Titel</Label>
              <Input
                id="eventTitle"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="Team Meeting"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventStart" className="text-slate-200">Start</Label>
              <Input
                id="eventStart"
                type="datetime-local"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventEnd" className="text-slate-200">Ende</Label>
              <Input
                id="eventEnd"
                type="datetime-local"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventLocation" className="text-slate-200">Ort</Label>
              <Input
                id="eventLocation"
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="z.B. Konferenzraum Berlin oder Zoom-Link"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventDescription" className="text-slate-200">Beschreibung</Label>
              <textarea
                id="eventDescription"
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-100 p-2 text-sm"
                rows={3}
                placeholder="Agenda, Dial-in, Notizen..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventRecurrence" className="text-slate-200">Recurrence (RRULE optional)</Label>
              <Input
                id="eventRecurrence"
                value={eventRecurrence}
                onChange={(e) => setEventRecurrence(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="z.B. FREQ=WEEKLY;BYDAY=MO"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEventOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() =>
                  createEvent.mutate({
                    title: eventTitle,
                    location: eventLocation || undefined,
                    description: eventDescription || undefined,
                    startsAt: eventStart,
                    endsAt: eventEnd,
                    recurrence: eventRecurrence || undefined
                  })
                }
                disabled={!eventTitle || !eventStart || !eventEnd || createEvent.isPending}
              >
                {createEvent.isPending ? "Erstelle..." : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Detail / Edit Dialog */}
      <Dialog open={eventDialogOpen} onOpenChange={handleEventDialogChange}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Termin bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventTitleEdit" className="text-slate-200">Titel</Label>
              <Input
                id="eventTitleEdit"
                value={editEventTitle ?? eventInView?.title ?? ""}
                onChange={(e) => setEditEventTitle(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eventStartEdit" className="text-slate-200">Start</Label>
                <Input
                  id="eventStartEdit"
                  type="datetime-local"
                  value={editEventStart ?? (eventInView ? toLocalInputValue(new Date(eventInView.startsAt)) : "")}
                  onChange={(e) => setEditEventStart(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventEndEdit" className="text-slate-200">Ende</Label>
                <Input
                  id="eventEndEdit"
                  type="datetime-local"
                  value={editEventEnd ?? (eventInView ? toLocalInputValue(new Date(eventInView.endsAt)) : "")}
                  onChange={(e) => setEditEventEnd(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventLocationEdit" className="text-slate-200">Ort</Label>
              <Input
                id="eventLocationEdit"
                value={editEventLocation ?? eventInView?.location ?? ""}
                onChange={(e) => setEditEventLocation(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventDescriptionEdit" className="text-slate-200">Beschreibung</Label>
              <textarea
                id="eventDescriptionEdit"
                value={editEventDescription ?? eventInView?.description ?? ""}
                onChange={(e) => setEditEventDescription(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 text-slate-100 p-2 text-sm"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventRecurrenceEdit" className="text-slate-200">Recurrence (RRULE optional)</Label>
              <Input
                id="eventRecurrenceEdit"
                value={editEventRecurrence ?? eventInView?.recurrence ?? ""}
                onChange={(e) => setEditEventRecurrence(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleEventDialogChange(false)}>
                Schließen
              </Button>
              {eventInView && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteEvent.mutate({ id: eventInView.id });
                    handleEventDialogChange(false);
                  }}
                  disabled={deleteEvent.isPending}
                >
                  {deleteEvent.isPending ? "Lösche..." : "Löschen"}
                </Button>
              )}
              <Button
                onClick={handleSaveEventDetails}
                disabled={!((editEventTitle ?? eventInView?.title) && (editEventStart ?? (eventInView ? toLocalInputValue(new Date(eventInView.startsAt)) : "")) && (editEventEnd ?? (eventInView ? toLocalInputValue(new Date(eventInView.endsAt)) : ""))) || updateEvent.isPending}
              >
                {updateEvent.isPending ? "Speichere..." : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Neuen Task erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="taskTitle" className="text-slate-200">Titel</Label>
              <Input
                id="taskTitle"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="Code Review durchführen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskDescription" className="text-slate-200">Beschreibung</Label>
              <Input
                id="taskDescription"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="Details zum Task"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskDue" className="text-slate-200">Fällig am (optional)</Label>
              <Input
                id="taskDue"
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskAssignee" className="text-slate-200">Zugewiesen an (optional)</Label>
              <Select
                value={taskAssignee || "none"}
                onValueChange={(val) => setTaskAssignee(val === "none" ? "" : val)}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                  <SelectItem value="none">Nicht zugewiesen</SelectItem>
                  {me.data?.user?.id && <SelectItem value={me.data.user.id}>Mir zuweisen</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTaskOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() =>
                  createTask.mutate({
                    title: taskTitle,
                    description: taskDescription || undefined,
                    dueAt: taskDue || undefined,
                    assigneeId: taskAssignee || undefined
                  })
                }
                disabled={!taskTitle || createTask.isPending}
              >
                {createTask.isPending ? "Erstelle..." : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={handleTaskDialogChange}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Task bearbeiten</DialogTitle>
          </DialogHeader>
          {taskInView && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editTaskTitle" className="text-slate-200">Titel</Label>
                <Input
                  id="editTaskTitle"
                  value={taskInView.title}
                  onChange={(e) => updateTaskDraft({ title: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTaskDescription" className="text-slate-200">Beschreibung</Label>
                <Input
                  id="editTaskDescription"
                  value={taskInView.description || ""}
                  onChange={(e) => updateTaskDraft({ description: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTaskAssignee" className="text-slate-200">Zugewiesen an</Label>
                <Select
                  value={taskInView.assigneeId || "none"}
                  onValueChange={(val) =>
                    updateTaskDraft({ assigneeId: val === "none" ? null : val })
                  }
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <SelectItem value="none">Nicht zugewiesen</SelectItem>
                    {me.data?.user?.id && <SelectItem value={me.data.user.id}>Mir zuweisen</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTaskDue" className="text-slate-200">Fällig</Label>
                <Input
                  id="editTaskDue"
                  type="date"
                  value={
                    taskInView.dueAt ? new Date(taskInView.dueAt).toISOString().slice(0, 10) : ""
                  }
                  onChange={(e) => updateTaskDraft({ dueAt: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTaskStatus" className="text-slate-200">Status</Label>
                <Select
                  value={taskInView.status}
                  onValueChange={(val) => updateTaskDraft({ status: val })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <SelectItem value="todo">Offen</SelectItem>
                    <SelectItem value="done">Erledigt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleTaskDialogChange(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleUpdateTask} disabled={updateTask.isPending}>
                  {updateTask.isPending ? "Speichere..." : "Speichern"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => handleICSFile(e.target.files?.[0])}
      />
      {shareTask && (
        <ShareDialog
          open={!!shareTask}
          onOpenChange={(o) => { if (!o) setShareTask(null); }}
          entityId={shareTask.id}
          entityType="task"
          title={shareTask.title}
        />
      )}
    </div>
  );
}
