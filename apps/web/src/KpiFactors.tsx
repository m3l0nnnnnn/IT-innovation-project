import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart2, Lightbulb, LineChart, MapPin, Megaphone } from 'lucide-react';
import { getCaseMeta } from './cases-api';
import { fmt, fmtChange, getDefinitions, getFactors, type Factors } from './kpi-api';
import { AnalyticsTabs, AsOfBanner, AsOfInput, Footnote, Loading, PageHeader, useAnalyticsParams, useLoad } from './kpi-ui';

/** Why a KPI is where it is: the categories moving it, blocks with unusual backlogs, and big swings in complaint volume. */
export default function KpiFactors(){
  const {period,asOf,kpiId,townCouncilId,update}=useAnalyticsParams();
  const options=useLoad(async()=>{
    const [kpis,meta]=await Promise.all([getDefinitions(),getCaseMeta()]);
    return {kpis,councils:meta.councils};
  },[]);
  useEffect(()=>{
    if(!options.data)return;
    const changes:Record<string,string>={};
    if(!kpiId&&options.data.kpis[0])changes.kpiId=options.data.kpis[0].id;
    if(!townCouncilId&&options.data.councils[0])changes.townCouncilId=options.data.councils[0].id;
    if(Object.keys(changes).length)update(changes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[options.data,kpiId,townCouncilId]);
  const ready=!!kpiId&&!!townCouncilId;
  const {data,error,loading}=useLoad(()=>ready?getFactors(kpiId,townCouncilId,asOf||undefined):Promise.resolve(null),[kpiId,townCouncilId,asOf]);
  const qs=new URLSearchParams({kpiId,townCouncilId,period,...(asOf?{asOf}:{})}).toString();

  return <section className="sp-page ka-page">
    <PageHeader title="Contributing factors" description="What is behind a KPI result: which feedback categories are pulling it down, which blocks have unusually many outstanding cases, and where complaint volumes changed sharply."/>
    <AnalyticsTabs/>
    <div className="sp-toolbar card">
      <label>KPI<select value={kpiId} onChange={e=>update({kpiId:e.target.value})}>
        {options.data?.kpis.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}
      </select></label>
      <label>Town Council<select value={townCouncilId} onChange={e=>update({townCouncilId:e.target.value})}>
        {options.data?.councils.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <AsOfInput value={asOf} onChange={v=>update({asOf:v})}/>
      <Link className="sp-link ka-toolbar-link" to={'/analytics/trends?'+qs}><LineChart size={15}/> Trend & forecast <ArrowRight size={14}/></Link>
    </div>
    <AsOfBanner asOf={data?.asOf??null}/>
    <Loading error={options.error||error} loading={(loading||options.loading)&&!data} what="contributing factors"/>
    {data&&<>
      <article className="card sp-panel ka-summary">
        <h2><Lightbulb size={16}/> Possible reasons</h2>
        <ul>{data.summary.map(s=><li key={s}>{s}</li>)}</ul>
        <small>Patterns in the case data, to help decide where to look. They show association, not proven cause.</small>
      </article>
      <Contributions data={data}/>
      <div className="ka-two">
        <Blocks data={data}/>
        <Volumes data={data}/>
      </div>
    </>}
    <Footnote/>
  </section>;
}

function Contributions({data}:{data:Factors}){
  const c=data.contributions,unit=data.kpi.unit;
  const max=Math.max(0.01,...c.categories.map(x=>Math.abs(x.contribution)));
  const higher=data.kpi.direction==='higher';
  return <article className="card sp-panel">
    <h2><BarChart2 size={16}/> Effect of each category on {data.kpi.name.toLowerCase()}</h2>
    <p className="ka-sub">Last {data.windows.recentDays/7} weeks ({fmt(c.recentValue,unit)}) against the {data.windows.baselineDays/7} weeks before ({fmt(c.baselineValue,unit)}): a change of <strong>{fmtChange(c.change,unit)}</strong>.
      Each bar is the part of that change from one category, whether because the category got worse or because it became a bigger share of the cases. The bars add up to the total change.</p>
    {data.kpi.category&&<p className="ka-sub">This KPI only counts {data.kpi.category} cases, so there is a single category.</p>}
    <div className="ka-diverge" role="table" aria-label="Category contributions">
      <div className="ka-diverge-head" role="row"><span role="columnheader">Category</span><span role="columnheader" className="ka-axis-labels"><i>← made it worse</i><i>made it better →</i></span>
        <span role="columnheader">Effect</span><span role="columnheader">KPI in category</span><span role="columnheader">Cases</span></div>
      {c.categories.map(x=>{
        // Bars point left for "worse" whatever the KPI's direction, so the chart reads the same for every KPI.
        const better=x.effect==='better',width=Math.abs(x.contribution)/max*50;
        return <div className="ka-diverge-row" role="row" key={x.category}>
          <strong role="cell">{x.category}</strong>
          <span role="cell" className="ka-diverge-track" aria-hidden>
            <span className="ka-diverge-mid"/>
            {x.effect!=='neutral'&&<span className={'ka-diverge-bar '+(better?'better':'worse')}
              style={better?{left:'50%',width:width+'%'}:{right:'50%',width:width+'%'}}/>}
          </span>
          <span role="cell" className={'ka-effect ka-effect-'+x.effect}>{x.effect==='neutral'?'no real effect':`${fmtChange(x.contribution,unit)} · ${x.effect}`}</span>
          <span role="cell">{fmt(x.recentValue,unit)} <small>was {fmt(x.baselineValue,unit)}</small></span>
          <span role="cell">{x.recentCases} <small>was {x.baselineCases}</small></span>
        </div>;
      })}
    </div>
    <small className="ka-note">{higher?'Higher':'Lower'} is better for this KPI. "KPI in category" is blank when a category had too few cases to measure.</small>
  </article>;
}

function Blocks({data}:{data:Factors}){
  return <article className="card sp-panel">
    <h2><MapPin size={16}/> Outstanding cases by block</h2>
    <p className="ka-sub">Open cases now, against what each block's usual share of the council's cases would suggest. <strong>Unusual</strong> means that many would happen less than 1% of the time.</p>
    {data.blocks.length===0?<p className="ka-empty">No open cases.</p>:
      <div className="ka-matrix-wrap"><table className="ka-table">
        <thead><tr><th>Block</th><th>Open</th><th>Usual</th><th>Over 7 days</th><th>Main category</th><th>Oldest</th></tr></thead>
        <tbody>{data.blocks.map(b=><tr key={b.block} className={b.unusual?'ka-row-flag':''}>
          <td><Link to={'/cases?'+new URLSearchParams({townCouncilId:data.council.id,block:b.block,status:'Open'})}>Blk {b.block}</Link>
            {b.unusual&&<span className="badge warning ka-inline-badge">Unusual</span>}</td>
          <td><strong>{b.open}</strong></td><td>~{b.expected}</td><td>{b.overdue}</td><td>{b.topCategory}</td><td>{b.oldestDays} d</td>
        </tr>)}</tbody>
      </table></div>}
    <small className="ka-note">{data.unusualBlocks} unusual block{data.unusualBlocks===1?'':'s'}. Select a block to open its cases. See also <Link to={'/operations/hotspots?townCouncilId='+data.council.id}>repeat-case hotspots</Link>.</small>
  </article>;
}

function Volumes({data}:{data:Factors}){
  return <article className="card sp-panel">
    <h2><Megaphone size={16}/> Complaint volume changes</h2>
    <p className="ka-sub">Cases in the last {data.windows.recentDays/7} weeks against the usual level for 4 weeks, and the same 4 weeks last year where there is a year of data.</p>
    <div className="ka-matrix-wrap"><table className="ka-table">
      <thead><tr><th>Category</th><th>Last 4 wks</th><th>Usual</th><th>Change</th><th>Last year</th><th/></tr></thead>
      <tbody>{data.volumes.map(v=><tr key={v.category} className={v.category==='All categories'?'ka-row-total':v.change!=='normal'?'ka-row-flag':''}>
        <td>{v.category}</td><td><strong>{v.recent}</strong></td><td>~{v.expected}</td>
        <td>{v.ratio===null?'new':(v.ratio>=1?'+':'−')+Math.abs(Math.round((v.ratio-1)*100))+'%'}</td>
        <td>{v.lastYear??'—'}</td>
        <td>{v.change!=='normal'&&<span className={'badge '+(v.change==='increase'?'warning':'closed')}>{v.change==='increase'?'Sharp rise':'Sharp fall'}</span>}
          {v.seasonal&&<small className="ka-seasonal">likely seasonal</small>}</td>
      </tr>)}</tbody>
    </table></div>
    <small className="ka-note">Flagged when the count would be very unlikely (under 1%) at the usual rate and differs by at least 25%. "Likely seasonal" means last year had a similar level at this time.</small>
  </article>;
}
