import { EngineManager } from './engine-manager.js';
import { SQLAcademyEngine } from './sql-engine.js';

const state = {
  index: null,
  days: new Map(),
  activeDay: 1,
  topic: 0,
  completed: new Set(JSON.parse(localStorage.getItem('ahk_completed') || '[]')),
  theme: localStorage.getItem('ahk_theme') || 'dark'
};

const app = document.querySelector('#app');
const engine = new EngineManager({
  onStatus: s => {
    const el = document.querySelector('#engineStatus');
    if (el) el.textContent = s.state === 'running' ? 'Running…' : s.state === 'error' ? 'Error' : 'Ready';
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

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

const json = async (url, version = Date.now()) => {
  const sep = url.includes('?') ? '&' : '?';
  const response = await fetch(url + sep + 'v=' + encodeURIComponent(version), {
    cache: 'no-store',
    headers: {'Cache-Control':'no-cache'}
  });
  if (!response.ok) throw new Error('Unable to load ' + url + ' (' + response.status + ')');
  return response.json();
};

async function loadCurriculum() {
  const manifest = await json('./manifest.json');
  const index = await json('./curriculum/index.json', manifest.version || Date.now());
  const days = new Map();
  const indexed = new Map((index.days || []).map(item => [item.day, item]));

  for (let day = 1; day <= 100; day++) {
    const meta = indexed.get(day);
    const file = meta?.file || 'day-' + String(day).padStart(3, '0') + '.json';
    try {
      const data = await json('./curriculum/' + file, manifest.version || Date.now());
      days.set(day, data);
    } catch (error) {
      if (day <= Number(index.published_through_day || 0)) {
        throw new Error('Published Day ' + day + ' is unavailable. Check curriculum/' + file + '.');
      }
      break;
    }
  }

  const published = [...days.keys()].sort((a,b) => a-b);
  const publishedThrough = published.at(-1) || 0;

  return {
    manifest,
    index: {
      ...index,
      published_through_day: publishedThrough,
      open_days: published,
      locked_days: Array.from({length:100}, (_,i) => i + 1).filter(day => !days.has(day)),
      days: published.map(day => ({
        day,
        file: indexed.get(day)?.file || 'day-' + String(day).padStart(3,'0') + '.json',
        track: days.get(day).track,
        title: days.get(day).title,
        topics: days.get(day).topics?.length || 0,
        business_questions: (days.get(day).topics || []).reduce((n,t) => n + (t.questions?.length || 0), 0),
        status: 'open'
      }))
    },
    days
  };
}

function isOpen(day) {
  return state.index.open_days.includes(day);
}

function isComplete(day) {
  return state.completed.has(day);
}

function saveProgress() {
  localStorage.setItem('ahk_completed', JSON.stringify([...state.completed]));
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role','status');
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2400);
}

function trackMeta(track) {
  return {
    SQL: {icon:'SQL', color:'cyan', range:'01–25', desc:'Query · model · analyse'},
    Excel: {icon:'EX', color:'green', range:'26–50', desc:'Clean · model · report'},
    'Power BI': {icon:'BI', color:'violet', range:'51–75', desc:'Model · DAX · insight'},
    Python: {icon:'PY', color:'amber', range:'76–100', desc:'Analyse · automate · ship'}
  }[track] || {icon:'DA', color:'cyan', range:'', desc:'Business analytics'};
}

function dayButton(day) {
  const item = state.index.days.find(x => x.day === day);
  const open = isOpen(day);
  const active = state.activeDay === day;
  const status = open ? (isComplete(day) ? 'DONE' : 'OPEN') : 'LOCKED';

  return `<button class="day-tile ${active ? 'active' : ''} ${open ? '' : 'locked'}"
      data-day="${day}" ${open ? '' : 'disabled'}
      aria-label="Day ${day}: ${esc(item?.title || 'Coming soon')}"
      title="${esc(item?.title || 'Coming soon')}">
      <span class="day-number">${String(day).padStart(2,'0')}</span>
      <span class="day-state">${status}</span>
      <strong>${esc(item?.title?.replace(/^.*?—\s*/, '') || 'Coming soon')}</strong>
      ${isComplete(day) ? '<span class="day-check">✓</span>' : ''}
    </button>`;
}

function learningPathMarkup() {
  const tracks = [
    ['SQL',1,25], ['Excel',26,50], ['Power BI',51,75], ['Python',76,100]
  ];

  return `<section class="progress-panel">
    <div class="progress-panel-head">
      <div>
        <span class="eyebrow">Curriculum map</span>
        <h2>100-Day Learning Path</h2>
        <p>Four tracks. One business-first progression. Published content opens automatically.</p>
      </div>
      <div class="progress-summary">
        <b>${state.index.published_through_day}/100</b>
        <span>days live</span>
      </div>
    </div>
    <div class="track-grid">
      ${tracks.map(([track,start,end]) => {
        const meta = trackMeta(track);
        return `<section class="track-card ${meta.color}">
          <header class="track-head">
            <div class="track-identity">
              <span class="track-icon">${meta.icon}</span>
              <span><strong>${track}</strong><small>${meta.desc}</small></span>
            </div>
            <b>${meta.range}</b>
          </header>
          <div class="day-grid">${Array.from({length:25},(_,i) => dayButton(start+i)).join('')}</div>
        </section>`;
      }).join('')}
    </div>
  </section>`;
}

function topicMarkup(topic, index) {
  const teaching = topic.teaching || {};
  const active = state.topic === index;

  return `<article class="lesson-topic ${active ? 'open' : ''}">
    <button class="topic-toggle" aria-expanded="${active}" data-topic="${index}">
      <span class="topic-number">${String(index+1).padStart(2,'0')}</span>
      <span class="topic-title">
        <small>TOPIC ${index+1}</small>
        <strong>${esc(topic.title)}</strong>
      </span>
      <span class="topic-chevron">⌄</span>
    </button>

    <div class="topic-content">
      <div class="lesson-flow">
        <div class="lesson-step">
          <span class="step-no">01</span>
          <div>
            <small>TEACHER</small>
            <p>${esc(teaching.teacher || '')}</p>
          </div>
        </div>

        <div class="lesson-step">
          <span class="step-no">02</span>
          <div>
            <small>ANALYST MINDSET</small>
            <p>${esc(teaching.expose || topic.business_skill || '')}</p>
          </div>
        </div>
      </div>

      ${teaching.example ? `<div class="example-card">
        <div class="example-head"><span>Worked example</span><button class="copy-example" data-code="${esc(teaching.example)}">Copy</button></div>
        <pre>${esc(teaching.example)}</pre>
      </div>` : ''}

      <div class="question-stack">
        <div class="question-heading"><span>Business requests</span><small>${topic.questions?.length || 0} stakeholder tasks</small></div>
        ${(topic.questions || []).map((question, qIndex) => `
          <article class="business-question">
            <div class="question-meta">
              <span class="role">${esc(question.role || 'Stakeholder')}</span>
              <span class="difficulty">${esc(question.difficulty || 'Business')}</span>
            </div>
            <p class="scenario">${esc(question.scenario || '')}</p>
            <p class="request">${esc(question.request || '')}</p>
            <div class="question-footer"><span>Task ${qIndex+1}</span><span>Output: ${esc((question.output || []).join(', ') || 'Analytical result')}</span></div>
          </article>`).join('')}
      </div>
    </div>
  </article>`;
}

function renderDay() {
  const content = document.querySelector('#content');
  const day = state.days.get(state.activeDay);
  if (!content) return;

  if (!day) {
    content.innerHTML = `<div class="empty-day"><span class="eyebrow">COMING SOON</span><h2>Day ${state.activeDay}</h2><p>This day is not published yet. The release engine will expose it automatically after its curriculum JSON is committed.</p></div>`;
    return;
  }

  content.innerHTML = `
    <header class="lesson-header">
      <div>
        <span class="eyebrow">${esc(day.track)} · DAY ${String(day.day).padStart(2,'0')}</span>
        <h1>${esc(day.title)}</h1>
        <p>${esc(day.description || 'Build practical analytical skill through stakeholder-driven work.')}</p>
      </div>
      <div class="lesson-progress">
        <span>${day.topics.length} topics</span>
        <span>${day.topics.reduce((n,t) => n + (t.questions?.length || 0),0)} tasks</span>
      </div>
    </header>

    <div class="topic-list">
      ${day.topics.map(topicMarkup).join('')}
    </div>

    <footer class="lesson-complete">
      <div><span class="eyebrow">Daily checkpoint</span><strong>Ready to close Day ${day.day}?</strong><small>Your completion state is saved locally in this browser.</small></div>
      <button class="primary-button" id="complete-day">${isComplete(day.day) ? 'Completed ✓' : 'Mark day complete'}</button>
    </footer>`;

  content.querySelectorAll('[data-topic]').forEach(button => {
    button.onclick = () => {
      state.topic = Number(button.dataset.topic);
      renderDay();
    };
  });

  content.querySelectorAll('.copy-example').forEach(button => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.code);
        toast('Example copied');
      } catch {
        toast('Copy unavailable in this browser');
      }
    };
  });

  document.querySelector('#complete-day').onclick = () => {
    state.completed.add(day.day);
    saveProgress();
    toast('Day ' + day.day + ' completed');
    render();
  };
}

