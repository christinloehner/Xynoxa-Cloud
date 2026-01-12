/*
 * Copyright (C) 2025 Christin Löhner
 */

import "dotenv/config";
import { hash } from "argon2";
import { db } from "@/server/db";
import {
  users,
  notes,
  bookmarks,
  calendarEvents,
  tasks,
  tags,
  entityTags
} from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";

async function seed() {
  const email = process.env.SEED_EMAIL || "demo@xynoxa.local";
  const password = process.env.SEED_PASSWORD || "Demo1234!";

  // upsert user
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const userId = existing?.id;

  const targetUserId =
    userId ||
    (await db
      .insert(users)
      .values({
        email,
        passwordHash: await hash(password),
        role: "owner"
      })
      .returning({ id: users.id }))[0].id;

  if (!existing) {
    await db
      .insert(tags)
      .values([
        { name: "welcome" },
        { name: "planning" },
        { name: "docs" }
      ])
      .onConflictDoNothing();
  }

  const noteRows = await db
    .insert(notes)
    .values([
      {
        ownerId: targetUserId,
        title: "Willkommen bei Xynoxa",
        content: JSON.stringify({
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Willkommen" }] },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Dein persönlicher Data Lake. Dateien, Notizen, Bookmarks und Kalender an einem Ort."
                }
              ]
            }
          ]
        })
      },
      {
        ownerId: targetUserId,
        title: "Projektideen 2025",
        content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Skizziere neue Ideen." }] }] })
      }
    ])
    .returning({ id: notes.id });

  const bookmarkRows = await db
    .insert(bookmarks)
    .values([
      {
        ownerId: targetUserId,
        url: "https://nextjs.org",
        title: "Next.js",
        description: "The React framework"
      },
      {
        ownerId: targetUserId,
        url: "https://meilisearch.com",
        title: "Meilisearch",
        description: "Lightning-fast search"
      }
    ])
    .returning({ id: bookmarks.id });

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const eventRows = await db
    .insert(calendarEvents)
    .values([
      {
        ownerId: targetUserId,
        title: "Kickoff",
        description: "Xynoxa Onboarding",
        startsAt: now,
        endsAt: new Date(now.getTime() + 60 * 60 * 1000)
      }
    ])
    .returning({ id: calendarEvents.id });

  const taskRows = await db
    .insert(tasks)
    .values([
      {
        ownerId: targetUserId,
        title: "Erste Datei hochladen",
        description: "Teste den Uploader",
        status: "todo",
        priority: "medium"
      },
      {
        ownerId: targetUserId,
        title: "Note erstellen",
        description: "Dokumentiere deine Ziele",
        status: "done",
        priority: "high"
      }
    ])
    .returning({ id: tasks.id });

  // Tagging (best-effort)
  const allIds = [
    ...noteRows.map((n) => ({ entity: "note", id: n.id })),
    ...bookmarkRows.map((b) => ({ entity: "bookmark", id: b.id })),
    ...taskRows.map((t) => ({ entity: "task", id: t.id }))
  ];

  const existingTags = await db.select().from(tags).where(inArray(tags.name, ["welcome", "planning", "docs"]));
  const tagMap = new Map(existingTags.map((t) => [t.name, t.id]));
  const link = (entity: string, id: string, tag: string) =>
    tagMap.has(tag)
      ? db
          .insert(entityTags)
          .values({ tagId: tagMap.get(tag)!, entityType: entity, entityId: id })
          .onConflictDoNothing()
      : Promise.resolve();

  await Promise.all([
    link("note", noteRows[0].id, "welcome"),
    link("note", noteRows[1].id, "planning"),
    link("bookmark", bookmarkRows[0].id, "docs"),
    link("task", taskRows[0].id, "welcome")
  ]);

  console.warn(`Seed completed. Login: ${email} / ${password}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed", err);
    process.exit(1);
  });
