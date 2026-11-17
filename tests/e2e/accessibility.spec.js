import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/?test-reset=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?test-reset=2#day-01');
  await expect(page.locator('.lesson-content-title')).toBeVisible();
});

async function completeCodingQuestions(page) {
  const questions = await page.evaluate(async () => {
    const day = await (await fetch('./curriculum/day-001.json')).json();
    return day.topics[0].coding_questions;
  });
  await page.locator('[data-view="practice"]').click();
  for (const question of questions) {
    await page.locator('#codingSqlEditor').fill(question.expected_sql);
    await page.locator('[data-action="run-coding-question"]').click();
    await expect(page.locator('.coding-feedback.is-correct')).toBeVisible();
  }
}

async function expectNoSeriousAxeViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  expect(serious, serious.map(item => item.id + ': ' + item.help).join('\n')).toEqual([]);
}

test('topic lesson screen has no automatically detectable critical or serious accessibility violations', async ({ page }) => {
  await expectNoSeriousAxeViolations(page);
});

test('coding practice screen has no automatically detectable critical or serious accessibility violations', async ({ page }) => {
  await page.locator('[data-view="practice"]').click();
  await expectNoSeriousAxeViolations(page);
});

test('topic exam screen has no automatically detectable critical or serious accessibility violations', async ({ page }) => {
  await completeCodingQuestions(page);
  await expect(page.locator('.exam-screen')).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test('theme setting persists across reloads and lessons remain readable', async ({ page }) => {
  await page.getByRole('button', { name: /Switch theme/i }).click();
  const selectedTheme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
  await expect(page.locator('.lesson-content-title')).toBeVisible();
  await expect(page.locator('.lesson-content-title')).toHaveCSS('font-size', '34px');
});
