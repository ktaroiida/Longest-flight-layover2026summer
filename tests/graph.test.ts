import test from 'node:test';
import assert from 'node:assert/strict';
import {bfs,greatCircle,matches,partialLine} from '../src/graph';
import type {Route,Network} from '../src/types';
import {readFileSync} from 'node:fs';
const r=(fromId:string,toId:string,flags:Partial<Route>={}):Route=>({id:fromId+toId,fromId,toId,operators:['partner'],marketingCarriers:['ANA'],groups:[],anaNetwork:true,jalNetwork:false,validFrom:'2026-10-01',validTo:'2026-10-24',distanceKm:1,verification:'test',sources:[],...flags});
test('BFS respects direction, expands layers and deduplicates physical codeshares',()=>{
 const layers=bfs('a',[r('a','b'),r('a','b'),r('b','a'),r('b','c'),r('c','a'),r('d','c')],['ANA']);
 assert.deepEqual(layers.map(l=>l.map(s=>`${s.fromId}>${s.toId}`)),[['a>b'],['b>c'],['c>a']]);
 assert.equal(bfs('d',[r('c','d')],['ANA']).length,0);
});
test('partner operator alone does not grant ANA brand membership',()=>{
 const route=r('a','b',{anaNetwork:false,marketingCarriers:[]});assert.equal(matches(route,['ANA']),false);assert.equal(matches(route,['partner']),true);
 assert.equal(bfs('a',[route],[]).length,0);assert.equal(matches(r('a','b',{jalNetwork:true}),['ANA','JAL']),true);
});
test('great circle uses sphere and remains finite for coincident and antipodal points',()=>{
 const line=greatCircle({lon:0,lat:60},{lon:90,lat:60});assert.deepEqual(line[0],[0,60]);assert.deepEqual(line.at(-1),[90,60]);assert.ok(line[32][1]>67);
 for(const end of [{lon:0,lat:0},{lon:180,lat:0}])assert.ok(greatCircle({lon:0,lat:0},end).flat().every(Number.isFinite));
 assert.deepEqual(partialLine([[0,0],[10,10]],.5),[[0,0],[5,5]]);
});
test('bundled network has valid references, flags, intervals and TTJ ANA first layer HND',()=>{
 const data=JSON.parse(readFileSync('public/data/network.json','utf8')) as Network;const ids=new Set(data.airports.map(a=>a.id));assert.equal(ids.size,data.airports.length);
 assert.equal(new Set(data.routes.map(r=>r.id)).size,data.routes.length);
 for(const route of data.routes){assert.ok(ids.has(route.fromId)&&ids.has(route.toId));assert.ok(route.validFrom<=route.validTo);assert.ok(route.distanceKm>0);assert.ok(route.sources.length);if(route.anaNetwork)assert.ok(route.marketingCarriers.includes('ANA'));}
 const layers=bfs('jp-TTJ',data.routes,['ANA']);assert.deepEqual(layers[0].map(s=>s.toId),['jp-HND']);assert.ok(layers.length>=3);assert.equal(new Set(layers.flat().map(s=>s.key)).size,layers.flat().length);
});

test('SVG rendering retains Japan polygons and emits partial route paths without workers',async()=>{
 const {polygonPath,linePath}=await import('../src/mapGeometry');
 const land=JSON.parse(readFileSync('public/data/land.geojson','utf8'));
 const japan=land.features.find((f:{properties:{name:string}})=>f.properties.name==='Japan');
 assert.ok(japan);
 const project=(p:number[]):[number,number]=>[p[0]*10,p[1]*-10];
 const shape=polygonPath(japan.geometry,project);
 assert.ok(shape.startsWith('M'));assert.ok(shape.includes(' Z'));assert.ok(!shape.includes('NaN'));
 const curve=greatCircle({lon:134.167,lat:35.53},{lon:139.779,lat:35.552});
 const growing=linePath(partialLine(curve,.5),project),finished=linePath(curve,project);
 assert.ok(growing.length<finished.length);assert.ok(growing.includes('L'));assert.notEqual(growing,finished);
});

