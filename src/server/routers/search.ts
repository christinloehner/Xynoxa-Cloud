/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { multiSearch } from "@/server/services/search";
import { semanticSearch } from "@/server/services/embeddings";
import { requireRole } from "@/server/middleware/rbac";
import { searchQueue } from "@/server/jobs/queue";
import { getAccessibleGroupFolderIds } from "@/server/services/group-access";
import { ModuleService } from "@/server/services/module-service";

/**
 * Generiert die URL für ein Suchergebnis basierend auf seinem Typ
 * Nutzt Modul-spezifische URL-Generatoren falls verfügbar
 */
async function getSearchResultUrl(type: string, id: string): Promise<string> {
  // Lade aktive Module
  const activeModules = await ModuleService.getActiveModuleObjects();
  
  // Suche nach einem Modul, das diesen Entity-Type handhabt
  // Konvention: Module die "bookmark" indexieren nutzen entityType "bookmark"
  for (const moduleEntry of activeModules) {
    if (moduleEntry.getSearchResultUrl) {
      try {
        const url = moduleEntry.getSearchResultUrl(id, type);
        if (url) return url;
      } catch (error) {
        console.error(`[SearchRouter] Error getting URL from module ${moduleEntry.metadata.id}:`, error);
      }
    }
  }
  
  // Fallback: Standard-URLs für Built-in Types
  switch (type) {
    case "file":
      return `/files?fileId=${id}`;
    case "folder":
      return `/files?folderId=${id}`;
    case "event":
      return `/calendar?eventId=${id}`;
    case "task":
      return `/tasks?taskId=${id}`;
    default:
      return `/search?q=${id}`; // Fallback
  }
}

function buildContentSnippet(content: string | null | undefined, query: string): string {
  if (!content || !query.trim()) return "";
  const q = query.toLowerCase();
  const words = content.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const normalized = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""));
  const hitIndex = normalized.findIndex((w) => w.includes(q));
  if (hitIndex === -1) return "";

  const maxWords = 9;
  const minWords = 7;
  let start = Math.max(0, hitIndex - 4);
  let end = Math.min(words.length, start + maxWords);
  if (end - start < minWords) {
    start = Math.max(0, end - minWords);
  }

  const snippet = words.slice(start, end).join(" ");
  return snippet;
}

export const searchRouter = router({
  query: protectedProcedure
    .input(
      z.object({
        q: z.string().default(""),
        type: z.enum(["all", "file", "note", "bookmark", "event", "task", "folder"]).default("all"),
        tags: z.array(z.string()).default([]),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().min(1).default(1),
        perPage: z.number().min(1).max(50).default(12)
      })
    )
    .query(async ({ ctx, input }) => {
      if (!input.q.trim()) {
        return { items: [], total: 0, page: 1, hasMore: false };
      }

      const groupFolders = await getAccessibleGroupFolderIds(ctx.userId!);

      const { hits, total, hasMore, page } = await multiSearch(input.q, ctx.userId!, {
        type: input.type,
        tags: input.tags,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        page: input.page,
        perPage: input.perPage
      }, groupFolders);

      const items = await Promise.all(hits.map(async (hit: any) => {
        const snippet = buildContentSnippet(hit.content, input.q);
        return {
          id: hit.id,
          title: hit.title || hit.path || hit.url || "Untitled",
          type: hit._type,
          snippet: snippet || hit.description || hit.path || hit.url || "",
          tags: hit.tags || [],
          createdAt: hit.createdAt,
          confidence: hit.confidence ?? null,
          url: await getSearchResultUrl(hit._type, hit.id)
        };
      }));

      return { items, total, page, hasMore };
    }),

  semantic: protectedProcedure
    .input(
      z.object({
        q: z.string().default(""),
        type: z.enum(["all", "file", "note", "bookmark", "event", "task"]).default("all"),
        page: z.number().min(1).default(1),
        perPage: z.number().min(1).max(50).default(10)
      })
    )
    .query(async ({ ctx, input }) => {
      if (!input.q.trim()) return { items: [], hasMore: false, page: 1 };

      const groupFolders = await getAccessibleGroupFolderIds(ctx.userId!);
      const offset = (input.page - 1) * input.perPage;
      const results = await semanticSearch({
        db: ctx.db,
        ownerId: ctx.userId!,
        query: input.q,
        type: input.type === "all" ? "all" : (input.type as any),
        limit: input.perPage,
        offset,
        groupFolderIds: groupFolders
      });

      // Füge URLs zu semantischen Suchergebnissen hinzu
      const items = await Promise.all(results.map(async (item: any) => ({
        ...item,
        url: await getSearchResultUrl(item.type, item.id)
      })));

      return {
        items,
        hasMore: items.length === input.perPage,
        page: input.page
      };
    }),

  reindex: protectedProcedure
      .use(requireRole(["owner", "admin"])) // Restrict to admin/owner
      .mutation(async ({ ctx }) => {
        const job = await searchQueue().add("reindex", {
          kind: "reindex",
          ownerId: ctx.userId!
        });
        return { jobId: job.id as string };
      }),

  reindexStatus: protectedProcedure
    .use(requireRole(["owner", "admin"]))
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await searchQueue().getJob(input.jobId);
      if (!job) return { status: "unknown", progress: 0 };
      const state = await job.getState();
      return {
        status: state,
        progress: typeof job.progress === "number" ? job.progress : 0,
        failedReason: job.failedReason
      };
    }),

  reindexSelf: protectedProcedure
    .mutation(async ({ ctx }) => {
      const job = await searchQueue().add("reindex", {
        kind: "reindex",
        ownerId: ctx.userId!
      });
      return { jobId: job.id as string };
    }),

  reindexStatusSelf: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await searchQueue().getJob(input.jobId);
      if (!job) return { status: "unknown", progress: 0 };
      if (job.data?.ownerId !== ctx.userId) return { status: "unknown", progress: 0 };
      const state = await job.getState();
      return {
        status: state,
        progress: typeof job.progress === "number" ? job.progress : 0,
        failedReason: job.failedReason
      };
    })
});
