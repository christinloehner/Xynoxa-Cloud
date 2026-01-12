/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { FileItem } from "@/app/(dashboard)/files/use-files-query";
export function PdfViewer({ file }: { file: FileItem }) {
    const url = `/api/files/content/${file.id}`;
    return (
        <iframe src={`${url}#view=FitH`} className="w-full h-full border-0" title={file.name} />
    );
}
