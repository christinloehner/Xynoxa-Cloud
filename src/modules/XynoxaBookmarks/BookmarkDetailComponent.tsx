/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareDialog } from "@/components/share/share-dialog";
import { ArrowLeft, ExternalLink, Pencil, Trash2, Share2, Tag as TagIcon } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useDebouncedCallback } from "use-debounce";

interface BookmarkDetailComponentProps {
  bookmarkId: string;
}

export default function BookmarkDetailComponent({ bookmarkId }: BookmarkDetailComponentProps) {
  const router = useRouter();
  const toast = useToast();
  
  const bookmark = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "bookmarks",
    procedure: "list"
  }, {
    select: (data) => (data as any[])?.find((b: any) => b.id === bookmarkId)
  });
  
  const update = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      bookmark.refetch();
      setAutosave("gespeichert");
      setIsEditing(false);
      toast.push({ title: "Bookmark aktualisiert", tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Aktualisieren", description: err.message, tone: "error" })
  });
  
  const deleteBookmark = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      toast.push({ title: "Bookmark gelöscht", tone: "success" });
      router.push("/bookmarks");
    },
    onError: (err) => toast.push({ title: "Fehler beim Löschen", description: err.message, tone: "error" })
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTagInput, setEditTagInput] = useState("");
  const [autosave, setAutosave] = useState<"idle" | "saving" | "gespeichert">("idle");
  const [shareOpen, setShareOpen] = useState(false);

  const autoSave = useDebouncedCallback(() => {
    if (!bookmark.data || !isEditing) return;
    setAutosave("saving");
    const tags = editTagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    update.mutate({
      moduleId: "bookmarks",
      procedure: "update",
      input: {
        id: bookmarkId,
        title: editTitle,
        description: editDescription,
        tags
      }
    });
  }, 700);

  const handleEdit = () => {
    if (!bookmark.data) return;
    setEditTitle(bookmark.data.title || "");
    setEditDescription(bookmark.data.description || "");
    setEditTagInput(bookmark.data.tags?.map((t: any) => t.name).join(", ") || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!bookmark.data) return;
    const tags = editTagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    update.mutate({
      moduleId: "bookmarks",
      procedure: "update",
      input: {
        id: bookmarkId,
        title: editTitle,
        description: editDescription,
        tags
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Dieses Bookmark wirklich löschen?")) {
      deleteBookmark.mutate({
        moduleId: "bookmarks",
        procedure: "delete",
        input: { id: bookmarkId }
      });
    }
  };

  if (bookmark.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-600 dark:text-slate-400">Lade Bookmark...</div>
      </div>
    );
  }

  if (!bookmark.data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-slate-600 dark:text-slate-400">Bookmark nicht gefunden</div>
        <Button onClick={() => router.push("/bookmarks")} variant="outline">
          <ArrowLeft size={16} className="mr-2" />
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  const b = bookmark.data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={() => router.push("/bookmarks")} variant="ghost" size="sm">
          <ArrowLeft size={16} className="mr-2" />
          Zurück
        </Button>
        <div className="flex gap-2">
          <Button onClick={() => setShareOpen(true)} variant="outline" size="sm">
            <Share2 size={16} className="mr-2" />
            Teilen
          </Button>
          {!isEditing ? (
            <Button onClick={handleEdit} variant="outline" size="sm">
              <Pencil size={16} className="mr-2" />
              Bearbeiten
            </Button>
          ) : (
            <>
              <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">
                Abbrechen
              </Button>
              <Button onClick={handleSave} size="sm" disabled={update.isPending}>
                {update.isPending ? "Speichert..." : "Speichern"}
              </Button>
            </>
          )}
          <Button onClick={handleDelete} variant="outline" size="sm" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {/* Bookmark Detail Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            {b.faviconUrl && (
              <img
                src={b.faviconUrl}
                alt=""
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              {!isEditing ? (
                <>
                  <CardTitle className="text-2xl break-words">{b.title}</CardTitle>
                  {b.description && (
                    <CardDescription className="mt-2 break-words">{b.description}</CardDescription>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-title">Titel</Label>
                    <Input
                      id="edit-title"
                      value={editTitle}
                      onChange={(e) => {
                        setEditTitle(e.target.value);
                        autoSave();
                      }}
                      placeholder="Titel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-description">Beschreibung</Label>
                    <Input
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => {
                        setEditDescription(e.target.value);
                        autoSave();
                      }}
                      placeholder="Beschreibung (optional)"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL */}
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-400">URL</Label>
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 hover:underline mt-1 break-all"
            >
              <ExternalLink size={16} className="flex-shrink-0" />
              {b.url}
            </a>
          </div>

          {/* Tags */}
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-2">
              <TagIcon size={14} />
              Tags
            </Label>
            {!isEditing ? (
              <div className="flex flex-wrap gap-2">
                {b.tags.length > 0 ? (
                  b.tags.map((tag: any) => (
                    <Badge key={tag.id} variant="secondary">
                      {tag.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400">Keine Tags</span>
                )}
              </div>
            ) : (
              <Input
                value={editTagInput}
                onChange={(e) => {
                  setEditTagInput(e.target.value);
                  autoSave();
                }}
                placeholder="Tags (kommagetrennt)"
              />
            )}
          </div>

          {/* Metadata */}
          <div className="text-xs text-slate-500 dark:text-slate-400 pt-4 border-t">
            Erstellt: {new Date(b.createdAt).toLocaleDateString("de-DE", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </div>

          {/* Autosave Status */}
          {isEditing && autosave !== "idle" && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {autosave === "saving" ? "Speichert..." : "✓ Gespeichert"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share Dialog */}
      {shareOpen && (
        <ShareDialog
          entityType="bookmark"
          entityId={b.id}
          title={b.title || "Bookmark"}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
    </div>
  );
}
