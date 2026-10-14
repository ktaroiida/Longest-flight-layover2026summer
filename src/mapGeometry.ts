import type {Polygon,MultiPolygon} from 'geojson';
export type Project=(coordinate:number[])=>[number,number];
export function linePath(coordinates:number[][],project:Project):string {
 return coordinates.map((p,i)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join(' ');
}
export function polygonPath(geometry:Polygon|MultiPolygon,project:Project):string {
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 return polygons.flatMap(p=>p.map(ring=>linePath(ring,project)+' Z')).join(' ');
}
