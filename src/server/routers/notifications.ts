/*
 * Copyright (C) 2025 Christin Löhner
 */

import { protectedProcedure, router } from "@/server/trpc";
import { z } from "zod";
import {
  createNotification,
  deleteNotifications,
  deleteAllNotifications,
  listNotifications,
  markNotificationsRead,
  unreadCount
} from "@/server/services/notifications";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
        includeRead: z.boolean().optional()
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const cursorDate = input?.cursor ? new Date(input.cursor) : undefined;
      return listNotifications(ctx.userId!, { limit: input?.limit, cursor: cursorDate, includeRead: input?.includeRead });
    }),
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return { count: await unreadCount(ctx.userId!) };
  }),
  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const count = await markNotificationsRead(ctx.userId!, input?.ids);
      return { unread: count };
    }),
  delete: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      return deleteNotifications(ctx.userId!, input.ids);
    }),
  deleteAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      return deleteAllNotifications(ctx.userId!);
    }),
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        body: z.string().optional(),
        href: z.string().optional(),
        level: z.enum(["info", "success", "warning", "error"]).optional(),
        meta: z.any().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      // helper to allow internal UI to trigger notifications (e.g. tests/demo)
      return createNotification({ userId: ctx.userId!, ...input });
    })
});
