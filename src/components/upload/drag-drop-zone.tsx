/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState, useCallback } from "react";
import clsx from "clsx";
import { UploadCloud } from "lucide-react";

interface DragDropZoneProps {
    onFilesSelected: (files: File[]) => void;
    children?: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

export function DragDropZone({ onFilesSelected, children, className, disabled }: DragDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (disabled) return;

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            onFilesSelected(files);
        }
    }, [onFilesSelected, disabled]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(Array.from(e.target.files));
        }
        // Reset value to allow selecting the same file again
        e.target.value = "";
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={clsx(
                "relative rounded-xl border-2 border-dashed transition-all duration-200",
                isDragging
                    ? "border-cyan-500 bg-cyan-500/10 scale-[1.01]"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            <input
                type="file"
                multiple
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={handleFileInput}
                disabled={disabled}
                aria-label="Dateien auswählen"
            />

            {children ? children : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className={clsx("p-4 rounded-full mb-4 transition-colors", isDragging ? "bg-cyan-500/20" : "bg-slate-800")}>
                        <UploadCloud size={32} className={clsx("transition-colors", isDragging ? "text-cyan-300" : "text-slate-400")} />
                    </div>
                    <p className="text-lg font-medium text-slate-200">
                        Dateien hier ablegen
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                        oder klicken zum Auswählen
                    </p>
                </div>
            )}

            {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-cyan-950/80 backdrop-blur-sm pointer-events-none">
                    <div className="text-center animate-pulse">
                        <UploadCloud size={48} className="mx-auto text-cyan-400 mb-2" />
                        <p className="text-xl font-bold text-cyan-100">Drop to upload!</p>
                    </div>
                </div>
            )}
        </div>
    );
}
