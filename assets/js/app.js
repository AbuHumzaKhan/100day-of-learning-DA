import { EngineManager } from './engine-manager.js';
import { SQLAcademyEngine } from './sql-engine.js';

const app = document.querySelector('#app');
const state = {
  index: null,
  days: new Map(),
  activeDay: Number(localStorage.getItem('ahk_active_day_v4') || 1),
  completed: new Set(JSON.parse(localStorage.getItem('ahk_completed') || '[]'))
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

const engine = new EngineManager({
  onStatus(status) {
    const el = document.querySelector('#engineStatus');
    if (el) el.textContent = status.state === 'running' ? 'Running…' : status.state === 'error' ? 'Error' : 'Ready';
  }
});

const orders = [
  {order_id:'CA-1001',customer_name:'Aisha Rahman',category:'Technology',region:'West',sales:1240,profit:310,quantity:3},
  {order_id:'CA-1002',customer_name:'Omar Khan',category:'Furniture',region:'South',sales:860,profit:96,quantity:2},
  {order_id:'CA-1003',customer_name:'Sara Malik',category:'Office Supplies',region:'East',sales:540,profit:122,quantity:5},
  {order_id:'CA-1004',customer_name:'Daniel Lee',category:'Technology',region:'North',sales:1780,profit:420,quantity:4},
  {order_id:'CA-1005',customer_name:'Noor Ahmed',category:'Furniture',region:'West',sales:690,profit:-35,quantity:2},
  {order_id:'CA-1006',customer_name:'Hana Park',category:'Technology',region:'East',sales:2100,profit:510,quantity:5},
  {order_id:'CA-1007',customer_name:'Rayan Ali',category:'Office Supplies',region:'South',sales:430,profit:78,quantity:6},
  {order_id:'CA-1008',customer_name:'Maya Chen',category:'Technology',region:'West',sales:990,profit:220,quantity:2}
];
engine.register('sql', new SQLAcademyEngine(orders));

async function getJSON(path) {
  const response = await fetch('./' + path + '?v=' + Date.now(), {cache:'no-store'});
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
  return response.json();
}

async function boot() {
  try {
    const index = await getJSON('curriculum/index.json');
    state.index = index;
    const openDays = Array.isArray(index.open_days) ? index.open_days : [];
    const selected = openDays.includes(state.activeDay) ? state.activeDay : Number(index.published_through_day || openDays[0] || 1);
    state.activeDay = selected;

    await Promise.all(openDays.map(async day => {
      const data = await getJSON('curriculum/day-' + String(day).padStart(3,'0') + '.json');
      state.days.set(day, data);
    }));

    render();
    bindGlobalEvents();
  } catch (error) {
    app.innerHTML = `
      <main class="container fatal">
        <span class="eyebrow">AHK ACADEMY · RUNTIME ERROR</span>
        <h1>Learning environment could not start.</h1>
        <p>${esc(error.message)}</p>
        <div class="fatal-actions">
          <button class="primary-button" onclick="location.reload()">Retry</button>
          <a class="secondary-button" href="https://github.com/AbuHumzaKhan/100day-of-learning-DA" target="_blank" rel="noopener">Open curriculum repository</a>
        </div>
        <small>If this screen appears after a deployment, wait for the GitHub Pages deployment to finish and refresh once.</small>
      </main>`;
  }
}

function metric(value, label, note) {
  return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function render() {
  const index = state.index;
  const day = state.days.get(state.activeDay);
  const published = Number(index.published_through_day || state.days.size);
  const progress = Math.round((published / 100) * 100);

  app.innerHTML = `
    <header class="topbar">
      <div class="container nav">
        <a class="brand" href="./" aria-label="AHK Academy home">
          <span class="logo">AHK</span>
          <span><strong>AHK Academy</strong><small>100-Day Data Analyst Business Trainer</small></span>
        </a>
        <nav class="nav-links" aria-label="Primary navigation">
          <button id="learningNav" class="active">Learning Path</button>
          <button id="practiceNav">Practice Arena</button>
          <button id="progressNav">Progress</button>
        </nav>
        <div class="nav-actions"><span class="avatar">AK</span></div>
      </div>
    </header>

    <main id="main">
      <section class="hero container">
        <div class="hero-grid">
          <article class="hero-main">
            <span class="eyebrow">Business-first analyst training</span>
            <h1>Learn analytics by <span>solving business requests.</span></h1>
            <p>Structured daily training that moves from SQL foundations to advanced analysis, Excel, Power BI and Python. Every lesson teaches the concept first, then puts it into a realistic stakeholder situation.</p>
            <div class="hero-actions">
              <button class="primary-button" id="continueBtn">Continue Day ${state.activeDay} →</button>
              <button class="secondary-button" id="jumpBtn">Explore curriculum</button>
            </div>
            <div class="hero-trust"><span>GitHub-sourced curriculum</span><span>Local learner progress</span><span>100-day progression</span></div>
          </article>
          <aside class="release-card">
            <div class="release-line"><span>Current release</span><b>Day ${published} live</b></div>
            <div><h2>${esc(day?.title || 'Loading curriculum')}</h2><p>${esc(day?.track || 'SQL')} learning track · ${day?.topics?.length || 0} topics · ${countQuestions(day)} business requests</p></div>
            <div><div class="release-progress"><span style="width:${progress}%"></span></div><div class="release-foot"><span>100-day path</span><b>${published}% published</b></div></div>
          </aside>
        </div>
      </section>

      <section class="container metric-grid">
        ${metric(published,'Published days','Available now')}
        ${metric('5','Topics per day','Instructor-led')}
        ${metric('15','Business questions','Per learning day')}
        ${metric(solvedCount(),'Questions solved','Saved on this device')}
      </section>

      <section class="container workspace" id="learning">
        <div class="content-card">
          ${renderDayPicker(index)}
          ${renderLesson(day)}
        </div>
      </section>

      <section class="container arena-section" id="arena">
        <div class="section-heading"><div><span class="eyebrow">Practice</span><h2>AHK Practice Arena</h2><p>Translate business requests into executable analysis.</p></div><span class="status-badge">LOCAL · READ ONLY</span></div>
        <div class="arena-card">
          <div class="arena-copy"><span class="engine-mark">SQL</span><h3>SQL Business Analysis Engine</h3><p>Run safe SELECT queries against the academy practice dataset without sending learner data to a server.</p></div>
          <button class="primary-button" id="engineLaunch">Open SQL Arena</button>
        </div>
      </section>
    </main>

    <footer class="site-footer"><div class="container footer-inner"><div><strong>AHK Academy</strong><span>Business-first learning · GitHub-powered · local progress</span></div><div class="footer-actions"><a class="footer-link" href="https://github.com/AbuHumzaKhan/100day-of-learning-DA" target="_blank" rel="noopener">GitHub</a><button class="engine-launch" id="engineLaunch2"><span class="engine-dot"></span>SQL Engine</button></div></div></footer>

    <div class="engine-drawer" id="engineDrawer" aria-hidden="true">
      <div class="engine-head"><span class="engine-dot"></span><strong>AHK ACADEMY ENGINE MATRIX · SQL</strong><span class="engine-spacer"></span><span id="engineStatus">Ready</span><button class="engine-close" id="engineClose">×</button></div>
      <div class="engine-body">
        <div class="engine-context"><span>LOCAL · READ ONLY · ORDERS DATASET</span><b>SELECT ONLY</b></div>
        <textarea id="sqlInput" spellcheck="false">SELECT category, SUM(sales) AS total_sales, SUM(profit) AS total_profit
FROM orders
GROUP BY category
ORDER BY total_sales DESC;</textarea>
        <div class="run-row"><button class="run-button" id="runSQL">▶ Run Query</button><span>Results are limited to the browser practice dataset.</span></div>
        <div id="sqlResult" class="result"><div class="empty">Run a query to inspect the result.</div></div>
      </div>
    </div>
  `;

  bindDayEvents();
  bindArena();
  hydrateTaskState();
}

function renderDayPicker(index) {
  return `<div class="academy-day-picker">
    <div><span class="eyebrow">Learning path</span><strong>Day ${state.activeDay} of 100</strong></div>
    <div class="academy-day-actions">
      <button id="prevDay" ${state.activeDay <= 1 ? 'disabled' : ''}>←</button>
      <select id="daySelect" aria-label="Select published learning day">${index.open_days.map(d => `<option value="${d}" ${d === state.activeDay ? 'selected' : ''}>Day ${d} · ${esc(index.days.find(x => x.day === d)?.title || '')}</option>`).join('')}</select>
      <button id="nextDay" ${state.activeDay >= Number(index.published_through_day) ? 'disabled' : ''}>→</button>
    </div>
  </div>`;
}

function renderLesson(day) {
  if (!day) return '<div class="empty">Curriculum unavailable.</div>';
  const topics = Array.isArray(day.topics) ? day.topics : [];
  return `
    <header class="lesson-header">
      <div><span class="eyebrow">${esc(day.track)} · DAY ${String(day.day).padStart(2,'0')}</span><h1>${esc(day.title)}</h1><p>${esc(day.description || day.learning_objectives?.[0] || 'Build practical analytical capability through guided business problems.')}</p></div>
      <div class="lesson-progress"><span>5 topics</span><span>15 tasks</span></div>
    </header>
    <div id="topicList">
      ${topics.map((topic, i) => renderTopic(topic, i)).join('')}
    </div>
    <div class="lesson-complete"><div><span class="eyebrow">Daily checkpoint</span><strong id="completionTitle">Day ${day.day} learning checkpoint</strong><small id="completionText"></small></div><button class="primary-button" id="completeDay" disabled>Complete day</button></div>`;
}

function renderTopic(topic, index) {
  const questions = Array.isArray(topic.questions) ? topic.questions : [];
  const teaching = topic.teaching || {};
  const steps = [
    ['Purpose', teaching.purpose || 'Understand the analytical purpose of this technique.'],
    ['How it works', teaching.explanation || teaching.business_context || 'Apply the technique to a business dataset and validate the output.']
  ];
  const example = teaching.syntax || teaching.example_sql || '';
  return `
    <article class="lesson-topic ${index === 0 ? 'open' : ''}">
      <button class="topic-toggle" aria-expanded="${index === 0}">
        <span class="topic-number">${String(index + 1).padStart(2,'0')}</span>
        <span class="topic-title"><small>TOPIC ${index + 1}</small><strong>${esc(topic.title)}</strong></span>
        <span class="topic-chevron">⌄</span>
      </button>
      <div class="topic-content">
        <div class="lesson-flow">${steps.map((step, n) => `<div class="lesson-step"><span class="step-no">0${n+1}</span><div><small>${esc(step[0])}</small><p>${esc(step[1])}</p></div></div>`).join('')}</div>
        ${example ? `<div class="example-card"><div class="example-head"><span>Business syntax / example</span><button class="copy-example" data-copy="${esc(example)}">Copy</button></div><pre>${esc(example)}</pre></div>` : ''}
        <div class="question-stack"><div class="question-heading"><span>Business requests</span><small>${questions.length} stakeholder tasks</small></div>
        ${questions.map((q, qi) => renderQuestion(q, index, qi)).join('')}</div>
      </div>
    </article>`;
}

function renderQuestion(q, topicIndex, questionIndex) {
  const key = taskKey(state.activeDay, topicIndex, questionIndex);
  const status = readTasks()[key] || 'not_started';
  return `
    <article class="business-question ${status === 'solved' ? 'solved' : ''}" data-task-key="${key}" data-validation="${esc(q.validation || q.required_output || '')}">
      <div class="question-meta"><span class="role">${esc(q.role || 'Senior Analyst')}</span><span class="difficulty">${esc(q.difficulty || 'Business')}</span></div>
      <p class="scenario">${esc(q.scenario || '')}</p>
      <p class="request">${esc(q.request || q.question || '')}</p>
      <div class="question-footer"><span>Output: ${esc(q.required_output || q.expected_output || 'Business-ready analytical result')}</span><span>${status === 'solved' ? 'Solved' : status === 'attempted' ? 'Attempted' : 'Not started'}</span></div>
      <div class="academy-task-actions"><button class="text-button task-hint">Hint</button><button class="secondary-button task-solve">Solve in Arena</button><button class="done-button ${status === 'solved' ? 'done' : ''}">${status === 'solved' ? 'Done ✓' : 'Mark done'}</button></div>
    </article>`;
}

function countQuestions(day) {
  return day?.topics?.reduce((n,t) => n + (Array.isArray(t.questions) ? t.questions.length : 0), 0) || 0;
}

function taskKey(day, topic, question) { return day + ':' + topic + ':' + question; }
function readTasks() { try { return JSON.parse(localStorage.getItem('ahk_task_status_v4') || '{}'); } catch { return {}; } }
function writeTasks(data) { localStorage.setItem('ahk_task_status_v4', JSON.stringify(data)); }
function solvedCount() { return Object.values(readTasks()).filter(v => v === 'solved').length; }

function bindDayEvents() {
  document.querySelector('#daySelect')?.addEventListener('change', e => goDay(Number(e.target.value)));
  document.querySelector('#prevDay')?.addEventListener('click', () => goDay(state.activeDay - 1));
  document.querySelector('#nextDay')?.addEventListener('click', () => goDay(state.activeDay + 1));
  document.querySelector('#continueBtn')?.addEventListener('click', () => document.querySelector('#learning')?.scrollIntoView({behavior:'smooth'}));
  document.querySelector('#jumpBtn')?.addEventListener('click', () => document.querySelector('#learning')?.scrollIntoView({behavior:'smooth'}));

  document.querySelectorAll('.topic-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const topic = button.closest('.lesson-topic');
      const open = topic.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
  });

  document.querySelectorAll('.copy-example').forEach(button => {
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy || ''); button.textContent = 'Copied'; setTimeout(() => button.textContent = 'Copy', 1200); } catch {}
    });
  });

  document.querySelectorAll('.task-hint').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.business-question');
    toast('Hint: ' + (card.dataset.validation || 'Translate the stakeholder request into the required analytical output.').slice(0, 220));
  }));

  document.querySelectorAll('.task-solve').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.business-question');
    setTask(card.dataset.taskKey, 'attempted');
    openArena(card.querySelector('.request')?.textContent || '');
  }));

  document.querySelectorAll('.done-button').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.business-question');
    const solved = readTasks()[card.dataset.taskKey] === 'solved';
    setTask(card.dataset.taskKey, solved ? 'not_started' : 'solved');
    render();
  }));

  updateCompletion();
}

