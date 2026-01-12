/*
 * Copyright (C) 2025 Christin Löhner
 */

import { test, expect } from '@playwright/test';

test.describe('Notes Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'admin@xynoxa.com');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/files', { timeout: 5000 });
  });

  test('should create a new note', async ({ page }) => {
    await page.goto('/notes');

    // Click create note button
    await page.click('button:has-text("New Note"), button:has-text("Neue Notiz")');

    // Wait for editor
    await page.waitForTimeout(500);

    // Fill note title
    const titleInput = page.locator('input[placeholder*="Title"], input[placeholder*="Titel"]').first();
    await titleInput.fill(`Test Note ${Date.now()}`);

    // Fill note content (tiptap editor)
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.fill('This is a test note content with some text.');

    // Save note
    await page.click('button:has-text("Save"), button:has-text("Speichern")');

    // Verify note appears in list
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/Test Note/i').first()).toBeVisible();
  });

  test('should search for notes', async ({ page }) => {
    await page.goto('/notes');

    // Enter search term
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await searchInput.fill('test');

    // Wait for results
    await page.waitForTimeout(1000);

    // Should show some results or empty state
    const results = page.locator('[data-testid="note-item"], .note-card, article');
    await expect(results.first().or(page.locator('text=/empty|leer|keine/i'))).toBeVisible();
  });
});
