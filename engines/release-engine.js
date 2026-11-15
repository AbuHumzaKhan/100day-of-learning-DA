export class ReleaseEngine {
  constructor(manifest,index){this.manifest=manifest;this.index=index;}
  isPublished(day){return Number(day)<=Number(this.manifest?.release_control?.published_through_day||0)&&!!this.index?.days?.some(x=>x.day===Number(day));}
  getPublishedDays(){return (this.index?.days||[]).filter(x=>this.isPublished(x.day)).sort((a,b)=>a.day-b.day);}
  nextPublishedDay(){return this.manifest?.release_control?.next_day||null;}
}