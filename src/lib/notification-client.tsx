/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect, useRef } from "react";
import { trpc } from "./trpc-client";

type SSEPayload =
  | { type: "notification"; notification: any }
  | { type: "unread"; count: number }
  | { type: "delete"; id: string }
  | { type: "read"; ids: string[] }
  | { type: "ping"; ts: number }
  | { type: "ready"; ts: number };

// Sound Throttling: Maximal 1 Sound pro 3 Sekunden
let lastSoundTime = 0;
const SOUND_THROTTLE_MS = 3000;

const playChime = () => {
  const now = Date.now();
  if (now - lastSoundTime < SOUND_THROTTLE_MS) {
    // Throttled - zu früh für nächsten Sound
    return;
  }
  lastSoundTime = now;

  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch (e) {
    // ignore audio errors (e.g. autoplay restrictions)
  }
};

const maybeDesktopNotify = (payload: any) => {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
  if (Notification.permission === "granted") {
    const n = new Notification(payload.title, {
      body: payload.body ?? "Neue Benachrichtigung",
      tag: payload.id,
      silent: true
    });
    if (payload.href) {
      n.onclick = () => {
        window.focus();
        window.location.href = payload.href;
      };
    }
  }
};

export function useNotificationStream() {
  const utils = trpc.useUtils();
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    const key = { limit: 20, includeRead: true };

    const applyPayload = (payload: SSEPayload) => {
      if (payload.type === "notification") {
        utils.notifications.list.setData(key, (old) => {
          const base = old ?? { items: [], nextCursor: null, unreadCount: 0 };
          const items = [payload.notification, ...(base.items ?? [])].slice(0, key.limit);
          return { ...base, items, nextCursor: base.nextCursor ?? null, unreadCount: (base.unreadCount ?? 0) + 1 };
        });
        utils.notifications.unreadCount.setData(undefined, (old) => ({ count: (old?.count ?? 0) + 1 }));
        playChime();
        maybeDesktopNotify(payload.notification);
      } else if (payload.type === "unread") {
        utils.notifications.unreadCount.setData(undefined, { count: payload.count });
        utils.notifications.list.setData(key, (old) => old ? { ...old, unreadCount: payload.count } : old);
      } else if (payload.type === "delete") {
        utils.notifications.list.setData(key, (old) => {
          if (!old) return old;
          return { ...old, items: old.items.filter((n) => n.id !== payload.id) };
        });
      } else if (payload.type === "read") {
        utils.notifications.list.setData(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((n) => payload.ids.includes(n.id) ? { ...n, readAt: new Date() } : n)
          };
        });
      }
    };

    const connect = () => {
      source = new EventSource("/api/notifications/stream");
      source.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data) as SSEPayload;
          applyPayload(payload);
        } catch (e) {
          console.error("Notification stream parse error", e);
        }
      };
      source.onerror = () => {
        if (source) source.close();
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      if (source) source.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [utils]);
}
