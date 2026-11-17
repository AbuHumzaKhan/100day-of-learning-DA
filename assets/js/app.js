import { CurriculumService } from './core/curriculum-service.js';
import { createProgressStore } from './core/progress-store.js';
import { SQLEngine } from '../../engines/sql-engine.js';

const root = document.querySelector('#app');
const curriculum = new CurriculumService();
const progress = createProgressStore();
const sql = new SQLEngine();
let globalKeyboardHandlerBound = false;

const state = {
  day: null,
  activeDay: 1,
  activeTopic: 0,
  activeQuestion: 0,
  teachingMode: 'teacher',
  activeDataset: 'orders',
  searchIndex: null,
  searchTimer: null,
  engineReady: false,
  lastQuery: '',
  queryResult: null,
  queryError: '',
  sqlDraft: '',
  notice: '',
  theme: localStorage.getItem('ahk_academy_theme') === 'dark' ? 'dark' : 'light'
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const formatNumber = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
const groups = [
  { name: 'SQL', start: 1, end: 25 },
  { name: 'Excel', start: 26, end: 50 },
  { name: 'Power BI & DAX', start: 51, end: 75 },
  { name: 'Python & Pandas', start: 76, end: 100 }
];
const modeLabels = {
  teacher: 'Teacher',
  explain: 'Explain',
  detailedlearning: 'Deep learning',
  expose: 'Analyst mindset'
};

function publishedThrough() {
  return curriculum.getPublishedThrough();
}

function totalQuestions(day = state.day) {
  return (day?.topics || []).reduce((sum, topic) => sum + (topic.questions?.length || 0), 0);
}

function getTopic() {
  return state.day?.topics?.[state.activeTopic] || null;
}

function getQuestion() {
  return getTopic()?.questions?.[state.activeQuestion] || null;
}

function selectedTaskStatus(question = getQuestion()) {
  if (!question || !state.day) return 'not_started';
  return progress.getTaskStatus(state.activeDay, state.activeTopic, state.activeQuestion);
}

function unlockedDay() {
  for (let day = publishedThrough(); day >= 1; day -= 1) {
    if (progress.canOpenDay(day, publishedThrough())) return day;
  }
  return 1;
}

function showNotice(message, type = 'info') {
  state.notice = message;
  const live = $('#globalNotice');
  if (live) {
    live.textContent = message;
    live.dataset.type = type;
    live.hidden = false;
  }
}

function clearNotice() {
  state.notice = '';
  const live = $('#globalNotice');
  if (live) live.hidden = true;
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.hash = `day-${String(state.activeDay).padStart(2, '0')}`;
  history.replaceState(null, '', url);
}

async function loadDay(day, options = {}) {
  const n = Number(day);
  if (!progress.canOpenDay(n, publishedThrough())) {
    showNotice(n > publishedThrough()
      ? `Day ${n} has not been published yet.`
      : `Complete Day ${n - 1} to unlock Day ${n}.`, 'warning');
    return;
  }
  clearNotice();
  state.activeDay = n;
  state.activeTopic = 0;
  state.activeQuestion = 0;
  state.teachingMode = 'teacher';
  state.queryResult = null;
  state.queryError = '';
  state.sqlDraft = '';
  progress.setActiveDay(n);
  try {
    state.day = await curriculum.getDay(n);
    renderApp({ preserveScroll: options.preserveScroll === true });
    updateUrl();
    if (options.focus !== false) {
      const heading = $('#lessonTitle');
      heading?.focus({ preventScroll: true });
    }
  } catch (error) {
    renderFatal(error);
  }
}

function renderFatal(error) {
  root.innerHTML = `
    <main class="fatal-screen" role="main">
      <section class="fatal-card">
        <div class="brand-mark">AHK</div>
        <p class="eyebrow">AHK Academy · Runtime</p>
        <h1>We could not load your learning workspace.</h1>
        <p class="muted">${escapeHtml(error?.message || 'An unexpected error occurred.')}</p>
        <button class="button button-primary" id="retryBoot" type="button">Try again</button>
      </section>
    </main>`;
  $('#retryBoot')?.addEventListener('click', boot);
}

function renderHeader() {
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#top" aria-label="AHK Academy home">
          <span class="brand-mark">AHK</span>
          <span class="brand-copy"><strong>AHK Academy</strong><small>Data Analyst Learning Hub</small></span>
        </a>
        <button class="mobile-menu-button" id="mobileMenuButton" type="button" aria-expanded="false" aria-controls="primaryNav" aria-label="Open navigation">☰</button>
        <nav class="primary-nav" id="primaryNav" aria-label="Main navigation">
          <a href="#lesson" data-nav="lesson" class="nav-link active">Learn</a>
          <a href="#practice" data-nav="practice" class="nav-link">Practice</a>
          <a href="#projects" data-nav="projects" class="nav-link">Projects</a>
          <a href="#progress" data-nav="progress" class="nav-link">Progress</a>
        </nav>
        <div class="header-tools">
          <div class="search-wrap">
            <label class="sr-only" for="globalSearch">Search lessons and business requests</label>
            <span class="search-icon" aria-hidden="true">⌕</span>
            <input id="globalSearch" type="search" placeholder="Search lessons, topics…" autocomplete="off">
            <kbd>Ctrl K</kbd>
            <div class="search-results" id="searchResults" role="listbox" aria-label="Search results" hidden></div>
          </div>
          <button class="icon-button theme-toggle" id="themeToggle" type="button" aria-label="${state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}" title="Switch theme">◐</button>
        </div>
      </div>
    </header>`;
}

function renderHero() {
  const stateData = progress.getState();
  const completed = stateData.completedDays.length;
  const pct = Math.round((completed / 100) * 100);
  return `
    <section class="hero" id="top" aria-labelledby="heroTitle">
      <div class="hero-copy">
        <p class="eyebrow"><span class="eyebrow-dot"></span> BUSINESS-FIRST · 100-DAY PROGRAM</p>
        <h1 id="heroTitle">Become the analyst<br><span>businesses rely on.</span></h1>
        <p class="hero-description">A structured, hands-on journey through SQL, Excel, Power BI and Python. Learn the concept, solve real stakeholder requests and build practical analytical judgment.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#lesson">Continue learning <span aria-hidden="true">→</span></a>
          <a class="text-link" href="#projects">Explore projects</a>
        </div>
        <div class="hero-trust"><span class="trust-check">✓</span> Practical business scenarios <span class="trust-separator">·</span> Local progress <span class="trust-separator">·</span> GitHub-published lessons</div>
      </div>
      <div class="hero-panel">
        <div class="hero-panel-top"><span class="panel-label">YOUR LEARNING PATH</span><span class="live-indicator">${publishedThrough()} DAYS LIVE</span></div>
        <div class="hero-number-row"><strong>${String(state.activeDay).padStart(2, '0')}</strong><span> / 100<br><small>current day</small></span></div>
        <div class="hero-progress-track"><span style="width:${pct}%"></span></div>
        <div class="hero-panel-foot"><span>${completed} days completed</span><strong>${pct}%</strong></div>
        <div class="track-mini-list">${groups.map(group => `<div class="track-mini"><span>${escapeHtml(group.name)}</span><span>${group.start}–${group.end}</span><i class="${state.activeDay >= group.start && state.activeDay <= group.end ? 'is-current' : ''}"></i></div>`).join('')}</div>
      </div>
    </section>
    <section class="metric-strip" aria-label="Program overview">
      <div class="metric"><strong>100</strong><span>learning days</span></div>
      <div class="metric"><strong>4</strong><span>core analyst tools</span></div>
      <div class="metric"><strong>5</strong><span>topics per day</span></div>
      <div class="metric"><strong>15</strong><span>business tasks per day</span></div>
      <div class="metric"><strong>${publishedThrough()}</strong><span>days published</span></div>
    </section>`;
}

function renderDayList() {
  return `
    <aside class="curriculum-rail panel" aria-label="100-day curriculum">
      <div class="rail-heading">
        <div><p class="eyebrow">CURRICULUM</p><h2>100-Day Journey</h2></div>
        <span class="published-count">${publishedThrough()}/100</span>
      </div>
      <div class="rail-progress"><span style="width:${progress.getState().completedDays.length}%"></span></div>
      <p class="rail-caption">Complete each day to unlock the next lesson.</p>
      <div class="day-groups">
        ${groups.map(group => `
          <section class="day-group" aria-label="${escapeHtml(group.name)} track">
            <div class="track-heading"><span>${escapeHtml(group.name)}</span><span>${group.start}–${group.end}</span></div>
            ${Array.from({ length: group.end - group.start + 1 }, (_, index) => group.start + index).map(day => {
              const meta = curriculum.getDayMeta(day);
              const isPublished = day <= publishedThrough() && !!meta;
              const isUnlocked = isPublished && progress.canOpenDay(day, publishedThrough());
              const isComplete = progress.isDayCompleted(day);
              const isActive = day === state.activeDay;
              const title = meta?.title?.replace(/^.*?—\s*/, '') || 'Content not published';
              const label = `Day ${String(day).padStart(2, '0')}: ${title}`;
              return `<button class="day-button ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''} ${!isUnlocked ? 'locked' : ''}" type="button" data-day="${day}" ${!isUnlocked ? 'disabled' : ''} aria-current="${isActive ? 'page' : 'false'}" aria-label="${escapeHtml(label)}">
                <span class="day-button-main"><span class="day-number">${String(day).padStart(2, '0')}</span><span class="day-copy"><strong>Day ${String(day).padStart(2, '0')}</strong><small>${escapeHtml(title)}</small></span></span>
                <span class="day-status" title="${isComplete ? 'Completed' : isUnlocked ? 'Available' : isPublished ? `Complete Day ${day - 1} to unlock` : 'Not published'}">${isComplete ? '✓' : isUnlocked ? 'OPEN' : isPublished ? 'LOCKED' : 'SOON'}</span>
              </button>`;
            }).join('')}
          </section>`).join('')}
      </div>
    </aside>`;
}

function getModeContent(topic, mode) {
  const teaching = topic?.teaching || {};
  const aliases = {
    teacher: ['teacher', 'teaching'],
    explain: ['explain', 'explanation'],
    detailedlearning: ['detailedlearning', 'detailed_learning', 'deep_learning'],
    expose: ['expose', 'analyst_mindset', 'mindset']
  };
  for (const key of aliases[mode] || []) {
    if (teaching[key]) return teaching[key];
  }
  return 'This lesson mode has not been written for this topic yet.';
}

function getExample(topic) {
  const teaching = topic?.teaching || {};
  return teaching.example || teaching.example_sql || teaching.syntax || teaching.expected_sql || '';
}

function renderTopicTabs() {
  return `<div class="topic-tabs" role="tablist" aria-label="Daily topics">
    ${(state.day?.topics || []).map((topic, index) => `<button class="topic-tab ${index === state.activeTopic ? 'active' : ''}" type="button" role="tab" aria-selected="${index === state.activeTopic}" data-topic="${index}" id="topicTab${index}">
      <span>0${index + 1}</span><strong>${escapeHtml(topic.title)}</strong>
    </button>`).join('')}
  </div>`;
}

function renderSafeMarkdown(source) {
  const escaped = escapeHtml(source || '');
  const lines = escaped.split(/\r?\n/);
  const output = [];
  let paragraph = [];
  let list = [];
  const inline = text => text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; } };
  const flushList = () => { if (list.length) { output.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`); list = []; } };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (heading) { flushParagraph(); flushList(); const level = Math.min(4, heading[1].length + 1); output.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
    else if (bullet) { flushParagraph(); list.push(bullet[1]); }
    else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line.trim()); }
  }
  flushParagraph(); flushList();
  return output.join('');
}

