#!/usr/bin/env tsx
/*
 * Copyright (C) 2025 Christin Löhner
 */
/**
 * Create a new Xynoxa module from the full template.
 *
 * Usage:
 *   npm run create-module -- --name "My Module" --id my-module
 *
 * Defaults:
 *   --id is derived from --name (kebab-case)
 */

import fs from "node:fs/promises";
import path from "node:path";

const TEMPLATE_DIR = path.join(process.cwd(), "templates", "module-template");
const MODULES_DIR = path.join(process.cwd(), "src", "modules");

type Args = {
  name?: string;
  id?: string;
  folder?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--name") args.name = argv[i + 1];
    if (arg === "--id") args.id = argv[i + 1];
    if (arg === "--folder") args.folder = argv[i + 1];
  }
  return args;
}

function toKebabCase(input: string) {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function toPascalCase(input: string) {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function replaceInFiles(dir: string, replacers: Array<[RegExp, string]>) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await replaceInFiles(full, replacers);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (![".ts", ".tsx", ".md"].includes(ext)) continue;

    const content = await fs.readFile(full, "utf8");
    let next = content;
    for (const [pattern, replacement] of replacers) {
      next = next.replace(pattern, replacement);
    }
    if (next !== content) {
      await fs.writeFile(full, next, "utf8");
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name) {
    console.error("Missing --name. Example: --name \"My Module\"");
    process.exit(1);
  }

  const moduleId = args.id ?? toKebabCase(args.name);
  const moduleName = args.name.trim();
  const moduleFolder = args.folder ?? `Xynoxa${toPascalCase(moduleName)}`;
  const targetDir = path.join(MODULES_DIR, moduleFolder);

  if (!(await exists(TEMPLATE_DIR))) {
    console.error(`Template not found: ${TEMPLATE_DIR}`);
    process.exit(1);
  }
  if (await exists(targetDir)) {
    console.error(`Target already exists: ${targetDir}`);
    process.exit(1);
  }

  await copyDir(TEMPLATE_DIR, targetDir);

  const replacers: Array<[RegExp, string]> = [
    [/module-template/g, moduleId],
    [/Module Template/g, moduleName],
    [/module-template-nav/g, `${moduleId}-nav`]
  ];

  await replaceInFiles(targetDir, replacers);

  console.log(`Module created at ${targetDir}`);
  console.log(`- id: ${moduleId}`);
  console.log(`- name: ${moduleName}`);
  console.log(`- folder: ${moduleFolder}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
