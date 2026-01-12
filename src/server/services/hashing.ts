/*
 * Copyright (C) 2025 Christin Löhner
 */

import { createHash } from "crypto";
import { createReadStream } from "fs";

/**
 * Calculate SHA-256 hash of a file
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Calculate SHA-256 hash of a buffer or string
 */
export function calculateHash(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

