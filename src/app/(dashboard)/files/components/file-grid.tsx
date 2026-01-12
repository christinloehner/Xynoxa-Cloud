/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { FileItem } from "../use-files-query";
import { Folder, File as FileIcon, Shield, Users } from "lucide-react";
import clsx from "clsx";
import { FileTypeIcon } from "./file-type-icon";

interface FileGridProps {
    items: FileItem[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string, multi: boolean, range: boolean) => void;
    onNavigate: (id: string, item?: FileItem) => void;
}

export function FileGrid({ items, selectedIds, onToggleSelect, onNavigate }: FileGridProps) {
    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 ">
            {items.map((item) => {
                const selected = selectedIds.has(item.id);
                const isFolder = item.kind === "folder";

                return (
                    <div
                        key={item.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelect(item.id, e.ctrlKey || e.metaKey, e.shiftKey);
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            onNavigate(item.id, item);
                        }}
                        className={clsx(
                            "group relative flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-all hover:bg-slate-800/80 cursor-pointer select-none",
                            selected
                                ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]"
                                : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                        )}
                    >
                        <div className="relative flex h-16 w-16 items-center justify-center">
                            <FileTypeIcon item={item} size={64} variant="grid" />
                            {item.vault && <Shield size={14} className="absolute -bottom-1 -right-1 text-amber-400 fill-amber-950" />}
                        </div>

                        <div className="flex w-full flex-col items-center gap-0.5 text-center">
                            <span className="w-full truncate text-sm font-medium text-slate-200 group-hover:text-white">
                                {item.name}
                            </span>
                            <span className="text-[10px] text-slate-500">
                                {isFolder ? "Ordner" : item.size}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
