import type {Airport, Route, Step} from './types';
export const segmentKey=(a:string,b:string)=>[a,b].sort().join('~');
export function matches(route:Route,carriers:string[]) {return carriers.some(c=>c==='ALL'?true:c==='ANA'?route.anaNetwork:c==='JAL'?route.jalNetwork:route.operators.includes(c));}
export function bfs(start:string|null,routes:Route[],carriers:string[]):Step[][] {
 if(!start)return [];
 const adjacency=new Map<string,Route[]>();
 for(const r of routes.filter(r=>matches(r,carriers)))adjacency.set(r.fromId,[...(adjacency.get(r.fromId)||[]),r]);
 const seen=new Set([start]),drawn=new Set<string>();let frontier=[start],depth=1;const layers:Step[][]=[];
 while(frontier.length){const next:string[]=[],layer:Step[]=[];
  for(const id of frontier)for(const r of adjacency.get(id)||[]){const key=segmentKey(r.fromId,r.toId);
   if(!drawn.has(key)){drawn.add(key);layer.push({fromId:id,toId:r.toId,key,depth,route:r});}
   if(!seen.has(r.toId)){seen.add(r.toId);next.push(r.toId);}
  }
  if(layer.length)layers.push(layer);frontier=next;depth++;
 }
 return layers;
}
const rad=Math.PI/180;
export function greatCircle(a:Pick<Airport,'lat'|'lon'>,b:Pick<Airport,'lat'|'lon'>,count=64):[number,number][] {
 const vec=(p:typeof a)=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.cos(p.lat*rad)*Math.sin(p.lon*rad),Math.sin(p.lat*rad)];
 const u=vec(a),v=vec(b),angle=Math.acos(Math.max(-1,Math.min(1,u.reduce((s,n,i)=>s+n*v[i],0))));
 if(angle<1e-8)return [[a.lon,a.lat],[b.lon,b.lat]];
 // A stable orthogonal basis also handles antipodal endpoints.
 let orth=v.map((n,i)=>n-Math.cos(angle)*u[i]);let len=Math.hypot(...orth);
 if(len<1e-8){const axis=Math.abs(u[0])<.8?[1,0,0]:[0,1,0];const dot=axis.reduce((s,n,i)=>s+n*u[i],0);orth=axis.map((n,i)=>n-dot*u[i]);len=Math.hypot(...orth);}
 orth=orth.map(n=>n/len);
 const result:Array<[number,number]>=[];
 for(let i=0;i<=count;i++){const t=i/count;const p=u.map((n,j)=>Math.cos(angle*t)*n+Math.sin(angle*t)*orth[j]);result.push([Math.atan2(p[1],p[0])/rad,Math.atan2(p[2],Math.hypot(p[0],p[1]))/rad]);}
 result[0]=[a.lon,a.lat];result[result.length-1]=[b.lon,b.lat];return result;
}
export function partialLine(line:[number,number][],fraction:number):[number,number][] {
 const p=Math.max(0,Math.min(1,fraction))*(line.length-1),i=Math.floor(p),f=p-i;
 if(i===line.length-1)return line;
 return [...line.slice(0,i+1),[line[i][0]+(line[i+1][0]-line[i][0])*f,line[i][1]+(line[i+1][1]-line[i][1])*f]];
}

export function availableRoutes(routes:Route[],referenceDate:string,includeSeasonal=false):Route[] {
 return routes.filter(r=>r.status!=='suspended'&&r.status!=='unconfirmed'&&((r.validFrom<=referenceDate&&referenceDate<=r.validTo)||(includeSeasonal&&r.status==='seasonal')));
}
export function selectedAirportIds(routes:Route[],carriers:string[]):Set<string> {
 return new Set(routes.filter(r=>matches(r,carriers)).flatMap(r=>[r.fromId,r.toId]));
}
