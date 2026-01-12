/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Plus, Copy, AlertCircle, Key } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";

export function ApiTokensCard() {
    const [newTokenName, setNewTokenName] = useState("");
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const { push } = useToast();

    const list = trpc.apiTokens.list.useQuery();
    const create = trpc.apiTokens.create.useMutation({
        onSuccess: (data) => {
            setCreatedToken(data.token);
            setNewTokenName("");
            list.refetch();
        }
    });
    const revoke = trpc.apiTokens.delete.useMutation({
        onSuccess: () => {
            list.refetch();
            push({ title: "Token gelöscht", tone: "success" });
        }
    });

    const handleCreate = () => {
        if (!newTokenName.trim()) return;
        create.mutate({ name: newTokenName });
    };

    return (
        <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Key className="text-cyan-400" size={20} />
                    <CardTitle className="text-slate-100">API Tokens</CardTitle>
                </div>
                <CardDescription className="text-slate-400">
                    Verwalten Sie API-Tokens für den Zugriff durch externe Anwendungen wie den Desktop Client.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* List */}
                <div className="space-y-3">
                    {list.data?.map((token) => (
                        <div key={token.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                            <div>
                                <p className="font-medium text-slate-200">{token.name}</p>
                                <div className="flex gap-2 text-xs text-slate-500 mt-1">
                                    <span>Erstellt: {new Date(token.createdAt).toLocaleDateString()}</span>
                                    {token.lastUsedAt && (
                                        <span className="text-emerald-500/80">• Zuletzt genutzt: {new Date(token.lastUsedAt).toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-slate-500 hover:text-red-400 hover:bg-red-950/20"
                                onClick={() => {
                                    if (confirm("Diesen Token wirklich widerrufen?")) {
                                        revoke.mutate({ id: token.id });
                                    }
                                }}
                            >
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    ))}
                    {list.data?.length === 0 && (
                        <p className="text-sm text-slate-600 text-center py-4">Keine Tokens aktiv.</p>
                    )}
                </div>

                {/* Create Button */}
                <div className="flex justify-end">
                    <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm">
                        <Plus size={16} className="mr-2" /> Neuer Token
                    </Button>
                </div>

                {/* Create Dialog */}
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    if (!open) {
                        setCreatedToken(null);
                        setNewTokenName("");
                    }
                    setDialogOpen(open);
                }}>
                    <DialogContent className="bg-slate-900 border-slate-800">
                        <DialogHeader>
                            <DialogTitle>Neuen API Token erstellen</DialogTitle>
                            <DialogDescription>
                                Geben Sie dem Token einen Namen (z.B. "MacBook Pro").
                            </DialogDescription>
                        </DialogHeader>

                        {!createdToken ? (
                            <div className="space-y-4 py-2">
                                <Input
                                    value={newTokenName}
                                    onChange={(e) => setNewTokenName(e.target.value)}
                                    placeholder="Token Name"
                                    className="bg-slate-800 border-slate-700"
                                />
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                                    <Button onClick={handleCreate} disabled={!newTokenName.trim() || create.isPending}>
                                        {create.isPending ? "Erstelle..." : "Erstellen"}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 py-2">
                                <div className="rounded-lg border border-emerald-900/50 bg-emerald-900/10 p-4 space-y-2">
                                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                        <AlertCircle size={16} />
                                        Token erstellt!
                                    </div>
                                    <p className="text-sm text-slate-300">
                                        Bitte kopieren Sie diesen Token jetzt. Er wird <strong>nie wieder</strong> angezeigt.
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <code className="flex-1 rounded bg-slate-950 p-2 font-mono text-sm text-emerald-300 break-all">
                                            {createdToken}
                                        </code>
                                        <Button size="icon" variant="ghost" onClick={() => {
                                            navigator.clipboard.writeText(createdToken);
                                            push({ title: "Kopiert", tone: "success" });
                                        }}>
                                            <Copy size={16} />
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button onClick={() => setDialogOpen(false)}>Fertig</Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

            </CardContent>
        </Card>
    );
}
