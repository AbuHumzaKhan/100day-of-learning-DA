import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#day-01');
  await expect(page.locator('.lesson-content-title')).toBeVisible();
});

test('opens lesson mode with five sequential lessons and a locked exam', async ({ page }) => {
  await expect(page.locator('.lesson-step')).toHaveCount(5);
  await expect(page.locator('.lesson-step[data-lesson-index="0"]')).toBeEnabled();
  await expect(page.locator('.lesson-step[data-lesson-index="1"]')).toBeDisabled();
  await expect(page.locator('.academy-mode-nav [data-view="exam"]')).toBeDisabled();
  await expect(page.locator('.lesson-content-title')).toContainText('SELECT');
  await expect(page.locator('.lesson-business-task')).toBeVisible();
  await expect(page.locator('.lesson-side-column')).toBeVisible();
});

test('lessons unlock in order and the fifth completion replaces the lesson screen with the exam', async ({ page }) => {
  for (let lesson = 0; lesson < 5; lesson += 1) {
    await expect(page.locator('.lesson-content-title')).toBeVisible();
    await expect(page.locator('.lesson-step[data-lesson-index="' + lesson + '"]')).toHaveClass(/is-active/);
    await page.locator('[data-action="complete-lesson"]').click();
    if (lesson < 4) {
      await expect(page.locator('.lesson-content-title')).toBeVisible();
      await expect(page.locator('.lesson-step[data-lesson-index="' + (lesson + 1) + '"]')).toBeEnabled();
    }
  }

  await expect(page.locator('.exam-screen')).toBeVisible();
  await expect(page.locator('.lesson-experience')).toHaveCount(0);
  await expect(page.locator('.exam-question-nav-item')).toHaveCount(5);
  await expect(page.locator('.exam-question-nav-item[data-exam-question="0"]')).toHaveClass(/is-current/);
  await expect(page.locator('.exam-question-card')).toHaveCount(1);
  await expect(page.locator('.academy-mode-nav [data-view="exam"]')).toBeEnabled();
  await expect(page.locator('.academy-mode-nav [data-view="learn"]')).toBeDisabled();
});

test('exam navigator shows one question at a time and autosaves selected answers', async ({ page }) => {
  for (let lesson = 0; lesson < 5; lesson += 1) {
    await page.locator('[data-action="complete-lesson"]').click();
  }

  await expect(page.locator('.exam-question-meta')).toContainText('QUESTION 01');
  await page.locator('.exam-option').nth(1).click();
  await expect(page.locator('.exam-question-nav-item[data-exam-question="0"]')).toHaveClass(/is-answered/);
  await page.locator('.exam-question-nav-item[data-exam-question="1"]').click();
  await expect(page.locator('.exam-question-meta')).toContainText('QUESTION 02');
  await page.locator('.exam-option').nth(2).click();
  await page.reload();
  await expect(page.locator('.exam-screen')).toBeVisible();
  await expect(page.locator('.exam-question-nav-item[data-exam-question="0"]')).toHaveClass(/is-answered/);
  await expect(page.locator('.exam-question-nav-item[data-exam-question="1"]')).toHaveClass(/is-answered/);
  await expect(page.locator('.exam-option.is-selected')).toHaveCount(1);
});

test('exam requires all five answers and allows a failed attempt to be retried', async ({ page }) => {
  for (let lesson = 0; lesson < 5; lesson += 1) {
    await page.locator('[data-action="complete-lesson"]').click();
  }

  for (let question = 0; question < 5; question += 1) {
    await page.locator('.exam-question-nav-item[data-exam-question="' + question + '"]').click();
    await page.locator('.exam-option').nth(question === 2 ? 1 : 0).click();
  }
  await page.locator('.exam-question-nav-item[data-exam-question="4"]').click();
  await page.locator('[data-action="submit-exam"]').click();
  await expect(page.locator('.exam-result-banner')).toContainText('Assessment not passed yet');
  await expect(page.locator('.exam-result-banner')).toContainText('0 out of 5');
  await page.locator('[data-action="retry-exam"]').click();
  await expect(page.locator('.exam-question-nav-item.is-answered')).toHaveCount(0);
  await expect(page.locator('.exam-result-banner')).toHaveCount(0);
});

test('passing the exam unlocks the next published day', async ({ page }) => {
  for (let lesson = 0; lesson < 5; lesson += 1) {
    await page.locator('[data-action="complete-lesson"]').click();
  }

  const correctStatements = await page.evaluate(async () => {
    const response = await fetch('./curriculum/day-001.json');
    const day = await response.json();
    return day.topics.map(topic => topic.teaching.expected_sql);
  });

  for (let question = 0; question < 5; question += 1) {
    await page.locator('.exam-question-nav-item[data-exam-question="' + question + '"]').click();
    const answer = page.locator('.exam-option').filter({ hasText: correctStatements[question] });
    await expect(answer).toHaveCount(1);
    await answer.click();
  }

  await page.locator('[data-action="submit-exam"]').click();
  await expect(page.locator('.exam-result-banner')).toContainText('Assessment passed');
  await expect(page.locator('.exam-result-banner')).toContainText('5 out of 5');
  await page.locator('[data-action="continue-next-day"]').click();
  await expect(page.locator('.lesson-content-title')).toContainText('DISTINCT');
  await expect(page.locator('.lesson-step')).toHaveCount(5);
});

test('teaching and practice tabs expose valid accessible tab relationships', async ({ page }) => {
  await expect(page.locator('.mode-tabs [role="tab"]')).toHaveCount(4);
  await expect(page.locator('#teaching-panel')).toHaveAttribute('aria-labelledby', 'teaching-tab-teacher');

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.locator('.practice-tabs [role="tab"]')).toHaveCount(3);
  await expect(page.locator('#practice-pane-query')).toHaveAttribute('aria-labelledby', 'practice-tab-query');
});

test('teaching and practice tabs support keyboard navigation without losing focus', async ({ page }) => {
  await page.locator('[data-mode="teacher"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-mode="explain"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-mode="explain"]')).toBeFocused();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.locator('[data-practice-tab="query"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-practice-tab="schema"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-practice-tab="schema"]')).toBeFocused();
});

test('all teaching modes and five lesson steps are available', async ({ page }) => {
  await expect(page.locator('.lesson-step')).toHaveCount(5);
  await page.getByRole('tab', { name: /Explain/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Explain');
  await page.getByRole('tab', { name: /Deep learning/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Deep learning');
  await page.getByRole('tab', { name: /Analyst mindset/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Analyst mindset');
  await page.getByRole('tab', { name: /Teacher/ }).click();
  await expect(page.locator('.teaching-mode-label')).toHaveText('Teacher');
});

test('overview, practice, projects and progress remain accessible', async ({ page }) => {
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.dashboard-hero')).toBeVisible();

  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.locator('.nav-button[data-view="practice"]')).toHaveClass(/active/);
  await expect(page.locator('#sqlEditor')).toBeVisible();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
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

test('SQL workspace executes read-only queries against the registered orders dataset', async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
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
  await expect(page.locator('.lesson-content-title')).toBeVisible();
});

test('mobile lesson and exam navigators remain usable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  let dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.locator('.academy-mode-nav')).toBeVisible();
  await expect(page.locator('.lesson-content-title')).toBeVisible();

  for (let lesson = 0; lesson < 5; lesson += 1) {
    await page.locator('[data-action="complete-lesson"]').click();
  }
  await expect(page.locator('.exam-question-nav-item')).toHaveCount(5);
  dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
});
