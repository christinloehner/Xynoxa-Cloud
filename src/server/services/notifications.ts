/*
 * Copyright (C) 2025 Christin Löhner
 */

import { and, desc, eq, isNull, lt, count, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { notificationBus } from "./notification-bus";

export type NotificationLevel = "info" | "success" | "warning" | "error";

type NotificationRow = typeof notifications.$inferSelect;

export type NotificationDTO = Omit<NotificationRow, "userId" | "deletedAt" | "meta" | "level"> & {
  level: NotificationLevel;
  meta?: any;
};

const mapToDto = (row: NotificationRow): NotificationDTO => ({
  id: row.id,
  title: row.title,
  body: row.body,
  href: row.href,
  meta: row.meta ?? undefined,
  level: (row.level as NotificationLevel) ?? "info",
  readAt: row.readAt,
  createdAt: row.createdAt
});

export async function createNotification(input: {
  userId: string;
  title: string;
  body?: string;
  href?: string;
  meta?: any;
  level?: NotificationLevel;
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      title: input.title,
      body: input.body,
      href: input.href,
      meta: input.meta,
      level: input.level ?? "info"
    })
    .returning();

  if (row) {
    const count = await unreadCount(input.userId);
    notificationBus.emit(input.userId, { type: "notification", notification: mapToDto(row) });
    notificationBus.emit(input.userId, { type: "unread", count });
  }

  return mapToDto(row);
}

export async function listNotifications(userId: string, opts: { limit?: number; cursor?: Date; includeRead?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.deletedAt),
        opts.includeRead ? undefined : isNull(notifications.readAt),
        opts.cursor ? lt(notifications.createdAt, opts.cursor) : undefined
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);

  const items = rows.slice(0, limit).map(mapToDto);
  const nextCursor = rows.length > limit ? rows[limit].createdAt : null;
  const unread = await unreadCount(userId);

  return { items, nextCursor, unreadCount: unread };
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.deletedAt)));
  return Number(row?.count ?? 0);
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
        ids?.length ? inArray(notifications.id, ids) : undefined
      )
    );
  const count = await unreadCount(userId);
  if (ids?.length) notificationBus.emit(userId, { type: "read", ids });
  notificationBus.emit(userId, { type: "unread", count });
  return count;
}

export async function deleteNotifications(userId: string, ids: string[]) {
  if (!ids.length) return { deleted: 0, unread: await unreadCount(userId) };
  
  const result = await db
    .update(notifications)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
        isNull(notifications.deletedAt) // Nur nicht-gelöschte Notifications updaten
      )
    )
    .returning({ id: notifications.id });

  const deletedIds = result.map(r => r.id);
  const unread = await unreadCount(userId);
  
  // Sende Events für tatsächlich gelöschte Notifications
  deletedIds.forEach((id) => notificationBus.emit(userId, { type: "delete", id }));
  notificationBus.emit(userId, { type: "unread", count: unread });
  
  return { deleted: deletedIds.length, unread };
}

export async function deleteAllNotifications(userId: string) {
  const result = await db
    .update(notifications)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.deletedAt)
      )
    )
    .returning({ id: notifications.id });

  const deletedIds = result.map(r => r.id);
  
  // Sende Events für tatsächlich gelöschte Notifications
  deletedIds.forEach((id) => notificationBus.emit(userId, { type: "delete", id }));
  notificationBus.emit(userId, { type: "unread", count: 0 });
  
  return { deleted: deletedIds.length, unread: 0 };
}
