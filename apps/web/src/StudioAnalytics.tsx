import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BarChart3, Calculator, CheckCircle2, Download,
  GitCompareArrows, LineChart as LineIcon, Plus, Rows3, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COUNCILS, METRICS, addAction, forecast, getActions, riskRecords, series,
  useStudioVersion, type DemoMetric, type MetricId, type RiskLevel } from './studio-data';
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

/* Shared helpers for the Monthly Scores / Peer Benchmark / Risk Outlook views. */
const HEAT_BUFFER=3; // points around the illustrative target that count as "Warning"
type HeatStatus='healthy'|'warning'|'critical';
const HEAT_LABEL:Record<HeatStatus,string>={healthy:'Healthy',warning:'Warning',critical:'Critical'};
function heatStatus(value:number,metric:DemoMetric):HeatStatus{
  if(metric.higherBetter){
    if(value>=metric.threshold)return 'healthy';
    return value>=metric.threshold-HEAT_BUFFER?'warning':'critical';
  }
  if(value<=metric.threshold)return 'healthy';
  return value<=metric.threshold+HEAT_BUFFER?'warning':'critical';
}
function addMonths(month:string,delta:number){
  const [y,m]=month.split('-').map(Number);
  return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);
}
function monthLabel(month:string,style:'short'|'long'){
  return new Date(month+'-01T00:00:00Z').toLocaleDateString('en-SG',{month:style,year:'numeric',timeZone:'UTC'});
}
function ordinal(n:number){return n===1?'1st':n===2?'2nd':n===3?'3rd':n+'th';}
function signed(v:number){return (v>=0?'+':'')+v.toFixed(1);}
type Band='Low'|'Medium'|'High';
const BAND_IDX:Record<Band,number>={Low:0,Medium:1,High:2};
// Fixed business impact per KPI for the demo risk matrix.
const IMPACT:Record<MetricId,Band>={response:'Low',resolution:'Medium',closure:'Medium',backlog:'High',management:'High'};
const SHORT_NAME:Record<MetricId,string>={response:'Ack rate',resolution:'Timeliness',closure:'Closure',backlog:'Backlog',management:'Mgmt score'};
const TAB_NOTE='Illustrative model only, not an EMS-approved assessment.';

