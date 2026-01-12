/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Pencil,
  PlusCircle,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  MessageSquare,
  Users2,
  LayoutDashboard,
  ListChecks,
  Target,
  Settings,
  GripVertical,
  AlertCircle,
  Clock
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

interface ProjectDetailProps {
  projectId: string;
}

const rolePriority: Record<string, number> = {
  owner: 4,
  manager: 3,
  member: 2,
  viewer: 1
};

const hasRole = (role: string, required: string) => (rolePriority[role] ?? 0) >= (rolePriority[required] ?? 0);

const priorityBadgeClass = (priority?: string) => {
  switch (priority) {
    case "urgent":
      return "border-rose-500/70 bg-rose-500/20 text-rose-200";
    case "high":
      return "border-amber-400/70 bg-amber-400/20 text-amber-200";
    case "medium":
      return "border-sky-400/70 bg-sky-400/20 text-sky-200";
    case "low":
    default:
      return "border-emerald-400/70 bg-emerald-400/20 text-emerald-200";
  }
};

const priorityBorderClass = (priority?: string) => {
  switch (priority) {
    case "urgent":
      return "border-l-4 border-l-rose-500/90";
    case "high":
      return "border-l-4 border-l-amber-400/90";
    case "medium":
      return "border-l-4 border-l-sky-400/90";
    case "low":
    default:
      return "border-l-4 border-l-emerald-400/90";
  }
};

const priorityAccentClass = (priority?: string) => {
  switch (priority) {
    case "urgent":
      return "from-rose-500/70 via-rose-400/40 to-transparent";
    case "high":
      return "from-amber-400/70 via-amber-300/40 to-transparent";
    case "medium":
      return "from-sky-400/70 via-sky-300/40 to-transparent";
    case "low":
    default:
      return "from-emerald-400/70 via-emerald-300/40 to-transparent";
  }
};

const taskCardClass = (priority?: string) => {
  switch (priority) {
    case "urgent":
      return "border-rose-700/60 bg-rose-900/50 text-rose-100";
    case "high":
      return "border-amber-700/60 bg-amber-900/50 text-amber-100";
    case "medium":
      return "border-sky-700/60 bg-sky-900/50 text-sky-100";
    case "low":
    default:
      return "border-emerald-700/60 bg-emerald-900/50 text-emerald-100";
  }
};