function renderTeaching(topic) {
  const mode = state.teachingMode;
  const content = getModeContent(topic, mode);
  const example = getExample(topic);
  return `
    <section class="teaching-card" aria-labelledby="teachingHeading">
      <div class="section-heading"><div><p class="eyebrow">LEARN THE CONCEPT</p><h3 id="teachingHeading">${escapeHtml(modeLabels[mode])}</h3></div><span class="section-counter">0${state.activeTopic + 1} / 05</span></div>
      <div class="mode-switcher" role="tablist" aria-label="Teaching mode">
        ${Object.entries(modeLabels).map(([key, label]) => `<button type="button" role="tab" aria-selected="${key === mode}" class="mode-tab ${key === mode ? 'active' : ''}" data-mode="${key}">${escapeHtml(label)}</button>`).join('')}
      </div>
      <div class="teaching-content markdown-content" role="tabpanel" aria-label="${escapeHtml(modeLabels[mode])}">${renderSafeMarkdown(content)}</div>
      ${example ? `<div class="worked-example"><div class="example-header"><div><p class="eyebrow">WORKED EXAMPLE</p><strong>Apply the concept</strong></div><button type="button" class="button button-quiet copy-example" data-copy="${escapeHtml(example)}">Copy example</button></div><pre><code>${escapeHtml(example)}</code></pre></div>` : ''}
    </section>`;
}

