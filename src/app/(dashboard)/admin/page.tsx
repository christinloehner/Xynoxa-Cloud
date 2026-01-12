/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";
import { Loader2, Users, FolderOpen, HardDrive, AlertTriangle, Settings2, Users2, Shield, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { useTheme } from "@/lib/theme-context";
import clsx from "clsx";
import type { ComponentType, ReactNode } from "react";
import { SystemMonitor } from "./components/system-monitor";
import { SearchIndexManager } from "./components/search-index-manager";
import { DatabaseMaintenance } from "./components/database-maintenance";

function AdminWidget({ title, value, icon: Icon, desc, color }: { title: string; value: ReactNode; icon: ComponentType<{ className?: string }>; desc: string; color?: string }) {
    return (
        <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">
                    {title}
                </CardTitle>
                <Icon className={clsx("h-4 w-4", color)} />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-slate-100">{value}</div>
                <p className="text-xs text-slate-500 mt-1">{desc}</p>
            </CardContent>
        </Card>
    );
}

export default function AdminPage() {
    const stats = trpc.system.stats.useQuery();
    const status = trpc.system.status.useQuery();
    const { theme } = useTheme();

    if (stats.isLoading || status.isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="animate-spin text-cyan-500" size={32} />
            </div>
        );
    }

    if (stats.error) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-red-400">
                <AlertTriangle size={48} />
                <p>Fehler beim Laden der Admin-Daten: {stats.error.message}</p>
            </div>
        );
    }

    const s = stats.data;
    const h = status.data;

    return (
        <div className="flex flex-col gap-8 pb-10">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-slate-100">Admin Dashboard</h1>
                <p className="text-slate-400">Systemstatus und Verwaltung</p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 whitespace-nowrap">
                <AdminWidget
                    title="Benutzer"
                    value={s?.users ?? "-"}
                    icon={Users}
                    desc="Registrierte Accounts"
                    color="text-cyan-400"
                />
                <AdminWidget
                    title="Dateien"
                    value={s?.files ?? "-"}
                    icon={FolderOpen}
                    desc="Gespeicherte Dokumente"
                    color="text-indigo-400"
                />
                <AdminWidget
                    title="DB Status"
                    value={h?.db === "healthy" ? "Online" : "Fehler"}
                    icon={HardDrive}
                    desc="PostgreSQL"
                    color={h?.db === "healthy" ? "text-green-400" : "text-red-400"}
                />
            </div>

            {/* Live System Monitor (Charts) */}
            <SystemMonitor />

            {/* Maintenance Box */}
            <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader>
                    <CardTitle className="text-slate-100">Maintenance</CardTitle>
                    <CardDescription className="text-slate-500">
                        Suchindex & Datenbank-Wartung – Aktionen laufen über den Worker im Hintergrund.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 lg:grid-cols-2">
                        <SearchIndexManager compact />
                        <DatabaseMaintenance />
                    </div>
                </CardContent>
            </Card>

            {/* System Info & Detailed Stats */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-slate-800 bg-slate-900/40">
                    <CardHeader>
                        <CardTitle className="text-slate-100">Systeminformationen</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-400">
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span>Version</span>
                            <span className="text-cyan-400 font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span>Hostname</span>
                            <span className="text-slate-200">{s?.hostname}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span>Plattform</span>
                            <span className="text-slate-200">{s?.platform}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span>Node Version</span>
                            <span className="text-slate-200">{s?.nodeVersion}</span>
                        </div>
                        <div className="flex justify-between pb-1">
                            <span>PostgreSQL</span>
                            <span className="text-slate-200">{s?.postgresVersion}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Navigation Links */}
                <div className="grid gap-4">
                    <Link href="/admin/users" className="group">
                        <div className="flex h-full flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition hover:bg-slate-900 hover:border-cyan-500/50">
                            <div className="flex items-center gap-4">
                                <div className="rounded-full bg-cyan-900/30 p-2 text-cyan-400 group-hover:text-cyan-300">
                                    <Users2 size={20} />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-100">Benutzerverwaltung</h3>
                            </div>
                            <p className="text-sm text-slate-400">Verwalten Sie Benutzeraccounts, Rollen und Zugriffsrechte.</p>
                        </div>
                    </Link>
                    <Link href="/admin/groups" className="group">
                        <div className="flex h-full flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition hover:bg-slate-900 hover:border-indigo-500/50">
                            <div className="flex items-center gap-4">
                                <div className="rounded-full bg-indigo-900/30 p-2 text-indigo-400 group-hover:text-indigo-300">
                                    <Shield size={20} />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-100">Gruppen & Berechtigungen</h3>
                            </div>
                            <p className="text-sm text-slate-400">Erstellen Sie Gruppen und weisen Sie Berechtigungen zu.</p>
                        </div>
                    </Link>
                    <Link href="/admin/modules" className="group">
                        <div className="flex h-full flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition hover:bg-slate-900 hover:border-emerald-500/50">
                            <div className="flex items-center gap-4">
                                <div className="rounded-full bg-emerald-900/30 p-2 text-emerald-400 group-hover:text-emerald-300">
                                    <Package size={20} />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-100">Module-Verwaltung</h3>
                            </div>
                            <p className="text-sm text-slate-400">Installieren und verwalten Sie Xynoxa Module.</p>
                        </div>
                    </Link>
                </div>
            </div>
            {/* Footer */}
            <div className="text-center text-xs text-slate-600 mt-8 pb-4">
                Xynoxa - Copyright © {new Date().getFullYear()} Christin Löhner. All rights reserved.
            </div>
        </div>
    );
}
