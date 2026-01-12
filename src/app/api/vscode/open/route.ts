/*
 * Copyright (C) 2025 Christin Löhner
 */

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session-options";
import { checkFileAccess } from "@/server/utils/file-access";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { DRIVER, STORAGE_PATH, formatBytes } from "@/server/services/storage";
import { dirname, join } from "path";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession(req, res, sessionOptions);
  const { userId } = session as { userId?: string };

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { fileId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fileId = body.fileId;
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const hasAccess = await checkFileAccess(userId, fileId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const [file] = await db
    .select({
      storagePath: files.storagePath,
      isVault: files.isVault,
      mime: files.mime,
      path: files.path
    })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.isVault) {
    return NextResponse.json({ error: "Vault-Dateien können nicht im Code Editor geöffnet werden." }, { status: 400 });
  }

  if (!file.storagePath) {
    return NextResponse.json({ error: "File storage path missing" }, { status: 400 });
  }

  if (DRIVER !== "local") {
    return NextResponse.json({ error: "VS Code Server ist nur mit STORAGE_DRIVER=local verfügbar." }, { status: 400 });
  }

  const absolutePath = join(STORAGE_PATH, file.storagePath);
  const folderPath = dirname(absolutePath);

  const codeDomain = process.env.APP_DOMAIN ? `code.${process.env.APP_DOMAIN}` : null;
  if (!codeDomain) {
    return NextResponse.json({ error: "APP_DOMAIN ist nicht gesetzt." }, { status: 500 });
  }

  const baseUrl = `https://${codeDomain}`;
  // code-server unterstützt folder/workspace Query-Parameter. Öffne direkt Datei.
  const url = `${baseUrl}/?folder=${encodeURIComponent(folderPath)}&file=${encodeURIComponent(absolutePath)}&telemetry=off`;

  return NextResponse.json({ url }, { headers: res.headers });
}
