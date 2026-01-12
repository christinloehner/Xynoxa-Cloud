/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Auto-Generated Module Registry
 * 
 * Diese Datei wird automatisch generiert durch scripts/discover-modules.ts
 * NICHT MANUELL BEARBEITEN!
 * 
 * Um Module hinzuzufügen:
 * 1. Erstelle einen Ordner in src/modules/ (muss mit "Xynoxa" beginnen)
 * 2. Erstelle eine index.ts Datei mit dem Modul-Export
 * 3. Optional: client.ts fuer Navigation/Client-Links
 * 4. Führe "npm run discover-modules" aus oder starte den Server neu
 * 
 * WICHTIG: 
 * - index.ts enthält Server-Code (DB, Router, etc.)
 * - client.ts enthält nur Client-Safe Code (Navigation, URLs), falls vorhanden
 * 
 * Gefundene Module: 4
 * Generiert am: 2026-01-12T09:58:01.666Z
 */

/**
 * Server-Side Module Registry
 * Verwendet die vollständigen Module (index.ts) mit Server-Code
 * NUR auf Server-Side verwenden!
 */
export { SERVER_MODULES as AVAILABLE_MODULES } from "@/lib/module-registry.server";

/**
 * Client-Side Module Registry
 * Verwendet nur die Client-Safe Exports (client.ts)
 * Sicher für Client-Bundle!
 */
export { CLIENT_MODULES } from "@/lib/module-registry.client";

/**
 * Modul-Namen für Debugging
 */
export const MODULE_NAMES = [
  "XynoxaBookmarks",
  "XynoxaNotes",
  "XynoxaProjects",
  "XynoxaTestModul"
];
