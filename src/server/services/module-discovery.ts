/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Runtime Module Discovery Service
 * 
 * Scannt das Dateisystem zur Laufzeit nach neuen Modulen.
 * Kein Server-Neustart nötig - echtes Plug & Play!
 */

import fs from "fs";
import path from "path";

export interface DiscoveredModule {
  name: string;
  path: string;
  importPath: string;
}

/**
 * Cache für gefundene Module (mit TTL für Performance)
 */
let moduleCache: DiscoveredModule[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 Sekunden Cache

/**
 * Scannt das modules/ Verzeichnis nach verfügbaren Modulen
 * @param forceRefresh - Erzwingt einen neuen Scan (ignoriert Cache)
 */
export function discoverModulesRuntime(forceRefresh = false): DiscoveredModule[] {
  const now = Date.now();
  
  // Cache verwenden wenn noch gültig
  if (!forceRefresh && moduleCache && (now - cacheTimestamp) < CACHE_TTL) {
    return moduleCache;
  }

  console.warn("[Runtime Discovery] Scanning for modules...");
  
  const modulesDir = path.join(process.cwd(), "src/modules");
  
  if (!fs.existsSync(modulesDir)) {
    console.error(`[Runtime Discovery] Modules directory not found: ${modulesDir}`);
    return [];
  }

  const modules: DiscoveredModule[] = [];
  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });

  for (const entry of entries) {
    // Überspringe Dateien, versteckte Ordner und README
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }

    // Überspringe Ordner, die nicht mit "Xynoxa" beginnen (Konvention)
    if (!entry.name.startsWith("Xynoxa")) {
      console.warn(`[Runtime Discovery] Skipping ${entry.name} (must start with "Xynoxa")`);
      continue;
    }

    // Prüfe ob index.ts oder index.tsx existiert
    const indexTs = path.join(modulesDir, entry.name, "index.ts");
    const indexTsx = path.join(modulesDir, entry.name, "index.tsx");
    
    if (!fs.existsSync(indexTs) && !fs.existsSync(indexTsx)) {
      console.warn(`[Runtime Discovery] Skipping ${entry.name} (no index.ts/tsx found)`);
      continue;
    }

    // Modul gefunden
    modules.push({
      name: entry.name,
      path: path.join(modulesDir, entry.name),
      importPath: `@/modules/${entry.name}`
    });

    console.warn(`[Runtime Discovery] ✓ Found module: ${entry.name}`);
  }

  // Cache aktualisieren
  moduleCache = modules;
  cacheTimestamp = now;

  console.warn(`[Runtime Discovery] Found ${modules.length} module(s)`);
  return modules;
}

/**
 * Lädt ein Modul dynamisch zur Laufzeit
 * @param moduleName - Name des Moduls (z.B. "XynoxaBookmarks")
 */
export async function loadModuleRuntime(moduleName: string) {
  try {
    // Dynamischer Import mit vollem Pfad
    // @ts-ignore - Dynamic import zur Laufzeit
    const moduleExport = await import(`@/modules/${moduleName}`);
    return moduleExport.default;
  } catch (error) {
    console.error(`[Runtime Discovery] Failed to load module ${moduleName}:`, error);
    return null;
  }
}

/**
 * Invalidiert den Module-Cache
 * Nützlich wenn man weiß dass sich Module geändert haben
 */
export function invalidateModuleCache(): void {
  moduleCache = null;
  cacheTimestamp = 0;
  console.warn("[Runtime Discovery] Module cache invalidated");
}

/**
 * Prüft ob ein spezifisches Modul existiert
 */
export function moduleExists(moduleName: string): boolean {
  const modules = discoverModulesRuntime();
  return modules.some(m => m.name === moduleName);
}

/**
 * Gibt alle verfügbaren Modul-Namen zurück
 */
export function getAvailableModuleNames(): string[] {
  return discoverModulesRuntime().map(m => m.name);
}
