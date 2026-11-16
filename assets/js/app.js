import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.esm.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm';
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

async function loadCurriculum()
  .then(({index,days}) => {
    state.index = index;
    days.forEach((day, number) => state.days.set(number, day));

    // Clamp stale localStorage selections to a real published day.
    const savedDay = Number(localStorage.getItem('ahk_active_day_v4') || state.activeDay);
    state.activeDay = index.open_days.includes(savedDay)
      ? savedDay
      : (index.published_through_day || index.open_days[0] || 1);

    window.__AHK_INDEX__ = index;
    window.__AHK_ACTIVE_DAY__ = state.activeDay;
    window.__AHK_STATE__ = state;
    render();
  })
  .catch(error => {
    app.innerHTML = `<div class="fatal"><span class="eyebrow">ACADEMY LOAD ERROR</span><h2>Learning content could not be loaded.</h2><p>${esc(error.message)}</p><button class="primary-button" onclick="location.reload()">Retry</button></div>`;
  });


/* AHK Academy UX enhancement layer v3.1 */
(function academyUX(){
  const taskStore='ahk_task_status_v4';

  const escUX = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const readTasks=()=>{try{return JSON.parse(localStorage.getItem(taskStore)||'{}')}catch{return {}}};
  const taskKey=(day,topic,question)=>day+':'+topic+':'+question;
  const setTask=(day,topic,question,status)=>{
    const d=readTasks();
    d[taskKey(day,topic,question)]=status;
    localStorage.setItem(taskStore,JSON.stringify(d));
  };

  function renderMarkdown(root){
    if(!root || typeof marked==='undefined' || typeof DOMPurify==='undefined') return;
    root.querySelectorAll('.lesson-step p').forEach(node=>{
      if(node.dataset.markdownRendered) return;
      const raw=node.textContent||'';
      node.innerHTML=DOMPurify.sanitize(marked.parse(raw),{USE_PROFILES:{html:true},FORBID_TAGS:['script','style','iframe','object','embed','form']});
      node.classList.add('markdown-body');
      node.dataset.markdownRendered='1';
    });
  }

  function addModeSwitcher(root){
    root.querySelectorAll('.lesson-topic').forEach(topic=>{
      if(topic.querySelector('.academy-mode-switch')) return;
      const content=topic.querySelector('.topic-content');
      const flow=topic.querySelector('.lesson-flow');
      if(!content || !flow) return;
      const switcher=document.createElement('div');
      switcher.className='academy-mode-switch';
      switcher.setAttribute('role','tablist');
      ['Teacher','Concept','Deep Dive','Analyst Mindset'].forEach((label,i)=>{
        const b=document.createElement('button');
        b.type='button';
        b.textContent=label;
        b.dataset.mode=String(i);
        if(i===0)b.classList.add('active');
        switcher.appendChild(b);
      });
      content.insertBefore(switcher,flow);
      switcher.querySelectorAll('button').forEach(button=>{
        button.onclick=()=>{
          switcher.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
          button.classList.add('active');
          const steps=flow.querySelectorAll('.lesson-step');
          if(steps.length<2)return;
          if(button.dataset.mode==='0'){steps[0].style.display='';steps[1].style.display='';}
          if(button.dataset.mode==='1'){steps[0].style.display='';steps[1].style.display='none';}
          if(button.dataset.mode==='2'){steps[0].style.display='';steps[1].style.display='';}
          if(button.dataset.mode==='3'){steps[0].style.display='none';steps[1].style.display='';}
        };
      });
    });
  }

  function addTaskActions(root){
    const day=(window.__AHK_STATE__?.activeDay)||Number((document.querySelector('.lesson-header .eyebrow')?.textContent.match(/DAY\s+(\d+)/i)||[])[1]);
    if(!day)return;
    root.querySelectorAll('.business-question').forEach((card,qi)=>{
      if(card.querySelector('.academy-task-actions'))return;
      const footer=card.querySelector('.question-footer');
      if(!footer)return;
      const topicEl=card.closest('.lesson-topic');
      const topicIndex=[...root.querySelectorAll('.lesson-topic')].indexOf(topicEl);
      const buttons=document.createElement('div');
      buttons.className='academy-task-actions';
      const hint=document.createElement('button');
      hint.className='text-button'; hint.textContent='Hint'; hint.type='button';
      hint.onclick=()=>toastUX('Hint: '+(card.dataset.validation||'Translate the stakeholder request into the required analytical output.'));
      const solve=document.createElement('button');
      solve.className='secondary-button'; solve.textContent='Solve in Arena'; solve.type='button';
      solve.onclick=()=>{
        setTask(day,topicIndex,qi,'attempted');
        const request=card.querySelector('.request')?.textContent||'';
        const event=new CustomEvent('ahk:open-arena',{detail:{request}});
        document.dispatchEvent(event);
        toastUX('Task loaded into SQL Practice.');
      };
      const done=document.createElement('button');
      done.className='done-button'; done.textContent='Mark done'; done.type='button';
      done.onclick=()=>{
        setTask(day,topicIndex,qi,'solved');
        done.textContent='Done ✓'; done.classList.add('done'); card.classList.add('solved');
        updateTaskCounter(root,day);
      };
      buttons.append(hint,solve,done);
      card.appendChild(buttons);
      const output=card.querySelector('.question-footer span:last-child');
      if(output){
        const raw=output.textContent.replace(/^Output:\s*/,'').trim();
        const box=document.createElement('div');
        box.className='academy-output';
        box.innerHTML='<span>Expected output</span><div>'+raw.split(',').map(x=>'<code>'+escUX(x.trim())+'</code>').join('')+'</div>';
        output.replaceWith(box);
      }
    });
  }

  function updateTaskCounter(root,day){
    const d=readTasks();
    let solved=0;
    root.querySelectorAll('.business-question').forEach((_,qi)=>{
      /* counter is visual only; task completion remains stored per task */
    });
    const footer=root.querySelector('.lesson-complete small');
    if(footer) footer.textContent='Complete all 15 business tasks to close the day. Your progress is saved locally.';
  }

  function addDayPicker(){
    if(document.querySelector('.academy-day-picker'))return;
    const content=document.querySelector('#content');
    if(!content)return;
    const panel=document.createElement('section');
    panel.className='container academy-day-picker';
    panel.innerHTML='<div><span class="eyebrow">Current learning day</span><strong id="academyDayLabel">Learning</strong></div><div class="academy-day-actions"><button type="button" id="academyPrev">←</button><select id="academyDaySelect" aria-label="Select published day"></select><button type="button" id="academyNext">→</button></div>';
    content.parentElement.insertBefore(panel,content);
    const index=window.__AHK_INDEX__;
    if(index){
      const select=panel.querySelector('#academyDaySelect');
      index.open_days.forEach(d=>{
        const option=document.createElement('option');
        option.value=String(d);
        option.textContent='Day '+d;
        select.appendChild(option);
      });
      select.value=String(window.__AHK_ACTIVE_DAY__||1);
      panel.querySelector('#academyDayLabel').textContent='Day '+select.value;
      select.onchange=()=>goDay(Number(select.value));
      panel.querySelector('#academyPrev').onclick=()=>goDay(Number(select.value)-1);
      panel.querySelector('#academyNext').onclick=()=>goDay(Number(select.value)+1);
    }
  }

  function goDay(day){
    const index=window.__AHK_INDEX__;
    if(!index || !index.open_days.includes(day)){toastUX('That day is not published yet.');return;}
    window.__AHK_ACTIVE_DAY__=day;
    localStorage.setItem('ahk_active_day_v4',String(day));
    location.hash='day-'+day;
    location.reload();
  }

  function toastUX(message){
    let n=document.querySelector('.academy-ux-toast');
    if(n)n.remove();
    n=document.createElement('div');
    n.className='academy-ux-toast';
    n.textContent=message;
    document.body.appendChild(n);
    setTimeout(()=>n.remove(),2200);
  }

  function repairNav(){
    document.querySelectorAll('.nav-links button').forEach(b=>b.classList.remove('active'));
    document.querySelector('#learningNav')?.classList.add('active');
    document.querySelector('#settingsBtn')?.classList.remove('active');
  }

  function observe(){
    const app=document.querySelector('#app');
    if(!app)return;
    const observer=new MutationObserver(()=>{
      repairNav();
      renderMarkdown(app);
      addModeSwitcher(app);
      addTaskActions(app);
    });
    observer.observe(app,{childList:true,subtree:true});
    repairNav();
    addDayPicker();
    renderMarkdown(app);
    addModeSwitcher(app);
    addTaskActions(app);
  }

  window.__AHK_UX__={toastUX,goDay};
  document.addEventListener('ahk:open-arena',event=>{
    document.querySelector('#engineLaunch')?.click();
    setTimeout(()=>{
      const ctx=document.querySelector('#engineTaskContext');
      if(ctx)ctx.innerHTML='<strong>Business request</strong><p>'+escUX(event.detail.request)+'</p>';
    },80);
  });
  observe();
})();



