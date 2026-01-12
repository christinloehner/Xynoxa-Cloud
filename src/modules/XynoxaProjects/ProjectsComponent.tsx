/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { FolderKanban, PlusCircle, Users2, Flame, CalendarClock } from "lucide-react";

export default function ProjectsComponent() {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [groupId, setGroupId] = useState<string>("");

  const listProjects = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "projects",
    procedure: "listProjects"
  });

  const groups = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "projects",
    procedure: "listGroupsForUser"
  });

  const createProject = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Projekt erstellt", tone: "success" });
      setCreateOpen(false);
      setName("");
      setDescription("");
      setTags("");
      setGroupId("");
      listProjects.refetch();
    },
    onError: (err) => toast.push({ title: "Fehler", description: err.message, tone: "error" })
  });

  const projectRows = useMemo(() => (listProjects.data as any[]) ?? [], [listProjects.data]);

  const handleCreate = () => {
    if (!name.trim()) return;
    createProject.mutate({
      moduleId: "projects",
      procedure: "createProject",
      input: {
        name: name.trim(),
        description: description.trim() || undefined,
        groupId: groupId || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-aurora-mint/12 to-xynoxa-cyan/16 p-6 md:p-8 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-xynoxa-cyan/20">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-aurora-mint">Projekte</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">Projektverwaltung</h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl dark:text-slate-300">
              Plane, organisiere und steuere Projekte mit Boards, Tasks und Milestones.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-xynoxa-cyan/60 text-xynoxa-cyan" onClick={() => setCreateOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Neues Projekt
            </Button>
          </div>
        </header>
      </div>

      {listProjects.isLoading ? (
        <div className="text-sm text-slate-500">Projekte werden geladen...</div>
      ) : projectRows.length === 0 ? (
        <Card className="border-dashed border-slate-800 bg-slate-950/60 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <FolderKanban className="h-5 w-5 text-aurora-mint" />
              Noch keine Projekte
            </CardTitle>
            <CardDescription className="text-slate-400">Starte mit deinem ersten Projekt und lade dein Team ein.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="bg-xynoxa-cyan text-white hover:bg-cyan-500" onClick={() => setCreateOpen(true)}>
              Projekt anlegen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {projectRows.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="group">
              <Card className="relative overflow-hidden border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-900/70 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-8px_rgba(124,58,237,0.25)] hover:border-xynoxa-cyan/40">
                <div className="absolute inset-0 bg-gradient-to-br from-xynoxa-cyan/5 via-transparent to-aurora-mint/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <CardHeader className="pb-3 relative z-10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="rounded-xl bg-gradient-to-br from-xynoxa-cyan/20 to-aurora-mint/20 p-3 ring-1 ring-slate-700/50 group-hover:ring-xynoxa-cyan/50 transition-all duration-300 group-hover:scale-105">
                        <FolderKanban className="h-5 w-5 text-aurora-mint" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg text-slate-100 group-hover:text-white transition-colors">{project.name}</CardTitle>
                        <CardDescription className="line-clamp-2 text-slate-400 mt-1">{project.description || "Kein Beschreibungstext"}</CardDescription>
                      </div>
                    </div>
                    <Badge className={project.status === "archived" ? "bg-slate-800/80 text-slate-300 ring-1 ring-slate-700" : "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30"}>
                      {project.status === "archived" ? "Archiviert" : "Aktiv"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 relative z-10">
                  <div className="flex flex-wrap gap-2">
                    {(project.tags ?? []).length > 0 ? (
                      project.tags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="border-slate-700/70 bg-slate-900/50 text-aurora-mint hover:bg-slate-900/70 transition-colors">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">Keine Tags</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-slate-900/60 px-3 py-2 ring-1 ring-slate-800/80 group-hover:ring-slate-700/80 transition-all">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Flame className="h-4 w-4 text-rose-400" />
                        <span className="font-medium">{project.stats?.open ?? 0}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Offen</p>
                    </div>
                    <div className="rounded-lg bg-slate-900/60 px-3 py-2 ring-1 ring-slate-800/80 group-hover:ring-slate-700/80 transition-all">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Users2 className="h-4 w-4 text-aurora-mint" />
                        <span className="font-medium">Team</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Mitglieder</p>
                    </div>
                    <div className="rounded-lg bg-slate-900/60 px-3 py-2 ring-1 ring-slate-800/80 group-hover:ring-slate-700/80 transition-all">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <CalendarClock className="h-4 w-4 text-amber-400" />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{new Date(project.updatedAt).toLocaleDateString("de-DE")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Neues Projekt erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Projektname" className="bg-slate-800 border-slate-700 text-slate-100" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Beschreibung</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-xynoxa-cyan/80"
                placeholder="Worum geht es in diesem Projekt?"
                rows={4}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Tags</label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="z.B. product, marketing"
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Gruppe (optional)</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-xynoxa-cyan/80"
              >
                <option value="">Keine Gruppe</option>
                {(groups.data as any[] | undefined)?.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || createProject.isPending}>
                {createProject.isPending ? "Erstelle..." : "Projekt erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
