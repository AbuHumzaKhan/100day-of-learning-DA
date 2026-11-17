import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.dashboard-hero')).toBeVisible();
});

test('homepage has no automatically detectable critical accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  expect(serious, serious.map(item => item.id + ': ' + item.help).join('\n')).toEqual([]);
});

test('theme toggle persists and keeps the main learning workspace usable', async ({ page }) => {
  await page.getByRole('button', { name: /Switch theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.dashboard-hero')).toBeVisible();
});

test('teaching markdown is rendered as semantic content', async ({ page }) => {
  await page.getByRole('button', { name: 'Learn', exact: true }).click();
  await page.getByRole('tab', { name: /Teacher/ }).click();
  await expect(page.locator('.teaching-text h2, .teaching-text h3, .teaching-text h4').first()).toBeVisible();
});
