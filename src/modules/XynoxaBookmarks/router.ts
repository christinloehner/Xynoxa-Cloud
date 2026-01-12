/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Bookmarks Module - tRPC Router
 * 
 * Vollständige Bookmark-API mit CRUD, Metadata-Fetching, Tags und Import/Export.
 * Dieser Router wird vom Module System dynamisch registriert.
 * 
 * ACHTUNG: Diese Datei ist Server-only und darf NICHT im Client-Bundle landen!
 */

import "server-only";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { INDEXES, indexDocument, updateDocument, deleteDocument } from "@/server/services/search";
import { requireRole } from "@/server/middleware/rbac";
import { upsertEmbedding, deleteEmbedding } from "@/server/services/embeddings";
import { JSDOM } from "jsdom";
import type { ModuleEntityType, ShareHtmlResult } from "@/server/module-router-registry";

// Import Schema - Modul nutzt eigene Tabelle mod_bookmarks
import { bookmarks, tags, entityTags } from "@/server/db/schema";

/**
 * Helper: HTML escapen
 */
function escapeHtml(input: string): string {
  return input.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

/**
 * Entity Type Definition für das Bookmarks Modul
 * Wird bei der Router-Registrierung mit registriert
 */
export const entityTypes: Omit<ModuleEntityType, "moduleId">[] = [
  {
    name: "bookmark",
    tableName: "mod_bookmarks",
    idColumn: "id",
    ownerIdColumn: "owner_id",
    shareFkColumn: "bookmarkId",
    embeddingFkColumn: "bookmark_id",
    entityTagFkColumn: "bookmarkId",
    searchIndexName: "bookmarks",
    displayName: "Lesezeichen",
    hasVaultField: false,
    shareable: true,
    getShareUrl: (entityId: string) => `/bookmarks/${entityId}`,
    
    /**
     * Build share HTML für öffentliche Bookmark-Shares
     * Lädt das Bookmark aus der DB und generiert HTML
     */
    buildShareHtml: async (db: unknown, entityId: string, _download: boolean) => {
      // Type assertion - db ist tatsächlich unsere Drizzle DB Instanz
      const dbInstance = db as typeof import("@/server/db").db;
      
      const [bookmark] = await dbInstance
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.id, entityId))
        .limit(1);
      
      if (!bookmark) return null;
      
      const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(bookmark.title || "Bookmark")} – Xynoxa Share</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .card { background: #1e293b; border-radius: 1rem; padding: 2rem; max-width: 600px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    h1 { color: #45e6c5; margin: 0 0 1rem; font-size: 1.5rem; }
    .url { color: #94a3b8; word-break: break-all; }
    .url a { color: #38bdf8; text-decoration: none; }
    .url a:hover { text-decoration: underline; }
    .desc { margin-top: 1rem; color: #cbd5e1; line-height: 1.6; }
    .favicon { width: 32px; height: 32px; margin-right: 0.75rem; vertical-align: middle; border-radius: 4px; }
    .header { display: flex; align-items: center; margin-bottom: 1rem; }
    .xynoxa { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${bookmark.faviconUrl ? `<img src="${escapeHtml(bookmark.faviconUrl)}" alt="" class="favicon">` : ""}
      <h1>${escapeHtml(bookmark.title || "Bookmark")}</h1>
    </div>
    <p class="url"><a href="${escapeHtml(bookmark.url)}" target="_blank" rel="noopener">${escapeHtml(bookmark.url)}</a></p>
    ${bookmark.description ? `<p class="desc">${escapeHtml(bookmark.description)}</p>` : ""}
    <p class="xynoxa">Geteilt via <strong>Xynoxa</strong></p>
  </div>
</body>
</html>`;
      
      return {
        html,
        contentType: "text/html; charset=utf-8",
        filename: `${bookmark.title || "bookmark"}.html`,
        title: bookmark.title || bookmark.url,
        ownerId: bookmark.ownerId,
        metadata: {
          title: bookmark.title,
          url: bookmark.url
        }
      };
    }
  }
];

/**
 * Bookmarks Router
 */
const bookmarksRouter = router({
  /**
   * Liste alle Bookmarks des aktuellen Users
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(bookmarks).where(eq(bookmarks.ownerId, ctx.userId!));
    
    // Fetch tags for each bookmark
    const bookmarksWithTags = await Promise.all(
      rows.map(async (bookmark) => {
        const bookmarkTags = await ctx.db
          .select({ id: tags.id, name: tags.name })
          .from(entityTags)
          .innerJoin(tags, eq(entityTags.tagId, tags.id))
          .where(and(eq(entityTags.entityType, "bookmark"), eq(entityTags.entityId, bookmark.id)));
        return { ...bookmark, tags: bookmarkTags };
      })
    );
    
    return bookmarksWithTags;
  }),

  /**
   * Hole ein einzelnes Bookmark by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [bookmark] = await ctx.db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.id, input.id), eq(bookmarks.ownerId, ctx.userId!)))
        .limit(1);
      
      if (!bookmark) return null;

      const bookmarkTags = await ctx.db
        .select({ id: tags.id, name: tags.name })
        .from(entityTags)
        .innerJoin(tags, eq(entityTags.tagId, tags.id))
        .where(and(eq(entityTags.entityType, "bookmark"), eq(entityTags.entityId, bookmark.id)));

      return { ...bookmark, tags: bookmarkTags };
    }),

  /**
   * Fetch Metadata von einer URL (Open Graph, Title, Favicon)
   */
  fetchMetadata: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      try {
        const response = await fetch(input.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Xynoxa/1.0)",
          },
        });
        const html = await response.text();

        // Simple HTML parsing for title and meta tags
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : new URL(input.url).hostname;

        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const description = descMatch ? descMatch[1].trim() : "";

        // Try to find favicon
        const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
        let faviconUrl = faviconMatch ? faviconMatch[1] : "/favicon.ico";

        // Make favicon URL absolute
        if (faviconUrl && !faviconUrl.startsWith("http")) {
          const urlObj = new URL(input.url);
          faviconUrl = new URL(faviconUrl, urlObj.origin).toString();
        }

        return { title, description, faviconUrl };
      } catch (error) {
        // Fallback to domain name
        const urlObj = new URL(input.url);
        return {
          title: urlObj.hostname,
          description: "",
          faviconUrl: `https://www.google.com/s2/favicons?domain=${urlObj.hostname}`,
        };
      }
    }),

  /**
   * Erstelle ein neues Bookmark
   */
  create: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        url: z.string().url(),
        title: z.string().min(1),
        description: z.string().optional(),
        faviconUrl: z.string().optional(),
        tags: z.array(z.string()).default([])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(bookmarks)
        .values({
          ownerId: ctx.userId!,
          url: input.url,
          title: input.title,
          description: input.description,
          faviconUrl: input.faviconUrl
        })
        .returning();

      // Create or get tags and link them
      for (const tagName of input.tags) {
        if (!tagName.trim()) continue;

        let [tag] = await ctx.db
          .select()
          .from(tags)
          .where(and(eq(tags.name, tagName), eq(tags.ownerId, ctx.userId!)))
          .limit(1);

        if (!tag) {
          [tag] = await ctx.db
            .insert(tags)
            .values({ name: tagName, ownerId: ctx.userId! })
            .returning();
        }

        await ctx.db
          .insert(entityTags)
          .values({ tagId: tag.id, entityId: row.id, entityType: "bookmark", bookmarkId: row.id });
      }

      // Index für Suche
      await indexDocument(INDEXES.BOOKMARKS, {
        id: row.id,
        ownerId: ctx.userId!,
        title: row.title,
        description: row.description,
        url: row.url,
        tags: input.tags,
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
        type: "bookmark"
      });

      // Embedding für semantische Suche
      await upsertEmbedding({
        db: ctx.db,
        ownerId: ctx.userId!,
        entity: "bookmark",
        entityId: row.id,
        title: row.title ?? row.url,
        text: `${row.description ?? ""}\n${row.url}`
      });

      return row;
    }),

  /**
   * Update ein bestehendes Bookmark
   */
  update: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(bookmarks)
        .set({
          title: input.title,
          description: input.description,
        })
        .where(and(eq(bookmarks.id, input.id), eq(bookmarks.ownerId, ctx.userId!)))
        .returning();

      if (!updated) throw new Error("Bookmark not found");

      // Update tags if provided
      if (input.tags) {
        await ctx.db
          .delete(entityTags)
          .where(and(eq(entityTags.entityType, "bookmark"), eq(entityTags.entityId, input.id)));

        for (const tagName of input.tags) {
          if (!tagName.trim()) continue;

          let [tag] = await ctx.db
            .select()
            .from(tags)
            .where(and(eq(tags.name, tagName), eq(tags.ownerId, ctx.userId!)))
            .limit(1);

          if (!tag) {
            [tag] = await ctx.db
              .insert(tags)
              .values({ name: tagName, ownerId: ctx.userId! })
              .returning();
          }

          await ctx.db
            .insert(entityTags)
            .values({
              tagId: tag.id,
              entityId: updated.id,
              entityType: "bookmark",
              bookmarkId: updated.id
            });
        }
      }

      // Update Suchindex
      await updateDocument(INDEXES.BOOKMARKS, {
        id: updated.id,
        ownerId: ctx.userId!,
        title: updated.title,
        description: updated.description,
        url: updated.url,
        tags: input.tags ?? [],
        updatedAt: new Date().toISOString(),
        type: "bookmark"
      });

      // Update Embedding
      await upsertEmbedding({
        db: ctx.db,
        ownerId: ctx.userId!,
        entity: "bookmark",
        entityId: updated.id,
        title: updated.title ?? updated.url,
        text: `${updated.description ?? ""}\n${updated.url}`
      });

      return updated;
    }),

  /**
   * Lösche ein Bookmark
   */
  delete: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(bookmarks)
        .where(and(eq(bookmarks.id, input.id), eq(bookmarks.ownerId, ctx.userId!)));
      
      await deleteDocument(INDEXES.BOOKMARKS, input.id);
      await deleteEmbedding({ db: ctx.db, entity: "bookmark", entityId: input.id });
      
      return { success: true };
    }),

  /**
   * Lösche mehrere Bookmarks auf einmal
   */
  deleteMany: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.ownerId, ctx.userId!), inArray(bookmarks.id, input.ids)));

      if (rows.length === 0) return { success: true, deleted: 0 };

      await ctx.db
        .delete(bookmarks)
        .where(and(eq(bookmarks.ownerId, ctx.userId!), inArray(bookmarks.id, input.ids)));

      for (const row of rows) {
        await deleteDocument(INDEXES.BOOKMARKS, row.id);
        await deleteEmbedding({ db: ctx.db, entity: "bookmark", entityId: row.id });
      }

      return { success: true, deleted: rows.length };
    }),

  /**
   * Import Bookmarks aus Browser HTML Export
   */
  importHtml: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ html: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const { html } = input;
      const dom = new JSDOM(html, { contentType: "text/html" });
      const doc = dom.window.document;

      type Parsed = { url: string; title: string; tags: string[] };
      const parsed: Parsed[] = [];

      const walk = (dl: Element, stack: string[]) => {
        for (const child of Array.from(dl.children)) {
          if (child.tagName === "DT") {
            const h3 = child.querySelector("h3");
            if (h3) {
              const folder = h3.textContent?.trim();
              const nestedDl = child.querySelector("dl") || child.nextElementSibling;
              if (folder && nestedDl && nestedDl.tagName === "DL") {
                walk(nestedDl, [...stack, folder]);
              }
            }
            const anchor = child.querySelector("a");
            if (anchor && anchor.getAttribute("href")) {
              const url = anchor.getAttribute("href")!;
              const title = (anchor.textContent || url).trim();
              parsed.push({ url, title, tags: stack });
            }
          }
          if (child.tagName === "DL") {
            walk(child, stack);
          }
        }
      };

      const rootDL = doc.querySelector("dl") || doc.body;
      walk(rootDL, []);

      let imported = 0;
      let skipped = 0;

      for (const bm of parsed) {
        try {
          const [existing] = await ctx.db
            .select()
            .from(bookmarks)
            .where(and(eq(bookmarks.ownerId, ctx.userId!), eq(bookmarks.url, bm.url)))
            .limit(1);
          
          if (existing) {
            skipped++;
            continue;
          }

          const [row] = await ctx.db
            .insert(bookmarks)
            .values({
              ownerId: ctx.userId!,
              url: bm.url,
              title: bm.title || bm.url,
              description: null,
              faviconUrl: undefined
            })
            .returning();

          // Tags erstellen/verknüpfen
          for (const tagName of bm.tags) {
            const t = tagName.trim();
            if (!t) continue;
            
            let [tag] = await ctx.db
              .select()
              .from(tags)
              .where(and(eq(tags.name, t), eq(tags.ownerId, ctx.userId!)))
              .limit(1);
            
            if (!tag) {
              [tag] = await ctx.db.insert(tags).values({ name: t, ownerId: ctx.userId! }).returning();
            }
            
            await ctx.db
              .insert(entityTags)
              .values({ tagId: tag.id, entityId: row.id, entityType: "bookmark", bookmarkId: row.id });
          }

          // Suchindex aktualisieren
          await indexDocument(INDEXES.BOOKMARKS, {
            id: row.id,
            ownerId: ctx.userId!,
            title: row.title,
            description: row.description,
            url: row.url,
            tags: bm.tags,
            createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
            type: "bookmark"
          });

          // Embedding erstellen
          await upsertEmbedding({
            db: ctx.db,
            ownerId: ctx.userId!,
            entity: "bookmark",
            entityId: row.id,
            title: row.title ?? row.url,
            text: row.url
          });

          imported++;
        } catch {
          skipped++;
        }
      }

      return { imported, skipped, total: parsed.length };
    }),

  /**
   * Anzahl der Bookmarks für Dashboard-Stats
   */
  count: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(bookmarks).where(eq(bookmarks.ownerId, ctx.userId!));
    return { count: rows.length };
  })
});

export default bookmarksRouter;
