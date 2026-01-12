/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Pencil, Trash2, FileText, Tag as TagIcon, Share2, Shield } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { saveAs } from "file-saver";
import { useDebouncedCallback } from "use-debounce";
import { encryptText, decryptText } from "@/lib/vault-crypto";
import { useVaultKey } from "@/lib/vault-context";
import { useToast } from "@/components/ui/toast";
import { useSearchParams, useRouter } from "next/navigation";
import { ShareDialog } from "@/components/share/share-dialog";

export default function NotesComponent() {
  const me = trpc.auth.me.useQuery();
  const list = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "notes",
    procedure: "list"
  });
  const toast = useToast();
  const create = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      list.refetch();
      setCreateOpen(false);
      setTitle("");
      setTagInput("");
      editor?.commands.setContent("");
      toast.push({ title: "Notiz gespeichert", tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Speichern", description: err.message, tone: "error" })
  });
  const update = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      list.refetch();
      setAutosaveState("gespeichert");
      setEditOpen(false);
      toast.push({ title: "Notiz aktualisiert", tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Aktualisieren", description: err.message, tone: "error" })
  });
  const deleteNote = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => {
      list.refetch();
      toast.push({ title: "Notiz gelöscht", tone: "success" });
    },
    onError: (err) => toast.push({ title: "Fehler beim Löschen", description: err.message, tone: "error" })
  });
  const exportNote = trpc.moduleApi.invoke.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [autosaveState, setAutosaveState] = useState<"idle" | "speichert" | "gespeichert">("idle");
  const [vault, setVault] = useState(false);
  const { envelopeKey, hasKey, loading: vaultLoading, state: vaultState } = useVaultKey();
  const [shareNote, setShareNote] = useState<any | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [autoNoteId, setAutoNoteId] = useState<string | null>(() => searchParams.get("open"));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Schreibe deine Notiz...",
      }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none min-h-[200px] focus:outline-none p-4",
      },
    },
  });

  const editEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Schreibe deine Notiz...",
      }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none min-h-[200px] focus:outline-none p-4",
      },
    },
  });

  useEffect(() => {
    if (selectedNote && editEditor) {
      editEditor.commands.setContent(selectedNote.content || "");
    }
  }, [selectedNote, editEditor]);

  const autosave = useDebouncedCallback(() => {
    if (!selectedNote || !editEditor) return;
    setAutosaveState("speichert");
    const content = editEditor.getHTML() || "";
    const tags = selectedNote.tagInput
      ? selectedNote.tagInput.split(",").map((t: string) => t.trim()).filter(Boolean)
      : selectedNote.tags.map((t: any) => t.name);
    update.mutate({
      moduleId: "notes",
      procedure: "update",
      input: {
        id: selectedNote.id,
        title: selectedNote.title,
        content,
        tags,
        autosave: true
      }
    });
  }, 800);

  const decryptNote = useCallback(
    async (note: any) => {
      if (!note.isVault) return note;
      if (!note.ciphertext || !note.iv || !envelopeKey) return { ...note, locked: true };
      const plain = await decryptText(note.ciphertext, note.iv, envelopeKey);
      const [t, ...rest] = plain.split("|||");
      return { ...note, title: t, content: rest.join("|||"), locked: false };
    },
    [envelopeKey]
  );

  const notesKey = useMemo(
    () => (list.data as any[] | undefined)?.map((n) => n.id).join("|") ?? "empty",
    [list.data]
  );
  const decryptedNotesQuery = useQuery({
    queryKey: ["notes-decrypted", notesKey, envelopeKey],
    enabled: !!list.data,
    queryFn: async () => {
      if (!list.data) return [];
      return Promise.all((list.data as any[]).map((n: any) => decryptNote(n)));
    }
  });
  const viewNotes = useMemo(() => decryptedNotesQuery.data ?? [], [decryptedNotesQuery.data]);

  const allTags = Array.from(new Set(viewNotes.flatMap((n: any) => n.tags.map((t: any) => t.name))));

  const filteredNotes = filterTag
    ? viewNotes.filter((n: any) => n.tags.some((t: any) => t.name === filterTag))
    : viewNotes;

  // Öffne Note direkt über Query-Param ?open=<id>
  const autoNote = useMemo(
    () => (autoNoteId ? viewNotes.find((n) => n.id === autoNoteId) ?? null : null),
    [autoNoteId, viewNotes]
  );
  const noteInView = selectedNote ?? autoNote;
  const detailDialogOpen = detailOpen || (!!autoNote && !detailOpen);

  const handleCreate = () => {
    if (!title.trim()) return;
    const content = editor?.getHTML() || "";
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (vault && envelopeKey) {
      encryptText(`${title}|||${content}`, envelopeKey).then(({ cipher, iv }) => {
        create.mutate({
          moduleId: "notes",
          procedure: "create",
          input: { title, content: "", ciphertext: cipher, iv, isVault: true, tags }
        });
      });
    } else {
      create.mutate({
        moduleId: "notes",
        procedure: "create",
        input: { title, content, tags, isVault: false }
      });
    }
  };

  const openEdit = (note: any) => {
    if (note.isVault && note.locked) {
      alert("Vault-Note ist gesperrt. Bitte Passphrase setzen, um zu bearbeiten.");
      return;
    }
    setSelectedNote(note);
    setEditOpen(true);
    setAutosaveState("idle");
    setAutoNoteId(null);
  };

  const openDetail = (note: any) => {
    setSelectedNote(note);
    setDetailOpen(true);
    setAutoNoteId(null);
  };

  const handleDetailDialogChange = (open: boolean) => {
    if (!open) {
      setDetailOpen(false);
      setAutoNoteId(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("open");
      const qs = params.toString();
      const targetUrl = `/notes${qs ? `?${qs}` : ""}`;
      router.replace(targetUrl as any);
      return;
    }
    setDetailOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedNote) return;
    const content = editEditor?.getHTML() || "";
    const tags = selectedNote.tagInput
      ? selectedNote.tagInput.split(",").map((t: string) => t.trim()).filter(Boolean)
      : selectedNote.tags.map((t: any) => t.name);
    if (selectedNote.isVault && envelopeKey) {
      encryptText(`${selectedNote.title}|||${content}`, envelopeKey).then(({ cipher, iv }) =>
        update.mutate(
          {
            moduleId: "notes",
            procedure: "update",
            input: {
              id: selectedNote.id,
              title: selectedNote.title,
              content: "",
              ciphertext: cipher,
              iv,
              isVault: true,
              tags
            }
          },
          { onSuccess: () => setEditOpen(false) }
        )
      );
    } else {
      update.mutate(
        {
          moduleId: "notes",
          procedure: "update",
          input: {
            id: selectedNote.id,
            title: selectedNote.title,
            content,
            isVault: false,
            tags
          }
        },
        { onSuccess: () => setEditOpen(false) }
      );
    }
  };

  const handleExport = async (id: string, noteTitle: string) => {
    const result = await exportNote.mutateAsync({
      moduleId: "notes",
      procedure: "export",
      input: { id }
    }) as any;
    const blob = new Blob([result.markdown], { type: "text/markdown; charset=utf-8" });
    saveAs(blob, `${noteTitle || "note"}.md`);
  };

  useEffect(() => {
    if (!editEditor) return;
    const handler = () => autosave();
    editEditor.on("update", handler);
    return () => {
      editEditor.off("update", handler);
    };
  }, [editEditor, autosave]);

  const handleDelete = (id: string) => {
    if (confirm("Diese Notiz wirklich löschen?")) {
      deleteNote.mutate({
        moduleId: "notes",
        procedure: "delete",
        input: { id }
      });
    }
  };

  return (
    <div className="space-y-8 max-h-[80vh] overflow-hidden flex flex-col">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-aurora-mint/12 to-xynoxa-cyan/16 p-6 md:p-8 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-xynoxa-cyan/20">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-aurora-mint">Notes</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">Docs &amp; Notes</h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl dark:text-slate-300">
              Rich-Text Editor, Tags und vollständige CRUD-Operationen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`rounded-full border px-3 py-1 text-xs ${hasKey ? "border-emerald-500/50 text-emerald-200 bg-emerald-900/40" : "border-amber-500/50 text-amber-200 bg-amber-900/30"}`}>
              {vaultState === "loading" || vaultLoading ? "Vault lädt..." : hasKey ? "Vault entsperrt" : "Vault gesperrt – oben entsperren"}
            </div>
            <Button className="bg-xynoxa-cyan text-white hover:bg-cyan-500" onClick={() => setCreateOpen(true)}>
              <FileText size={16} className="mr-2" />
              Neue Note
            </Button>
          </div>
          {editOpen && (
            <div className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-xs text-slate-300">
              Autosave:{" "}
              {autosaveState === "speichert"
                ? "speichert..."
                : autosaveState === "gespeichert"
                  ? "gespeichert"
                  : "bereit"}
            </div>
          )}
        </header>
      </div>

      {!me.data?.user ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
          Bitte <Link href="/auth/login" className="underline">einloggen</Link>, um Notes zu sehen.
        </div>
      ) : (
        <div className="space-y-4">
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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredNotes?.map((note: any) => (
              <div
                key={note.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3 hover:border-slate-700 transition"
                onClick={() => openDetail(note)}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-slate-50">{note.title}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(note);
                      }}
                      className="text-cyan-300 hover:text-cyan-200"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareNote(note);
                      }}
                      className="text-cyan-300 hover:text-cyan-200"
                    >
                      <Share2 size={16} />
                    </button>
                    <button
                      onClick={() => handleExport(note.id, note.title)}
                      className="text-slate-300 hover:text-slate-100"
                    >
                      MD
                    </button>
                  </div>
                </div>
                {note.locked ? (
                  <div className="text-sm text-amber-200 flex items-center gap-2">
                    <Shield size={14} /> Vault-Note gesperrt – oben in der Topbar entsperren.
                  </div>
                ) : (
                  <div
                    className="text-sm text-slate-300 line-clamp-4 prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: note.content || "" }}
                  />
                )}
                <div className="flex flex-wrap gap-1">
                  {note.tags.map((tag: any) => (
                    <Badge key={tag.id} tone="cyan" className="text-xs">
                      {tag.name}
                    </Badge>
                  ))}
                  {note.isVault && (
                    <Badge tone="amber" className="text-xs flex items-center gap-1">
                      <Shield size={12} /> Vault
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Aktualisiert: {new Date(note.updatedAt).toLocaleDateString("de-DE")}
                </p>
              </div>
            ))}
          </div>

          {filteredNotes?.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-12 text-center">
              <FileText size={48} className="mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">
                {filterTag ? "Keine Notes mit diesem Tag gefunden" : "Noch keine Notes erstellt"}
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Neue Note erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-slate-200">Titel</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="Meine neue Note"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-200">Inhalt</Label>
              <div className="rounded-lg border border-slate-700 bg-slate-950 min-h-[250px] max-h-[45vh] overflow-auto">
                <EditorContent editor={editor} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags" className="text-slate-200">Tags (komma-separiert)</Label>
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="projekt, wichtig, draft"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={vault}
                  onChange={(e) => setVault(e.target.checked)}
                  disabled={!hasKey}
                />
                Vault-Note (Client-Encryption)
              </label>
              <span className="text-xs text-slate-500">
                {hasKey ? "Key aktiv" : "In der Topbar Passphrase setzen"}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleCreate} disabled={create.isPending || !title.trim()}>
                {create.isPending ? "Erstelle..." : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Note bearbeiten</DialogTitle>
          </DialogHeader>
          {selectedNote && (
            <div className="space-y-4 max-h-[80vh] overflow-hidden flex flex-col">
              <div className="space-y-2">
                <Label htmlFor="editTitle" className="text-slate-200">Titel</Label>
                <Input
                  id="editTitle"
                  value={selectedNote.title}
                  onChange={(e) => setSelectedNote({ ...selectedNote, title: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedNote.isVault}
                    onChange={(e) => setSelectedNote({ ...selectedNote, isVault: e.target.checked })}
                    disabled={!hasKey}
                  />
                  Vault-Note
                </label>
                <span className="text-xs text-slate-500">
                  {hasKey ? "Key aktiv" : "In der Topbar Passphrase setzen"}
                </span>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Inhalt</Label>
                <div className="rounded-lg border border-slate-700 bg-slate-950 min-h-[250px] max-h-[45vh] overflow-auto">
                  <EditorContent editor={editEditor} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTags" className="text-slate-200">Tags (komma-separiert)</Label>
                <Input
                  id="editTags"
                  value={
                    selectedNote.tagInput ??
                    selectedNote.tags.map((t: any) => t.name).join(", ")
                  }
                  onChange={(e) => setSelectedNote({ ...selectedNote, tagInput: e.target.value })}
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

      <Dialog open={detailDialogOpen} onOpenChange={handleDetailDialogChange}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Note Details</DialogTitle>
          </DialogHeader>
          {noteInView && (
            <div className="space-y-4 max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Title</p>
                  <h2 className="text-2xl font-semibold text-slate-50">{noteInView.title}</h2>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { handleDetailDialogChange(false); openEdit(noteInView); }}>Bearbeiten</Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(noteInView.id)}>Löschen</Button>
                  <Button size="sm" variant="outline" onClick={() => handleExport(noteInView.id, noteInView.title)}>Export</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {noteInView.tags?.map((t: any) => (
                  <Badge key={t.id} tone="cyan" className="text-xs">{t.name}</Badge>
                ))}
                {noteInView.isVault && (
                  <Badge tone="amber" className="text-xs flex items-center gap-1"><Shield size={12}/> Vault</Badge>
                )}
              </div>
              {noteInView.locked ? (
                <div className="text-sm text-amber-200 flex items-center gap-2">
                  <Shield size={14}/> Vault-Note gesperrt – Passphrase eingeben.
                </div>
              ) : (
                <div
                  className="prose prose-invert max-w-none bg-slate-950/60 border border-slate-800 rounded-lg p-4 flex-1 overflow-auto max-h-[50vh]"
                  dangerouslySetInnerHTML={{ __html: noteInView.content || "" }}
                />
              )}
              <div className="text-xs text-slate-400">
                Aktualisiert: {new Date(noteInView.updatedAt).toLocaleString("de-DE")}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {shareNote && (
        <ShareDialog
          open={!!shareNote}
          onOpenChange={(o) => { if (!o) setShareNote(null); }}
          entityId={shareNote.id}
          entityType="note"
          title={shareNote.title}
        />
      )}
    </div>
  );
}
