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
  const selectedTheme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
  await page.getByRole('button', { name: 'Learn', exact: true }).click();
  await expect(page.locator('.lesson-content-title')).toBeVisible();
});

test('teaching markdown is rendered as semantic content', async ({ page }) => {
  await page.getByRole('button', { name: 'Learn', exact: true }).click();
  await page.getByRole('tab', { name: /Teacher/ }).click();
  await expect(page.locator('.teaching-text h2, .teaching-text h3, .teaching-text h4').first()).toBeVisible();
});

test('lesson and exam screens have no automatically detectable critical accessibility violations', async ({ page }) => {
  await page.getByRole('button', { name: 'Learn', exact: true }).click();
  let results = await new AxeBuilder({ page }).analyze();
  let serious = results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  expect(serious, serious.map(item => item.id + ': ' + item.help).join('\n')).toEqual([]);

  for (let lesson = 0; lesson < 5; lesson += 1) {
    await page.locator('[data-action="complete-lesson"]').click();
  }
  await expect(page.locator('.exam-screen')).toBeVisible();
  results = await new AxeBuilder({ page }).analyze();
  serious = results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  expect(serious, serious.map(item => item.id + ': ' + item.help).join('\n')).toEqual([]);
});
