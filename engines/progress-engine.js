export class ProgressEngine {
  constructor(key='ahk_da_progress_v2'){this.key=key;this.state=this.load();}
  load(){try{return JSON.parse(localStorage.getItem(this.key)||'{}')}catch{return{}}}
  save(){localStorage.setItem(this.key,JSON.stringify(this.state));}
  complete(id,meta={}){this.state[id]={completed:true,at:new Date().toISOString(),...meta};this.save();}
  isComplete(id){return !!this.state[id]?.completed;}
  count(){return Object.values(this.state).filter(x=>x?.completed).length;}
  reset(){this.state={};this.save();}
}