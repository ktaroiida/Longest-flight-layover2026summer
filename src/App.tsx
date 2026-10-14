import {useEffect,useMemo,useRef,useState} from 'react';
import MapView from './MapView';
import brandIcon from './assets/air-routes-icon.svg?inline';
import {airportDegrees,routeFrames,sortAirports,buildAnimationPlan,maxArrivalFlights} from './mapPresentation';
import {bfs,matches,segmentKey,availableRoutes,selectedAirportIds} from './graph';
import pathData from '../public/data/path-results.json';
import {pathLayers} from './pathPresentation';
import type {Network,PathResult} from './types';
import networkData from '../public/data/network.json';
const operatorNames:Record<string,string>={'SKY':'スカイマーク','AMX':'天草エアライン','JAC':'日本エアコミューター','Jetstar Japan':'ジェットスター','Peach':'Peach','東邦航空':'東京愛らんどシャトル'};
const carriers:Array<{id:string;name:string;sub?:string;color?:string}>=[{id:'ANA',name:'ANA',sub:'グループ・ANA便名を含む',color:'#73b5f4'},{id:'JAL',name:'JAL',sub:'グループ・JAL便名を含む',color:'#f28b88'},...Array.from(new Set(networkData.routes.flatMap(r=>r.operators))).filter(id=>!['ANA','ANA Wings'].includes(id)).sort().map(id=>({id,name:operatorNames[id]||id}))];
export default function App(){
 const data=networkData as Network;
 const [start,setStart]=useState<string|null>('jp-HND'),[selected,setSelected]=useState(['ANA']),[query,setQuery]=useState(''),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[focusToken,setFocus]=useState(0),[resetToken,setReset]=useState(0),[open,setOpen]=useState(false),[sources,setSources]=useState(false),[mapMoving,setMapMoving]=useState(false),[otherOpen,setOtherOpen]=useState(false),[includeSeasonal,setIncludeSeasonal]=useState(false);
 const [mode,setMode]=useState<'network'|'path'|'legs'>('network'),[pathBrand,setPathBrand]=useState<'ANA'|'JAL'|'ALL'>('ANA'),[itineraryOpen,setItineraryOpen]=useState(false);
 const journey=mode!=='network';
 const modeName=mode==='legs'?'最多乗継':'最長片道';
 const [pathSpeed,setPathSpeed]=useState(4);
 const currentSpeed=journey?pathSpeed:speed;
 const pathName=pathBrand==='ALL'?'すべての航空会社':pathBrand;
 const pathResult=(pathData as PathResult[]).find(p=>p.id===pathBrand.toLowerCase()+(mode==='legs'?'-legs':'-distance'));
 const displayStart=journey?(pathResult?.airportIds[0]??null):start;
 const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:960px)').matches);
 const menuButton=useRef<HTMLButtonElement>(null),panelRef=useRef<HTMLElement>(null);
 const speedRef=useRef(currentSpeed);speedRef.current=currentSpeed;

 useEffect(()=>{const media=window.matchMedia('(max-width:960px)');const resize=()=>{setCompact(media.matches);setOpen(false);};media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[]);
 useEffect(()=>{if(!open||!compact)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const frame=requestAnimationFrame(()=>panelRef.current?.querySelector<HTMLElement>('.mode-tabs button')?.focus());return()=>{cancelAnimationFrame(frame);document.body.style.overflow=previous;if(menuButton.current?.offsetParent)menuButton.current.focus();};},[open,compact]);
 useEffect(()=>{if(!sources&&!otherOpen&&!open&&!itineraryOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSources(false);setOtherOpen(false);setOpen(false);setItineraryOpen(false);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[sources,otherOpen,open,itineraryOpen]);
 const airports=data.airports;
 const routes=useMemo(()=>availableRoutes(data.routes,data.referenceDate,includeSeasonal),[data,includeSeasonal]);
 const airportIds=useMemo(()=>journey?new Set(pathResult?.airportIds||[]):selectedAirportIds(routes,selected),[routes,selected,mode,pathResult]);
 const degrees=useMemo(()=>airportDegrees(routes.filter(r=>matches(r,journey?[pathBrand]:selected))),[routes,selected,mode,pathBrand]);
 const layers=useMemo(()=>journey?pathLayers(pathResult,data.routes):bfs(start,routes||[],selected),[start,routes,selected,mode,pathResult,data]);
 const animationPlan=useMemo(()=>buildAnimationPlan(layers),[layers]);
 const maxFlights=useMemo(()=>maxArrivalFlights(start,layers),[start,layers]);
 useEffect(()=>{setPlaying(false);setProgress(0);},[start,selected,includeSeasonal,mode,pathBrand]);
 useEffect(()=>{if(!playing)return;let frame:number,last:number|undefined;
  const tick=(now:number)=>{if(last!==undefined){const delta=Math.min(now-last,100)/2800*speedRef.current;setProgress(p=>Math.min(animationPlan.duration,p+delta));}last=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,animationPlan.duration]);
 useEffect(()=>{if(playing&&progress>=animationPlan.duration)setPlaying(false);},[progress,animationPlan.duration,playing]);
 const origin=airports?.find(a=>a.id===displayStart),completed=routeFrames(animationPlan,progress).filter(f=>f.finished).map(f=>f.step);
 const reached=new Set(displayStart?[displayStart]:[]);completed.forEach(s=>reached.add(s.toId));
 const complete=layers.length>0&&progress>=animationPlan.duration;
 const totalSegments=journey?(pathResult?.routeIds.length||0):new Set((routes||[]).filter(r=>matches(r,selected)).map(r=>segmentKey(r.fromId,r.toId))).size;
 const visibleAirports=airports?.filter(a=>airportIds.has(a.id)&&`${a.nameJa} ${a.nameEn} ${a.iata} ${a.icao}`.toLowerCase().includes(query.toLowerCase()))||[];
 const allDegrees=useMemo(()=>airportDegrees(routes),[routes]);
 const orderedAirports=sortAirports(origin&&!visibleAirports.includes(origin)?[...visibleAirports,origin]:visibleAirports,allDegrees);
 const select=(id:string)=>{if(mode==='network')setStart(id);};
 const play=()=>{if(complete)setProgress(0);setPlaying(true);setOpen(false);};
 const renderCarrier=(c:typeof carriers[number])=>{
  const count=new Set(routes.filter(r=>matches(r,[c.id])).map(r=>segmentKey(r.fromId,r.toId))).size;
  return <label className={`carrier ${c.sub?'major':''} ${selected.includes(c.id)?'checked':''}`} key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>setSelected(s=>s.includes(c.id)?s.filter(x=>x!==c.id):[...s,c.id])}/><span className="custom-check">✓</span><span className="carrier-name" style={c.color?{color:c.color}:undefined}>{c.name}{c.sub&&<small>{c.sub}</small>}</span><span className="carrier-count">{count}</span></label>;
 };
 const trapPanelFocus=(event:React.KeyboardEvent<HTMLElement>)=>{
  if(!compact||!open||otherOpen||sources||itineraryOpen||event.key!=='Tab')return;
  const items=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')||[]).filter(el=>el.offsetParent!==null);
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 };
 return <main className="app">
  <header className="topbar"><a className="wordmark" href="#" aria-label="AIR ROUTES ホーム"><img className="brand-icon" src={brandIcon} alt="" width="34" height="34"/>AIR ROUTES <span className="brand-country">/ JAPAN</span></a><span className="edition">EXPLORING THE SKY</span><div className="header-actions"><button className="text-button" onClick={()=>setSources(!sources)}>データと出典 <span>↗</span></button><button ref={menuButton} className="hamburger-button" aria-label="操作メニューを開く" aria-expanded={open} aria-controls="operations-panel" onClick={()=>setOpen(!open)}><span/><span/><span/></button></div></header>
  <div className="workspace">
   <aside id="operations-panel" ref={panelRef} className={`panel ${open?'is-open':''}`} aria-hidden={compact&&!open} role={compact?'dialog':undefined} aria-modal={compact&&open?true:undefined} aria-labelledby={compact?'drawer-title':undefined} onKeyDown={trapPanelFocus}>
    <div className="panel-intro"><div className="eyebrow">AIRLINE NETWORK EXPLORER</div><h1>日本の空は、<br/>どこまで<br/>つながっているのか？</h1><p>ひとつの空港から、次の空港へ。<br/>空のつながりを、光の線でたどる。</p></div>
    <div className="drawer-heading"><div><span className="eyebrow">NETWORK CONTROLS</span><h2 id="drawer-title">表示設定</h2></div><button className="drawer-close" aria-label="操作メニューを閉じる" onClick={()=>setOpen(false)}>×</button></div>
    <div className="panel-body">
     <div className="mode-tabs" aria-label="表示モード">{(['network','path','legs'] as const).map(value=><button key={value} className={mode===value?'active':''} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='network'?'ネットワーク':value==='path'?'最長片道':'最多乗継'}</button>)}</div>
     {journey&&<div className="path-controls"><div className="section-heading"><h2>航空会社</h2></div><div className="mode-tabs"><button className={pathBrand==='ANA'?'active':''} aria-pressed={pathBrand==='ANA'} onClick={()=>setPathBrand('ANA')}>ANA</button><button className={pathBrand==='JAL'?'active':''} aria-pressed={pathBrand==='JAL'} onClick={()=>setPathBrand('JAL')}>JAL</button><button className={pathBrand==='ALL'?'active':''} aria-pressed={pathBrand==='ALL'} onClick={()=>setPathBrand('ALL')}>全航空会社</button></div><p className="journey-summary">{mode==='legs'?'同じ空港を二度訪れず、乗継をできるだけ多く。':'同じ空港を二度訪れず、飛行距離をできるだけ長く。'}</p><strong className="path-distance">{mode==='legs'?Math.max(0,(pathResult?.routeIds.length||0)-1):pathResult?.totalDistanceKm.toLocaleString('ja-JP',{maximumFractionDigits:1})}<small>{mode==='legs'?'回乗継':' km'}</small></strong><p>{pathResult?.airportIds.length}空港 · {pathResult?.routeIds.length}区間</p><div className="path-sequence" aria-label="全経由空港">{pathResult?.airportIds.map((id,i)=><span key={id} className={reached.has(id)?'visited':''}>{i>0&&<span className="path-arrow"> → </span>}{airports.find(a=>a.id===id)?.nameJa}</span>)}</div><button className="path-details" onClick={()=>setItineraryOpen(true)}>全経由空港・計算条件を見る ↗</button></div>}
     <div className="network-controls" hidden={mode!=='network'}>
     <div className="section-heading"><span className="step-number">01</span><h2>出発空港</h2></div>
     <label className="sr-only" htmlFor="airport-search">空港名・コードで検索</label><div className="search-wrap"><span>⌕</span><input id="airport-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="空港名・コードで検索"/></div>
     <label className="sr-only" htmlFor="airport-select">出発空港を選択</label><select id="airport-select" value={start||''} onChange={e=>select(e.target.value)}><option value="">空港を選択してください</option>{orderedAirports.map(a=><option key={a.id} value={a.id}>{a.nameJa}{a.iata?` / ${a.iata}`:''}{!airportIds.has(a.id)?'（選択会社の対象外）':''}</option>)}</select>{query&&visibleAirports.length===0&&<small>該当する空港がありません。</small>}

     <div className="section-heading"><span className="step-number">02</span><h2>航空会社</h2><button className="select-all" onClick={()=>setSelected(selected.length===carriers.length?[]:carriers.map(c=>c.id))}>{selected.length===carriers.length?'すべて解除':'すべて選択'}</button></div>
     <div className="carrier-list">{carriers.filter(c=>c.sub).map(renderCarrier)}</div><button className="other-carriers-toggle" aria-expanded={otherOpen} onClick={()=>setOtherOpen(!otherOpen)}>その他の航空会社 <span>{selected.filter(id=>!['ANA','JAL'].includes(id)).length?`${selected.filter(id=>!['ANA','JAL'].includes(id)).length}社選択 · ＋`:'＋'}</span></button>
     <label className="seasonal-toggle"><input type="checkbox" checked={includeSeasonal} onChange={e=>setIncludeSeasonal(e.target.checked)}/>期間限定路線も含める</label>
     </div>
     <p className="hint">{journey?'再生すると出発地から順番に航路をたどります。':start&&!airportIds.has(start)?'出発空港が対象外です。地図から対象空港を選択してください。':'選択会社の全対象空港を表示。再生でつながりが広がります。'}</p>
     <div className="playback-settings"><div className="playback"><button className="play-button" disabled={!displayStart||!layers.length} onClick={()=>playing?setPlaying(false):play()}>{playing?'Ⅱ 一時停止':complete?'↻ もう一度再生':progress>0?'▶ 再開':'▶ 再生する'}</button><button className="reset-button" aria-label="描画をリセット" onClick={()=>{setPlaying(false);setProgress(0);}}>↺</button></div>
     {journey&&<button className="path-details show-whole-path" onClick={()=>{setPlaying(false);setProgress(animationPlan.duration);setOpen(false);}}>全経路を地図に表示</button>}
     <label className="speed-label" htmlFor="speed">再生速度 <span>{currentSpeed}×</span></label><input id="speed" type="range" min=".25" max={journey?8:3} step=".25" value={currentSpeed} onChange={e=>journey?setPathSpeed(Number(e.target.value)):setSpeed(Number(e.target.value))}/><div className="range-labels"><span>ゆっくり</span><span>速く</span></div>
     </div>
     <div className="sample-note"><span className="status-dot"/>全国台帳 · {data.airports.length}空港 / {new Set(data.routes.map(r=>segmentKey(r.fromId,r.toId))).size}区間<small>未照合の区間を含みます。<br/>乗継時刻は考慮しません。</small></div>
    </div>
   </aside>
   <section className={`map-area ${mapMoving?'is-moving':''}`} aria-label="ネットワークの探索">
    <MapView airports={data.airports} layers={layers} progress={progress} start={displayStart} onSelect={select} focusToken={focusToken} resetToken={resetToken} onMoving={setMapMoving} visibleAirportIds={airportIds} degrees={degrees} animationPlan={animationPlan} keepRoutes={journey}/>
    <div className="map-top"><div className="map-heading"><div className="eyebrow">DOMESTIC CONNECTIONS</div><h2>{journey?`${pathName}の${modeName}`:origin?`${origin.nameJa}から広がる空`:'空港を選んで、空の旅へ。'}</h2><p>{journey?(mode==='legs'?'同じ空港を二度訪れない、乗継の旅。':'同じ空港を二度訪れない、距離の旅。'):origin?`${origin.iata} · ${selected.map(s=>carriers.find(c=>c.id===s)?.name).join(' / ')||'航空会社を選択'}`:'地図の点をクリックするか、左のパネルから選択'}</p></div><div className="map-tools"><button onClick={()=>setFocus(n=>n+1)} disabled={!start} title="出発空港へフォーカス">◎ <span>出発空港</span></button><button onClick={()=>setReset(n=>n+1)} title="日本全体を表示">⤢ <span>日本全体</span></button></div></div>
    <div className="network-count">対象 {airportIds.size}空港 · {totalSegments}区間{journey?' · 2026/10/13基準':includeSeasonal?' · 期間限定を含む':' · 2026/10/13基準'}</div>
    <div className="map-tag"><span className="status-dot"/>{journey?(playing?'片道ルートを飛行中':complete?'終点に到着':progress>0?'一時停止中':'再生すると旅が始まります'):playing?'ネットワークを展開中':complete?'ネットワークの展開が完了':progress>0?'一時停止中':origin?'再生すると路線が広がります':'出発空港を選択'}</div>
    <div className="stats" aria-live="polite"><div><span>到達した空港</span><strong>{reached.size}<small>AIRPORTS</small></strong></div><div><span>描画済みの区間</span><strong>{completed.length}<small>/ {totalSegments} ROUTES</small></strong></div>{journey?<div><span>{mode==='legs'?'乗継回数':'総飛行距離（大圏距離）'}</span><strong>{mode==='legs'?Math.max(0,(pathResult?.routeIds.length||0)-1):Math.round(pathResult?.totalDistanceKm||0).toLocaleString()}<small>{mode==='legs'?'回':'km'} · {pathResult?.status==='optimal'?'収録データ内の最長':'探索で得た最良候補'}</small></strong></div>:<div title="選択した航空会社で到達できるすべての空港が対象です。各空港への最少乗継回数のうち、最も多い回数を表示します。時刻表や空席は考慮しません。"><span>すべての空港への乗継</span><strong>{Math.max(0,maxFlights-1)}<small>最大 {Math.max(0,maxFlights-1)}回 · {maxFlights}便</small></strong></div>}</div>
    <div className="map-legend"><span><i className="legend-origin"/>出発空港</span><span><i className="legend-reached"/>到達空港</span><span><i/>未到達</span><span className="legend-line">大圏航路</span><span className="zoom-label-hint">点の大きさ＝接続数 · 小さな空港名は拡大で表示</span></div>
   </section>
  </div>
  {open&&compact&&<button className="drawer-backdrop" tabIndex={-1} aria-label="操作メニューを閉じる" onClick={()=>setOpen(false)}/>}
  <footer className="footer"><span>ひとつの空港から、日本の空を見渡す。</span><span>NATIONWIDE NETWORK · データ基準 2026.10.13</span></footer>
  {itineraryOpen&&pathResult&&<div className="modal-backdrop" onClick={()=>setItineraryOpen(false)}><section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="itinerary-title" onClick={e=>e.stopPropagation()}><button autoFocus className="modal-close" aria-label="閉じる" onClick={()=>setItineraryOpen(false)}>×</button><div className="eyebrow">ONE-WAY JOURNEY</div><h2 id="itinerary-title">{pathName}の{modeName}</h2><p>{mode==='legs'?'空港を一度ずつ訪れ、搭乗する便数（区間数）を最大化します。乗継回数は搭乗便数から1を引いた数です。同数の経路が複数ある場合、そのうちの1経路を表示します。':'空港を一度ずつ訪れ、合計の大圏距離を最大化します。'}{pathResult.constraints.fixedStart?'鳥取発。':'出発地・到着地は指定しません。'}グループ便・各区間のコードシェア便を含みます。</p><p>2026年10月13日基準。基準日に有効な収録路線だけを方向別に使用しています。未照合の区間を含み、運航時刻・乗継時間は考慮しません。航空券として販売される「片道切符」を示すものではありません。</p><p>{pathResult.status==='optimal'?'収録データと上記条件の範囲で、最長であることを計算で確認済みです。':`探索で得た最良候補です。最長の証明は未完了（上界との差 ${(100*(pathResult.solver.gap||0)).toFixed(2)}%）。`}</p><ol className="itinerary-list">{pathResult.airportIds.map((id,i)=><li key={id}><span>{airports.find(a=>a.id===id)?.nameJa}</span><small>{i===0?'出発':`${Math.round(data.routes.find(r=>r.id===pathResult.routeIds[i-1])?.distanceKm||0).toLocaleString()} km`}</small></li>)}</ol></section></div>}
  {otherOpen&&<div className="modal-backdrop" onClick={()=>setOtherOpen(false)}><section className="source-modal carrier-modal" role="dialog" aria-modal="true" aria-labelledby="other-title" onClick={e=>e.stopPropagation()}><button className="modal-close" autoFocus aria-label="閉じる" onClick={()=>setOtherOpen(false)}>×</button><h2 id="other-title">その他の航空会社</h2><p>実運航会社として確認・採録した区間を選びます。</p><div className="carrier-list">{carriers.filter(c=>!c.sub).map(renderCarrier)}</div><button className="play-button done-carriers" onClick={()=>setOtherOpen(false)}>選択を完了</button></section></div>}
  {sources&&<div className="modal-backdrop" onClick={()=>setSources(false)}><section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="sources-title" onClick={e=>e.stopPropagation()}><button className="modal-close" autoFocus onClick={()=>setSources(false)} aria-label="閉じる">×</button><div className="eyebrow">DATA & METHODOLOGY</div><h2 id="sources-title">データと、見えるものの範囲。</h2><p>{data.description}</p><p>{data.periodNote}</p><ul><li>{data.routes.length}方向別レコードを{new Set(data.routes.map(r=>segmentKey(r.fromId,r.toId))).size}区間にまとめて描画します。ANAは方向別の時刻表抽出、その他は全国路線台帳の双方向区間として採録し、方向別便の未照合を記録しています。</li><li>ANA/JALは各区間のブランドフラグで分類し、提携先の全路線を無条件に含めません。FDA・ORC・天草なども、路線単位でブランド所属を確認して含めています。</li><li>最長片道と最多乗継は、それぞれANA・JAL・すべての航空会社を選べます。収録済みの基準日有効路線を使い、空港の再訪なしで、最長片道は大圏距離の合計、最多乗継は搭乗便数を最大化します。最適性の確認状況は各ルートの計算条件に表示します。</li><li>データは同じ日に旅行できる行程や、現在の空席・運航状況を示しません。</li></ul><div className="source-links"><a href={'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2))} download="network.json" target="_blank" rel="noreferrer">空港・路線データ（JSON） ↗</a><a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">空港座標：OurAirports ↗</a><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">地図：Natural Earth（Public Domain） ↗</a></div><details><summary>路線別の運航会社・期間・出典</summary><div className="route-ledger">{data.routes.map(r=><article key={r.id}><strong>{r.fromId.slice(3)} → {r.toId.slice(3)}</strong><p>運航：{r.operators.join(' / ')||'グループ内の実運航会社は未照合'}<br/>ブランド：{r.marketingCarriers.join(' / ')||'追加確認なし'}<br/>{r.validFrom}〜{r.validTo}<br/>{r.status} · {r.directionVerified?'ANA方向別抽出あり':'方向別ダイヤ未照合'}<br/>{r.verification}</p>{r.sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}{s.pages.length?`（p.${s.pages.join(', ')}）`:''} ↗</a>)}</article>)}</div></details></section></div>}
 </main>;
}