function renderTaskCard(question, index) {
  const status = progress.getTaskStatus(state.activeDay, state.activeTopic, index);
  const isActive = index === state.activeQuestion;
  const canSelfComplete = status === 'attempted' || status === 'completed';
  return `
    <article class="task-card ${isActive ? 'selected' : ''} ${status === 'completed' ? 'is-complete' : ''}" data-task-card="${index}">
      <button class="task-card-select" type="button" data-question="${index}" aria-pressed="${isActive}">
        <span class="task-index">Q${index + 1}</span>
        <span class="task-summary"><span class="task-meta">${escapeHtml(question.role || 'Stakeholder')} · ${escapeHtml(question.difficulty || 'Business task')}</span><strong>${escapeHtml(question.request || question.question || 'Business analysis task')}</strong></span>
        <span class="task-state">${status === 'completed' ? '✓ Done' : status === 'attempted' ? 'Attempted' : 'Start →'}</span>
      </button>
      <div class="task-details ${isActive ? 'expanded' : ''}">
        <p>${escapeHtml(question.scenario || '')}</p>
        <div class="deliverable"><strong>Expected output</strong><span>${escapeHtml(Array.isArray(question.output) ? question.output.join(' · ') : question.required_output || 'A business-ready analytical result')}</span></div>
        <div class="task-actions">
          <button type="button" class="button button-quiet" data-hint="${index}">Show hint</button>
          <button type="button" class="button button-primary" data-solve="${index}">Open in practice</button>
          <button type="button" class="button ${status === 'completed' ? 'button-success' : 'button-outline'}" data-complete-task="${index}" ${!canSelfComplete ? 'disabled title="Run a successful SQL query for this task first."' : ''}>${status === 'completed' ? 'Completed ✓' : 'Self-assess complete'}</button>
        </div>
        ${!canSelfComplete && status !== 'completed' ? '<small class="task-note">Run a successful query in the practice workspace before self-assessing this task.</small>' : ''}
      </div>
    </article>`;
}

