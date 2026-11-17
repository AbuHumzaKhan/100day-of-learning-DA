import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.lesson-hero h1')).toBeVisible();
});

test('loads the published lesson and enforces sequential unlocking', async ({ page }) => {
  await expect(page.locator('.day-button[data-day="1"]')).toBeEnabled();
  await expect(page.locator('.day-button[data-day="2"]')).toBeDisabled();
  await expect(page.locator('.day-button[data-day="12"]')).toBeDisabled();
  await expect(page.locator('.lesson-hero h1')).toContainText('Day 1');
});

test('does not unlock days when earlier days in the sequence are incomplete', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('ahk_academy_state_v1', JSON.stringify({
      schemaVersion: 1,
      activeDay: 4,
      completedDays: [3],
      tasks: {},
      updatedAt: new Date().toISOString()
    }));
  });
  await page.reload();
  await expect(page.locator('.day-button[data-day="2"]')).toBeDisabled();
  await expect(page.locator('.day-button[data-day="4"]')).toBeDisabled();
  await expect(page.locator('.lesson-hero h1')).toContainText('Day 1');
});

test('teaching and practice tabs expose valid accessible tab relationships', async ({ page }) => {
  await expect(page.locator('.mode-tabs [role="tab"]')).toHaveCount(4);
  await expect(page.locator('#teaching-panel')).toHaveAttribute('aria-labelledby', 'teaching-tab-teacher');
  await expect(page.locator('.practice-tabs [role="tab"]')).toHaveCount(3);
  await expect(page.locator('#practice-pane-query')).toHaveAttribute('aria-labelledby', 'practice-tab-query');
});

test('teaching and practice tabs support keyboard navigation without losing focus', async ({ page }) => {
  await page.locator('[data-mode="teacher"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-mode="explain"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-mode="explain"]')).toBeFocused();

  await page.locator('[data-practice-tab="query"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-practice-tab="schema"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-practice-tab="schema"]')).toBeFocused();
});

test('renders all teaching modes and five topic navigation items', async ({ page }) => {
  await expect(page.locator('.topic-nav-button')).toHaveCount(5);
  await page.getByRole('tab', { name: /Explain/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Explain');
  await page.getByRole('tab', { name: /Deep learning/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Deep learning');
  await page.getByRole('tab', { name: /Analyst mindset/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Analyst mindset');
  await page.getByRole('tab', { name: /Teacher/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Teacher');
});

test('reviews all 15 tasks before completing a day and unlocking the next day', async ({ page }) => {
  for (let topic = 0; topic < 5; topic += 1) {
    await page.locator('.topic-nav-button[data-topic="' + topic + '"]').click();
    for (let question = 0; question < 3; question += 1) {
      await page.locator('.question-card').nth(question).locator('[data-task-action="toggle"]').click();
    }
  }

  await expect(page.locator('.day-checkpoint')).toContainText('15 of 15');
  await page.locator('[data-action="complete-day"]').click();
  await expect(page.locator('.day-button[data-day="2"]')).toBeEnabled();

  await page.locator('.day-button[data-day="2"]').click();
  await expect(page.locator('.lesson-hero h1')).toContainText('Day 2');
});

test('Practice navigation is the active destination and Projects and Progress open', async ({ page }) => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.locator('.nav-button[data-view="practice"]')).toHaveClass(/active/);
  await expect(page.locator('.nav-button[data-view="learn"]')).not.toHaveClass(/active/);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analytical project library' })).toBeVisible();
  await expect(page.locator('.project-card')).toHaveCount(4);

  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
  await expect(page.locator('.progress-metric-grid')).toBeVisible();
});

test('global search finds curriculum topics and business requests', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: /Search lessons/ });
  await search.fill('DISTINCT');
  await expect(page.locator('#academySearchResults')).toBeVisible();
  await expect(page.locator('#academySearchResults')).toContainText('Day 02');
});

test('SQL workspace executes a read-only query against the registered orders dataset', async ({ page }) => {
  test.setTimeout(60_000);
  await page.locator('#sqlEditor').fill('SELECT COUNT(*) AS total_orders FROM orders;');
  await page.locator('[data-action="run-query"]').click();
  await expect(page.locator('#queryResults')).toContainText('150', { timeout: 45_000 });

  await page.locator('#sqlEditor').fill('DROP TABLE orders;');
  await page.locator('[data-action="run-query"]').click();
  await expect(page.locator('#queryResults')).toContainText('SELECT and WITH queries only');
});

test('responsive layouts fit mobile, tablet, laptop and desktop viewports', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(dimensions.document, 'horizontal overflow at ' + width + 'px').toBeLessThanOrEqual(dimensions.viewport + 1);
  }
  await expect(page.locator('.lesson-hero h1')).toBeVisible();
});

test('mobile layout fits a 390px viewport without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.locator('.academy-nav')).toBeVisible();
  await expect(page.locator('.lesson-hero h1')).toBeVisible();
});