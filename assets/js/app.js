import { SQLEngine } from '../../engines/sql-engine.js';

const app=document.querySelector('#app');
const state={
  manifest:null,
  index:null,
  day:null,
  activeDay:Number(localStorage.getItem('ahk_active_day_v5')||1),
  activeTopic:0,
  activeQuestion:0,
  taskState:readJSON('ahk_task_status_v5',{}),
  sqlEngine:null,
  sqlReady:false
};
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trackFor=d=>d<=25?'SQL':d<=50?'Excel':d<=75?'Power BI & DAX':'Python & Pandas';
function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}
function saveTaskState(){localStorage.setItem('ahk_task_status_v5',JSON.stringify(state.taskState))}
function taskKey(day,topic,question){return day+':'+topic+':'+question}
function countQuestions(day){return (day?.topics||[]).reduce((n,t)=>n+(t.questions?.length||0),0)}
function solvedForDay(day){return Object.entries(state.taskState).filter(([k,v])=>k.startsWith(day+':')&&v==='solved').length}
async function getJSON(path){const r=await fetch('./'+path+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(path+' · HTTP '+r.status);return r.json()}
function toast(message){const old=$('.toast');old?.remove();const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400)}
function publishedDays(){return Number(state.manifest?.release_control?.published_through_day||state.index?.published_through_day||0)}
function dayMeta(day){return state.index.days.find(x=>x.day===day)}
function updateUrl(){history.replaceState(null,'','#day-'+String(state.activeDay).padStart(2,'0'))}

async function loadDay(day){
  const published=publishedDays();
  if(day<1||day>published){toast('That day is not published yet.');return}
  state.activeDay=day;state.activeTopic=0;state.activeQuestion=0;
  localStorage.setItem('ahk_active_day_v5',String(day));
  app.innerHTML='<div class="loading">Preparing your learning environment…</div>';
  try{state.day=await getJSON('curriculum/'+dayMeta(day).file);render();updateUrl();window.scrollTo({top:0,behavior:'smooth'})}
  catch(e){renderFatal(e)}
}
function renderFatal(error){app.innerHTML='<main class="fatal"><div class="fatal-card"><span class="kicker">AHK Academy · Runtime</span><h1>Learning environment could not start.</h1><p>'+esc(error.message)+'</p><button class="retry" onclick="location.reload()">Retry</button></div></main>'}