function setTask(key, status) {
  const data = readTasks();
  data[key] = status;
  writeTasks(data);
}

function updateCompletion() {
  const day = state.activeDay;
  const solved = Object.entries(readTasks()).filter(([key, value]) => key.startsWith(day + ':') && value === 'solved').length;
  const text = document.querySelector('#completionText');
  const button = document.querySelector('#completeDay');
  if (text) text.textContent = solved + '/15 completed · Progress is stored locally on this device.';
  if (button) button.disabled = solved < 15;
  button?.addEventListener('click', () => {
    localStorage.setItem('ahk_completed_day_' + day, 'true');
    toast('Day ' + day + ' completed. Continue when the next day is published.');
  }, {once:true});
}

function goDay(day) {
  if (!state.index?.open_days?.includes(day)) {
    toast('Day ' + day + ' is not published yet.');
    return;
  }
  state.activeDay = day;
  localStorage.setItem('ahk_active_day_v4', String(day));
  render();
  window.scrollTo({top:0, behavior:'smooth'});
}

function bindArena() {
  const drawer = document.querySelector('#engineDrawer');
  const open = () => { drawer?.classList.add('open'); drawer?.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); };
  const close = () => { drawer?.classList.remove('open'); drawer?.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); };
  document.querySelector('#engineLaunch')?.addEventListener('click', open);
  document.querySelector('#engineLaunch2')?.addEventListener('click', open);
  document.querySelector('#engineClose')?.addEventListener('click', close);
  document.querySelector('#runSQL')?.addEventListener('click', runSQL);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, {once:true});
}

