/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc-client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterForm() {
    const router = useRouter();
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const register = trpc.auth.register.useMutation({
        onSuccess: async () => {
            setError("");
            setSent(true);
        },
        onError: (err) => {
            setError(err.message || "Registrierung fehlgeschlagen. Bitte versuche es erneut.");
        }
    });
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");

    return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
            <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-aurora-mint">Sign up</p>
                <h1 className="text-3xl font-semibold text-slate-50">Konto erstellen</h1>
                <p className="text-sm text-slate-300">Own your digital universe.</p>
            </header>
            <form
                className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
                onSubmit={(e) => {
                    e.preventDefault();
                    setError("");
                    if (password !== confirm) {
                        setError("Passwörter stimmen nicht überein");
                        return;
                    }
                    if (password.length < 8) {
                        setError("Passwort muss mindestens 8 Zeichen lang sein");
                        return;
                    }
                    register.mutate({ email, password });
                }}
            >
                {sent && (
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                        Registrierung gespeichert. Bitte prüfe deine E-Mail und bestätige den Verifizierungslink.
                    </div>
                )}
                {error && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                        {error}
                    </div>
                )}
                <div className="space-y-2">
                    <label className="text-sm text-slate-200">E-Mail</label>
                    <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm text-slate-200">Passwort</label>
                    <Input
                        type="password"
                        placeholder="Mind. 8 Zeichen"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm text-slate-200">Passwort wiederholen</label>
                    <Input
                        type="password"
                        placeholder="Passwort bestätigen"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <Button className="w-full" type="submit" disabled={register.isPending}>
                    {register.isPending ? "Lade…" : "Registrieren"}
                </Button>
            </form>
            <div className="flex justify-between text-sm text-slate-300">
                <span>Schon ein Konto?</span>
                <Link href="/auth/login" className="text-aurora-mint hover:text-aurora-mint/80">
                    Zum Login
                </Link>
            </div>
        </div>
    );
}