function runSQL() {
  try {
    const result = engine.run('sql', {sql: document.querySelector('#sql').value});
    const target = document.querySelector('#result');
    target.innerHTML = result.rows.length
      ? `<div class="result-meta">${result.rows.length} rows returned</div><table><thead><tr>${result.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${result.rows.map(row => `<tr>${result.columns.map(c => `<td>${esc(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '<div class="empty">Query executed successfully. 0 rows returned.</div>';
  } catch (error) {
    document.querySelector('#result').innerHTML = `<div class="empty error">${esc(error.message)}</div>`;
  }
}

function openSettings() {
  const page = document.querySelector('#settingsPage');
  if (!page) return;
  page.classList.add('open');
  page.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  window.scrollTo({top:0,behavior:'auto'});
}

function closeSettings() {
  const page = document.querySelector('#settingsPage');
  if (!page) return;
  page.classList.remove('open');
  page.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}

function openEngine() {
  const drawer = document.querySelector('#engineDrawer');
  drawer.classList.toggle('open');
  const button = document.querySelector('#engineLaunch');
  button.setAttribute('aria-expanded', drawer.classList.contains('open'));
}

function openCommandPalette() {
  const palette = document.querySelector('#commandPalette');
  palette.classList.add('open');
  palette.setAttribute('aria-hidden','false');
  const input = palette.querySelector('input');
  input.value = '';
  input.focus();
  renderCommandResults('');
}

function closeCommandPalette() {
  const palette = document.querySelector('#commandPalette');
  palette.classList.remove('open');
  palette.setAttribute('aria-hidden','true');
}

function renderCommandResults(query) {
  const list = document.querySelector('#commandResults');
  const normalized = query.trim().toLowerCase();
  const results = [...state.days.values()]
    .filter(day => !normalized || day.title.toLowerCase().includes(normalized) || day.track.toLowerCase().includes(normalized))
    .slice(0,12);

  list.innerHTML = results.map(day => `
    <button class="command-result" data-command-day="${day.day}">
      <span class="command-day">DAY ${String(day.day).padStart(2,'0')}</span>
      <span><strong>${esc(day.title)}</strong><small>${esc(day.track)} · ${day.topics.length} topics</small></span>
      <span>↵</span>
    </button>`).join('') || '<div class="command-empty">No published curriculum matched your search.</div>';

  list.querySelectorAll('[data-command-day]').forEach(button => {
    button.onclick = () => {
      state.activeDay = Number(button.dataset.commandDay);
      state.topic = 0;
      closeCommandPalette();
      render();
      document.querySelector('#content')?.scrollIntoView({behavior:'smooth',block:'start'});
    };
  });
}

function render() {
  const total = state.index.published_through_day;

  app.innerHTML = `
    <header class="topbar">
      <div class="container nav">
        <a class="brand" href="./" aria-label="AHK Academy home">
          <span class="logo">AHK</span>
          <span><strong>AHK Academy</strong><small>100-Day Data Analyst Business Trainer</small></span>
        </a>
        <nav class="nav-links" aria-label="Primary">
          <button id="learningNav">Learning</button>
          <button data-scroll="arena">Code Arena</button>
          <button data-scroll="progress">Progress</button>
          <button id="settingsBtn">Settings</button>
        </nav>
        <div class="nav-actions">
          <button class="icon-button" id="search" aria-label="Search" title="Search (Ctrl/Cmd+K)">⌕</button>
          <span class="avatar">AH</span>
        </div>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="container hero-grid">
          <div class="hero-main">
            <span class="eyebrow">Business-first analytics training</span>
            <h1>Think like an analyst.<br><span>Work like one.</span></h1>
            <p>A structured 100-day environment for SQL, Excel, Power BI and Python — built around real stakeholder requests, analytical reasoning and production habits.</p>
            <div class="hero-actions">
              <button class="primary-button" id="continue">Continue Day ${state.activeDay}</button>
              <button class="secondary-button" id="arenaBtn">Open Code Arena</button>
            </div>
            <div class="hero-trust"><span>GitHub-powered content</span><span>Local learner progress</span><span>Browser-based practice</span></div>
          </div>

          <aside class="release-card">
            <div>
              <div class="release-line"><span>Current release</span><b>LIVE</b></div>
              <h2>Day ${total} unlocked</h2>
              <p>Published curriculum is discovered at runtime. New daily content can be released without rebuilding the learning engine.</p>
            </div>
            <div>
              <div class="release-progress"><span style="width:${total}%"></span></div>
              <div class="release-foot"><span>${total}/100 days published</span><b>${total}%</b></div>
            </div>
          </aside>
        </div>
      </section>

      <section class="container metric-grid" id="progress">
        <article><span>Published days</span><strong>${total}</strong><small>Current curriculum release</small></article>
        <article><span>Topics / day</span><strong>5</strong><small>Sequenced learning blocks</small></article>
        <article><span>Business tasks / day</span><strong>15</strong><small>Stakeholder-driven practice</small></article>
        <article><span>Days completed</span><strong>${state.completed.size}</strong><small>Saved locally</small></article>
      </section>

      <section class="container workspace">
        <div class="content-card" id="content"></div>
      </section>

      <section class="container arena-section" id="arena">
        <div class="section-heading"><div><span class="eyebrow">Practice environment</span><h2>Code Arena</h2><p>Run safe, read-only SQL against the academy training dataset.</p></div><span class="status-badge">LOCAL ENGINE</span></div>
        <div class="arena-card">
          <div class="arena-copy"><span class="engine-mark">SQL</span><h3>Analyst execution layer</h3><p>Use the same business data patterns you encounter in lessons to test queries and inspect results.</p></div>
          <button class="primary-button" id="arenaLaunch">Open Engine</button>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div><strong>AHK Academy</strong><span>100-Day Data Analyst Business Trainer</span></div>
        <div class="footer-actions">
          <button class="engine-launch" id="engineLaunch" aria-expanded="false"><span class="engine-dot"></span> AHK ENGINE MATRIX <span>↑</span></button>
          <button class="footer-link" id="footerSettings">Settings</button>
        </div>
      </div>

      <section class="engine-drawer" id="engineDrawer" aria-label="AHK Engine Matrix">
        <div class="engine-head">
          <span class="engine-live"></span><strong>AHK ENGINE MATRIX</strong><span class="engine-spacer"></span>
          <button class="engine-tab active">SQL</button><button class="engine-tab" id="schema">Schema</button><button class="engine-tab" id="machines">Machines</button>
          <button class="engine-close" id="engineClose" aria-label="Close engine">−</button>
        </div>
        <div class="engine-body">
          <div class="engine-context"><span>LOCAL READ-ONLY SQL ENGINE</span><b>ORDERS DATASET</b></div>
          <textarea id="sql" spellcheck="false">SELECT category, SUM(sales) AS total_sales, SUM(profit) AS total_profit FROM orders GROUP BY category ORDER BY total_sales DESC;</textarea>
          <div class="run-row"><button class="run-button" id="run">▶ Run Query</button><span id="engineStatus">Ready</span></div>
          <div class="result" id="result"><div class="empty">Run a query to inspect the result.</div></div>
        </div>
      </section>
    </footer>

    <div class="settings-page" id="settingsPage" aria-hidden="true">
      <div class="container settings-inner">
        <div class="settings-top"><button class="back-button" id="closeSettings">← Back to Academy</button><span class="eyebrow">Academy Settings</span></div>
        <section class="settings-hero">
          <div><span class="eyebrow">Workspace control</span><h2>Settings</h2><p>Manage your learner workspace and access the complete curriculum map.</p></div>
          <div class="settings-mark">AHK</div>
        </section>
        <div class="settings-grid">
          <button class="setting-card" id="learningProgressBtn"><span class="setting-icon">▦</span><span><b>Learning Progress</b><small>Open the complete 100-day curriculum and see every track, live day and locked day.</small></span><span class="setting-arrow">→</span></button>
          <div class="setting-card static"><span class="setting-icon">◈</span><span><b>Workspace</b><small>Business-first learning mode with local learner state.</small></span><span class="setting-status">ACTIVE</span></div>
          <div class="setting-card static"><span class="setting-icon">◎</span><span><b>Content source</b><small>GitHub curriculum resources are loaded at runtime.</small></span><span class="setting-status">LIVE</span></div>
        </div>
        <div class="progress-view" id="progressView"></div>
      </div>
    </div>

    <div class="command-palette" id="commandPalette" aria-hidden="true">
      <div class="command-backdrop" id="commandBackdrop"></div>
      <div class="command-box" role="dialog" aria-label="Search academy">
        <div class="command-input"><span>⌕</span><input placeholder="Search days, tracks and curriculum..." aria-label="Search curriculum"><kbd>ESC</kbd></div>
        <div class="command-results" id="commandResults"></div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-scroll]').forEach(button => {
    button.onclick = () => document.querySelector('#' + button.dataset.scroll)?.scrollIntoView({behavior:'smooth'});
  });

  document.querySelector('#learningNav').onclick = openSettings;
  document.querySelector('#settingsBtn').onclick = openSettings;
  document.querySelector('#footerSettings').onclick = openSettings;
  document.querySelector('#closeSettings').onclick = closeSettings;

  document.querySelector('#learningProgressBtn').onclick = () => {
    const view = document.querySelector('#progressView');
    view.classList.add('visible');
    view.innerHTML = learningPathMarkup();
    view.querySelectorAll('[data-day]').forEach(button => {
      button.onclick = () => {
        state.activeDay = Number(button.dataset.day);
        state.topic = 0;
        closeSettings();
        render();
        document.querySelector('#content')?.scrollIntoView({behavior:'smooth'});
      };
    });
    view.scrollIntoView({behavior:'smooth',block:'start'});
  };

  document.querySelector('#continue').onclick = () => document.querySelector('#content')?.scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelector('#arenaBtn').onclick = () => document.querySelector('#arena')?.scrollIntoView({behavior:'smooth'});
  document.querySelector('#arenaLaunch').onclick = openEngine;
  document.querySelector('#engineLaunch').onclick = openEngine;
  document.querySelector('#engineClose').onclick = () => document.querySelector('#engineDrawer').classList.remove('open');
  document.querySelector('#run').onclick = runSQL;
  document.querySelector('#schema').onclick = () => toast('Schema machine ready');
  document.querySelector('#machines').onclick = () => toast('Engine registry ready');

  document.querySelector('#search').onclick = openCommandPalette;
  document.querySelector('#commandBackdrop').onclick = closeCommandPalette;
  document.querySelector('#commandPalette input').oninput = event => renderCommandResults(event.target.value);

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommandPalette();
    }
    if (event.key === 'Escape') {
      closeCommandPalette();
      closeSettings();
    }
  }, {once:false});

  renderDay();
}

loadCurriculum()
  .then(({index,days}) => {
    state.index = index;
    days.forEach((day, number) => state.days.set(number, day));
    if (!state.days.has(state.activeDay)) state.activeDay = index.published_through_day || 1;
    render();
  })
  .catch(error => {
    app.innerHTML = `<div class="fatal"><span class="eyebrow">ACADEMY LOAD ERROR</span><h2>Learning content could not be loaded.</h2><p>${esc(error.message)}</p><button class="primary-button" onclick="location.reload()">Retry</button></div>`;
  });
