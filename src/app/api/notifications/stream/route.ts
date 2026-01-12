/*
 * Copyright (C) 2025 Christin Löhner
 */

import { getSession } from "@/server/auth/session";
import { unreadCount } from "@/server/services/notifications";
import { notificationBus } from "@/server/services/notification-bus";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.userId;
  const initialUnread = await unreadCount(userId);
  const encoder = new TextEncoder();

  let heartbeat: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (err) {
          // Stream already closed - cleanup will be handled by cancel()
        }
      };

      send({ type: "unread", count: initialUnread });
      send({ type: "ready", ts: Date.now() });

      const listener = (event: any) => send(event);
      unsubscribe = notificationBus.subscribe(userId, listener);
      heartbeat = setInterval(() => send({ type: "ping", ts: Date.now() }), 25000);

      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
