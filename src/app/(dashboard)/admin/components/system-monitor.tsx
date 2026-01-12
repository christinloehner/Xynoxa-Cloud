/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trpc } from "@/lib/trpc-client";
import { HardDrive, Cpu, Activity, Clock } from "lucide-react";

function Sparkline({ data, color, max = 100 }: { data: number[]; color: string; max?: number }) {
    if (data.length < 2) return <div className="h-24 w-full bg-slate-900/20 rounded animate-pulse" />;

    const width = 100;
    const height = 100;

    const points = data.map((val, i) => {
        const x = (i / (30 - 1)) * width;
        const y = height - Math.min((val / max) * height, height);
        return `${x},${y}`;
    }).join(" ");

    return (
        <div className="h-24 w-full overflow-hidden rounded-md bg-slate-950/30 relative">
            <div className="absolute inset-x-0 top-1/4 h-px bg-slate-800/30" />
            <div className="absolute inset-x-0 top-2/4 h-px bg-slate-800/30" />
            <div className="absolute inset-x-0 top-3/4 h-px bg-slate-800/30" />

            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full preserve-3d" preserveAspectRatio="none">
                <path d={`M 0,${height} ${points} V ${height} H 0 Z`} fill={color} fillOpacity="0.2" className="transition-all duration-300" />
                <path d={`M ${points}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-300" />
            </svg>
        </div>
    );
}

export function SystemMonitor() {
    const [history, setHistory] = useState<{
        cpu: number[];
        memory: number[];
        timestamps: number[];
    }>({ cpu: [], memory: [], timestamps: [] });

    const { data: stats } = trpc.system.stats.useQuery(undefined, {
        refetchInterval: 2000
    });

    useEffect(() => {
        if (!stats) return;
        const timer = window.setTimeout(() => {
            setHistory((prev) => {
                const now = Date.now();
                const cpuLoad = (stats.cpu.loadAvg[0] / stats.cpu.cores) * 100;
                const memUsage = (stats.memory.used / stats.memory.total) * 100;

                const newCpu = [...prev.cpu, cpuLoad].slice(-30);
                const newMem = [...prev.memory, memUsage].slice(-30);
                const newTime = [...prev.timestamps, now].slice(-30);

                return { cpu: newCpu, memory: newMem, timestamps: newTime };
            });
        }, 0);

        return () => window.clearTimeout(timer);
    }, [stats]);

    if (!stats) return null;

    // --- Helpers ---
    const formatBytes = (bytes: number) => {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let i = 0;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return `${size.toFixed(2)} ${units[i]}`;
    };

    const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor(seconds % (3600 * 24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        return `${d}d ${h}h ${m}m`;
    };

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* CPU Card */}
            <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                            <Cpu size={20} className="text-cyan-400" /> CPU Load
                        </CardTitle>
                        <span className="text-xs font-mono text-slate-500">{stats.cpu.model}</span>
                    </div>
                    <CardDescription>
                        {stats.cpu.cores} Cores • Load Avg: {stats.cpu.loadAvg.map(l => l.toFixed(2)).join(", ")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <div className="flex items-end justify-between mb-2">
                            <span className="text-sm text-slate-400">Current Load (approx)</span>
                            <span className="text-xl font-bold text-cyan-400">
                                {history.cpu[history.cpu.length - 1]?.toFixed(1) ?? 0}%
                            </span>
                        </div>
                        <Sparkline data={history.cpu} color="#22d3ee" max={100} />
                    </div>
                </CardContent>
            </Card>

            {/* RAM Card */}
            <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                            <Activity size={20} className="text-emerald-400" /> Memory Usage
                        </CardTitle>
                        <span className="text-xs font-mono text-slate-500">Total: {formatBytes(stats.memory.total)}</span>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <div className="flex items-end justify-between mb-2">
                            <span className="text-sm text-slate-400">Used: {formatBytes(stats.memory.used)}</span>
                            <span className="text-xl font-bold text-emerald-400">
                                {history.memory[history.memory.length - 1]?.toFixed(1) ?? 0}%
                            </span>
                        </div>
                        <Sparkline data={history.memory} color="#34d399" max={100} />
                    </div>
                </CardContent>
            </Card>

            {/* Disk Card */}
            <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                        <HardDrive size={20} className="text-indigo-400" /> Storage
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Usage</span>
                                <span className="text-slate-200">{formatBytes(stats.disk.used)} / {formatBytes(stats.disk.total)}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-500"
                                    style={{ width: `${(stats.disk.used / stats.disk.total) * 100}%` }}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 text-right">
                            {formatBytes(stats.disk.free)} free
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Uptime Card */}
            <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                        <Clock size={20} className="text-amber-400" /> Uptime
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-4">
                        <span className="text-3xl font-mono font-bold text-slate-200">
                            {formatUptime(stats.uptime)}
                        </span>
                        <span className="text-sm text-slate-500 mt-2">Since last restart</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
