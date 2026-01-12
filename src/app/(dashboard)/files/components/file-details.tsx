/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { FileItem } from "../use-files-query";
import { Button } from "@/components/ui/button";
import { FileIcon, Folder, Shield, Download, Share2, Pencil, Trash2, Clock, Info, X, Copy, ArrowRightToLine } from "lucide-react";
import { useRightSidebar } from "@/lib/sidebar-context";

interface FileDetailsProps {
    item: FileItem | null;
    onClose: () => void;
    onDownload: (item: FileItem) => void;
    onRename: (item: FileItem) => void;
    onShare: (item: FileItem) => void;
    onDelete: (item: FileItem) => void;
    onToggleVault: (item: FileItem) => void;
    onCopy: (item: FileItem) => void;
    onMove: (item: FileItem) => void;
    onVersions: (item: FileItem) => void;
    onOpenInEditor: (item: FileItem) => void;
}

export function FileDetails({ item, onClose, onDownload, onRename, onShare, onDelete, onToggleVault, onCopy, onMove, onVersions, onOpenInEditor }: FileDetailsProps) {
    if (!item) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                <div className="p-4 rounded-full bg-slate-900">
                    <Info size={32} strokeWidth={1.5} />
                </div>
                <p className="text-sm">Wähle eine Datei aus.</p>
            </div>
        );
    }

    const isFolder = item.kind === "folder";

    return (
        <div className="flex flex-col h-full gap-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-slate-100 leading-tight">Details</h2>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition">
                    <X size={20} />
                </button>
            </div>

            {/* Preview / Icon */}
            <div className="flex flex-col items-center gap-4 py-8 rounded-xl bg-slate-900/50 border border-slate-800">
                {isFolder ? (
                    <Folder size={64} className="text-cyan-400" strokeWidth={1} />
                ) : (
                    <FileIcon size={64} className="text-slate-400" strokeWidth={1} />
                )}
                <div className="text-center px-4">
                    <p className="font-medium text-slate-100 break-words">{item.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{item.size} • {item.updated}</p>
                </div>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onDownload(item)}>
                    <Download size={14} className="mr-2 text-emerald-400" /> Download
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onShare(item)}>
                    <Share2 size={14} className="mr-2 text-cyan-400" /> Teilen
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onOpenInEditor(item)} disabled={item.vault || item.kind === "folder"}>
                    <Pencil size={14} className="mr-2 text-amber-300" /> Im Editor öffnen
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onCopy(item)}>
                    <Copy size={14} className="mr-2 text-slate-400" /> Kopieren
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onMove(item)}>
                    <ArrowRightToLine size={14} className="mr-2 text-slate-400" /> Verschieben
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onRename(item)}>
                    <Pencil size={14} className="mr-2 text-slate-400" /> Name
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onToggleVault(item)}>
                    <Shield size={14} className={item.vault ? "mr-2 text-amber-400" : "mr-2 text-slate-600"} />
                    {item.vault ? "In Vault" : "Zu Vault"}
                </Button>
                <Button variant="destructive" size="sm" className="col-span-2 w-full justify-start bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20" onClick={() => onDelete(item)}>
                    <Trash2 size={14} className="mr-2" /> Löschen
                </Button>
            </div>

            {/* Metadata List */}
            <div className="space-y-4 border-t border-slate-800 pt-6">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest text-[10px]">Informationen</h3>
                <dl className="grid grid-cols-[80px_1fr] gap-y-3 text-sm">
                    <dt className="text-slate-500">Typ</dt>
                    <dd className="text-slate-300 truncate">{isFolder ? "Ordner" : item.mime || "Datei"}</dd>

                    <dt className="text-slate-500">Größe</dt>
                    <dd className="text-slate-300">{item.size}</dd>

                    <dt className="text-slate-500">Geändert</dt>
                    <dd className="text-slate-300">{item.updated}</dd>

                    <dt className="text-slate-500">Status</dt>
                    <dd className="text-slate-300">
                        {item.vault ? (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                                <Shield size={12} /> Geschützt
                            </span>
                        ) : "Standard"}
                    </dd>
                </dl>
            </div>

            <div className="mt-auto pt-4 text-center">
                <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-300" onClick={() => item && onVersions(item)} disabled={!item || item.kind !== "file"}>
                    <Clock size={12} className="mr-1" /> Versionsverlauf ansehen
                </Button>
            </div>
        </div>
    );
}

export interface BulkDetailsProps {
    count: number;
    onClose: () => void;
    onDelete: () => void;
    onMove: () => void;
    onCopy: () => void;
}

export function BulkDetails({ count, onClose, onDelete, onMove, onCopy }: BulkDetailsProps) {
    return (
        <div className="flex flex-col h-full gap-6">
            <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-slate-100 leading-tight">Auswahl</h2>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition">
                    <X size={20} />
                </button>
            </div>

            <div className="flex flex-col items-center gap-4 py-8 rounded-xl bg-slate-900/50 border border-slate-800">
                <div className="relative">
                    <Folder size={50} className="text-cyan-400 absolute top-0 left-0 -translate-x-3 -translate-y-2 opacity-50" />
                    <FileIcon size={50} className="text-slate-400 absolute top-0 left-0 translate-x-3 translate-y-2 opacity-50" />
                    <div className="bg-slate-800 rounded-full p-4 relative z-10 border border-slate-700">
                        <span className="text-xl font-bold text-white">{count}</span>
                    </div>
                </div>
                <div className="text-center px-4 pt-4">
                    <p className="font-medium text-slate-100">{count} Elemente ausgewählt</p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={onCopy}>
                    <Copy size={14} className="mr-2 text-slate-400" /> Kopieren
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={onMove}>
                    <ArrowRightToLine size={14} className="mr-2 text-slate-400" /> Verschieben
                </Button>
                <Button variant="destructive" size="sm" className="w-full justify-start bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20" onClick={onDelete}>
                    <Trash2 size={14} className="mr-2" /> Löschen
                </Button>
            </div>
        </div>
    )
}
