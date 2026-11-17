import { SQLEngine } from '../../engines/sql-engine.js';
import { progressStore } from './core/storage.js';

const appRoot = document.querySelector('#app');
const state = {
  manifest: null,
  index: null,
  day: null,
  activeDay: 1,
  activeTopic: 0,
  activeQuestion: 0,
  activeCodingQuestion: 0,
  examQuestionIndex: 0,
  codingDrafts: {},
  codingFeedback: {},
  view: 'dashboard',
  teachingMode: 'teacher',
  practiceTab: 'query',
  selectedDataset: 'orders',
  dataRegistry: null,
  sqlEngine: null,
  searchIndex: null,
  searchQuery: '',
  searchResults: [],
  searchTimer: null,
  projectSelection: null,
  theme: localStorage.getItem('ahk_academy_theme') || 'dark'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function renderInlineMarkdown(value) {
  let html = escapeHTML(value);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

function renderLessonMarkdown(value) {
  const lines = String(value || '').split(/\r?\n/);
  const output = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      output.push('</ul>');
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeList();
      output.push('<h4>' + renderInlineMarkdown(line.replace(/^###\s+/, '')) + '</h4>');
    } else if (/^##\s+/.test(line)) {
      closeList();
      output.push('<h3>' + renderInlineMarkdown(line.replace(/^##\s+/, '')) + '</h3>');
    } else if (/^#\s+/.test(line)) {
      closeList();
      output.push('<h2>' + renderInlineMarkdown(line.replace(/^#\s+/, '')) + '</h2>');
    } else if (/^[-*]\s+/.test(line)) {
      if (!listOpen) {
        output.push('<ul>');
        listOpen = true;
      }
      output.push('<li>' + renderInlineMarkdown(line.replace(/^[-*]\s+/, '')) + '</li>');
    } else {
      closeList();
      output.push('<p>' + renderInlineMarkdown(line) + '</p>');
    }
  }
  closeList();
  return output.join('');
}

const TEACHING_MODES = [
  { id: 'teacher', label: 'Teacher', description: 'Instructor-led lesson' },
  { id: 'explain', label: 'Explain', description: 'Concept in plain language' },
  { id: 'detailedlearning', label: 'Deep learning', description: 'Detailed reasoning and application' },
  { id: 'expose', label: 'Analyst mindset', description: 'How analysts think at work' }
];

const PROJECTS = [
  {
    id: 'retail-performance',
    track: 'SQL · Excel',
    level: 'Intermediate',
    title: 'Retail Sales & Profitability Review',
    brief: 'Prepare an auditable sales and margin review for a commercial director. Identify weak categories, regional differences, discount exposure and the products that require follow-up.',
    deliverables: ['Clean transaction extract', 'Category and region KPI summary', 'Profitability exceptions', 'Management recommendations'],
    outcome: 'A decision-ready trading review with traceable calculations.'
  },
  {
    id: 'customer-value',
    track: 'SQL · Python',
    level: 'Advanced',
    title: 'Customer Value & Retention Analysis',
    brief: 'Build a customer-level view from transaction data. Segment customers by revenue contribution, purchase frequency and recency, then identify retention opportunities.',
    deliverables: ['Customer-level analytical table', 'Segment definitions', 'High-value customer profile', 'Retention action plan'],
    outcome: 'A customer segmentation analysis that supports targeted commercial action.'
  },
  {
    id: 'executive-bi',
    track: 'Power BI · DAX',
    level: 'Advanced',
    title: 'Executive Performance Dashboard',
    brief: 'Design a management report that connects revenue, profit, orders and margin trends. Include clear metric definitions, time comparisons and drill-down paths.',
    deliverables: ['KPI dictionary', 'Star-schema model', 'DAX measures', 'Executive report pages'],
    outcome: 'A governed dashboard with consistent KPI definitions.'
  },
  {
    id: 'operations-review',
    track: 'Excel · Power BI',
    level: 'Intermediate',
    title: 'Operations & Service-Level Review',
    brief: 'Investigate delivery performance and operational exceptions. Compare shipping modes, highlight unusual delays and prepare an action-focused summary.',
    deliverables: ['Validated date fields', 'Service-level calculations', 'Exception analysis', 'Operations action log'],
    outcome: 'A practical review that helps operations teams prioritize process issues.'
  }
];

function appVersion() {
  return state.manifest?.version || 'local';
}

async function fetchJSON(path) {
  const url = './' + path + '?v=' + encodeURIComponent(appVersion());
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
  return response.json();
}

async function fetchText(path) {
  const url = './' + path + '?v=' + encodeURIComponent(appVersion());
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
  return response.text();
}

function publishedThrough() {
  return Number(state.manifest?.release_control?.published_through_day || state.index?.published_through_day || 0);
}

function dayMeta(day) {
  return state.index?.days?.find(item => Number(item.day) === Number(day));
}

function dayQuestions(day) {
  return (day?.topics || []).reduce((total, topic) => total + (topic.questions?.length || 0), 0);
}

function currentTopic() {
  return state.day?.topics?.[state.activeTopic] || null;
}

function currentCodingQuestion() {
  return currentTopic()?.coding_questions?.[state.activeCodingQuestion] || null;
}

function completedTopicCount() {
  return progressStore.getCompletedTopicCount(state.activeDay, state.day?.topics?.length || 5);
}

function codingQuestionCount() {
  return currentTopic()?.coding_questions?.length || 5;
}

function completedCodingQuestionCount() {
  return progressStore.getCodingQuestionCount(state.activeDay, state.activeTopic);
}

function areCodingQuestionsComplete() {
  return progressStore.areCodingQuestionsCompleted(state.activeDay, state.activeTopic, codingQuestionCount());
}

function codingDraftKey(questionIndex = state.activeCodingQuestion) {
  return [state.activeDay, state.activeTopic, questionIndex].join(':');
}

function buildExamQuestions(topic) {
  const challenges = topic?.coding_questions || [];
  if (challenges.length !== 5 || challenges.some(item => !item.expected_sql || !item.prompt)) return [];

  const fallbackStatements = [
    'SELECT order_id, sales FROM orders;',
    'SELECT category, SUM(sales) AS total_sales FROM orders GROUP BY category;',
    'SELECT region, COUNT(*) AS order_count FROM orders GROUP BY region;',
    'SELECT * FROM orders LIMIT 10;',
    'SELECT customer_name, SUM(sales) AS total_sales FROM orders GROUP BY customer_name;'
  ];
  const answerPositions = [1, 3, 0, 2, 1];

  return challenges.map((challenge, index) => {
    const correctSql = String(challenge.expected_sql).trim();
    const alternatives = [...new Set(challenges
      .map(item => String(item.expected_sql || '').trim())
      .filter(statement => statement && statement !== correctSql))];
    for (const statement of fallbackStatements) {
      if (alternatives.length >= 3) break;
      if (statement !== correctSql && !alternatives.includes(statement)) alternatives.push(statement);
    }
    const correctOption = answerPositions[index];
    const options = alternatives.slice(0, 3);
    options.splice(correctOption, 0, correctSql);
    return {
      id: challenge.id || 'coding-' + (index + 1),
      title: challenge.title || 'Coding challenge ' + (index + 1),
      prompt: challenge.prompt,
      options,
      correctOption
    };
  });
}

function isTopicExamUnlocked() {
  return Boolean(currentTopic()) && areCodingQuestionsComplete();
}

function buildCodingFeedback(result) {
  const actual = result.actual;
  const rows = actual.values.slice(0, 8).map(row =>
    '<tr>' + row.map(value => '<td>' + escapeHTML(value === null ? 'NULL' : value) + '</td>').join('') + '</tr>'
  ).join('');
  const table = actual.columns.length
    ? '<div class="table-scroll coding-result-table"><table class="data-table"><thead><tr>' +
      actual.columns.map(column => '<th>' + escapeHTML(column) + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<p class="coding-result-empty">The query executed but returned no tabular result.</p>';
  return '<div class="coding-result-meta">' + actual.totalRows + ' row(s) · ' + actual.elapsed + ' ms' +
    (actual.truncated ? ' · first 8 rows shown' : '') + '</div>' + table;
}

async function runTopicCodingQuestion() {
  const challenge = currentCodingQuestion();
  const editor = $('#codingSqlEditor');
  if (!challenge || !editor) return;
  const query = editor.value.trim();
  if (!query) {
    toast('Write a SQL query before checking your answer.', 'warning');
    return;
  }

  const key = codingDraftKey();
  state.codingDrafts[key] = editor.value;
  try {
    localStorage.setItem('ahk_academy_coding_drafts_v1', JSON.stringify(state.codingDrafts));
  } catch { /* The active editor remains available if storage is blocked. */ }

  const button = $('[data-action="run-coding-question"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking SQL…';
  }
  const status = $('#codingEngineStatus');
  if (status) status.textContent = 'Running your SQL against the learning dataset…';

  try {
    const engine = await ensureSQLEngine();
    const result = await engine.validate(query, challenge.expected_sql, {
      orderSensitive: /\bORDER\s+BY\b/i.test(challenge.expected_sql)
    });
    state.codingFeedback[key] = {
      passed: result.passed,
      message: result.passed
        ? 'Your SQL matches the expected result. This coding question is complete.'
        : !result.columnsMatch
          ? 'The query ran, but the output columns or their order do not match the requirement.'
          : 'The query ran, but the returned records do not match the expected result. Review your filters, joins, calculations or grouping.',
      html: buildCodingFeedback(result)
    };

    if (result.passed) {
      const completion = progressStore.completeCodingQuestion(
        state.activeDay, state.activeTopic, state.activeCodingQuestion, codingQuestionCount()
      );
      if (completion.ok && completion.allCompleted) {
        state.view = 'exam';
        state.examQuestionIndex = 0;
        toast('All five coding questions passed. The topic exam is unlocked.', 'success');
      } else {
        state.activeCodingQuestion = Math.min(
          completedCodingQuestionCount(),
          codingQuestionCount() - 1
        );
        toast('Correct. Coding question ' + (state.activeCodingQuestion) + ' of 5 is complete.', 'success');
      }
    } else {
      toast('The SQL ran, but the result needs correction.', 'warning');
    }
    render();
  } catch (error) {
    state.codingFeedback[key] = {
      passed: false,
      message: error.message || 'The SQL could not be executed.',
      html: ''
    };
    if (status) status.textContent = 'SQL needs attention';
    render();
  } finally {
    const retryButton = $('[data-action="run-coding-question"]');
    if (retryButton) retryButton.disabled = false;
  }
}

function currentQuestion() {
  return state.day?.topics?.[state.activeTopic]?.questions?.[state.activeQuestion] || null;
}

function buildExamQuestions(topic) {
  const challenges = topic?.coding_questions || [];
  if (challenges.length !== 5 || challenges.some(item => !item.expected_sql || !item.prompt)) return [];
  const fallbackStatements = [
    'SELECT order_id, sales FROM orders;',
    'SELECT category, SUM(sales) AS total_sales FROM orders GROUP BY category;',
    'SELECT region, COUNT(*) AS order_count FROM orders GROUP BY region;',
    'SELECT * FROM orders LIMIT 10;',
    'SELECT customer_name, SUM(sales) AS total_sales FROM orders GROUP BY customer_name;'
  ];
  const answerPositions = [1, 3, 0, 2, 1];
  return challenges.map((challenge, index) => {
    const correctSql = String(challenge.expected_sql).trim();
    const alternatives = [...new Set(challenges.map(item => String(item.expected_sql || '').trim())
      .filter(statement => statement && statement !== correctSql))];
    for (const statement of fallbackStatements) {
      if (alternatives.length >= 3) break;
      if (statement !== correctSql && !alternatives.includes(statement)) alternatives.push(statement);
    }
    const correctOption = answerPositions[index];
    const options = alternatives.slice(0, 3);
    options.splice(correctOption, 0, correctSql);
    return {
      id: challenge.id || 'coding-' + (index + 1),
      title: challenge.title || 'Coding challenge ' + (index + 1),
      prompt: challenge.prompt,
      options,
      correctOption
    };
  });
}
\nfunction isUnlocked(day) {function isUnlocked(day) {
  return progressStore.isDayUnlocked(day, publishedThrough());
}

function toast(message, tone = 'info') {
  const element = $('#academyToast');
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.add('visible');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.remove('visible'), 2800);
}

function setBusy(value) {
  appRoot.setAttribute('aria-busy', value ? 'true' : 'false');
}

function updateHash(day) {
  history.replaceState(null, '', '#day-' + String(day).padStart(2, '0'));
}

async function loadDay(day, options = {}) {
  const target = Number(day);
  if (!isUnlocked(target)) {
    toast('Pass the previous day’s topic exams to unlock this day.', 'warning');
    return;
  }
  const meta = dayMeta(target);
  if (!meta?.file) {
    toast('This curriculum resource is not available yet.', 'warning');
    return;
  }

  state.activeDay = target;
  state.activeQuestion = Number(options.question || 0);
  state.examQuestionIndex = 0;
  state.teachingMode = 'teacher';
  progressStore.setActiveDay(target);
  setBusy(true);
  appRoot.innerHTML = '<div class="academy-loading"><span class="loading-mark">AHK</span><strong>Preparing your learning workspace</strong><span>Loading Day ' + target + ' curriculum…</span></div>';

  try {
    state.day = await fetchJSON('curriculum/' + meta.file);
    const topicCount = state.day.topics?.length || 0;
    const passedTopics = progressStore.getCompletedTopicCount(target, topicCount);
    const requestedTopic = Number(options.topic ?? Math.min(passedTopics, topicCount - 1));
    state.activeTopic = Math.min(Math.max(0, requestedTopic), Math.max(0, topicCount - 1));
    if (!progressStore.isTopicUnlocked(target, state.activeTopic, topicCount)) {
      state.activeTopic = Math.min(passedTopics, Math.max(0, topicCount - 1));
    }
    const codingCount = progressStore.getCodingQuestionCount(target, state.activeTopic);
    state.activeCodingQuestion = Math.min(codingCount, 4);
    const examState = progressStore.getTopicExamState(target, state.activeTopic);
    state.view = progressStore.areCodingQuestionsCompleted(target, state.activeTopic, 5)
      ? 'exam'
      : codingCount > 0 ? 'practice' : 'learn';
    if (options.view && ['learn', 'practice', 'exam'].includes(options.view)) {
      if (options.view !== 'exam' || progressStore.areCodingQuestionsCompleted(target, state.activeTopic, 5)) {
        state.view = options.view;
      }
    }
    if (examState.submitted && !examState.passed) state.view = 'exam';
    if (options.render !== false) render();
    if (options.updateUrl !== false) updateHash(target);
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (error) {
    renderFatal(error);
  } finally {
    setBusy(false);
  }
}

function renderFatal(error) {
  appRoot.innerHTML = '<main class="academy-fatal"><div class="fatal-card"><span class="eyebrow">AHK Academy · Runtime</span><h1>The learning workspace could not load.</h1><p>' +
    escapeHTML(error?.message || 'An unexpected error occurred.') +
    '</p><button type="button" class="button button-primary" data-action="retry">Retry loading</button></div></main>';
  setBusy(false);
}

function renderHeader() {
  const learningMode = ['learn', 'practice', 'exam'].includes(state.view);
  const examUnlocked = state.day ? isTopicExamUnlocked() : false;
  const items = learningMode
    ? [
        { id: 'learn', label: 'Learn', detail: 'Understand the topic' },
        { id: 'practice', label: 'Practice', detail: completedCodingQuestionCount() + '/5 coding passed' },
        { id: 'exam', label: 'Exam', detail: examUnlocked ? 'MCQ unlocked' : 'Pass 5 coding tasks', disabled: !examUnlocked }
      ]
    : [
        { id: 'dashboard', label: 'Overview' },
        { id: 'learn', label: 'Learn' },
        { id: 'practice', label: 'Practice' },
        { id: 'projects', label: 'Projects' },
        { id: 'progress', label: 'Progress' }
      ];
  return '<header class="academy-header"><div class="academy-header-inner">' +
    '<a class="academy-brand" href="./" aria-label="AHK Academy overview" data-view="dashboard"><span class="brand-mark">AHK</span><span class="brand-copy"><strong>AHK Academy</strong><small>Data Analyst Learning Hub</small></span></a>' +
    '<nav class="academy-nav ' + (learningMode ? 'academy-mode-nav' : '') + '" aria-label="Main navigation">' +
    items.map(item => '<button type="button" class="nav-button ' + (state.view === item.id ? 'active' : '') +
      '" data-view="' + item.id + '" aria-label="' + item.label + '" ' +
      (item.disabled ? 'disabled aria-disabled="true"' : '') + '><span>' + item.label + '</span>' +
      (item.detail ? '<small>' + item.detail + '</small>' : '') +
      (item.id === 'exam' && !examUnlocked ? '<span class="nav-lock" aria-hidden="true">⌑</span>' : '') +
      '</button>').join('') +
    '</nav>' +
    '<div class="academy-search-wrap"><label class="search-box"><span aria-hidden="true">⌕</span><input id="academySearch" type="search" value="' +
      escapeHTML(state.searchQuery) + '" placeholder="Search lessons, topics..." autocomplete="off" aria-label="Search lessons, topics and business requests"><kbd>Ctrl K</kbd></label><div id="academySearchResults" class="search-results" hidden></div></div>' +
    '<button type="button" class="theme-toggle" data-action="toggle-theme" aria-label="Switch theme" aria-pressed="' +
      (state.theme === 'dark') + '"><span aria-hidden="true">' + (state.theme === 'dark' ? '☀' : '◐') +
      '</span><span class="theme-label">' + (state.theme === 'dark' ? 'Light' : 'Dark') + '</span></button>' +
    '<div class="learner-chip"><span class="learner-avatar">AHK</span><span><strong>My workspace</strong><small>Personal progress · saved locally</small></span></div>' +
    '</div></header>';
}

function renderSidebar() {
  const groups = [
    { title: 'SQL & Data Foundations', short: 'SQL', start: 1, end: 25 },
    { title: 'Excel & Business Reporting', short: 'XL', start: 26, end: 50 },
    { title: 'Power BI & DAX', short: 'BI', start: 51, end: 75 },
    { title: 'Python & Pandas', short: 'PY', start: 76, end: 100 }
  ];
  const published = publishedThrough();
  const available = (state.index?.days || []).filter(item => Number(item.day) <= published);
  const completed = progressStore.getState().completedDays.filter(day => day <= published).length;
  const activeGroup = groups.find(group => state.activeDay >= group.start && state.activeDay <= group.end) || groups[0];
  const groupDays = available.filter(item => Number(item.day) >= activeGroup.start && Number(item.day) <= activeGroup.end);

  return '<aside class="left-rail">' +
    '<section class="panel roadmap-panel">' +
      '<div class="roadmap-heading"><div><span class="eyebrow">COURSE NAVIGATION</span><h2>Your learning path</h2><p>100-day analyst development plan</p></div><span class="roadmap-count">' + String(published).padStart(2, '0') + '<small> / 100</small></span></div>' +
      '<div class="roadmap-progress-card"><div class="roadmap-progress-copy"><span>Published curriculum</span><strong>' + published + '%</strong></div><div class="roadmap-progress-track"><span style="width:' + published + '%"></span></div><div class="roadmap-progress-foot"><span>' + available.length + ' lessons available</span><span>' + completed + ' completed</span></div></div>' +
      '<div class="roadmap-track-heading"><span>YOUR CURRENT TRACK</span><span>' + escapeHTML(activeGroup.short) + '</span></div>' +
      '<div class="roadmap-current-track"><div class="roadmap-track-mark">' + escapeHTML(activeGroup.short) + '</div><div><strong>' + escapeHTML(activeGroup.title) + '</strong><small>Days ' + String(activeGroup.start).padStart(2, '0') + '–' + activeGroup.end + ' · ' + groupDays.length + ' published</small></div></div>' +
      '<div class="roadmap-group"><div class="roadmap-group-title"><span>AVAILABLE LESSONS</span><span>' + groupDays.length + '</span></div><div class="day-list">' +
        groupDays.map(item => {
          const day = Number(item.day);
          const isCurrent = day === state.activeDay;
          const isComplete = progressStore.isDayCompleted(day);
          const unlocked = isUnlocked(day);
          const title = item.title?.replace(/^.*?—\s*/, '') || 'Untitled lesson';
          return '<button type="button" class="day-button ' + (isCurrent ? 'current ' : '') + (isComplete ? 'completed ' : '') + (!unlocked ? 'locked' : '') + '" data-day="' + day + '" ' + (!unlocked ? 'disabled' : '') + ' aria-current="' + (isCurrent ? 'page' : 'false') + '">' +
            '<span class="day-index">' + String(day).padStart(2, '0') + '</span><span class="day-copy"><strong>' + escapeHTML(title) + '</strong><small>' + (isComplete ? 'Completed' : unlocked ? 'Available to learn' : 'Complete previous day to unlock') + '</small></span><span class="day-state">' + (isComplete ? '✓' : unlocked ? '›' : '•') + '</span></button>';
        }).join('') +
      '</div></div>' +
      '<div class="roadmap-up-next"><span class="roadmap-up-next-icon">↗</span><div><strong>Progress unlocks the next lesson</strong><small>Review all business requests, complete the day, then continue in sequence.</small></div></div>' +
      '<div class="roadmap-other-tracks">' + groups.filter(group => group.start !== activeGroup.start).map(group => {
        const count = available.filter(item => Number(item.day) >= group.start && Number(item.day) <= group.end).length;
        return '<div class="roadmap-other-track"><span class="other-track-mark">' + escapeHTML(group.short) + '</span><span><strong>' + escapeHTML(group.title) + '</strong><small>Days ' + String(group.start).padStart(2, '0') + '–' + group.end + '</small></span><em>' + (count ? count + ' live' : 'In roadmap') + '</em></div>';
      }).join('') + '</div>' +
    '</section>' +
  '</aside>';
}

function renderTeaching(topic) {
  const teaching = topic?.teaching || {};
  const mode = TEACHING_MODES.find(item => item.id === state.teachingMode) || TEACHING_MODES[0];
  const content = teaching[mode.id] || teaching.explain || topic?.business_skill || 'This lesson content will be added in a future curriculum revision.';
  const example = teaching.example || teaching.example_sql || teaching.syntax || teaching.expected_sql || '';
  const tabs = TEACHING_MODES.map(item => {
    const selected = item.id === state.teachingMode;
    return '<button type="button" role="tab" id="teaching-tab-' + escapeHTML(item.id) + '" aria-controls="teaching-panel" aria-selected="' + selected + '" tabindex="' + (selected ? '0' : '-1') + '" class="mode-tab ' + (selected ? 'active' : '') + '" data-mode="' + escapeHTML(item.id) + '"><strong>' + escapeHTML(item.label) + '</strong><small>' + escapeHTML(item.description) + '</small></button>';
  }).join('');

  return '<section class="teaching-panel" id="examples"><div class="section-heading"><div><span class="eyebrow">LEARN THE CONCEPT</span><h3>Teaching workspace</h3></div><span class="content-tag">Guided lesson</span></div>' +
    '<div class="mode-tabs" role="tablist" aria-label="Teaching modes">' + tabs + '</div>' +
    '<div class="teaching-copy" id="teaching-panel" role="tabpanel" aria-labelledby="teaching-tab-' + escapeHTML(mode.id) + '"><div class="teaching-mode-label">' + escapeHTML(mode.label) + '</div><div class="teaching-text">' + renderLessonMarkdown(content) + '</div></div>' +
    (example ? '<div class="example-card"><div class="example-card-head"><div><span class="eyebrow">WORKED EXAMPLE</span><strong>Apply the concept</strong></div><button type="button" class="button button-quiet button-small" data-action="copy-example">Copy example</button></div><pre><code>' + escapeHTML(example) + '</code></pre></div>' : '') +
    '</section>';
}

function renderQuestionCard(question, topicIndex, questionIndex) {
  const solved = progressStore.isSolved(state.activeDay, topicIndex, questionIndex);
  const status = solved ? 'Reviewed' : 'Not reviewed';
  const output = Array.isArray(question.output) ? question.output.join(' · ') : (question.required_output || 'Business-ready analytical result');
  const hint = question.validation || question.success_criteria || question.request || 'Identify the required fields, filters and calculations before writing your solution.';
  return '<article class="question-card ' + (solved ? 'solved' : '') + '" data-task="' + topicIndex + ':' + questionIndex + '">' +
    '<div class="question-card-head"><div class="question-label"><span class="question-number">Q' + (questionIndex + 1) + '</span><span class="stakeholder">' + escapeHTML(question.role || 'Business stakeholder') + '</span></div><span class="difficulty">' + escapeHTML(question.difficulty || 'Business task') + '</span></div>' +
    '<p class="scenario-text">' + escapeHTML(question.scenario || '') + '</p><p class="request-text"><strong>Request</strong>' + escapeHTML(question.request || question.question || '') + '</p>' +
    '<div class="deliverable"><span>Expected output</span><p>' + escapeHTML(output) + '</p></div>' +
    '<div class="question-actions"><button type="button" class="button button-quiet button-small" data-task-action="hint" data-hint="' + escapeHTML(hint) + '">Show hint</button><button type="button" class="button button-secondary button-small" data-task-action="practice" data-topic="' + topicIndex + '" data-question="' + questionIndex + '">Practice this</button><button type="button" class="button button-complete button-small ' + (solved ? 'is-done' : '') + '" data-task-action="toggle" data-topic="' + topicIndex + '" data-question="' + questionIndex + '">' + (solved ? '✓ ' + status : 'Mark reviewed') + '</button></div>' +
    '<div class="hint-panel" hidden></div></article>';
}

function renderTopic(topic, index) {
  if (!topic) return '<div class="empty-state">No topic is available for this day.</div>';
  const questions = topic.questions || [];
  const solved = questions.filter((question, questionIndex) => progressStore.isSolved(state.activeDay, index, questionIndex)).length;
  return '<section class="topic-section"><div class="topic-title-row"><div><span class="eyebrow">TOPIC ' + String(index + 1).padStart(2, '0') + '</span><h2>' + escapeHTML(topic.title) + '</h2><p>' + escapeHTML(topic.business_skill || 'Apply this skill to a practical business request.') + '</p></div><span class="topic-counter">' + solved + '/' + questions.length + ' reviewed</span></div>' +
    renderTeaching(topic) +
    '<section class="business-requests"><div class="section-heading"><div><span class="eyebrow">PRACTICAL APPLICATION</span><h3>Business requests</h3></div><span class="content-tag">' + questions.length + ' tasks</span></div>' +
    questions.map((question, questionIndex) => renderQuestionCard(question, index, questionIndex)).join('') + '</section></section>';
}

function renderTopicStepper(topics) {
  const completed = completedTopicCount();
  return topics.map((item, index) => {
    const done = progressStore.isTopicCompleted(state.activeDay, index);
    const active = index === state.activeTopic;
    const locked = index > completed;
    return '<button type="button" class="lesson-step ' + (active ? 'is-active ' : '') + (done ? 'is-complete ' : '') + (locked ? 'is-locked' : '') + '" data-topic-index="' + index + '" ' + (locked ? 'disabled' : '') + ' aria-current="' + (active ? 'step' : 'false') + '">' +
      '<span class="lesson-step-number">' + (done ? '✓' : String(index + 1).padStart(2, '0')) + '</span>' +
      '<span class="lesson-step-copy"><strong>' + escapeHTML(item.title) + '</strong><small>' + (done ? 'Exam passed' : active ? 'Current topic' : 'Locked') + '</small></span>' +
      '<span class="lesson-step-state" aria-hidden="true">' + (done ? '✓' : locked ? '⌑' : active ? '●' : '○') + '</span></button>';
  }).join('');
}

function renderLearningHeader(day, topic, modeLabel) {
  return '<div class="learning-context"><div class="learning-breadcrumb"><span class="breadcrumb-track">' +
    escapeHTML(day.track) + ' FOUNDATIONS</span><span>/</span><strong>DAY ' +
    String(day.day).padStart(2, '0') + '</strong><span>/</span><strong>' +
    escapeHTML(topic.title) + '</strong></div><span class="mode-label"><span>▣</span> ' +
    modeLabel + '</span></div>';
}

function renderLesson() {
  const day = state.day;
  const topics = day?.topics || [];
  if (!topics.length) return '<div class="empty-state">No topics are available for this day.</div>';
  const topic = topics[state.activeTopic];
  if (!topic) return '<div class="empty-state">This topic is not available.</div>';
  const completed = completedTopicCount();
  const teaching = topic.teaching || {};
  const codingDone = completedCodingQuestionCount();
  const questionTotal = topic.coding_questions?.length || 5;
  const progressPercent = Math.round((completed / topics.length) * 100);
  const alreadyPassed = progressStore.isTopicCompleted(state.activeDay, state.activeTopic);
  const nextTopic = topics[state.activeTopic + 1];
  const stepper = renderTopicStepper(topics);

  return '<section class="lesson-experience">' +
    renderLearningHeader(day, topic, 'LESSON MODE') +
    '<header class="learning-day-heading"><div><span class="eyebrow">' +
      escapeHTML(day.track) + ' FOUNDATIONS <span>/</span> TOPIC ' +
      String(state.activeTopic + 1).padStart(2, '0') + ' OF ' + topics.length +
      '</span><h1>' + escapeHTML(topic.title) + '</h1><p>' +
      escapeHTML(topic.business_skill || day.description || 'Understand the concept, study the example, then apply it to business data.') +
      '</p></div><span class="day-status-pill">' +
      (alreadyPassed ? 'TOPIC COMPLETED' : 'LEARNING IN PROGRESS') + '</span></header>' +
    '<nav class="lesson-stepper" aria-label="Topics in this learning day">' + stepper + '</nav>' +
    '<div class="lesson-progress-bar"><span>Day progress</span><div class="lesson-progress-track"><i style="width:' +
      progressPercent + '%"></i></div><strong>' + completed + ' of ' + topics.length + ' topics passed</strong></div>' +
    '<div class="lesson-main-grid"><main class="lesson-content-card">' +
      '<div class="lesson-content-heading"><div><span class="eyebrow">TOPIC ' +
      String(state.activeTopic + 1).padStart(2, '0') + ' · LEARN THE CONCEPT</span><h2 class="lesson-content-title">' +
      escapeHTML(topic.title) + '</h2><p>' + escapeHTML(topic.business_skill || 'Build the concept before solving the coding tasks.') +
      '</p></div><span class="lesson-content-status ' + (alreadyPassed ? 'is-done' : '') + '">' +
      (alreadyPassed ? '✓ EXAM PASSED' : 'READY TO LEARN') + '</span></div>' +
      renderTeaching(topic) +
      '<section class="lesson-business-task"><div class="business-task-icon">▣</div><div><span class="eyebrow">BUSINESS APPLICATION</span><p>' +
      escapeHTML(teaching.business_question || topic.questions?.[0]?.request || topic.business_skill || 'Apply the concept to a realistic business requirement.') +
      '</p><span class="business-task-note">Understand the requirement first. You will write and run SQL in the next stage.</span></div></section>' +
      '<section class="lesson-start-practice"><div class="lesson-start-copy"><span class="eyebrow">NEXT STEP</span><strong>Five coding questions for this topic</strong><p>' +
      codingDone + ' of ' + questionTotal + ' coding answers passed. Your SQL is checked against the actual learning dataset.</p></div>' +
      '<button type="button" class="button lesson-complete-button" data-view="practice">Start coding practice <span>→</span></button></section>' +
      '<details class="lesson-extra-practice"><summary>Review the original business requests</summary><div class="lesson-extra-practice-list">' +
      (topic.questions || []).map((question, index) => renderQuestionCard(question, state.activeTopic, index)).join('') +
      '</div></details>' +
      (alreadyPassed ? '<footer class="lesson-completion-footer"><div class="completion-message"><span class="completion-icon">✓</span><div><strong>Topic exam passed</strong><small>' +
        (nextTopic ? 'The next topic is unlocked: ' + escapeHTML(nextTopic.title) : 'All topics in this day are complete.') +
      '</small></div></div><div class="lesson-footer-actions"><button type="button" class="button lesson-complete-button" data-action="continue-next-topic">' +
        (nextTopic ? 'Continue to next topic' : 'Continue to next day') + ' <span>→</span></button></div></footer>' : '') +
    '</main><aside class="lesson-side-column">' +
      '<section class="lesson-side-card"><h3><span>☷</span> LEARNING PATH</h3><ol class="lesson-outline"><li class="is-current"><span></span><p>Learn the concept</p></li><li><span></span><p>Complete five coding questions</p></li><li><span></span><p>Pass the topic MCQ exam</p></li><li><span></span><p>Unlock the next topic</p></li></ol></section>' +
      '<section class="lesson-side-card"><h3><span>◎</span> LEARNING TARGET</h3><p class="lesson-learning-target">' +
      escapeHTML(topic.business_skill || 'Translate the business requirement into a correct SQL query.') +
      '</p></section><section class="lesson-side-card lesson-progress-card"><h3><span>▥</span> TOPIC STATUS</h3>' +
      '<div class="lesson-progress-caption"><strong>Coding practice</strong><b>' + codingDone + ' / ' + questionTotal + '</b></div>' +
      '<div class="lesson-progress-track"><i style="width:' + Math.round((codingDone / questionTotal) * 100) + '%"></i></div>' +
      '<p>' + (alreadyPassed ? 'Topic assessment passed.' : 'The exam unlocks after all five coding answers pass.') + '</p></section>' +
    '</aside></div></section>';
}

function renderTopicPractice() {
  const day = state.day;
  const topic = currentTopic();
  const questions = topic?.coding_questions || [];
  if (questions.length !== 5) {
    return '<section class="coding-practice-screen"><div class="exam-error"><h1>Coding practice unavailable</h1><p>This topic must contain exactly five coding questions.</p><button class="button button-secondary" data-view="learn">Return to lesson</button></div></section>';
  }

  const completedCount = completedCodingQuestionCount();
  const questionIndex = Math.min(state.activeCodingQuestion, questions.length - 1);
  const question = questions[questionIndex];
  const key = codingDraftKey(questionIndex);
  const draft = state.codingDrafts[key] || question.starter_sql || '';
  const feedback = state.codingFeedback[key];
  const allDone = completedCount >= questions.length;
  const stepButtons = questions.map((item, index) => {
    const done = progressStore.isCodingQuestionCompleted(state.activeDay, state.activeTopic, index);
    const active = index === questionIndex;
    const locked = index > completedCount;
    return '<button type="button" class="coding-question-nav-item ' + (active ? 'is-current ' : '') +
      (done ? 'is-complete ' : '') + (locked ? 'is-locked' : '') + '" data-coding-question="' + index + '" ' +
      (locked ? 'disabled' : '') + ' aria-current="' + (active ? 'step' : 'false') + '">' +
      '<span class="coding-nav-number">' + (done ? '✓' : 'Q' + (index + 1)) + '</span><span><strong>Question ' +
      (index + 1) + '</strong><small>' + (done ? 'Passed' : active ? 'In progress' : 'Locked') +
      '</small></span></button>';
  }).join('');
  const feedbackHtml = feedback
    ? '<section class="coding-feedback ' + (feedback.passed ? 'is-correct' : 'needs-fix') + '">' +
      '<div class="coding-feedback-heading"><strong>' + (feedback.passed ? '✓ Answer accepted' : 'Review your result') +
      '</strong><span>' + (feedback.passed ? 'Passed' : 'Try again') + '</span></div><p>' +
      escapeHTML(feedback.message) + '</p>' + feedback.html + '</section>'
    : '<section class="coding-feedback coding-feedback-placeholder"><strong>Your result will appear here.</strong><p>Run your SQL to execute it against the academy dataset and check the returned columns and rows.</p></section>';

  return '<section class="coding-practice-screen">' +
    renderLearningHeader(day, topic, 'CODING PRACTICE') +
    '<header class="coding-practice-heading"><div><span class="eyebrow">TOPIC ' +
      String(state.activeTopic + 1).padStart(2, '0') + ' · HANDS-ON SQL</span><h1>' +
      escapeHTML(topic.title) + ' — Coding Practice</h1><p>Five business coding questions. Write the query, run it, and pass the result check to complete each question.</p></div>' +
      '<span class="coding-practice-count">' + completedCount + ' / 5 PASSED</span></header>' +
    '<nav class="coding-question-nav" aria-label="Five coding questions">' + stepButtons + '</nav>' +
    '<div class="coding-practice-progress"><strong>Question ' + (questionIndex + 1) + ' of 5</strong><div class="lesson-progress-track"><i style="width:' +
      Math.round((completedCount / 5) * 100) + '%"></i></div><span>' + completedCount + ' completed</span></div>' +
    '<div class="coding-practice-grid"><main class="coding-workspace-card">' +
      '<div class="coding-task-header"><div><span class="eyebrow">CODING QUESTION ' + String(questionIndex + 1).padStart(2, '0') +
      ' / 05</span><h2>' + escapeHTML(question.title) + '</h2></div><span class="coding-difficulty">' +
      escapeHTML(question.difficulty || 'Business task') + '</span></div>' +
      '<div class="coding-scenario"><span class="eyebrow">BUSINESS SCENARIO</span><p>' +
      escapeHTML(question.scenario || question.prompt) + '</p></div>' +
      '<div class="coding-task-prompt"><span class="eyebrow">YOUR TASK</span><p>' + escapeHTML(question.prompt) + '</p></div>' +
      '<details class="coding-hint"><summary>Show hint</summary><p>' + escapeHTML(question.hint || 'Break the request into its selected columns, data source and business logic.') + '</p></details>' +
      '<div class="coding-editor-heading"><label for="codingSqlEditor">Write your SQL solution</label><span>SQL · Read-only database</span></div>' +
      '<textarea id="codingSqlEditor" class="coding-sql-editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="SQL coding answer">' +
      escapeHTML(draft) + '</textarea>' +
      '<div class="coding-editor-actions"><button type="button" class="button button-primary coding-run-button" data-action="run-coding-question">▶ Run and check answer</button>' +
      '<button type="button" class="button coding-secondary-button" data-action="format-coding-query">Format SQL</button>' +
      '<button type="button" class="button coding-secondary-button" data-action="reset-coding-query">Reset</button>' +
      '<span id="codingEngineStatus" role="status">SQL engine loads when you run your first answer.</span></div>' +
      feedbackHtml +
      '<footer class="coding-practice-footer"><button type="button" class="button lesson-save-button" data-view="learn">← Back to lesson</button>' +
      '<button type="button" class="button lesson-complete-button" data-view="exam" ' + (!allDone ? 'disabled aria-disabled="true"' : '') +
      '>Continue to topic exam <span>→</span></button></footer>' +
    '</main><aside class="coding-practice-side">' +
      '<section class="lesson-side-card"><h3><span>▤</span> PRACTICE CHECKLIST</h3><div class="coding-checklist">' +
      questions.map((item, index) => '<div class="coding-checklist-item ' +
        (progressStore.isCodingQuestionCompleted(state.activeDay, state.activeTopic, index) ? 'is-done' : '') + '">' +
        '<span>' + (progressStore.isCodingQuestionCompleted(state.activeDay, state.activeTopic, index) ? '✓' : String(index + 1).padStart(2, '0')) +
        '</span><div><strong>Question ' + (index + 1) + '</strong><small>' + escapeHTML(item.title) + '</small></div></div>').join('') +
      '</div></section><section class="lesson-side-card"><h3><span>◎</span> HOW ANSWERS ARE CHECKED</h3><p class="lesson-learning-target">The academy executes your SQL and compares the output columns and returned records with the expected result. Queries are read-only: SELECT and WITH statements only.</p></section>' +
      '<section class="lesson-side-card lesson-progress-card"><h3><span>▥</span> EXAM UNLOCK</h3><div class="lesson-progress-caption"><strong>Required</strong><b>5 / 5</b></div>' +
      '<div class="lesson-progress-track"><i style="width:' + Math.round((completedCount / 5) * 100) + '%"></i></div><p>' +
      (allDone ? 'All coding questions passed. Your topic exam is ready.' : (5 - completedCount) + ' coding questions remaining before the exam.') + '</p></section>' +
    '</aside></div>' +
    (allDone ? '<section class="coding-unlock-banner"><div><strong>All five coding questions passed.</strong><p>Your topic-specific MCQ exam is now unlocked.</p></div><button type="button" class="button lesson-complete-button" data-view="exam">Open exam <span>→</span></button></section>' : '') +
  '</section>';
}

function renderExam() {
  const topic = currentTopic();
  const topics = state.day?.topics || [];
  const questions = buildExamQuestions(topic);
  if (!isTopicExamUnlocked()) {
    return '<section class="exam-screen"><div class="exam-error"><h1>Topic exam is locked</h1><p>Pass all five SQL coding questions for this topic before starting the MCQ exam.</p><button class="button button-secondary" data-view="practice">Return to coding practice</button></div></section>';
  }
  if (questions.length !== 5) {
    return '<section class="exam-screen"><div class="exam-error"><h1>Exam unavailable</h1><p>This topic needs five valid coding questions to create its exam.</p><button class="button button-secondary" data-view="learn">Return to lesson</button></div></section>';
  }

  const exam = progressStore.getTopicExamState(state.activeDay, state.activeTopic);
  const questionIndex = Math.min(state.examQuestionIndex, questions.length - 1);
  const question = questions[questionIndex];
  const answered = Object.keys(exam.answers).length;
  const remaining = questions.length - answered;
  const progressPercent = Math.round((answered / questions.length) * 100);
  const isSubmitted = exam.submitted;
  const isPassed = exam.passed;
  const allCodingPassed = completedCodingQuestionCount() === 5;
  const questionNav = questions.map((item, index) => {
    const hasAnswer = Object.prototype.hasOwnProperty.call(exam.answers, index);
    const active = index === questionIndex;
    const correct = isSubmitted && exam.answers[index] === item.correctOption;
    return '<button type="button" class="exam-question-nav-item ' + (active ? 'is-current ' : '') +
      (hasAnswer ? 'is-answered ' : '') + (isSubmitted ? (correct ? 'is-correct ' : 'is-incorrect ') : '') +
      '" data-exam-question="' + index + '" aria-current="' + (active ? 'step' : 'false') + '">' +
      '<span class="exam-nav-number">Q' + (index + 1) + '</span><span><strong>Question ' + (index + 1) +
      '</strong><small>' + (isSubmitted ? (correct ? 'Correct' : 'Review answer') : hasAnswer ? 'Answered' :
      active ? 'Current' : 'Not started') + '</small></span></button>';
  }).join('');

  const options = question.options.map((option, index) => {
    const selected = Number(exam.answers[questionIndex]) === index;
    const correct = isSubmitted && index === question.correctOption;
    const incorrect = isSubmitted && selected && !correct;
    return '<button type="button" class="exam-option ' + (selected ? 'is-selected ' : '') +
      (correct ? 'is-correct ' : '') + (incorrect ? 'is-incorrect ' : '') + '" data-exam-option="' + index + '" ' +
      (isSubmitted ? 'disabled' : '') + ' aria-pressed="' + selected + '">' +
      '<span class="exam-option-radio">' + (selected ? '●' : '') + '</span><strong class="exam-option-letter">' +
      String.fromCharCode(65 + index) + '.</strong><code>' + escapeHTML(option) + '</code>' +
      (correct ? '<span class="exam-answer-mark">Correct</span>' : incorrect ? '<span class="exam-answer-mark">Your answer</span>' : '') +
      '</button>';
  }).join('');

  const resultBanner = isSubmitted
    ? '<div class="exam-result-banner ' + (isPassed ? 'is-passed' : 'needs-review') + '"><span class="exam-result-icon">' +
      (isPassed ? '✓' : '!') + '</span><div><strong>' + (isPassed ? 'Topic exam passed' : 'Keep practising') +
      '</strong><small>You scored ' + exam.score + ' out of 5. ' +
      (isPassed ? 'The next topic is now unlocked.' : 'You need 4 correct answers to pass this topic.') +
      '</small></div></div>'
    : '';

  const nextTopic = topics[state.activeTopic + 1];
  const nextDayAvailable = state.activeDay < publishedThrough();
  const footerAction = isSubmitted
    ? (isPassed
      ? '<button type="button" class="button exam-next-button" data-action="continue-next-topic">' +
        (nextTopic ? 'Continue to next topic' : nextDayAvailable ? 'Continue to next day' : 'Finish learning day') + ' <span>→</span></button>'
      : '<button type="button" class="button exam-next-button" data-action="retry-exam">Retry exam <span>↻</span></button>')
    : (questionIndex < questions.length - 1
      ? '<button type="button" class="button exam-next-button" data-action="next-exam-question">Next question <span>→</span></button>'
      : '<button type="button" class="button exam-next-button" data-action="submit-exam">Submit topic exam <span>✓</span></button>');

  return '<section class="exam-screen">' +
    '<div class="exam-breadcrumb"><span>' + escapeHTML(state.day.track) + ' FOUNDATIONS</span><span>/</span><strong>DAY ' +
      String(state.activeDay).padStart(2, '0') + '</strong><span>/</span><b>TOPIC EXAM</b></div>' +
    '<header class="exam-heading"><div class="exam-trophy">♜</div><div><h1>' +
      escapeHTML(topic.title) + ' — Topic Exam</h1><p><span class="exam-unlocked-dot">✓</span> All five coding questions passed. This exam checks the same topic.</p></div>' +
      '<span class="exam-completion-badge">✓ 5/5 CODING PASSED</span></header>' +
    '<nav class="exam-question-nav" aria-label="Topic exam questions">' + questionNav + '</nav>' +
    '<div class="exam-progress-row"><strong>Question ' + (questionIndex + 1) + ' of 5</strong><div class="exam-progress-track"><i style="width:' +
      progressPercent + '%"></i></div><span>' + answered + ' answered <b>|</b> ' + remaining + ' remaining</span></div>' +
    '<div class="exam-main-grid"><main class="exam-question-card">' + resultBanner +
      '<div class="exam-question-meta"><span>QUESTION ' + String(questionIndex + 1).padStart(2, '0') +
      '</span><span>' + escapeHTML(question.title) + '</span><span>● MULTIPLE CHOICE</span></div>' +
      '<h2>Which SQL statement correctly fulfils this coding requirement?</h2><p class="exam-business-prompt">' +
      escapeHTML(question.prompt) + '</p>' +
      '<div class="exam-options" role="group" aria-label="Answer options for question ' + (questionIndex + 1) + '">' + options + '</div>' +
      '<footer class="exam-question-footer"><button type="button" class="button exam-save-button" data-view="practice">↶ Review coding practice</button>' +
      footerAction + '</footer></main>' +
      '<aside class="exam-summary-card"><h2><span>▥</span> TOPIC EXAM SUMMARY</h2>' +
      '<div class="exam-summary-row"><span>Coding questions passed</span><strong>' + (allCodingPassed ? '5 / 5' : completedCodingQuestionCount() + ' / 5') + '</strong></div>' +
      '<div class="exam-summary-row"><span>MCQ questions</span><strong>5</strong></div>' +
      '<div class="exam-summary-row"><span>Answered</span><strong>' + answered + '</strong></div>' +
      '<div class="exam-summary-row"><span>Remaining</span><strong>' + remaining + '</strong></div>' +
      '<div class="exam-summary-progress"><div><span>Exam progress</span><strong>' + progressPercent + '%</strong></div>' +
      '<div class="exam-progress-track"><i style="width:' + progressPercent + '%"></i></div></div>' +
      (isSubmitted && isPassed
        ? '<div class="exam-guidance exam-success-guidance"><strong>Next topic unlocked</strong><p>You passed this topic. Continue to the next topic in the learning path.</p></div>'
        : '<div class="exam-guidance"><strong>One question at a time.</strong><p>Your selected answers are saved automatically. Answer all five MCQs before submitting.</p></div>') +
      '<div class="exam-pass-rule">PASS MARK <strong>4 / 5</strong><span>80% required to unlock the next topic</span></div>' +
      '</aside></div></section>';
}

function renderRightRail(question) {
  const questions = state.day?.topics?.[state.activeTopic]?.questions || [];
  const title = question?.title || 'Stakeholder request';
  return '<aside class="right-rail"><section class="panel request-panel" id="businessCase"><div class="section-heading"><div><span class="eyebrow">REAL-WORLD SCENARIO</span><h2>Business request</h2></div><span class="question-position">Q' + (state.activeQuestion + 1) + ' / ' + questions.length + '</span></div>' +
    '<div class="request-switcher">' + questions.map((item, index) => '<button type="button" class="request-chip ' + (index === state.activeQuestion ? 'active' : '') + '" data-question="' + index + '" aria-pressed="' + (index === state.activeQuestion) + '">Q' + (index + 1) + '</button>').join('') + '</div>' +
    '<span class="request-stakeholder">' + escapeHTML(question?.role || 'Stakeholder') + '</span><h3 class="request-title">' + escapeHTML(title) + '</h3><p class="request-scenario">' + escapeHTML(question?.scenario || 'Select a business request to see its scenario.') + '</p>' +
    '<div class="request-task"><span>What you need to deliver</span><strong>' + escapeHTML(question?.request || question?.question || 'Translate the request into a reproducible analytical output.') + '</strong></div>' +
    '<div class="request-output"><span>Expected output</span><p>' + escapeHTML(Array.isArray(question?.output) ? question.output.join(' · ') : (question?.required_output || 'A clear, auditable analytical result')) + '</p></div>' +
    '</section>' + renderPractice() + '</aside>';
}

function renderDatasetOptions() {
  const datasets = state.dataRegistry?.datasets || [];
  return datasets.filter(dataset => dataset.status !== 'disabled').map(dataset =>
    '<option value="' + escapeHTML(dataset.id) + '" ' + (dataset.id === state.selectedDataset ? 'selected' : '') + '>' + escapeHTML(dataset.name) + ' · ' + Number(dataset.row_count || 0) + ' rows</option>'
  ).join('');
}

function renderPractice() {
  const tabs = [
    { id: 'query', label: 'SQL editor' },
    { id: 'schema', label: 'Dataset schema' },
    { id: 'task', label: 'Current task' }
  ];
  const tabsHTML = tabs.map(item => {
    const selected = state.practiceTab === item.id;
    return '<button type="button" role="tab" id="practice-tab-' + item.id + '" aria-controls="practice-pane-' + item.id + '" aria-selected="' + selected + '" tabindex="' + (selected ? '0' : '-1') + '" class="practice-tab ' + (selected ? 'active' : '') + '" data-practice-tab="' + item.id + '">' + item.label + '</button>';
  }).join('');
  const queryPane = '<label class="editor-label" for="sqlEditor">Write your query</label><textarea id="sqlEditor" class="sql-editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="SQL query editor" placeholder="SELECT category, SUM(sales) AS total_sales&#10;FROM orders&#10;GROUP BY category;"></textarea><div class="editor-actions"><button type="button" class="button button-primary" data-action="run-query">▶ Run query</button><button type="button" class="button button-secondary" data-action="format-query">Format</button><button type="button" class="button button-quiet" data-action="clear-query">Clear</button><span id="engineStatus" class="engine-status" role="status">Engine ready to initialize</span></div><div id="queryResults" class="query-results" aria-live="polite"><div class="results-placeholder"><strong>Your query results will appear here.</strong><span>Start with a SELECT statement. The database is read-only.</span></div></div>';
  const schemaPane = '<div id="datasetDetails" class="dataset-details"><button type="button" class="button button-secondary" data-action="load-preview">Load schema and sample rows</button></div>';
  const taskPane = '<div class="active-task"><span class="eyebrow">ACTIVE BUSINESS REQUEST</span><strong>' + escapeHTML(currentQuestion()?.request || 'Choose a question from the lesson.') + '</strong><p>Use the stakeholder request as the specification for your analysis. Review the result before marking the task complete.</p></div>';
  const pane = (id, content) => '<div id="practice-pane-' + id + '" role="tabpanel" aria-labelledby="practice-tab-' + id + '" class="practice-pane" data-pane="' + id + '" ' + (state.practiceTab !== id ? 'hidden' : '') + '>' + content + '</div>';

  return '<section class="panel practice-panel" id="practice"><div class="section-heading practice-heading"><div><span class="eyebrow">HANDS-ON WORKSPACE</span><h2>SQL practice</h2><p>Run read-only SQL against the registered learning datasets.</p></div><span class="engine-badge"><i></i> Browser SQL</span></div>' +
    '<div class="dataset-row"><label for="datasetSelect">Preview dataset</label><select id="datasetSelect" class="dataset-select">' + renderDatasetOptions() + '</select></div>' +
    '<div class="practice-tabs" role="tablist" aria-label="Practice workspace">' + tabsHTML + '</div>' +
    pane('query', queryPane) +
    pane('schema', schemaPane) +
    pane('task', taskPane) +
    '<p class="practice-footnote">All registered datasets are loaded into the local SQL session when you run your first query. Table names use their dataset IDs with hyphens replaced by underscores.</p></section>';
}

function renderDashboard() {
  const published = publishedThrough();
  const stats = progressStore.getStats(published);
  const activeMeta = dayMeta(state.activeDay) || dayMeta(1);
  const currentTitle = state.day?.title || activeMeta?.title || 'SQL Foundations';
  const currentDescription = state.day?.description || 'Build practical capability through a guided lesson and realistic business requests.';
  const reviewedPercent = stats.courseCompletion;
  const tracks = [
    { short: 'SQL', number: '01', title: 'SQL & Data Foundations', range: 'Days 01–25', description: 'Retrieve, join, transform and analyse business data with confidence.', start: 1, end: 25, tone: 'sql', skills: ['Querying', 'Joins', 'CTEs', 'Window functions'] },
    { short: 'XL', number: '02', title: 'Excel & Business Reporting', range: 'Days 26–50', description: 'Clean operational data, build dependable models and produce clear reporting.', start: 26, end: 50, tone: 'excel', skills: ['Formulas', 'PivotTables', 'Power Query', 'Reporting'] },
    { short: 'BI', number: '03', title: 'Power BI & DAX', range: 'Days 51–75', description: 'Model data, define measures and communicate performance through dashboards.', start: 51, end: 75, tone: 'powerbi', skills: ['Data model', 'DAX', 'Time intelligence', 'Dashboards'] },
    { short: 'PY', number: '04', title: 'Python & Pandas', range: 'Days 76–100', description: 'Explore, clean and analyse datasets with a repeatable Python workflow.', start: 76, end: 100, tone: 'python', skills: ['Python', 'Pandas', 'Visualisation', 'Automation'] }
  ];
  const trackCards = tracks.map(track => {
    const live = Math.max(0, Math.min(track.end, published) - track.start + 1);
    const percentage = Math.round((live / (track.end - track.start + 1)) * 100);
    const status = live ? 'CURRENTLY PUBLISHED' : track.start === 26 ? 'NEXT LEARNING TRACK' : 'PROGRAM ROADMAP';
    const availability = live ? live + ' of 25 lessons published' : 'Scheduled for ' + track.range.toLowerCase();
    return '<article class="track-card track-' + track.tone + '">' +
      '<div class="track-card-top"><span class="track-number">' + track.number + '</span><span class="track-status">' + status + '</span></div>' +
      '<div class="track-card-title"><span class="track-icon">' + track.short + '</span><div><span class="track-range">' + track.range + '</span><h3>' + track.title + '</h3></div></div>' +
      '<p>' + track.description + '</p>' +
      '<div class="track-skills">' + track.skills.map(skill => '<span>' + skill + '</span>').join('') + '</div>' +
      '<div class="track-card-bottom"><div class="track-release"><div><span>' + availability + '</span><strong>' + percentage + '%</strong></div><div class="track-release-bar"><span style="width:' + percentage + '%"></span></div></div>' +
      (live ? '<button type="button" class="track-open" data-view="learn" aria-label="Open SQL learning track">Open track <span>↗</span></button>' : '<span class="track-future">In sequence</span>') +
      '</div></article>';
  }).join('');
  const resumeDay = isUnlocked(state.activeDay) ? state.activeDay : (isUnlocked(stats.nextDay) ? stats.nextDay : 1);
  const resumeMeta = dayMeta(resumeDay) || activeMeta;
  const cleanTitle = currentTitle.replace(/^.*?—\s*/, '');

  return '<section class="dashboard-view">' +
    '<section class="dashboard-hero">' +
      '<div class="dashboard-hero-copy">' +
        '<span class="dashboard-kicker"><span class="kicker-dot"></span> AHK ACADEMY <span class="kicker-divider">/</span> ANALYST DEVELOPMENT PROGRAM</span>' +
        '<h1>Learn the craft.<br><em>Lead with insight.</em></h1>' +
        '<p>A structured, business-first learning environment for building practical data analyst skills—from the first query to an executive-ready dashboard.</p>' +
        '<div class="dashboard-actions"><button type="button" class="button dashboard-primary" data-view="learn">Continue learning <span>→</span></button><button type="button" class="dashboard-secondary" data-view="projects">Explore projects <span>↗</span></button></div>' +
        '<div class="dashboard-proof"><span><b>100</b> learning days</span><i></i><span><b>4</b> core tools</span><i></i><span><b>Business-first</b> curriculum</span></div>' +
      '</div>' +
      '<div class="dashboard-hero-art" aria-hidden="true">' +
        '<div class="hero-art-orbit orbit-one"></div><div class="hero-art-orbit orbit-two"></div>' +
        '<div class="hero-art-card"><div class="hero-art-head"><span>ANALYST SKILL MAP</span><span class="live-indicator">● LIVE PROGRAM</span></div>' +
          '<div class="hero-art-score"><div><small>CURRICULUM</small><strong>100<span> days</span></strong><em>One clear learning sequence</em></div><div class="hero-art-ring"><span>4</span><small>tracks</small></div></div>' +
          '<div class="hero-art-bars"><div><span>SQL</span><i><b style="width:44%"></b></i><strong>01</strong></div><div><span>EXCEL</span><i><b style="width:0%"></b></i><strong>02</strong></div><div><span>POWER BI</span><i><b style="width:8%"></b></i><strong>03</strong></div><div><span>PYTHON</span><i><b style="width:8%"></b></i><strong>04</strong></div></div>' +
          '<div class="hero-art-footer"><span>LEARN</span><b>→</b><span>APPLY</span><b>→</b><span>ANALYSE</span></div>' +
        '</div><div class="hero-art-float"><span class="float-mark">↗</span><span><strong>Built around business</strong><small>Not disconnected tutorials</small></span></div>' +
      '</div>' +
    '</section>' +

    '<div class="dashboard-metrics">' +
      '<article class="dashboard-metric"><span class="metric-symbol metric-symbol-green">01</span><div><small>Published lessons</small><strong>' + published + '<span> / 100</span></strong><em>Available in the curriculum</em></div></article>' +
      '<article class="dashboard-metric"><span class="metric-symbol metric-symbol-blue">02</span><div><small>Business exercises</small><strong>' + stats.publishedQuestions + '</strong><em>Realistic stakeholder requests</em></div></article>' +
      '<article class="dashboard-metric"><span class="metric-symbol metric-symbol-amber">03</span><div><small>Days completed</small><strong>' + stats.completedDays + '<span> / 100</span></strong><em>Based on completed checkpoints</em></div></article>' +
      '<article class="dashboard-metric"><span class="metric-symbol metric-symbol-violet">04</span><div><small>Requests reviewed</small><strong>' + stats.solvedQuestions + '</strong><em>Saved on this device</em></div></article>' +
    '</div>' +

    '<div class="dashboard-section-heading"><div><span class="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Your next learning session</h2><p>A clear next step, with your progress kept on this device.</p></div><button type="button" class="text-link" data-view="progress">View progress <span>→</span></button></div>' +
    '<div class="dashboard-session-grid">' +
      '<article class="continue-card"><div class="continue-card-top"><span class="continue-label"><i></i> READY TO CONTINUE</span><span class="continue-day">DAY ' + String(resumeDay).padStart(2, '0') + '</span></div>' +
        '<span class="continue-track">' + escapeHTML(resumeMeta?.track || 'SQL') + ' · FOUNDATIONS</span><h3>' + escapeHTML(resumeMeta?.title?.replace(/^.*?—\s*/, '') || cleanTitle) + '</h3>' +
        '<p>' + escapeHTML(resumeMeta?.description || currentDescription) + '</p>' +
        '<div class="continue-card-footer"><span><b>45 min</b> typical session</span><button type="button" class="button continue-button" data-view="learn">Resume lesson <span>→</span></button></div></article>' +
      '<article class="review-card"><div class="review-card-head"><div><span class="eyebrow">YOUR LEARNING RECORD</span><h3>Exercise review</h3></div><span class="review-period">PUBLISHED CONTENT</span></div>' +
        '<div class="review-ring-wrap"><div class="review-ring" style="--review:' + reviewedPercent + '%"><div><strong>' + reviewedPercent + '%</strong><small>reviewed</small></div></div><div class="review-ring-copy"><strong>' + stats.solvedQuestions + ' of ' + stats.publishedQuestions + '</strong><span>business requests reviewed</span><small>Only your marked work is counted.</small></div></div>' +
        '<div class="review-card-foot"><span>Learning activity is stored locally</span><button type="button" data-view="progress">View details ↗</button></div></article>' +
    '</div>' +

    '<div class="dashboard-section-heading track-heading"><div><span class="eyebrow">THE 100-DAY CURRICULUM</span><h2>Four tracks. One analyst skill set.</h2><p>Build capability in sequence, then apply it to practical business work.</p></div><span class="section-counter">01 <i>—</i> 04</span></div>' +
    '<div class="track-grid">' + trackCards + '</div>' +

    '<section class="learning-method"><div class="learning-method-intro"><span class="eyebrow">THE AHK LEARNING METHOD</span><h2>Understand it.<br>Apply it. <em>Prove it.</em></h2><p>Each lesson connects a technical skill to the kind of request an analyst receives at work.</p></div>' +
      '<div class="method-step"><span class="method-number">01</span><div><strong>Learn the concept</strong><p>Focused explanations, worked examples and an analyst mindset.</p></div></div>' +
      '<div class="method-step"><span class="method-number">02</span><div><strong>Respond to business requests</strong><p>Three realistic stakeholder tasks for each lesson topic.</p></div></div>' +
      '<div class="method-step"><span class="method-number">03</span><div><strong>Practise with data</strong><p>Use the browser SQL workspace and registered learning datasets.</p></div></div>' +
    '</section>' +
    '<footer class="dashboard-footer"><span class="footer-brand">AHK <b>ACADEMY</b></span><span>Business-first data analyst training</span><span>Progress stays in this browser</span></footer>' +
  '</section>';
}

function renderProjects() {
  const selected = PROJECTS.find(project => project.id === state.projectSelection);
  if (selected) {
    return '<section class="content-view projects-view"><div class="view-heading"><div><span class="eyebrow">PORTFOLIO WORKSPACE</span><h1>Project brief</h1><p>Translate the learning path into a business-facing analytical deliverable.</p></div><button type="button" class="button button-secondary" data-action="back-projects">← All projects</button></div><article class="project-detail panel"><span class="project-track">' + escapeHTML(selected.track) + ' · ' + escapeHTML(selected.level) + '</span><h2>' + escapeHTML(selected.title) + '</h2><p>' + escapeHTML(selected.brief) + '</p><h3>Required deliverables</h3><ol>' + selected.deliverables.map(item => '<li>' + escapeHTML(item) + '</li>').join('') + '</ol><div class="project-outcome"><strong>Business outcome</strong><p>' + escapeHTML(selected.outcome) + '</p></div><p class="project-note">Project briefs are planning resources. Add your completed workbook, SQL script, dashboard or notebook to your portfolio when you finish the work.</p></article></section>';
  }
  return '<section class="content-view projects-view"><div class="view-heading"><div><span class="eyebrow">BUILD PROOF OF SKILL</span><h1>Analytical project library</h1><p>Practical project briefs designed around real business decisions, not isolated tool exercises.</p></div><span class="content-tag">4 project briefs</span></div><div class="project-grid">' +
    PROJECTS.map(project => '<article class="project-card panel"><span class="project-track">' + escapeHTML(project.track) + '</span><h2>' + escapeHTML(project.title) + '</h2><p>' + escapeHTML(project.brief) + '</p><div class="project-meta"><span>' + escapeHTML(project.level) + '</span><span>' + project.deliverables.length + ' deliverables</span></div><button type="button" class="button button-secondary" data-project="' + project.id + '">Open project brief →</button></article>').join('') +
    '</div></section>';
}

function renderProgress() {
  const stats = progressStore.getStats(publishedThrough());
  const stateData = progressStore.getState();
  const publishedDays = state.index?.days || [];
  const completedList = stateData.completedDays;
  return '<section class="content-view progress-view"><div class="view-heading"><div><span class="eyebrow">LEARNING ANALYTICS</span><h1>Your progress</h1><p>Track completed work separately from the amount of curriculum currently published.</p></div><span class="content-tag">Saved on this device</span></div>' +
    '<div class="progress-metric-grid"><article class="metric-card panel"><span>Questions reviewed</span><strong>' + stats.solvedQuestions + '</strong><small>Of ' + stats.publishedQuestions + ' published questions</small></article><article class="metric-card panel"><span>Days completed</span><strong>' + stats.completedDays + '</strong><small>Of 100 total days</small></article><article class="metric-card panel"><span>Published curriculum</span><strong>' + stats.publishedDays + '%</strong><small>' + stats.publishedDays + ' days available in the repository</small></article><article class="metric-card panel"><span>Published question review</span><strong>' + stats.courseCompletion + '%</strong><small>Based on currently published questions</small></article></div>' +
    '<section class="panel progress-breakdown"><div class="section-heading"><div><span class="eyebrow">DAY-BY-DAY</span><h2>Published learning days</h2></div><span class="content-tag">' + publishedDays.length + ' available resources</span></div>' +
    publishedDays.map(meta => {
      const day = Number(meta.day);
      const solved = progressStore.getSolvedCount(day);
      const total = Number(meta.business_questions || 15);
      const done = progressStore.isDayCompleted(day);
      const unlocked = isUnlocked(day);
      return '<div class="day-progress-row"><div class="day-progress-title"><strong>Day ' + String(day).padStart(2, '0') + '</strong><span>' + escapeHTML(meta.title.replace(/^.*?—\s*/, '')) + '</span></div><div class="day-progress-track"><span style="width:' + Math.min(100, (solved / Math.max(1, total)) * 100) + '%"></span></div><span class="day-progress-count">' + solved + '/' + total + '</span><span class="day-progress-status ' + (done ? 'done' : unlocked ? 'available' : 'locked') + '">' + (done ? 'Completed' : unlocked ? 'Available' : 'Locked') + '</span><button type="button" class="button button-quiet button-small" data-open-day="' + day + '" ' + (!unlocked ? 'disabled' : '') + '>Open</button></div>';
    }).join('') +
    '</section><div class="progress-note"><strong>How progress is calculated</strong><p>Question review counts only tasks you explicitly mark as reviewed. A day becomes complete only when all questions in that day are reviewed and you select Complete day. The next published day then unlocks.</p></div>' +
    (completedList.length ? '<button type="button" class="button button-quiet" data-action="export-progress">Export my progress (JSON)</button>' : '') +
    '</section>';
}

function render() {
  const activeView = state.view;
  const viewContent = activeView === 'dashboard'
    ? renderDashboard()
    : activeView === 'projects'
      ? renderProjects()
      : activeView === 'progress'
        ? renderProgress()
        : activeView === 'exam'
          ? renderExam()
          : activeView === 'practice'
            ? renderTopicPractice()
            : renderLesson();
  appRoot.innerHTML = '<div class="academy-shell">' + renderHeader() +
    '<main id="main" class="academy-main"><div class="view-panel" data-view-panel="' + activeView + '">' + viewContent + '</div></main>' +
    '<div id="academyToast" class="academy-toast" role="status" aria-live="polite"></div></div>';
  setBusy(false);
}

function parseCSVPreview(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(source || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some(value => value !== '')) rows.push(row);
  }
  return { headers: rows.shift() || [], rows };
}

async function renderDatasetPreview() {
  const container = $('#datasetDetails');
  const meta = state.dataRegistry?.datasets?.find(dataset => dataset.id === state.selectedDataset);
  if (!container || !meta) return;
  container.innerHTML = '<div class="results-placeholder">Loading dataset metadata…</div>';
  try {
    const [schema, csv] = await Promise.all([fetchJSON(meta.schema), fetchText(meta.data)]);
    const parsed = parseCSVPreview(csv);
    container.innerHTML = '<div class="dataset-schema-grid">' + (schema.columns || []).map(column => {
      const name = Array.isArray(column) ? column[0] : column.name;
      const type = Array.isArray(column) ? column[1] : column.type;
      return '<div class="schema-item"><strong>' + escapeHTML(name) + '</strong><span>' + escapeHTML(type) + '</span></div>';
    }).join('') + '</div><div class="sample-data-heading"><strong>' + escapeHTML(meta.name) + '</strong><span>' + parsed.rows.length + ' rows · sample of 8</span></div><div class="table-scroll"><table class="data-table"><thead><tr>' + parsed.headers.map(header => '<th>' + escapeHTML(header) + '</th>').join('') + '</tr></thead><tbody>' + parsed.rows.slice(0, 8).map(row => '<tr>' + row.map(value => '<td>' + escapeHTML(value) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  } catch (error) {
    container.innerHTML = '<div class="results-placeholder error-state">' + escapeHTML(error.message) + '</div>';
  }
}

async function ensureSQLEngine() {
  if (state.sqlEngine?.ready) return state.sqlEngine;
  if (!state.sqlEngine) state.sqlEngine = new SQLEngine();
  const status = $('#engineStatus');
  if (status) status.textContent = 'Loading SQL.js and registered datasets…';
  await state.sqlEngine.init();
  if (status) status.textContent = 'Ready · ' + state.sqlEngine.getDatasets().length + ' tables loaded';
  return state.sqlEngine;
}

function renderQueryResults(result) {
  const container = $('#queryResults');
  if (!container) return;
  if (!result.columns.length) {
    container.innerHTML = '<div class="results-placeholder">Query executed successfully. No tabular result was returned.</div>';
    return;
  }
  container.innerHTML = '<div class="results-meta">' + result.totalRows + ' row(s) returned · ' + result.elapsed + ' ms' + (result.truncated ? ' · showing first ' + result.values.length : '') + '</div><div class="table-scroll"><table class="data-table"><thead><tr>' +
    result.columns.map(column => '<th>' + escapeHTML(column) + '</th>').join('') + '</tr></thead><tbody>' +
    result.rows.map(row => '<tr>' + result.columns.map(column => '<td>' + escapeHTML(row[column] === null ? 'NULL' : row[column]) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
}

async function runQuery() {
  const editor = $('#sqlEditor');
  const output = $('#queryResults');
  const status = $('#engineStatus');
  if (!editor || !output) return;
  const query = editor.value.trim();
  if (!query) {
    output.innerHTML = '<div class="results-placeholder">Write a SQL query before running it.</div>';
    return;
  }
  status.textContent = 'Executing query…';
  output.innerHTML = '<div class="results-placeholder">Running against your local learning datasets…</div>';
  try {
    const engine = await ensureSQLEngine();
    const result = await engine.run(query);
    renderQueryResults(result);
    status.textContent = result.elapsed + ' ms · ' + result.totalRows + ' rows';
  } catch (error) {
    status.textContent = 'Query needs attention';
    output.innerHTML = '<div class="results-placeholder error-state">' + escapeHTML(error.message) + '</div>';
  }
}

function formatSQL(query) {
  return String(query || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|LEFT JOIN|INNER JOIN|ON)\s+/gi, '\n$1 ')
    .replace(/,\s*/g, ', ')
    .trim();
}

async function ensureSearchIndex() {
  if (state.searchIndex) return state.searchIndex;
  const metas = state.index?.days || [];
  const days = await Promise.all(metas.map(async meta => {
    try {
      return await fetchJSON('curriculum/' + meta.file);
    } catch {
      return null;
    }
  }));
  const entries = [];
  for (const day of days.filter(Boolean)) {
    entries.push({
      type: 'Day',
      day: day.day,
      topic: 0,
      question: 0,
      title: day.title,
      text: [day.track, day.description].join(' ')
    });
    (day.topics || []).forEach((topic, topicIndex) => {
      entries.push({
        type: 'Topic',
        day: day.day,
        topic: topicIndex,
        question: 0,
        title: topic.title,
        text: [day.track, topic.business_skill, topic.teaching?.explain, topic.teaching?.teacher].join(' ')
      });
      (topic.questions || []).forEach((question, questionIndex) => {
        entries.push({
          type: 'Business request',
          day: day.day,
          topic: topicIndex,
          question: questionIndex,
          title: question.role || 'Business request',
          text: [question.scenario, question.request, question.validation, question.output].join(' ')
        });
      });
    });
  }
  state.searchIndex = entries;
  return entries;
}

async function searchContent(query) {
  const text = query.toLowerCase().trim();
  if (text.length < 2) return [];
  const entries = await ensureSearchIndex();
  const tokens = text.split(/\s+/).filter(Boolean);
  return entries
    .map(entry => {
      const haystack = (entry.title + ' ' + entry.text).toLowerCase();
      const title = entry.title.toLowerCase();
      let score = 0;
      if (title === text) score += 100;
      if (title.includes(text)) score += 40;
      for (const token of tokens) {
        if (title.includes(token)) score += 20;
        if (haystack.includes(token)) score += 5;
      }
      return { ...entry, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.day - b.day)
    .slice(0, 12);
}

function updateSearchResults(results) {
  const container = $('#academySearchResults');
  if (!container) return;
  if (!state.searchQuery.trim()) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.innerHTML = results.length
    ? results.map((result, index) => '<button type="button" class="search-result" data-search-result="' + index + '"><span class="search-result-type">' + escapeHTML(result.type) + ' · Day ' + String(result.day).padStart(2, '0') + '</span><strong>' + escapeHTML(result.title) + '</strong><small>' + escapeHTML(result.text).slice(0, 130) + '</small></button>').join('')
    : '<div class="search-empty">No matching published content. Try another keyword.</div>';
  state.searchResults = results;
}

function handleInput(event) {
  if (event.target.id !== 'academySearch') return;
  state.searchQuery = event.target.value;
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(async () => {
    try {
      const results = await searchContent(state.searchQuery);
      updateSearchResults(results);
    } catch (error) {
      updateSearchResults([]);
      toast('Search could not load curriculum content.', 'warning');
    }
  }, 180);
}

function handleChange(event) {
  if (event.target.id === 'datasetSelect') {
    state.selectedDataset = event.target.value;
    if (state.practiceTab === 'schema') renderDatasetPreview();
  }
}

async function handleClick(event) {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    event.preventDefault();
    const target = viewButton.dataset.view;
    if (target === 'exam' && !areAllLessonsComplete()) {
      toast('Complete all five lessons before opening the exam.', 'warning');
      return;
    }
    if (target === 'learn' && areAllLessonsComplete()) {
      state.view = 'exam';
    } else if (target === 'practice') {
      state.view = 'practice';
      history.replaceState(null, '', '#practice');
      render();
      window.setTimeout(() => $('#practice')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    } else {
      state.view = target;
    }
    state.projectSelection = null;
    if (target === 'dashboard') history.replaceState(null, '', '#overview');
    else if (target === 'learn' || target === 'exam') updateHash(state.activeDay);
    else history.replaceState(null, '', '#' + target);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const searchResult = event.target.closest('[data-search-result]');
  if (searchResult) {
    const result = state.searchResults[Number(searchResult.dataset.searchResult)];
    if (!result || !isUnlocked(result.day)) {
      toast('That lesson is still locked by the learning sequence.', 'warning');
      return;
    }
    state.searchQuery = '';
    await loadDay(result.day, { topic: result.topic, question: result.question });
    return;
  }

  const dayButton = event.target.closest('[data-day], [data-open-day]');
  if (dayButton) {
    await loadDay(Number(dayButton.dataset.day || dayButton.dataset.openDay));
    return;
  }

  const lessonButton = event.target.closest('[data-lesson-index]');
  if (lessonButton) {
    const lessonIndex = Number(lessonButton.dataset.lessonIndex);
    if (lessonIndex > completedLessonCount()) {
      toast('Complete the lessons in order to unlock this lesson.', 'warning');
      return;
    }
    state.activeTopic = lessonIndex;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const examQuestionButton = event.target.closest('[data-exam-question]');
  if (examQuestionButton && state.view === 'exam') {
    state.examQuestionIndex = Number(examQuestionButton.dataset.examQuestion);
    render();
    return;
  }

  const examOptionButton = event.target.closest('[data-exam-option]');
  if (examOptionButton && state.view === 'exam') {
    const examState = progressStore.getExamState(state.activeDay);
    if (examState.submitted) return;
    progressStore.setExamAnswer(state.activeDay, state.examQuestionIndex, Number(examOptionButton.dataset.examOption));
    render();
    return;
  }

  const topicButton = event.target.closest('[data-topic]:not([data-task-action])');
  if (topicButton) {
    state.activeTopic = Number(topicButton.dataset.topic);
    state.activeQuestion = 0;
    render();
    return;
  }

  const questionButton = event.target.closest('[data-question]');
  if (questionButton && !questionButton.dataset.taskAction) {
    state.activeQuestion = Number(questionButton.dataset.question);
    render();
    return;
  }

  const modeButton = event.target.closest('[data-mode]');
  if (modeButton) {
    state.teachingMode = modeButton.dataset.mode;
    render();
    return;
  }

  const practiceTab = event.target.closest('[data-practice-tab]');
  if (practiceTab) {
    state.practiceTab = practiceTab.dataset.practiceTab;
    render();
    if (state.practiceTab === 'schema') renderDatasetPreview();
    return;
  }

  const taskAction = event.target.closest('[data-task-action]');
  if (taskAction) {
    const topicIndex = Number(taskAction.dataset.topic ?? state.activeTopic);
    const questionIndex = Number(taskAction.dataset.question ?? state.activeQuestion);
    if (taskAction.dataset.taskAction === 'toggle') {
      const solved = !progressStore.isSolved(state.activeDay, topicIndex, questionIndex);
      progressStore.setSolved(state.activeDay, topicIndex, questionIndex, solved);
      render();
      toast(solved ? 'Question marked as reviewed.' : 'Question review status removed.');
    } else if (taskAction.dataset.taskAction === 'hint') {
      const panel = taskAction.closest('.question-card')?.querySelector('.hint-panel');
      if (panel) {
        panel.hidden = !panel.hidden;
        panel.textContent = taskAction.dataset.hint || 'Identify the required fields, filters and calculations before writing your solution.';
        taskAction.textContent = panel.hidden ? 'Show hint' : 'Hide hint';
      }
    } else if (taskAction.dataset.taskAction === 'practice') {
      state.activeTopic = topicIndex;
      state.activeQuestion = questionIndex;
      state.practiceTab = 'query';
      state.view = 'practice';
      render();
      window.setTimeout(() => $('#practice')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
    return;
  }

  const projectButton = event.target.closest('[data-project]');
  if (projectButton) {
    state.projectSelection = projectButton.dataset.project;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'toggle-theme') {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ahk_academy_theme', state.theme);
    document.documentElement.dataset.theme = state.theme;
    render();
  } else if (action === 'retry') {
    boot();
  } else if (action === 'save-progress') {
    progressStore.setActiveDay(state.activeDay);
    toast('Lesson progress saved on this device.', 'success');
  } else if (action === 'complete-lesson') {
    const total = state.day?.topics?.length || 5;
    const result = progressStore.completeLesson(state.activeDay, state.activeTopic, total);
    if (!result.ok) {
      toast(result.reason, 'warning');
      return;
    }
    if (result.allCompleted) {
      state.view = 'exam';
      state.examQuestionIndex = 0;
      toast('All five lessons completed. Your exam is now unlocked.', 'success');
    } else {
      state.activeTopic = result.completedCount;
      state.view = 'learn';
      toast('Lesson completed. Lesson ' + String(state.activeTopic + 1).padStart(2, '0') + ' is now unlocked.', 'success');
    }
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'next-exam-question') {
    const exam = progressStore.getExamState(state.activeDay);
    if (!Object.prototype.hasOwnProperty.call(exam.answers, state.examQuestionIndex)) {
      toast('Choose an answer before moving to the next question.', 'warning');
      return;
    }
    state.examQuestionIndex = Math.min(4, state.examQuestionIndex + 1);
    render();
  } else if (action === 'submit-exam') {
    const questions = buildExamQuestions(state.day);
    const result = progressStore.submitExam(state.activeDay, questions.map(question => question.correctOption), 4);
    if (!result.ok) {
      toast(result.reason, 'warning');
      return;
    }
    state.examQuestionIndex = 0;
    render();
    toast(result.passed ? 'Exam passed. The next published day is unlocked.' : 'Exam submitted. Review your answers and retry.', result.passed ? 'success' : 'warning');
  } else if (action === 'retry-exam') {
    if (progressStore.retryExam(state.activeDay)) {
      state.examQuestionIndex = 0;
      render();
      toast('New exam attempt started. Your previous score remains in your learning record.', 'info');
    }
  } else if (action === 'continue-next-day') {
    const nextDay = state.activeDay + 1;
    if (nextDay <= publishedThrough() && isUnlocked(nextDay)) {
      await loadDay(nextDay);
    } else {
      state.view = 'dashboard';
      history.replaceState(null, '', location.pathname + location.search);
      render();
    }
  } else if (action === 'save-exit') {
    progressStore.setActiveDay(state.activeDay);
    state.view = 'dashboard';
    history.replaceState(null, '', location.pathname + location.search);
    render();
  } else if (action === 'complete-day') {
    const result = progressStore.completeDay(state.activeDay, dayQuestions(state.day));
    if (!result.ok) {
      toast(result.reason, 'warning');
      return;
    }
    render();
  } else if (action === 'run-query') {
    runQuery();
  } else if (action === 'clear-query') {
    if ($('#sqlEditor')) $('#sqlEditor').value = '';
    if ($('#queryResults')) $('#queryResults').innerHTML = '<div class="results-placeholder">Editor cleared. Write a new query.</div>';
  } else if (action === 'format-query') {
    if ($('#sqlEditor')) $('#sqlEditor').value = formatSQL($('#sqlEditor').value);
  } else if (action === 'load-preview') {
    renderDatasetPreview();
  } else if (action === 'copy-example') {
    const code = $('.example-card code')?.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
      toast('Worked example copied.', 'success');
    } catch {
      toast('Clipboard access is unavailable in this browser.', 'warning');
    }
  } else if (action === 'back-projects') {
    state.projectSelection = null;
    render();
  } else if (action === 'export-progress') {
    const data = progressStore.getState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ahk-academy-progress.json';
    link.click();
    URL.revokeObjectURL(url);
    toast('Progress export prepared.', 'success');
  }
}

function handleTabKeydown(event, selector) {
  const activeTab = event.target.closest(selector);
  if (!activeTab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return false;
  const tabs = $$(selector);
  const currentIndex = tabs.indexOf(activeTab);
  if (currentIndex < 0 || !tabs.length) return false;
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];
  const attributeName = activeTab.hasAttribute('data-mode') ? 'data-mode' : 'data-practice-tab';
  const attributeValue = nextTab.getAttribute(attributeName);
  event.preventDefault();
  nextTab.click();
  document.querySelector(selector + '[' + attributeName + '="' + attributeValue + '"]')?.focus();
  return true;
}

function handleKeydown(event) {
  if (handleTabKeydown(event, '[data-mode]')) return;
  if (handleTabKeydown(event, '[data-practice-tab]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#academySearch')?.focus();
  }
  if (event.key === 'Escape') {
    const results = $('#academySearchResults');
    if (results) results.hidden = true;
  }
}

async function boot() {
  document.documentElement.dataset.theme = state.theme;
  setBusy(true);
  try {
    const [manifest, index, registry] = await Promise.all([
      fetchJSON('manifest.json'),
      fetchJSON('curriculum/index.json'),
      fetchJSON('datasets/index.json')
    ]);
    state.manifest = manifest;
    state.index = index;
    state.dataRegistry = registry;

    const published = publishedThrough();
    const hash = location.hash.match(/day-(\d+)/);
    const route = ['overview', 'projects', 'progress', 'practice'].includes(location.hash.slice(1)) ? location.hash.slice(1) : '';
    const requestedDay = hash ? Number(hash[1]) : progressStore.getState().activeDay;
    const firstUnlocked = Array.from({ length: published }, (_, index) => index + 1).find(day => isUnlocked(day)) || 1;
    const target = isUnlocked(requestedDay) ? requestedDay : firstUnlocked;
    state.activeDay = target;
    const hasLessonLink = Boolean(hash);
    await loadDay(target, { updateUrl: hasLessonLink, render: false });
    if (!hasLessonLink) state.view = route === 'overview' ? 'dashboard' : route || (areAllLessonsComplete() ? 'exam' : 'learn');
    render();
    if (route === 'practice') window.setTimeout(() => $('#practice')?.scrollIntoView({ behavior: 'auto', block: 'start' }), 50);
  } catch (error) {
    renderFatal(error);
  }
}

appRoot.addEventListener('click', handleClick);
appRoot.addEventListener('input', handleInput);
appRoot.addEventListener('change', handleChange);
document.addEventListener('keydown', handleKeydown);

boot();
