/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import type { MouseEvent } from "react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2, Bookmark as BookmarkIcon, Tag as TagIcon, Plus, Upload, Share2 } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { useToast } from "@/components/ui/toast";
import { ShareDialog } from "@/components/share/share-dialog";

export default function BookmarksComponent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const me = trpc.auth.me.useQuery();
  const list = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "bookmarks",
    procedure: "list"
  });
  const toast = useToast();
  const create = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      list.refetch();
      setCreateOpen(false);
      setUrl("");
      setTitle("");
      setDescription("");
      setTagInput("");
      toast.push({ title: "Bookmark gespeichert", tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Speichern", description: err.message, tone: "error" })
  });
  const update = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      list.refetch();
      setAutosave("gespeichert");
      setEditOpen(false);
      toast.push({ title: "Bookmark aktualisiert", tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Aktualisieren", description: err.message, tone: "error" })
  });
  const deleteBookmark = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      list.refetch();
      setSelectedIds(new Set());
      toast.push({ title: "Bookmark gelöscht", tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Löschen", description: err.message, tone: "error" })
  });
  const fetchMetadata = trpc.moduleApi.invoke.useMutation();
  const deleteMany = trpc.moduleApi.invoke.useMutation({
    onSuccess: (res) => {
      const result = res as any;
      list.refetch();
      setSelectedIds(new Set());
      toast.push({ title: `${result.deleted} Bookmarks gelöscht`, tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Löschen", description: err.message, tone: "error" })
  });
  const importHtml = trpc.moduleApi.invoke.useMutation({
    onSuccess: (res) => {
      const result = res as any;
      list.refetch();
      toast.push({
        title: "Import abgeschlossen",
        description: `${result.imported} importiert, ${result.skipped} übersprungen.`,
        tone: "success"
      });
    },
    onError: (err) => toast.push({ title: "Import fehlgeschlagen", description: err.message, tone: "error" })
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedBookmark, setSelectedBookmark] = useState<any>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [autosave, setAutosave] = useState<"idle" | "saving" | "gespeichert">("idle");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareBookmark, setShareBookmark] = useState<any | null>(null);
  const [lastInteractedId, setLastInteractedId] = useState<string | null>(null);
  const autoUpdate = useDebouncedCallback(() => {
    if (!selectedBookmark) return;
    setAutosave("saving");
    const tags = selectedBookmark.tagInput
      ? selectedBookmark.tagInput.split(",").map((t: string) => t.trim()).filter(Boolean)
      : selectedBookmark.tags.map((t: any) => t.name);
    update.mutate({
      moduleId: "bookmarks",
      procedure: "update",
      input: {
        id: selectedBookmark.id,
        title: selectedBookmark.title,
        description: selectedBookmark.description,
        tags
      }
    });
  }, 700);

  const listData = (list.data as any[]) ?? [];
  const allTags = Array.from(
    new Set(listData.flatMap((b: any) => b.tags.map((t: any) => t.name)))
  );

  const filteredBookmarks = filterTag
    ? listData.filter((b: any) => b.tags.some((t: any) => t.name === filterTag))
    : listData;
  const bookmarksInView = filteredBookmarks ?? [];

  const handleFetchMetadata = async () => {
    if (!url) return;
    try {
      const metadata = await fetchMetadata.mutateAsync({
        moduleId: "bookmarks",
        procedure: "fetchMetadata",
        input: { url }
      }) as any;
      setTitle(metadata.title);
      setDescription(metadata.description);
      setFaviconUrl(metadata.faviconUrl);
    } catch (error) {
      console.error("Failed to fetch metadata", error);
    }
  };

  const handleCreate = () => {
    if (!url || !title) return;
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    create.mutate({
      moduleId: "bookmarks",
      procedure: "create",
      input: { url, title, description, faviconUrl, tags }
    });
  };

  const openEdit = (bookmark: any) => {
    setSelectedBookmark(bookmark);
    setEditOpen(true);
    setAutosave("idle");
  };

  const handleUpdate = () => {
    if (!selectedBookmark) return;
    const tags = selectedBookmark.tagInput
      ? selectedBookmark.tagInput.split(",").map((t: string) => t.trim()).filter(Boolean)
      : selectedBookmark.tags.map((t: any) => t.name);
    update.mutate(
      {
        moduleId: "bookmarks",
        procedure: "update",
        input: {
          id: selectedBookmark.id,
          title: selectedBookmark.title,
          description: selectedBookmark.description,
          tags
        }
      },
      { onSuccess: () => setEditOpen(false) }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm("Dieses Bookmark wirklich löschen?")) {
      deleteBookmark.mutate({
        moduleId: "bookmarks",
        procedure: "delete",
        input: { id }
      });
    }
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} Bookmarks löschen?`)) return;
    deleteMany.mutate({
      moduleId: "bookmarks",
      procedure: "deleteMany",
      input: { ids }
    });
  };

  const toggleSelection = (id: string, e: MouseEvent) => {
    const multi = e.ctrlKey || e.metaKey;
    const range = e.shiftKey;
    let next = new Set(multi ? selectedIds : new Set<string>());

    if (range && lastInteractedId && bookmarksInView.length > 0) {
      const lastIdx = bookmarksInView.findIndex((b) => b.id === lastInteractedId);
      const currentIdx = bookmarksInView.findIndex((b) => b.id === id);
      if (lastIdx !== -1 && currentIdx !== -1) {
        if (!multi) next = new Set<string>();
        const start = Math.min(lastIdx, currentIdx);
        const end = Math.max(lastIdx, currentIdx);
        for (let i = start; i <= end; i++) {
          next.add(bookmarksInView[i].id);
        }
      }
    } else {
      if (multi) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next = new Set([id]);
      }
    }

    setSelectedIds(next);
    setLastInteractedId(id);
  };

  const handleImportFile = async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    importHtml.mutate({
      moduleId: "bookmarks",
      procedure: "importHtml",
      input: { html: text }
    });
  };

  useEffect(() => {
    if (!selectedBookmark) return;
    autoUpdate();
  }, [selectedBookmark, autoUpdate]);

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-aurora-mint/12 to-xynoxa-cyan/16 p-6 md:p-8 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-xynoxa-cyan/20">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-aurora-mint">Bookmarks</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">Links &amp; Tags</h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl dark:text-slate-300">
              Vollständige Bookmark-Verwaltung mit Metadata-Fetching und Tags.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center">
              <input
                type="file"
                accept=".html,text/html"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0])}
              />
              <Button variant="outline" asChild disabled={importHtml.isPending} className="border-xynoxa-cyan/60 text-xynoxa-cyan">
                <span>
                  <Upload size={16} className="mr-2" />
                  {importHtml.isPending ? "Importiert..." : "Bookmarks importieren"}
                </span>
              </Button>
            </label>
            <Button className="bg-xynoxa-cyan text-white hover:bg-cyan-500" onClick={() => setCreateOpen(true)}>
              <Plus size={16} className="mr-2" />
              Neues Bookmark
            </Button>
          </div>
        </header>
      </div>

      {!me.data?.user ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
          Bitte <Link href="/auth/login" className="underline">einloggen</Link>, um Bookmarks zu sehen.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tag Filter */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 shadow-lg">
            <span className="text-sm text-slate-400">Filter nach Tag:</span>
            <Button
              variant={!filterTag ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterTag("")}
            >
              Alle
            </Button>
            {allTags.map((tag: string) => (
              <Button
                key={tag}
                variant={filterTag === tag ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterTag(tag)}
              >
                <TagIcon size={12} className="mr-1" />
                {tag}
              </Button>
            ))}
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
              <span>{selectedIds.size} Bookmark{selectedIds.size === 1 ? "" : "s"} ausgewählt</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  className="border-cyan-400/60 text-cyan-50"
                >
                  Auswahl aufheben
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={deleteMany.isPending}
                >
                  {deleteMany.isPending ? "Löscht..." : "Ausgewählte löschen"}
                </Button>
              </div>
            </div>
          )}

          {/* Bookmarks Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bookmarksInView.map((bookmark: any) => {
              const selected = selectedIds.has(bookmark.id);
              return (
              <div
                key={bookmark.id}
                onClick={(e) => toggleSelection(bookmark.id, e)}
                className={`rounded-xl border p-4 space-y-3 transition group cursor-pointer ${
                  selected
                    ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start gap-3">
                  {bookmark.faviconUrl ? (
                    <>
                      {/* eslint-disable @next/next/no-img-element */}
                      <img
                        src={bookmark.faviconUrl}
                        alt=""
                        className="w-6 h-6 rounded"
                        onError={(e) => {
                          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/%3E%3C/svg%3E";
                        }}
                      />
                      {/* eslint-enable @next/next/no-img-element */}
                    </>
                  ) : (
                    <BookmarkIcon size={20} className="text-slate-400 dark:text-slate-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-50 truncate">{bookmark.title}</h3>
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-slate-400 hover:text-cyan-300 truncate flex items-center gap-1"
                    >
                      {new URL(bookmark.url).hostname}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(bookmark);
                      }}
                    className="text-cyan-300 hover:text-cyan-200"
                  >
                    <Pencil size={14} />
                  </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareBookmark(bookmark);
                      }}
                      className="text-cyan-300 hover:text-cyan-200"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(bookmark.id);
                      }}
                      className="text-red-500 hover:text-red-400 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2 size={14} />
                    </button>
                    {selected && <span className="text-[11px] text-cyan-200 ml-1">✓</span>}
                  </div>
                </div>
                {bookmark.description && (
                  <p className="text-sm text-slate-300 line-clamp-2">{bookmark.description}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  {bookmark.tags.map((tag: any) => (
                    <Badge key={tag.id} tone="cyan" className="text-xs">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            );
            })}
          </div>

          {filteredBookmarks?.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-12 text-center">
              <BookmarkIcon size={48} className="mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">
                {filterTag ? "Keine Bookmarks mit diesem Tag gefunden" : "Noch keine Bookmarks erstellt"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Neues Bookmark erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="text-slate-200">URL</Label>
              <div className="flex gap-2">
                <Input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100 flex-1"
                  placeholder="https://example.com"
                />
                <Button
                  variant="outline"
                  onClick={handleFetchMetadata}
                  disabled={!url || fetchMetadata.isPending}
                >
                  {fetchMetadata.isPending ? "Lade..." : "Metadaten laden"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title" className="text-slate-200">Titel</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="Mein Bookmark"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-200">Beschreibung (optional)</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-20 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Kurze Beschreibung..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags" className="text-slate-200">Tags (komma-separiert)</Label>
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="webdev, tutorial, wichtig"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleCreate} disabled={create.isPending || !url || !title}>
                {create.isPending ? "Erstelle..." : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Bookmark bearbeiten</DialogTitle>
          </DialogHeader>
          {selectedBookmark && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editTitle" className="text-slate-200">Titel</Label>
                <Input
                  id="editTitle"
                  value={selectedBookmark.title}
                  onChange={(e) => setSelectedBookmark({ ...selectedBookmark, title: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription" className="text-slate-200">Beschreibung</Label>
                <textarea
                  id="editDescription"
                  value={selectedBookmark.description || ""}
                  onChange={(e) => setSelectedBookmark({ ...selectedBookmark, description: e.target.value })}
                  className="w-full h-20 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTags" className="text-slate-200">Tags (komma-separiert)</Label>
                <Input
                  id="editTags"
                  value={
                    selectedBookmark.tagInput ??
                    selectedBookmark.tags.map((t: any) => t.name).join(", ")
                  }
                  onChange={(e) => setSelectedBookmark({ ...selectedBookmark, tagInput: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleUpdate} disabled={update.isPending}>
                  {update.isPending ? "Speichere..." : "Speichern"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {shareBookmark && (
        <ShareDialog
          open={!!shareBookmark}
          onOpenChange={(o) => { if (!o) setShareBookmark(null); }}
          entityId={shareBookmark.id}
          entityType="bookmark"
          title={shareBookmark.title ?? shareBookmark.url}
        />
      )}
    </div>
  );
}
