import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?test-reset=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?test-reset=2#day-01');
  await expect(page.locator('.lesson-content-title')).toBeVisible();
});

async function getTopicCodingQuestions(page, day = 1, topicIndex = 0) {
  return page.evaluate(async ({ day, topicIndex }) => {
    const response = await fetch('./curriculum/day-' + String(day).padStart(3, '0') + '.json');
    const curriculum = await response.json();
    return curriculum.topics[topicIndex].coding_questions;
  }, { day, topicIndex });
}

async function completeTopicCoding(page, day = 1, topicIndex = 0) {
  const questions = await getTopicCodingQuestions(page, day, topicIndex);
  expect(questions).toHaveLength(5);
  await page.locator('.academy-mode-nav [data-view="practice"]').click();
  for (let index = 0; index < questions.length; index += 1) {
    await expect(page.locator('#codingSqlEditor')).toBeVisible();
    await expect(page.locator('.coding-question-nav-item[data-coding-question="' + index + '"]')).toHaveClass(/is-current/);
    await page.locator('#codingSqlEditor').fill(questions[index].expected_sql);
    await page.locator('[data-action="run-coding-question"]').click();
    if (index < 4) {
      await expect(page.locator('.coding-question-nav-item[data-coding-question="' + index + '"]')).toHaveClass(/is-complete/);
    }
  }
  await expect(page.locator('.exam-screen')).toBeVisible();
  return questions;
}

async function answerTopicExamCorrectly(page, codingQuestions) {
  const examQuestions = codingQuestions;
  for (let index = 0; index < 5; index += 1) {
    await page.locator('.exam-question-nav-item[data-exam-question="' + index + '"]').click();
    const correctOption = page.locator('.exam-option').filter({ hasText: examQuestions[index].expected_sql });
    await expect(correctOption).toHaveCount(1);
    await correctOption.click();
  }
}

test('opens readable topic lessons with practice and exam progression', async ({ page }) => {
  await expect(page.locator('.lesson-step')).toHaveCount(5);
  await expect(page.locator('.lesson-step[data-topic-index="0"]')).toBeEnabled();
  await expect(page.locator('.lesson-step[data-topic-index="1"]')).toBeDisabled();
  await expect(page.locator('.academy-mode-nav [data-view="exam"]')).toBeDisabled();
  await expect(page.locator('.lesson-content-title')).toContainText('SELECT');
  await expect(page.locator('.lesson-business-task')).toBeVisible();

  await page.locator('.academy-mode-nav [data-view="practice"]').click();
  await expect(page.locator('.coding-question-nav-item')).toHaveCount(5);
  await expect(page.locator('.coding-question-nav-item[data-coding-question="0"]')).toBeEnabled();
  await expect(page.locator('.coding-question-nav-item[data-coding-question="1"]')).toBeDisabled();
  await expect(page.locator('#codingSqlEditor')).toBeVisible();
  await expect(page.locator('#codingSqlEditor')).toHaveCSS('font-size', '15px');
});

test('rejects incorrect coding SQL and keeps the next question locked', async ({ page }) => {
  await page.locator('.academy-mode-nav [data-view="practice"]').click();
  await page.locator('#codingSqlEditor').fill('SELECT * FROM orders;');
  await page.locator('[data-action="run-coding-question"]').click();
  await expect(page.locator('.coding-feedback.needs-fix')).toBeVisible();
  await expect(page.locator('.coding-question-nav-item[data-coding-question="1"]')).toBeDisabled();
  await expect(page.locator('.academy-mode-nav [data-view="exam"]')).toBeDisabled();
});

test('five correct coding answers unlock a topic-specific MCQ exam and passing unlocks the next topic', async ({ page }) => {
  const questions = await completeTopicCoding(page);
  await expect(page.locator('.exam-question-nav-item')).toHaveCount(5);
  await expect(page.locator('.lesson-experience')).toHaveCount(0);
  await expect(page.locator('.exam-heading h1')).toContainText('SELECT');
  await expect(page.locator('.academy-mode-nav [data-view="exam"]')).toBeEnabled();

  await answerTopicExamCorrectly(page, questions);
  await page.locator('[data-action="submit-exam"]').click();
  await expect(page.locator('.exam-result-banner')).toContainText('Topic exam passed');
  await expect(page.locator('.exam-result-banner')).toContainText('5 out of 5');
  await page.locator('[data-action="continue-next-topic"]').click();
  await expect(page.locator('.lesson-content-title')).toContainText('Selecting Multiple Columns');
  await expect(page.locator('.lesson-step[data-topic-index="1"]')).toHaveClass(/is-active/);
  await expect(page.locator('.lesson-step[data-topic-index="2"]')).toBeDisabled();
});

