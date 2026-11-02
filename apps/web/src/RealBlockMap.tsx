import { useEffect, useMemo, useRef, useState } from 'react';
import './real-block-map.css';

export type DemoMapRisk='Low'|'Watch'|'Elevated';
export type DemoMapPoint={
  key:string; townCouncilId:string; block:string; council:string;
  lat:number;lng:number;risk:DemoMapRisk;
};
type Coordinates=[number,number];

interface LeafletMapInstance{
  setView(center:Coordinates,zoom:number):LeafletMapInstance;
  flyTo(center:Coordinates,zoom:number,options?:{duration:number}):LeafletMapInstance;
  getZoom():number;
  invalidateSize():void;
  remove():void;
}
interface LeafletMarkerInstance {
  addTo(map:LeafletMapInstance):LeafletMarkerInstance;
  bindTooltip(content:HTMLElement,options?:{direction:string;offset:Coordinates}):LeafletMarkerInstance;
  on(event:'click',callback:()=>void):LeafletMarkerInstance;
  setStyle(options:{radius:number;weight:number;color:string;fillColor:string}):LeafletMarkerInstance;
  remove():void;
}
interface LeafletLibrary{
  map(el:HTMLElement,options:{scrollWheelZoom:boolean;zoomControl:boolean}):LeafletMapInstance;
  tileLayer(url:string,options:{attribution:string;maxZoom:number}):{addTo(map:LeafletMapInstance):unknown};
  circleMarker(coords:Coordinates,options:{
    radius:number;weight:number;color:string;fillColor:string;fillOpacity:number;opacity:number
  }):LeafletMarkerInstance;
}
declare global{interface Window{L?:LeafletLibrary}}

const SINGAPORE:Coordinates=[1.3521,103.8198];
// These are illustrative regional anchor points, not locations of individual
// HDB blocks or boundaries of real Town Councils.
const anchors:ReadonlyArray<Coordinates>=[
  [1.4290,103.8350], // Northern sample area
  [1.3520,103.9430], // Eastern sample area
  [1.3340,103.8470], // Central sample area
  [1.3330,103.7430], // Western sample area
  [1.2950,103.8050]  // Southern sample area
];
function hash(value:string):number {
  let result=2166136261;
  for(let i=0;i<value.length;i++){
    result=Math.imul(result^value.charCodeAt(i),16777619);
  }
  return result>>>0;
}

/**
 * A stable fictional position for UI evaluation. Never call this geocoding.
 * If the records later gain verified coordinates, replace this function with
 * a real geocoding/location lookup and remove simulated markers.
 */
export function demoMapCoordinates(townCouncilId:string,block:string,councilIndex:number):Coordinates{
  const center=anchors[councilIndex%anchors.length]??SINGAPORE;
  const north=hash('n:'+townCouncilId+':'+block);
  const east=hash('e:'+townCouncilId+':'+block);
  return [
    center[0]+((north%1001)-500)/500*0.006,
    center[1]+((east%1001)-500)/500*0.008
  ];
}
function pinColor(risk:DemoMapRisk):string{
  if(risk==='Elevated')return '#d16c57';
  if(risk==='Watch')return '#d49e3f';
  return '#178c7c';
}
const TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export default function RealBlockMap({
  points,selectedKey,councilId,onPick
}:{
  points:DemoMapPoint[];selectedKey:string|null;councilId:string;
  onPick:(key:string)=>void;
}){
  const element=useRef<HTMLDivElement|null>(null);
  const mapInstance=useRef<LeafletMapInstance|null>(null);
  const markers=useRef<Map<string,LeafletMarkerInstance>>(new Map());
  const pickRef=useRef(onPick);
  pickRef.current=onPick;
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const center=useMemo(()=>{
    if(!councilId)return SINGAPORE;
    const first=points[0];
    const idx=first?anchors.findIndex(a=>Math.abs(a[0]-first.lat)<0.025&&Math.abs(a[1]-first.lng)<0.025):-1;
    return anchors[idx>=0?idx:0];
  },[councilId,points]);

  useEffect(()=>{
    const el=element.current;
    if(!el)return;
    let disposed=false;
    const script=document.querySelector<HTMLScriptElement>('script[data-estara-leaflet]');
    function initialize(){
      if(disposed||mapInstance.current||!window.L)return;
      try{
        const leaflet=window.L;
        const map=leaflet.map(el!,{scrollWheelZoom:false,zoomControl:true}).setView(SINGAPORE,11);
        leaflet.tileLayer(TILE_URL,{
          attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom:19
        }).addTo(map);
        mapInstance.current=map;
        setReady(true);
        window.requestAnimationFrame(()=>{if(!disposed)map.invalidateSize();});
      }catch(problem){
        setError(problem instanceof Error?problem.message:'Could not initialise the map.');
      }
    }
    function unavailable(){
      if(!disposed&&!window.L)setError('The map library could not load. Check your internet connection or browser restrictions.');
    }
    if(window.L)initialize();
    else if(script){
      script.addEventListener('load',initialize);
      script.addEventListener('error',unavailable);
      // The load event may have fired just before this effect attached.
      window.addEventListener('load',initialize);
    } else unavailable();
    return ()=>{
      disposed=true;
      script?.removeEventListener('load',initialize);
      script?.removeEventListener('error',unavailable);
      window.removeEventListener('load',initialize);
      markers.current.forEach(marker=>marker.remove());
      markers.current.clear();
      mapInstance.current?.remove();
      mapInstance.current=null;
    };
  },[]);

  useEffect(()=>{
    const map=mapInstance.current;
    const leaflet=window.L;
    if(!ready||!map||!leaflet)return;
    markers.current.forEach(marker=>marker.remove());
    markers.current.clear();
    for(const point of points){
      const selected=selectedKey===point.key;
      const color=pinColor(point.risk);
      const marker=leaflet.circleMarker([point.lat,point.lng],{
        radius:selected?11:8,weight:selected?4:2,color:selected?'#123c5e':'#ffffff',
        fillColor:color,fillOpacity:0.95,opacity:1
      }).addTo(map);
      const label=document.createElement('span');
      label.textContent='ILLUSTRATIVE PIN • '+point.council+' • Demo block '+point.block;
      marker.bindTooltip(label,{direction:'top',offset:[0,-5]});
      marker.on('click',()=>pickRef.current(point.key));
      markers.current.set(point.key,marker);
    }
  },[ready,points,selectedKey]);

  useEffect(()=>{
    if(!ready||!mapInstance.current)return;
    const match=points.find(point=>point.key===selectedKey);
    if(match){
      mapInstance.current.flyTo([match.lat,match.lng],Math.max(mapInstance.current.getZoom(),14),{duration:0.5});
    }else if(councilId){
      mapInstance.current.setView(center,12);
    }else{
      mapInstance.current.setView(SINGAPORE,11);
    }
  },[ready,selectedKey,councilId,center,points]);

  return <div className="em-real-map-shell">
    <div ref={element} className="em-real-map" role="region" aria-label="Interactive Singapore street map showing illustrative demo case markers"/>
    {!ready&&<div className="em-map-loading" role="status">{error||'Loading Singapore street map…'}</div>}
    <div className="em-real-map-watermark">REAL STREET MAP · FICTIONAL PIN POSITIONS</div>
    <p className="em-map-accessibility">Use the + and − buttons to zoom. Drag to pan. Click a coloured demo marker to inspect its linked cases. Mouse-wheel zoom is disabled to keep page scrolling comfortable.</p>
  </div>;
}
