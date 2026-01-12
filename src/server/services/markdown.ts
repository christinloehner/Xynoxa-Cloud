/*
 * Copyright (C) 2025 Christin Löhner
 */

import { JSDOM } from "jsdom";

export function markdownToTxt(html: string): string {
  // simple HTML to text for export, preserving line breaks
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window.document.body.textContent || "";
}

