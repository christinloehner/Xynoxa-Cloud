/*
 * Copyright (C) 2025 Christin Löhner
 */

import { extractedTexts } from "../db/schema";
import { DB } from "../db";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import AdmZip from "adm-zip";

// ESM-only: dynamisch laden, damit es auch in CJS/tsx-Worker funktioniert
let fileTypeFromBuffer: ((input: Buffer) => Promise<{ mime: string } | undefined>) | null = null;
async function getFileTypeFromBuffer(buf: Buffer) {
  if (!fileTypeFromBuffer) {
    const mod = await import("file-type");
    fileTypeFromBuffer = (mod as any).fileTypeFromBuffer;
  }
  return fileTypeFromBuffer ? fileTypeFromBuffer(buf) : undefined;
}

export type ExtractedPayload = {
  fileId: string;
  mime?: string | null;
  buffer?: Buffer;
  textFallback?: string;
};

// OCR bewusst optional halten: fehlende Worker-Dateien dürfen Uploads nicht crashen.
const OCR_ENABLED = process.env.ENABLE_OCR === "true";
let tesseractModule: Promise<typeof import("tesseract.js")> | null = null;

export async function extractText(payload: ExtractedPayload): Promise<string> {
  const { buffer, mime, textFallback } = payload;

  if (buffer && buffer.length > 0) {
    try {
      const detectedMime = mime || (await getFileTypeFromBuffer(buffer))?.mime || null;
      const resolvedMime = detectedMime || mime || "application/octet-stream";

      if (resolvedMime === "application/vnd.oasis.opendocument.text") {
        try {
          const zip = new AdmZip(buffer);
          const contentXml = zip.readAsText("content.xml");
          return contentXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || textFallback || "";
        } catch (e) {
          console.error("ODT extraction failed", e);
          return textFallback || "";
        }
      }

      if (resolvedMime === "application/pdf") {
        const res = await pdfParse(buffer);
        return res.text || textFallback || "";
      }

      if (
        resolvedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        resolvedMime === "application/msword"
      ) {
        const res = await mammoth.extractRawText({ buffer });
        return res.value || textFallback || "";
      }

      if (resolvedMime.startsWith("image/") && OCR_ENABLED) {
        try {
          if (!tesseractModule) {
            tesseractModule = import("tesseract.js");
          }
          const Tesseract = await tesseractModule;
          const { data } = await Tesseract.recognize(buffer, process.env.OCR_LANG || "eng+deu");
          return data?.text?.trim() || textFallback || "";
        } catch (ocrErr) {
          // Vermeide Upload-Abbruch, wenn der OCR-Worker (tesseract) im Deployment nicht verfügbar ist.
          console.error("OCR extraction failed", ocrErr);
        }
      }

      if (resolvedMime.startsWith("text/")) {
        return buffer.toString("utf8");
      }

      if (resolvedMime === "application/json") {
        return buffer.toString("utf8");
      }

      // Sicherheits-/Spam-Guard:
      // Für Binär-Formate (alles, was wir oben nicht whitelisten) KEINE Blind-UTF8-Dekodierung,
      // um Binärcode in den Suchindex zu vermeiden.
      return textFallback || "";
    } catch (err) {
      console.error("extractText failed", err);
      return textFallback ?? "";
    }
  }

  return textFallback ?? "";
}

export function sanitizeTextForIndex(text: string): string {
  // Entfernt Steuerzeichen und reduziert Mehrfach-Whitespace
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
  return cleaned.replace(/\s+/g, " ").trim();
}

export function isMimeIndexable(mime?: string | null): boolean {
  if (!mime) return false;
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json") return true;
  if (mime === "application/pdf") return true;
  if (mime === "application/vnd.oasis.opendocument.text") return true;
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  if (mime === "application/msword") return true;
  // Images nur, wenn OCR eingeschaltet ist (sonst landet Binärinhalt im Index)
  if (mime.startsWith("image/") && OCR_ENABLED) return true;
  return false;
}

export async function saveExtractedText(db: DB, fileId: string, content: string) {
  const cleaned = sanitizeTextForIndex(content);
  if (!cleaned) return;
  await db
    .insert(extractedTexts)
    .values({ fileId, content: cleaned, createdAt: new Date() })
    .onConflictDoNothing?.();
}
