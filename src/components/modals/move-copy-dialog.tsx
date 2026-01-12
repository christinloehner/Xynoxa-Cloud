/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Folder, ChevronRight, Loader2 } from "lucide-react";
import clsx from "clsx";

interface MoveCopyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "move" | "copy";
    onConfirm: (targetFolderId: string | null) => void;
}

export function MoveCopyDialog({
    open,
    onOpenChange,
    mode,
    onConfirm,
}: MoveCopyDialogProps) {
    // Simple folder browser state
    // null means root
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

    const foldersQuery = trpc.folders.list.useQuery({ parentId: currentFolderId });
    const breadcrumbQuery = trpc.folders.breadcrumb.useQuery(
        { id: currentFolderId as string },
        { enabled: !!currentFolderId }
    );

    const handleNavigate = (id: string | null) => {
        setCurrentFolderId(id);
    };

    const handleConfirm = () => {
        onConfirm(currentFolderId);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-slate-950 border-slate-800 text-slate-100 flex flex-col h-[60vh]">
                <DialogHeader>
                    <DialogTitle>{mode === "move" ? "Verschieben nach..." : "Kopieren nach..."}</DialogTitle>
                    <DialogDescription>
                        Wähle den Zielordner aus.
                    </DialogDescription>
                </DialogHeader>

                {/* Breadcrumb / Navigation Header */}
                <div className="flex items-center gap-2 p-2 bg-slate-900 rounded-lg text-sm mb-2 overflow-x-auto whitespace-nowrap">
                    <button
                        onClick={() => handleNavigate(null)}
                        className={clsx("hover:text-cyan-400 font-medium", !currentFolderId ? "text-cyan-400" : "text-slate-400")}
                    >
                        Root
                    </button>
                    {breadcrumbQuery.data?.map(folder => (
                        <div key={folder.id} className="flex items-center">
                            <ChevronRight size={14} className="text-slate-600 mx-1" />
                            <button
                                onClick={() => handleNavigate(folder.id)}
                                className={clsx("hover:text-cyan-400", folder.id === currentFolderId ? "text-cyan-400 font-medium" : "text-slate-400")}
                            >
                                {folder.name}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Folder List */}
                <div className="flex-1 overflow-y-auto border border-slate-800 rounded-lg p-2 space-y-1">
                    {foldersQuery.isLoading ? (
                        <div className="flex items-center justify-center h-full text-slate-500">
                            <Loader2 className="animate-spin mr-2" size={20} /> Lädt...
                        </div>
                    ) : foldersQuery.data && foldersQuery.data.length > 0 ? (
                        foldersQuery.data.map(folder => (
                            <div
                                key={folder.id}
                                className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 cursor-pointer group"
                                onClick={() => handleNavigate(folder.id)}
                            >
                                <div className="flex items-center gap-2 text-slate-300 group-hover:text-slate-100">
                                    <Folder size={18} className="text-cyan-500/70" />
                                    <span>{folder.name}</span>
                                </div>
                                <ChevronRight size={14} className="text-slate-600" />
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-slate-500 text-sm">
                            Keine Unterordner
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4 sm:justify-between items-center">
                    <div className="text-xs text-slate-500">
                        Ziel: {breadcrumbQuery.data?.at(-1)?.name || "Root"}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            Abbrechen
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            className="bg-cyan-600 hover:bg-cyan-500"
                            onClick={handleConfirm}
                        >
                            {mode === "move" ? "Hierher verschieben" : "Hierher kopieren"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
