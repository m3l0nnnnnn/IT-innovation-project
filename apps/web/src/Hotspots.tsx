import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, Flame, Layers3, MapPin, MessageSquareText, RefreshCw } from 'lucide-react';
import { apiErrorMessage, getCaseMeta, getHotspots, type CaseMeta, type Hotspot, type HotspotList } from './cases-api';
import './ground-insights.css';

export const HOTSPOT_WINDOWS=[30,60,90] as const;

/** Hotspot rows; each opens the cases behind it. Shared by this page and the preview on Operational Insights. */
export function HotspotTable({rows,days,limit}:{rows:Hotspot[];days:number;limit?:number}){
  return <>
    <div className="gi-hotspots-head"><span>Location</span><span>Category</span><span>Cases</span><span>Still open</span><span>Compared with usual</span></div>
    {rows.slice(0,limit).map(h=><Link className="gi-hotspot-row gi-hotspot-link"
      key={h.townCouncilId+':'+h.block+':'+h.category} title={`Open the ${h.category} cases at Blk ${h.block}`}
      to={'/cases?'+new URLSearchParams({townCouncilId:h.townCouncilId,block:h.block,category:h.category})}>
      <div className="gi-hotspot-location"><span className="gi-block-icon"><MapPin size={17}/></span>
        <div><strong>Blk {h.block}{h.street?' · '+h.street:''}</strong><small>{h.council}</small></div></div>
      <span>{h.category}</span>
      <strong>{h.count}</strong>
      <span className="gi-open-count">{h.open} open</span>
      <span className="gi-usual">{h.spike?<span className="badge critical">Spike</span>:<span className="badge">Usual level</span>}
        <small>usually about {h.baseline.toLocaleString('en-SG')} in {days} days</small></span>
    </Link>)}
  </>;
}

/** Repeat-case hotspots: the same problem reported again and again at one block, with spikes above its usual level. */
export default function HotspotsPage(){
  // Operational Insights links here with its council and window: /operations/hotspots?townCouncilId=…&days=…
  const [searchParams]=useSearchParams();
  const [councilId,setCouncilId]=useState(()=>searchParams.get('townCouncilId')??'');
  const [days,setDays]=useState(()=>{
    const fromLink=Number(searchParams.get('days'));
    return (HOTSPOT_WINDOWS as readonly number[]).includes(fromLink)?fromLink:30;
  });
  const [spikesOnly,setSpikesOnly]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [councils,setCouncils]=useState<CaseMeta['councils']>([]);
  const [list,setList]=useState<HotspotList|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    getCaseMeta().then(meta=>{if(active)setCouncils(meta.councils)}).catch(()=>{});
    return ()=>{active=false};
  },[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    getHotspots(days,councilId).then(data=>{if(active){setList(data);setLoading(false)}})
      .catch(e=>{if(active){setError(apiErrorMessage(e));setLoading(false)}});
    return ()=>{active=false};
  },[days,councilId,refresh]);

  const all=list?.data??[];
  const rows=spikesOnly?all.filter(h=>h.spike):all;
  const spikes=all.filter(h=>h.spike).length;
  const openCases=all.reduce((n,h)=>n+h.open,0);
  const blocks=new Set(all.map(h=>h.townCouncilId+':'+h.block)).size;

  return <section className="gi-page">
    <header className="page-header gi-title-row">
      <div>
        <p className="eyebrow">GROUND OPERATIONS · REPEAT CASES</p>
        <h1>Hotspots</h1>
        <p className="subtext">Blocks where the same kind of problem keeps being reported, and where it is far above the usual level.</p>
      </div>
      <Link to="/cases" className="gi-cases-link"><MessageSquareText size={16}/> Feedback cases <ArrowRight size={15}/></Link>
    </header>
    <div className="gi-filters card">
      <label>Town Council
        <select value={councilId} onChange={e=>setCouncilId(e.target.value)}>
          <option value="">All councils</option>
          {councils.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Period
        <select value={days} onChange={e=>setDays(Number(e.target.value))}>
          {HOTSPOT_WINDOWS.map(d=><option key={d} value={d}>Last {d} days</option>)}
        </select>
      </label>
      <label className="gi-toggle"><input type="checkbox" checked={spikesOnly} onChange={e=>setSpikesOnly(e.target.checked)}/> Spikes only</label>
      <button className="gi-refresh" type="button" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={16}/> Refresh</button>
    </div>
    <div className="gi-stats">
      {[
        {label:'Hotspots',value:all.length,detail:`${list?.minCases??4}+ cases of one category at a block`,icon:MapPin},
        {label:'Spikes',value:spikes,detail:'Far above the usual level',icon:Flame},
        {label:'Blocks affected',value:blocks,detail:'Distinct blocks with a hotspot',icon:Layers3},
        {label:'Still open',value:openCases,detail:'Open cases in these hotspots',icon:MessageSquareText}
      ].map(({label,value,detail,icon:Icon})=><article key={label} className="card gi-stat">
        <div className="gi-stat-top"><span>{label}</span><Icon size={19}/></div>
        <strong>{list?value.toLocaleString('en-SG'):'—'}</strong><small>{detail}</small>
      </article>)}
    </div>
    <div className="card gi-hotspots">
      {error?<p className="gi-empty gi-error"><AlertCircle size={16}/> {error}</p>:
        loading&&!list?<p className="gi-empty">Loading hotspots…</p>:
        rows.length===0?<p className="gi-empty">{spikesOnly?'No spikes':'No hotspots'} in the last {days} days.</p>:
        <HotspotTable rows={rows} days={days}/>}
    </div>
    <div className="gi-disclaimer">
      <strong>How this works.</strong> A hotspot is {list?.minCases??4} or more cases of the same category at one block in the period
      (a working assumption to confirm with EMS). Each hotspot is compared with the same block and category over the previous
      {' '}{(list?.baselineDays??180)/30} months: it is a <strong>spike</strong> when that many cases would happen less than 1% of the time
      at its usual rate. Repeated reports are a prompt to investigate, not confirmed defects. Data: case database (fictional seed data).
    </div>
  </section>;
}
