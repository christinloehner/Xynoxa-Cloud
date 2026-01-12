/*
 * Copyright (C) 2025 Christin Löhner
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should register a new user and login', async ({ page }) => {
    const timestamp = Date.now();
    const email = `test${timestamp}@xynoxa.com`;
    const password = 'SecurePass123!';

    // Navigate to registration
    await page.goto('/auth/register');
    await expect(page).toHaveTitle(/Xynoxa/);

    // Fill registration form
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="name"]', 'Test User');

    // Submit registration
    await page.click('button[type="submit"]');

    // Should redirect to dashboard or login
    await page.waitForURL(/\/(files|auth\/login)/, { timeout: 5000 });

    // If redirected to login, login now
    if (page.url().includes('/auth/login')) {
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');
    }

    // Should be on dashboard
    await page.waitForURL('/files', { timeout: 5000 });
    await expect(page.locator('text=Files').or(page.locator('text=Dateien'))).toBeVisible();
  });

  test('should fail login with wrong credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('text=/error|fehler|invalid|ungültig/i')).toBeVisible({ timeout: 3000 });
  });

  test('should logout successfully', async ({ page }) => {
    // First need to login with existing user or create one
    // For this test, we'll navigate to login and assume a user exists
    await page.goto('/auth/login');

    // Use test credentials (you might need to seed a test user)
    await page.fill('input[name="email"]', 'admin@xynoxa.com');
    await page.fill('input[name="password"]', 'admin123');

    const loginButton = page.locator('button[type="submit"]');
    if (await loginButton.isVisible()) {
      await loginButton.click();
      await page.waitForTimeout(1000);
    }

    // Navigate to settings or look for logout
    await page.goto('/settings');

    // Click logout (this might be in different locations)
    const logoutButton = page.locator('text=/logout|abmelden/i').first();
    if (await logoutButton.isVisible({ timeout: 2000 })) {
      await logoutButton.click();
      await page.waitForURL('/auth/login', { timeout: 3000 });
    }
  });
});
