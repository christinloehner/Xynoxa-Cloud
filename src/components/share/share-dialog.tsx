/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc-client";
import { useToast } from "@/components/ui/toast";
import { Copy, Trash2 } from "lucide-react";

// Muss mit dem entityEnum in shares.ts übereinstimmen
type ShareEntityType = "file" | "folder" | "note" | "task" | "bookmark";

type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ShareEntityType;
  entityId: string;
  title: string;
};

export function ShareDialog({ open, onOpenChange, entityId, entityType, title }: ShareDialogProps) {
  const toast = useToast();
  const list = trpc.shares.list.useQuery({ entityId, entityType }, { enabled: open });
  const recipients = trpc.shares.recipientOptions.useQuery(undefined, { enabled: open });
  const createLink = trpc.shares.createLink.useMutation({
    onSuccess: () => {
      list.refetch();
      toast.push({ title: "Link erstellt", tone: "success" });
    },
    onError: (e) => toast.push({ title: "Fehler", description: e.message, tone: "error" })
  });
  const createInternal = trpc.shares.createInternal.useMutation({
    onSuccess: () => {
      list.refetch();
      toast.push({ title: "Intern geteilt", tone: "success" });
    },
    onError: (e) => toast.push({ title: "Fehler", description: e.message, tone: "error" })
  });
  const revoke = trpc.shares.revoke.useMutation({
    onSuccess: () => {
      list.refetch();
      toast.push({ title: "Share entfernt", tone: "success" });
    },
    onError: (e) => toast.push({ title: "Fehler", description: e.message, tone: "error" })
  });

  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [password, setPassword] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [withPassword, setWithPassword] = useState(false);

  const baseUrl = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);

  const shares = list.data ?? [];

  const copyLink = (token: string) => {
    const link = `${baseUrl}/share/${token}`;
    navigator.clipboard.writeText(link).then(() => toast.push({ title: "Link kopiert", tone: "success" })).catch(() => toast.push({ title: "Kopieren fehlgeschlagen", tone: "error" }));
  };

  const handleCreateLink = () => {
    createLink.mutate({
      entityId,
      entityType,
      expiresAt: expiresAt || null,
      expiresInDays: expiresInDays === "" ? undefined : Number(expiresInDays),
      password: withPassword ? password || undefined : undefined
    });
  };

  const handleCreateInternal = () => {
    createInternal.mutate({
      entityId,
      entityType,
      users: Array.from(selectedUsers),
      groups: Array.from(selectedGroups)
    });
  };

  const toggleSet = (setter: Dispatch<SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Teilen – {title}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="link">
          <TabsList className="mb-4">
            <TabsTrigger value="link">Externer Link</TabsTrigger>
            <TabsTrigger value="internal">Intern</TabsTrigger>
            <TabsTrigger value="existing">Bestehende</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ablauf in Tagen</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="z.B. 7"
                />
              </div>
              <div>
                <Label>oder Ablaufdatum</Label>
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={withPassword} onCheckedChange={setWithPassword} />
              <span>Passwort setzen</span>
            </div>
            {withPassword && (
              <Input
                type="password"
                placeholder="Passwort (min. 3 Zeichen)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}

            <Button onClick={handleCreateLink} disabled={createLink.isPending}>
              {createLink.isPending ? "Erstelle..." : "Link erstellen"}
            </Button>
          </TabsContent>

          <TabsContent value="internal" className="space-y-4">
            <div>
              <Label>Benutzer</Label>
              <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-800 p-2 space-y-1">
                {(recipients.data?.users ?? []).map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(u.id)}
                      onChange={() => toggleSet(setSelectedUsers, u.id)}
                      className="accent-cyan-400"
                    />
                    {u.email}
                  </label>
                ))}
                {(recipients.data?.users ?? []).length === 0 && <p className="text-xs text-slate-500">Keine Benutzer im Tenant</p>}
              </div>
            </div>
            <div>
              <Label>Gruppen</Label>
              <div className="mt-2 max-h-32 overflow-y-auto rounded border border-slate-800 p-2 space-y-1">
                {(recipients.data?.groups ?? []).map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm text-slate-100">
                    <input
                      type="checkbox"
                      checked={selectedGroups.has(g.id)}
                      onChange={() => toggleSet(setSelectedGroups, g.id)}
                      className="accent-cyan-400"
                    />
                    {g.name}
                  </label>
                ))}
                {(recipients.data?.groups ?? []).length === 0 && <p className="text-xs text-slate-500">Keine Gruppen gefunden</p>}
              </div>
            </div>
            <Button onClick={handleCreateInternal} disabled={createInternal.isPending || (!selectedUsers.size && !selectedGroups.size)}>
              {createInternal.isPending ? "Teile..." : "Intern teilen"}
            </Button>
          </TabsContent>

          <TabsContent value="existing">
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {shares.length === 0 && <p className="text-sm text-slate-500">Keine Shares vorhanden.</p>}
              {shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-slate-100">
                      {s.internal ? "Intern" : "Link"} • {s.token.slice(0, 8)}…
                    </span>
                    <span className="text-xs text-slate-500">
                      {s.expiresAt ? `Gültig bis ${new Date(s.expiresAt).toLocaleDateString()}` : "Ohne Ablauf"}
                      {s.passwordHash ? " • Passwort" : ""}
                      {s.internal ? ` • Empfänger ${s.recipients?.length ?? 0}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!s.internal && (
                      <Button variant="ghost" size="icon" onClick={() => copyLink(s.token)}>
                        <Copy size={16} />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => revoke.mutate({ shareId: s.id })}>
                      <Trash2 size={16} className="text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
