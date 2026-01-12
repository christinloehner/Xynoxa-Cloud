/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState, useEffect } from "react";
import { UploadCloud, X, File as FileIcon, CheckCircle, AlertCircle, Loader2, Shield, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DragDropZone } from "./drag-drop-zone";
import { ChunkUploader } from "@/lib/chunk-uploader";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useVaultKey } from "@/lib/vault-context";
import { encryptBytes } from "@/lib/vault-crypto";

interface UploadFileState {
    id: string;
    file: File;
    progress: number;
    status: "pending" | "uploading" | "completed" | "error";
    error?: string;
    isVault?: boolean;
}

interface UploadWindowProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUploadComplete?: () => void;
    currentFolderId?: string | null;
}

export function UploadWindow({ open, onOpenChange, onUploadComplete, currentFolderId }: UploadWindowProps) {
    const [files, setFiles] = useState<UploadFileState[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [vaultMode, setVaultMode] = useState(false);
    const { hasKey, envelopeKey, folderId: vaultFolderId } = useVaultKey();

    const inVaultFolder = Boolean(currentFolderId && vaultFolderId && currentFolderId === vaultFolderId);

    // Erzwinge Vault-Uploads, wenn man sich im Vault-Ordner befindet.
    useEffect(() => {
        if (inVaultFolder) {
            setVaultMode(true);
        }
    }, [inVaultFolder]);

    const handleFilesSelected = (newFiles: File[]) => {
        const states: UploadFileState[] = newFiles.map((f) => ({
            id: Math.random().toString(36).substring(7),
            file: f,
            progress: 0,
            status: "pending",
            isVault: Boolean(vaultMode || inVaultFolder)
        }));
        setFiles((prev) => [...prev, ...states]);
    };

    const removeFile = (id: string) => {
        if (isUploading) return;
        setFiles((prev) => prev.filter((f) => f.id !== id));
    };

    const startUpload = async () => {
        if (files.length === 0) return;
        setIsUploading(true);

        // Process sequentially to keep it simple for now, or parallel with limit
        // Let's do parallel
        const promises = files
            .filter(f => f.status !== "completed")
            .map(async (fileState) => {

                setFiles((prev) => prev.map((f) => f.id === fileState.id ? { ...f, status: "uploading" } : f));

                try {
                    let uploadFile = fileState.file;
                    let iv: string | undefined = undefined;

                    if (fileState.isVault || inVaultFolder) {
                        if (!envelopeKey) {
                            throw new Error("Vault ist gesperrt. Bitte zuerst in der Topbar entsperren.");
                        }
                        // Wenn der Upload über den Vault-Ordner kommt, markieren wir als Vault.
                        fileState.isVault = true;
                        const buffer = await fileState.file.arrayBuffer();
                        const encrypted = await encryptBytes(buffer, envelopeKey);
                        uploadFile = new File([encrypted.cipher], fileState.file.name, { type: "application/octet-stream" });
                        iv = encrypted.iv;
                    }

                    const uploader = new ChunkUploader({
                        filename: fileState.file.name,
                        file: uploadFile,
                        vault: fileState.isVault,
                        iv,
                        folderId: currentFolderId
                    });

                    await uploader.start((progress) => {
                        setFiles((prev) => prev.map((f) => f.id === fileState.id ? { ...f, progress } : f));
                    });

                    setFiles((prev) => prev.map((f) => f.id === fileState.id ? { ...f, status: "completed", progress: 100 } : f));
                } catch (err: any) {
                    setFiles((prev) => prev.map((f) => f.id === fileState.id ? { ...f, status: "error", error: err.message } : f));
                }
            });

        await Promise.all(promises);
        setIsUploading(false);
        onUploadComplete?.();
    };

    // Reset when closed
    useEffect(() => {
        if (!open) {
            // Delay clear to allow animation
            const t = setTimeout(() => {
                setFiles([]);
                setIsUploading(false);
            }, 300);
            return () => clearTimeout(t);
        }
    }, [open]);

    const pendingCount = files.filter(f => f.status === "pending").length;
    const completedCount = files.filter(f => f.status === "completed").length;

    return (
        <Dialog open={open} onOpenChange={(val) => !isUploading && onOpenChange(val)}>
            <DialogContent className="max-w-3xl bg-slate-950 border-slate-800 p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <DialogHeader className="p-6 pb-2 border-b border-slate-800 bg-slate-900">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-xl font-bold text-slate-100 flex items-center gap-2">
                            <UploadCloud className="text-cyan-500" />
                            Upload Manager
                        </DialogTitle>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant={vaultMode ? "default" : "outline"}
                                onClick={() => !isUploading && hasKey && !inVaultFolder && setVaultMode(!vaultMode)}
                                className={clsx("gap-2 transition-all", vaultMode ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-500" : "border-slate-700 text-slate-400")}
                                disabled={files.length > 0 || (!hasKey) || inVaultFolder}
                            >
                                <Shield size={14} />
                                {inVaultFolder
                                    ? "Vault erzwungen"
                                    : vaultMode
                                        ? "Vault aktiv"
                                        : hasKey ? "Vault Upload" : "Vault gesperrt"}
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {!hasKey && (
                        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-900/40 border border-amber-800 rounded-lg px-3 py-2">
                            <Lock size={12} />
                            Vault ist gesperrt. Bitte in der Topbar Passphrase setzen/entsperren, um verschlüsselte Uploads zu aktivieren.
                        </div>
                    )}

                    <DragDropZone onFilesSelected={handleFilesSelected} disabled={isUploading} className={files.length > 0 ? "h-32 py-4" : "h-64"} />

                    <AnimatePresence>
                        {files.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3"
                            >
                                <div className="flex items-center justify-between text-sm text-slate-400 px-1">
                                    <span>{files.length} Dateien in der Warteschlange</span>
                                    {files.length > 0 && !isUploading && (
                                        <button onClick={() => setFiles([])} className="text-rose-400 hover:text-rose-300">
                                            Alle entfernen
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {files.map((file) => (
                                        <motion.div
                                            key={file.id}
                                            layout
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="bg-slate-900/50 rounded-lg border border-slate-800 p-3 flex items-center gap-4 group"
                                        >
                                            <div className="p-2 rounded bg-slate-800">
                                                <FileIcon size={20} className="text-slate-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between mb-1">
                                                    <p className="text-sm font-medium text-slate-200 truncate">{file.file.name}</p>
                                                    <span className="text-xs text-slate-500">{(file.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={clsx("h-full transition-all duration-300",
                                                            file.status === "error" ? "bg-rose-500" :
                                                                file.status === "completed" ? "bg-green-500" : "bg-cyan-500"
                                                        )}
                                                        style={{ width: `${file.progress}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-1">
                                                    <span className={clsx("text-[10px]",
                                                        file.status === "error" ? "text-rose-400" :
                                                            file.status === "completed" ? "text-green-400" : "text-slate-400"
                                                    )}>
                                                        {file.status === "pending" && "Wartend..."}
                                                        {file.status === "uploading" && `Wird hochgeladen... ${file.progress}%`}
                                                        {file.status === "completed" && "Fertig"}
                                                        {file.status === "error" && (file.error || "Fehler")}
                                                    </span>
                                                    {file.isVault && <span className="text-[10px] text-emerald-500 flex items-center gap-1"><Shield size={10} /> Encrypted</span>}
                                                </div>
                                            </div>

                                            {file.status === "pending" && !isUploading && (
                                                <button onClick={() => removeFile(file.id)} className="text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition">
                                                    <X size={16} />
                                                </button>
                                            )}
                                            {file.status === "uploading" && <Loader2 size={16} className="text-cyan-500 animate-spin" />}
                                            {file.status === "completed" && <CheckCircle size={16} className="text-green-500" />}
                                            {file.status === "error" && <AlertCircle size={16} className="text-rose-500" />}
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                        {completedCount > 0 && `${completedCount} abgeschlossen`}
                    </div>
                    <div className="flex gap-3">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isUploading}>
                            Schließen
                        </Button>
                        <Button
                            onClick={startUpload}
                            disabled={isUploading || pendingCount === 0}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white min-w-[120px]"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 size={16} className="mr-2 animate-spin" /> Uploading
                                </>
                            ) : (
                                `Start Upload (${pendingCount})`
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
