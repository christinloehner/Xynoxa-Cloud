#!/usr/bin/env tsx
/*
 * Copyright (C) 2025 Christin Löhner
 */
/// <reference types="node" />
/**
 * Module Discovery Script
 * 
 * Scannt automatisch alle Module im src/modules/ Verzeichnis
 * und generiert eine module-registry.ts Datei mit allen Imports.
 * 
 * Wird automatisch ausgeführt:
 * - Beim npm install (postinstall hook)
 * - Beim Build (prebuild hook)
 * - Manuell: npm run discover-modules
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULES_DIR = path.join(__dirname, "../src/modules");
const OUTPUT_FILE = path.join(__dirname, "../src/lib/module-registry.ts");
const OUTPUT_SERVER_FILE = path.join(__dirname, "../src/lib/module-registry.server.ts");
const OUTPUT_CLIENT_FILE = path.join(__dirname, "../src/lib/module-registry.client.ts");
const OUTPUT_ROUTE_FILE = path.join(__dirname, "../src/lib/module-registry.route.ts");

interface DiscoveredModule {
  name: string;
  path: string;
  hasClient: boolean;
}

function discoverModules(): DiscoveredModule[] {
  console.warn("[Module Discovery] Scanning for modules...");
  
  if (!fs.existsSync(MODULES_DIR)) {
    console.error(`[Module Discovery] Modules directory not found: ${MODULES_DIR}`);
    return [];
  }

  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const modules: DiscoveredModule[] = [];

  for (const entry of entries) {
    // Überspringe Dateien und versteckte Ordner
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }

    // Überspringe Ordner, die nicht mit "Xynoxa" beginnen (Konvention)
    if (!entry.name.startsWith("Xynoxa")) {
      console.warn(`[Module Discovery] Skipping ${entry.name} (must start with "Xynoxa")`);
      continue;
    }

    // Prüfe ob index.ts existiert
    const indexPath = path.join(MODULES_DIR, entry.name, "index.ts");
    if (!fs.existsSync(indexPath)) {
      console.warn(`[Module Discovery] Skipping ${entry.name} (no index.ts found)`);
      continue;
    }

    // Prüfe ob client.ts existiert (erforderlich für Client-Bundle)
    const clientPath = path.join(MODULES_DIR, entry.name, "client.ts");
    const hasClient = fs.existsSync(clientPath);
    if (!hasClient) {
      console.warn(`[Module Discovery] Warning: ${entry.name} has no client.ts - client-side navigation may not work`);
    }

    modules.push({
      name: entry.name,
      path: `@/modules/${entry.name}`,
      hasClient
    });

    console.warn(`[Module Discovery] ✓ Found module: ${entry.name}`);
  }

  return modules;
}

function generateRegistry(modules: DiscoveredModule[]): string {
  // Re-export from server/client registries to avoid double imports

  return `/**
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
 * Gefundene Module: ${modules.length}
 * Generiert am: ${new Date().toISOString()}
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
${modules.map(mod => `  "${mod.name}"`).join(",\n")}
];
`;
}

function generateServerRegistry(modules: DiscoveredModule[]): string {
  const serverImports = modules
    .map((mod) => `import ${mod.name} from "${mod.path}";`)
    .join("\n");

  return `/**
 * Auto-Generated Server Module Registry
 *
 * Diese Datei wird automatisch generiert durch scripts/discover-modules.ts
 * NICHT MANUELL BEARBEITEN!
 */
import "server-only";
${serverImports}

export const SERVER_MODULES = [
${modules.map((mod) => `  ${mod.name}`).join(",\n")}
];

export const MODULE_NAMES = [
${modules.map(mod => `  "${mod.name}"`).join(",\n")}
];
`;
}

function generateClientRegistry(modules: DiscoveredModule[]): string {
  const clientImports = modules
    .filter((mod) => mod.hasClient)
    .map((mod) => `import ${mod.name}Client from "${mod.path}/client";`)
    .join("\n");

  return `/**
 * Auto-Generated Client Module Registry
 *
 * Diese Datei wird automatisch generiert durch scripts/discover-modules.ts
 * NICHT MANUELL BEARBEITEN!
 */
${clientImports}

export const CLIENT_MODULES = [
${modules.filter((mod) => mod.hasClient).map((mod) => `  ${mod.name}Client`).join(",\n")}
];

export const MODULE_NAMES = [
${modules.map(mod => `  "${mod.name}"`).join(",\n")}
];
`;
}

function generateRouteRegistry(modules: DiscoveredModule[]): string {
  const imports = modules
    .map((mod) => `import ${mod.name} from "${mod.path}";`)
    .join("\n");

  return `/**
 * Auto-Generated Route Module Registry
 *
 * Diese Datei wird automatisch generiert durch scripts/discover-modules.ts
 * NICHT MANUELL BEARBEITEN!
 *
 * WICHTIG: Diese Datei wird von der dynamischen Modul-Route genutzt,
 * um Client-Komponenten sicher im Manifest zu registrieren.
 */
${imports}

export const ROUTE_MODULES = [
${modules.map((mod) => `  ${mod.name}`).join(",\n")}
];
`;
}

function writeRegistry(content: string): void {
  fs.writeFileSync(OUTPUT_FILE, content, "utf8");
  console.warn(`[Module Discovery] ✓ Registry written to ${OUTPUT_FILE}`);
}

function writeServerRegistry(content: string): void {
  fs.writeFileSync(OUTPUT_SERVER_FILE, content, "utf8");
  console.warn(`[Module Discovery] ✓ Server registry written to ${OUTPUT_SERVER_FILE}`);
}

function writeClientRegistry(content: string): void {
  fs.writeFileSync(OUTPUT_CLIENT_FILE, content, "utf8");
  console.warn(`[Module Discovery] ✓ Client registry written to ${OUTPUT_CLIENT_FILE}`);
}

function writeRouteRegistry(content: string): void {
  fs.writeFileSync(OUTPUT_ROUTE_FILE, content, "utf8");
  console.warn(`[Module Discovery] ✓ Route registry written to ${OUTPUT_ROUTE_FILE}`);
}

// Main
try {
  const modules = discoverModules();
  
  if (modules.length === 0) {
    console.warn("[Module Discovery] No modules found!");
  } else {
    console.warn(`[Module Discovery] Found ${modules.length} module(s)`);
  }
  
  const registryContent = generateRegistry(modules);
  const serverRegistryContent = generateServerRegistry(modules);
  const clientRegistryContent = generateClientRegistry(modules);
  const routeRegistryContent = generateRouteRegistry(modules);
  writeRegistry(registryContent);
  writeServerRegistry(serverRegistryContent);
  writeClientRegistry(clientRegistryContent);
  writeRouteRegistry(routeRegistryContent);
  
  console.warn("[Module Discovery] ✓ Discovery completed successfully");
  process.exit(0);
} catch (error) {
  console.error("[Module Discovery] ✗ Error:", error);
  process.exit(1);
}
