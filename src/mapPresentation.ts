import type {Airport,Route,Step} from './types';
export interface RouteFrame {step:Step;fraction:number;opacity:number;glow:number;width:number;finished:boolean}
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
export interface TimedStep {step:Step;start:number;duration:number}
export interface AnimationPlan {edges:TimedStep[];duration:number}
/** First arrivals trigger outgoing routes, independently of other branches. */
export function buildAnimationPlan(layers:Step[][]):AnimationPlan {
 const steps=layers.flat(),origin=steps[0]?.fromId;
 if(!origin)return {edges:[],duration:0};
 const duration=(step:Step)=>Math.max(.22,step.route.distanceKm/900);
 const adjacency=new Map<string,Step[]>();
 for(const step of steps)adjacency.set(step.fromId,[...(adjacency.get(step.fromId)||[]),step]);
 const arrivals=new Map<string,number>([[origin,0]]),settled=new Set<string>();
 while(true){
  let node:string|undefined,earliest=Infinity;
  for(const [id,time] of arrivals)if(!settled.has(id)&&time<earliest){node=id;earliest=time;}
  if(node===undefined)break;
  settled.add(node);
  for(const step of adjacency.get(node)||[]){const time=earliest+duration(step);if(time<(arrivals.get(step.toId)??Infinity))arrivals.set(step.toId,time);}
 }
 const edges=steps.map(step=>({step,start:arrivals.get(step.fromId)!,duration:duration(step)}));
 return {edges,duration:Math.max(0,...edges.map(e=>e.start+e.duration))};
}
export function routeFrames(plan:AnimationPlan,progress:number):RouteFrame[]{
 return plan.edges.flatMap(({step,start,duration})=>{
  const elapsed=progress-start;
  if(elapsed<=0)return [];
  const fraction=elapsed>=duration-1e-9?1:clamp(elapsed/duration),age=Math.max(0,elapsed-duration);
  return [{step,fraction,finished:fraction>=1,opacity:.1+.8*Math.exp(-age*3),glow:.17*Math.exp(-age*5),width:fraction<1?1.9:1+Math.exp(-age*3)*.7}];
 });
}
/** Maximum of the shortest flight counts, excluding already-reached closing edges. */
export function maxArrivalFlights(start:string|null,layers:Step[][]):number{
 const seen=new Set(start?[start]:[]);let max=0;
 for(const step of layers.flat())if(!seen.has(step.toId)){seen.add(step.toId);max=Math.max(max,step.depth);}
 return max;
}
/** Unique neighbours, so reverse directions and brand duplicates do not inflate hubs. */
export function airportDegrees(routes:Route[]):Map<string,number>{
 const neighbours=new Map<string,Set<string>>();
 for(const r of routes){for(const [a,b] of [[r.fromId,r.toId],[r.toId,r.fromId]]){if(!neighbours.has(a))neighbours.set(a,new Set());neighbours.get(a)!.add(b);}}
 return new Map([...neighbours].map(([id,set])=>[id,set.size]));
}
export function airportDotSize(degree:number,maxDegree:number):number{return 3.5+8*Math.sqrt(degree/Math.max(1,maxDegree));}
export function labelZoom(degree:number):number{return degree>=15?0:degree>=6?4.6:degree>=3?5.5:6.3;}
export interface LabelCandidate {id:string;x:number;y:number;width:number;degree:number;selected:boolean}
export interface LabelPlacement {id:string;visible:boolean;dx:number;dy:number}
/** Prioritise hubs and place labels to either side before omitting crowded names. */
export function placeLabels(candidates:LabelCandidate[],zoom:number,width:number,height:number):LabelPlacement[]{
 const reserved:Array<{x:number;y:number;w:number;h:number}>=[];
 return [...candidates].sort((a,b)=>Number(b.selected)-Number(a.selected)||b.degree-a.degree||a.id.localeCompare(b.id)).map(c=>{
  const hidden={id:c.id,visible:false,dx:15,dy:-7};
  if(!c.selected&&zoom<labelZoom(c.degree))return hidden;
  for(const [dx,dy] of [[15,-7],[-c.width-15,-7],[15,-23],[15,9]]){
   const box={x:c.x+dx,y:c.y+dy,w:c.width,h:14};
   if(box.x<5||box.y<5||box.x+box.w>width-5||box.y+box.h>height-5)continue;
   const overlaps=reserved.some(r=>box.x<r.x+r.w+5&&box.x+box.w+5>r.x&&box.y<r.y+r.h+4&&box.y+box.h+4>r.y);
   if(!overlaps||c.selected){reserved.push(box);return {id:c.id,visible:true,dx,dy};}
  }
  return hidden;
 });
}

/** Administrative order first; larger networks first within each prefecture. */
export function sortAirports(airports:Airport[],degrees:Map<string,number>):Airport[]{
 return [...airports].sort((a,b)=>Number(a.prefectureCode)-Number(b.prefectureCode)||(degrees.get(b.id)||0)-(degrees.get(a.id)||0)||a.nameJa.localeCompare(b.nameJa,'ja')||a.id.localeCompare(b.id));
}
