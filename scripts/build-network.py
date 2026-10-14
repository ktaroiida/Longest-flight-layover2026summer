"""Build the nationwide research network from attributed source inputs.
No airline membership is inferred from an operator-wide partnership.
"""
from pathlib import Path
import json,math,collections
root=Path(__file__).resolve().parents[1]
load=lambda p:json.loads((root/p).read_text())
airports=load('public/data/airports.json');index={a['id']:a for a in airports}
rows=load('scripts/input/company-routes.json');ana=load('scripts/input/ana-route-extract.json')
source_ana='https://www.ana.co.jp/guide/plan/airinfo/dom-timetable/pdf/timetable_all_20260701_20261024.pdf'
operators={'AIRDO':'AIRDO','IBEXエアラインズ':'IBEX','ソラシドエア':'ソラシドエア','スターフライヤー':'スターフライヤー','オリエンタルエアブリッジ（ORC）':'ORC','フジドリームエアラインズ（FDA）':'FDA','天草エアライン（AMX）':'AMX','スカイマーク':'SKY','Peach Aviation':'Peach','ジェットスター・ジャパン':'Jetstar Japan','SPRING JAPAN':'SPRING JAPAN','トキエア':'TOKI AIR','新中央航空':'新中央航空','東邦航空（東京愛らんどシャトル）':'東邦航空','第一航空':'第一航空'}
routes={}
def get(a,b):
 k=a+'-'+b
 return routes.setdefault(k,dict(id='JP-'+k,fromId='jp-'+a,toId='jp-'+b,operators=[],marketingCarriers=[],groups=[],anaNetwork=False,jalNetwork=False,validFrom='2026-07-01',validTo='2026-10-24',status='published-network',directionVerified=False,verification='既存全国路線台帳。路線図の区間を両方向に採録。方向別ダイヤ・実運航会社の全件照合は未完了。',sources=[]))
def add(r,op=None,brand=None,url=None,title=None,pages=None):
 if op and op not in r['operators']:r['operators'].append(op)
 if brand:
  if brand not in r['marketingCarriers']:r['marketingCarriers'].append(brand)
  r[brand.lower()+'Network']=True
  if brand not in r['groups']:r['groups'].append(brand)
 if url and not any(s['url']==url for s in r['sources']):r['sources'].append(dict(title=title or '会社別公式路線情報',url=url,pages=pages or []))
for row in rows:
 a,b=row['fromCode'],row['toCode'];company=row['company']
 # ANA's old undirected rows are superseded by the directional official extract.
 if company.startswith('ANA系'):continue
 brand='JAL' if company.startswith('JALグループ') else None
 for f,t in [(a,b),(b,a)]:add(get(f,t),operators.get(company),brand,row['sourceUrl'],company)
for x in ana:
 r=get(x['fromCode'],x['toCode'])
 for op in x['operators']:add(r,op,'ANA',source_ana,'ANA公式夏ダイヤ・方向別抽出',x['pages'])
 r['directionVerified']=True;r['verification']='ANA公式PDFの方向別抽出。ブランド単位の確認であり、全運航会社・日付別運航の手作業照合は未完了。'
# JAL's partner route lists explicitly confirm these specific pairs.
partner_sources={
 'ORC':('https://www.jal.co.jp/jp/ja/dom/route/codeshare/orc/index.html','NGS-IKI NGS-TSJ NGS-FUJ FUK-TSJ FUK-FUJ'),
 'AMX':('https://www.jal.co.jp/jp/ja/dom/route/codeshare/amx/index.html','AXJ-FUK AXJ-KMJ KMJ-ITM'),
 'FDA':('https://www.jal.co.jp/jp/ja/dom/route/codeshare/fda/','NKM-OKD NKM-AOJ NKM-HNA NKM-GAJ NKM-KIJ NKM-IZO NKM-KCZ NKM-FUK NKM-KMJ NGO-KCZ NGO-KMJ FSZ-OKD FSZ-CTS FSZ-IZO FSZ-FUK FSZ-KMJ FSZ-KOJ MMJ-OKD MMJ-CTS MMJ-UKB MMJ-FUK UKB-AOJ UKB-HNA FUK-CTS FUK-KIJ FUK-HNA FUK-SDJ CTS-GAJ CTS-KIJ SDJ-IZO')}
