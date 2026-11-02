import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Building2, ClipboardList, MessageSquare, ShieldCheck } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COUNCILS, METRICS, riskRecords, getActions, series, operationsSnapshot, useStudioVersion } from './studio-data';
import './studio-pages.css';

export default function StudioDashboard(){
  useStudioVersion();
  const cases=operationsSnapshot();
  const risks=riskRecords().filter(r=>r.level!=='Healthy');
  const actions=getActions().filter(a=>a.status!=='Completed');
  const chart=series(COUNCILS[0].id,'response').map(point=>({month:point.month.slice(2),value:point.value}));
  return <section className="sp-page">
    <header className="page-header"><div>
      <p className="eyebrow">ESTARA · MANAGEMENT OVERVIEW</p>
      <h1>Performance at a glance</h1>
      <p className="subtext">Operational workload, synthetic performance trends and early-warning follow-ups in one place.</p>
    </div><span className="sp-tag">Full prototype · fictional data</span></header>
    <div className="sp-notice"><ShieldCheck size={17}/> Every statistic and location in this prototype is fictional. No live EMS connection, role enforcement or production alerting is enabled.</div>
    <div className="sp-stats-grid">
      {[
        {label:'Monitored demo councils',value:COUNCILS.length,icon:Building2,detail:'Synthetic districts'},
        {label:'Open feedback',value:cases.open,icon:MessageSquare,detail:'Fictional cases'},
        {label:'Hypothetical risk flags',value:risks.length,icon:AlertTriangle,detail:'Under illustrative rules'},
        {label:'Active corrective actions',value:actions.length,icon:ClipboardList,detail:'Planned or in progress'}
      ].map(row=><div className="card sp-stat" key={row.label}>
        <div className="sp-inline"><span>{row.label}</span><row.icon size={21}/></div>
        <strong>{row.value}</strong><small>{row.detail}</small>
      </div>)}
    </div>
    <div className="sp-columns">
      <article className="card sp-panel">
        <div className="sp-inline"><div><h2>Response-rate history</h2>
          <p>{COUNCILS[0].name} · synthetic monthly data</p></div>
          <Link className="sp-link" to="/analytics">Analytics <ArrowRight size={15}/></Link></div>
        <div className="sp-chart"><ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart}><CartesianGrid strokeDasharray="4 4" stroke="var(--ui-border)"/>
            <XAxis dataKey="month" tick={{fontSize:10}}/><YAxis domain={[75,100]} tick={{fontSize:11}}/>
            <Tooltip/><Area dataKey="value" name="Simulated rate" stroke="#0ea7ae" fill="#1daeb43b" strokeWidth={3}/>
          </AreaChart>
        </ResponsiveContainer></div>
      </article>
      <article className="card sp-panel">
        <div className="sp-inline"><h2>Warnings needing review</h2><Link className="sp-link" to="/alerts">All warnings <ArrowRight size={15}/></Link></div>
        <div className="sp-history-list">{risks.slice(0,6).map(r=><div className="sp-history-row" key={r.id}>
          <div><strong>{r.metric.name}</strong><small>{r.council} · {r.current}{r.metric.unit}</small></div>
          <span className={'sp-pill sp-'+r.level.toLowerCase()}>{r.level}</span>
        </div>)}
        {!risks.length&&<p>No threshold concerns in this fictional dataset.</p>}</div>
      </article>
    </div>
    <article className="card sp-panel"><div className="sp-inline"><h2>Key indicators</h2><Link className="sp-link" to="/analytics">Explore scores <ArrowRight size={15}/></Link></div>
      <div className="sp-mini-grid">{METRICS.map(metric=><div key={metric.id}>
        <span>{metric.name}</span><strong>{series(COUNCILS[0].id,metric.id).at(-1)?.value}{metric.unit}</strong>
      </div>)}</div>
    </article>
    <p className="sp-footnote">This dashboard is a coherent synthetic prototype. Real KPI definitions, official scores and forecast validity must be established with EM Services.</p>
  </section>;
}
