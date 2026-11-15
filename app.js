const state={manifest:null,index:null,current:null};
const progress=JSON.parse(localStorage.getItem("ahk_da_progress")||"{}");
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function getJson(path){const r=await fetch(path,{cache:"no-store"});if(!r.ok)throw new Error(path+" ("+r.status+")");return r.json()}
function save(){localStorage.setItem("ahk_da_progress",JSON.stringify(progress));updateGlobalProgress()}
function updateGlobalProgress(){$("#doneCount").textContent=Object.values(progress).filter(Boolean).length}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200)}
function trackFor(day){return day<=25?"SQL":day<=50?"Excel":day<=75?"Power BI & DAX":"Python & Pandas"}
function renderDays(){
 const published=Number(state.manifest.release_control.published_through_day);
 const metaMap=new Map(state.index.days.map(x=>[x.day,x]));
 $("#days").innerHTML=Array.from({length:100},(_,i)=>{
  const n=i+1,m=metaMap.get(n),open=n<=published;
  return '<button class="day '+(!open?"locked":"")+'" '+(!open?"disabled":"")+' data-day="'+n+'"><div class="day-row"><span class="day-num">Day '+String(n).padStart(2,"0")+'</span><span class="day-status">'+(open?"OPEN":"LOCKED")+'</span></div><span class="day-track">'+trackFor(n)+'</span><span class="day-title">'+esc(m?.title?.replace(/^.*?— /,"")||"Content not published")+'</span></button>'
 }).join("");
 document.querySelectorAll(".day:not(.locked)").forEach(b=>b.onclick=()=>openDay(Number(b.dataset.day)));
}
function teach(label,value){return '<div class="teach"><h4>'+label+'</h4><p>'+esc(value||"")+'</p></div>'}
function question(q){
 const done=!!progress[q.id];
 return '<div class="question"><div class="qhead"><span class="qrole">'+esc(q.role)+'</span><span class="qdifficulty">'+esc(q.difficulty||"Business task")+'</span></div><p><b>Scenario:</b> '+esc(q.scenario)+'</p><p class="request"><b>Request:</b> '+esc(q.request)+'</p><div class="output">Expected output: '+esc((q.output||[]).join(", "))+'</div><button class="complete '+(done?"done":"")+'" data-q="'+esc(q.id)+'">'+(done?"✓ Completed":"Mark completed")+'</button></div>'
}
function updateBar(d){
 const ids=d.topics.flatMap(t=>t.questions.map(q=>q.id)),done=ids.filter(id=>progress[id]).length;
 $("#bar").style.width=(done/Math.max(ids.length,1)*100)+"%";$("#dayProgress").textContent=done+"/"+ids.length+" questions";
 document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{progress[b.dataset.q]=!progress[b.dataset.q];b.classList.toggle("done",!!progress[b.dataset.q]);b.textContent=progress[b.dataset.q]?"✓ Completed":"Mark completed";save();updateBar(d);toast(progress[b.dataset.q]?"Question completed":"Completion removed")})
}
function renderDay(d){
 const completed=d.topics.flatMap(t=>t.questions).filter(q=>progress[q.id]).length;
 $("#content").innerHTML='<div class="content-head"><div class="crumb">'+esc(d.track)+' · Day '+String(d.day).padStart(2,"0")+'</div><h2>'+esc(d.title)+'</h2><p class="desc">'+esc(d.description||"")+'</p><div class="course-meta"><span class="pill">5 <strong>Topics</strong></span><span class="pill">15 <strong>Business requests</strong></span><span class="pill">Track <strong>'+esc(d.track)+'</strong></span><span class="pill">Day <strong>'+d.day+'/100</strong></span></div></div><div class="progress-wrap"><div class="progress-track"><div id="bar" class="progress-fill"></div></div><span id="dayProgress" class="progress-label">'+completed+"/15 questions"+'</span></div><div id="topics"></div>';
 $("#topics").innerHTML=d.topics.map((t,i)=>'<article class="topic" id="topic-'+i+'"><div class="topic-head"><div><div class="topic-index">TOPIC '+String(i+1).padStart(2,"0")+'</div><h3>'+esc(t.title)+'</h3></div><span class="topic-chevron">⌄</span></div><div class="topic-body"><p class="skill">'+esc(t.business_skill||"")+'</p><div class="teaching">'+teach("Teacher",t.teaching?.teacher)+teach("Concept",t.teaching?.explain)+teach("Deep practice",t.teaching?.detailedlearning)+teach("Analyst mindset",t.teaching?.expose)+'</div><div class="example">'+esc(t.teaching?.example||"")+'</div><div class="questions">'+t.questions.map(question).join("")+'</div></div></article>').join("");
 document.querySelectorAll(".topic-head").forEach((h,i)=>h.onclick=()=>{h.parentElement.classList.toggle("open");if(i===0&&!h.parentElement.classList.contains("open"))return});
 updateBar(d);
}
async function openDay(day){
 document.querySelectorAll(".day").forEach(x=>x.classList.toggle("active",Number(x.dataset.day)===day));
 const meta=state.index.days.find(x=>x.day===day);if(!meta)return;
 $("#content").innerHTML='<div class="empty"><h3>Loading Day '+day+'</h3><p>Preparing your business learning workspace…</p></div>';
 try{state.current=await getJson("./curriculum/"+meta.file);renderDay(state.current);history.replaceState(null,"","#day-"+String(day).padStart(2,"0"))}catch(e){$("#content").innerHTML='<div class="empty"><h3>Curriculum unavailable</h3><p>'+esc(e.message)+'</p></div>'}
}
function bindNav(){
 document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>toast(b.dataset.nav+" workspace is ready for the next engine release."));
 const search=$("#search");document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();search.focus()}});
 search.addEventListener("input",()=>{const q=search.value.toLowerCase().trim();document.querySelectorAll(".day").forEach(b=>{b.style.display=!q||b.textContent.toLowerCase().includes(q)?"block":"none"})});
}
async function init(){
 try{
  state.manifest=await getJson("./manifest.json");state.index=await getJson("./curriculum/index.json");
  const published=state.manifest.release_control.published_through_day;
  $("#publishedCount").textContent=published;$("#releaseVersion").textContent="v"+state.manifest.version;$("#releaseDays").textContent=published+" days live";updateGlobalProgress();
  renderDays();bindNav();
  const hash=location.hash.match(/day-(\d+)/);const start=hash?Number(hash[1]):published;
  openDay(start<=published?start:published);
 }catch(e){$("#content").innerHTML='<div class="empty"><h3>Workspace unavailable</h3><p>'+esc(e.message)+'</p></div>'}
}
init();