test('coding completion and MCQ answers persist after reload', async ({ page }) => {
  const questions = await completeTopicCoding(page);
  await page.locator('.exam-question-nav-item[data-exam-question="0"]').click();
  const answer = page.locator('.exam-option').filter({ hasText: questions[0].expected_sql });
  await answer.click();
  await page.reload();
  await expect(page.locator('.exam-screen')).toBeVisible();
  await expect(page.locator('.exam-question-nav-item[data-exam-question="0"]')).toHaveClass(/is-answered/);
  await expect(page.locator('.exam-option.is-selected')).toHaveCount(1);
  await expect(page.locator('.academy-mode-nav [data-view="practice"]')).toContainText('5/5 coding passed');
});

test('a failed topic exam can be retried without losing coding completion', async ({ page }) => {
  const questions = await completeTopicCoding(page);
  const wrongOptions = [0, 0, 1, 0, 0];
  for (let index = 0; index < 5; index += 1) {
    await page.locator('.exam-question-nav-item[data-exam-question="' + index + '"]').click();
    await page.locator('.exam-option').nth(wrongOptions[index]).click();
  }
  await page.locator('[data-action="submit-exam"]').click();
  await expect(page.locator('.exam-result-banner')).toContainText('Keep practising');
  await page.locator('[data-action="retry-exam"]').click();
  await expect(page.locator('.exam-question-nav-item.is-answered')).toHaveCount(0);
  await expect(page.locator('.academy-mode-nav [data-view="practice"]')).toContainText('5/5 coding passed');
  await expect(page.locator('.academy-mode-nav [data-view="exam"]')).toBeEnabled();
});

test('all 275 published coding reference queries execute against the registered datasets', async ({ page }) => {
  test.setTimeout(120_000);
  const result = await page.evaluate(async () => {
    const { SQLEngine } = await import('./engines/sql-engine.js');
    const engine = new SQLEngine();
    await engine.init();
    const problems = [];
    let checked = 0;
    for (let dayNumber = 1; dayNumber <= 11; dayNumber += 1) {
      const file = './curriculum/day-' + String(dayNumber).padStart(3, '0') + '.json';
      const curriculum = await (await fetch(file)).json();
      for (let topicIndex = 0; topicIndex < curriculum.topics.length; topicIndex += 1) {
        const topic = curriculum.topics[topicIndex];
        for (let questionIndex = 0; questionIndex < (topic.coding_questions || []).length; questionIndex += 1) {
          const codingQuestion = topic.coding_questions[questionIndex];
          try {
            await engine.run(codingQuestion.expected_sql);
            checked += 1;
          } catch (error) {
            problems.push({
              day: dayNumber,
              topic: topic.title,
              question: questionIndex + 1,
              prompt: codingQuestion.prompt,
              sql: codingQuestion.expected_sql,
              error: error.message
            });
          }
        }
      }
    }
    return { checked, problems };
  });
  expect(result.problems, JSON.stringify(result.problems, null, 2)).toEqual([]);
  expect(result.checked).toBe(275);
});

test('the existing general SQL workspace remains available from topic practice', async ({ page }) => {
  await page.locator('.academy-mode-nav [data-view="practice"]').click();
  await page.locator('.coding-full-sql-workspace summary').click();
  await expect(page.locator('#sqlEditor')).toBeVisible();
  await page.locator('#sqlEditor').fill('SELECT COUNT(*) AS total_orders FROM orders;');
  await page.locator('[data-action="run-query"]').click();
  await expect(page.locator('#queryResults')).toContainText('150', { timeout: 45_000 });
});

test('lesson, coding, exam and full workspace fit mobile and desktop viewports', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['learn', 'practice']) {
      await page.locator('.academy-mode-nav [data-view="' + view + '"]').click();
      await expect(page.locator(view === 'learn' ? '.lesson-content-title' : '#codingSqlEditor')).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll('body *')].map(element => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, className: String(element.className || ''), right: Math.round(rect.right), width: Math.round(rect.width) };
        }).filter(item => item.right > document.documentElement.clientWidth + 1).sort((a, b) => b.right - a.right).slice(0, 8)
      }));
      expect(dimensions.document, view + ' horizontal overflow at ' + width + 'px: ' + JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(dimensions.viewport + 1);
    }
  }
});

test('overview, projects and progress remain accessible', async ({ page }) => {
  await page.getByRole('link', { name: 'AHK Academy overview' }).click();
  await expect(page.locator('.dashboard-hero')).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analytical project library' })).toBeVisible();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
});
