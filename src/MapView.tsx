import {useEffect,useMemo,useRef,useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import type {FeatureCollection,Polygon,MultiPolygon} from 'geojson';
import {greatCircle,partialLine} from './graph';
import type {Airport,Step} from './types';
import landText from '../public/data/land.geojson?raw';
import workerCode from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'})));
import {polygonPath,linePath} from './mapGeometry';
import {routeFrames,airportDotSize,placeLabels,type AnimationPlan} from './mapPresentation';
const land=JSON.parse(landText) as FeatureCollection<Polygon|MultiPolygon>;
interface Props {keepRoutes?:boolean;airports:Airport[];layers:Step[][];progress:number;start:string|null;onSelect:(id:string)=>void;focusToken:number;resetToken:number;onMoving:(moving:boolean)=>void;visibleAirportIds:Set<string>;degrees:Map<string,number>;animationPlan:AnimationPlan}
export default function MapView({airports,layers,progress,start,onSelect,focusToken,resetToken,onMoving,visibleAirportIds,degrees,animationPlan,keepRoutes=false}:Props){
 const container=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),markers=useRef(new Map<string,HTMLButtonElement>());
 const [view,setView]=useState(0),[ready,setReady]=useState(false),[error,setError]=useState('');
 const select=useRef(onSelect),moving=useRef(onMoving);select.current=onSelect;moving.current=onMoving;
 const index=useMemo(()=>new Map(airports.map(a=>[a.id,a])),[airports]);
 const geometry=useMemo(()=>new Map(layers.flat().map(s=>[s.key,greatCircle(index.get(s.fromId)!,index.get(s.toId)!)])),[layers,index]);
 useEffect(()=>{
  if(!container.current)return;
  let m:maplibregl.Map;
  try{m=new maplibregl.Map({container:container.current,style:{version:8,sources:{},layers:[{id:'sea',type:'background',paint:{'background-color':'#0b1a26'}}]},center:[135,36],zoom:4,attributionControl:false,renderWorldCopies:false});}
  catch{setError('地図の描画にはWebGL2対応のブラウザーが必要です。');return;}
  map.current=m;
  const refresh=()=>setView(v=>v+1);
  m.on('move',refresh);m.on('resize',refresh);
  m.on('movestart',()=>moving.current(true));m.on('moveend',()=>moving.current(false));
  m.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  m.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'地図: Natural Earth · 空港: OurAirports'}),'bottom-right');
  // The camera is ready immediately: do not wait for worker-backed style load.
  m.fitBounds([[122,23.4],[146,46.3]],{padding:35,duration:0});setReady(true);refresh();
  m.on('load',refresh);
  for(const a of airports){
   const el=document.createElement('button');el.type='button';el.className='airport-marker';el.setAttribute('aria-label',`${a.nameJa} を出発空港に選択`);el.title=`${a.nameJa} / ${a.iata??a.id}`;
   const dot=document.createElement('span');dot.className='airport-dot';el.append(dot);
   const label=document.createElement('span');label.className='airport-label';label.textContent=a.nameJa;el.append(label);
   el.addEventListener('click',e=>{e.stopPropagation();select.current(a.id);});markers.current.set(a.id,el);
   new maplibregl.Marker({element:el,anchor:'center',subpixelPositioning:true}).setLngLat([a.lon,a.lat]).addTo(m);
  }
  const resize=new ResizeObserver(()=>m.resize());resize.observe(container.current);
  return()=>{resize.disconnect();m.remove();map.current=null;markers.current.clear();moving.current(false);setReady(false);};
 },[airports]);
 const project=useMemo(()=>{
  if(!ready||!map.current)return null;
  const m=map.current;
  return (p:number[]):[number,number]=>{const projected=m.project([p[0],Math.max(-85,Math.min(85,p[1]))]);return [projected.x,projected.y];};
 },[ready,view]);
 // SVG uses exactly the same camera projection as the markers, but does not
 // require GeoJSON Web Workers. This also works in the single-file download.
 const landPaths=useMemo(()=>project?land.features.map(f=>polygonPath(f.geometry,project)):[],[project]);
 const frames=useMemo(()=>routeFrames(animationPlan,progress),[animationPlan,progress]);
 const routePaths=useMemo(()=>{
  if(!project)return [];
  return frames.map(f=>({...f,key:f.step.key,path:linePath(partialLine(geometry.get(f.step.key)!,f.fraction),project)}));
 },[project,geometry,frames]);
 useEffect(()=>{
  const reached=new Set<string>(start?[start]:[]),active=new Set<string>();
  for(const f of frames){if(f.finished)reached.add(f.step.toId);else active.add(f.step.fromId);}
  for(const [id,el] of markers.current){el.style.display=visibleAirportIds.has(id)||id===start?'':'none';el.classList.toggle('selected',id===start);el.classList.toggle('reached',reached.has(id));el.classList.toggle('active',active.has(id));}
 },[ready,frames,start,visibleAirportIds]);
 useEffect(()=>{
  if(!ready||!map.current||!container.current)return;
  const m=map.current,maxDegree=Math.max(1,...degrees.values());
  const candidates=airports.filter(a=>visibleAirportIds.has(a.id)||a.id===start).map(a=>{const p=m.project([a.lon,a.lat]);const degree=degrees.get(a.id)||0;return {id:a.id,x:p.x,y:p.y,width:a.nameJa.length*(degree>=15?11:10),degree,selected:a.id===start};});
  const placements=placeLabels(candidates,m.getZoom(),container.current.clientWidth,container.current.clientHeight);
  for(const placement of placements){const el=markers.current.get(placement.id);if(!el)continue;
   const degree=degrees.get(placement.id)||0;el.style.setProperty('--airport-size',`${airportDotSize(degree,maxDegree)}px`);el.classList.toggle('hub',degree>=15);el.classList.toggle('label-visible',placement.visible);
   const label=el.querySelector<HTMLElement>('.airport-label');if(label){label.style.left=`${10+placement.dx}px`;label.style.top=`${10+placement.dy}px`; }
  }
 },[ready,view,degrees,airports,visibleAirportIds,start]);
 useEffect(()=>{const a=start&&index.get(start);if(a&&focusToken&&ready)map.current?.flyTo({center:[a.lon,a.lat],zoom:6,duration:700});},[focusToken,start,index,ready]);
 useEffect(()=>{if(resetToken&&ready)map.current?.fitBounds([[122,23.4],[146,46.3]],{padding:35,duration:650});},[resetToken,ready]);
 return <div className="map-canvas" ref={container} aria-label="日本の空港と航空路線を表示する地図">
  <svg className="geography-overlay" aria-label="日本地図と大圏航路" data-route-count={routePaths.length}>
   <g className="land-shapes">{landPaths.map((path,i)=><path key={i} d={path} fillRule="evenodd"/>)}</g>
   <g className="route-glows">{routePaths.map(r=><path key={r.key} d={r.path} style={{strokeOpacity:r.glow}}/>)}</g>
   <g className="route-lines">{routePaths.map(r=><path key={r.key} d={r.path} style={{strokeOpacity:keepRoutes?Math.max(.65,r.opacity):r.opacity,strokeWidth:r.width}}/>)}</g>
  </svg>
  {error&&<div className="map-error" role="alert">{error}</div>}
 </div>;
}
