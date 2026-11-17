const { test, expect } = require('@playwright/test');

test('loads the learning workspace and published curriculum', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Become the analyst/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /SQL Day 1/i })).toBeVisible();
  await expect(page.locator('.topic-tab')).toHaveCount(5);
  await expect(page.locator('.task-card')).toHaveCount(3);
  await expect(pageErrors).toEqual([]);
});

test('prevents opening the next day before current day completion', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-day="1"]')).toBeEnabled();
  await expect(page.locator('[data-day="2"]')).toBeDisabled();
});

test('teaching modes and topic navigation update the lesson', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Explain/ }).click();
  await expect(page.locator('#teachingHeading')).toHaveText('Explain');
  await page.locator('[data-topic="1"]').click();
  await expect(page.locator('.topic-tab.active')).toContainText('Selecting Multiple Columns');
  await expect(page.locator('#teachingHeading')).toHaveText('Teacher');
});

test('projects and progress navigation lead to real sections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page.locator('#projects')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Turn learning into evidence/i })).toBeVisible();
  await page.getByRole('link', { name: 'Progress' }).click();
  await expect(page.locator('#progress')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Progress you can measure/i })).toBeVisible();
});

test('theme switch changes the document theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /Switch to dark theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /Switch to light theme/ })).toBeVisible();
});

test('search can find a business request in published lessons', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: /Search lessons/i }).fill('SELECT');
  await expect(page.locator('.search-result').first()).toBeVisible({ timeout: 15_000 });
});

test('mobile layout does not create horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Become the analyst/i })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
});
