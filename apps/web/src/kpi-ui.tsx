import { useEffect, useState } from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleHelp, Gauge,
  LineChart, Minus, Search, Settings2, SlidersHorizontal } from 'lucide-react';
import { apiErrorMessage } from './cases-api';
import { fmtDays, type Forecast, type KpiStatus, type PeriodKind, type TrendLabel } from './kpi-api';
import { useDemoRole } from './role-preview';
import './studio-pages.css';
import './kpi-analytics.css';

/** Loads data for a page; re-runs when deps change. Errors become a readable message. */
export function useLoad<T>(load:()=>Promise<T>,deps:unknown[]){
  const [data,setData]=useState<T|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    load().then(d=>{if(active){setData(d);setLoading(false);}})
      .catch(e=>{if(active){setError(apiErrorMessage(e));setLoading(false);}});
    return ()=>{active=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },deps);
  return {data,error,loading,setData};
}

/** Filters shared by all analytics pages live in the URL, so links and tab switches keep them. */
export function useAnalyticsParams(){
  const [params,setParams]=useSearchParams();
  const period:PeriodKind=params.get('period')==='month'?'month':'week';
  const asOf=params.get('asOf')??'';
  const kpiId=params.get('kpiId')??'';
  const townCouncilId=params.get('townCouncilId')??'';
  function update(changes:Record<string,string>){
    const next=new URLSearchParams(params);
    for(const [k,v] of Object.entries(changes)){if(v)next.set(k,v);else next.delete(k);}
    setParams(next,{replace:true});
  }
  return {period,asOf,kpiId,townCouncilId,update,params};
}

const TABS=[
  {to:'/analytics',label:'KPI Overview',icon:Gauge},
  {to:'/analytics/trends',label:'Trends & Forecast',icon:LineChart},
  {to:'/analytics/factors',label:'Contributing Factors',icon:Search},
  {to:'/analytics/settings',label:'KPI Settings',icon:Settings2},
  {to:'/analytics/scenarios',label:'Scenarios (demo)',icon:SlidersHorizontal}
];
/** Tabs across the analytics pages, carrying the current filters along. */
export function AnalyticsTabs(){
  const location=useLocation();
  const [params]=useSearchParams();
  const keep=new URLSearchParams();
  for(const k of ['period','asOf','kpiId','townCouncilId'])if(params.get(k))keep.set(k,params.get(k)!);
  const qs=keep.toString()?'?'+keep.toString():'';
  return <nav className="sp-tabs" aria-label="Performance analytics views">
    {TABS.map(t=><NavLink key={t.to} to={t.to+(t.to.endsWith('scenarios')?'':qs)} end
      className={()=>location.pathname===t.to?'active':''}><t.icon size={16}/>{t.label}</NavLink>)}
  </nav>;
}

export function PageHeader({title,description}:{title:string;description:string}){
  return <header className="page-header"><div>
    <p className="eyebrow">PERFORMANCE ANALYTICS · JOEL</p><h1>{title}</h1><p className="subtext">{description}</p>
  </div></header>;
}

export function PeriodToggle({value,onChange}:{value:PeriodKind;onChange:(p:PeriodKind)=>void}){
  return <div className="ka-segment" role="group" aria-label="Reporting period">
    {(['week','month'] as const).map(p=><button key={p} type="button" aria-pressed={value===p}
      className={value===p?'active':''} onClick={()=>onChange(p)}>{p==='week'?'Weekly':'Monthly'}</button>)}
  </div>;
}

