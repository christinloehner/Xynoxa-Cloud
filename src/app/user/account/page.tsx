/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc-client";

export default function UserAccountPage() {
  const me = trpc.auth.me.useQuery();
  const profile = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => profile.refetch()
  });
  const changeEmail = trpc.auth.changeEmail.useMutation();
  const changePassword = trpc.auth.changePassword.useMutation();

  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [locale, setLocale] = useState("de");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.data?.user?.email) setEmail(me.data.user.email);
    if (profile.data?.locale) setLocale(profile.data.locale);
  }, [me.data, profile.data]);

  const handleLocaleSave = () => {
    updateProfile.mutate({ locale }, {
      onSuccess: () => setMessage("Sprache gespeichert."),
      onError: (e) => setError(e.message)
    });
  };

  const handleEmail = () => {
    setMessage(null); setError(null);
    changeEmail.mutate({ newEmail: email, currentPassword }, {
      onSuccess: () => setMessage("E-Mail geändert. Bitte Verifizierungslink prüfen."),
      onError: (e) => setError(e.message)
    });
  };

  const handlePassword = () => {
    if (newPassword !== newPassword2) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    setMessage(null); setError(null);
    changePassword.mutate({ currentPassword, newPassword }, {
      onSuccess: () => {
        setMessage("Passwort geändert.");
        setNewPassword(""); setNewPassword2(""); setCurrentPassword("");
      },
      onError: (e) => setError(e.message)
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">User</p>
        <h1 className="text-2xl font-semibold text-slate-50">Account</h1>
        <p className="text-sm text-slate-300">E-Mail, Passwort und Sprache verwalten.</p>
      </div>

      {message && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-50">E-Mail ändern</h3>
          <div className="space-y-2">
            <Label className="text-slate-200">Neue E-Mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-200">Aktuelles Passwort</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-100" />
          </div>
          <Button onClick={handleEmail} disabled={changeEmail.isPending}>{changeEmail.isPending ? "Speichert..." : "E-Mail speichern"}</Button>
          <p className="text-xs text-slate-500">Nach Änderung musst du die neue E-Mail verifizieren.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-50">Passwort ändern</h3>
          <div className="space-y-2">
            <Label className="text-slate-200">Aktuelles Passwort</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-200">Neues Passwort</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-200">Passwort wiederholen</Label>
            <Input type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-100" />
          </div>
          <Button onClick={handlePassword} disabled={changePassword.isPending}>{changePassword.isPending ? "Speichert..." : "Passwort speichern"}</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-50">Sprache</h3>
        <div className="space-y-2">
          <Label className="text-slate-200">Bevorzugte Sprache</Label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100"
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
        <Button variant="outline" onClick={handleLocaleSave} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Speichert..." : "Sprache speichern"}
        </Button>
      </div>
    </div>
  );
}
