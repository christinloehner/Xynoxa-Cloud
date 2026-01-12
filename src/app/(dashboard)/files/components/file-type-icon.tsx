/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState } from "react";
import Image from "next/image";
import {
    File as FileIcon,
    FileText,
    FileCode,
    FileArchive,
    Image as ImageIcon,
    Video,
    Music,
    FileSpreadsheet,
    Folder,
    Users
} from "lucide-react";
import clsx from "clsx";
import { FileItem } from "../use-files-query";

type Props = {
    item: FileItem;
    size?: number;
    variant?: "list" | "grid";
};

const colorByKind = {
    image: "bg-amber-100/20 text-amber-300 border border-amber-500/30",
    video: "bg-purple-100/20 text-purple-300 border border-purple-500/30",
    audio: "bg-emerald-100/20 text-emerald-300 border border-emerald-500/30",
    pdf: "bg-rose-100/20 text-rose-300 border border-rose-500/30",
    doc: "bg-blue-100/20 text-blue-300 border border-blue-500/30",
    sheet: "bg-green-100/20 text-green-300 border border-green-500/30",
    archive: "bg-amber-900/30 text-amber-200 border border-amber-600/40",
    code: "bg-cyan-100/20 text-cyan-200 border border-cyan-500/30",
    text: "bg-slate-800 text-slate-200 border border-slate-600/60",
    default: "bg-slate-800 text-slate-300 border border-slate-700/60",
    folder: "bg-cyan-900/30 text-cyan-200 border border-cyan-600/40",
    group: "bg-indigo-900/30 text-indigo-200 border border-indigo-600/40"
};

function detectKind(item: FileItem): { kind: keyof typeof colorByKind; label: string } {
    if (item.kind === "folder") {
        return { kind: item.isGroupFolder ? "group" : "folder", label: "Folder" };
    }
    const mime = item.mime || "";
    const ext = (item.name.split(".").pop() || "").toLowerCase();

    if (mime.startsWith("image/")) return { kind: "image", label: "IMG" };
    if (mime.startsWith("video/")) return { kind: "video", label: "VID" };
    if (mime.startsWith("audio/")) return { kind: "audio", label: "AUD" };
    if (mime === "application/pdf" || ext === "pdf") return { kind: "pdf", label: "PDF" };
    if (["doc", "docx", "odt", "rtf"].includes(ext)) return { kind: "doc", label: ext };
    if (["xls", "xlsx", "ods", "csv"].includes(ext)) return { kind: "sheet", label: ext };
    if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return { kind: "archive", label: ext };
    if (["js", "ts", "tsx", "jsx", "json", "css", "scss", "html", "md", "php", "py", "rb", "go", "rs", "c", "cpp"].includes(ext))
        return { kind: "code", label: ext };
    if (mime.startsWith("text/") || ["txt", "log"].includes(ext)) return { kind: "text", label: ext || "TXT" };
    return { kind: "default", label: ext || (mime.split("/").pop() || "FILE").toUpperCase() };
}

export function FileTypeIcon({ item, size = 32, variant = "list" }: Props) {
    const [thumbError, setThumbError] = useState(false);
    const { kind, label } = detectKind(item);
    const showThumb = item.kind === "file" && item.mime?.startsWith("image/") && !thumbError && !item.vault;

    const className = clsx(
        "flex items-center justify-center rounded-lg shrink-0 overflow-hidden",
        colorByKind[kind] || colorByKind.default
    );

    const iconSize = Math.max(16, Math.min(size - 8, 42));

    if (showThumb) {
        return (
            <div className={className} style={{ width: size, height: size }}>
                <Image
                    src={`/api/files/thumbnail?fileId=${item.id}&size=${Math.min(size, 64)}`}
                    alt={item.name}
                    width={size}
                    height={size}
                    className="h-full w-full object-cover"
                    onError={() => setThumbError(true)}
                    unoptimized
                />
            </div>
        );
    }

    const icon = (() => {
        if (item.kind === "folder") {
            return item.isGroupFolder ? (
                <Users size={iconSize} strokeWidth={1.3} />
            ) : (
                <Folder size={iconSize} strokeWidth={1.3} />
            );
        }
        switch (kind) {
            case "image":
                return <ImageIcon size={iconSize} strokeWidth={1.2} />;
            case "video":
                return <Video size={iconSize} strokeWidth={1.2} />;
            case "audio":
                return <Music size={iconSize} strokeWidth={1.2} />;
            case "archive":
                return <FileArchive size={iconSize} strokeWidth={1.2} />;
            case "code":
                return <FileCode size={iconSize} strokeWidth={1.2} />;
            case "sheet":
                return <FileSpreadsheet size={iconSize} strokeWidth={1.2} />;
            case "pdf":
            case "doc":
            case "text":
                return <FileText size={iconSize} strokeWidth={1.2} />;
            default:
                return <FileIcon size={iconSize} strokeWidth={1.2} />;
        }
    })();

    return (
        <div className={className} style={{ width: size, height: size }}>
            {icon}
            {variant === "list" && (
                <span className="absolute bottom-0 right-0 m-[2px] rounded bg-black/40 px-1 text-[10px] font-semibold uppercase text-white">
                    {label.slice(0, 4)}
                </span>
            )}
        </div>
    );
}