function renderLesson() {
  const topic = getTopic();
  const questionCount = totalQuestions();
  const completed = progress.countCompletedTasks(state.activeDay);
  const title = state.day?.title || `Day ${state.activeDay}`;
  return `
    <section class="lesson-column" id="lesson" aria-labelledby="lessonTitle">
      <div class="lesson-intro">
        <div class="breadcrumb"><span>Learning path</span><span aria-hidden="true">/</span><span>${escapeHtml(state.day?.track || '')}</span><span aria-hidden="true">/</span><strong>Day ${String(state.activeDay).padStart(2, '0')}</strong></div>
        <p class="eyebrow">${escapeHtml(state.day?.track || '')} · DAY ${String(state.activeDay).padStart(2, '0')}</p>
        <h2 id="lessonTitle" tabindex="-1">${escapeHtml(title)}</h2>
        <p class="lesson-description">${escapeHtml(state.day?.description || state.day?.learning_objectives?.[0] || 'Build practical analytical capability through business-first lessons.')}</p>
        <div class="lesson-meta"><span>5 topics</span><span>15 business requests</span><span>${state.day?.estimated_time_minutes || 45} min estimated</span><span>${completed}/${questionCount} completed</span></div>
      </div>
      <div class="daily-progress-card">
        <div class="progress-title"><div><strong>Today's progress</strong><small>${completed} of ${questionCount} tasks self-assessed complete</small></div><b>${Math.round(completed / Math.max(questionCount, 1) * 100)}%</b></div>
        <div class="progress-track"><span style="width:${completed / Math.max(questionCount, 1) * 100}%"></span></div>
      </div>
      ${renderTopicTabs()}
      ${topic ? `<div class="topic-heading-block"><div><p class="eyebrow">TOPIC ${String(state.activeTopic + 1).padStart(2, '0')}</p><h3>${escapeHtml(topic.title)}</h3></div><span class="topic-skill">${escapeHtml(topic.business_skill || 'Apply the concept to a stakeholder request.')}</span></div>${renderTeaching(topic)}<section class="tasks-section"><div class="section-heading"><div><p class="eyebrow">APPLY YOUR KNOWLEDGE</p><h3>Business requests</h3><p class="muted">Work through each request as the analyst responsible for the deliverable.</p></div><span class="section-counter">3 tasks</span></div><div class="task-list">${(topic.questions || []).map(renderTaskCard).join('')}</div></section>` : '<p class="empty-state">This topic has no content yet.</p>'}
      <div class="day-completion-panel"><div><p class="eyebrow">DAILY CHECKPOINT</p><strong>${completed === questionCount ? 'All tasks completed' : `${questionCount - completed} tasks remaining`}</strong><p>${completed === questionCount ? 'You have completed the self-assessment for every task in this day.' : 'Complete all 15 business requests to unlock the next published day.'}</p></div><button id="completeDayButton" type="button" class="button button-primary" ${completed < questionCount ? 'disabled' : ''}>Complete Day ${state.activeDay} <span aria-hidden="true">→</span></button></div>
    </section>`;
}

function renderDatasetOptions() {
  return (curriculum.datasets?.datasets || []).filter(dataset => !dataset.status || dataset.status === 'active').map(dataset =>
    `<option value="${escapeHtml(dataset.id)}" ${dataset.id === state.activeDataset ? 'selected' : ''}>${escapeHtml(dataset.name)} · ${dataset.row_count || ''} rows</option>`
  ).join('');
}

function renderSelectedRequest() {
  const question = getQuestion();
  const status = selectedTaskStatus(question);
  return `
    <section class="request-panel panel" aria-labelledby="requestHeading">
      <div class="panel-topline"><p class="eyebrow">YOUR BUSINESS BRIEF</p><span class="status-chip ${status === 'completed' ? 'success' : status === 'attempted' ? 'warning' : ''}">${status === 'completed' ? 'COMPLETED' : status === 'attempted' ? 'ATTEMPTED' : 'IN PROGRESS'}</span></div>
      <h3 id="requestHeading">${escapeHtml(question?.role || 'Stakeholder request')}</h3>
      <p class="request-scenario">${escapeHtml(question?.scenario || '')}</p>
      <div class="request-callout"><small>WHAT YOU NEED TO DELIVER</small><strong>${escapeHtml(question?.request || question?.question || '')}</strong></div>
      <div class="request-selector" aria-label="Select business request">${(getTopic()?.questions || []).map((item, index) => `<button type="button" class="request-chip ${index === state.activeQuestion ? 'active' : ''}" data-question="${index}" aria-pressed="${index === state.activeQuestion}">Q${index + 1}</button>`).join('')}</div>
      <details class="hint-details"><summary>Need a hint?</summary><p>${escapeHtml(question?.validation || 'Identify the required columns, grain, filters and calculations before writing your query.')}</p></details>
    </section>`;
}

