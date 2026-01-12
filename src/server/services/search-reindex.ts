/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "../db";
import { files, folders, calendarEvents, tasks, extractedTexts } from "../db/schema";
import { eq } from "drizzle-orm";
import { indexDocument, INDEXES, meiliClient, ensureIndex } from "./search";
import { upsertEmbedding } from "./embeddings";
import { extractText, sanitizeTextForIndex, isMimeIndexable, saveExtractedText } from "./extract";
import { buildBufferFromVersion, getLatestVersion } from "./file-versioning";
import { ModuleService } from "./module-service";
import type { SearchIndexContext } from "@/types/module";

export async function reindexAll(ownerId: string, onProgress?: (percent: number) => Promise<void>) {
  // Zuerst: gesamten Suchindex leeren (alle Indizes), damit keine Altlasten/Binärfragmente bleiben
  for (const idx of Object.values(INDEXES)) {
    try {
      await meiliClient.index(idx).deleteAllDocuments();
    } catch (e) {
      console.error(`Failed to clear index ${idx}:`, e);
    }
  }

  // Count totals for progress
  const [fileCount] = await db.select({ count: files.id }).from(files).where(eq(files.ownerId, ownerId));
  // Count others... 
  // For simplicity and speed, let's just fetch all and iterate. If lists are huge, we should paginate.
  // Assuming reasonable size for "Personal Cloud".

  const allFiles = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      folderId: files.folderId,
      groupFolderId: files.groupFolderId,
      path: files.path,
      mime: files.mime,
      size: files.size,
      updatedAt: files.updatedAt,
      isVault: files.isVault,
      content: extractedTexts.content
    })
    .from(files)
    .leftJoin(extractedTexts, eq(files.id, extractedTexts.fileId))
    .where(eq(files.ownerId, ownerId));

  const allFolders = await db.select().from(folders).where(eq(folders.ownerId, ownerId));
  const allTasks = await db.select().from(tasks).where(eq(tasks.ownerId, ownerId));
  const allEvents = await db.select().from(calendarEvents).where(eq(calendarEvents.ownerId, ownerId));

  const totalItems = allFiles.length + allFolders.length + allTasks.length + allEvents.length;
  let processed = 0;

  const updateProgress = async () => {
    processed++;
    if (onProgress && totalItems > 0) {
      const p = Math.round((processed / totalItems) * 100);
      await onProgress(p);
    }
  };

  // 1. Files
  for (const f of allFiles) {
    if (!f.isVault) {
      let content = isMimeIndexable(f.mime) ? sanitizeTextForIndex(f.content || "") : "";
      const shouldTryExtract = !content && (isMimeIndexable(f.mime) || !f.mime || f.mime === "application/octet-stream");

      if (shouldTryExtract) {
        const latest = await getLatestVersion(f.id);
        if (latest) {
          try {
            const buffer = await buildBufferFromVersion(latest.id);
            const extracted = await extractText({ fileId: f.id, buffer, mime: f.mime });
            const cleaned = sanitizeTextForIndex(extracted || "");
            if (cleaned) {
              content = cleaned;
              await saveExtractedText(db, f.id, cleaned);
            }
          } catch (e) {
            console.error("Reindex extraction failed", e);
          }
        }
      }
      await indexDocument(INDEXES.FILES, {
        id: f.id,
        ownerId: f.ownerId!,
        folderId: f.folderId,
        groupFolderId: (f as any).groupFolderId, // drizzle selection limited
        path: f.path,
        mime: f.mime,
        size: f.size,
        updatedAt: f.updatedAt.toISOString(),
        type: "file",
        content
      }, { force: true });
      await upsertEmbedding({
        db: db,
        ownerId: f.ownerId!,
        entity: "file",
        entityId: f.id,
        title: f.path,
        text: `${f.mime ?? ""} ${f.size ?? ""} ${content}`,
        force: true
      });
    }
    await updateProgress();
  }

  // 2. Folders
  for (const f of allFolders) {
    await indexDocument(INDEXES.FOLDERS, {
      id: f.id,
      ownerId: f.ownerId!, // Folders have ownerId
      name: f.name,
      createdAt: f.createdAt.toISOString(),
      type: "folder"
    }, { force: true });
    await updateProgress();
  }

  // 3. Tasks
  for (const t of allTasks) {
    await indexDocument(INDEXES.TASKS, {
      id: t.id,
      ownerId: t.ownerId,
      title: t.title,
      content: t.status,
      createdAt: t.createdAt.toISOString(),
      type: "task"
    }, { force: true });
    await upsertEmbedding({
      db: db,
      ownerId: t.ownerId,
      entity: "task",
      entityId: t.id,
      title: t.title,
      text: `${t.status} ${t.description ?? ""}`,
      force: true
    });
    await updateProgress();
  }

  // 4. Events
  for (const e of allEvents) {
    await indexDocument(INDEXES.EVENTS, {
      id: e.id,
      ownerId: e.ownerId,
      title: e.title,
      content: e.recurrence,
      createdAt: e.createdAt.toISOString(),
      type: "event"
    }, { force: true });
    await upsertEmbedding({
      db: db,
      ownerId: e.ownerId,
      entity: "event",
      entityId: e.id,
      title: e.title,
      text: e.recurrence ?? "",
      force: true
    });
    await updateProgress();
  }

  // 6. Module-Hooks: Lass aktive Module ihre Daten indexieren
  const moduleCounts: Record<string, number> = {};
  try {
    const activeModules = await ModuleService.getActiveModuleObjects();
    
    // Such-Context mit Helper-Funktionen
    // Entity-Typ ist jetzt dynamisch (Core + Module Entities)
    const searchContext: SearchIndexContext = {
      indexDocument: (indexName, document) => indexDocument(indexName, document, { force: true }),
      ensureIndex: (indexName, options) => ensureIndex(indexName, options),
      upsertEmbedding: async (params) => {
        await upsertEmbedding({
          db,
          ownerId: params.ownerId,
          entity: params.entity, // Dynamisch - Core oder Modul-Entity
          entityId: params.entityId,
          title: params.title,
          text: params.text,
          force: true
        });
      },
      db
    };
    
    for (const module of activeModules) {
      if (module.onReindex) {
        try {
          console.log(`[Reindex] Calling onReindex for module: ${module.metadata.id}`);
          const count = await module.onReindex(ownerId, searchContext);
          moduleCounts[module.metadata.id] = count;
          console.log(`[Reindex] Module ${module.metadata.id} indexed ${count} documents`);
        } catch (error) {
          console.error(`[Reindex] Failed to index module ${module.metadata.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("[Reindex] Failed to load active modules for indexing:", error);
  }

  return { 
    success: true, 
    counts: { 
      files: allFiles.length, 
      folders: allFolders.length, 
      tasks: allTasks.length, 
      events: allEvents.length,
      ...moduleCounts
    } 
  };
}
