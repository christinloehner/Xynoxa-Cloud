/*
 * Copyright (C) 2025 Christin Löhner
 */

import { MeiliSearch } from "meilisearch";
import { getSearchAutoReindex } from "./user-search-settings";

const defaultHost =
  process.env.NODE_ENV === "production" ? "http://meilisearch:7700" : "http://localhost:7700";
const MEILI_HOST = process.env.MEILI_HOST || defaultHost;
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY || "";

// Initialize MeiliSearch client
export const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_MASTER_KEY
});

// Index names
export const INDEXES = {
  FILES: "files",
  NOTES: "notes",
  BOOKMARKS: "bookmarks",
  EVENTS: "events",
  TASKS: "tasks",
  FOLDERS: "folders"
} as const;

const FILTERABLE = [
  "ownerId",
  "groupFolderId",
  "folderId",
  "projectId",
  "sectionId",
  "assigneeId",
  "priority",
  "status",
  "memberIds",
  "tags",
  "createdAt",
  "updatedAt",
  "type"
];

let initPromise: Promise<void> | null = null;

async function ensureIndexes() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const indexes = await meiliClient.getIndexes();
      const existingIndexes = new Set(indexes.results.map((i) => i.uid));

      for (const indexName of Object.values(INDEXES)) {
        if (!existingIndexes.has(indexName)) {
          await meiliClient.createIndex(indexName, { primaryKey: "id" });
          console.warn(`Created MeiliSearch index: ${indexName}`);
        }

        const index = meiliClient.index(indexName);
        await index.updateFilterableAttributes(FILTERABLE);
      }

      await meiliClient.index(INDEXES.FILES).updateSearchableAttributes(["path", "mime", "tags", "content"]);
      await meiliClient.index(INDEXES.NOTES).updateSearchableAttributes(["title", "content", "tags"]);
      await meiliClient.index(INDEXES.BOOKMARKS).updateSearchableAttributes([
        "title",
        "description",
        "url",
        "tags"
      ]);
      await meiliClient.index(INDEXES.EVENTS).updateSearchableAttributes(["title", "content"]);
      await meiliClient.index(INDEXES.TASKS).updateSearchableAttributes(["title", "content"]);
      await meiliClient.index(INDEXES.FOLDERS).updateSearchableAttributes(["name"]);
      console.warn("MeiliSearch indexes initialized");
    } catch (error) {
      console.error("Failed to initialize MeiliSearch indexes:", error);
    }
  })();
  return initPromise;
}

export async function ensureIndex(indexName: string, options?: { searchableAttributes?: string[] }) {
  await ensureIndexes();
  try {
    await meiliClient.getIndex(indexName);
  } catch (error) {
    await meiliClient.createIndex(indexName, { primaryKey: "id" });
  }

  const index = meiliClient.index(indexName);
  await index.updateFilterableAttributes(FILTERABLE);

  if (options?.searchableAttributes && options.searchableAttributes.length > 0) {
    await index.updateSearchableAttributes(options.searchableAttributes);
  }
}

type SearchDoc = Record<string, any> & {
  id: string;
  ownerId: string | null;
  type?: string;
  tags?: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
};
type IndexOptions = {
  force?: boolean;
};

async function shouldIndex(ownerId: string | null | undefined, force?: boolean): Promise<boolean> {
  if (force) return true;
  if (!ownerId) return true;
  return getSearchAutoReindex(ownerId);
}

/**
 * Index a document in MeiliSearch
 */
export async function indexDocument(indexName: string, document: SearchDoc, options: IndexOptions = {}) {
  try {
    const allowed = await shouldIndex(document.ownerId, options.force);
    if (!allowed) return;
    await ensureIndexes();
    await meiliClient.index(indexName).addDocuments([document]);
  } catch (error) {
    console.error(`Failed to index document in ${indexName}:`, error);
  }
}

/**
 * Update a document in MeiliSearch
 */
export async function updateDocument(indexName: string, document: SearchDoc, options: IndexOptions = {}) {
  try {
    const allowed = await shouldIndex(document.ownerId, options.force);
    if (!allowed) return;
    await ensureIndexes();
    await meiliClient.index(indexName).updateDocuments([document]);
  } catch (error) {
    console.error(`Failed to update document in ${indexName}:`, error);
  }
}

/**
 * Delete a document from MeiliSearch
 */
export async function deleteDocument(
  indexName: string,
  documentId: string,
  ownerId?: string | null,
  options: IndexOptions = {}
) {
  try {
    const allowed = await shouldIndex(ownerId ?? null, options.force);
    if (!allowed) return;
    await ensureIndexes();
    await meiliClient.index(indexName).deleteDocument(documentId);
  } catch (error) {
    console.error(`Failed to delete document from ${indexName}:`, error);
  }
}

