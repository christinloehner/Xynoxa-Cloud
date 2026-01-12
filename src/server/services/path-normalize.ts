/*
 * Copyright (C) 2025 Christin Löhner
 */

import { posix as pathPosix } from "path";

export function normalizeClientPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Pfad ist leer.");
  }

  let normalized = trimmed.replace(/\\/g, "/");
  normalized = normalized.replace(/\/+/g, "/");
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/\/+$/, "");

  if (normalized.startsWith("/")) {
    throw new Error("Absolute Pfade sind nicht erlaubt.");
  }

  const parts = normalized.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      throw new Error("Ungültiger Pfad.");
    }
  }

  return parts.join("/");
}

export function splitClientPath(path: string): { fileName: string; dirName: string } {
  const fileName = pathPosix.basename(path);
  const dirName = pathPosix.dirname(path);
  return { fileName, dirName };
}

export function sanitizeFolderName(rawName: string): string {
  const name = rawName.trim();
  if (!name) {
    throw new Error("Ungültiger Ordnername.");
  }
  if (name === "." || name === "..") {
    throw new Error("Ungültiger Ordnername.");
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new Error("Ordnername darf keine Pfadtrenner enthalten.");
  }
  if (name.includes("\u0000")) {
    throw new Error("Ungültiger Ordnername.");
  }
  return name;
}