(function completionUX(){
  const store='ahk_task_status_v4';
  const read=()=>{try{return JSON.parse(localStorage.getItem(store)||'{}')}catch{return {}}};
  function sync(){
    const root=document.querySelector('#content');
    if(!root)return;
    const day=Number(window.__AHK_ACTIVE_DAY__||1);
    const data=read();
    let solved=0;
    root.querySelectorAll('.lesson-topic').forEach((topic,ti)=>{
      topic.querySelectorAll('.business-question').forEach((card,qi)=>{
        const key=day+':'+ti+':'+qi;
        const status=data[key]||'not_started';
        if(status==='solved')solved++;
        const done=card.querySelector('.done-button');
        if(done){
          done.classList.toggle('done',status==='solved');
          done.textContent=status==='solved'?'Done ✓':'Mark done';
        }
        let chip=card.querySelector('.academy-status-chip');
        if(!chip){
          chip=document.createElement('span');
          chip.className='academy-status-chip';
          card.querySelector('.task-label')?.appendChild(chip);
        }
        chip.textContent=status==='solved'?'Solved':status==='attempted'?'Attempted':'Not started';
        chip.dataset.status=status;
      });
    });
    const complete=root.querySelector('#complete-day');
    if(complete){
      complete.disabled=solved<15;
      const small=root.querySelector('.lesson-complete small');
      if(small)small.textContent=solved+'/15 completed · Complete all 15 business tasks to close the day.';
    }
  }
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true,subtree:true});
  sync();
})();