test('nationwide brand filters include remote airports, union selections and exclude confirmed inactive periods',async()=>{
 const {availableRoutes,selectedAirportIds}=await import('../src/graph');
 const data=JSON.parse(readFileSync('public/data/network.json','utf8')) as Network;
 const active=availableRoutes(data.routes,data.referenceDate);
 const ana=selectedAirportIds(active,['ANA']),jal=selectedAirportIds(active,['JAL']);
 for(const code of ['FUJ','IKI','AXJ','TSJ']){assert.ok(ana.has('jp-'+code),`ANA ${code}`);assert.ok(jal.has('jp-'+code),`JAL ${code}`);}
 assert.ok(ana.has('jp-TTJ'));assert.equal(jal.has('jp-TTJ'),false);
 const both=selectedAirportIds(active,['ANA','JAL']);assert.equal(both.size,new Set([...ana,...jal]).size);
 assert.equal(ana.size,55);assert.equal(jal.size,64);assert.equal(data.airports.length,88);
 const pair=(a:string,b:string)=>active.some(r=>r.fromId==='jp-'+a&&r.toId==='jp-'+b);
 assert.equal(pair('UKB','AOJ'),false);assert.equal(pair('RNJ','ASJ'),false);
 assert.ok(availableRoutes(data.routes,data.referenceDate,true).some(r=>r.fromId==='jp-UKB'&&r.toId==='jp-AOJ'));
 assert.equal(availableRoutes(data.routes,data.referenceDate,true).some(r=>r.fromId==='jp-RNJ'&&r.toId==='jp-ASJ'),false);
 const reached=new Set(['jp-TTJ',...bfs('jp-TTJ',active,['ANA']).flat().map(s=>s.toId)]);
 assert.ok(reached.has('jp-FUJ'));assert.ok(reached.has('jp-AXJ'));
});

test('distance-dependent arrival starts the next branch before the longer first route arrives',async()=>{
 const {buildAnimationPlan,routeFrames}=await import('../src/mapPresentation');
 const layers=bfs('a',[r('a','b',{distanceKm:180}),r('a','c',{distanceKm:900}),r('b','d',{distanceKm:450}),r('c','e',{distanceKm:180})],['ANA']);
 const plan=buildAnimationPlan(layers);
 const ab=plan.edges.find(e=>e.step.fromId==='a'&&e.step.toId==='b')!,ac=plan.edges.find(e=>e.step.toId==='c')!,bd=plan.edges.find(e=>e.step.toId==='d')!;
 assert.equal(ab.start,ac.start);assert.ok(ab.duration<ac.duration);assert.equal(bd.start,ab.start+ab.duration);
 const midway=routeFrames(plan,.3);assert.equal(midway.find(f=>f.step.toId==='b')!.finished,true);assert.equal(midway.find(f=>f.step.toId==='c')!.finished,false);assert.ok(midway.find(f=>f.step.toId==='d')!.fraction>0);
 const previous=routeFrames(plan,.25).find(f=>f.step.toId==='b')!,faded=routeFrames(plan,.7).find(f=>f.step.toId==='b')!;assert.ok(faded.opacity<previous.opacity);
 const complete=routeFrames(plan,plan.duration);assert.equal(complete.filter(f=>f.finished).length,layers.flat().length);
});
test('arrival flight count excludes closing routes and differs by departure airport',async()=>{
 const {maxArrivalFlights}=await import('../src/mapPresentation');
 const data=JSON.parse(readFileSync('public/data/network.json','utf8')) as Network;const active=availableRoutesForTest(data);
 const hnd=bfs('jp-HND',active,['ANA']),rnj=bfs('jp-RNJ',active,['ANA']);
 assert.equal(hnd.length,3);assert.equal(maxArrivalFlights('jp-HND',hnd),2);assert.equal(maxArrivalFlights('jp-RNJ',rnj),4);
 function availableRoutesForTest(d:Network){return d.routes.filter(r=>r.status!=='suspended'&&r.status!=='unconfirmed'&&r.validFrom<=d.referenceDate&&d.referenceDate<=r.validTo);}
});
test('hub sizing uses unique neighbours; low-degree labels wait for zoom and avoid collisions',async()=>{
 const {airportDegrees,airportDotSize,labelZoom,placeLabels}=await import('../src/mapPresentation');
 const degree=airportDegrees([r('a','b'),r('b','a'),r('a','b'),r('a','c')]);assert.equal(degree.get('a'),2);assert.equal(degree.get('b'),1);
 assert.ok(airportDotSize(20,20)>airportDotSize(1,20));assert.ok(labelZoom(1)>labelZoom(20));
 const candidates=[{id:'hub',x:150,y:150,width:80,degree:20,selected:false},{id:'local',x:300,y:150,width:60,degree:1,selected:false}];
 assert.equal(placeLabels(candidates,4,600,400).find(p=>p.id==='local')!.visible,false);
 assert.equal(placeLabels(candidates,7,600,400).find(p=>p.id==='local')!.visible,true);
 const close=placeLabels([{...candidates[0],x:180},{...candidates[0],id:'next',x:181}],7,600,400);assert.ok(close[0].visible&&close[1].visible);assert.notEqual(close[0].dx,close[1].dx);
});
