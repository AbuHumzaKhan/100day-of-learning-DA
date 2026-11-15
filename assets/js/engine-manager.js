export class EngineManager {
  constructor(options={}) { this.onStatus=options.onStatus||(()=>{}); this.engines=new Map(); }
  register(name,engine){this.engines.set(name,engine);return this;}
  run(name,payload){const e=this.engines.get(name);if(!e)throw new Error('Engine not registered: '+name);this.onStatus({state:'running'});try{const r=e.run(payload);this.onStatus({state:'ready'});return r}catch(err){this.onStatus({state:'error'});throw err;}}
}
