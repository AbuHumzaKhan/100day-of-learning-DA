export class EngineManager {
  constructor(){this.engines=new Map();this.events=new EventTarget();}
  register(name,engine){this.engines.set(name,engine);this.emit('engine:registered',{name,engine});return this;}
  get(name){return this.engines.get(name);}
  async initAll(context={}){const results=[];for(const [name,engine] of this.engines){try{await engine.init?.(context);results.push({name,status:'ready'});this.emit('engine:ready',{name});}catch(error){results.push({name,status:'degraded',error});this.emit('engine:error',{name,error});}}return results;}
  emit(type,detail){this.events.dispatchEvent(new CustomEvent(type,{detail}));}
  on(type,handler){this.events.addEventListener(type,handler);return()=>this.events.removeEventListener(type,handler);}
}