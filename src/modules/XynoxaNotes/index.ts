/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Xynoxa Notes Modul
 * 
 * Vollständige Notizverwaltung mit Tags, Vault-Unterstützung und Suche.
 */

import { XynoxaModule } from "@/types/module";
import { NotebookText } from "lucide-react";
import NotesComponent from "./NotesComponent";

const notesModule: XynoxaModule = {
  metadata: {
    id: "notes",
    name: "Notes",
    description: "Notizen mit Rich-Text, Tags, Vault-Mode und Export",
    version: "1.0.0",
    author: "Xynoxa Team",
    icon: NotebookText
  },

  navigation: [
    {
      id: "notes-nav",
      label: "Notes",
      href: "/notes",
      icon: NotebookText
    }
  ],

  routes: [
    {
      path: "/notes",
      component: NotesComponent,
      requiresAuth: true
    }
  ],

  getSearchResultUrl: (entityId: string, entityType?: string) => {
    if (entityType === "note") {
      return `/notes?open=${entityId}`;
    }
    return "";
  },

  onLoad: async () => {
    console.log("[NotesModule] Modul wird geladen...");

    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { default: notesRouter, entityTypes } = await import("./router");

      if (!moduleRouterRegistry.has("notes")) {
        moduleRouterRegistry.register("notes", notesRouter, "notes");
      }

      for (const et of entityTypes) {
        if (!moduleRouterRegistry.getEntityType(et.name)) {
          moduleRouterRegistry.registerEntityType({
            ...et,
            moduleId: "notes"
          });
        }
      }

      console.log("[NotesModule] Entity-Typen registriert");
    } catch (error) {
      console.log("[NotesModule] Entity-Typ Registrierung übersprungen (Client-Seite)");
    }

    console.log("[NotesModule] Modul wurde geladen");
  },

  onUnload: async () => {
    console.log("[NotesModule] Modul wird entladen...");

    try {
      const { moduleRouterRegistry } = await import("@/server/module-router-registry");
      const { entityTypes } = await import("./router");

      for (const et of entityTypes) {
        moduleRouterRegistry.unregisterEntityType(et.name);
      }
      moduleRouterRegistry.unregister("notes");

      console.log("[NotesModule] Entity-Typen deregistriert");
    } catch (error) {
      // Client-seitig ok
    }

    console.log("[NotesModule] Modul wurde entladen");
  },

  onInstall: async () => {
    console.log("[NotesModule] Installation gestartet (keine Migration notwendig)");
    return [];
  },

  onUninstall: async () => {
    console.log("[NotesModule] Deinstallation abgeschlossen");
    return [];
  },

  onReindex: async (ownerId, context) => {
    console.log(`[NotesModule] Indexing notes for user ${ownerId}`);

    try {
      const { notes: notesTable, entityTags: entityTagsTable, tags: tagsTable } = await import("@/server/db/schema");
      const { eq, and, inArray } = await import("drizzle-orm");
      const { INDEXES } = await import("@/server/services/search");
      const { markdownToTxt } = await import("@/server/services/markdown");

      const notes = await context.db.select().from(notesTable).where(eq(notesTable.ownerId, ownerId));
      const noteIds = notes.map((n: any) => n.id);

      const tagsByNote = new Map<string, string[]>();
      if (noteIds.length > 0) {
        const tagRows = await context.db
          .select({
            noteId: entityTagsTable.entityId,
            name: tagsTable.name
          })
          .from(entityTagsTable)
          .innerJoin(tagsTable, eq(entityTagsTable.tagId, tagsTable.id))
          .where(and(eq(entityTagsTable.entityType, "note"), inArray(entityTagsTable.entityId, noteIds)));

        for (const row of tagRows) {
          const list = tagsByNote.get(row.noteId) ?? [];
          list.push(row.name);
          tagsByNote.set(row.noteId, list);
        }
      }

      let indexed = 0;

      for (const note of notes) {
        if (note.isVault) continue;
        const tagNames = tagsByNote.get(note.id) ?? [];

        await context.indexDocument(INDEXES.NOTES, {
          id: note.id,
          ownerId: note.ownerId,
          title: note.title,
          content: note.content,
          tags: tagNames,
          updatedAt: note.updatedAt.toISOString(),
          type: "note"
        });

        await context.upsertEmbedding({
          ownerId: note.ownerId,
          entity: "note",
          entityId: note.id,
          title: note.title,
          text: markdownToTxt(note.content ?? "")
        });

        indexed += 1;
      }

      console.log(`[NotesModule] Successfully indexed ${indexed} notes`);
      return indexed;
    } catch (error) {
      console.error("[NotesModule] Failed to index notes:", error);
      return 0;
    }
  }
};

export default notesModule;
