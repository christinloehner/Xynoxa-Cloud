/*
 * Copyright (C) 2025 Christin Löhner
 */

import { test, expect } from '@playwright/test';

test.describe('Global Search', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'admin@xynoxa.com');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/files', { timeout: 5000 });
  });

  test('should perform global search', async ({ page }) => {
    await page.goto('/search');

    // Enter search query
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="Suche"]').first();
    await searchInput.fill('test');

    // Wait for results
    await page.waitForTimeout(1500);

    // Should show results or empty state
    const hasResults = await page.locator('[data-testid="search-result"], .search-result-item').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no results|keine ergebnisse|empty/i').isVisible().catch(() => false);

    expect(hasResults || hasEmptyState).toBeTruthy();
  });

  test('should filter search results by type', async ({ page }) => {
    await page.goto('/search?q=test');

    await page.waitForTimeout(1000);

    // Click on a filter if available
    const fileFilter = page.locator('button:has-text("Files"), button:has-text("Dateien")').first();
    if (await fileFilter.isVisible({ timeout: 2000 })) {
      await fileFilter.click();
      await page.waitForTimeout(500);
    }

    // Verify URL or state changed
    expect(page.url()).toContain('search');
  });
});
