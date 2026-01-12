/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function AdminGroupsPage() {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberData, setMemberData] = useState({ userId: "" });

  const groups = trpc.groups.list.useQuery();
  const users = trpc.users.list.useQuery();
  const members = trpc.groups.listMembers.useQuery(
    { groupId: selectedGroup! },
    { enabled: !!selectedGroup }
  );

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: async (group) => {
      await groups.refetch();
      setSelectedGroup(group.id);
      setOpen(false);
      setGroupName("");
      setMemberOpen(true);
    }
  });

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: () => {
      groups.refetch();
      setSelectedGroup(null);
    }
  });

  const addMember = trpc.groups.addMember.useMutation({
    onSuccess: () => {
      members.refetch();
      setMemberOpen(false);
      setMemberData({ userId: "" });
    }
  });

  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => members.refetch()
  });



  useEffect(() => {
    if (!selectedGroup && groups.data?.length) {
      setSelectedGroup(groups.data[0].id);
    }
  }, [selectedGroup, groups.data]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-50">Gruppenverwaltung</h1>
          <p className="text-sm text-slate-300">
            Gruppen erstellen, Mitglieder verwalten, Rollen zuweisen.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/25">
              Gruppe erstellen
            </button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-slate-50">Neue Gruppe erstellen</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createGroup.mutate({ name: groupName });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="groupName" className="text-slate-200">Gruppenname</Label>
                <Input
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={createGroup.isPending}>
                  {createGroup.isPending ? "Erstelle..." : "Erstellen"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Gruppen</h2>
          <div className="space-y-2">
            {groups.data?.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                className={`p-4 rounded-lg border cursor-pointer transition ${selectedGroup === g.id
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                  }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-slate-100">{g.name}</h3>
                    <p className="text-xs text-slate-400">Owner: {g.ownerEmail}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Gruppe "${g.name}" wirklich löschen?`)) {
                        deleteGroup.mutate({ groupId: g.id });
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))}
            {groups.data?.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">Keine Gruppen vorhanden</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Mitglieder</h2>
            {selectedGroup && (
              <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
                <DialogTrigger asChild>
                  <button className="text-sm text-cyan-300 hover:text-cyan-200">
                    + Mitglied hinzufügen
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border-slate-800">
                  <DialogHeader>
                    <DialogTitle className="text-slate-50">
                      Mitglied zu &quot;{groups.data?.find(g => g.id === selectedGroup)?.name}&quot; hinzufügen
                    </DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addMember.mutate({ groupId: selectedGroup, userId: memberData.userId });
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="userId" className="text-slate-200">User</Label>
                      <select
                        id="userId"
                        value={memberData.userId}
                        onChange={(e) => setMemberData({ ...memberData, userId: e.target.value })}
                        className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100"
                        required
                      >
                        <option value="">Bitte wählen...</option>
                        {users.data?.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setMemberOpen(false)}>
                        Abbrechen
                      </Button>
                      <Button type="submit" disabled={addMember.isPending}>
                        {addMember.isPending ? "Füge hinzu..." : "Hinzufügen"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {!selectedGroup ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Wähle eine Gruppe aus, um Mitglieder zu sehen
            </p>
          ) : members.data?.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Keine Mitglieder in dieser Gruppe</p>
          ) : (
            <div className="space-y-2">
              {members.data?.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-slate-100">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeMember.mutate({ memberId: m.id })}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