export default function StudioAnalytics(){
  const studioVersion=useStudioVersion();
  const [tab,setTab]=useState<Tab>('grid');
  const [councilId,setCouncilId]=useState(COUNCILS[0].id);
  const [metricId,setMetricId]=useState<MetricId>('response');
  const [responseBoost,setResponseBoost]=useState(2);
  const [backlogReduction,setBacklogReduction]=useState(10);
  const [closureBoost,setClosureBoost]=useState(2);
  // Monthly Scores
  const [msPeriod,setMsPeriod]=useState<6|12|18>(12);
  const [msPop,setMsPop]=useState<{metricId:MetricId;index:number;left:number;top:number}|null>(null);
  const msPanelRef=useRef<HTMLElement|null>(null);
  // Peer Benchmark
  const [bmMetricId,setBmMetricId]=useState<MetricId>('management');
  // Risk Outlook
  const [roHorizon,setRoHorizon]=useState<1|2|3>(3);
  const [roSelected,setRoSelected]=useState<MetricId|null>(null);
  // Shared feedback + corrective-action drawer
  const [toast,setToast]=useState('');
  const [afOpen,setAfOpen]=useState(false);
  const [af,setAf]=useState({title:'',owner:'',councilId:'',alertId:'',
    due:'',priority:'Medium' as 'Low'|'Medium'|'High',notes:''});
  const [afError,setAfError]=useState('');
  useEffect(()=>{if(!toast)return;const t=window.setTimeout(()=>setToast(''),3500);return ()=>window.clearTimeout(t);},[toast]);
  useEffect(()=>{setMsPop(null);},[councilId,msPeriod,tab]);
  useEffect(()=>{setRoSelected(null);},[councilId,roHorizon]);

  const council=COUNCILS.find(c=>c.id===councilId);
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

  /* ------- Monthly Scores data ------- */
  const msMonths=useMemo(()=>series(councilId,'management').slice(-msPeriod).map(p=>p.month),[councilId,msPeriod]);
  const msRows=useMemo(()=>METRICS.map(m=>({metric:m,points:series(councilId,m.id).slice(-msPeriod)})),[councilId,msPeriod]);
  const msMgmt=useMemo(()=>{
    const target=METRICS.find(m=>m.id==='management')!.threshold;
    return series(councilId,'management').slice(-msPeriod).map(p=>({month:p.month.slice(2),score:p.value,target}));
  },[councilId,msPeriod]);
  function exportMonthly(){
    const header=['KPI',...msMonths].join(',');
    const lines=msRows.map(r=>['"'+r.metric.name.replaceAll('"','""')+'"',...r.points.map(p=>p.value)].join(','));
    const url=URL.createObjectURL(new Blob([[header,...lines].join('\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='estara-monthly-scores-demo.csv';link.click();URL.revokeObjectURL(url);
    setToast('Monthly scores exported (demo)');
  }
  function openCellPopover(event:React.MouseEvent<HTMLButtonElement>,id:MetricId,index:number){
    if(msPop&&msPop.metricId===id&&msPop.index===index){setMsPop(null);return;}
    const host=msPanelRef.current?.getBoundingClientRect();
    if(!host)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const left=Math.min(Math.max(rect.left-host.left+rect.width/2,116),host.width-116);
    setMsPop({metricId:id,index,left,top:rect.bottom-host.top+6});
  }

  /* ------- Peer Benchmark data ------- */
  const bmMetric=METRICS.find(m=>m.id===bmMetricId)!;
  const bmWord=bmMetric.id==='backlog'?'cases':'points';
  const bmPeers=useMemo(()=>COUNCILS.map(c=>({id:c.id,name:c.name,value:series(c.id,bmMetricId).at(-1)?.value??0}))
    .sort((a,b)=>bmMetric.higherBetter?b.value-a.value:a.value-b.value),[bmMetricId,bmMetric.higherBetter]);
  const bmSelf=bmPeers.find(p=>p.id===councilId);
  const bmRank=bmPeers.findIndex(p=>p.id===councilId)+1;
  const bmAvg=bmPeers.reduce((s,p)=>s+p.value,0)/(bmPeers.length||1);
  const bmBest=bmPeers[0],bmSecond=bmPeers[1];
  const bmDir=bmMetric.higherBetter?1:-1;
  const bmGapBest=bmSelf?(bmSelf.value-bmBest.value)*bmDir:0;
  const bmGapAvg=bmSelf?(bmSelf.value-bmAvg)*bmDir:0;
  const bmLead=bmSelf&&bmRank===1&&bmSecond?(bmSelf.value-bmSecond.value)*bmDir:0;
  const bmInsight=bmSelf?(bmRank===1
    ?`${bmSelf.name} ranks 1st of ${bmPeers.length} on ${bmMetric.name}, ${Math.abs(bmLead).toFixed(1)} ${bmWord} ahead of ${bmSecond?.name??'the next council'}.`
    :`${bmSelf.name} ranks ${ordinal(bmRank)} of ${bmPeers.length} on ${bmMetric.name}, ${Math.abs(bmGapBest).toFixed(1)} ${bmWord} behind ${bmBest.name}.`):'';
  const bmTable=useMemo(()=>METRICS.map(m=>{
    const dir=m.higherBetter?1:-1;
    const vals=COUNCILS.map(c=>({id:c.id,name:c.name,value:series(c.id,m.id).at(-1)?.value??0}))
      .sort((a,b)=>(b.value-a.value)*dir);
    const self=vals.find(v=>v.id===councilId);
    const avg=vals.reduce((s,v)=>s+v.value,0)/(vals.length||1);
    const tone=self?((self.value-avg)*dir>0?'better':(self.value-avg)*dir<0?'worse':''):'';
    return {metric:m,self,avg,best:vals[0],rank:vals.findIndex(v=>v.id===councilId)+1,tone};
  }),[councilId]);

  /* ------- Risk Outlook data ------- */
  const roRows=useMemo(()=>METRICS.map(m=>{
    const pts=series(councilId,m.id);
    const last=pts.at(-1);
    const current=last?.value??0;
    const projectedValue=forecast(pts,m,roHorizon);
    const breachNow=m.higherBetter?current<m.threshold:current>m.threshold;
    let breachAt:number|null=null;
    for(let h=1;h<=roHorizon;h++){
      const v=forecast(pts,m,h);
      if(m.higherBetter?v<m.threshold:v>m.threshold){breachAt=h;break;}
    }
    const margin=m.higherBetter?projectedValue-m.threshold:m.threshold-projectedValue;
    const likelihood:Band=breachNow||breachAt!==null?'High':margin<=HEAT_BUFFER?'Medium':'Low';
    const impact=IMPACT[m.id];
    const score=BAND_IDX[likelihood]+BAND_IDX[impact];
    const tone:Band=score>=3?'High':score===2?'Medium':'Low';
    const action=getActions().find(a=>a.councilId===councilId&&a.alertId===councilId+':'+m.id);
    const breachText=breachNow?'Breaching now'
      :breachAt!==null?'Projected breach: '+monthLabel(addMonths(last?.month??'2026-11',breachAt),'short')
      :'No breach projected in '+roHorizon+' month'+(roHorizon>1?'s':'');
    return {metric:m,current,projected:projectedValue,margin,likelihood,impact,score,tone,action,breachText};
  }),[councilId,roHorizon,studioVersion]);
  const roList=roRows.filter(r=>r.likelihood!=='Low').slice().sort((a,b)=>b.score-a.score||a.margin-b.margin);
  const roHasBreach=roRows.some(r=>r.likelihood==='High');

  function openActionForm(forMetric:DemoMetric,tone:Band){
    setAf({title:'',owner:'',councilId,alertId:councilId+':'+forMetric.id,
      due:new Date(Date.now()+7*86_400_000).toISOString().slice(0,10),
      priority:tone==='High'?'High':'Medium',notes:''});
    setAfError('');setAfOpen(true);
  }
  function submitAction(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    try{
      if(!af.councilId)throw Error('Select a Town Council.');
      if(!af.due)throw Error('Enter a due date.');
      addAction({...af,status:'Planned',baseline:null,after:null,effectiveness:'Not yet measured'});
      setAfOpen(false);setToast('Fictional corrective action created.');
    }catch(e){setAfError(e instanceof Error?e.message:'Could not create action.')}
  }
  const afChoices=riskRecords(af.councilId).filter(r=>r.level!=='Healthy');
  const afFallback=af.alertId&&!afChoices.some(c=>c.id===af.alertId)
    ?{id:af.alertId,name:(METRICS.find(m=>m.id===af.alertId.split(':')[1])?.name??af.alertId)+' (projected risk)'}:null;

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
      {(tab==='forecast'||tab==='whatif')&&<label>Indicator<select value={metricId} onChange={e=>setMetricId(e.target.value as MetricId)}>
        {METRICS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label>}
      <span className="sp-tag">18 months · demo records</span>
    </div>
    <div className="sp-tabs" role="tablist" aria-label="Analytics views">
      {tabs.map(t=><button type="button" role="tab" key={t.id} aria-selected={t.id===tab}
        className={t.id===tab?'active':''} onClick={()=>setTab(t.id)}><t.icon size={16}/>{t.label}</button>)}
    </div>
    {toast&&<div className="sp-success sp-toast" role="status"><CheckCircle2 size={17}/>{toast}
      <button type="button" onClick={()=>setToast('')} aria-label="Dismiss"><X size={16}/></button></div>}
    {tab==='grid'&&<div className="sp-kpi-grid">
      {rows.map(r=><button type="button" className="card sp-kpi" key={r.metric.id} onClick={()=>{setMetricId(r.metric.id);setTab('monthly')}}>
        <div className="sp-inline"><strong>{r.metric.name}</strong><RiskPill level={r.risk?.level??'Healthy'}/></div>
        <div className="sp-large">{display(r.current,r.metric.unit)}</div>
        <p>Target: {r.metric.higherBetter?'≥':'≤'} {r.metric.threshold}{r.metric.unit}</p>
        <small>{r.metric.note}</small>
        <div className="sp-inline sp-kpi-foot"><span>{r.current-r.prior>=0?'+':''}{(r.current-r.prior).toFixed(1)} vs last month</span><ArrowRight size={17}/></div>
      </button>)}
    </div>}
    {tab==='monthly'&&<article className="card sp-panel sp-ms-panel" ref={msPanelRef}>
      <div className="sp-inline sp-flex-head">
        <div><h2>Monthly scores</h2><p>Month-by-month KPI results for the selected council.</p></div>
        <div className="sp-ms-controls">
          <div className="sp-seg" role="group" aria-label="Period">
            {([6,12,18] as const).map(p=><button key={p} type="button" aria-pressed={msPeriod===p}
              className={msPeriod===p?'active':''} onClick={()=>setMsPeriod(p)}>Last {p} months</button>)}
          </div>
          <button type="button" className="sp-secondary" onClick={exportMonthly}><Download size={15}/> Export CSV</button>
        </div>
      </div>
      {msMonths.length===0?<div className="sp-ms-empty">
        <p>No monthly scores for this period.</p>
        <button type="button" className="sp-secondary" onClick={()=>setMsPeriod(6)}>Show last 6 months</button>
      </div>:<>
        <div className="sp-ms-wrap">
          <table className="sp-ms-table">
            <thead><tr><th scope="col">KPI</th>{msMonths.map(m=><th scope="col" key={m}>{m.slice(2)}</th>)}</tr></thead>
            <tbody>{msRows.map(r=><tr key={r.metric.id}>
              <th scope="row"><strong>{r.metric.name}</strong>
                <small>Target {r.metric.higherBetter?'≥':'≤'} {r.metric.threshold}{r.metric.unit}{r.metric.higherBetter?'':' · lower is better'}</small></th>
              {r.points.map((p,i)=><td key={p.month}>
                <button type="button" className={'sp-ms-cell sp-ms-'+heatStatus(p.value,r.metric)}
                  aria-label={r.metric.name+', '+monthLabel(p.month,'long')+': '+display(p.value,r.metric.unit)}
                  onClick={e=>openCellPopover(e,r.metric.id,i)}>{p.value.toFixed(1)}</button>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <div className="sp-ms-legend">
          <span className="sp-pill sp-healthy">Healthy</span>
          <span className="sp-pill sp-warning">Warning</span>
          <span className="sp-pill sp-critical">Critical</span>
          <small>Click a cell for details. Colours compare each month with the illustrative target.</small>
        </div>
        <h3>Management report score · selected period</h3>
        <div className="sp-ms-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={msMgmt} margin={{top:10,right:18,left:-15,bottom:2}}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--ui-border)"/>
            <XAxis dataKey="month" tick={{fontSize:10}}/>
            <YAxis tick={{fontSize:11}} domain={['dataMin - 5','dataMax + 5']}/>
            <Tooltip/>
            <Line dataKey="score" name="Management report score" stroke="#119ca8" strokeWidth={3} dot={{r:2}}/>
            <Line dataKey="target" name="Illustrative target" stroke="#d2a552" strokeDasharray="5 5" dot={false}/>
          </LineChart>
        </ResponsiveContainer></div>
      </>}
      {msPop&&(()=>{
        const pm=METRICS.find(x=>x.id===msPop.metricId)!;
        const full=series(councilId,pm.id);
        const offset=Math.max(0,full.length-msPeriod)+msPop.index;
        const point=full[offset],prev=full[offset-1];
        if(!point)return null;
        const st=heatStatus(point.value,pm);
        return <>
          <button type="button" className="sp-pop-backdrop" aria-label="Close details" onClick={()=>setMsPop(null)}/>
          <div className="sp-popover" style={{left:msPop.left,top:msPop.top}} role="dialog" aria-label="Monthly score details">
            <strong>{pm.name}</strong>
            <small className="sp-pop-month">{monthLabel(point.month,'long')}</small>
            <div className="sp-detail-list">
              <div><span>Value</span><strong>{display(point.value,pm.unit)}</strong></div>
              <div><span>Target</span><strong>{pm.higherBetter?'≥':'≤'} {pm.threshold}{pm.unit}</strong></div>
              <div><span>Vs previous month</span><strong>{prev?signed(point.value-prev.value):'—'}</strong></div>
              <div><span>Status</span><strong><span className={'sp-pill sp-'+st}>{HEAT_LABEL[st]}</span></strong></div>
            </div>
          </div>
        </>;
      })()}
      <small className="sp-tab-note">{TAB_NOTE}</small>
    </article>}
    {tab==='forecast'&&<div className="sp-columns">
      <article className="card sp-panel">
        <h2>Short-term trend projection</h2>
        <p>{metric.name} · {council?.name}</p>
        <div className="sp-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={forecastChart} margin={{top:15,right:18,left:-15,bottom:2}}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--ui-border)"/>
            <XAxis dataKey="month" tick={{fontSize:10}}/>
            <YAxis tick={{fontSize:11}} domain={['dataMin - 5','dataMax + 5']}/>
            <Tooltip/><Legend/>
            <Line dataKey="score" name="Historical (simulated)" stroke="#119ca8" strokeWidth={3} dot={{r:2}} connectNulls={false}/>
            <Line dataKey="target" name="Illustrative target" stroke="#d2a552" strokeDasharray="5 5" dot={false}/>
            <Line dataKey="projected" name="Forecast (estimated)" stroke="#9c75cf" strokeDasharray="4 3" strokeWidth={2} dot={{r:3}}/>
          </LineChart>
        </ResponsiveContainer></div>
      </article>
      <article className="card sp-panel sp-side-panel">
        <h2>Two-month forecast</h2>
        <div className="sp-large">{display(projected,metric.unit)}</div>
        <p>Estimated only — not a confirmed score</p>
        <div className="sp-detail-list">
          <div><span>Target</span><strong>{metric.threshold}{metric.unit}</strong></div>
          <div><span>Six-month monthly slope</span><strong>{(projected-latest>=0?'+':'')+((projected-latest)/2).toFixed(2)} approx.</strong></div>
          <div><span>Better direction</span><strong>{metric.higherBetter?'Higher':'Lower'}</strong></div>
        </div>
        <Link className="sp-link" to="/alerts">Review early warnings <ArrowRight size={16}/></Link>
      </article>
    </div>}
    {tab==='benchmark'&&(!bmSelf?<article className="card sp-panel">
      <h2>Peer benchmark</h2><p>Select a single council to benchmark.</p>
    </article>:<>
      <article className="card sp-panel">
        <div className="sp-inline sp-flex-head">
          <div><h2>Peer benchmark</h2><p>Compare this council with the other demo councils.</p></div>
          <label className="sp-bm-select">KPI<select value={bmMetricId} onChange={e=>setBmMetricId(e.target.value as MetricId)}>
            {METRICS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label>
        </div>
        <div className="sp-bm-chart"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={bmPeers} layout="vertical" margin={{top:6,right:52,left:10,bottom:0}}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--ui-border)" horizontal={false}/>
            <XAxis type="number" tick={{fontSize:10}} domain={[0,dataMax=>Math.ceil(Math.max(Number(dataMax),bmMetric.threshold)+6)]}/>
            <YAxis type="category" dataKey="name" width={118} tick={{fontSize:11}}/>
            <Tooltip formatter={v=>display(Number(v),bmMetric.unit)}/>
            <ReferenceLine x={bmMetric.threshold} stroke="#d2a552" strokeDasharray="5 5"/>
            <Bar dataKey="value" barSize={18} radius={[0,6,6,0]} isAnimationActive={false}>
              {bmPeers.map(p=><Cell key={p.id} fill={p.id===councilId?'var(--sp-accent)':'var(--ui-border)'}/>)}
              <LabelList dataKey="value" position="right"
                formatter={(v:React.ReactNode)=>typeof v==='number'?v.toFixed(1):String(v??'')}
                style={{fontSize:10,fontWeight:700,fill:'var(--sp-muted)'}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer></div>
        <p className="sp-bm-caption">Sorted best → worst for this KPI{bmMetric.higherBetter?'':' (lower is better)'}. Dashed line = illustrative target. Teal = selected council.</p>
        <div className="sp-mini-grid">
          <div><span>Rank</span><strong>{bmRank} of {bmPeers.length}</strong><small>{bmMetric.name}</small></div>
          <div><span>Gap to best</span>
            <strong>{bmRank===1?'Best':signed(bmGapBest)+' '+(bmWord==='cases'?'cases':'pts')}</strong>
            <small>{bmRank===1?signed(bmLead)+' vs '+(bmSecond?.name??'next best'):'vs '+bmBest.name}</small></div>
          <div><span>Gap to average</span><strong>{signed(bmGapAvg)} {bmWord==='cases'?'cases':'pts'}</strong>
            <small>Demo average {bmAvg.toFixed(1)}{bmMetric.unit}</small></div>
        </div>
        <p className="sp-bm-insight">{bmInsight}</p>
      </article>
      <article className="card sp-panel">
        <h2>KPI comparison</h2>
        <p>Latest month, {council?.name} against the demo field. Red = worse than the demo average, teal = better.</p>
        <div className="sp-ms-wrap"><table className="sp-bm-table">
          <thead><tr><th>KPI</th><th>{council?.name}</th><th>Demo average</th><th>Best council</th><th>Rank</th></tr></thead>
          <tbody>{bmTable.map(r=><tr key={r.metric.id}>
            <td>{r.metric.name}</td>
            <td className={r.tone==='worse'?'sp-worse':r.tone==='better'?'sp-better':''}>{r.self?display(r.self.value,r.metric.unit):'—'}</td>
            <td>{display(r.avg,r.metric.unit)}</td>
            <td>{display(r.best.value,r.metric.unit)}<small>{r.best.name}</small></td>
            <td>{r.rank} / {COUNCILS.length}</td>
          </tr>)}</tbody>
        </table></div>
        <small className="sp-tab-note">{TAB_NOTE}</small>
      </article>
    </>)}
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
      <div className="sp-inline sp-flex-head">
        <div><h2>Risk outlook</h2><p>Which KPIs are most likely to breach their targets in the next 3 months.</p></div>
        <div className="sp-seg" role="group" aria-label="Forecast horizon">
          {([1,2,3] as const).map(h=><button key={h} type="button" aria-pressed={roHorizon===h}
            className={roHorizon===h?'active':''} onClick={()=>setRoHorizon(h)}>{h} month{h>1?'s':''}</button>)}
        </div>
      </div>
      <div className="sp-ro-grid">
        <div>
          <div className="sp-ro-matrix" aria-label="Risk matrix: impact by likelihood">
            {(['High','Medium','Low'] as Band[]).map(im=><div className="sp-ro-mrow" key={im}>
              <span className="sp-ro-ylab">{im}</span>
              {(['Low','Medium','High'] as Band[]).map(li=>{
                const score=BAND_IDX[li]+BAND_IDX[im];
                const toneCls=score>=3?'sp-ro-red':score===2?'sp-ro-amber':'sp-ro-teal';
                return <div key={li} className={'sp-ro-cell '+toneCls}>
                  {roRows.filter(r=>r.impact===im&&r.likelihood===li).map(r=><button key={r.metric.id} type="button"
                    title={r.metric.name} aria-pressed={roSelected===r.metric.id}
                    className={'sp-ro-dot'+(roSelected===r.metric.id?' active':'')}
                    onClick={()=>setRoSelected(s=>s===r.metric.id?null:r.metric.id)}>
                    <i aria-hidden/>{SHORT_NAME[r.metric.id]}</button>)}
                </div>;
              })}
            </div>)}
            <div className="sp-ro-mrow"><span className="sp-ro-ylab"/>
              <span className="sp-ro-xlab">Low</span><span className="sp-ro-xlab">Medium</span><span className="sp-ro-xlab">High</span></div>
          </div>
          <small className="sp-ro-axes">Rows: impact (fixed per KPI) · Columns: likelihood of missing the target, from the linear forecast. Click a dot to highlight it in the top risks list.</small>
        </div>
        <div className="sp-ro-list">
          <h3>Top risks</h3>
          {!roHasBreach&&<div className="sp-ro-empty"><CheckCircle2 size={18}/>No projected breaches in this horizon</div>}
          {roList.map(r=><div key={r.metric.id} className={'sp-ro-row'+(roSelected===r.metric.id?' active':'')}>
            <div className="sp-inline"><strong>{r.metric.name}</strong>
              <span className={'sp-pill '+(r.tone==='High'?'sp-critical':r.tone==='Medium'?'sp-warning':'sp-healthy')}>{r.tone} risk</span></div>
            <small>{display(r.projected,r.metric.unit)} projected vs target {r.metric.higherBetter?'≥':'≤'} {r.metric.threshold}{r.metric.unit} · {r.breachText}</small>
            <div className="sp-ro-foot">
              {r.action?<Link className="sp-link" to="/actions">{r.action.id} {r.action.status.toLowerCase()} <ArrowRight size={13}/></Link>
                :<><span className="sp-ro-noact">No action yet</span>
                  <button type="button" className="sp-secondary sp-ro-create" onClick={()=>openActionForm(r.metric,r.tone)}>
                    <Plus size={14}/> Create corrective action</button></>}
            </div>
          </div>)}
          {roList.length===0&&<p className="sp-ro-lownote">All five KPIs sit in the low-risk zone for this horizon.</p>}
          {roSelected&&!roList.some(r=>r.metric.id===roSelected)&&
            <p className="sp-ro-lownote">{METRICS.find(m=>m.id===roSelected)?.name} is in the low-risk zone for this horizon, so it has no entry in the top risks list.</p>}
        </div>
      </div>
      <small className="sp-tab-note">{TAB_NOTE}</small>
    </article>}
    {afOpen&&<div className="sp-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAfOpen(false)}}>
      <section className="sp-drawer" role="dialog" aria-modal="true" aria-label="Create corrective action">
        <header><div><p className="eyebrow">CORRECTIVE ACTION</p><h2>Create follow-up</h2></div>
          <button type="button" onClick={()=>setAfOpen(false)} aria-label="Close"><X size={19}/></button></header>
        {afError&&<div className="sp-error" role="alert"><AlertTriangle size={17}/>{afError}</div>}
        <form className="sp-form" onSubmit={submitAction}>
          <label>Title *<input required maxLength={120} value={af.title} onChange={e=>setAf(v=>({...v,title:e.target.value}))}/></label>
          <label>Town Council *<select required value={af.councilId} onChange={e=>setAf(v=>({...v,councilId:e.target.value,alertId:''}))}>
            <option value="">Select council</option>{COUNCILS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>Related warning<select value={af.alertId} onChange={e=>setAf(v=>({...v,alertId:e.target.value}))}>
            <option value="">No linked warning</option>
            {afFallback&&<option value={afFallback.id}>{afFallback.name}</option>}
            {afChoices.map(a=><option key={a.id} value={a.id}>{a.metric.name} ({a.level})</option>)}
          </select></label>
          <label>Owner *<input required value={af.owner} maxLength={80} onChange={e=>setAf(v=>({...v,owner:e.target.value}))}/></label>
          <label>Due date *<input required type="date" value={af.due} onChange={e=>setAf(v=>({...v,due:e.target.value}))}/></label>
          <label>Priority<select value={af.priority} onChange={e=>setAf(v=>({...v,priority:e.target.value as 'Low'|'Medium'|'High'}))}>
            {['Low','Medium','High'].map(p=><option key={p}>{p}</option>)}
          </select></label>
          <label>Action notes<textarea value={af.notes} maxLength={1000} rows={3} onChange={e=>setAf(v=>({...v,notes:e.target.value}))}/></label>
          <button className="primary-button" type="submit"><Plus size={16}/> Save demo action</button>
        </form>
        <p className="sp-footnote">This record is stored in temporary client memory only.</p>
      </section>
    </div>}
    <p className="sp-footnote">Prototype only. Actual performance standards, data definitions, forecast reliability and benchmarks require validation with EM Services.</p>
  </section>;
}
