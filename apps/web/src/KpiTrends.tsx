import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, History, Hourglass, Search } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getCaseMeta } from './cases-api';
import { fmt, fmtChange, fmtDays, getDefinitions, getSeries, periodLabel, periodName, type SeriesResult, type Unit } from './kpi-api';
import { AnalyticsTabs, AsOfBanner, AsOfInput, Footnote, Loading, PageHeader, PeriodToggle, StatusPill, TrendTag,
  useAnalyticsParams, useLoad } from './kpi-ui';

type Row={label:string;actual?:number|null;partial?:number|null;projection?:number;band?:[number,number];significant?:number;sample?:number;pending?:number};

function chartRows(d:SeriesResult):Row[]{
  const sig=new Set(d.analysis.significantChanges.map(s=>s.label));
  const rows:Row[]=d.series.map(p=>({
    label:p.label,
    actual:p.partial?undefined:p.value,
    partial:p.partial?p.value:undefined,
    significant:sig.has(p.label)&&p.value!==null?p.value:undefined,
    sample:p.sample,pending:p.pending
  }));
  for(const p of d.analysis.forecast.projection??[]){
    let row=rows.find(r=>r.label===p.label);
    if(!row){row={label:p.label};rows.push(row);}
    row.projection=p.value;row.band=[p.low,p.high];
  }
  // The partial period sits on the actual line too, so the line runs up to "this week so far".
  const partial=rows.find(r=>r.partial!==undefined&&r.partial!==null);
  if(partial)partial.actual=partial.partial;
  return rows;
}

function domain(rows:Row[],d:SeriesResult):[number,number]{
  const vals=[d.thresholds.target,d.thresholds.warning];
  for(const r of rows)for(const v of [r.actual,r.partial,r.projection,...(r.band??[])])if(typeof v==='number')vals.push(v);
  let lo=Math.min(...vals),hi=Math.max(...vals);
  const pad=(hi-lo)*0.08||1;
  lo-=pad;hi+=pad;
  if(d.kpi.unit==='%'){lo=Math.max(0,lo);hi=Math.min(100,hi);}
  else lo=Math.max(0,lo);
  return [Math.floor(lo),Math.ceil(hi)];
}

function ChartTooltip({active,payload,label,unit,period}:{active?:boolean;payload?:{payload:Row}[];label?:string;unit:Unit;period:SeriesResult['period']}){
  if(!active||!payload?.length)return null;
  const r=payload[0].payload;
  return <div className="ka-tooltip">
    <strong>{period==='week'?'Week of ':''}{periodLabel(String(label),period)}</strong>
    {r.partial!==undefined&&r.partial!==null&&<span>So far: <b>{fmt(r.partial,unit)}</b> (period not finished)</span>}
    {r.partial===undefined&&typeof r.actual==='number'&&<span>Actual: <b>{fmt(r.actual,unit)}</b></span>}
    {r.actual===null&&<span>Too few cases to calculate</span>}
    {typeof r.projection==='number'&&<span>Trend estimate: <b>{fmt(r.projection,unit)}</b>{r.band&&` (likely ${fmt(r.band[0],unit)}–${fmt(r.band[1],unit)})`}</span>}
    {r.sample!==undefined&&unit!=='cases'&&<span className="ka-tooltip-muted">{r.sample} cases measured{r.pending?` · ${r.pending} still inside the time limit`:''}</span>}
    {typeof r.significant==='number'&&<span className="ka-tooltip-flag">Significant change</span>}
  </div>;
}

