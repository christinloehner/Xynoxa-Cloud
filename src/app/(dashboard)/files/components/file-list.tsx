/*
 * Copyright (C) 2025 Christin Löhner
 */

import { SortConfig, FileItem } from "../use-files-query";
import { Folder, File as FileIcon, Shield, ChevronRight, Users, ChevronUp, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { useDateFormatter } from "@/lib/use-date-formatter";
import { FileTypeIcon } from "./file-type-icon";

interface FileListProps {
    items: FileItem[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string, multi: boolean, range: boolean) => void;
    onNavigate: (id: string, item?: FileItem) => void;
    sortConfig: SortConfig;
    onSort: (key: SortConfig["key"]) => void;
}

export function FileList({ items, selectedIds, onToggleSelect, onNavigate, sortConfig, onSort }: FileListProps) {
    const { formatDateTime } = useDateFormatter();

    const renderSortIcon = (key: SortConfig["key"]) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === "asc" ? <ChevronUp size={12} className="ml-1" /> : <ChevronDown size={12} className="ml-1" />;
    };

    return (
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="flex items-center gap-4 bg-slate-900/60 border-b border-slate-800 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider select-none">
                <div className="w-8"></div>
                <div
                    className="flex-1 flex items-center cursor-pointer hover:text-slate-300 transition-colors"
                    onClick={() => onSort("name")}
                >
                    Name {renderSortIcon("name")}
                </div>
                <div
                    className="w-24 flex items-center justify-end cursor-pointer hover:text-slate-300 transition-colors"
                    onClick={() => onSort("size")}
                >
                    Size {renderSortIcon("size")}
                </div>
                <div
                    className="w-32 flex items-center justify-end cursor-pointer hover:text-slate-300 transition-colors"
                    onClick={() => onSort("updated")}
                >
                    Modified {renderSortIcon("updated")}
                </div>
                <div
                    className="w-20 flex items-center justify-center cursor-pointer hover:text-slate-300 transition-colors"
                    onClick={() => onSort("kind")}
                >
                    Type {renderSortIcon("kind")}
                </div>
            </div>
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
                            "flex items-center gap-4 border-b border-slate-800/50 px-4 py-2.5 text-sm transition-colors hover:bg-slate-800/60 cursor-pointer last:border-0",
                            selected ? "bg-cyan-900/10" : ""
                        )}
                    >
                        <div className="flex h-8 w-8 items-center justify-center">
                            <FileTypeIcon item={item} size={32} />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={clsx("truncate font-medium", selected ? "text-cyan-200" : "text-slate-200")}>
                                    {item.name}
                                </span>
                                {item.vault && <Shield size={12} className="text-amber-400" />}
                            </div>
                        </div>

                        <div className="w-24 text-right text-slate-500 text-xs tabular-nums">
                            {item.size}
                        </div>
                        <div className="w-32 text-right text-slate-500 text-xs tabular-nums">
                            {formatDateTime(item.updated)}
                        </div>
                        <div className="w-20 text-center text-xs">
                            {isFolder ? (
                                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">Folder</span>
                            ) : (
                                <span className="rounded bg-slate-800/50 px-1.5 py-0.5 text-slate-500 uppercase text-[10px]">{item.mime?.split('/').pop() || 'FILE'}</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
