import test from 'node:test';
import assert from 'node:assert/strict';
import network from '../public/data/network.json';
import results from '../public/data/path-results.json';
import type {Network,PathResult} from '../src/types';
import {availableRoutes,matches} from '../src/graph';
import {pathLayers} from '../src/pathPresentation';
import {buildAnimationPlan,routeFrames} from '../src/mapPresentation';
const data=network as Network;
for(const result of results as PathResult[])test(`${result.id}: valid reference-date journey and consecutive playback`,()=>{
 const routes=availableRoutes(data.routes,result.referenceDate).filter(r=>matches(r,[result.network]));
 const layers=pathLayers(result,routes),steps=layers.flat();
 assert.equal(steps.length,result.airportIds.length-1);
 assert.equal(new Set(result.airportIds).size,result.airportIds.length);
 assert.ok(Math.abs(steps.reduce((sum,s)=>sum+s.route.distanceKm,0)-result.totalDistanceKm)<.001);
 assert.ok(result.solver.gap!==null&&result.solver.gap>=0);
 if(result.status==='optimal')assert.ok(result.solver.gap!<1e-8);
 if(result.constraints.fixedStart)assert.equal(result.airportIds[0],result.constraints.fixedStart);
 const plan=buildAnimationPlan(layers);
 for(let i=1;i<plan.edges.length;i++)assert.ok(Math.abs(plan.edges[i].start-plan.edges[i-1].start-plan.edges[i-1].duration)<1e-9);
 assert.equal(routeFrames(plan,plan.duration).filter(f=>f.finished).length,steps.length);
 const first=plan.edges[0];assert.equal(routeFrames(plan,first.duration/2).length,1);
 assert.throws(()=>pathLayers({...result,airportIds:[...result.airportIds].reverse()},routes),/mismatch/);
});

test('three brands have both objectives and each optimum dominates the other on its own metric',()=>{
 assert.equal(results.length,6);
 for(const brand of ['ANA','JAL','ALL']){
  const distance=results.find(r=>r.network===brand&&r.objective==='distance')!;
  const legs=results.find(r=>r.network===brand&&r.objective==='legs')!;
  assert.ok(distance&&legs);
  assert.ok(legs.routeIds.length>=distance.routeIds.length);
  assert.ok(distance.totalDistanceKm>=legs.totalDistanceKm-.001);
  assert.equal(legs.status,'optimal');assert.ok(legs.solver.gap<1e-8);
 }
});