function render(){
 const d=state.day,pub=publishedDays(),solved=solvedForDay(d.day),total=countQuestions(d);
 app.innerHTML='<div class="app-shell">'+renderHeader()+'<main id="main" class="page"><div class="page-grid">'+renderLeftRail(pub)+'<section class="lesson">'+renderLesson(d)+'</section>'+renderRightRail(d)+'</div></main></div>';
 bind();
 updateProgressUI(solved,total);
}
function renderHeader(){return '<header class="topbar"><div class="topbar-inner"><a class="brand" href="./"><span class="logo">AHK</span><span><span class="brand-name">AHK Academy</span><span class="brand-sub">Data Analyst Learning Hub</span></span></a><nav class="primary-nav"><button class="nav-item active" data-scroll="lesson">Learn</button><button class="nav-item" data-scroll="practice">Practice</button><button class="nav-item" data-scroll="projects">Projects</button><button class="nav-item" data-scroll="progress">Progress</button></nav><div class="header-search"><span>⌕</span><input id="globalSearch" placeholder="Search lessons, topics…" aria-label="Search lessons"><kbd>Ctrl K</kbd></div><div class="profile"><span>AK</span><div class="avatar">AK</div></div></div></header>'}
function renderLeftRail(pub){
 const groups=[['SQL',1,25],['Excel',26,50],['Power BI',51,75],['Python',76,100]];
 let html='<aside class="left-rail"><div class="panel rail-panel"><div class="rail-header"><h2>100-Day Data Analyst Journey</h2><p>Business-first learning path</p></div><div class="program-progress"><div class="progress-row"><span>Day '+state.activeDay+' of 100</span><strong>'+Math.round(state.activeDay)+'%</strong></div><div class="progress-track"><div class="progress-fill" style="width:'+state.activeDay+'%"></div></div></div><div class="track-list">';
 for(const [name,start,end] of groups){html+='<div class="track-label">'+name+'</div>';for(let d=start;d<=end;d++){const meta=dayMeta(d),open=d<=pub,active=d===state.activeDay;html+='<button class="day-button '+(active?'active ':'')+(!open?'locked':'')+'" data-day="'+d+'" '+(!open?'disabled':'')+'><span class="day-line"><span class="day-number">Day '+String(d).padStart(2,'0')+'</span><span class="day-state">'+(open?'OPEN':'LOCKED')+'</span></span><span class="day-title">'+esc(meta?.title?.replace(/^.*?—\s*/,'')||'Content will unlock')+'</span></button>'}}html+='</div></div></aside>';return html;
}
function renderLesson(d){
 const topics=d.topics||[],active=state.activeTopic;
 return '<div class="breadcrumb"><span>Learning Path</span><span>›</span><span>'+esc(d.track)+'</span><span>›</span><strong>Day '+d.day+'</strong></div><div class="lesson-hero"><span class="kicker">'+esc(d.track)+' · Day '+String(d.day).padStart(2,'0')+'</span><h1>'+esc(d.title)+'</h1><p>'+esc(d.description||d.learning_objectives?.[0]||'Build practical analytical capability through guided business learning.')+'</p><div class="hero-meta"><span class="meta-pill"><strong>5</strong> topics</span><span class="meta-pill"><strong>15</strong> business requests</span><span class="meta-pill"><strong>'+solvedForDay(d.day)+'</strong>/15 solved</span><span class="meta-pill">~'+(d.estimated_time_minutes||45)+' min</span></div></div><div class="learning-tabs"><button class="learning-tab active">Learn</button><button class="learning-tab" data-scroll="examples">Examples</button><button class="learning-tab" data-scroll="practice">Business Case</button></div><div class="lesson-layout"><aside class="lesson-plan panel"><div class="plan-card"><div class="plan-title">Lesson plan</div>'+topics.map((t,i)=>'<button class="plan-item '+(i===active?'active':'')+'" data-topic="'+i+'"><small>Topic '+(i+1)+'</small><strong>'+esc(t.title)+'</strong><span>'+((i+1)*5+1)+' min · '+(t.questions?.length||3)+' tasks</span></button>').join('')+'</div></aside><div id="topicArea">'+renderTopic(topics[active],active)+'</div></div><div class="daily-checkpoint"><div><h3>Day '+d.day+' learning checkpoint</h3><p id="checkpointText">'+solvedForDay(d.day)+'/15 business requests solved. Progress stays on this device.</p></div><button class="complete-day" id="completeDay" '+(solvedForDay(d.day)<15?'disabled':'')+'>Complete day</button></div>';
}
function renderTopic(t,index){
 if(!t)return '';
 const teaching=t.teaching||{};
 const example=teaching.syntax||teaching.example_sql||teaching.example||'';
 return '<article class="topic-card active"><button class="topic-toggle"><span class="topic-number">'+String(index+1).padStart(2,'0')+'</span><span class="topic-heading"><small>TOPIC '+(index+1)+'</small><strong>'+esc(t.title)+'</strong></span><span class="topic-chevron">⌄</span></button><div class="topic-content"><div class="teacher-grid"><div class="teacher-card"><span class="label">Why this matters</span><p>'+esc(teaching.purpose||teaching.business_context||'Understand the business purpose before writing the analysis.')+'</p></div><div class="teacher-card"><span class="label">How it works</span><p>'+esc(teaching.explanation||teaching.detailedlearning||teaching.explain||'Learn the technique, then apply it to a business request.')+'</p></div><div class="teacher-card"><span class="label">Analyst mindset</span><p>'+esc(teaching.expose||'Keep the business question, data grain, and expected output aligned.')+'</p></div><div class="teacher-card"><span class="label">Practice goal</span><p>'+esc(t.business_skill||'Translate the concept into a reproducible analytical result.')+'</p></div></div>'+(example?'<div class="example-box"><div class="example-head"><span>Worked example</span><button class="copy-button" data-copy="'+esc(example)+'">Copy</button></div><pre>'+esc(example)+'</pre></div>':'')+'<div class="business-list"><div class="section-label"><strong>Business requests</strong><span>3 tasks · solve without a pre-written answer</span></div>'+(t.questions||[]).map((q,i)=>renderQuestion(q,index,i)).join('')+'</div></div></article>';
}
function renderQuestion(q,topicIndex,questionIndex){
 const key=taskKey(state.activeDay,topicIndex,questionIndex),status=state.taskState[key]||'not_started';
 return '<article class="business-card '+(status==='solved'?'solved':'')+'" data-task="'+key+'"><div class="question-top"><span class="role">'+esc(q.role||'Senior Analyst')+'</span><span class="level">'+esc(q.difficulty||'Business task')+'</span></div><p class="scenario">'+esc(q.scenario||'')+'</p><p class="request">'+esc(q.request||q.question||'')+'</p><div class="deliverable">Deliverable: '+esc(Array.isArray(q.output)?q.output.join(' · '):(q.required_output||'Business-ready analytical result'))+'</div><div class="task-actions"><button class="task-btn task-hint">Hint</button><button class="task-btn primary task-solve">Solve in Practice</button><button class="task-btn done-button '+(status==='solved'?'done':'')+'">'+(status==='solved'?'Completed ✓':'Mark done')+'</button></div></article>';
}
function renderRightRail(d){
 const q=(d.topics?.[state.activeTopic]?.questions||[])[state.activeQuestion];
 return `<aside class="right-rail"><section class="panel request-panel" id="businessCase"><div class="request-head"><h2>Business Request</h2><span class="request-count">Question ${state.activeQuestion+1} of 3</span></div><div class="request-selector">${(d.topics?.[state.activeTopic]?.questions||[]).map((x,i)=>`<button class="q-chip ${i===state.activeQuestion?'active':''}" data-question="${i}">Q${i+1}</button>`).join('')}</div><span class="request-role">${esc(q?.role||'Stakeholder')}</span><h3>${esc(q?.title||'Your business task')}</h3><p>${esc(q?.scenario||'')}</p><div class="task-callout"><span>Your task</span><strong>${esc(q?.request||q?.question||'Translate the request into an analytical result.')}</strong></div></section>${renderPractice(d,q)}</aside>`;
}
function renderPractice(d,q){
 return `<section class="panel practice-panel" id="practice"><div class="practice-header"><div class="practice-title"><span class="code-icon">&lt;/&gt;</span><div><h2>Practice Workspace</h2><span>Write the solution yourself · read-only dataset</span></div></div><select class="dataset-select" id="datasetSelect"><option>orders · 150 rows</option></select></div><div class="practice-tools"><button class="tool-tab active" data-tool="query">Write SQL</button><button class="tool-tab" data-tool="table">Tbl (Data)</button><button class="tool-tab" data-tool="question">Question</button></div><div class="practice-body"><div class="practice-pane active" data-pane="query"><textarea id="sqlEditor" class="sql-editor" spellcheck="false" placeholder="Write your SQL query here…"></textarea><div class="editor-actions"><button class="run-query" id="runQuery">▶ Run Query</button><button class="clear-query" id="clearQuery">Clear</button><button class="format-query" id="formatQuery">Format</button><span class="engine-state" id="engineState">Ready · answer not provided</span></div><div class="hint">No solution is pre-filled. Use the business request, inspect <b>Tbl (Data)</b>, and write your own query.</div><div class="results" id="results"><div class="results-empty">Run your query to see the result here.</div></div></div><div class="practice-pane" data-pane="table"><div class="schema-grid" id="schemaGrid"></div><div class="schema-table" id="sampleTable"></div></div><div class="practice-pane" data-pane="question"><div class="task-callout"><span>Current business request</span><strong id="questionText">${esc(q?.request||'')}</strong></div><p style="font-size:8px;color:#7a857e;line-height:1.6;margin:10px 0 0">Use this request as your analytical specification. Do not copy an answer; derive the query from the requirement.</p></div></div></section>`;
}
function bind(){
 $$('.day-button').forEach(b=>b.addEventListener('click',()=>loadDay(Number(b.dataset.day))));
 $$('.plan-item').forEach(b=>b.addEventListener('click',()=>{state.activeTopic=Number(b.dataset.topic);state.activeQuestion=0;render();document.querySelector('#topicArea')?.scrollIntoView({behavior:'smooth',block:'start'})}));
 $$('.q-chip').forEach(b=>b.addEventListener('click',()=>{state.activeQuestion=Number(b.dataset.question);renderRightRailOnly()}));
 $$('.task-solve').forEach(b=>b.addEventListener('click',()=>{const card=b.closest('[data-task]');state.taskState[card.dataset.task]='attempted';saveTaskState();openPractice();}));
 $$('.task-hint').forEach(b=>b.addEventListener('click',()=>{const card=b.closest('[data-task]');const q=findQuestionByKey(card.dataset.task);toast('Hint: '+(q?.validation||'Translate the business request into the fields, filters, and calculations it requires.'))}));
 $$('.done-button').forEach(b=>b.addEventListener('click',()=>{const card=b.closest('[data-task]');const current=state.taskState[card.dataset.task];state.taskState[card.dataset.task]=current==='solved'?'not_started':'solved';saveTaskState();render()}));
 $('#completeDay')?.addEventListener('click',()=>{localStorage.setItem('ahk_completed_day_'+state.activeDay,'true');toast('Day '+state.activeDay+' completed locally.');});
 $$('.topic-toggle').forEach(b=>b.addEventListener('click',()=>b.closest('.topic-card').classList.toggle('active')));
 $$('.copy-button').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy||'');b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1000)}catch{}}));
 $$('.tool-tab').forEach(b=>b.addEventListener('click',()=>switchPracticeTool(b.dataset.tool)));
 $$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'})));
 $('#runQuery')?.addEventListener('click',runQuery);
 $('#clearQuery')?.addEventListener('click',()=>{$('#sqlEditor').value='';$('#results').innerHTML='<div class="results-empty">Editor cleared. Write your own query.</div>'});
 $('#formatQuery')?.addEventListener('click',()=>{$('#sqlEditor').value=basicFormat($('#sqlEditor').value)});
 bindSearch();
 renderSchema();
}
function renderRightRailOnly(){
 const old=$('.right-rail'),newHTML=renderRightRail(state.day);old.outerHTML=newHTML;bindPracticeOnly();renderSchema();
}
function bindPracticeOnly(){
 $$('.q-chip').forEach(b=>b.addEventListener('click',()=>{state.activeQuestion=Number(b.dataset.question);renderRightRailOnly()}));
 $$('.tool-tab').forEach(b=>b.addEventListener('click',()=>switchPracticeTool(b.dataset.tool)));
 $('#runQuery')?.addEventListener('click',runQuery);$('#clearQuery')?.addEventListener('click',()=>{$('#sqlEditor').value='';$('#results').innerHTML='<div class="results-empty">Editor cleared. Write your own query.</div>'});$('#formatQuery')?.addEventListener('click',()=>{$('#sqlEditor').value=basicFormat($('#sqlEditor').value)});
}
function switchPracticeTool(tool){$$('.tool-tab').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$$('.practice-pane').forEach(p=>p.classList.toggle('active',p.dataset.pane===tool))}
function openPractice(){document.querySelector('#practice')?.scrollIntoView({behavior:'smooth',block:'start'});switchPracticeTool('query');setTimeout(()=>$('#sqlEditor')?.focus(),250)}
function findQuestionByKey(key){const [,ti,qi]=key.split(':').map(Number);return state.day?.topics?.[ti]?.questions?.[qi]}
function updateProgressUI(solved,total){const fill=$('.program-progress .progress-fill');if(fill)fill.style.width=Math.min(100,(state.activeDay/100)*100)+'%';const text=$('#checkpointText');if(text)text.textContent=solved+'/'+total+' business requests solved. Progress stays on this device.'}
function bindSearch(){const input=$('#globalSearch');if(!input)return;input.addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();$$('.day-button').forEach(b=>b.style.display=!q||b.textContent.toLowerCase().includes(q)?'block':'none')});document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();input.focus()}})}
function basicFormat(sql){return String(sql||'').replace(/\s+/g,' ').replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT)\s+/gi,'\\n$1 ').replace(/,/g,', ')}
async function ensureSQLEngine(){
 if(state.sqlReady)return state.sqlEngine;
 state.sqlEngine=new SQLEngine();
 $('#engineState').textContent='Starting local SQL engine…';
 await state.sqlEngine.init();
 state.sqlReady=true;
 return state.sqlEngine;
}
async function runQuery(){
 const input=$('#sqlEditor'),out=$('#results'),status=$('#engineState');if(!input||!out)return;
 const sql=input.value.trim();if(!sql){out.innerHTML='<div class="results-empty">Write a SQL query first.</div>';return}
 status.textContent='Executing…';out.innerHTML='<div class="results-empty">Running your query locally…</div>';
 try{
  const engine=await ensureSQLEngine();const r=await engine.run(sql);status.textContent=r.elapsed+' ms · '+r.rows.length+' rows';
  if(!r.rows.length){out.innerHTML='<div class="results-empty">Query executed successfully but returned no rows.</div>';return}
  out.innerHTML='<div class="results-meta">'+r.rows.length+' row(s) returned · local execution</div><table><thead><tr>'+r.columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+r.rows.map(row=>'<tr>'+r.columns.map(c=>'<td>'+esc(row[c])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 }catch(e){status.textContent='Ready · query needs attention';out.innerHTML='<div class="results-empty error">'+esc(e.message)+'</div>'}
}
async function renderSchema(){
 const schemaGrid=$('#schemaGrid'),sample=$('#sampleTable');if(!schemaGrid||!sample)return;
 try{
  const s=await getJSON('datasets/orders/schema.json');schemaGrid.innerHTML=s.columns.map(([name,type])=>'<div class="schema-item"><strong>'+esc(name)+'</strong><span>'+esc(type)+'</span></div>').join('');
  const data=await getJSON('datasets/orders/data.csv');const rows=parseCSV(data);sample.innerHTML='<table><thead><tr>'+rows.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.rows.slice(0,8).map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 }catch(e){schemaGrid.innerHTML='<div class="results-empty error">Dataset metadata unavailable.</div>'}
}
function parseCSV(text){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(!lines.length)return{headers:[],rows:[]};
 const parse=line=>{const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out};const headers=parse(lines.shift());return{headers,rows:lines.map(parse)};
}
async function boot(){
 try{
  state.manifest=await getJSON('manifest.json');state.index=await getJSON('curriculum/index.json');
  const pub=publishedDays(),hash=location.hash.match(/day-(\d+)/),wanted=hash?Number(hash[1]):Number(localStorage.getItem('ahk_active_day_v5')||pub||1);
  await loadDay(Math.min(Math.max(1,wanted),pub));
 }catch(e){renderFatal(e)}
}
boot();
