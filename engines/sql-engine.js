const SQL_JS_VERSION='1.13.0';
const CDN_BASE='https://cdn.jsdelivr.net/npm/sql.js@'+SQL_JS_VERSION+'/dist/';
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error('Could not load SQL engine: '+src));document.head.appendChild(s);});}
function sqlType(c){if(['row_no','quantity'].includes(c))return 'INTEGER';if(['sales','discount','profit'].includes(c))return 'REAL';return 'TEXT';}
function cast(v,c){if(v==='')return null;if(['row_no','quantity'].includes(c))return Number(v);if(['sales','discount','profit'].includes(c))return Number(v);return v;}
function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const parseLine=line=>{const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;};
  const headers=parseLine(lines.shift());return {headers,rows:lines.map(parseLine)};
}
export class SQLEngine {
  constructor(){this.SQL=null;this.db=null;this.ready=false;this.rows=[];this.columns=[];}
  async init(){
    if(this.ready)return;
    if(!window.initSqlJs)await loadScript(CDN_BASE+'sql-wasm.js');
    this.SQL=await window.initSqlJs({locateFile:file=>CDN_BASE+file});
    const response=await fetch('./datasets/orders/data.csv',{cache:'no-store'});if(!response.ok)throw new Error('Orders dataset unavailable');
    const parsed=parseCSV(await response.text());this.columns=parsed.headers;this.rows=parsed.rows;
    this.db=new this.SQL.Database();this.db.run('CREATE TABLE orders ('+this.columns.map(c=>'"'+c+'" '+sqlType(c)).join(',')+')');
    const stmt=this.db.prepare('INSERT INTO orders VALUES ('+this.columns.map(()=>'?').join(',')+')');
    for(const row of this.rows)stmt.run(row.map((v,i)=>cast(v,this.columns[i])));stmt.free();this.ready=true;
  }
  async run(query){
    await this.init();const clean=query.trim().replace(/;+$/,'');if(!clean)throw new Error('Enter a SQL query.');
    if(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REINDEX|VACUUM|REPLACE)\b/i.test(clean))throw new Error('Practice engine is read-only. Use SELECT/CTE queries only.');
    const started=performance.now(),result=this.db.exec(clean),elapsed=Math.round(performance.now()-started);if(!result.length)return{columns:[],values:[],rows:[],elapsed};
    const first=result[0];return{columns:first.columns,values:first.values,rows:first.values.map(r=>Object.fromEntries(first.columns.map((c,i)=>[c,r[i]]))),elapsed};
  }
  schema(){return{table:'orders',columns:this.columns.map(c=>({name:c,type:sqlType(c)})),rows:this.rows.length};}
}