/** "View as of" a past date: everything is recalculated with only what was known then. */
export function AsOfInput({value,onChange}:{value:string;onChange:(v:string)=>void}){
  const today=new Date().toISOString().slice(0,10);
  const yearAgo=new Date(Date.now()-365*86_400_000).toISOString().slice(0,10);
  return <label>View as of
    <span className="ka-asof">
      <input type="date" value={value} min={yearAgo} max={today} onChange={e=>onChange(e.target.value)}/>
      {value&&<button type="button" onClick={()=>onChange('')}>Today</button>}
    </span>
  </label>;
}
export function AsOfBanner({asOf}:{asOf:string|null}){
  if(!asOf)return null;
  return <div className="sp-notice ka-asof-banner"><CircleHelp size={17}/>
    <span>Showing performance as it stood on <strong>{new Date(asOf).toLocaleDateString('en-SG',{day:'numeric',month:'long',year:'numeric'})}</strong>,
    using only cases, acknowledgements and closures recorded by then.</span>
  </div>;
}

const STATUS:Record<KpiStatus,{cls:string;icon:typeof CheckCircle2}>={
  'On track':{cls:'closed',icon:CheckCircle2},
  'At risk':{cls:'warning',icon:AlertTriangle},
  'Breached':{cls:'critical',icon:AlertOctagon},
  'No data':{cls:'',icon:Minus}
};
/** Status always shows an icon and a word, never colour alone. */
export function StatusPill({status}:{status:KpiStatus}){
  const s=STATUS[status];
  return <span className={'badge ka-status '+s.cls}><s.icon size={12} aria-hidden/>{status}</span>;
}

export function TrendTag({label}:{label:TrendLabel}){
  const Icon=label==='improving'?ArrowUpRight:label==='declining'?ArrowDownRight:label==='stable'?ArrowRight:Minus;
  return <span className={'ka-trend ka-trend-'+label.split(' ')[0]}><Icon size={13} aria-hidden/>{label==='insufficient data'?'too little data':label}</span>;
}

/** Short forecast text for grids: "Breach in ~3 weeks", "Already below target", or nothing worth saying. */
export function forecastText(f:Forecast):string|null{
  if(f.status==='breached')return 'Already past target';
  if(f.status!=='deteriorating'||f.daysToTarget===null)return null;
  if(f.beyondHorizon)return 'No breach expected within 6 months';
  return 'Breach in '+fmtDays(f.daysToTarget);
}

/** A tiny line of the last periods, with the target as a dashed line. Decorative: the value and status carry the meaning. */
export function Sparkline({values,target,lowerBetter}:{values:(number|null)[];target:number;lowerBetter:boolean}){
  const nums=values.filter((v):v is number=>v!==null);
  if(nums.length<2)return <svg className="ka-spark" aria-hidden/>;
  const min=Math.min(...nums,target),max=Math.max(...nums,target);
  const span=max-min||1,w=84,h=26;
  const x=(i:number)=>(i/(values.length-1))*w;
  const y=(v:number)=>h-2-((v-min)/span)*(h-4);
  let d='';
  values.forEach((v,i)=>{if(v===null)return;d+=(d&&values[i-1]!==null?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);});
  const last=nums.at(-1)!;
  const bad=lowerBetter?last>target:last<target;
  return <svg className="ka-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
    <line x1={0} x2={w} y1={y(target)} y2={y(target)} className="ka-spark-target"/>
    <path d={d} className={'ka-spark-line'+(bad?' bad':'')}/>
  </svg>;
}

export function Loading({error,loading,what}:{error:string;loading:boolean;what:string}){
  if(error)return <div className="sp-error"><AlertTriangle size={17}/>{error}</div>;
  if(loading)return <div className="sp-notice">Calculating {what}…</div>;
  return null;
}

/** Managers may change KPI settings. Demo role preview only; the API enforces the same rule on the header it receives. */
export function useIsKpiManager(){
  const role=useDemoRole();
  return role==='Administrator'||role==='EMS Manager';
}

export function Footnote(){
  return <p className="sp-footnote">KPIs are calculated from the feedback case database (fictional seed data). Targets are working assumptions
    to confirm with EM Services. Forecasts extend recent trends and are estimates, not guaranteed outcomes.</p>;
}
