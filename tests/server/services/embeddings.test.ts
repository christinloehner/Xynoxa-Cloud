/*
 * Copyright (C) 2025 Christin Löhner
 */

// @vitest-environment node
import { generateEmbedding } from "@/server/services/embeddings";
import { describe, it, expect, beforeAll } from "vitest";

describe("Embeddings Service", () => {
    let embeddingsAvailable = false;

    beforeAll(async () => {
        try {
            await generateEmbedding("preflight");
            embeddingsAvailable = true;
        } catch (err) {
            const message = String(err);
            if (!message.includes("sharp")) {
                throw err;
            }
        }
    });

    it("should generate embedding with 384 dimensions", async () => {
        if (!embeddingsAvailable) return;
        const text = "Xynoxa is the future of personal cloud.";
        const vector = await generateEmbedding(text);
        expect(vector).toHaveLength(384);
        expect(vector.every((n) => typeof n === "number")).toBe(true);
    });
});
