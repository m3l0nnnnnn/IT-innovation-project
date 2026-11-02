import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BarChart3, Calculator, GitCompareArrows,
  LineChart as LineIcon, Rows3 } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COUNCILS, METRICS, series, forecast, riskRecords, useStudioVersion,
  type MetricId, type RiskLevel } from './studio-data';
import './studio-pages.css';

type Tab='grid'|'monthly'|'forecast'|'benchmark'|'whatif'|'outlook';
const tabs:{id:Tab;label:string;icon:typeof Rows3}[]=[
  {id:'grid',label:'KPI Grid',icon:Rows3},
  {id:'monthly',label:'Monthly Scores',icon:BarChart3},
  {id:'forecast',label:'Forecast',icon:LineIcon},
  {id:'benchmark',label:'Peer Benchmark',icon:GitCompareArrows},
  {id:'whatif',label:'What-If',icon:Calculator},
  {id:'outlook',label:'Risk Outlook',icon:AlertTriangle}
];
function display(value:number,unit:string){return value.toFixed(1)+unit;}
function RiskPill({level}:{level:RiskLevel}){return <span className={'sp-pill sp-'+level.toLowerCase()}>{level}</span>;}
export default function StudioAnalytics(){
  const studioVersion=useStudioVersion();
  const [tab,setTab]=useState<Tab>('grid');
  const [councilId,setCouncilId]=useState(COUNCILS[0].id);
  const [metricId,setMetricId]=useState<MetricId>('response');
  const [responseBoost,setResponseBoost]=useState(2);
  const [backlogReduction,setBacklogReduction]=useState(10);
  const [closureBoost,setClosureBoost]=useState(2);
  const metric=METRICS.find(m=>m.id===metricId)!;
  const points=useMemo(()=>series(councilId,metricId),[councilId,metricId]);
  const latest=points.at(-1)?.value??0;
  const projected=forecast(points,metric,2);
  const rows=useMemo(()=>METRICS.map(m=>{
    const data=series(councilId,m.id);
    return {metric:m,current:data.at(-1)?.value??0,prior:data.at(-2)?.value??0,
      projected:forecast(data,m,2),
      risk:riskRecords(councilId).find(r=>r.metric.id===m.id)};
  }),[councilId,studioVersion]);
  const peer=COUNCILS.map(c=>{
    const values=series(c.id,metricId);
    return {council:c.name,latest:values.at(-1)?.value??0,change:(values.at(-1)?.value??0)-(values.at(-4)?.value??0)};
  }).sort((a,b)=>metric.higherBetter?b.latest-a.latest:a.latest-b.latest);
  const outlook=riskRecords(councilId);
  // Explicitly hypothetical illustrative weighting; this is NOT the official scoring formula.
  const hypothetical=useMemo(()=>{
    const management=series(councilId,'management').at(-1)?.value??0;
    const simulatedChange=responseBoost*0.3+closureBoost*0.35+backlogReduction*0.015;
    return {baseline:management,result:Math.min(100,Math.round((management+simulatedChange)*10)/10),change:simulatedChange};
  },[councilId,responseBoost,closureBoost,backlogReduction]);
  const chart=points.map((p,i)=>({
    month:p.month.slice(2),score:p.value,target:metric.threshold,
    projected:i===points.length-1?p.value:undefined
  }));
  const forecastChart=[
    ...chart,
    ...Array.from({length:3},(_,i)=>{
      const base=points.at(-1)?.month??'2026-11';
      const [year,month]=base.split('-').map(Number);
      const date=new Date(Date.UTC(year,month+i,1)).toISOString().slice(2,7);
      return {month:date,score:undefined as number|undefined,target:metric.threshold,
        projected:forecast(points,metric,i+1)};
    })
  ];
  return <section className="sp-page">
    <header className="page-header"><div>
      <p className="eyebrow">PERFORMANCE ANALYTICS · JOEL</p><h1>Performance analytics</h1>
      <p className="subtext">Explore simulated KPI measurements, detect trends and compare possible future outcomes.</p>
    </div></header>
    <div className="sp-notice"><AlertTriangle size={17}/>
      All scores and thresholds are synthetic. Forecasts use a simple six-month linear trend; no EMS-approved scoring model is connected.
    </div>
    <div className="sp-toolbar card">
      <label>Town Council<select value={councilId} onChange={e=>setCouncilId(e.target.value)}>
        {COUNCILS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      {tab!=='grid'&&tab!=='outlook'&&<label>Indicator<select value={metricId} onChange={e=>setMetricId(e.target.value as MetricId)}>
        {METRICS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label>}
      <span className="sp-tag">18 months · demo records</span>
    </div>
    <div className="sp-tabs" role="tablist" aria-label="Analytics views">
      {tabs.map(t=><button type="button" role="tab" key={t.id} aria-selected={t.id===tab}
        className={t.id===tab?'active':''} onClick={()=>setTab(t.id)}><t.icon size={16}/>{t.label}</button>)}
    </div>
    {tab==='grid'&&<div className="sp-kpi-grid">
      {rows.map(r=><button type="button" className="card sp-kpi" key={r.metric.id} onClick={()=>{setMetricId(r.metric.id);setTab('monthly')}}>
        <div className="sp-inline"><strong>{r.metric.name}</strong><RiskPill level={r.risk?.level??'Healthy'}/></div>
        <div className="sp-large">{display(r.current,r.metric.unit)}</div>
        <p>Target: {r.metric.higherBetter?'≥':'≤'} {r.metric.threshold}{r.metric.unit}</p>
        <small>{r.metric.note}</small>
        <div className="sp-inline sp-kpi-foot"><span>{r.current-r.prior>=0?'+':''}{(r.current-r.prior).toFixed(1)} vs last month</span><ArrowRight size={17}/></div>
      </button>)}
    </div>}
    {(tab==='monthly'||tab==='forecast')&&<div className="sp-columns">
      <article className="card sp-panel">
        <h2>{tab==='monthly'?'Monthly measurements':'Short-term trend projection'}</h2>
        <p>{metric.name} · {COUNCILS.find(c=>c.id===councilId)?.name}</p>
        <div className="sp-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={tab==='monthly'?chart:forecastChart} margin={{top:15,right:18,left:-15,bottom:2}}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--ui-border)"/>
            <XAxis dataKey="month" tick={{fontSize:10}}/>
            <YAxis tick={{fontSize:11}} domain={['dataMin - 5','dataMax + 5']}/>
            <Tooltip/><Legend/>
            <Line dataKey="score" name="Historical (simulated)" stroke="#119ca8" strokeWidth={3} dot={{r:2}} connectNulls={false}/>
            <Line dataKey="target" name="Illustrative target" stroke="#d2a552" strokeDasharray="5 5" dot={false}/>
            {tab==='forecast'&&<Line dataKey="projected" name="Forecast (estimated)" stroke="#9c75cf" strokeDasharray="4 3" strokeWidth={2} dot={{r:3}}/>}
          </LineChart>
        </ResponsiveContainer></div>
      </article>
      <article className="card sp-panel sp-side-panel">
        <h2>{tab==='monthly'?'Latest month':'Two-month forecast'}</h2>
        <div className="sp-large">{display(tab==='monthly'?latest:projected,metric.unit)}</div>
        <p>{tab==='monthly'?'Historical demo record':'Estimated only — not a confirmed score'}</p>
        <div className="sp-detail-list">
          <div><span>Target</span><strong>{metric.threshold}{metric.unit}</strong></div>
          <div><span>Six-month monthly slope</span><strong>{(projected-latest>=0?'+':'')+((projected-latest)/2).toFixed(2)} approx.</strong></div>
          <div><span>Better direction</span><strong>{metric.higherBetter?'Higher':'Lower'}</strong></div>
        </div>
        <Link className="sp-link" to="/alerts">Review early warnings <ArrowRight size={16}/></Link>
      </article>
    </div>}
    {tab==='benchmark'&&<article className="card sp-panel">
      <h2>Peer comparison · {metric.name}</h2><p>Fictional council ordering only; not a published performance ranking.</p>
      <div className="sp-benchmark">
        {peer.map((c,i)=><div className="sp-benchmark-row" key={c.council}>
          <span className="sp-rank">{i+1}</span><strong>{c.council}</strong>
          <div className="sp-track"><div style={{width:String(Math.min(100,c.latest/(metric.id==='backlog'?30:100)*100))+'%'}}/></div>
          <span>{display(c.latest,metric.unit)}</span>
          <small>{c.change>=0?'+':''}{c.change.toFixed(1)} (3 months)</small>
        </div>)}
      </div>
    </article>}
    {tab==='whatif'&&<div className="sp-columns">
      <article className="card sp-panel">
        <h2>What-if simulation</h2>
        <p>Move the sliders to see an illustrative effect on the synthetic management score.</p>
        {[
          {title:'Acknowledgement-rate improvement',value:responseBoost,set:setResponseBoost,max:10,unit:' percentage points'},
          {title:'Closure-rate improvement',value:closureBoost,set:setClosureBoost,max:10,unit:' percentage points'},
          {title:'Backlog reduction',value:backlogReduction,set:setBacklogReduction,max:50,unit:'%'}
        ].map(f=><label className="sp-slider" key={f.title}>
          <span>{f.title}<strong>+{f.value}{f.unit}</strong></span>
          <input type="range" min={0} max={f.max} step={1} value={f.value} onChange={e=>f.set(Number(e.target.value))}/>
        </label>)}
      </article>
      <article className="card sp-panel">
        <h2>Hypothetical score impact</h2>
        <div className="sp-number-pair"><div><span>Current simulated score</span><strong>{hypothetical.baseline.toFixed(1)}</strong></div>
          <ArrowRight size={22}/><div><span>Scenario output</span><strong>{hypothetical.result.toFixed(1)}</strong></div></div>
        <p><strong>Assumed contribution:</strong> 0.30 per acknowledgement point + 0.35 per closure point + 0.015 per percentage-point backlog reduction.</p>
        <div className="sp-notice sp-inline-notice"><Calculator size={16}/> This demonstration formula is invented for interface testing and must never be presented as an official EMS scoring formula.</div>
      </article>
    </div>}
    {tab==='outlook'&&<article className="card sp-panel">
      <div className="sp-inline"><div><h2>Projected risk outlook</h2><p>Latest readings and forecast-driven risks in the selected council.</p></div>
        <Link className="sp-link" to="/alerts">Open alert workspace <ArrowRight size={15}/></Link>
      </div>
      <div className="sp-risk-list">
        {outlook.map(r=><div className="sp-risk-row" key={r.id}>
          <div><strong>{r.metric.name}</strong><small>{r.reason}</small></div>
          <span>{r.current}{r.metric.unit}</span><span>{r.forecast}{r.metric.unit} est.</span><RiskPill level={r.level}/>
        </div>)}
      </div>
    </article>}
    <p className="sp-footnote">Prototype only. Actual performance standards, data definitions, forecast reliability and benchmarks require validation with EM Services.</p>
  </section>;
}
