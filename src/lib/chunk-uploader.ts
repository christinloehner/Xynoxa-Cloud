/*
 * Copyright (C) 2025 Christin Löhner
 */

export type ChunkUploadOptions = {
    filename: string;
    file: File;
    chunkSize?: number; // Default 1MB
    vault?: boolean;
    iv?: string; // base64 IV for client-side encryption
    folderId?: string | null;  // NEW
    onProgress?: (progress: number) => void;
    onSuccess?: (file: any) => void;
    onError?: (error: Error) => void;
};

export class ChunkUploader {
    private file: File;
    private filename: string;
    private chunkSize: number;
    private vault: boolean;
    private iv?: string;
    private folderId: string | null = null;
    private uploadId: string | null = null;
    private aborted = false;

    constructor(options: ChunkUploadOptions) {
        this.file = options.file;
        this.filename = options.filename;
        this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB
        this.vault = options.vault || false;
        this.iv = options.iv;
        this.folderId = options.folderId || null;
    }

    async start(
        onProgress?: (p: number) => void,
    ): Promise<any> {
        try {
            // 1. Start Session
            const startRes = await fetch("/api/upload/chunk/start", {
                method: "POST",
                body: JSON.stringify({
                    filename: this.filename,
                    originalName: this.file.name,
                    size: this.file.size,
                    mime: this.file.type || "application/octet-stream",
                    totalChunks: Math.ceil(this.file.size / this.chunkSize),
                    vault: this.vault,
                    iv: this.iv,
                    folderId: this.folderId // Passing folderId
                }),
            });

            if (!startRes.ok) throw new Error("Failed to start upload session");
            const { uploadId } = await startRes.json();
            this.uploadId = uploadId;

            const totalChunks = Math.ceil(this.file.size / this.chunkSize);
            let chunksUploaded = 0;

            // 2. Upload Chunks
            for (let i = 0; i < totalChunks; i++) {
                if (this.aborted) throw new Error("Upload aborted");

                const start = i * this.chunkSize;
                const end = Math.min(start + this.chunkSize, this.file.size);
                const chunk = this.file.slice(start, end);

                const formData = new FormData();
                formData.append("uploadId", uploadId);
                formData.append("chunkIndex", i.toString());
                formData.append("file", chunk);

                const chunkRes = await fetch("/api/upload/chunk", {
                    method: "POST",
                    body: formData,
                });

                if (!chunkRes.ok) throw new Error(`Failed to upload chunk ${i}`);

                chunksUploaded++;
                const progress = Math.round((chunksUploaded / totalChunks) * 100);
                onProgress?.(progress);
            }

            // 3. Complete Upload
            const completeRes = await fetch("/api/upload/chunk/complete", {
                method: "POST",
                body: JSON.stringify({ uploadId, folderId: this.folderId }), // Pass folderId again to be sure
            });

            if (!completeRes.ok) throw new Error("Failed to complete upload");
            const result = await completeRes.json();

            return result.file;

        } catch (error) {
            console.error("Upload failed", error);
            throw error;
        }
    }

    abort() {
        this.aborted = true;
    }
}
