/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc-client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface LoginFormProps {
    registrationEnabled: boolean;
}

export function LoginForm({ registrationEnabled }: LoginFormProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialInfo = searchParams.get("verified") === "1"
        ? "E-Mail bestätigt. Du kannst dich jetzt einloggen."
        : "";
    const initialError = searchParams.get("verify_error")
        ? decodeURIComponent(searchParams.get("verify_error") as string)
        : "";
    const [error, setError] = useState(initialError);
    const [info, setInfo] = useState(initialInfo);
    const [emailForResend, setEmailForResend] = useState("");
    const resend = trpc.auth.resendVerification.useMutation({
        onSuccess: () => setInfo("Verifizierungslink erneut gesendet."),
        onError: (err) => setError(err.message || "Konnte Verifizierungslink nicht senden.")
    });
    const login = trpc.auth.login.useMutation({
        onSuccess: () => {
            setError("");
            router.push("/dashboard");
        },
        onError: (err) => {
            setError(err.message || "Login fehlgeschlagen. Bitte überprüfe deine Anmeldedaten.");
        }
    });
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const displayError = error === "EMAIL_NOT_VERIFIED"
        ? "Bitte E-Mail bestätigen. Wir haben dir einen Verifizierungslink gesendet."
        : error;

    return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
            <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-aurora-mint">Login</p>
                <h1 className="text-3xl font-semibold text-slate-50">Willkommen zurück</h1>
                <p className="text-sm text-slate-300">Melde dich mit E-Mail und Passwort an.</p>
            </header>
            <form
                className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
        onSubmit={(e) => {
            e.preventDefault();
            setError("");
            login.mutate({ email, password });
        }}
    >
                {info && (
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                        {info}
                    </div>
                )}
                {displayError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                        {displayError}
                    </div>
                )}
            <div className="space-y-2">
                <label className="text-sm text-slate-200">E-Mail</label>
                <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailForResend(e.target.value);
                    }}
                    required
                />
            </div>
                <div className="space-y-2">
                    <label className="text-sm text-slate-200">Passwort</label>
                    <Input
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <div className="flex items-center justify-between text-sm">
                    <Link href="/auth/reset" className="text-aurora-mint hover:text-aurora-mint/80">
                        Passwort vergessen?
                    </Link>
                    {registrationEnabled && (
                        <Link href="/auth/register" className="text-slate-400 hover:text-slate-200">
                            Kein Konto? Registrieren
                        </Link>
                    )}
                </div>
                <Button className="w-full" type="submit" disabled={login.isPending}>
                    {login.isPending ? "Lade…" : "Einloggen"}
                </Button>
            </form>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                2FA aktiviert? Du wirst danach zum Code-Check weitergeleitet.
                {error === "EMAIL_NOT_VERIFIED" && (
                    <div className="mt-3 flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resend.mutate({ email: emailForResend || email })}
                            disabled={resend.isPending || !(emailForResend || email)}
                        >
                            {resend.isPending ? "Sende..." : "Verifizierungslink erneut senden"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
