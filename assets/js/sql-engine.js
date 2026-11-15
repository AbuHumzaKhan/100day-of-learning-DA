export class SQLAcademyEngine {
  constructor(rows){this.rows=rows||[]}
  run({sql}){
    const q=sql.trim().replace(/;$/,'');
    if(!/^select\s/i.test(q))throw new Error('Read-only engine: start with SELECT.');
    if(/\b(insert|update|delete|drop|alter|create|truncate|replace)\b/i.test(q))throw new Error('Write operations are disabled.');
    const m=q.match(/^select\s+(.+?)\s+from\s+([a-z_][\w]*)(?:\s+where\s+(.+?))?(?:\s+group\s+by\s+(.+?))?(?:\s+order\s+by\s+(.+?))?$/i);
    if(!m)throw new Error('Supported: SELECT ... FROM orders [WHERE] [GROUP BY] [ORDER BY].');
    if(m[2].toLowerCase()!=='orders')throw new Error('Available table: orders.');
    let data=this.rows.map(r=>({...r})); if(m[3])data=data.filter(r=>this.where(m[3],r));
    const agg=/\b(sum|avg|count|min|max)\s*\(/i.test(m[1]); if(m[4]||agg)data=this.aggregate(data,m[1],m[4]);else data=data.map(r=>this.project(r,m[1]));
    if(m[5])this.sort(data,m[5]); return {columns:data.length?Object.keys(data[0]):this.columns(m[1]),rows:data.slice(0,500)};
  }
  columns(s){return s.split(',').map(x=>x.trim().replace(/\s+as\s+.+$/i,'').replace(/^.*\./,''))}
  project(r,s){const o={};s.split(',').forEach(token=>{const x=token.trim(),a=x.match(/^([\w.]+)\s+as\s+([\w]+)$/i),k=a?a[1].split('.').pop():x.split('.').pop();o[a?a[2]:k]=r[k]});return o}
  where(expr,r){const p=expr.split(/\s+(AND|OR)\s+/i);let ok=this.cond(p[0],r);for(let i=1;i<p.length;i+=2)ok=p[i].toUpperCase()==='AND'?ok&&this.cond(p[i+1],r):ok||this.cond(p[i+1],r);return ok}
  cond(c,r){const m=c.trim().match(/^([\w.]+)\s*(=|!=|<>|>=|<=|>|<|LIKE|IN)\s*(.+)$/i);if(!m)throw new Error('Unsupported WHERE condition: '+c);const f=m[1].split('.').pop(),op=m[2].toUpperCase(),v=m[3].trim(),a=r[f],unq=x=>x.replace(/^["']|["']$/g,'');if(op==='LIKE'){const pat=unq(v).replace(/%/g,'.*').replace(/_/g,'.');return new RegExp('^'+pat+'$','i').test(String(a))}if(op==='IN')return v.replace(/^\(|\)$/g,'').split(',').map(x=>unq(x.trim())).includes(String(a));const b=isNaN(Number(unq(v)))?unq(v):Number(unq(v));if(op==='=')return String(a)==String(b);if(op==='!='||op==='<>')return String(a)!=String(b);if(op==='>')return Number(a)>Number(b);if(op==='<')return Number(a)<Number(b);if(op==='>=')return Number(a)>=Number(b);return Number(a)<=Number(b)}
  aggregate(data,s,group){const gs=group?group.split(',').map(x=>x.trim().split('.').pop()):[null],map=new Map();data.forEach(r=>{const k=gs.map(g=>g?String(r[g]):'__all__').join('|');if(!map.has(k))map.set(k,[]);map.get(k).push(r)});const out=[];map.forEach(rows=>{const o={};if(gs[0])gs.forEach(g=>o[g]=rows[0][g]);s.split(',').forEach(t=>{const f=t.trim().match(/(sum|avg|count|min|max)\s*\(\s*([\w.]+|\*)\s*\)/i),a=t.match(/\s+as\s+([\w]+)/i);if(!f)return;const name=a?a[1]:f[0],field=f[2].split('.').pop(),vals=field==='*'?rows.map(()=>1):rows.map(x=>Number(x[field])||0);let v=f[1].toLowerCase()==='sum'?vals.reduce((x,y)=>x+y,0):f[1].toLowerCase()==='avg'?vals.reduce((x,y)=>x+y,0)/vals.length:f[1].toLowerCase()==='count'?rows.length:f[1].toLowerCase()==='min'?Math.min(...vals):Math.max(...vals);o[name]=Number.isInteger(v)?v:Number(v.toFixed(2))});out.push(o)});return out}
  sort(data,expr){const m=expr.split(',')[0].trim().match(/^([\w.]+)(?:\s+(ASC|DESC))?$/i);if(!m)return;const f=m[1].split('.').pop(),d=(m[2]||'ASC').toUpperCase();data.sort((a,b)=>{const n=Number(a[f])-Number(b[f]),c=Number.isNaN(n)?String(a[f]).localeCompare(String(b[f]).]\OOIÑTÐÉÏËXÎßJ_BB