function renderResults() {
  if (state.queryError) return `<div class="query-feedback error" role="alert"><strong>Query needs attention</strong><span>${escapeHtml(state.queryError)}</span></div>`;
  if (!state.queryResult) return '<div class="results-empty">Your query results will appear here. Start with a SELECT statement.</div>';
  const result = state.queryResult;
  if (!result.rows.length) return '<div class="query-feedback success"><strong>Query executed successfully</strong><span>No rows matched the query conditions.</span></div>';
  return `<div class="results-toolbar"><span>${result.totalRows} row(s) returned${result.truncated ? ` · showing first ${result.rows.length}` : ''}</span><span>${result.elapsed} ms</span></div><div class="results-table-wrap"><table class="results-table"><thead><tr>${result.columns.map(column => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${result.rows.map(row => `<tr>${result.columns.map(column => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderPractice() {
  const dataset = (curriculum.datasets?.datasets || []).find(item => item.id === state.activeDataset);
  const sqlReadyText = state.engineReady ? 'SQL engine ready' : 'SQL engine loads when you run your first query';
  const attempted = selectedTaskStatus() === 'attempted' || selectedTaskStatus() === 'completed';
  return `
    <section class="practice-panel panel" id="practice" aria-labelledby="practiceHeading">
      <div class="practice-header"><div><p class="eyebrow">HANDS-ON WORKSPACE</p><h3 id="practiceHeading">Practice SQL</h3><p class="muted">Write and run your own query against the learning datasets.</p></div><span class="engine-badge ${state.engineReady ? 'ready' : ''}"><i></i>${sqlReadyText}</span></div>
      <label class="field-label" for="datasetSelect">Active dataset</label>
      <select id="datasetSelect" class="dataset-select">${renderDatasetOptions()}</select>
      <div class="dataset-info"><span>${escapeHtml(dataset?.name || state.activeDataset)}</span><span>${dataset?.row_count || 0} rows registered</span></div>
      <div class="practice-toolbar"><span class="editor-label">SQL EDITOR</span><div><button type="button" class="mini-button" id="formatSql">Format</button><button type="button" class="mini-button" id="clearSql">Clear</button></div></div>
      <label class="sr-only" for="sqlEditor">SQL query editor</label>
      <textarea id="sqlEditor" class="sql-editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder="SELECT region, SUM(sales) AS total_sales\nFROM orders\nGROUP BY region\nORDER BY total_sales DESC;">${escapeHtml(state.sqlDraft)}</textarea>
      <div class="editor-footer"><span>Ctrl/⌘ + Enter to run</span><button type="button" class="button button-primary run-query" id="runSql">▶ Run query</button></div>
      <div class="schema-preview" id="schemaPreview"><span>Dataset columns</span><div class="schema-pills">Select a dataset to inspect its columns.</div></div>
      <div class="query-results" id="queryResults" aria-live="polite" aria-label="SQL query results">${renderResults()}</div>
      <div class="self-assessment"><div><strong>Task self-assessment</strong><small>${attempted ? 'A successful query has been run for this task.' : 'Run a successful query for the selected task to enable completion.'}</small></div><button type="button" class="button ${selectedTaskStatus() === 'completed' ? 'button-success' : 'button-outline'}" id="completeSelectedTask" ${!attempted ? 'disabled' : ''}>${selectedTaskStatus() === 'completed' ? 'Completed ✓' : 'Mark task complete'}</button></div>
      <p class="disclaimer">Completion is learner self-assessed after a successful query. Automated answer grading is not yet available for every question.</p>
    </section>`;
}

function renderProjects() {
  const projects = [
    { name: 'Retail Performance & Profitability', level: 'FOUNDATION', tools: 'SQL · Excel · Power BI', outcome: 'Analyze revenue, margin, regional performance and product profitability.', dataset: 'orders', tag: 'Sales analytics' },
    { name: 'Customer Segmentation & Retention', level: 'INTERMEDIATE', tools: 'SQL · Python · Power BI', outcome: 'Identify valuable customer groups, repeat behavior and retention signals.', dataset: 'customers + orders', tag: 'Customer analytics' },
    { name: 'Product Portfolio Optimization', level: 'INTERMEDIATE', tools: 'SQL · Excel', outcome: 'Compare product performance, margin bands and portfolio concentration.', dataset: 'product-catalog + orders', tag: 'Product analytics' },
    { name: 'Executive KPI Reporting Pack', level: 'ADVANCED', tools: 'Excel · DAX · Power BI', outcome: 'Design a management-ready KPI layer with definitions and decision commentary.', dataset: 'orders', tag: 'Business intelligence' }
  ];
  return `
    <section class="content-section projects-section" id="projects" aria-labelledby="projectsHeading">
      <div class="content-section-heading"><div><p class="eyebrow">BUILD A PORTFOLIO</p><h2 id="projectsHeading">Turn learning into evidence.</h2><p class="muted">Practice with realistic business problems and create work you can explain in an interview.</p></div><span class="section-counter">PROJECT LAB</span></div>
      <div class="project-grid">${projects.map((project, index) => `
        <article class="project-card">
          <div class="project-card-top"><span class="project-number">0${index + 1}</span><span class="project-tag">${escapeHtml(project.tag)}</span></div>
          <p class="eyebrow">${escapeHtml(project.level)}</p><h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(project.outcome)}</p>
          <div class="project-meta"><span>${escapeHtml(project.tools)}</span><small>Dataset: ${escapeHtml(project.dataset)}</small></div>
          <a href="#lesson" class="project-link" data-project-start="${index}">Explore related lessons <span aria-hidden="true">→</span></a>
        </article>`).join('')}</div>
      <p class="section-footnote">Project briefs are learning pathways. Downloadable project files and formal project submission are planned for a future release.</p>
    </section>`;
}

function renderProgress() {
  const saved = progress.getState();
  const completedDays = saved.completedDays.length;
  const published = publishedThrough();
  const completedTasks = Object.entries(saved.tasks).filter(([, status]) => status === 'completed').length;
  const attemptedTasks = Object.entries(saved.tasks).filter(([, status]) => status === 'attempted' || status === 'completed').length;
  const pct = Math.round(completedDays / 100 * 100);
  const currentCompleted = progress.countCompletedTasks(state.activeDay);
  return `
    <section class="content-section progress-section" id="progress" aria-labelledby="progressHeading">
      <div class="content-section-heading"><div><p class="eyebrow">YOUR LEARNING RECORD</p><h2 id="progressHeading">Progress you can measure.</h2><p class="muted">Your progress is saved in this browser. It is not uploaded to GitHub.</p></div><span class="section-counter">LOCAL PROFILE</span></div>
      <div class="progress-overview">
        <article class="progress-primary-card"><div class="progress-primary-copy"><p class="eyebrow">COURSE COMPLETION</p><strong>${pct}%</strong><span>${completedDays} of 100 days completed</span></div><div class="large-progress-track"><span style="width:${pct}%"></span></div><small>${published} days currently published · ${Math.max(0, published - completedDays)} published days remaining</small></article>
        <div class="progress-stat-grid"><article class="progress-stat"><span>Tasks completed</span><strong>${completedTasks}</strong><small>Self-assessed</small></article><article class="progress-stat"><span>Tasks attempted</span><strong>${attemptedTasks}</strong><small>Successful query run</small></article><article class="progress-stat"><span>Current day</span><strong>${state.activeDay}</strong><small>${currentCompleted}/15 tasks complete</small></article></div>
      </div>
      <div class="progress-bottom-grid"><section class="progress-detail-card"><div class="section-heading"><div><p class="eyebrow">TRACK BREAKDOWN</p><h3>Learning tracks</h3></div></div>${groups.map(group => {
        const total = group.end - group.start + 1;
        const count = saved.completedDays.filter(day => day >= group.start && day <= group.end).length;
        return `<div class="track-progress-row"><div><strong>${escapeHtml(group.name)}</strong><span>${count}/${total} days</span></div><div class="progress-track"><span style="width:${count / total * 100}%"></span></div></div>`;
      }).join('')}</section>
        <section class="progress-detail-card backup-card"><div class="section-heading"><div><p class="eyebrow">YOUR DATA</p><h3>Progress backup</h3></div></div><p>Export your learning record before changing browsers or clearing site data. You can import the backup on another device.</p><div class="backup-actions"><button type="button" class="button button-outline" id="exportProgress">Export backup</button><label class="button button-quiet file-button" for="importProgress">Import backup</label><input class="sr-only" id="importProgress" type="file" accept="application/json,.json"></div><button type="button" class="text-button danger-text" id="resetProgress">Reset local progress</button><p class="disclaimer">Resetting cannot be undone unless you have exported a backup.</p></section></div>
    </section>`;
}

function renderFooter() {
  return `<footer class="site-footer"><div class="footer-brand"><span class="brand-mark">AHK</span><span><strong>AHK Academy</strong><small>Learn the tools. Understand the business.</small></span></div><div class="footer-meta"><span>Content release v${escapeHtml(curriculum.manifest?.version || '1.0')}</span><span>Progress stored locally</span><a href="https://github.com/AbuHumzaKhan/100day-of-learning-DA" target="_blank" rel="noreferrer">Repository ↗</a></div></footer>`;
}

function renderApp(options = {}) {
  const oldScroll = window.scrollY;
  root.innerHTML = `${renderHeader()}<main class="app-main"><div class="container">${renderHero()}<div class="global-notice" id="globalNotice" role="status" aria-live="polite" hidden></div><section class="learning-workspace" aria-label="Daily learning workspace">${renderDayList()}<div class="lesson-area">${renderLesson()}</div><aside class="right-column">${renderSelectedRequest()}${renderPractice()}</aside></section>${renderProjects()}${renderProgress()}${renderFooter()}</div></main>`;
  document.documentElement.dataset.theme = state.theme;
  bindEvents();
  refreshSchemaPreview();
  if (options.preserveScroll) window.scrollTo({ top: oldScroll, behavior: 'instant' });
}

function renderResultsOnly() {
  const resultContainer = $('#queryResults');
  if (resultContainer) resultContainer.innerHTML = renderResults();
  const engineBadge = $('.engine-badge');
  if (engineBadge) {
    engineBadge.classList.toggle('ready', state.engineReady);
    engineBadge.innerHTML = `<i></i>${state.engineReady ? 'SQL engine ready' : 'SQL engine idle'}`;
  }
  const selfAssessment = $('.self-assessment');
  if (selfAssessment) {
    const status = selectedTaskStatus();
    const attempted = status === 'attempted' || status === 'completed';
    selfAssessment.querySelector('small').textContent = attempted ? 'A successful query has been run for this task.' : 'Run a successful query for the selected task to enable completion.';
    const button = $('#completeSelectedTask');
    button.disabled = !attempted;
    button.textContent = status === 'completed' ? 'Completed ✓' : 'Mark task complete';
    button.className = `button ${status === 'completed' ? 'button-success' : 'button-outline'}`;
  }
}

function renderSearchResults(results, query) {
  const panel = $('#searchResults');
  if (!panel) return;
  if (!query) { panel.hidden = true; panel.innerHTML = ''; return; }
  if (!results.length) {
    panel.innerHTML = '<p class="search-empty">No lessons or business requests matched your search.</p>';
    panel.hidden = false;
    return;
  }
  panel.innerHTML = results.slice(0, 12).map((item, index) => {
    const available = progress.canOpenDay(item.day, publishedThrough());
    return `<button type="button" role="option" class="search-result" data-result-index="${index}" ${!available ? 'disabled' : ''}><span class="search-result-type">DAY ${String(item.day).padStart(2, '0')} · ${escapeHtml(item.type)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail || '')}${available ? '' : ' · Complete earlier days to unlock'}</small></button>`;
  }).join('');
  panel.hidden = false;
  $$('.search-result', panel).forEach((button, index) => button.addEventListener('click', async () => {
    const item = results[index];
    await loadDay(item.day);
    if (item.topicIndex !== null && item.topicIndex !== undefined && state.day) {
      state.activeTopic = item.topicIndex;
      state.activeQuestion = item.questionIndex ?? 0;
      renderApp({ preserveScroll: false });
    }
    $('#searchResults').hidden = true;
    $('#globalSearch').value = '';
  }));
}

async function searchContent(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return renderSearchResults([], '');
  const input = $('#globalSearch');
  if (input) input.setAttribute('aria-busy', 'true');
  try {
    if (!state.searchIndex) state.searchIndex = await curriculum.getSearchIndex();
    const results = state.searchIndex.filter(item => `${item.searchText || ''} ${item.title} ${item.detail} ${item.type} ${item.day}`.toLowerCase().includes(normalized));
    renderSearchResults(results, normalized);
  } catch (error) {
    renderSearchResults([], normalized);
    showNotice(`Search could not be completed: ${error.message}`, 'warning');
  } finally {
    if (input) input.removeAttribute('aria-busy');
  }
}

async function refreshSchemaPreview() {
  const container = $('#schemaPreview');
  if (!container) return;
  const dataset = (curriculum.datasets?.datasets || []).find(item => item.id === state.activeDataset);
  if (!dataset) {
    container.innerHTML = '<span>Dataset columns</span><div class="schema-pills">No dataset selected.</div>';
    return;
  }
  try {
    let schema;
    if (state.engineReady) schema = sql.getSchema(state.activeDataset);
    else schema = await curriculum.fetchJson(dataset.schema, curriculum.manifest?.version || 'current');
    const columns = schema.columns || [];
    container.innerHTML = `<span>${escapeHtml(dataset.name)} · ${dataset.row_count || schema.rowCount || 0} rows</span><div class="schema-pills">${columns.map(column => {
      const name = Array.isArray(column) ? column[0] : column.name;
      const type = Array.isArray(column) ? column[1] : column.type;
      return `<span title="${escapeHtml(type || '')}">${escapeHtml(name)}</span>`;
    }).join('')}</div>`;
  } catch (error) {
    container.innerHTML = `<span>Dataset columns</span><div class="schema-pills">${escapeHtml(error.message)}</div>`;
  }
}

async function runQuery() {
  const editor = $('#sqlEditor');
  if (!editor) return;
  const query = editor.value.trim();
  state.sqlDraft = editor.value;
  if (!query) {
    state.queryError = 'Write a SQL query before running the practice engine.';
    state.queryResult = null;
    renderResultsOnly();
    return;
  }
  state.queryError = '';
  state.queryResult = null;
  const runButton = $('#runSql');
  runButton.disabled = true;
  runButton.textContent = 'Running…';
  try {
    if (!state.engineReady) {
      await sql.init();
      state.engineReady = true;
    }
    const result = sql.run(query);
    state.queryResult = result;
    state.lastQuery = query;
    progress.markAttempted(state.activeDay, state.activeTopic, state.activeQuestion);
  } catch (error) {
    state.queryError = error?.message || 'The query could not be executed.';
  } finally {
    if ($('#runSql')) {
      $('#runSql').disabled = false;
      $('#runSql').textContent = '▶ Run query';
    }
    renderApp({ preserveScroll: true });
    renderResultsOnly();
    refreshSchemaPreview();
  }
}

function formatSql(query) {
  return String(query || '').trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|LEFT JOIN|INNER JOIN|ON)\s+/gi, '\n$1 ')
    .replace(/,\s*/g, ', ')
    .replace(/\s+(AND|OR)\s+/gi, '\n  $1 ');
}