export default function ProjectDetailComponent({ projectId }: ProjectDetailProps) {
  const toast = useToast();
  const utils = trpc.useUtils();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeParams = useParams();
  const routeProjectIdRaw = (routeParams as { projectId?: string | string[] } | undefined)?.projectId;
  const routeProjectId = Array.isArray(routeProjectIdRaw) ? routeProjectIdRaw[0] : routeProjectIdRaw;
  const resolvedProjectId =
    typeof projectId === "string" && projectId.trim().length > 0
      ? projectId
      : typeof routeProjectId === "string" && routeProjectId.trim().length > 0
        ? routeProjectId
        : undefined;
  const hasProjectId = typeof resolvedProjectId === "string" && resolvedProjectId.trim().length > 0;

  useEffect(() => {
    if (!hasProjectId) {
      // Client-only Hinweis für Debugging
      console.warn("[ProjectsDetail] projectId fehlt oder leer", { projectId, routeProjectId });
    }
  }, [hasProjectId, projectId, routeProjectId]);

  const projectInput = hasProjectId ? {
    moduleId: "projects",
    procedure: "getProject",
    input: { projectId: resolvedProjectId }
  } : skipToken;

  const sectionsInput = hasProjectId ? {
    moduleId: "projects",
    procedure: "listSections",
    input: { projectId: resolvedProjectId }
  } : skipToken;

  const tasksInput = hasProjectId ? {
    moduleId: "projects",
    procedure: "listTasks",
    input: { projectId: resolvedProjectId }
  } : skipToken;

  const membersInput = hasProjectId ? {
    moduleId: "projects",
    procedure: "listMembers",
    input: { projectId: resolvedProjectId }
  } : skipToken;

  const milestonesInput = hasProjectId ? {
    moduleId: "projects",
    procedure: "listMilestones",
    input: { projectId: resolvedProjectId }
  } : skipToken;

  const projectQuery = trpc.moduleApi.invokeQuery.useQuery(projectInput);

  const sectionsQuery = trpc.moduleApi.invokeQuery.useQuery(sectionsInput);

  const tasksQuery = trpc.moduleApi.invokeQuery.useQuery(tasksInput);

  const membersQuery = trpc.moduleApi.invokeQuery.useQuery(membersInput);

  const milestonesQuery = trpc.moduleApi.invokeQuery.useQuery(milestonesInput);

  const [taskSettingsId, setTaskSettingsId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragFromSectionId, setDragFromSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [createTaskSection, setCreateTaskSection] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"manager" | "member" | "viewer">("member");

  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");

  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectTags, setProjectTags] = useState("");

  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionColor, setNewSectionColor] = useState("#38bdf8");

  const projectData = projectQuery.data as any;
  const project = projectData?.project as any | undefined;
  const role = projectData?.role ?? "viewer";
  const canManage = hasRole(role, "manager");
  const canEdit = hasRole(role, "member");

  const sections = useMemo(() => (sectionsQuery.data as any[]) ?? [], [sectionsQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data as any[]) ?? [], [tasksQuery.data]);
  const members = useMemo(() => (membersQuery.data as any[]) ?? [], [membersQuery.data]);
  const milestones = useMemo(() => (milestonesQuery.data as any[]) ?? [], [milestonesQuery.data]);

  const tasksBySection = useMemo(() => {
    const map = new Map<string | null, any[]>();
    tasks.forEach((task) => {
      const key = task.sectionId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(task);
    });
    return map;
  }, [tasks]);

  const boardSections = useMemo(() => {
    const list = [...sections];
    if ((tasksBySection.get(null) ?? []).length > 0) {
      list.unshift({ id: null, name: "Ohne Spalte", isVirtual: true });
    }
    return list;
  }, [sections, tasksBySection]);

  useEffect(() => {
    if (!project || !projectEditOpen) return;
    setProjectName(project.name);
    setProjectDescription(project.description ?? "");
    setProjectTags((project.tags ?? []).join(", "));
  }, [projectEditOpen, project?.name, project?.description, project?.tags, project]);

  const invalidateProject = () => {
    projectQuery.refetch();
    sectionsQuery.refetch();
    tasksQuery.refetch();
    membersQuery.refetch();
    milestonesQuery.refetch();
  };

  const createTask = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Task erstellt", tone: "success" });
      setNewTaskTitle("");
      setNewTaskDesc("");
      setCreateTaskSection(null);
      tasksQuery.refetch();
    },
    onError: (err) => toast.push({ title: "Fehler", description: err.message, tone: "error" })
  });

  const updateTask = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Task aktualisiert", tone: "success" });
      tasksQuery.refetch();
    }
  });

  const toggleTask = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      tasksQuery.refetch();
    }
  });

  const deleteTask = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Task gelöscht", tone: "success" });
      tasksQuery.refetch();
    }
  });

  const addMember = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Mitglied hinzugefügt", tone: "success" });
      setMemberEmail("");
      membersQuery.refetch();
    },
    onError: (err) => toast.push({ title: "Fehler", description: err.message, tone: "error" })
  });

  const updateMember = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => membersQuery.refetch()
  });

  const removeMember = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => membersQuery.refetch()
  });

  const createMilestone = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Meilenstein erstellt", tone: "success" });
      setMilestoneName("");
      setMilestoneDue("");
      milestonesQuery.refetch();
    }
  });

  const updateMilestone = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => milestonesQuery.refetch()
  });

  const deleteMilestone = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => milestonesQuery.refetch()
  });

  const updateProject = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Projekt aktualisiert", tone: "success" });
      setProjectEditOpen(false);
      projectQuery.refetch();
      utils.moduleApi.invokeQuery.invalidate({
        moduleId: "projects",
        procedure: "listProjects"
      });
    }
  });

  const createSection = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Spalte erstellt", tone: "success" });
      setNewSectionName("");
      sectionsQuery.refetch();
    }
  });

  const updateSection = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => sectionsQuery.refetch()
  });

  const deleteSection = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => sectionsQuery.refetch()
  });

  if (!hasProjectId) {
    return <div className="text-sm text-slate-500">Projekt nicht gefunden.</div>;
  }

  if (projectQuery.isLoading) {
    return <div className="text-sm text-slate-500">Projekt wird geladen...</div>;
  }

  if (!project) {
    return <div className="text-sm text-slate-500">Projekt nicht gefunden.</div>;
  }

  const stats = {
    total: tasks.length,
    open: tasks.filter((t) => !t.completedAt && !t.isArchived).length,
    done: tasks.filter((t) => t.completedAt).length
  };
  const completionPercent = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const selectedTaskSettings = tasks.find((t) => t.id === taskSettingsId);

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-aurora-mint/12 to-xynoxa-cyan/16 p-6 md:p-8 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-xynoxa-cyan/20">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-aurora-mint">Projekt</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{project.description || "Keine Beschreibung"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(project.tags ?? []).length > 0 ? (
                project.tags.map((tag: string) => (
                  <Badge key={tag} variant="outline" className="border-slate-200/80 bg-white/70 text-xynoxa-cyan shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-aurora-mint">
                    {tag}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-slate-400">Keine Tags</span>
              )}
            </div>
            <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.4)]">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span className="uppercase tracking-[0.22em] text-[10px] text-aurora-mint/80">Fortschritt</span>
                <span>{stats.done}/{stats.total} erledigt</span>
              </div>
              <div className="mt-4 h-3.5 overflow-hidden rounded-full bg-slate-900/80 shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-aurora-mint via-xynoxa-cyan to-emerald-400 shadow-[0_0_16px_rgba(69,230,197,0.45)] transition-all"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-400">
                <span>Offen: {stats.open}</span>
                <span>Erledigt: {stats.done}</span>
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-300 shadow-sm">
                  {completionPercent}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={role === "viewer" ? "bg-slate-200/80 text-slate-700" : "bg-aurora-mint/20 text-slate-900 dark:text-aurora-mint"}>
              {role === "owner" ? "Owner" : role === "manager" ? "Manager" : role === "member" ? "Member" : "Viewer"}
            </Badge>
            <Button variant="outline" className="border-xynoxa-cyan/60 text-xynoxa-cyan" onClick={() => setProjectEditOpen(true)} disabled={!canManage}>
              <Pencil className="mr-2 h-4 w-4" /> Projekt bearbeiten
            </Button>
          </div>
        </header>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} label="Aufgaben" value={`${stats.open} / ${stats.total}`} accent="from-cyan-500/30 to-cyan-500/5" />
        <StatCard icon={Users2} label="Team" value={members.length} accent="from-aurora-mint/30 to-aurora-mint/5" />
        <StatCard icon={CalendarClock} label="Meilensteine" value={milestones.length} accent="from-amber-400/30 to-amber-400/5" />
      </div>

      <Tabs defaultValue="board" className="space-y-6">
        <TabsList className="inline-flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 p-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]">
          <TabsTrigger value="board" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-xynoxa-cyan/20 data-[state=active]:to-aurora-mint/10 data-[state=active]:text-white data-[state=active]:ring-1 data-[state=active]:ring-xynoxa-cyan/50 transition-all duration-200">
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Board
          </TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-xynoxa-cyan/20 data-[state=active]:to-aurora-mint/10 data-[state=active]:text-white data-[state=active]:ring-1 data-[state=active]:ring-xynoxa-cyan/50 transition-all duration-200">
            <ListChecks className="h-4 w-4 mr-2" />
            Aufgabenliste
          </TabsTrigger>
          <TabsTrigger value="milestones" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-xynoxa-cyan/20 data-[state=active]:to-aurora-mint/10 data-[state=active]:text-white data-[state=active]:ring-1 data-[state=active]:ring-xynoxa-cyan/50 transition-all duration-200">
            <Target className="h-4 w-4 mr-2" />
            Meilensteine
          </TabsTrigger>
          <TabsTrigger value="members" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-xynoxa-cyan/20 data-[state=active]:to-aurora-mint/10 data-[state=active]:text-white data-[state=active]:ring-1 data-[state=active]:ring-xynoxa-cyan/50 transition-all duration-200">
            <Users2 className="h-4 w-4 mr-2" />
            Mitglieder
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-xynoxa-cyan/20 data-[state=active]:to-aurora-mint/10 data-[state=active]:text-white data-[state=active]:ring-1 data-[state=active]:ring-xynoxa-cyan/50 transition-all duration-200">
            <Settings className="h-4 w-4 mr-2" />
            Einstellungen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {boardSections.map((section) => {
              const sectionKey = section.id ?? "unassigned";
              const isDragOver = dragOverSectionId === sectionKey;
              return (
                <div
                  key={sectionKey}
                  className={`min-w-[280px] max-w-[320px] flex-1 rounded-2xl ${isDragOver ? "ring-2 ring-cyan-400/60" : ""}`}
                  onDragOver={(event) => {
                    if (!canEdit) return;
                    event.preventDefault();
                    setDragOverSectionId(sectionKey);
                  }}
                  onDragLeave={() => setDragOverSectionId(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!canEdit || !dragTaskId) return;
                    const targetSectionId = section.id ?? null;
                    const fromSection = dragFromSectionId ?? null;
                    setDragOverSectionId(null);
                    if (targetSectionId === fromSection) return;
                    updateTask.mutate({
                      moduleId: "projects",
                      procedure: "updateTask",
                      input: { taskId: dragTaskId, sectionId: targetSectionId }
                    });
                    setDragTaskId(null);
                    setDragFromSectionId(null);
                  }}
                >
                <Card className="border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
                  <CardHeader className="space-y-3 pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2.5 text-sm">
                        <div className="rounded-md p-1.5 ring-1 ring-slate-700/50" style={{ backgroundColor: `${(section as any).color ?? "#94a3b8"}20` }}>
                          <span
                            className="block h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(69,230,197,0.4)]"
                            style={{ backgroundColor: (section as any).color ?? "#94a3b8" }}
                          />
                        </div>
                        <span className="text-slate-100 font-semibold">{section.name}</span>
                      </CardTitle>
                      <Badge variant="outline" className="border-slate-700/70 bg-slate-900/60 text-slate-300">
                        {tasksBySection.get(section.id ?? null)?.length ?? 0}
                      </Badge>
                    </div>
                    {createTaskSection === sectionKey ? (
                      <div className="space-y-2">
                        <Input
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Task Titel"
                        />
                        <textarea
                          value={newTaskDesc}
                          onChange={(e) => setNewTaskDesc(e.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          placeholder="Kurzbeschreibung"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              createTask.mutate({
                                moduleId: "projects",
                                procedure: "createTask",
                                input: {
                                  projectId: resolvedProjectId,
                                  title: newTaskTitle,
                                  description: newTaskDesc,
                                  sectionId: section.id ?? undefined
                                }
                              })
                            }
                            disabled={!newTaskTitle.trim() || createTask.isPending}
                          >
                            Speichern
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setCreateTaskSection(null)}>
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setCreateTaskSection(sectionKey)} disabled={!canEdit}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Task hinzufügen
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(tasksBySection.get(section.id ?? null) ?? []).map((task) => (
                      <div
                        key={task.id}
                        className={`group relative overflow-hidden rounded-xl p-4 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-1 hover:rotate-[-1deg] ${taskCardClass(
                          task.priority
                        )} ${
                          dragTaskId === task.id ? "opacity-50 scale-95 rotate-[-2deg]" : ""
                        } ${task.completedAt ? "opacity-60" : ""} ${
                          canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        }`}
                        draggable={canEdit}
                        onDragStart={(event) => {
                          if (!canEdit) return;
                          setDragTaskId(task.id);
                          setDragFromSectionId(task.sectionId ?? null);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragTaskId(null);
                          setDragFromSectionId(null);
                          setDragOverSectionId(null);
                        }}
                        onClick={() => {
                          if (dragTaskId) return;
                          router.push(`/projects/task/${task.id}` as any);
                        }}
                      >
                        <div className="absolute top-0 right-0 h-full w-full bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-60"></div>
                        <div
                          className={`absolute top-2 right-2 h-2 w-2 rounded-full shadow-lg ${
                            task.priority === "urgent"
                              ? "bg-rose-400"
                              : task.priority === "high"
                              ? "bg-amber-400"
                              : task.priority === "medium"
                              ? "bg-sky-400"
                              : "bg-emerald-400"
                          }`}
                        />

                        {/* Header: Drag handle + Priority + Actions */}
                        <div className="flex items-start justify-between gap-2 mb-3 relative z-10">
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <GripVertical className="h-4 w-4 text-current opacity-30 group-hover:opacity-60 transition-opacity" />
                            )}
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold border-current/30 bg-black/20"
                            >
                              {task.priority === "urgent" && <AlertCircle className="h-3 w-3 mr-1" />}
                              {task.priority.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="rounded-md p-1.5 bg-black/20 hover:bg-black/40 shadow-sm hover:shadow transition-all text-current hover:text-white"
                              onClick={(event) => {
                                event.stopPropagation();
                                setTaskSettingsId(task.id);
                              }}
                              draggable={false}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded-md p-1.5 bg-black/20 hover:bg-black/40 shadow-sm hover:shadow transition-all text-current hover:text-rose-400"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (confirm("Task wirklich löschen?")) {
                                  deleteTask.mutate({
                                    moduleId: "projects",
                                    procedure: "deleteTask",
                                    input: { taskId: task.id }
                                  });
                                }
                              }}
                              draggable={false}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title */}
                        <div className="mb-2 relative z-10">
                          <div className="flex items-start gap-2">
                            <h4 className={`text-sm font-bold leading-snug ${task.completedAt ? "line-through opacity-70" : "text-white"}`}>
                              {task.title}
                            </h4>
                            {task.completedAt && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                            )}
                          </div>
                          {task.description && (
                            <p className="text-xs mt-1 line-clamp-2 opacity-80">
                              {task.description}
                            </p>
                          )}
                        </div>

                        {/* Tags */}
                        {(task.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3 relative z-10">
                            {task.tags.map((tag: string) => (
                              <span
                                key={tag}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-semibold shadow-sm border border-current/10"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Footer: Assignee + Due Date + Comments */}
                        <div className="flex items-center justify-between gap-2 text-[11px] opacity-75 pt-2 border-t border-current/10 relative z-10">
                          <div className="flex items-center gap-2">
                            {/* Assignee Avatar */}
                            {task.assigneeEmail && (
                              <div className="flex items-center gap-1.5" title={task.assigneeName || task.assigneeEmail}>
                                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-xynoxa-cyan/40 to-aurora-mint/40 flex items-center justify-center ring-1 ring-current/20">
                                  <span className="text-[9px] font-semibold text-white">
                                    {(task.assigneeName || task.assigneeEmail)[0].toUpperCase()}
                                  </span>
                                </div>
                                <span className="text-[10px] font-medium max-w-[80px] truncate">
                                  {task.assigneeName || task.assigneeEmail.split('@')[0]}
                                </span>
                              </div>
                            )}

                            {/* Comments */}
                            {Number(task.commentCount ?? 0) > 0 && (
                              <div className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                <span className="font-medium">{task.commentCount}</span>
                              </div>
                            )}
                          </div>

                          {/* Due Date */}
                          {task.dueAt && (
                            <div className="flex items-center gap-1 font-medium">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(task.dueAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {(tasksBySection.get(section.id ?? null) ?? []).length === 0 && (
                      <div className="text-xs text-slate-500">Keine Tasks in dieser Spalte.</div>
                    )}
                  </CardContent>
                </Card>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <Card className="border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-400/10 p-2 ring-1 ring-cyan-500/30">
                  <ListChecks className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <CardTitle className="text-slate-100">Alle Aufgaben</CardTitle>
                  <CardDescription className="text-slate-400">Übersicht aller Aufgaben in diesem Projekt</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-900/60 p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(6,182,212,0.2)] hover:border-cyan-500/30 cursor-pointer" onClick={() => router.push(`/projects/task/${task.id}` as any)}>
                  <div className={`absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-100 ${task.completedAt ? "from-emerald-500/5 via-transparent to-transparent" : "from-cyan-500/5 via-transparent to-transparent"}`} />
                  <div className="relative z-10 flex items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`h-2 w-2 rounded-full ${task.completedAt ? "bg-emerald-500" : "bg-cyan-400"} shadow-[0_0_8px_rgba(6,182,212,0.6)]`} />
                        <h4 className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
                          {task.title}
                        </h4>
                        {task.completedAt ? (
                          <Badge className="bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Erledigt
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30">Offen</Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${priorityBadgeClass(task.priority)}`}>
                          {task.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1">{task.description || "Keine Beschreibung"}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {Number(task.commentCount ?? 0)}
                        </span>
                        {task.assigneeName || task.assigneeEmail ? (
                          <span className="flex items-center gap-1">
                            <Users2 className="h-3.5 w-3.5" />
                            {task.assigneeName || task.assigneeEmail}
                          </span>
                        ) : null}
                        {task.dueAt ? (
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {new Date(task.dueAt).toLocaleDateString("de-DE")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-4 py-8 text-center">
                  <ListChecks className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Noch keine Tasks vorhanden</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones">
          <Card className="border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-400/10 p-2 ring-1 ring-amber-500/30">
                  <Target className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-slate-100">Meilensteine</CardTitle>
                  <CardDescription className="text-slate-400">Termine und Deliverables im Blick behalten</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-900/60 p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(251,191,36,0.2)] hover:border-amber-500/30">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${milestone.status === "closed" ? "bg-emerald-500" : "bg-amber-400"} shadow-[0_0_8px_rgba(251,191,36,0.6)]`} />
                        <h4 className="font-semibold text-slate-100 group-hover:text-white transition-colors">{milestone.name}</h4>
                        <Badge className={milestone.status === "closed" ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30" : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30"}>
                          {milestone.status === "closed" ? "Abgeschlossen" : "Offen"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{milestone.description || "Keine Beschreibung"}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Fällig am</p>
                        <p className="text-sm font-medium text-slate-300">{milestone.dueAt ? new Date(milestone.dueAt).toLocaleDateString("de-DE") : "Kein Datum"}</p>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <select
                            value={milestone.status}
                            onChange={(e) =>
                              updateMilestone.mutate({
                                moduleId: "projects",
                                procedure: "updateMilestone",
                                input: { milestoneId: milestone.id, status: e.target.value }
                              })
                            }
                            className="rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs text-slate-200 hover:border-slate-600 transition-colors"
                          >
                            <option value="open">Offen</option>
                            <option value="closed">Abgeschlossen</option>
                          </select>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 hover:bg-rose-500/10 hover:text-rose-400"
                            onClick={() => {
                              if (confirm("Meilenstein löschen?")) {
                                deleteMilestone.mutate({
                                  moduleId: "projects",
                                  procedure: "deleteMilestone",
                                  input: { milestoneId: milestone.id }
                                });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {milestones.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-4 py-8 text-center">
                  <Target className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Noch keine Meilensteine</p>
                </div>
              )}
              {canManage && (
                <div className="grid gap-3 md:grid-cols-3">
                  <Input value={milestoneName} onChange={(e) => setMilestoneName(e.target.value)} placeholder="Meilenstein" />
                  <Input type="date" value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} />
                  <Button
                    onClick={() =>
                      createMilestone.mutate({
                        moduleId: "projects",
                        procedure: "createMilestone",
                        input: {
                          projectId: resolvedProjectId,
                          name: milestoneName,
                          dueAt: milestoneDue || undefined
                        }
                      })
                    }
                    disabled={!milestoneName.trim()}
                  >
                    Meilenstein hinzufügen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card className="border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-gradient-to-br from-aurora-mint/20 to-cyan-500/10 p-2 ring-1 ring-aurora-mint/30">
                  <Users2 className="h-5 w-5 text-aurora-mint" />
                </div>
                <div>
                  <CardTitle className="text-slate-100">Team</CardTitle>
                  <CardDescription className="text-slate-400">Projektmitglieder verwalten</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-900/60 p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(69,230,197,0.15)] hover:border-aurora-mint/30">
                  <div className="absolute inset-0 bg-gradient-to-br from-aurora-mint/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-xynoxa-cyan/30 to-aurora-mint/30 ring-2 ring-slate-700 group-hover:ring-aurora-mint/40 transition-all flex items-center justify-center">
                        <span className="text-sm font-semibold text-slate-100">{(member.displayName || member.email)[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-100 group-hover:text-white transition-colors">{member.displayName || member.email}</h4>
                          <Badge className={
                            member.role === "owner" ? "bg-xynoxa-cyan/20 text-xynoxa-cyan ring-1 ring-xynoxa-cyan/30" :
                            member.role === "manager" ? "bg-aurora-mint/20 text-aurora-mint ring-1 ring-aurora-mint/30" :
                            member.role === "member" ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/30" :
                            "bg-slate-700/50 text-slate-300 ring-1 ring-slate-600/50"
                          }>
                            {member.role === "owner" ? "Owner" : member.role === "manager" ? "Manager" : member.role === "member" ? "Member" : "Viewer"}
                          </Badge>
                          {member.source === "group" && (
                            <Badge variant="outline" className="border-slate-700 bg-slate-800/50 text-slate-400 text-[10px]">
                              via Gruppe
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <select
                        value={member.role}
                        disabled={!canManage || member.source === "group"}
                        onChange={(e) =>
                          updateMember.mutate({
                            moduleId: "projects",
                            procedure: "updateMemberRole",
                            input: { memberId: member.id, role: e.target.value }
                          })
                        }
                        className="rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="manager">Manager</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={member.source === "group"}
                          className="h-8 w-8 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
                          onClick={() =>
                            removeMember.mutate({
                              moduleId: "projects",
                              procedure: "removeMember",
                              input: { memberId: member.id }
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {canManage && (
                <div className="grid gap-3 md:grid-cols-3">
                  <Input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="E-Mail" />
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as any)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="manager">Manager</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button
                    onClick={() =>
                      addMember.mutate({
                        moduleId: "projects",
                        procedure: "addMemberByEmail",
                        input: { projectId: resolvedProjectId, email: memberEmail, role: memberRole }
                      })
                    }
                    disabled={!memberEmail.trim()}
                  >
                    Mitglied hinzufügen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-400/10 p-2 ring-1 ring-emerald-500/30">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-slate-100">Projektstatus</CardTitle>
                    <CardDescription className="text-slate-400">Projekt aktiv oder archiviert</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 ring-1 ring-slate-800/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${project.status === "archived" ? "bg-slate-500" : "bg-emerald-500"} shadow-[0_0_12px_rgba(16,185,129,0.6)]`} />
                      <div>
                        <p className="text-sm font-medium text-slate-100">
                          {project.status === "archived" ? "Archiviert" : "Aktiv"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {project.status === "archived" ? "Projekt ist inaktiv" : "Projekt läuft"}
                        </p>
                      </div>
                    </div>
                    <Badge className={project.status === "archived" ? "bg-slate-700/50 text-slate-300 ring-1 ring-slate-600/50" : "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30"}>
                      {project.status === "archived" ? "Archiviert" : "Aktiv"}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={!canManage}
                  className="w-full border-slate-700 hover:border-slate-600 hover:bg-slate-800/60 transition-all"
                  onClick={() =>
                    updateProject.mutate({
                      moduleId: "projects",
                      procedure: "updateProject",
                      input: {
                        projectId: resolvedProjectId,
                        status: project.status === "archived" ? "active" : "archived"
                      }
                    })
                  }
                >
                  {project.status === "archived" ? (
                    <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Projekt reaktivieren</span>
                  ) : (
                    <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Projekt archivieren</span>
                  )}
                </Button>
              </CardContent>
            </Card>
            <Card className="border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-gradient-to-br from-xynoxa-cyan/20 to-aurora-mint/10 p-2 ring-1 ring-xynoxa-cyan/30">
                    <LayoutDashboard className="h-5 w-5 text-aurora-mint" />
                  </div>
                  <div>
                    <CardTitle className="text-slate-100">Spalten verwalten</CardTitle>
                    <CardDescription className="text-slate-400">Board-Spalten konfigurieren</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sections.map((section) => (
                  <div key={section.id} className="group relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 ring-1 ring-slate-800/80 transition-all hover:ring-slate-700/80 hover:border-slate-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full ring-2 ring-slate-700"
                          style={{ backgroundColor: (section as any).color ?? "#94a3b8" }}
                        />
                        <span className="text-sm text-slate-100">{section.name}</span>
                        {section.isDefault && (
                          <Badge variant="outline" className="border-slate-700 bg-slate-800/50 text-slate-400 text-[10px]">
                            Standard
                          </Badge>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:bg-aurora-mint/10 hover:text-aurora-mint"
                            onClick={() => {
                              const next = prompt("Spaltenname", section.name);
                              if (next && next.trim()) {
                                updateSection.mutate({
                                  moduleId: "projects",
                                  procedure: "updateSection",
                                  input: { sectionId: section.id, name: next.trim() }
                                });
                              }
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={section.isDefault}
                            className="h-7 w-7 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-30"
                            onClick={() => {
                              if (confirm("Spalte löschen? Aufgaben werden in die Standardspalte verschoben.")) {
                                deleteSection.mutate({
                                  moduleId: "projects",
                                  procedure: "deleteSection",
                                  input: { sectionId: section.id }
                                });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {canManage && (
                  <div className="flex gap-2 pt-2">
                    <Input
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      placeholder="Neue Spalte"
                      className="bg-slate-900/60 border-slate-700 text-slate-100"
                    />
                    <input
                      type="color"
                      value={newSectionColor}
                      onChange={(e) => setNewSectionColor(e.target.value)}
                      className="h-10 w-12 rounded-md border border-slate-700 bg-slate-900"
                    />
                    <Button
                      onClick={() =>
                        createSection.mutate({
                          moduleId: "projects",
                          procedure: "createSection",
                          input: { projectId: resolvedProjectId, name: newSectionName, color: newSectionColor }
                        })
                      }
                      disabled={!newSectionName.trim()}
                      className="bg-xynoxa-cyan text-white hover:bg-cyan-500"
                    >
                      Hinzufügen
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {selectedTaskSettings && (
        <TaskSettingsModal
          task={selectedTaskSettings}
          members={members}
          sections={sections}
          milestones={milestones}
          canEdit={canEdit}
          onClose={() => {
            setTaskSettingsId(null);
          }}
          onUpdate={(payload) =>
            updateTask.mutate({
              moduleId: "projects",
              procedure: "updateTask",
              input: { taskId: selectedTaskSettings.id, ...payload }
            })
          }
          onToggle={(completed) =>
            toggleTask.mutate({
              moduleId: "projects",
              procedure: "toggleTaskComplete",
              input: { taskId: selectedTaskSettings.id, completed }
            })
          }
          onDelete={() =>
            deleteTask.mutate({
              moduleId: "projects",
              procedure: "deleteTask",
              input: { taskId: selectedTaskSettings.id }
            })
          }
        />
      )}


      <Dialog open={projectEditOpen} onOpenChange={setProjectEditOpen}>
        <DialogContent className="max-w-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-900/90 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-xynoxa-cyan/20 to-aurora-mint/10 p-2 ring-1 ring-xynoxa-cyan/30">
                <Pencil className="h-5 w-5 text-aurora-mint" />
              </div>
              <DialogTitle className="text-slate-100 text-xl">Projekt bearbeiten</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Projektname</label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Projektname"
                className="bg-slate-900/60 border-slate-700 text-slate-100 focus:border-aurora-mint/50 focus:ring-1 focus:ring-aurora-mint/20"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Beschreibung</label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-aurora-mint/50 focus:ring-1 focus:ring-aurora-mint/20"
                placeholder="Worum geht es in diesem Projekt?"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Tags</label>
              <Input
                value={projectTags}
                onChange={(e) => setProjectTags(e.target.value)}
                placeholder="z.B. product, marketing (kommagetrennt)"
                className="bg-slate-900/60 border-slate-700 text-slate-100 focus:border-aurora-mint/50 focus:ring-1 focus:ring-aurora-mint/20"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setProjectEditOpen(false)}
                className="border-slate-700 hover:bg-slate-800/60 hover:border-slate-600"
              >
                Abbrechen
              </Button>
              <Button
                onClick={() =>
                  updateProject.mutate({
                    moduleId: "projects",
                    procedure: "updateProject",
                    input: {
                      projectId: resolvedProjectId,
                      name: projectName,
                      description: projectDescription,
                      tags: projectTags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                    }
                  })
                }
                disabled={!canManage}
                className="bg-xynoxa-cyan text-white hover:bg-cyan-500"
              >
                Änderungen speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent: string }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-gradient-to-br p-4 shadow-lg ${accent}`}>
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

function TaskSettingsModal({
  task,
  members,
  sections,
  milestones,
  canEdit,
  onClose,
  onUpdate,
  onToggle,
  onDelete
}: {
  task: any;
  members: any[];
  sections: any[];
  milestones: any[];
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (payload: any) => void;
  onToggle: (completed: boolean) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [sectionId, setSectionId] = useState(task.sectionId ?? "");
  const [milestoneId, setMilestoneId] = useState(task.milestoneId ?? "");
  const [tags, setTags] = useState((task.tags ?? []).join(", "));
  const [dueAt, setDueAt] = useState(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : "");

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setAssigneeId(task.assigneeId ?? "");
    setSectionId(task.sectionId ?? "");
    setMilestoneId(task.milestoneId ?? "");
    setTags((task.tags ?? []).join(", "));
    setDueAt(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : "");
  }, [task.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-900/90 text-slate-100 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-xynoxa-cyan/20 to-aurora-mint/10 p-2 ring-1 ring-xynoxa-cyan/30">
              <Settings className="h-5 w-5 text-aurora-mint" />
            </div>
            <DialogTitle className="text-xl">Task-Einstellungen</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Titel</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="bg-slate-900/60 border-slate-700 text-slate-100 focus:border-aurora-mint/50 focus:ring-1 focus:ring-aurora-mint/20"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Beschreibung</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-aurora-mint/50 focus:ring-1 focus:ring-aurora-mint/20"
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Priorität</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-aurora-mint/50 focus:outline-none focus:ring-1 focus:ring-aurora-mint/20"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Zuweisung</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-aurora-mint/50 focus:outline-none focus:ring-1 focus:ring-aurora-mint/20"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName || member.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Spalte</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-aurora-mint/50 focus:outline-none focus:ring-1 focus:ring-aurora-mint/20"
              >
                <option value="">Keine</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Meilenstein</label>
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-aurora-mint/50 focus:outline-none focus:ring-1 focus:ring-aurora-mint/20"
              >
                <option value="">Kein Meilenstein</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Fällig am</label>
              <Input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                disabled={!canEdit}
                className="bg-slate-900/60 border-slate-700 text-slate-100 focus:border-aurora-mint/50 focus:ring-1 focus:ring-aurora-mint/20"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2 block">Tags</label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                disabled={!canEdit}
                className="bg-slate-900/60 border-slate-700 text-slate-100 focus:border-aurora-mint/50 focus:ring-1 focus:ring-aurora-mint/20"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onToggle(!task.completedAt)}
              disabled={!canEdit}
              className="border-slate-700 hover:bg-slate-800/60 hover:border-slate-600"
            >
              {task.completedAt ? (
                <>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Wieder öffnen
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Als erledigt markieren
                </>
              )}
            </Button>
            <Button
              onClick={() =>
                onUpdate({
                  title,
                  description,
                  priority,
                  assigneeId: assigneeId || undefined,
                  sectionId: sectionId === "" ? null : sectionId,
                  milestoneId: milestoneId || undefined,
                  dueAt: dueAt || undefined,
                  tags: tags
                    .split(",")
                    .map((t: string) => t.trim())
                    .filter(Boolean)
                })
              }
              disabled={!canEdit}
              className="bg-xynoxa-cyan text-white hover:bg-cyan-500"
            >
              Änderungen speichern
            </Button>
            <Button
              variant="ghost"
              className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={() => {
                if (confirm("Task wirklich löschen?")) {
                  onDelete();
                }
              }}
              disabled={!canEdit}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Task löschen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailDialog({
  task,
  canEdit,
  onClose,
  onEdit
}: {
  task: any;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const commentsQuery = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "projects",
    procedure: "listTaskComments",
    input: { taskId: task.id }
  });

  const [commentText, setCommentText] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const addComment = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      setCommentText("");
      setReplyText("");
      setReplyToId(null);
      commentsQuery.refetch();
    }
  });

  const comments = (commentsQuery.data as any[] | undefined) ?? [];
  const commentMap = new Map<string, any>();
  comments.forEach((comment) => commentMap.set(comment.id, { ...comment, replies: [] as any[] }));
  const roots: any[] = [];
  commentMap.forEach((comment) => {
    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      if (parent) parent.replies.push(comment);
      else roots.push(comment);
    } else {
      roots.push(comment);
    }
  });

  const renderComment = (comment: any, depth: number) => (
    <div key={comment.id} style={{ marginLeft: depth * 16 }} className="space-y-2">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
        <div className="text-xs text-slate-400">
          {comment.displayName || comment.email} · {new Date(comment.createdAt).toLocaleString("de-DE")}
        </div>
        <div className="mt-1 whitespace-pre-wrap">{comment.content}</div>
        {canEdit && (
          <button
            className="mt-2 text-xs text-aurora-mint hover:text-aurora-mint/80"
            onClick={() => {
              setReplyToId(comment.id);
              setReplyText("");
            }}
          >
            Antworten
          </button>
        )}
      </div>
      {replyToId === comment.id && canEdit && (
        <div className="space-y-2">
          <textarea
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            placeholder="Antwort schreiben..."
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                addComment.mutate({
                  moduleId: "projects",
                  procedure: "addTaskComment",
                  input: { taskId: task.id, content: replyText, parentId: comment.id }
                })
              }
              disabled={!replyText.trim()}
            >
              Antworten
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReplyToId(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
      {(comment.replies ?? []).map((child: any) => renderComment(child, depth + 1))}
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl border border-slate-800 bg-slate-950/95 text-slate-100">
        <DialogHeader>
          <DialogTitle>Task-Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-50">{task.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{task.description || "Keine Beschreibung"}</p>
              </div>
              {canEdit && (
                <Button variant="outline" className="border-xynoxa-cyan/60 text-xynoxa-cyan" onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Bearbeiten
                </Button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>Priorität: {task.priority}</span>
              {task.dueAt ? <span>Fällig: {new Date(task.dueAt).toLocaleDateString("de-DE")}</span> : null}
              {task.assigneeEmail ? <span>Zugewiesen: {task.assigneeName || task.assigneeEmail}</span> : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-200">Kommentare</div>
            {roots.length === 0 ? (
              <div className="text-sm text-slate-500">Noch keine Kommentare.</div>
            ) : (
              <div className="space-y-3">{roots.map((comment) => renderComment(comment, 0))}</div>
            )}
            {canEdit && (
              <div className="space-y-2">
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                  placeholder="Kommentar hinzufügen..."
                />
                <Button
                  onClick={() =>
                    addComment.mutate({
                      moduleId: "projects",
                      procedure: "addTaskComment",
                      input: { taskId: task.id, content: commentText }
                    })
                  }
                  disabled={!commentText.trim()}
                >
                  Kommentar speichern
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
