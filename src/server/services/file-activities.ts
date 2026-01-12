/*
 * Copyright (C) 2025 Christin Löhner
 */

import { createNotification, NotificationLevel } from "./notifications";
import { notificationBatcher } from "./notification-batcher";

/**
 * Helper-Funktionen für File-Activity-Logging
 * Erstellt Notifications für alle Datei-Operationen
 * Nutzt Batching für Upload/Update/Sync um Spam zu vermeiden
 */

export async function logFileUpload(userId: string, fileName: string, folderId?: string | null) {
  // Nutze Batcher für Uploads (verhindert Spam bei Bulk-Uploads)
  notificationBatcher.add(userId, "upload", fileName, { action: "upload", fileName, folderId }, "success");
}

export async function logFileUpdate(userId: string, fileName: string, folderId?: string | null) {
  // Nutze Batcher für Updates
  notificationBatcher.add(userId, "update", fileName, { action: "update", fileName, folderId }, "info");
}

export async function logFileRename(userId: string, oldName: string, newName: string, fileId: string) {
  await createNotification({
    userId,
    title: "Datei umbenannt",
    body: `"${oldName}" wurde in "${newName}" umbenannt`,
    href: `/files?file=${fileId}`,
    level: "info" as NotificationLevel,
    meta: { action: "rename", oldName, newName, fileId }
  });
}

export async function logFileMove(userId: string, fileName: string, fileId: string) {
  await createNotification({
    userId,
    title: "Datei verschoben",
    body: `"${fileName}" wurde verschoben`,
    href: `/files?file=${fileId}`,
    level: "info" as NotificationLevel,
    meta: { action: "move", fileName, fileId }
  });
}

export async function logFileCopy(userId: string, fileName: string, newFileId: string) {
  await createNotification({
    userId,
    title: "Datei kopiert",
    body: `"${fileName}" wurde kopiert`,
    href: `/files?file=${newFileId}`,
    level: "success" as NotificationLevel,
    meta: { action: "copy", fileName, fileId: newFileId }
  });
}

export async function logFileDelete(userId: string, fileName: string) {
  await createNotification({
    userId,
    title: "Datei gelöscht",
    body: `"${fileName}" wurde in den Papierkorb verschoben`,
    level: "warning" as NotificationLevel,
    meta: { action: "delete", fileName }
  });
}

export async function logFilePermanentDelete(userId: string, fileName: string) {
  await createNotification({
    userId,
    title: "Datei endgültig gelöscht",
    body: `"${fileName}" wurde permanent gelöscht`,
    level: "error" as NotificationLevel,
    meta: { action: "permanentDelete", fileName }
  });
}

export async function logFileRestore(userId: string, fileName: string, fileId: string) {
  await createNotification({
    userId,
    title: "Datei wiederhergestellt",
    body: `"${fileName}" wurde aus dem Papierkorb wiederhergestellt`,
    href: `/files?file=${fileId}`,
    level: "success" as NotificationLevel,
    meta: { action: "restore", fileName, fileId }
  });
}

export async function logFileVersionRestore(userId: string, fileName: string, version: number, fileId: string) {
  await createNotification({
    userId,
    title: "Version wiederhergestellt",
    body: `Version ${version} von "${fileName}" wurde wiederhergestellt`,
    href: `/files?file=${fileId}`,
    level: "success" as NotificationLevel,
    meta: { action: "versionRestore", fileName, version, fileId }
  });
}

export async function logFileSync(userId: string, action: "create" | "update" | "move" | "delete", fileName: string, fileId: string) {
  // Nur create und update batchen, move/delete einzeln (sind selten)
  if (action === "create" || action === "update") {
    notificationBatcher.add(
      userId,
      `sync_${action}`,
      fileName,
      { action: `sync_${action}`, fileName, fileId },
      action === "create" ? "success" : "info"
    );
  } else {
    // Move und Delete sofort anzeigen (kein Batching)
    const actionMap = {
      move: { title: "Datei verschoben", body: `"${fileName}" wurde via Sync verschoben`, level: "info" as NotificationLevel },
      delete: { title: "Datei gelöscht", body: `"${fileName}" wurde via Sync gelöscht`, level: "warning" as NotificationLevel }
    };

    const config = actionMap[action];
    await createNotification({
      userId,
      title: config.title,
      body: config.body,
      href: action !== "delete" ? `/files?file=${fileId}` : undefined,
      level: config.level,
      meta: { action: `sync_${action}`, fileName, fileId }
    });
  }
}
