"""Distance-maximizing simple directed paths; MILP with subtour cuts.
Uses the bundled reference-date network, not live timetables.
"""
import json, time, math
from pathlib import Path
import numpy as np
import scipy
from scipy.optimize import milp, Bounds, LinearConstraint
from scipy.sparse import lil_matrix
ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT/'public/data/network.json').read_text())

def solve(brand, fixed=None, seconds=180, objective="distance"):
    routes = [r for r in data['routes'] if (brand=='ALL' or r[brand.lower()+'Network']) and r['status'] not in ('suspended','unconfirmed') and r['validFrom'] <= data['referenceDate'] <= r['validTo']]
    nodes = sorted({r[k] for r in routes for k in ('fromId','toId')}); ids = {a:i for i,a in enumerate(nodes)}
    n=len(nodes); m=len(routes); nv=m+2*n
    arcs=[(ids[r['fromId']],ids[r['toId']]) for r in routes]
    weights=[1. if objective=='legs' else r['distanceKm'] for r in routes]
    c=np.array([-w for w in weights]+[0.]*(2*n))
    ins=[[] for _ in nodes]; outs=[[] for _ in nodes]
    for k,(a,b) in enumerate(arcs): outs[a].append(k); ins[b].append(k)
    cons=[({m+i:1 for i in range(n)},1,1),({m+n+i:1 for i in range(n)},1,1)]
    if fixed: cons.append(({m+ids[fixed]:1},1,1))
    for i in range(n):
        # Exactly one source and sink, all other used nodes balanced.
        cons.extend([({**{k:1 for k in ins[i]},m+i:1,**{k:-1 for k in outs[i]},m+n+i:-1},0,0),({**{k:1 for k in ins[i]},m+i:1},0,1),({**{k:1 for k in outs[i]},m+n+i:1},0,1)])
    begin=time.monotonic(); best=None; upper=math.inf; cuts=set()
    while time.monotonic()-begin<seconds:
        A=lil_matrix((len(cons),nv)); low=[]; high=[]
        for j,(co,l,h) in enumerate(cons):
            for k,v in co.items(): A[j,k]=v
            low.append(l);high.append(h)
        res=milp(c,integrality=np.ones(nv),bounds=Bounds(np.zeros(nv),np.ones(nv)),constraints=LinearConstraint(A.tocsr(),low,high),options={'time_limit':min(20,seconds-(time.monotonic()-begin)),'mip_rel_gap':0})
        if res.x is None: break
        upper=min(upper,-res.mip_dual_bound)
        successor={a:(b,k) for k,(a,b) in enumerate(arcs) if res.x[k]>.5}
        start=next(i for i in range(n) if res.x[m+i]>.5); path=[start]; used=[]
        while path[-1] in successor:
            b,k=successor[path[-1]]; assert b not in path; path.append(b);used.append(k)
        km=sum(weights[k] for k in used)
        if best is None or km>best[0]: best=(km,path,used)
        left=set(successor)-set(path); groups=[]
        while left:
            a=next(iter(left)); group={a}; b=successor[a][0]
            while b!=a: group.add(b); b=successor[b][0]
            left-=group; groups.append(frozenset(group))
        print(brand,fixed,'km',round(best[0],1),'upper',round(upper,1),'cycles',len(groups),flush=True)
        if not groups and abs(upper-best[0])<1e-5:break
        for group in groups:
            assert group not in cuts; cuts.add(group)
            cons.append(({k:1 for k,(a,b) in enumerate(arcs) if a in group and b in group},0,len(group)-1))
    assert best and best[2]
    km,path,used=best; gap=max(0,(upper-km)/km)
    return dict(id=brand.lower()+'-'+objective+('-ttj' if fixed else ''),network=brand,objective=objective,airportIds=[nodes[i] for i in path],routeIds=[routes[k]['id'] for k in used],totalDistanceKm=sum(routes[k]['distanceKm'] for k in used),status='optimal' if gap<1e-8 else 'best-found',scope='bundled-reference-date-directed-network',referenceDate=data['referenceDate'],solver=dict(name='SciPy/HiGHS MILP + subtour elimination',version=scipy.__version__,gap=gap),constraints=dict(repeatAirport=False,fixedStart=fixed,fixedEnd=None,timetable=False))
if __name__=='__main__':
    results=[]
    for brand,objective in [(b,o) for o in ['distance','legs'] for b in ['ANA','JAL','ALL']]:
        results.append(solve(brand,objective=objective))
        (ROOT/'public/data/path-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
