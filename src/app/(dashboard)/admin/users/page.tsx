/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Plus, X, Trash2 } from "lucide-react";
import { UserGroupSelector } from "@/components/admin/UserGroupSelector";

export default function AdminUsersPage() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "", role: "user" as "user" | "admin" });

  // Queries
  const me = trpc.auth.me.useQuery();
  const list = trpc.users.list.useQuery();
  const allGroups = trpc.groups.list.useQuery();

  // Mutations
  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      list.refetch();
      setOpen(false);
      setFormData({ email: "", password: "", role: "user" });
    }
  });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => list.refetch()
  });

  const toggleDisable = trpc.users.toggleDisable.useMutation({
    onSuccess: () => list.refetch()
  });

  const addMember = trpc.groups.addMember.useMutation({
    onSuccess: () => list.refetch()
  });

  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => list.refetch()
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => list.refetch()
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createUser.mutate({
      email: formData.email,
      password: formData.password,
      role: formData.role
    });
  };


  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-50">Userverwaltung</h1>
          <p className="text-sm text-slate-300">
            Nutzer anlegen, sperren und Gruppen zuweisen.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/25">
              User anlegen
            </button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-slate-50">Neuen User anlegen</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-200">Passwort (min. 8 Zeichen)</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  minLength={8}
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="admin-check"
                  checked={formData.role === 'admin'}
                  onChange={(e) => setFormData({ ...formData, role: e.target.checked ? 'admin' : 'user' })}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                />
                <Label htmlFor="admin-check" className="text-slate-200">Als Administrator anlegen</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={createUser.isPending}>
                  {createUser.isPending ? "Erstelle..." : "User erstellen"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">System Rolle</th>
              <th className="px-4 py-3">Gruppen</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {list.data?.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/60">
                <td className="px-4 py-3 font-medium text-slate-100">{u.email}</td>

                {/* System Role Checkbox */}
                <td className="px-4 py-3">
                  <Badge
                    tone={u.role === 'admin' ? 'emerald' : 'slate'}
                    className={`${u.id === me.data?.user?.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} select-none`}
                    onClick={() => {
                      if (u.id !== me.data?.user?.id) {
                        updateRole.mutate({ userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' });
                      }
                    }}
                  >
                    {u.role === 'admin' ? 'Administrator' : 'Benutzer'}
                  </Badge>
                </td>

                {/* Groups with Badges */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(u as any).groups?.map((g: any) => (
                      <Badge key={g.id} variant="secondary" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2 py-0.5 flex items-center gap-1 group">
                        {g.name}
                        <button
                          onClick={() => {
                            if (g.membershipId) {
                              removeMember.mutate({ memberId: g.membershipId });
                            }
                          }}
                          className="ml-1 h-3 w-3 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}

                    {/* Add Group Popover using dedicated component */}
                    <UserGroupSelector
                      user={u}
                      allGroups={allGroups.data || []}
                      onGroupAdd={(groupId) => addMember.mutate({ groupId, userId: u.id })}
                    />
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${!u.disabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                  >
                    {u.disabled ? "Gesperrt" : "Aktiv"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-amber-400 hover:text-amber-300 hover:bg-amber-900/20"
                      onClick={() => toggleDisable.mutate({ userId: u.id, disabled: !u.disabled })}
                      disabled={u.id === me.data?.user?.id}
                    >
                      {u.disabled ? "Entsperren" : "Sperren"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-900/20"
                      disabled={u.id === me.data?.user?.id}
                      onClick={() => {
                        if (confirm("Möchten Sie diesen Benutzer wirklich löschen? Alle Daten werden unwiderruflich entfernt.")) {
                          deleteUser.mutate({ userId: u.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


