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
  theme: localStorage.getItem('ahk_academy_theme') || 'light'
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

function currentQuestion() {
  return state.day?.topics?.[state.activeTopic]?.questions?.[state.activeQuestion] || null;
}

function isUnlocked(day) {
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
    toast('Complete the previous published day to unlock this lesson.', 'warning');
    return;
  }

  const meta = dayMeta(target);
  if (!meta?.file) {
    toast('This curriculum resource is not available yet.', 'warning');
    return;
  }

  state.activeDay = target;
  state.activeTopic = Number(options.topic || 0);
  state.activeQuestion = Number(options.question || 0);
  state.teachingMode = 'teacher';
  state.view = 'learn';
  progressStore.setActiveDay(target);
  setBusy(true);
  appRoot.innerHTML = '<div class="academy-loading"><span class="loading-mark">AHK</span><strong>Preparing your learning workspace</strong><span>Loading Day ' + target + ' curriculum…</span></div>';

  try {
    state.day = await fetchJSON('curriculum/' + meta.file);
    const topicCount = state.day.topics?.length || 0;
    state.activeTopic = Math.min(state.activeTopic, Math.max(0, topicCount - 1));
    const questionCount = state.day.topics?.[state.activeTopic]?.questions?.length || 0;
    state.activeQuestion = Math.min(state.activeQuestion, Math.max(0, questionCount - 1));
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
  const items = [
    ['dashboard', 'Overview'],
    ['learn', 'Learn'],
    ['practice', 'Practice'],
    ['projects', 'Projects'],
    ['progress', 'Progress']
  ];
  return '<header class="academy-header"><div class="academy-header-inner">' +
    '<a class="academy-brand" href="./" aria-label="AHK Academy overview" data-view="dashboard"><span class="brand-mark">AHK</span><span class="brand-copy"><strong>AHK Academy</strong><small>Data Analyst Learning Hub</small></span></a>' +
    '<button type="button" class="theme-toggle" data-action="toggle-theme" aria-label="Switch theme" aria-pressed="' + (state.theme === 'dark') + '"><span aria-hidden="true">' + (state.theme === 'dark' ? '☀' : '◐') + '</span><span class="theme-label">' + (state.theme === 'dark' ? 'Light' : 'Dark') + '</span></button>' +
    '<nav class="academy-nav" aria-label="Main navigation">' +
    items.map(([id, label]) => '<button type="button" class="nav-button ' + (state.view === id ? 'active' : '') + '" data-view="' + id + '">' + label + '</button>').join('') +
    '</nav>' +
    '<div class="academy-search-wrap"><label class="search-box"><span aria-hidden="true">⌕</span><input id="academySearch" type="search" value="' + escapeHTML(state.searchQuery) + '" placeholder="Search lessons and tasks" autocomplete="off" aria-label="Search lessons, topics and business requests"><kbd>Ctrl K</kbd></label><div id="academySearchResults" class="search-results" hidden></div></div>' +
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

function renderLesson() {
  const day = state.day;
  const topics = day?.topics || [];
  const solved = progressStore.getSolvedCount(state.activeDay);
  const total = dayQuestions(day);
  const completed = progressStore.isDayCompleted(state.activeDay);
  const question = currentQuestion();
  const topic = topics[state.activeTopic];
  return '<div class="page-grid">' + renderSidebar() + '<section class="lesson-column">' +
    '<div class="lesson-breadcrumb"><span>Learning path</span><span>/</span><strong>' + escapeHTML(day.track) + '</strong><span>/</span><strong>Day ' + String(day.day).padStart(2, '0') + '</strong><span class="lesson-save-state">Saved locally</span></div>' +
    '<section class="lesson-hero"><div class="hero-topline"><span class="eyebrow">' + escapeHTML(day.track) + ' · DAY ' + String(day.day).padStart(2, '0') + '</span><span class="release-pill">Published lesson</span></div><h1>' + escapeHTML(day.title) + '</h1><p>' + escapeHTML(day.description || day.learning_objectives?.[0] || 'Build practical analytical capability through guided business learning.') + '</p>' +
    '<div class="hero-metrics"><div><strong>' + topics.length + '</strong><span>Topics</span></div><div><strong>' + total + '</strong><span>Business requests</span></div><div><strong>' + (day.estimated_time_minutes || 45) + ' min</strong><span>Estimated time</span></div><div><strong>' + solved + '/' + total + '</strong><span>Reviewed</span></div></div></section>' +
    '<section class="topic-navigator panel"><div class="section-heading"><div><span class="eyebrow">LESSON PLAN</span><h2>Today’s topics</h2></div><span class="content-tag">Follow in sequence</span></div><div class="topic-nav-list">' +
    topics.map((item, index) => {
      const topicSolved = (item.questions || []).filter((question, qi) => progressStore.isSolved(state.activeDay, index, qi)).length;
      return '<button type="button" class="topic-nav-button ' + (index === state.activeTopic ? 'active' : '') + '" data-topic="' + index + '" aria-current="' + (index === state.activeTopic ? 'step' : 'false') + '"><span class="topic-nav-number">' + String(index + 1).padStart(2, '0') + '</span><span class="topic-nav-copy"><strong>' + escapeHTML(item.title) + '</strong><small>' + topicSolved + '/' + (item.questions?.length || 0) + ' tasks reviewed</small></span><span class="topic-nav-arrow">›</span></button>';
    }).join('') +
    '</div></section>' +
    renderTopic(topic, state.activeTopic) +
    '<section class="day-checkpoint panel"><div><span class="eyebrow">DAILY CHECKPOINT</span><h3>' + (completed ? 'Day completed' : 'Finish this learning day') + '</h3><p>' + solved + ' of ' + total + ' business requests reviewed. Progress is stored locally on this device.</p></div><button type="button" class="button button-primary" data-action="complete-day" ' + (completed || solved < total ? 'disabled' : '') + '>' + (completed ? 'Completed ✓' : 'Complete day') + '</button></section>' +
    '</section>' + renderRightRail(question) + '</div>';
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
  const activeView = state.view === 'practice' ? 'learn' : state.view;
  const viewContent = activeView === 'dashboard'
    ? renderDashboard()
    : activeView === 'projects'
      ? renderProjects()
      : activeView === 'progress'
        ? renderProgress()
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
    if (target === 'practice') {
      state.view = 'practice';
      render();
      window.setTimeout(() => $('#practice')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } else {
      state.view = target;
      state.projectSelection = null;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
    const day = Number(dayButton.dataset.day || dayButton.dataset.openDay);
    await loadDay(day);
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
  } else if (action === 'complete-day') {
    const result = progressStore.completeDay(state.activeDay, dayQuestions(state.day));
    if (!result.ok) {
      toast(result.reason, 'warning');
      return;
    }
    render();
    const next = state.activeDay + 1;
    toast(next <= publishedThrough() ? 'Day completed. Day ' + next + ' is now unlocked.' : 'Day completed. Your progress is saved.', 'success');
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
    const requestedDay = hash ? Number(hash[1]) : progressStore.getState().activeDay;
    const firstUnlocked = Array.from({ length: published }, (_, index) => index + 1).find(day => isUnlocked(day)) || 1;
    const target = isUnlocked(requestedDay) ? requestedDay : firstUnlocked;
    state.activeDay = target;
    const hasLessonLink = Boolean(hash);
    await loadDay(target, { updateUrl: hasLessonLink, render: hasLessonLink });
    if (!hasLessonLink) {
      state.view = 'dashboard';
      render();
    }
  } catch (error) {
    renderFatal(error);
  }
}

appRoot.addEventListener('click', handleClick);
appRoot.addEventListener('input', handleInput);
appRoot.addEventListener('change', handleChange);
document.addEventListener('keydown', handleKeydown);

boot();
