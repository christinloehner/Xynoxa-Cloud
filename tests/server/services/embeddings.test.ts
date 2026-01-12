/*
 * Copyright (C) 2025 Christin Löhner
 */

// @vitest-environment node
import { generateEmbedding } from "@/server/services/embeddings";
import { describe, it, expect } from "vitest";

describe("Embeddings Service", () => {
    it("should generate embedding with 384 dimensions", async () => {
        const text = "Xynoxa is the future of personal cloud.";
        const vector = await generateEmbedding(text);
        expect(vector).toHaveLength(384);
        expect(vector.every((n) => typeof n === "number")).toBe(true);
    });
});