function downloadProgress() {
  const blob = new Blob([progress.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ahk-academy-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showNotice('Your progress backup has been exported.', 'success');
}

async function importProgress(file) {
  if (!file) return;
  try {
    progress.importJson(await file.text());
    const nextDay = unlockedDay();
    await loadDay(Math.min(nextDay, publishedThrough()), { focus: false });
    showNotice('Progress backup imported successfully.', 'success');
  } catch (error) {
    showNotice(`Backup import failed: ${error.message}`, 'warning');
  }
}

function bindEvents() {
  $$('.day-button').forEach(button => button.addEventListener('click', () => loadDay(Number(button.dataset.day))));
  $$('.topic-tab').forEach(button => button.addEventListener('click', () => {
    state.activeTopic = Number(button.dataset.topic);
    state.activeQuestion = 0;
    state.sqlDraft = '';
    state.teachingMode = 'teacher';
      state.queryResult = null;
    state.queryError = '';
    renderApp({ preserveScroll: true });
  }));
  $$('.mode-tab').forEach(button => button.addEventListener('click', () => {
    state.teachingMode = button.dataset.mode;
    renderApp({ preserveScroll: true });
  }));
  $$('.task-card-select, .request-chip').forEach(button => button.addEventListener('click', () => {
    state.activeQuestion = Number(button.dataset.question);
    state.sqlDraft = '';
      state.queryResult = null;
    state.queryError = '';
    renderApp({ preserveScroll: true });
  }));
  $$('[data-solve]').forEach(button => button.addEventListener('click', () => {
    state.activeQuestion = Number(button.dataset.solve);
    state.sqlDraft = '';
    renderApp({ preserveScroll: true });
    $('#sqlEditor')?.focus({ preventScroll: true });
    $('#practice')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('[data-hint]').forEach(button => button.addEventListener('click', () => {
    const question = getTopic()?.questions?.[Number(button.dataset.hint)];
    showNotice(question?.validation || 'Start by identifying the required output columns, row grain, filters and calculations.', 'info');
  }));
  $$('[data-complete-task]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.completeTask);
    const status = progress.getTaskStatus(state.activeDay, state.activeTopic, index);
    if (status !== 'attempted' && status !== 'completed') return;
    progress.setTaskCompleted(state.activeDay, state.activeTopic, index, status !== 'completed');
    renderApp({ preserveScroll: true });
  }));
  $('#completeSelectedTask')?.addEventListener('click', () => {
    const status = selectedTaskStatus();
    if (status !== 'attempted' && status !== 'completed') return;
    progress.setTaskCompleted(state.activeDay, state.activeTopic, state.activeQuestion, status !== 'completed');
    renderApp({ preserveScroll: true });
  });
  $('#completeDayButton')?.addEventListener('click', async () => {
    try {
      const completedDay = state.activeDay;
      progress.completeDay(completedDay, totalQuestions());
      const next = completedDay + 1;
      if (next <= publishedThrough()) await loadDay(next, { focus: false });
      else { progress.setActiveDay(completedDay); renderApp({ preserveScroll: true }); }
      showNotice(`Day ${completedDay} completion saved.`, 'success');
    } catch (error) {
      showNotice(error.message, 'warning');
    }
  });
  $('#datasetSelect')?.addEventListener('change', event => {
    state.activeDataset = event.target.value;
    renderApp({ preserveScroll: true });
    const dataset = (curriculum.datasets?.datasets || []).find(item => item.id === state.activeDataset);
    const tableName = String(dataset?.table || dataset?.id || '').replace(/[^a-zA-Z0-9_]/g, '_');
    showNotice(`Dataset explorer switched to ${dataset?.name || state.activeDataset}. Query the table as ${tableName}. All registered tables remain available to SQL.`, 'success');
  });
  $('#runSql')?.addEventListener('click', runQuery);
  $('#clearSql')?.addEventListener('click', () => {
    $('#sqlEditor').value = '';
    state.sqlDraft = '';
    state.queryResult = null;
    state.queryError = '';
    renderResultsOnly();
  });
  $('#formatSql')?.addEventListener('click', () => {
    $('#sqlEditor').value = formatSql($('#sqlEditor').value);
    state.sqlDraft = $('#sqlEditor').value;
  });
  $('#sqlEditor')?.addEventListener('input', event => { state.sqlDraft = event.currentTarget.value; });
  $('#sqlEditor')?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); runQuery(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      const input = event.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.setRangeText('  ', start, end, 'end');
    }
  });
  $$('.copy-example').forEach(button => button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy || '');
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy example'; }, 1200);
    } catch {
      showNotice('Clipboard access is unavailable in this browser context.', 'warning');
    }
  }));
  $('#exportProgress')?.addEventListener('click', downloadProgress);
  $('#importProgress')?.addEventListener('change', event => importProgress(event.target.files?.[0]));
  $('#resetProgress')?.addEventListener('click', async () => {
    if (!window.confirm('Reset all locally saved AHK Academy progress? Export a backup first if you may need it later.')) return;
    progress.reset();
    await loadDay(1, { focus: false });
    showNotice('Local progress has been reset.', 'success');
  });
  $('#themeToggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('ahk_academy_theme', state.theme);
    document.documentElement.dataset.theme = state.theme;
    $('#themeToggle').setAttribute('aria-label', state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
  $('#mobileMenuButton')?.addEventListener('click', event => {
    const nav = $('#primaryNav');
    const isOpen = nav.classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', String(isOpen));
  });
  $$('[data-nav]').forEach(link => link.addEventListener('click', () => {
    $('#primaryNav')?.classList.remove('open');
    $('#mobileMenuButton')?.setAttribute('aria-expanded', 'false');
    $$('.nav-link').forEach(item => item.classList.toggle('active', item === link));
  }));
  $$('[data-project-start]').forEach(link => link.addEventListener('click', () => {
    const projectIndex = Number(link.dataset.projectStart);
    const targetDay = projectIndex === 1 ? 8 : projectIndex === 2 ? 11 : 1;
    if (progress.canOpenDay(targetDay, publishedThrough())) loadDay(targetDay, { focus: false });
    else showNotice(`Complete the earlier days to unlock the lessons for this project.`, 'warning');
  }));

  const search = $('#globalSearch');
  search?.addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    const query = search.value;
    state.searchTimer = setTimeout(() => searchContent(query), 180);
  });
  search?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { $('#searchResults').hidden = true; search.value = ''; }
  });
  if (!globalKeyboardHandlerBound) {
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#globalSearch')?.focus();
      }
    });
    globalKeyboardHandlerBound = true;
  }
}

async function boot() {
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = '<div class="boot-screen"><div class="boot-mark">AHK</div><p>Preparing your learning workspace…</p><span class="boot-loader"></span></div>';
  try {
    await curriculum.init();
    const requestedHash = window.location.hash.match(/day-(\d+)/);
    const saved = progress.getState();
    const requestedDay = requestedHash ? Number(requestedHash[1]) : saved.activeDay;
    const initialDay = progress.canOpenDay(requestedDay, publishedThrough()) ? requestedDay : unlockedDay();
    await loadDay(initialDay, { focus: false });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register(new URL('./sw.js', window.location.href)).catch(error => console.warn('Service worker registration skipped.', error));
    }
  } catch (error) {
    renderFatal(error);
  } finally {
    root.setAttribute('aria-busy', 'false');
  }
}

boot();