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
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface RenameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialName: string;
    onConfirm: (newName: string) => void;
    title?: string;
}

export function RenameDialog({
    open,
    onOpenChange,
    initialName,
    onConfirm,
    title = "Umbenennen",
}: RenameDialogProps) {
    const [name, setName] = useState(initialName);

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) {
            setName(initialName);
        }
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Gib einen neuen Namen ein.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2 py-4">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-slate-900 border-slate-700 focus-visible:ring-cyan-500"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onConfirm(name);
                                onOpenChange(false);
                            }
                        }}
                    />
                </div>
                <DialogFooter className="sm:justify-end">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Abbrechen
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        className="bg-cyan-600 hover:bg-cyan-500"
                        onClick={() => {
                            onConfirm(name);
                            onOpenChange(false);
                        }}
                    >
                        Speichern
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