function openArena(request) {
  document.querySelector('#engineLaunch')?.click();
  const input = document.querySelector('#sqlInput');
  if (input && request) input.dataset.businessRequest = request;
}

function runSQL() {
  const result = document.querySelector('#sqlResult');
  try {
    const output = engine.run('sql', {sql: document.querySelector('#sqlInput')?.value || ''});
    if (!output.rows.length) { result.innerHTML = '<div class="empty">Query returned no rows.</div>'; return; }
    result.innerHTML = '<div class="result-meta">' + output.rows.length + ' row(s) returned</div><table><thead><tr>' + output.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' + output.rows.map(row => '<tr>' + output.columns.map(c => '<td>' + esc(row[c]) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  } catch (error) {
    result.innerHTML = '<div class="empty error">' + esc(error.message) + '</div>';
  }
}

function bindGlobalEvents() {
  document.querySelector('#practiceNav')?.addEventListener('click', () => document.querySelector('#arena')?.scrollIntoView({behavior:'smooth'}));
  document.querySelector('#progressNav')?.addEventListener('click', () => toast(solvedCount() + ' business questions solved on this device.'));
}

function toast(message) {
  const old = document.querySelector('.academy-ux-toast'); old?.remove();
  const el = document.createElement('div'); el.className = 'academy-ux-toast'; el.textContent = message; document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

boot();