export type SearchFilters = {
  type?: "file" | "note" | "bookmark" | "event" | "task" | "folder" | "all";
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
};

function buildFilter(filters: SearchFilters): string[] {
  const parts: string[] = [];
  if (filters.tags && filters.tags.length > 0) {
    const escaped = filters.tags.map((t) => `\"${t}\"`).join(", ");
    parts.push(`tags IN [${escaped}]`);
  }
  if (filters.dateFrom) parts.push(`createdAt >= ${JSON.stringify(filters.dateFrom)}`);
  if (filters.dateTo) parts.push(`createdAt <= ${JSON.stringify(filters.dateTo)}`);
  return parts;
}

/**
 * Search across all indexes with optional filters/pagination
 */
export async function multiSearch(query: string, userId: string, filters: SearchFilters = {}, groupFolderIds: string[] = []) {
  try {
    const { moduleLoader } = await import("../../lib/module-loader");
    const { moduleRouterRegistry } = await import("../module-router-registry");
    await moduleLoader.initialize();
    await ensureIndexes();
    const perPage = filters.perPage ?? 10;
    const offset = ((filters.page ?? 1) - 1) * perPage;
    const filterExprBase = buildFilter(filters).join(" AND ");

    const filesOwnershipFilter = (() => {
      const gf = groupFolderIds.length ? ` OR groupFolderId IN [${groupFolderIds.map((g) => `\"${g}\"`).join(", ")}]` : "";
      return `(ownerId = \"${userId}\"${gf})`;
    })();

    const queries: Array<{ indexUid: string; q: string; filter: string; limit: number; offset: number; showRankingScore: boolean; type: string }> = [];
    const mapIndex = (type: keyof typeof INDEXES) => {
      const filtersForIndex = [];
      if (type === "FILES" || type === "FOLDERS") {
        filtersForIndex.push(filesOwnershipFilter);
      } else {
        filtersForIndex.push(`ownerId = \"${userId}\"`);
      }
      if (filterExprBase) filtersForIndex.push(filterExprBase);

      return {
        indexUid: INDEXES[type],
        q: query,
        filter: filtersForIndex.join(" AND "),
        limit: perPage,
        offset,
        showRankingScore: true,
        type: type.toLowerCase().replace("s", "")
      };
    };

    const typeMap: Record<Exclude<SearchFilters["type"], undefined>, keyof typeof INDEXES> = {
      file: "FILES",
      note: "NOTES",
      bookmark: "BOOKMARKS",
      event: "EVENTS",
      task: "TASKS",
      folder: "FOLDERS",
      all: "FILES" // placeholder, overwritten when "all"
    } as const;

    if (filters.type && filters.type !== "all") {
      queries.push(mapIndex(typeMap[filters.type]));
    } else {
      queries.push(
        mapIndex("FILES"),
        mapIndex("NOTES"),
        mapIndex("BOOKMARKS"),
        mapIndex("EVENTS"),
        mapIndex("TASKS"),
        mapIndex("FOLDERS")
      );

      const moduleIndexes = moduleRouterRegistry
        .getAllEntityTypes()
        .filter((et) => et.searchIndexName)
        .map((et) => ({
          indexUid: et.searchIndexName as string,
          type: et.name
        }));

      const moduleAccessFilter = `(ownerId = \"${userId}\" OR memberIds = \"${userId}\")`;

      for (const mod of moduleIndexes) {
        const filtersForIndex = [moduleAccessFilter];
        if (filterExprBase) filtersForIndex.push(filterExprBase);
        queries.push({
          indexUid: mod.indexUid,
          q: query,
          filter: filtersForIndex.join(" AND "),
          limit: perPage,
          offset,
          showRankingScore: true,
          type: mod.type
        });
      }
    }

    const results = await meiliClient.multiSearch({ queries });

    const hits = results.results.flatMap((res, idx) => {
      const resolvedType = queries[idx]?.type ?? "unknown";
      return res.hits.map((hit: any) => ({
        ...hit,
        _type: resolvedType,
        confidence: hit._rankingScore ?? hit.rankingScore ?? null
      }));
    });

    const total = results.results.reduce((sum, res) => sum + (res.estimatedTotalHits ?? res.totalHits ?? 0), 0);
    const hasMore = offset + perPage < total;

    return { hits, total, page: filters.page ?? 1, hasMore };
  } catch (error) {
    console.error("MeiliSearch multi-search failed:", error);
    return { hits: [], total: 0, page: filters.page ?? 1, hasMore: false };
  }
}
