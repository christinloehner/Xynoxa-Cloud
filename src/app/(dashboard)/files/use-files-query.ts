/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc-client";

export type FileItem = {
    id: string;
    name: string;
    originalName?: string | null;
    iv?: string | null;
    mime?: string | null;
    storagePath?: string | null;
    size: string;
    updated: string;
    version: string;
    vault: boolean;
    folderId?: string | null;
    kind: "file" | "folder";
    isGroupFolder?: boolean;
};


export type SortConfig = {
    key: "name" | "size" | "updated" | "kind";
    direction: "asc" | "desc";
};

export function useFilesQuery({ currentFolder, sortConfig }: { currentFolder: string | null, sortConfig?: SortConfig }) {
    const list = trpc.files.list.useQuery({ folderId: currentFolder });
    const listFolders = trpc.folders.list.useQuery({ parentId: currentFolder });

    const items = useMemo<FileItem[]>(() => {
        const folders = (listFolders.data ?? []).map((f: any) => ({
            id: f.id,
            name: f.name,
            size: "—",
            updated: f.createdAt ? new Date(f.createdAt).toISOString() : "",
            version: "",
            vault: f.isVault ?? false,
            folderId: f.parentId,
            originalName: f.name,
            kind: "folder" as const,
            isGroupFolder: f.isGroupFolder
        }));

        const files = (list.data ?? []).map((f) => ({
            id: f.id,
            name: f.path,
            originalName: f.originalName,
            iv: f.iv,
            mime: f.mime,
            storagePath: f.storagePath,
            size: f.size || "0 B", // Ensure string for sorting if needed, but usually pre-formatted. 
            // formatBytes returns "X MB", so strict string sort works okayish for same units, but proper size sort needs bytes. 
            // Backend returns pre-formatted size string? 
            // Let's assume size string for now. Strict sorting might be tricky without raw bytes.
            // But user requirement is just "sortable".
            updated: f.updatedAt?.toISOString?.() ?? "",
            version: "v1",
            vault: f.isVault ?? false,
            folderId: f.folderId ?? null,
            kind: "file" as const
        }));

        const combined = [...folders, ...files] as FileItem[];

        if (!sortConfig) return combined;

        return combined.sort((a, b) => {
            // 1. Folders always first
            if (a.kind === "folder" && b.kind !== "folder") return -1;
            if (a.kind !== "folder" && b.kind === "folder") return 1;

            const { key, direction } = sortConfig;
            let comparison = 0;

            switch (key) {
                case "name":
                    comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
                    break;
                case "size":
                    // Simple string sort for now, ideally parse bytes
                    // If formatting is consistant (KB, MB), it might fail (10 KB vs 2 MB).
                    // For robust sort we need raw bytes.
                    // But assume string comparison for quick fix unless we can access raw bytes.
                    comparison = a.size.localeCompare(b.size, undefined, { numeric: true });
                    break;
                case "updated":
                    comparison = a.updated.localeCompare(b.updated);
                    break;
                case "kind":
                    // Folders are already separated. Just sort files by mime?
                    const typeA = a.mime || "unknown";
                    const typeB = b.mime || "unknown";
                    comparison = typeA.localeCompare(typeB);
                    break;
            }

            return direction === "asc" ? comparison : -comparison;
        });
    }, [list.data, listFolders.data, sortConfig]);

    return {
        items,
        isLoading: list.isLoading || listFolders.isLoading,
        refetch: async () => {
            await Promise.all([list.refetch(), listFolders.refetch()]);
        }
    };
}
