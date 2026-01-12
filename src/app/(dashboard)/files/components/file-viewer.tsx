/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState } from "react";
import { FileItem } from "../use-files-query";
import { X, AlertCircle, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "@/components/viewers/pdf-viewer";
import { ImageViewer } from "@/components/viewers/image-viewer";
import { MediaViewer } from "@/components/viewers/media-viewer";
import { TextViewer } from "@/components/viewers/text-viewer";
import { useVaultKey } from "@/lib/vault-context";
import { decryptBytes } from "@/lib/vault-crypto";
import { useToast } from "@/components/ui/toast";

interface FileViewerProps {
    file: FileItem;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    canPrev?: boolean;
    canNext?: boolean;
}

export function FileViewer({ file, onClose, onPrev, onNext, canPrev, canNext }: FileViewerProps) {
    const { envelopeKey, hasKey } = useVaultKey();
    const { push } = useToast();
    const [downloading, setDownloading] = useState(false);

    const mime = (file.mime || "").toLowerCase();
    const isImage = mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "tif", "tiff", "heic", "heif"].includes(
        (file.name.split(".").pop() || "").toLowerCase()
    );

    const handleVaultDownload = async () => {
        if (!hasKey || !envelopeKey) {
            push({ title: "Vault gesperrt", description: "Bitte zuerst Passphrase eingeben.", tone: "error" });
            return;
        }
        if (!file.iv) {
            push({ title: "Fehler", description: "IV fehlt – Datei kann nicht entschlüsselt werden.", tone: "error" });
            return;
        }
        try {
            setDownloading(true);
            const res = await fetch(`/api/files/download?id=${file.id}`, { credentials: "include" });
            if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
            const cipher = await res.arrayBuffer();
            const plain = await decryptBytes(cipher, file.iv, envelopeKey);
            const blob = new Blob([plain], { type: file.mime || "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            push({ title: "Fehler", description: err.message || "Entschlüsselung fehlgeschlagen", tone: "error" });
        } finally {
            setDownloading(false);
        }
    };

    // Vault-Dateien werden serverseitig nicht als Preview ausgeliefert.
    if (file.vault) {
        return (
            <div className="flex flex-col h-full bg-slate-950/50 rounded-xl border border-slate-800 overflow-hidden relative">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
                    <span className="text-sm font-medium text-slate-200 truncate">{file.name}</span>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
                        <X size={18} />
                    </Button>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-300 text-center px-6">
                    <AlertCircle size={32} className="text-amber-400" />
                    <p className="text-sm">Vault-Dateien werden client-seitig entschlüsselt. Zum Speichern musst du den Vault entsperrt haben.</p>
                    <Button variant="outline" disabled={downloading} onClick={handleVaultDownload}>
                        <Download size={16} className="mr-2" /> {downloading ? "Wird entschlüsselt..." : "Entschlüsselt herunterladen"}
                    </Button>
                </div>
            </div>
        );
    }

    let ViewerComponent = null;

    if (mime === "application/pdf") {
        ViewerComponent = <PdfViewer file={file} />;
    } else if (mime.startsWith("image/")) {
        ViewerComponent = <ImageViewer file={file} />;
    } else if (mime.startsWith("video/") || mime.startsWith("audio/")) {
        ViewerComponent = <MediaViewer file={file} />;
    } else if (
        mime.startsWith("text/") ||
        ["txt", "md", "js", "ts", "tsx", "jsx", "json", "css", "scss", "html", "xml", "php", "py", "rb", "go", "rs", "c", "cpp", "java", "sh", "yml", "yaml", "toml"].includes(file.name.split(".").pop()?.toLowerCase() || "")
    ) {
        ViewerComponent = <TextViewer file={file} />;
    }

    return (
        <div className="flex flex-col h-full bg-slate-950/50 rounded-xl border border-slate-800 overflow-hidden relative">
            {/* Viewer Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-sm font-medium text-slate-200 truncate">{file.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">({file.mime})</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
                        <X size={18} />
                    </Button>
                </div>
            </div>

            {/* Viewer Content */}
            <div className="flex-1 overflow-hidden bg-slate-950 relative">
                {ViewerComponent ? (
                    ViewerComponent
                ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                        <div className="p-4 rounded-full bg-slate-900">
                            <AlertCircle size={48} />
                        </div>
                        <p>Keine Vorschau verfügbar für diesen Dateityp.</p>
                        <Button variant="outline" onClick={() => window.open(`/api/files/download?id=${file.id}`, '_blank')}>
                            <Download size={16} className="mr-2" /> Datei herunterladen
                        </Button>
                    </div>
                )}

                {/* Image navigation */}
                {isImage && (
                    <>
                        <button
                            aria-label="Vorheriges Bild"
                            disabled={!canPrev}
                            onClick={onPrev}
                            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 text-white p-2 transition disabled:opacity-30 disabled:cursor-not-allowed z-10"
                        >
                            <ChevronLeft size={22} />
                        </button>
                        <button
                            aria-label="Nächstes Bild"
                            disabled={!canNext}
                            onClick={onNext}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 text-white p-2 transition disabled:opacity-30 disabled:cursor-not-allowed z-10"
                        >
                            <ChevronRight size={22} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
