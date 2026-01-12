/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Notification Batcher
 * 
 * Sammelt ähnliche Notifications innerhalb eines Zeitfensters und fasst sie zu einer zusammen.
 * Verhindert Notification-Spam bei Bulk-Operationen.
 */

import { createNotification, NotificationLevel } from "./notifications";

type BatchKey = string;
type BatchItem = {
  userId: string;
  action: string;
  fileName: string;
  meta?: any;
  level?: NotificationLevel;
};

class NotificationBatcher {
  private batches = new Map<BatchKey, BatchItem[]>();
  private timers = new Map<BatchKey, NodeJS.Timeout>();
  private readonly BATCH_WINDOW_MS = 5000; // 5 Sekunden

  /**
   * Fügt eine Notification zum Batch hinzu.
   * Wenn nach 5 Sekunden keine neuen Notifications mehr kommen, wird die gruppierte Notification erstellt.
   */
  add(userId: string, action: string, fileName: string, meta?: any, level?: NotificationLevel) {
    const key: BatchKey = `${userId}:${action}`;
    
    if (!this.batches.has(key)) {
      this.batches.set(key, []);
    }

    this.batches.get(key)!.push({ userId, action, fileName, meta, level });

    // Bestehenden Timer clearen und neuen starten
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }

    this.timers.set(key, setTimeout(() => {
      this.flush(key);
    }, this.BATCH_WINDOW_MS));
  }

  /**
   * Erstellt die gruppierte Notification aus dem Batch
   */
  private async flush(key: BatchKey) {
    const items = this.batches.get(key);
    if (!items || items.length === 0) return;

    const first = items[0];
    const count = items.length;

    if (count === 1) {
      // Nur eine Notification → Normal erstellen
      const config = this.getNotificationConfig(first.action, first.fileName);
      await createNotification({
        userId: first.userId,
        title: config.title,
        body: config.body,
        level: first.level ?? config.level,
        meta: first.meta
      });
    } else {
      // Mehrere Notifications → Gruppierte Notification
      const config = this.getBatchNotificationConfig(first.action, count);
      await createNotification({
        userId: first.userId,
        title: config.title,
        body: config.body,
        level: first.level ?? config.level,
        meta: { 
          action: `batch_${first.action}`,
          count,
          fileNames: items.map(i => i.fileName).slice(0, 5) // Erste 5 Dateinamen
        }
      });
    }

    // Cleanup
    this.batches.delete(key);
    this.timers.delete(key);
  }

  private getNotificationConfig(action: string, fileName: string) {
    switch (action) {
      case "upload":
        return {
          title: "Datei hochgeladen",
          body: `"${fileName}" wurde erfolgreich hochgeladen`,
          level: "success" as NotificationLevel
        };
      case "update":
        return {
          title: "Datei aktualisiert",
          body: `"${fileName}" wurde aktualisiert`,
          level: "info" as NotificationLevel
        };
      case "sync_create":
        return {
          title: "Datei synchronisiert",
          body: `"${fileName}" wurde synchronisiert`,
          level: "success" as NotificationLevel
        };
      case "sync_update":
        return {
          title: "Datei aktualisiert",
          body: `"${fileName}" wurde via Sync aktualisiert`,
          level: "info" as NotificationLevel
        };
      default:
        return {
          title: "Datei-Operation",
          body: `"${fileName}"`,
          level: "info" as NotificationLevel
        };
    }
  }

  private getBatchNotificationConfig(action: string, count: number) {
    switch (action) {
      case "upload":
        return {
          title: "Dateien hochgeladen",
          body: `${count} Dateien wurden erfolgreich hochgeladen`,
          level: "success" as NotificationLevel
        };
      case "update":
        return {
          title: "Dateien aktualisiert",
          body: `${count} Dateien wurden aktualisiert`,
          level: "info" as NotificationLevel
        };
      case "sync_create":
        return {
          title: "Dateien synchronisiert",
          body: `${count} Dateien wurden synchronisiert`,
          level: "success" as NotificationLevel
        };
      case "sync_update":
        return {
          title: "Dateien aktualisiert",
          body: `${count} Dateien wurden via Sync aktualisiert`,
          level: "info" as NotificationLevel
        };
      default:
        return {
          title: "Datei-Operationen",
          body: `${count} Operationen abgeschlossen`,
          level: "info" as NotificationLevel
        };
    }
  }

  /**
   * Erzwingt sofortiges Flushen aller Batches (z.B. bei Shutdown)
   */
  async flushAll() {
    const keys = Array.from(this.batches.keys());
    await Promise.all(keys.map(key => this.flush(key)));
  }
}

export const notificationBatcher = new NotificationBatcher();
