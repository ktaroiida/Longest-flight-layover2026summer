import type {PathResult,Route,Step} from './types';
import {segmentKey} from './graph';
/** Preserve route direction and the ordered, non-repeating journey. */
export function pathLayers(result:PathResult|undefined,routes:Route[]):Step[][] {
 if(!result)return [];
 if(new Set(result.airportIds).size!==result.airportIds.length||result.routeIds.length!==result.airportIds.length-1)throw new Error('Invalid simple path');
 const index=new Map(routes.map(r=>[r.id,r]));
 return result.routeIds.map((id,i)=>{
  const route=index.get(id),fromId=result.airportIds[i],toId=result.airportIds[i+1];
  if(!route||route.fromId!==fromId||route.toId!==toId)throw new Error('Path direction mismatch');
  return [{fromId,toId,key:segmentKey(fromId,toId),depth:i+1,route}];
 });
}
