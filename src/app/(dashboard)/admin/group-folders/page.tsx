/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Plus, Trash2, Folder, Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { UserGroupSelector } from "@/components/admin/UserGroupSelector";

export default function AdminGroupFoldersPage() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const utils = trpc.useUtils();

    const { data: folders, isLoading } = trpc.groupFolders.list.useQuery();
    const { data: allGroups } = trpc.groups.list.useQuery();

    const createFolder = trpc.groupFolders.create.useMutation({
        onSuccess: () => {
            toast.success("Gruppenordner erstellt");
            setNewFolderName("");
            setIsCreateOpen(false);
            utils.groupFolders.list.invalidate();
        },
        onError: (err) => toast.error(err.message)
    });

    const deleteFolder = trpc.groupFolders.delete.useMutation({
        onSuccess: () => {
            toast.success("Ordner gelöscht");
            utils.groupFolders.list.invalidate();
        },
        onError: (err) => toast.error(err.message)
    });

    const addGroup = trpc.groupFolders.addGroup.useMutation({
        onSuccess: () => {
            toast.success("Gruppe hinzugefügt");
            utils.groupFolders.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message)
    });

    const removeGroup = trpc.groupFolders.removeGroup.useMutation({
        onSuccess: () => {
            toast.success("Zugriff entfernt");
            utils.groupFolders.list.invalidate();
        },
        onError: (err) => toast.error(err.message)
    });

    const handleDelete = (id: string, name: string) => {
        if (confirm(`Sind Sie sicher, dass Sie den Ordner "${name}" und alle Inhalte unwiderruflich löschen wollen?`)) {
            deleteFolder.mutate({ id });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Gruppenordner</h2>
                    <p className="text-muted-foreground">
                        Verwalten Sie zentrale Ordner, die automatisch mit Gruppen geteilt werden.
                    </p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> Neuer Ordner
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Neuen Gruppenordner erstellen</DialogTitle>
                            <DialogDescription>
                                Dieser Ordner wird physisch in einem separaten Bereich erstellt.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Input
                                placeholder="Ordnername"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button onClick={() => createFolder.mutate({ name: newFolderName })} disabled={!newFolderName || createFolder.isPending}>
                                Erstellen
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {folders?.map((folder) => (
                    <Card key={folder.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-medium flex items-center gap-2">
                                <Folder className="h-5 w-5 text-blue-500" />
                                {folder.name}
                            </CardTitle>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(folder.id, folder.name)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="mt-4 space-y-2">
                                <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <Shield className="h-4 w-4" /> Zugriff für Gruppen:
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {folder.groups.map((access) => (
                                        <Badge key={access.accessId} variant="secondary" className="flex items-center gap-1">
                                            {access.groupName}
                                            <button
                                                onClick={() => removeGroup.mutate({ accessId: access.accessId })}
                                                className="ml-1 hover:text-destructive"
                                            >
                                                ×
                                            </button>
                                        </Badge>
                                    ))}
                                    <UserGroupSelector
                                        allGroups={allGroups}
                                        onSelect={(groupId) => addGroup.mutate({ folderId: folder.id, groupId: groupId })}
                                        selectedGroups={folder.groups.map(g => g.groupId)}
                                        className="h-6 w-6 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {folders?.length === 0 && (
                    <div className="col-span-full flex h-[200px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-8 text-center animate-in fade-in-50">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background mb-4">
                            <Folder className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <h3 className="mt-2 text-xl font-bold">Keine Gruppenordner vorhanden</h3>
                        <p className="max-w-sm text-sm text-muted-foreground mt-2">
                            Erstellen Sie den ersten Ordner, um Dateien zentral für Teams bereitzustellen.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
