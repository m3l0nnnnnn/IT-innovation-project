import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BellRing, CheckCircle2, ClipboardList, Settings2,
  Plus, ArrowRight, X, ShieldCheck, History } from 'lucide-react';
import { COUNCILS, METRICS, getRules, setRules, riskRecords, setAlertState,
  getActions, addAction, updateAction, series, trend, classify, useStudioVersion,
  type ActionState, type AlertState, type DemoRule, type RiskLevel
} from './studio-data';
import './studio-pages.css';

type View='alerts'|'actions'|'rules'|'replay';
type ActionForm={title:string;owner:string;councilId:string;alertId:string;
 due:string;priority:'Low'|'Medium'|'High';notes:string};
function severityRank(level:RiskLevel){return ['Critical','Warning','Watch','Healthy'].indexOf(level);}
const emptyForm=(councilId:string):ActionForm=>({
  title:'',owner:'',councilId,alertId:'',due:new Date(Date.now()+7*86_400_000).toISOString().slice(0,10),
  priority:'Medium',notes:''
});
export default function StudioRisk({view}:{view:View}){
  const studioVersion=useStudioVersion();
  const [councilId,setCouncilId]=useState('');
  const [severity,setSeverity]=useState('All');
  const [rulesDraft,setRulesDraft]=useState<DemoRule>(getRules);
  const [replayMonth,setReplayMonth]=useState(11);
  const [formOpen,setFormOpen]=useState(false);
  const [form,setForm]=useState<ActionForm>(emptyForm(''));
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [editingOutcome,setEditingOutcome]=useState<string|null>(null);
  const [outcome,setOutcome]=useState({baseline:'',after:'',notes:''});
  const risks=riskRecords(councilId);
  const list=risks.filter(r=>(severity==='All'||r.level===severity)&&(severity!=='All'||r.level!=='Healthy'));
  const actions=getActions().filter(a=>!councilId||a.councilId===councilId);
  const alertChoices=riskRecords().filter(a=>a.level!=='Healthy');
  const previewMonths=series(COUNCILS[0].id,'response');
  const latestIndex=previewMonths.length-1;
  const historic=useMemo(()=>{
    return COUNCILS.filter(c=>!councilId||c.id===councilId).flatMap(c=>METRICS.flatMap(metric=>{
      if(!getRules().enabled.includes(metric.id))return [];
      const data=series(c.id,metric.id).slice(0,replayMonth+1);
      if(!data.length)return [];
      const current=data.at(-1)!.value;
      const slope=trend(data);
      const projected=current+slope*getRules().horizon;
      const level=classify(current,projected,metric,getRules().buffer);
      if(level==='Healthy')return [];
      return [{id:c.id+metric.id,council:c.name,metric:metric.name,current,
        projected:Math.round(projected*10)/10,level,month:data.at(-1)!.month}];
    }));
  },[councilId,replayMonth,studioVersion]);
  function saveRules(){
    try{setRules(rulesDraft);setMessage('Demo warning rules updated. All alerts use the new settings.');setError('')}
    catch(e){setError(e instanceof Error?e.message:'Could not update rules.')}
  }
  function startAction(alertId=''){
    const selected=alertChoices.find(a=>a.id===alertId);
    setForm({...emptyForm(selected?.councilId??councilId??COUNCILS[0].id),alertId});
    setFormOpen(true);setError('');
  }
  function submitAction(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    try{
      if(!form.councilId)throw Error('Select a Town Council.');
      if(!form.due)throw Error('Enter a due date.');
      addAction({...form,status:'Planned',baseline:null,after:null,effectiveness:'Not yet measured'});
      setMessage('Fictional corrective action created.');setError('');setFormOpen(false);
    }catch(e){setError(e instanceof Error?e.message:'Could not create action.')}
  }
  function mark(id:string,status:ActionState){
    updateAction(id,{status});setMessage('Demo action '+id+' → '+status+'.');
  }
  function saveOutcome(id:string){
    const baseline=Number(outcome.baseline),after=Number(outcome.after);
    if(outcome.baseline===''||outcome.after===''||!Number.isFinite(baseline)||!Number.isFinite(after)){
      setError('Enter valid before-and-after KPI readings.');return;
    }
    updateAction(id,{baseline,after,notes:outcome.notes,
      effectiveness:after>baseline?'Increase observed (illustrative; may not imply improvement)':
        after<baseline?'Decrease observed (illustrative; may not imply improvement)':'No measured change'});
    setEditingOutcome(null);setError('');setMessage('Illustrative effectiveness readings saved.');
  }
  return <section className="sp-page">
    <header className="page-header"><div>
      <p className="eyebrow">RISK & ACTIONS · BRINA / MAAHIRAH</p>
      <h1>{view==='alerts'?'Early-warning alerts':view==='actions'?'Corrective actions':
        view==='rules'?'Warning rules':'Historical replay'}</h1>
      <p className="subtext">Identify risks early, record decisions and track follow-up actions using a connected fictional dataset.</p>
    </div>{view==='actions'&&<button className="primary-button" onClick={()=>startAction()}><Plus size={16}/> Create action</button>}</header>
    <div className="sp-notice"><ShieldCheck size={17}/>
      Prototype only: thresholds, alerts, action statuses and history are simulated and reset when the page reloads. No automatic notifications or production permissions.
    </div>
    <div className="sp-tabs" role="navigation" aria-label="Risk and actions views">
      {[
        {path:'/alerts',title:'Alert Inbox',icon:BellRing},
        {path:'/actions',title:'Corrective Actions',icon:ClipboardList},
        {path:'/risk/rules',title:'Warning Rules',icon:Settings2},
        {path:'/risk/replay',title:'Historical Replay',icon:History}
      ].map(({path,title,icon:Icon})=><Link key={path} to={path} className={(view==='alerts'&&path==='/alerts')||
        (view==='actions'&&path==='/actions')||(view==='rules'&&path==='/risk/rules')||(view==='replay'&&path==='/risk/replay')?'active':''}>
        <Icon size={16}/>{title}</Link>)}
    </div>
    <div className="sp-toolbar card"><label>Town Council<select value={councilId} onChange={e=>setCouncilId(e.target.value)}>
      <option value="">All demo councils</option>{COUNCILS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>
    {view==='alerts'&&<label>Severity<select value={severity} onChange={e=>setSeverity(e.target.value)}>
      {['All','Critical','Warning','Watch','Healthy'].map(s=><option key={s}>{s}</option>)}
    </select></label>}
    <span className="sp-tag">Illustrative thresholds only</span></div>
    {message&&<div className="sp-success" role="status"><CheckCircle2 size={17}/>{message}
      <button onClick={()=>setMessage('')} aria-label="Dismiss"><X size={16}/></button></div>}
    {error&&<div className="sp-error" role="alert"><AlertTriangle size={17}/>{error}</div>}
    {view==='alerts'&&<div className="sp-risk-cards">
      {list.length===0&&<div className="card sp-panel">No demo alerts for the selected filters.</div>}
      {list.map(r=><article className="card sp-alert" key={r.id}>
        <div className="sp-inline"><span className={'sp-pill sp-'+r.level.toLowerCase()}>{r.level}</span>
          <small>{r.council} · {r.state}</small></div>
        <h2>{r.metric.name}</h2><p>{r.reason}</p>
        <div className="sp-alert-evidence">
          <div><span>Latest simulated</span><strong>{r.current}{r.metric.unit}</strong></div>
          <div><span>Illustrative threshold</span><strong>{r.metric.threshold}{r.metric.unit}</strong></div>
          <div><span>{getRules().horizon}-month forecast</span><strong>{r.forecast}{r.metric.unit}</strong></div>
        </div>
        <div className="sp-alert-controls">
          <label>Status <select value={r.state} onChange={e=>setAlertState(r.id,e.target.value as AlertState)}>
            {['New','Acknowledged','Monitoring','Resolved'].map(s=><option key={s}>{s}</option>)}
          </select></label>
          <button className="sp-secondary" onClick={()=>startAction(r.id)}><Plus size={16}/> Corrective action</button>
        </div>
      </article>)}
    </div>}
    {view==='actions'&&<>
      <div className="sp-action-grid">
        {actions.length===0&&<div className="card sp-panel">No corrective actions for this Town Council.</div>}
        {actions.map(a=><article className="card sp-action" key={a.id}>
          <div className="sp-inline"><span className="sp-tag">{a.id} · {a.priority}</span><span className={'sp-pill sp-'+a.status.toLowerCase().replaceAll(' ','-')}>{a.status}</span></div>
          <h2>{a.title}</h2><p>{a.council}</p>
          <div className="sp-detail-list">
            <div><span>Owner</span><strong>{a.owner}</strong></div><div><span>Due date</span><strong>{a.due}</strong></div>
            <div><span>Linked warning</span><strong>{a.alertId.split(':').at(-1)||'Not linked'}</strong></div>
            <div><span>Effectiveness</span><strong>{a.effectiveness}</strong></div>
          </div>
          <label className="sp-action-status">Progress<select value={a.status} onChange={e=>mark(a.id,e.target.value as ActionState)}>
            {['Planned','In Progress','Completed'].map(s=><option key={s}>{s}</option>)}
          </select></label>
          {editingOutcome===a.id?<div className="sp-outcome">
            <p>Record a before-and-after observation. This does not prove causality.</p>
            <label>Before<input type="number" step="0.1" value={outcome.baseline} onChange={e=>setOutcome(v=>({...v,baseline:e.target.value}))}/></label>
            <label>After<input type="number" step="0.1" value={outcome.after} onChange={e=>setOutcome(v=>({...v,after:e.target.value}))}/></label>
            <label>Notes<input value={outcome.notes} onChange={e=>setOutcome(v=>({...v,notes:e.target.value}))}/></label>
            <button className="sp-secondary" onClick={()=>saveOutcome(a.id)}>Save observations</button>
          </div>:<button className="sp-secondary" onClick={()=>{setEditingOutcome(a.id);setOutcome({
            baseline:a.baseline===null?'':String(a.baseline),after:a.after===null?'':String(a.after),notes:a.notes
          });}}>Record effectiveness</button>}
        </article>)}
      </div>
    </>}
    {view==='rules'&&<div className="sp-columns">
      <article className="card sp-panel">
        <h2>Warning configuration</h2>
        <p>These parameters apply only to the synthetic demonstration.</p>
        <label className="sp-setting">Near-threshold buffer (points)
          <input type="number" min="0" max="20" step="0.5" value={rulesDraft.buffer} onChange={e=>setRulesDraft(d=>({...d,buffer:Number(e.target.value)}))}/>
        </label>
        <label className="sp-setting">Forecast horizon
          <select value={rulesDraft.horizon} onChange={e=>setRulesDraft(d=>({...d,horizon:Number(e.target.value) as 1|2|3}))}>
            {[1,2,3].map(n=><option key={n} value={n}>{n} month(s)</option>)}
          </select>
        </label>
        <h3>Monitored indicators</h3>
        {METRICS.map(m=><label key={m.id} className="sp-check"><input type="checkbox" checked={rulesDraft.enabled.includes(m.id)} onChange={e=>setRulesDraft(d=>({
          ...d,enabled:e.target.checked?[...d.enabled,m.id]:d.enabled.filter(id=>id!==m.id)
        }))}/>{m.name}</label>)}
        <button className="primary-button" onClick={saveRules}><CheckCircle2 size={16}/> Apply demo rules</button>
      </article>
      <article className="card sp-panel">
        <h2>Detection logic</h2>
        <div className="sp-detail-list">
          <div><span>Critical</span><strong>Latest reading beyond threshold</strong></div>
          <div><span>Warning</span><strong>Projected threshold breach</strong></div>
          <div><span>Watch</span><strong>Within buffer of threshold</strong></div>
          <div><span>Healthy</span><strong>No demo concern</strong></div>
        </div>
        <p>Metrics configured as “lower is better”, such as outstanding cases, use reversed comparisons. A straight-line trend is not a validated forecast.</p>
      </article>
    </div>}
    {view==='replay'&&<div className="sp-columns">
      <article className="card sp-panel">
        <h2>Historical warning replay</h2><p>Recalculate hypothetical warnings using earlier simulated months and the current demo rules.</p>
        <label className="sp-setting">Replay through month
          <select value={replayMonth} onChange={e=>setReplayMonth(Number(e.target.value))}>
            {previewMonths.slice(5,latestIndex).map((m,i)=><option key={m.month} value={i+5}>{m.month}</option>)}
          </select>
        </label>
        <div className="sp-stats-strip">
          <div><span>Alerts in replay</span><strong>{historic.length}</strong></div>
          <div><span>Critical</span><strong>{historic.filter(h=>h.level==='Critical').length}</strong></div>
          <div><span>Warnings</span><strong>{historic.filter(h=>h.level==='Warning').length}</strong></div>
        </div>
        <p className="sp-footnote">Replay does not demonstrate detection accuracy, precision, recall or verified incident outcomes.</p>
      </article>
      <article className="card sp-panel">
        <h2>Replay results</h2>
        <div className="sp-history-list">
          {historic.slice().sort((a,b)=>severityRank(a.level)-severityRank(b.level)).map(h=><div key={h.id} className="sp-history-row">
            <div><strong>{h.metric}</strong><small>{h.council} · {h.month} · {h.current} → {h.projected} est.</small></div>
            <span className={'sp-pill sp-'+h.level.toLowerCase()}>{h.level}</span>
          </div>)}
          {!historic.length&&<p>No hypothetical warnings for the selected period.</p>}
        </div>
      </article>
    </div>}
    {formOpen&&<div className="sp-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}>
      <section className="sp-drawer" role="dialog" aria-modal="true" aria-label="Create corrective action">
        <header><div><p className="eyebrow">CORRECTIVE ACTION</p><h2>Create follow-up</h2></div>
          <button onClick={()=>setFormOpen(false)} aria-label="Close"><X size={19}/></button></header>
        <form className="sp-form" onSubmit={submitAction}>
          <label>Title *<input required maxLength={120} value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
          <label>Town Council *<select required value={form.councilId} onChange={e=>setForm(v=>({...v,councilId:e.target.value,alertId:''}))}>
            <option value="">Select council</option>{COUNCILS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>Related warning<select value={form.alertId} onChange={e=>setForm(v=>({...v,alertId:e.target.value}))}>
            <option value="">No linked warning</option>{alertChoices.filter(a=>a.councilId===form.councilId).map(a=><option key={a.id} value={a.id}>{a.metric.name} ({a.level})</option>)}
          </select></label>
          <label>Owner *<input required value={form.owner} maxLength={80} onChange={e=>setForm(v=>({...v,owner:e.target.value}))}/></label>
          <label>Due date *<input required type="date" value={form.due} onChange={e=>setForm(v=>({...v,due:e.target.value}))}/></label>
          <label>Priority<select value={form.priority} onChange={e=>setForm(v=>({...v,priority:e.target.value as 'Low'|'Medium'|'High'}))}>
            {['Low','Medium','High'].map(p=><option key={p}>{p}</option>)}
          </select></label>
          <label>Action notes<textarea value={form.notes} maxLength={1000} rows={3} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></label>
          <button className="primary-button" type="submit"><Plus size={16}/> Save demo action</button>
        </form>
        <p className="sp-footnote">This record is stored in temporary client memory only.</p>
      </section>
    </div>}
    <p className="sp-footnote">Statuses represent demo interactions, not audited official action outcomes. <Link to="/analytics">Explore related analytics <ArrowRight size={13}/></Link></p>
  </section>;
}
