/*
 * Copyright (C) 2025 Christin Löhner
 */

import { sql } from "drizzle-orm";
import { DB } from "../db";
import crypto from "crypto";
import { moduleRouterRegistry } from "../module-router-registry";
import { getSearchAutoReindex } from "./user-search-settings";

// Core Entity Types
const CORE_ENTITIES = ["note", "file", "event", "task"] as const;

// Dynamischer Entity Type - Core + Module Entities
type Entity = typeof CORE_ENTITIES[number] | string;

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// Global singleton for the pipeline
let embedder: any = null;
let pipelineFn: typeof import("@xenova/transformers").pipeline | null = null;

async function getPipeline() {
  if (!pipelineFn) {
    const mod = await import("@xenova/transformers");
    pipelineFn = mod.pipeline;
  }
  return pipelineFn;
}

async function getEmbedder() {
  if (!embedder) {
    console.warn("Loading embedding model...");
    const pipeline = await getPipeline();
    embedder = await pipeline("feature-extraction", MODEL_NAME, {
      quantized: false, // Use full precision if possible, or true for speed/size
    });
    console.warn("Embedding model loaded.");
  }
  return embedder;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    const hash = crypto.createHash("sha256").update(text).digest();
    return Array.from({ length: 384 }, (_, i) => hash[i % hash.length] / 255);
  }
  const pipe = await getEmbedder();
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return Array(384).fill(0); // Model dimension is 384

  const output = await pipe(clean, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

function vectorSQL(vec: number[]) {
  return sql.raw(`'[${vec.join(",")}]'::vector`);
}

/**
 * Löscht bestehende Embeddings für eine Entity
 * Unterstützt Core-Entities und dynamische Modul-Entities
 */
async function deleteExisting(db: DB, entity: Entity, id: string) {
  // Core Entity Types
  switch (entity) {
    case "note":
      await db.execute(sql`DELETE FROM embeddings WHERE note_id = ${id}`);
      return;
    case "file":
      await db.execute(sql`DELETE FROM embeddings WHERE file_id = ${id}`);
      return;
    case "event":
      await db.execute(sql`DELETE FROM embeddings WHERE event_id = ${id}`);
      return;
    case "task":
      await db.execute(sql`DELETE FROM embeddings WHERE task_id = ${id}`);
      return;
  }

  // Module Entity Types
  const moduleEntity = moduleRouterRegistry.getEntityType(entity);
  if (moduleEntity?.embeddingFkColumn) {
    await db.execute(sql`DELETE FROM embeddings WHERE ${sql.identifier(moduleEntity.embeddingFkColumn)} = ${id}`);
    return;
  }

  console.warn(`[Embeddings] Unknown entity type for delete: ${entity}`);
}

/**
 * Erstellt oder aktualisiert ein Embedding für eine Entity
 * Unterstützt Core-Entities und dynamische Modul-Entities
 */
export async function upsertEmbedding(params: {
  db: DB;
  ownerId: string | null;
  entity: Entity;
  entityId: string;
  text: string;
  title?: string;
  force?: boolean;
}) {
  if (!params.force && params.ownerId) {
    const allowed = await getSearchAutoReindex(params.ownerId);
    if (!allowed) return;
  }
  const content = `${params.title ?? ""}\n${params.text ?? ""}`.trim();
  if (!content) return;
  
  const vec = await generateEmbedding(content);
  await deleteExisting(params.db, params.entity, params.entityId);

  // Core Entity Types
  switch (params.entity) {
    case "note":
      await params.db.execute(sql`
        INSERT INTO embeddings ("owner_id", "note_id", "vector")
        VALUES (${params.ownerId}, ${params.entityId}, ${vectorSQL(vec)})
      `);
      return;
    case "file":
      await params.db.execute(sql`
        INSERT INTO embeddings ("owner_id", "file_id", "vector")
        VALUES (${params.ownerId}, ${params.entityId}, ${vectorSQL(vec)})
      `);
      return;
    case "event":
      await params.db.execute(sql`
        INSERT INTO embeddings ("owner_id", "event_id", "vector")
        VALUES (${params.ownerId}, ${params.entityId}, ${vectorSQL(vec)})
      `);
      return;
    case "task":
      await params.db.execute(sql`
        INSERT INTO embeddings ("owner_id", "task_id", "vector")
        VALUES (${params.ownerId}, ${params.entityId}, ${vectorSQL(vec)})
      `);
      return;
  }

  // Module Entity Types - dynamische Spalte
  const moduleEntity = moduleRouterRegistry.getEntityType(params.entity);
  if (moduleEntity?.embeddingFkColumn) {
    await params.db.execute(sql`
      INSERT INTO embeddings ("owner_id", ${sql.identifier(moduleEntity.embeddingFkColumn)}, "vector")
      VALUES (${params.ownerId}, ${params.entityId}, ${vectorSQL(vec)})
    `);
    return;
  }

  console.warn(`[Embeddings] Unknown entity type for upsert: ${params.entity}`);
}

export async function deleteEmbedding(params: {
  db: DB;
  entity: Entity;
  entityId: string;
  ownerId?: string | null;
  force?: boolean;
}) {
  if (!params.force && params.ownerId) {
    const allowed = await getSearchAutoReindex(params.ownerId);
    if (!allowed) return;
  }
  await deleteExisting(params.db, params.entity, params.entityId);
}

/**
 * Semantische Suche über alle Embeddings
 * Unterstützt Core-Entities und dynamische Modul-Entities
 */
export async function semanticSearch(params: {
  db: DB;
  ownerId: string;
  query: string;
  type?: Entity | "all";
  limit?: number;
  offset?: number;
  groupFolderIds?: string[];
}) {
  const vec = await generateEmbedding(params.query || "");
  const vecSql = vectorSQL(vec);
  const limit = params.limit ?? 10;
  const offset = params.offset ?? 0;

  // Build type filter - Core + Module entities
  let typeFilterSql = sql``;
  if (params.type && params.type !== "all") {
    // Core Entity Types
    const coreFilters: Record<string, string> = {
      note: "e.note_id IS NOT NULL",
      file: "e.file_id IS NOT NULL",
      event: "e.event_id IS NOT NULL",
      task: "e.task_id IS NOT NULL"
    };
    
    if (coreFilters[params.type]) {
      typeFilterSql = sql`AND ${sql.raw(coreFilters[params.type])}`;
    } else {
      // Module Entity Type
      const moduleEntity = moduleRouterRegistry.getEntityType(params.type);
      if (moduleEntity?.embeddingFkColumn) {
        typeFilterSql = sql`AND e.${sql.identifier(moduleEntity.embeddingFkColumn)} IS NOT NULL`;
      }
    }
  }

  const groupList = params.groupFolderIds ?? [];
  const groupFilter = groupList.length
    ? sql`OR (e.file_id IS NOT NULL AND f.group_folder_id IN (${sql.raw(groupList.map((g) => `'${g}'`).join(","))}))`
    : sql``;

  // Build dynamic SELECT for module entity columns
  const moduleEntities = moduleRouterRegistry.getAllEntityTypes().filter(et => et.moduleId !== "core" && et.embeddingFkColumn);
  
  // Build dynamic type CASE with module entities
  let typeCaseParts = `
    WHEN e.note_id IS NOT NULL THEN 'note'
    WHEN e.file_id IS NOT NULL THEN 'file'
    WHEN e.event_id IS NOT NULL THEN 'event'
    WHEN e.task_id IS NOT NULL THEN 'task'
  `;
  
  for (const me of moduleEntities) {
    typeCaseParts += `WHEN e.${me.embeddingFkColumn} IS NOT NULL THEN '${me.name}'\n`;
  }

  // Build dynamic JOIN for module tables
  let moduleJoins = "";
  let moduleSelectColumns = "";
  let moduleIdColumns = "";
  let moduleTitleCoalesce = "";
  let moduleContentCoalesce = "";
  let moduleCreatedAtCoalesce = "";
  
  for (const me of moduleEntities) {
    const alias = me.name.substring(0, 3); // Short alias like "boo" for bookmark
    moduleJoins += `LEFT JOIN ${me.tableName} ${alias} ON e.${me.embeddingFkColumn} = ${alias}.${me.idColumn}\n`;
    moduleSelectColumns += `e.${me.embeddingFkColumn},\n`;
    moduleIdColumns += `e.${me.embeddingFkColumn} || `;
    moduleTitleCoalesce += `${alias}.title, `;
    moduleContentCoalesce += `${alias}.description, `;
    moduleCreatedAtCoalesce += `${alias}.created_at, `;
  }

  const rows = await params.db.execute(sql`
    SELECT
      e.id,
      e.owner_id,
      e.note_id,
      e.file_id,
      e.event_id,
      e.task_id,
      ${sql.raw(moduleSelectColumns.slice(0, -2) || "NULL as _module_placeholder")},
      e.created_at,
      ${vecSql} <-> e.vector AS distance,
      COALESCE(n.title, f.path, ev.title, t.title, ${sql.raw(moduleTitleCoalesce.slice(0, -2) || "NULL")}) AS title,
      COALESCE(n.content, ev.recurrence, t.description, ${sql.raw(moduleContentCoalesce.slice(0, -2) || "NULL")}) AS content,
      COALESCE(n.created_at, f.created_at, ev.created_at, t.created_at, ${sql.raw(moduleCreatedAtCoalesce.slice(0, -2) || "NULL")}) AS created_at,
      CASE
        ${sql.raw(typeCaseParts)}
      END AS type
    FROM embeddings e
    LEFT JOIN notes n ON e.note_id = n.id
    LEFT JOIN files f ON e.file_id = f.id
    LEFT JOIN calendar_events ev ON e.event_id = ev.id
    LEFT JOIN tasks t ON e.task_id = t.id
    ${sql.raw(moduleJoins)}
    WHERE (e.owner_id = ${params.ownerId} ${groupFilter})
    ${typeFilterSql}
    ORDER BY distance ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Build ID extraction with module columns
  const items = rows.rows.map((r: any) => {
    // Find the ID from core or module columns
    let id = r.note_id || r.file_id || r.event_id || r.task_id;
    
    // Check module entity columns if no core ID found
    if (!id) {
      for (const me of moduleEntities) {
        if (r[me.embeddingFkColumn!]) {
          id = r[me.embeddingFkColumn!];
          break;
        }
      }
    }
    
    return {
      id: id || r.id,
      type: r.type as Entity,
      title: r.title || "Untitled",
      snippet: r.content || "",
      createdAt: r.created_at,
      confidence: r.distance != null ? 1 / (1 + Number(r.distance)) : null
    };
  });

  return items;
}
