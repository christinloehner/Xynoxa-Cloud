/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { FileItem } from "@/app/(dashboard)/files/use-files-query";
/* eslint-disable @next/next/no-img-element */

export function ImageViewer({ file }: { file: FileItem }) {
    const src = `/api/files/content/${file.id}`;

    return (
        <div className="w-full h-full flex items-center justify-center p-4">
            <img
                src={src}
                alt={file.name}
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            />
        </div>
    );
}