export default function KpiTrends(){
  const {period,asOf,kpiId,townCouncilId,update}=useAnalyticsParams();
  const options=useLoad(async()=>{
    const [kpis,meta]=await Promise.all([getDefinitions(),getCaseMeta()]);
    return {kpis,councils:meta.councils};
  },[]);
  // Pick the first KPI and council when the link did not name one.
  useEffect(()=>{
    if(!options.data)return;
    const changes:Record<string,string>={};
    if(!kpiId&&options.data.kpis[0])changes.kpiId=options.data.kpis[0].id;
    if(!townCouncilId&&options.data.councils[0])changes.townCouncilId=options.data.councils[0].id;
    if(Object.keys(changes).length)update(changes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[options.data,kpiId,townCouncilId]);
  const ready=!!kpiId&&!!townCouncilId;
  const {data,error,loading}=useLoad(()=>ready?getSeries(kpiId,townCouncilId,period,asOf||undefined):Promise.resolve(null),[kpiId,townCouncilId,period,asOf]);

  const rows=data?chartRows(data):[];
  const a=data?.analysis,f=a?.forecast,unit=data?.kpi.unit??'%';
  const p=periodName(period),ps=periodName(period,true);
  const qs=new URLSearchParams({kpiId,townCouncilId,period,...(asOf?{asOf}:{})}).toString();

  return <section className="sp-page ka-page">
    <PageHeader title="Trends & forecast" description="How a KPI has moved over time for one Town Council, whether it is improving or declining, and when it may fall below its target if the trend continues."/>
    <AnalyticsTabs/>
    <div className="sp-toolbar card">
      <label>KPI<select value={kpiId} onChange={e=>update({kpiId:e.target.value})}>
        {options.data?.kpis.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}
      </select></label>
      <label>Town Council<select value={townCouncilId} onChange={e=>update({townCouncilId:e.target.value})}>
        {options.data?.councils.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label>Reporting period<PeriodToggle value={period} onChange={v=>update({period:v})}/></label>
      <AsOfInput value={asOf} onChange={v=>update({asOf:v})}/>
    </div>
    <AsOfBanner asOf={data?.asOf??null}/>
    <Loading error={options.error||error} loading={(loading||options.loading)&&!data} what="the KPI trend"/>
    {data&&a&&f&&<>
      <div className="sp-columns">
        <article className="card sp-panel">
          <div className="sp-inline"><div><h2>{data.kpi.name}</h2>
            <p className="ka-sub">{data.council.name} · {data.kpi.explain}</p></div><StatusPill status={a.status}/></div>
          <div className="sp-chart ka-chart" role="img" aria-label={data.explanation}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{top:16,right:70,left:0,bottom:4}}>
                <CartesianGrid strokeDasharray="3 4" stroke="var(--ka-grid)" vertical={false}/>
                <XAxis dataKey="label" tickFormatter={v=>periodLabel(String(v),period)} tick={{fontSize:10,fill:'var(--ka-axis)'}}
                  tickLine={false} axisLine={{stroke:'var(--ka-grid)'}} minTickGap={18}/>
                <YAxis domain={domain(rows,data)} tick={{fontSize:10,fill:'var(--ka-axis)'}} tickLine={false} axisLine={false} width={40}
                  tickFormatter={v=>unit==='%'?v+'%':String(v)}/>
                <Tooltip content={<ChartTooltip unit={unit} period={period}/>} cursor={{stroke:'var(--ka-axis)',strokeDasharray:'2 3'}}/>
                <Legend wrapperStyle={{fontSize:11,color:'var(--ka-ink-2)'}} iconType="plainline"/>
                <Area dataKey="band" name="Likely range" fill="var(--ka-proj)" fillOpacity={0.14} stroke="none" isAnimationActive={false} legendType="square"/>
                <ReferenceLine y={data.thresholds.target} stroke="var(--ka-target)" strokeDasharray="6 4" strokeWidth={1.5}
                  label={{value:'Target '+fmt(data.thresholds.target,unit),position:'right',fontSize:10,fill:'var(--ka-ink-2)'}}/>
                {data.thresholds.warning!==data.thresholds.target&&<ReferenceLine y={data.thresholds.warning} stroke="var(--ka-axis)" strokeDasharray="2 4"
                  label={{value:'Warning '+fmt(data.thresholds.warning,unit),position:'right',fontSize:10,fill:'var(--ka-ink-3)'}}/>}
                <Line dataKey="actual" name="Actual" stroke="var(--ka-actual)" strokeWidth={2} dot={false} activeDot={{r:5,strokeWidth:2,stroke:'var(--ka-surface)'}} connectNulls={false} isAnimationActive={false}/>
                <Line dataKey="partial" name={`This ${p} so far`} stroke="var(--ka-actual)" strokeWidth={0} dot={{r:4,fill:'var(--ka-surface)',stroke:'var(--ka-actual)',strokeWidth:2}} isAnimationActive={false} legendType="circle"/>
                <Line dataKey="projection" name="Trend estimate" stroke="var(--ka-proj)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false}/>
                <Line dataKey="significant" name="Significant change" stroke="var(--ka-flag)" strokeWidth={0} dot={{r:5,fill:'var(--ka-flag)',stroke:'var(--ka-surface)',strokeWidth:2}} isAnimationActive={false} legendType="circle"/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <details className="ka-table-toggle"><summary>Show the numbers as a table</summary>
            <table className="ka-table"><thead><tr><th>{period==='week'?'Week of':'Month'}</th><th>Value</th><th>Cases measured</th><th>Note</th></tr></thead>
              <tbody>{data.series.map(s=><tr key={s.label}><td>{periodLabel(s.label,period)}</td><td>{fmt(s.value,unit)}</td><td>{s.sample}</td>
                <td>{s.partial?'Not finished':''}{s.value===null&&!s.partial?'Too few cases':''}{a.significantChanges.some(c=>c.label===s.label)?'Significant change':''}</td></tr>)}</tbody>
            </table>
          </details>
        </article>

        <article className="card sp-panel ka-side">
          <h2>Latest complete {p}</h2>
          <div className="sp-large">{fmt(a.latest?.value,unit)}</div>
          <p className="ka-sub">{a.latest?`${period==='week'?'Week of ':''}${periodLabel(a.latest.label,period)} · ${a.latest.sample} cases`:'Not enough cases'}</p>
          <div className="sp-detail-list">
            <div><span>Target / warning line</span><strong>{data.kpi.direction==='higher'?'≥':'≤'} {fmt(data.thresholds.target,unit)} / {fmt(data.thresholds.warning,unit)}{data.thresholds.overridden?' (council-specific)':''}</strong></div>
            <div><span>Change vs previous {p}</span><strong>{fmtChange(a.changeVsPrevious,unit)}</strong></div>
            <div><span>Vs earlier average</span><strong>{fmtChange(a.changeVsHistory,unit)}{a.historicalAverage!==null?` (avg ${fmt(a.historicalAverage,unit)})`:''}</strong></div>
            <div><span>Trend, last {a.trend.periods} {ps}</span><strong><TrendTag label={a.trend.label}/> {fmtChange(a.trend.changeOverWindow,unit)}</strong></div>
            <div><span>Worse than the {p} before</span><strong>{a.trend.worseCount} of {a.trend.changes} {ps}{a.trend.worseStreak>1?` · ${a.trend.worseStreak} in a row`:''}</strong></div>
          </div>
          <div className={'ka-forecast ka-forecast-'+f.status.replace(' ','-')}>
            <div className="sp-inline"><h3><Hourglass size={15}/> Days-to-fail estimate</h3>{f.confidence&&<span className={'ka-confidence ka-conf-'+f.confidence}>{f.confidence} confidence</span>}</div>
            {f.status==='breached'&&<p><strong>Already worse than target.</strong> The early-warning module treats this as a breach.</p>}
            {f.status==='deteriorating'&&f.daysToTarget!==null&&(f.beyondHorizon
              ?<p>Declining slowly: <strong>no breach expected within 6 months</strong> at this rate.</p>
              :<><p className="ka-forecast-big">{fmtDays(f.daysToTarget)}</p>
                <p>until it may fall below target{f.range&&f.range.earliest!==null?<> · likely <strong>{fmtDays(f.range.earliest)}</strong> to <strong>{f.range.latest===null?'no breach':fmtDays(f.range.latest)}</strong></>:null}.
                {f.daysToWarning!==null&&<> {f.daysToWarning===0?'Already past the warning line.':`Warning line in ${fmtDays(f.daysToWarning)}.`}</>}</p></>)}
            {f.status==='not deteriorating'&&<p>Not heading towards the target, so no breach is forecast.</p>}
            {f.status==='insufficient data'&&<p>Not enough complete {ps} with data to estimate a trend.</p>}
          </div>
          <p className="ka-explain">{data.explanation}</p>
          <div className="ka-links">
            <Link className="sp-link" to={'/analytics/factors?'+qs}><Search size={15}/> Why? Contributing factors <ArrowRight size={14}/></Link>
            <Link className="sp-link" to="/alerts"><BellRing size={15}/> Early warnings <ArrowRight size={14}/></Link>
          </div>
        </article>
      </div>

      {a.significantChanges.length>0&&<article className="card sp-panel">
        <h2>Significant changes</h2>
        <p className="ka-sub">{ps[0].toUpperCase()+ps.slice(1)} that differed sharply from the {Math.min(8,data.series.length)} before them (at least 2.5 times their usual spread).</p>
        <div className="ka-chips">{a.significantChanges.slice().reverse().map(c=><span key={c.label} className={'ka-change ka-change-'+c.direction}>
          <b>{periodLabel(c.label,period)}</b> {fmt(c.value,unit)} <small>vs usual {fmt(c.expected,unit)} · {c.direction}</small></span>)}</div>
      </article>}

      <Backtest data={data}/>
    </>}
    <Footnote/>
  </section>;
}

/** What the forecast said in earlier weeks, and how early it would have warned before a real breach. */
function Backtest({data}:{data:SeriesResult}){
  const b=data.backtest,unit=data.kpi.unit,period=data.period;
  const day=(iso:string)=>new Date(iso).toLocaleDateString('en-SG',{day:'numeric',month:'short'});
  let summary:string;
  if(b.breachedAt&&b.leadDays!==null){
    summary=`The KPI breached its target around ${day(b.breachedAt)}. The forecast first warned on ${day(b.firstWarningAt!)}, ${fmtDays(b.leadDays)} earlier`+
      (b.errorDays!==null?`; that first estimate was ${Math.abs(b.errorDays)<4?'about right':`${fmtDays(Math.abs(b.errorDays))} too ${b.errorDays>0?'early':'late'}`}.`:'.');
  }else if(b.breachedAt)summary=`The KPI breached its target around ${day(b.breachedAt)} without a medium- or high-confidence warning beforehand: the decline was too sudden for the trend to show it.`;
  else summary=`No sustained breach in the last ${b.points.length} ${periodName(period,true)}.`+(b.points.some(p=>p.predictedBreachAt)?' Some forecasts expected one, so treat past warnings with care.':'');
  return <article className="card sp-panel">
    <div className="sp-inline"><div><h2><History size={16}/> Forecast track record</h2>
      <p className="ka-sub">The forecast re-run at the end of each past {periodName(period)}, using only the data known at the time. {summary}</p></div></div>
    <div className="ka-matrix-wrap"><table className="ka-table">
      <thead><tr><th>As of</th><th>Value then</th><th>Status then</th><th>Forecast said</th><th>Confidence</th></tr></thead>
      <tbody>{b.points.slice().reverse().map(p=><tr key={p.asOf} className={p.asOf===b.breachedAt?'ka-row-breach':p.asOf===b.firstWarningAt?'ka-row-warn':''}>
        <td>{day(p.asOf)}</td><td>{fmt(p.value,unit)}</td><td><StatusPill status={p.status}/></td>
        <td>{p.forecast==='breached'?'Already past target':p.daysToTarget!==null?`Breach in ${fmtDays(p.daysToTarget)} (≈ ${day(p.predictedBreachAt!)})`:p.forecast==='deteriorating'?'Declining, no breach within 6 months':p.forecast==='insufficient data'?'Too little data':'No breach expected'}</td>
        <td>{p.confidence??'—'}</td></tr>)}</tbody>
    </table></div>
  </article>;
}