for op,(url,pairs) in partner_sources.items():
 for pair in pairs.split():
  a,b=pair.split('-')
  for f,t in [(a,b),(b,a)]:add(get(f,t),op,'JAL',url,'JAL公式コードシェア路線一覧')
# Separate confirmed limited periods from the normal reference-date view.
periods={
 'AOJ-UKB':('2026-07-31','2026-08-09','FDA夏季・公表された冬の期間便もあり'),
 'FSZ-KMJ':('2026-04-29','2026-05-10','FDA夏季・公表された冬の期間便もあり'),
 'HNA-UKB':('2026-08-10','2026-08-23','FDA期間限定'),
 'FSZ-IZO':('2026-04-29','2026-05-10','FDA期間限定'),
 'CTS-IZO':('2026-08-02','2026-08-31','JAL夏季便'),
 'CTS-TKS':('2026-08-01','2026-08-29','JAL夏季便・曜日限定'),
 'ITM-MMB':('2026-07-01','2026-08-31','夏季便。通年化は2027/2/1予定'),
 'AKJ-ITM':('2026-10-25','2027-03-27','JAL通年化は2026/10/25以降'),
 'SDJ-IZO':('2026-10-25','2026-11-30','FDA期間限定'),
 'MMB-NGO':('2026-10-01','2026-10-12','ANA期間限定')}
for key,r in routes.items():
 pair='-'.join(sorted([r['fromId'][3:],r['toId'][3:]]))
 if pair in periods:
  r['validFrom'],r['validTo'],note=periods[pair];r['status']='seasonal';r['verification']+=' '+note
 if pair in ['KIX-KUH','KIX-MMB']:
  r['status']='suspended';r['verification']+=' Peach公式路線図で運休確認。'
 if pair=='ITM-TKN':r['status']='unconfirmed';r['verification']+=' 10月の直行便を確認できず通常表示から除外。'
 if key=='RNJ-ASJ':r['status']='suspended';r['verification']+=' 10月資料でこの方向の直行便なし。逆方向は別レコード。'
 a,b=index[r['fromId']],index[r['toId']];p,q=map(math.radians,[a['lat'],b['lat']]);dl=math.radians(b['lon']-a['lon']);r['distanceKm']=round(6371.0088*2*math.asin(min(1,math.sqrt(math.sin((q-p)/2)**2+math.cos(p)*math.cos(q)*math.sin(dl/2)**2))),3)
 r['operators'].sort();r['marketingCarriers'].sort()
 # Ownership groups are separate from marketing-brand membership.
 r['groups']=sorted({('ANA' if op in ['ANA','ANA Wings'] else 'JAL') for op in r['operators'] if op in ['ANA','ANA Wings','JAL','J-AIR','JAC','JTA','RAC','HAC']})
# Proof-ledger: every exclusion carries its original official source.
findings=load('scripts/input/exclusions.json')
for r in routes.values():
 for x in findings:
  tokens=x['airportPairs']
  if sorted([r['fromId'][3:],r['toId'][3:]]) in tokens:add(r,url=x['source'],title=x['finding'])
data=dict(version='0.2.0',scope='国内全国路線台帳・確認状況付き',referenceDate='2026-10-13',retrievedAt='2026-10-13',description='小規模抜粋を廃止し、既存の全国路線台帳全体とANA公式方向別抽出、JAL公式コードシェア一覧を統合。未照合情報を含む研究用ネットワークであり、現在の全便を確認した完全版とは異なります。',periodNote='通常表示は2026/10/13を基準に確認済みの期間外・運休・保守除外を除く。期間限定を含めると異なる日程の路線も表示。乗り継ぎ時刻は考慮しない。',airports=airports,routes=sorted(routes.values(),key=lambda r:r['id']))
(root/'public/data/network.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
for brand in ['ANA','JAL']:
 rs=[r for r in data['routes'] if r[brand.lower()+'Network'] and r['status'] not in ['suspended','unconfirmed'] and r['validFrom']<=data['referenceDate']<=r['validTo']];print(brand,len(set(r['fromId'] for r in rs)|set(r['toId'] for r in rs)),'airports',len(set(tuple(sorted([r['fromId'],r['toId']])) for r in rs)),'segments')
print('Master:',len(airports),'points',len(routes),'directional segments',len(set(tuple(sorted([r['fromId'],r['toId']])) for r in routes.values())),'physical segments')
