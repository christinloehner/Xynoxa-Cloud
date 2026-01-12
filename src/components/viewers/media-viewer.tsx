/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { FileItem } from "@/app/(dashboard)/files/use-files-query";

export function MediaViewer({ file }: { file: FileItem }) {
    const src = `/api/files/content/${file.id}`;
    const isVideo = file.mime?.startsWith("video/");

    return (
        <div className="w-full h-full flex items-center justify-center bg-black">
            {isVideo ? (
                <video
                    src={src}
                    controls
                    className="max-w-full max-h-full"
                    autoPlay
                />
            ) : (
                <audio
                    src={src}
                    controls
                    className="w-full max-w-md"
                    autoPlay
                />
            )}
        </div>
    );
}
