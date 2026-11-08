import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, BarChart3, Clock3, Layers3,
  MessageSquareText, RefreshCw, UsersRound
} from 'lucide-react';
import { getDemoCasesSnapshot, getDemoCouncils } from './ground-demo';
import { deriveGroundInsights, type WindowDays } from './ground-insights';
import { apiErrorMessage, getCaseMeta, getHotspots, type CaseMeta, type HotspotList } from './cases-api';
import { HotspotTable } from './Hotspots';
import './ground-insights.css';

export default function GroundInsightsPage(){
  const [councilId,setCouncilId]=useState('');
  const [windowDays,setWindowDays]=useState<WindowDays>(90);
  const [refresh,setRefresh]=useState(0);
  const councils=useMemo(()=>getDemoCouncils(),[]);
  // Each page mount and explicit refresh reads the current in-memory demo records.
  const records=useMemo(()=>getDemoCasesSnapshot(),[refresh]);
  const insights=useMemo(
    ()=>deriveGroundInsights(records,councilId,windowDays),
    [records,councilId,windowDays]
  );
  const topCategory=insights.categories[0];
  const peak=Math.max(1,...insights.categories.map(c=>c.count));
  const peakLoad=Math.max(1,...insights.workload.flatMap(g=>g.officers.map(o=>o.open)),...insights.workload.map(g=>g.unassigned.open));

  // Hotspots come from the case database; the other sections still use the demo cases.
  // The council filter lists demo councils, which share their names with the database councils.
  const [dbCouncils,setDbCouncils]=useState<CaseMeta['councils']|null>(null);
  const [hotspots,setHotspots]=useState<HotspotList|null>(null);
  const [hotspotError,setHotspotError]=useState('');
  const hotspotDays=windowDays||90; // all history has no earlier period to compare with
  const councilName=councils.find(c=>c.id===councilId)?.name;
  const dbCouncilId=councilId?dbCouncils?.find(c=>c.name===councilName)?.id:'';
  useEffect(()=>{
    let active=true;
    getCaseMeta().then(meta=>{if(active)setDbCouncils(meta.councils)})
      .catch(e=>{if(active)setHotspotError(apiErrorMessage(e))});
    return ()=>{active=false};
  },[]);
  useEffect(()=>{
    if(!dbCouncils)return;
    if(dbCouncilId===undefined){setHotspots(null);setHotspotError(`"${councilName}" is not in the case database.`);return;}
    let active=true;
    setHotspotError('');
    getHotspots(hotspotDays,dbCouncilId).then(data=>{if(active)setHotspots(data)})
      .catch(e=>{if(active){setHotspots(null);setHotspotError(apiErrorMessage(e))}});
    return ()=>{active=false};
  },[dbCouncils,dbCouncilId,councilName,hotspotDays,refresh]);
  const hotspotRows=hotspots?.data??[];
  const spikes=hotspotRows.filter(h=>h.spike).length;
  return <section className="gi-page">
    <header className="page-header gi-title-row">
      <div>
        <p className="eyebrow">GROUND OPERATIONS · MANAGEMENT INSIGHTS</p>
        <h1>Operational insights</h1>
        <p className="subtext">Find recurring feedback patterns, identify block-level concentrations and review the current officer workload.</p>
      </div>
      <Link to="/cases" className="gi-cases-link"><MessageSquareText size={16}/> Feedback cases <ArrowRight size={15}/></Link>
    </header>
    <div className="gi-notice"><AlertCircle size={17}/>
      <span>Illustrative analysis of fictional cases only. Repeated reports are not automatically verified defects, and workload indicators are not staff performance ratings.</span>
    </div>
    <div className="gi-filters card">
      <label>Town Council
        <select value={councilId} onChange={e=>setCouncilId(e.target.value)}>
          <option value="">All demonstration councils</option>
          {councils.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Feedback reporting window
        <select value={windowDays} onChange={e=>setWindowDays(Number(e.target.value) as WindowDays)}>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All demo history</option>
        </select>
      </label>
      <button className="gi-refresh" type="button" onClick={()=>setRefresh(n=>n+1)}>
        <RefreshCw size={16}/> Refresh insights
      </button>
      <span className="gi-filter-help">Workload always uses currently open cases, regardless of the reporting window.</span>
    </div>
    <div className="gi-stats">
      {[
        {label:'Feedback received',value:insights.totals.received,detail:windowDays?'Last '+windowDays+' days':'All demo history',icon:MessageSquareText},
        {label:'Currently open',value:insights.totals.currentOpen,detail:'Across selected councils',icon:Layers3},
        {label:'Overdue open cases',value:insights.totals.overdue,detail:'Older than 7 days (demo rule)',icon:Clock3},
        {label:'Unassigned cases',value:insights.totals.unassigned,detail:'Open cases with no officer',icon:UsersRound}
      ].map(({label,value,detail,icon:Icon})=><article key={label} className="card gi-stat">
        <div className="gi-stat-top"><span>{label}</span><Icon size={19}/></div>
        <strong>{value.toLocaleString('en-SG')}</strong><small>{detail}</small>
      </article>)}
    </div>
    <div className="gi-section-header" id="hotspots">
      <div><p className="eyebrow">REPEATED LOCATIONS · LIVE DATA</p><h2>Repeat-case hotspots</h2>
        <p>Top hotspots from the last {hotspotDays} days: the same kind of problem reported {hotspots?.minCases??4} or more times at one block.
          {!windowDays&&' All history has nothing earlier to compare with, so hotspots use the last 90 days.'}</p></div>
      <span className="gi-hotspot-chip">{hotspots?`${hotspotRows.length} hotspots · ${spikes} spikes`:'…'}</span>
    </div>
    <div className="card gi-hotspots">
      {hotspotError?<p className="gi-empty gi-error"><AlertCircle size={16}/> {hotspotError}</p>:
        !hotspots?<p className="gi-empty">Loading hotspots…</p>:
        hotspotRows.length===0?<p className="gi-empty">No block has {hotspots.minCases} or more cases of one category in the last {hotspotDays} days.</p>:
        <HotspotTable rows={hotspotRows} days={hotspotDays} limit={3}/>}
      <Link className="gi-expand gi-hotspots-more"
        to={'/operations/hotspots?'+new URLSearchParams({days:String(hotspotDays),...(dbCouncilId?{townCouncilId:dbCouncilId}:{})})}>
        View all hotspots <ArrowRight size={14}/>
      </Link>
    </div>
    <div className="gi-section-header">
      <div><p className="eyebrow">FEEDBACK ANALYSIS</p><h2>What residents are reporting</h2>
        <p>Break down cases by category, then see which specific issues recur.</p></div>
    </div>
    <div className="gi-analysis-grid">
      <article className="card gi-panel">
        <header className="gi-panel-heading"><div className="gi-heading-icon"><BarChart3 size={19}/></div>
          <div><h3>Feedback by category</h3><p>Volume and currently open cases from the selected reporting window</p></div>
        </header>
        {insights.categories.length===0?<p className="gi-empty">No feedback cases in this period.</p>:
          <div className="gi-categories">
            {insights.categories.map(c=><div className="gi-category" key={c.category}>
              <div className="gi-row-between"><strong>{c.category}</strong><span>{c.count} cases · {c.share}%</span></div>
              <div className="gi-track" role="img" aria-label={c.category+': '+c.count+' cases'}>
                <div className="gi-bar" style={{width:String(c.count/peak*100)+'%'}}/>
              </div>
              <small>{c.open} still open from this category and window</small>
            </div>)}
          </div>}
        {topCategory&&<p className="gi-context"><strong>Most reported:</strong> {topCategory.category} ({topCategory.count} cases). This indicates frequency, not confirmed severity.</p>}
      </article>
      <article className="card gi-panel">
        <header className="gi-panel-heading"><div className="gi-heading-icon"><MessageSquareText size={19}/></div>
          <div><h3>Recurring feedback themes</h3><p>Keyword-based grouping inspired by TC Pulse's rules fallback</p></div>
        </header>
        {insights.themes.length===0?<p className="gi-empty">No themes for the selected reporting window.</p>:
          <div className="gi-theme-list">
            {insights.themes.map((t,i)=><div className="gi-theme" key={t.theme}>
              <span className="gi-rank">{String(i+1).padStart(2,'0')}</span>
              <div><div className="gi-row-between"><strong>{t.theme}</strong><span className="gi-count">{t.count}</span></div>
                <small>{t.category}</small>
                <p>“{t.example}”</p></div>
            </div>)}
          </div>}
        <p className="gi-footnote">Themes are grouped by deterministic keywords, not generated by AI. Examples are fictional descriptions.</p>
      </article>
    </div>
    <div className="gi-section-header" id="officer-workload">
      <div><p className="eyebrow">RESOURCE VISIBILITY</p><h2>Officer workload</h2>
        <p>Current open cases by assigned officer, including overdue cases and ageing.</p></div>
    </div>
    <div className="gi-workload-grid">
      {insights.workload.length===0?<div className="card gi-empty">No officers are available for this filter.</div>:
        insights.workload.map(group=><article className="card gi-panel gi-workload-card" key={group.councilId}>
          <header className="gi-panel-heading"><div className="gi-heading-icon"><UsersRound size={19}/></div>
            <div><h3>{group.council}</h3>
              <p>{group.officers.reduce((n,o)=>n+o.open,0)+group.unassigned.open} open · {group.unassigned.open} unassigned</p></div>
          </header>
          <div className="gi-age-key">
            <span><i className="gi-key-new"/>0–7 days</span>
            <span><i className="gi-key-aging"/>8–30 days</span>
            <span><i className="gi-key-old"/>31+ days</span>
          </div>
          <div className="gi-workload-list">
            {[...group.officers,group.unassigned].filter(o=>o.officer!=='Unassigned'||o.open>0).map(o=><div className="gi-workload-row" key={o.officer}>
              <div className="gi-row-between gi-workload-name">
                <strong>{o.officer}</strong>
                <span>{o.open} open {o.overdue?'· '+o.overdue+' overdue':''}</span>
              </div>
              <div className="gi-work-track" aria-label={o.officer+': '+o.open+' currently open cases'}>
                {o.open>0&&<div className="gi-stack" style={{width:String(o.open/peakLoad*100)+'%'}}>
                  <span className="gi-seg-new" style={{width:String(o.ages.recent/o.open*100)+'%'}}/>
                  <span className="gi-seg-aging" style={{width:String(o.ages.aging/o.open*100)+'%'}}/>
                  <span className="gi-seg-old" style={{width:String(o.ages.old/o.open*100)+'%'}}/>
                </div>}
              </div>
              {o.aboveAverage&&<small className="gi-caution">Higher than the council's average assigned open load</small>}
              {o.officer==='Unassigned'&&<small className="gi-caution">Needs an assigned officer</small>}
            </div>)}
          </div>
          <p className="gi-footnote">Relative load uses case counts only. It does not account for complexity, staffing hours or individual capacity.</p>
        </article>)}
    </div>
    <div className="gi-disclaimer">
      Repeat-case hotspots use the case database (fictional seed data). The other sections use fictional in-memory cases shared with the demo. Case changes are reflected when you reopen or refresh Insights, and reset on a browser reload. No real estate locations, personal information or EMS performance thresholds are used.
    </div>
  </section>;
}
