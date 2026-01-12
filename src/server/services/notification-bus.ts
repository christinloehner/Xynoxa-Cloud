/*
 * Copyright (C) 2025 Christin Löhner
 */

import { EventEmitter } from "node:events";

export type NotificationEvent =
  | { type: "notification"; notification: any }
  | { type: "unread"; count: number }
  | { type: "delete"; id: string }
  | { type: "read"; ids: string[] };

// Simple per-user pub/sub for server-sent events.
class NotificationBus {
  private emitter = new EventEmitter();

  subscribe(userId: string, listener: (event: NotificationEvent) => void) {
    const channel = this.channel(userId);
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  emit(userId: string, event: NotificationEvent) {
    this.emitter.emit(this.channel(userId), event);
  }

  private channel(userId: string) {
    return `notifications:${userId}`;
  }
}

export const notificationBus = new NotificationBus();
