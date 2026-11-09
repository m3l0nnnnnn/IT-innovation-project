import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, ArrowRight, Hourglass, TrendingDown } from 'lucide-react';
import { fmt, fmtChange, fmtDays, getOverview, periodLabel, periodName, type OverviewResult } from './kpi-api';
import { AnalyticsTabs, AsOfBanner, AsOfInput, Footnote, Loading, PageHeader, PeriodToggle, Sparkline, StatusPill, TrendTag,
  forecastText, useAnalyticsParams, useLoad } from './kpi-ui';

/** KPI results for every Town Council at a glance, with the forecasts most likely to need action. */
export default function KpiOverview(){
  const {period,asOf,update}=useAnalyticsParams();
  const {data,error,loading}=useLoad(()=>getOverview(period,asOf||undefined),[period,asOf]);
  const results=data?.results??[];
  const kpiById=new Map(data?.kpis.map(k=>[k.id,k])??[]);
  const councilById=new Map(data?.councils.map(c=>[c.id,c])??[]);
  const cell=(kpiId:string,councilId:string)=>results.find(r=>r.kpiId===kpiId&&r.townCouncilId===councilId);
  const link=(r:OverviewResult,page='trends')=>`/analytics/${page}?`+new URLSearchParams({kpiId:r.kpiId,townCouncilId:r.townCouncilId,period,...(asOf?{asOf}:{})});

  const soon=(r:OverviewResult)=>r.forecast.status==='deteriorating'&&!r.forecast.beyondHorizon&&r.forecast.daysToTarget!==null;
  const watchlist=results.filter(soon).sort((a,b)=>a.forecast.daysToTarget!-b.forecast.daysToTarget!);
  const counts={
    breached:results.filter(r=>r.status==='Breached').length,
    atRisk:results.filter(r=>r.status==='At risk').length,
    soon:results.filter(r=>soon(r)&&r.forecast.daysToTarget!<=28).length,
    declining:results.filter(r=>r.trend.label==='declining').length
  };

  return <section className="sp-page ka-page">
    <PageHeader title="KPI overview" description="Every monitored KPI for every Town Council: the latest result against its target, the recent trend, and how long until a declining KPI is likely to breach."/>
    <AnalyticsTabs/>
    <div className="sp-toolbar card">
      <label>Reporting period<PeriodToggle value={period} onChange={p=>update({period:p})}/></label>
      <AsOfInput value={asOf} onChange={v=>update({asOf:v})}/>
      {data&&<span className="sp-tag">{data.kpis.length} KPIs · {data.councils.length} Town Councils · trend over last {period==='week'?12:6} {periodName(period,true)}</span>}
    </div>
    <AsOfBanner asOf={data?.asOf??null}/>
    <Loading error={error} loading={loading&&!data} what="KPI results"/>
    {data&&<>
      <div className="sp-stats-grid">
        {[
          {label:'Breached',value:counts.breached,detail:'Worse than target in the latest complete '+periodName(period),icon:AlertOctagon},
          {label:'At risk',value:counts.atRisk,detail:'Past the warning line, not yet the target',icon:AlertTriangle},
          {label:'Forecast to breach soon',value:counts.soon,detail:'Estimated within 4 weeks at the current trend',icon:Hourglass},
          {label:'Declining trends',value:counts.declining,detail:'Clearly worsening over recent '+periodName(period,true),icon:TrendingDown}
        ].map(s=><article key={s.label} className="card sp-stat">
          <div className="sp-inline"><span>{s.label}</span><s.icon size={19}/></div>
          <strong>{s.value}</strong><small>{s.detail}</small>
        </article>)}
      </div>

      <article className="card sp-panel">
        <div className="sp-inline"><div><h2>Days-to-fail watchlist</h2>
          <p className="ka-sub">KPIs still within target but heading towards it, soonest first. Estimates from the recent trend, with a likely range.</p></div></div>
        {watchlist.length===0?<p className="ka-empty">No KPI is forecast to breach its target in the next 6 months.</p>:
          <div className="ka-watchlist">{watchlist.map(r=>{
            const k=kpiById.get(r.kpiId)!,f=r.forecast;
            return <Link key={r.kpiId+r.townCouncilId} to={link(r)} className="ka-watch-row">
              <div className="ka-watch-days"><strong>{fmtDays(f.daysToTarget!)}</strong>
                <small>{f.range&&f.range.earliest!==null?`likely ${fmtDays(f.range.earliest)} – ${f.range.latest===null?'no breach':fmtDays(f.range.latest)}`:''}</small></div>
              <div className="ka-watch-main"><strong>{k.name}</strong><span>{councilById.get(r.townCouncilId)?.name}</span>
                <small>{r.explanation}</small></div>
              <div className="ka-watch-meta"><StatusPill status={r.status}/><span className={'ka-confidence ka-conf-'+f.confidence}>{f.confidence} confidence</span></div>
              <ArrowRight size={16} className="ka-chev"/>
            </Link>;
          })}</div>}
      </article>

      <article className="card sp-panel">
        <h2>KPI results by Town Council</h2>
        <p className="ka-sub">Latest complete {periodName(period)}{results[0]?.latest?` (${period==='week'?'w/c ':''}${periodLabel(results[0].latest.label,period)})`:''}. The line shows the last 12 {periodName(period,true)} against the target (dashed). Select a cell for its trend and forecast.</p>
        <div className="ka-matrix-wrap">
          <table className="ka-matrix">
            <thead><tr><th scope="col">KPI</th>{data.councils.map(c=><th scope="col" key={c.id}>{c.name.replace(' (demo)','')}</th>)}</tr></thead>
            <tbody>{data.kpis.map(k=><tr key={k.id}>
              <th scope="row"><strong>{k.name}</strong><small>Target {k.direction==='higher'?'≥':'≤'} {fmt(k.target,k.unit)}{k.unit==='cases'?' cases':''} · warn at {fmt(k.warning,k.unit)}</small></th>
              {data.councils.map(c=>{
                const r=cell(k.id,c.id);
                if(!r)return <td key={c.id}/>;
                const fc=forecastText(r.forecast);
                return <td key={c.id}><Link to={link(r)} className={'ka-cell ka-cell-'+r.status.replace(' ','-').toLowerCase()}
                  title={r.explanation}>
                  <div className="ka-cell-top"><b>{fmt(r.latest?.value,k.unit)}</b><StatusPill status={r.status}/></div>
                  <Sparkline values={r.sparkline.map(p=>p.value)} target={r.thresholds.target} lowerBetter={k.direction==='lower'}/>
                  <div className="ka-cell-foot"><TrendTag label={r.trend.label}/><span>{fmtChange(r.changeVsPrevious,k.unit)} vs prev.</span></div>
                  {fc&&r.status!=='Breached'&&<small className="ka-cell-fc"><Hourglass size={11} aria-hidden/>{fc}</small>}
                  {r.thresholds.overridden&&<small className="ka-cell-note">Council-specific target {fmt(r.thresholds.target,k.unit)}</small>}
                </Link></td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </article>
      <Footnote/>
    </>}
  </section>;
}
