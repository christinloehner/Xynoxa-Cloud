/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SetupPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({ email: "", password: "", displayName: "Administrator" });
    const [error, setError] = useState("");

    // Check if setup is needed
    const checkSetup = trpc.auth.checkSetup.useQuery(undefined, {
        retry: false
    });

    useEffect(() => {
        if (checkSetup.data && !checkSetup.data.setupNeeded) {
            router.push("/");
        }
    }, [checkSetup.data, router]);

    const setup = trpc.auth.setup.useMutation({
        onSuccess: () => {
            router.push("/admin"); // Go straight to admin on setup complete
        },
        onError: (err) => {
            setError(err.message);
        }
    });

    if (checkSetup.isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#050505] text-slate-400">Prüfe Status...</div>;
    if (!checkSetup.data?.setupNeeded) return <div className="flex min-h-screen items-center justify-center bg-[#050505] text-slate-400">Installation bereits abgeschlossen.</div>;

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
            <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl backdrop-blur-xl">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-50">Willkommen bei Xynoxa</h1>
                    <p className="mt-2 text-sm text-slate-400">Erstellen Sie den Administrator-Zugang für Ihre neue Installation.</p>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setup.mutate(formData);
                    }}
                    className="space-y-6"
                >
                    {error && (
                        <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="email">E-Mail Adresse</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                            className="bg-slate-950/50 border-slate-800 focus:border-cyan-500"
                            placeholder="admin@example.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Passwort</Label>
                        <Input
                            id="password"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                            minLength={8}
                            className="bg-slate-950/50 border-slate-800 focus:border-cyan-500"
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-semibold"
                        disabled={setup.isPending}
                    >
                        {setup.isPending ? "Richte ein..." : "Installation abschließen"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
