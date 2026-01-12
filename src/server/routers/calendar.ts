/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { calendarEvents, tasks, userProfiles, users } from "@/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { INDEXES, indexDocument, updateDocument, deleteDocument } from "@/server/services/search";
import { requireRole } from "@/server/middleware/rbac";
import { upsertEmbedding, deleteEmbedding } from "@/server/services/embeddings";
import { calendarProviderAccounts, calendarGoogleCalendars } from "@/server/db/schema";
import { buildGoogleAuthUrl, exchangeCode, getGoogleConfig, syncGoogleCalendarList, stopWatch } from "@/server/services/google-calendar";
import { calendarQueue } from "@/server/jobs/queue";
import { randomUUID } from "crypto";
import { getTableColumns } from "drizzle-orm";

type ParsedEvent = {
  uid?: string;
  summary?: string;
  description?: string;
  dtstart?: Date;
  dtend?: Date;
  recurrence?: string;
};

type ParsedTodo = {
  uid?: string;
  summary?: string;
  description?: string;
  due?: Date;
  status?: string;
};

function unfoldLines(content: string) {
  const lines = content.split(/\r?\n/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      unfolded[unfolded.length - 1] = (unfolded[unfolded.length - 1] || "") + line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseICalDate(value: string): Date | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (/^\d{8}$/.test(cleaned)) {
    // date only
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (match) {
    const [, y, m, d, hh, mm, ss, z] = match;
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}${z ? "Z" : ""}`;
    return new Date(iso);
  }
  // Fallback
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseICS(content: string) {
  const events: ParsedEvent[] = [];
  const todos: ParsedTodo[] = [];
  let current: ParsedEvent | ParsedTodo | null = null;
  let currentType: "VEVENT" | "VTODO" | null = null;

  for (const rawLine of unfoldLines(content)) {
    if (rawLine.startsWith("BEGIN:VEVENT")) {
      current = {};
      currentType = "VEVENT";
      continue;
    }
    if (rawLine.startsWith("BEGIN:VTODO")) {
      current = {};
      currentType = "VTODO";
      continue;
    }
    if (rawLine.startsWith("END:VEVENT")) {
      if (current && currentType === "VEVENT") events.push(current as ParsedEvent);
      current = null;
      currentType = null;
      continue;
    }
    if (rawLine.startsWith("END:VTODO")) {
      if (current && currentType === "VTODO") todos.push(current as ParsedTodo);
      current = null;
      currentType = null;
      continue;
    }
    if (!current) continue;

    const [prop, ...rest] = rawLine.split(":");
    const value = rest.join(":");
    const [name] = prop.split(";");

    switch (name) {
      case "SUMMARY":
        (current as any).summary = value;
        break;
      case "DESCRIPTION":
        (current as any).description = value;
        break;
      case "UID":
        (current as any).uid = value;
        break;
      case "DTSTART":
        if (currentType === "VEVENT") (current as ParsedEvent).dtstart = parseICalDate(value);
        break;
      case "DTEND":
        if (currentType === "VEVENT") (current as ParsedEvent).dtend = parseICalDate(value);
        break;
      case "RRULE":
        if (currentType === "VEVENT") (current as ParsedEvent).recurrence = value;
        break;
      case "DUE":
        if (currentType === "VTODO") (current as ParsedTodo).due = parseICalDate(value);
        break;
      case "STATUS":
        if (currentType === "VTODO") (current as ParsedTodo).status = value?.toLowerCase?.();
        break;
      default:
        break;
    }
  }

  return { events, todos };
}

export const calendarRouter = router({
  integrationStatus: protectedProcedure.query(async ({ ctx }) => {
    const [acc] = await ctx.db.select().from(calendarProviderAccounts).where(eq(calendarProviderAccounts.userId, ctx.userId!)).limit(1);
    if (!acc) return { connected: false };
    const calendars = await ctx.db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, ctx.userId!));
    return {
      provider: acc.provider,
      connected: true,
      defaultCalendarId: acc.defaultCalendarId ?? acc.calendarId,
      channelExpiresAt: calendars.find(c => c.channelExpiresAt)?.channelExpiresAt,
      calendars
    };
  }),

  connectGoogleUrl: protectedProcedure.query(async ({ ctx }) => {
    const state = randomUUID();
    ctx.session.googleState = state;
    await ctx.session.save();
    const cfg = await getGoogleConfig();
    const url = buildGoogleAuthUrl(cfg, state);
    return { url };
  }),

  disconnectGoogle: protectedProcedure.mutation(async ({ ctx }) => {
    // Stop all watches
    const cals = await ctx.db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, ctx.userId!));
    for (const cal of cals) {
      if (cal.channelId) await stopWatch(ctx.db, ctx.userId!, cal.calendarId);
    }
    await ctx.db.delete(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, ctx.userId!));
    await ctx.db.delete(calendarProviderAccounts).where(eq(calendarProviderAccounts.userId, ctx.userId!));
    return { success: true };
  }),

  // Manual sync trigger
  syncGoogle: protectedProcedure.mutation(async ({ ctx }) => {
    await calendarQueue().add("google-sync", { kind: "google-sync", userId: ctx.userId!, reason: "manual" });
    return { queued: true };
  }),

  googleCalendars: protectedProcedure.query(async ({ ctx }) => {
    const list = await ctx.db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, ctx.userId!));
    return list;
  }),

  refreshGoogleCalendars: protectedProcedure.mutation(async ({ ctx }) => {
    const refreshed = await syncGoogleCalendarList(ctx.db, ctx.userId!);
    return refreshed;
  }),

  saveGoogleCalendars: protectedProcedure.input(
    z.object({
      calendars: z.array(z.object({
        calendarId: z.string(),
        isSelected: z.boolean(),
        color: z.string().optional(),
        isDefault: z.boolean().optional()
      }))
    })
  ).mutation(async ({ ctx, input }) => {
    const payloadIds = input.calendars.map(c => c.calendarId);
    const existing = await ctx.db.select().from(calendarGoogleCalendars)
      .where(and(eq(calendarGoogleCalendars.userId, ctx.userId!), inArray(calendarGoogleCalendars.calendarId, payloadIds)));

    let defaultId = input.calendars.find(c => c.isDefault)?.calendarId;
    if (!defaultId) {
      const firstSelected = input.calendars.find(c => c.isSelected);
      defaultId = firstSelected?.calendarId;
    }

    for (const c of input.calendars) {
      const prev = existing.find(e => e.calendarId === c.calendarId);
      const isSelected = c.isSelected || (defaultId === c.calendarId);
      await ctx.db.insert(calendarGoogleCalendars).values({
        userId: ctx.userId!,
        calendarId: c.calendarId,
        isSelected,
        isDefault: defaultId === c.calendarId,
        color: c.color ?? prev?.color ?? "#7A4CE0",
        summary: prev?.summary ?? c.calendarId,
        timezone: prev?.timezone ?? null,
        isPrimary: prev?.isPrimary ?? false,
        syncToken: prev?.syncToken ?? null,
        channelId: prev?.channelId ?? null,
        resourceId: prev?.resourceId ?? null,
        channelExpiresAt: prev?.channelExpiresAt ?? null,
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: [calendarGoogleCalendars.userId, calendarGoogleCalendars.calendarId],
        set: {
          isSelected,
          isDefault: defaultId === c.calendarId,
          color: c.color ?? prev?.color ?? "#7A4CE0",
          updatedAt: new Date()
        }
      });

      // stop watch if deselected
      if (prev?.isSelected && !isSelected && prev.channelId) {
        await stopWatch(ctx.db, ctx.userId!, c.calendarId);
      }
    }

    await ctx.db.update(calendarProviderAccounts).set({ defaultCalendarId: defaultId ?? null, updatedAt: new Date() })
      .where(eq(calendarProviderAccounts.userId, ctx.userId!));

    return ctx.db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, ctx.userId!));
  }),

  listEvents: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        ...getTableColumns(calendarEvents),
        calendarColor: calendarGoogleCalendars.color,
        calendarName: calendarGoogleCalendars.summary
      })
      .from(calendarEvents)
      .leftJoin(
        calendarGoogleCalendars,
        and(
          eq(calendarEvents.externalCalendarId, calendarGoogleCalendars.calendarId),
          eq(calendarGoogleCalendars.userId, ctx.userId!)
        )
      )
      .where(eq(calendarEvents.ownerId, ctx.userId!))
      .orderBy(calendarEvents.startsAt)
  ),

  createEvent: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        location: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        recurrence: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [acc] = await ctx.db.select().from(calendarProviderAccounts).where(eq(calendarProviderAccounts.userId, ctx.userId!)).limit(1);
      let targetCalendarId: string | null = null;
      if (acc) {
        const cals = await ctx.db.select().from(calendarGoogleCalendars).where(eq(calendarGoogleCalendars.userId, ctx.userId!));
        const selected =
          cals.find((c) => c.isDefault && c.isSelected) ??
          cals.find((c) => c.isPrimary && c.isSelected) ??
          cals.find((c) => c.isSelected);
        targetCalendarId = selected?.calendarId ?? acc.defaultCalendarId ?? acc.calendarId ?? "primary";
      }

      const [row] = await ctx.db
        .insert(calendarEvents)
        .values({
          ownerId: ctx.userId!,
          title: input.title,
          description: input.description,
          location: input.location,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          recurrence: input.recurrence,
          source: "app",
          externalCalendarId: targetCalendarId ?? null
        })
        .returning();

      await indexDocument(INDEXES.EVENTS, {
        id: row.id,
        ownerId: ctx.userId!,
        title: row.title,
        content: row.recurrence,
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
        type: "event"
      });
      await upsertEmbedding({
        db: ctx.db,
        ownerId: ctx.userId!,
        entity: "event",
        entityId: row.id,
        title: row.title,
        text: row.recurrence ?? ""
      });
      // Push to Google if verbunden
      if (acc) {
        await calendarQueue().add("google-push-event", { kind: "google-push-event", userId: ctx.userId!, eventId: row.id, action: "create" });
      }
      return row;
    }),

  updateEvent: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        recurrence: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(calendarEvents)
        .set({
          title: input.title,
          description: input.description,
          location: input.location,
          startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
          recurrence: input.recurrence
        })
        .where(and(eq(calendarEvents.id, input.id), eq(calendarEvents.ownerId, ctx.userId!)))
        .returning();
      if (updated) {
        await updateDocument(INDEXES.EVENTS, {
          id: updated.id,
          ownerId: ctx.userId!,
          title: updated.title,
          content: updated.recurrence,
          updatedAt: new Date().toISOString(),
          type: "event"
        });
        await upsertEmbedding({
          db: ctx.db,
          ownerId: ctx.userId!,
          entity: "event",
          entityId: updated.id,
          title: updated.title,
          text: updated.recurrence ?? ""
        });
        const [acc] = await ctx.db.select().from(calendarProviderAccounts).where(eq(calendarProviderAccounts.userId, ctx.userId!)).limit(1);
        if (acc) {
          await calendarQueue().add("google-push-event", { kind: "google-push-event", userId: ctx.userId!, eventId: updated.id, action: "update" });
        }
      }
      return updated;
    }),

  deleteEvent: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.id, input.id), eq(calendarEvents.ownerId, ctx.userId!)))
        .limit(1);
      await ctx.db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.id, input.id), eq(calendarEvents.ownerId, ctx.userId!)));
      await deleteDocument(INDEXES.EVENTS, input.id, ctx.userId);
      await deleteEmbedding({ db: ctx.db, entity: "event", entityId: input.id, ownerId: ctx.userId });
      const [acc] = await ctx.db.select().from(calendarProviderAccounts).where(eq(calendarProviderAccounts.userId, ctx.userId!)).limit(1);
      if (acc && existing) {
        await calendarQueue().add("google-push-event", {
          kind: "google-push-event",
          userId: ctx.userId!,
          eventId: input.id,
          action: "delete",
          snapshot: {
            externalId: existing.externalId,
            externalCalendarId: existing.externalCalendarId,
            title: existing.title,
            description: existing.description,
            location: existing.location,
            startsAt: existing.startsAt?.toISOString?.() ?? null,
            endsAt: existing.endsAt?.toISOString?.() ?? null
          }
        });
      }
      return { success: true };
    }),

  exportICS: protectedProcedure.query(async ({ ctx }) => {
    const events = await ctx.db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.ownerId, ctx.userId!));

    // Generate ICS format
    const icsLines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Xynoxa//Calendar//EN",
      "CALSCALE:GREGORIAN",
    ];

    for (const event of events) {
      const dtstart = event.startsAt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const dtend = event.endsAt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      const eventLines = [
        "BEGIN:VEVENT",
        `UID:${event.id}@xynoxa.com`,
        `DTSTAMP:${dtstart}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${event.title}`
      ];
      if (event.recurrence) {
        eventLines.push(`RRULE:${event.recurrence}`);
      }
      eventLines.push("END:VEVENT");
      icsLines.push(...eventLines);
    }

    icsLines.push("END:VCALENDAR");
    return icsLines.join("\r\n");
  }),

  listTasks: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        task: tasks,
        assigneeName: userProfiles.displayName,
        assigneeEmail: users.email
      })
      .from(tasks)
      .leftJoin(userProfiles, eq(tasks.assigneeId, userProfiles.userId))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(tasks.ownerId, ctx.userId!))
      .orderBy(tasks.createdAt);

    return rows.map((row) => ({
      ...row.task,
      assigneeName: row.assigneeName ?? null,
      assigneeEmail: row.assigneeEmail ?? null
    }));
  }),

  createTask: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: z.string().optional(),
        dueAt: z.string().optional(),
        assigneeId: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(tasks)
        .values({
          ownerId: ctx.userId!,
          title: input.title,
          description: input.description,
          status: input.status ?? "todo",
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          assigneeId: input.assigneeId,
          source: "app"
        })
        .returning();

      await indexDocument(INDEXES.TASKS, {
        id: row.id,
        ownerId: ctx.userId!,
        title: row.title,
        content: row.status,
        createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
        type: "task"
      });
      await upsertEmbedding({
        db: ctx.db,
        ownerId: ctx.userId!,
        entity: "task",
        entityId: row.id,
        title: row.title,
        text: `${row.status ?? ""} ${input.description ?? ""}`
      });
      return row;
    }),

  updateTask: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        status: z.string().optional(),
        dueAt: z.string().optional(),
        assigneeId: z.string().optional(),
        description: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(tasks)
        .set({
          title: input.title,
          status: input.status,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          assigneeId: input.assigneeId,
          description: input.description
        })
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.userId!)))
        .returning();
      if (updated) {
        await updateDocument(INDEXES.TASKS, {
          id: updated.id,
          ownerId: ctx.userId!,
          title: updated.title,
          content: updated.status,
          updatedAt: new Date().toISOString(),
          type: "task"
        });
        await upsertEmbedding({
          db: ctx.db,
          ownerId: ctx.userId!,
          entity: "task",
          entityId: updated.id,
          title: updated.title,
          text: `${updated.status ?? ""} ${updated.description ?? ""}`
        });
      }
      return updated;
    }),

  deleteTask: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.userId!)));
      await deleteDocument(INDEXES.TASKS, input.id, ctx.userId);
      await deleteEmbedding({ db: ctx.db, entity: "task", entityId: input.id, ownerId: ctx.userId });
      return { success: true };
    }),

  toggleTaskStatus: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.userId!)))
        .limit(1);

      if (!task) throw new Error("Task not found");

      const newStatus = task.status === "done" ? "todo" : "done";
      const [updated] = await ctx.db
        .update(tasks)
        .set({ status: newStatus })
        .where(eq(tasks.id, input.id))
        .returning();

      if (updated) {
        await updateDocument(INDEXES.TASKS, {
          id: updated.id,
          ownerId: ctx.userId!,
          title: updated.title,
          content: updated.status,
          updatedAt: new Date().toISOString(),
          type: "task"
        });
      }

      return updated;
    }),

  importICS: protectedProcedure
    .use(requireRole(["owner", "admin", "member"]))
    .input(z.object({ ics: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const { events, todos } = parseICS(input.ics);

      let importedEvents = 0;
      let importedTasks = 0;

      for (const ev of events) {
        if (!ev.dtstart || !ev.dtend || !ev.summary) continue;

        const existing = ev.uid
          ? await ctx.db
              .select()
              .from(calendarEvents)
              .where(and(eq(calendarEvents.ownerId, ctx.userId!), eq(calendarEvents.icalUid, ev.uid)))
              .limit(1)
          : [];

        if (existing[0]) {
          const [updated] = await ctx.db
            .update(calendarEvents)
            .set({
              title: ev.summary,
              startsAt: ev.dtstart,
              endsAt: ev.dtend,
              recurrence: ev.recurrence,
              source: "ics"
            })
            .where(eq(calendarEvents.id, existing[0].id))
            .returning();

          if (updated) {
            await updateDocument(INDEXES.EVENTS, {
              id: updated.id,
              ownerId: ctx.userId!,
              title: updated.title,
              content: updated.recurrence,
              updatedAt: new Date().toISOString(),
              type: "event"
            });
            await upsertEmbedding({
              db: ctx.db,
              ownerId: ctx.userId!,
              entity: "event",
              entityId: updated.id,
              title: updated.title,
              text: updated.recurrence ?? ""
            });
          }
        } else {
          const [created] = await ctx.db.insert(calendarEvents).values({
            ownerId: ctx.userId!,
            title: ev.summary,
            startsAt: ev.dtstart,
            endsAt: ev.dtend,
            recurrence: ev.recurrence,
            icalUid: ev.uid,
            source: "ics"
          }).returning();
          if (created) {
            await indexDocument(INDEXES.EVENTS, {
              id: created.id,
              ownerId: ctx.userId!,
              title: created.title,
              content: created.recurrence,
              createdAt: created.createdAt?.toISOString?.() ?? new Date().toISOString(),
              type: "event"
            });
            await upsertEmbedding({
              db: ctx.db,
              ownerId: ctx.userId!,
              entity: "event",
              entityId: created.id,
              title: created.title,
              text: created.recurrence ?? ""
            });
          }
          importedEvents += 1;
        }
      }

      for (const todo of todos) {
        if (!todo.summary) continue;
        const status = todo.status === "completed" ? "done" : "todo";

        const existing = todo.uid
          ? await ctx.db
              .select()
              .from(tasks)
              .where(and(eq(tasks.ownerId, ctx.userId!), eq(tasks.icalUid, todo.uid)))
              .limit(1)
          : [];

        if (existing[0]) {
          const [updated] = await ctx.db
            .update(tasks)
            .set({
              title: todo.summary,
              dueAt: todo.due,
              status,
              description: todo.description,
              source: "ics"
            })
            .where(eq(tasks.id, existing[0].id))
            .returning();

          if (updated) {
            await updateDocument(INDEXES.TASKS, {
              id: updated.id,
              ownerId: ctx.userId!,
              title: updated.title,
              content: updated.status,
              updatedAt: new Date().toISOString(),
              type: "task"
            });
            await upsertEmbedding({
              db: ctx.db,
              ownerId: ctx.userId!,
              entity: "task",
              entityId: updated.id,
              title: updated.title,
              text: `${updated.status ?? ""} ${updated.description ?? ""}`
            });
          }
        } else {
          const [created] = await ctx.db.insert(tasks).values({
            ownerId: ctx.userId!,
            title: todo.summary,
            description: todo.description,
            dueAt: todo.due,
            status,
            icalUid: todo.uid,
            source: "ics"
          }).returning();
          if (created) {
            await indexDocument(INDEXES.TASKS, {
              id: created.id,
              ownerId: ctx.userId!,
              title: created.title,
              content: created.status,
              createdAt: created.createdAt?.toISOString?.() ?? new Date().toISOString(),
              type: "task"
            });
            await upsertEmbedding({
              db: ctx.db,
              ownerId: ctx.userId!,
              entity: "task",
              entityId: created.id,
              title: created.title,
              text: `${created.status ?? ""} ${created.description ?? ""}`
            });
          }
          importedTasks += 1;
        }
      }

      return { importedEvents, importedTasks };
    })
});
