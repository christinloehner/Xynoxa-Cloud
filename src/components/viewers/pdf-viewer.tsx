/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { FileItem } from "@/app/(dashboard)/files/use-files-query";
import { useState, useEffect } from "react";

export function PdfViewer({ file }: { file: FileItem }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        // In a real implementation, we might need a presigned URL if it's protected/s3
        // For now, assuming we have a proxy endpoint that serves content based on session
        setUrl(`/api/files/content/${file.id}`);
    }, [file.id]);

    if (!url) return <div className="w-full h-full flex items-center justify-center text-slate-500">Lade PDF...</div>;

    return (
        <iframe src={`${url}#view=FitH`} className="w-full h-full border-0" title={file.name} />
    );
}
