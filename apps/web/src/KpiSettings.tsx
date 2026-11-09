import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, Building2, History, Lock, Pencil, Plus, X } from 'lucide-react';
import { apiErrorMessage, getCaseMeta } from './cases-api';
import { createKpi, fmt, getDefinitions, getHistory, getMetrics, removeCouncilTarget, setCouncilTarget, updateKpi,
  type ChangeLogEntry, type Council, type KpiDefinition, type MetricId, type MetricInfo } from './kpi-api';
import { AnalyticsTabs, Footnote, Loading, PageHeader, useIsKpiManager, useLoad } from './kpi-ui';

type FormState={name:string;description:string;metric:MetricId;withinDays:string;category:string;target:string;warning:string};
const blank=(m:MetricInfo):FormState=>({name:'',description:'',metric:m.id,withinDays:m.defaultDays?String(m.defaultDays):'',category:'',target:'',warning:''});

/** Create KPIs, set targets and warning lines (per council where needed) and review who changed what. */
export default function KpiSettings(){
  const manager=useIsKpiManager();
  const [showArchived,setShowArchived]=useState(false);
  const [revision,setRevision]=useState(0);
  const [creating,setCreating]=useState(false);
  const [message,setMessage]=useState('');
  const meta=useLoad(async()=>{
    const [m,c]=await Promise.all([getMetrics(),getCaseMeta()]);
    return {metrics:m.metrics,categories:m.categories,councils:c.councils};
  },[]);
  const list=useLoad(()=>getDefinitions(true),[revision]);
  const kpis=(list.data??[]).filter(k=>showArchived||k.active);
  const saved=(text:string)=>{setMessage(text);setRevision(n=>n+1);};

  return <section className="sp-page ka-page">
    <PageHeader title="KPI settings" description="The KPIs Estara monitors, their targets and warning lines. Targets can be set per Town Council. Every change is recorded."/>
    <AnalyticsTabs/>
    {!manager&&<div className="sp-notice"><Lock size={17}/>View only. Only EMS managers can change KPI settings. In this prototype, switch the preview role to EMS Manager or Administrator from the profile menu.</div>}
    {message&&<div className="sp-success" role="status">{message}<button type="button" onClick={()=>setMessage('')} aria-label="Dismiss"><X size={15}/></button></div>}
    <div className="sp-toolbar card">
      <label className="ka-check"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show archived KPIs</label>
      {manager&&meta.data&&<button type="button" className="primary-button" onClick={()=>setCreating(true)} disabled={creating}><Plus size={16}/> New KPI</button>}
    </div>
    <Loading error={meta.error||list.error} loading={(meta.loading||list.loading)&&!list.data} what="KPI settings"/>
    {creating&&meta.data&&<KpiForm metrics={meta.data.metrics} categories={meta.data.categories}
      onCancel={()=>setCreating(false)} onSaved={k=>{setCreating(false);saved(`Created “${k.name}”.`);}}/>}
    {meta.data&&kpis.map(k=><KpiCard key={k.id} kpi={k} manager={manager} metrics={meta.data!.metrics} categories={meta.data!.categories}
      councils={meta.data!.councils} onSaved={saved}/>)}
    {list.data&&kpis.length===0&&<div className="card ka-empty">No KPIs yet. Run <code>npm run db:seed-kpis</code> to add the starting set.</div>}
    <Footnote/>
  </section>;
}

function KpiForm({metrics,categories,kpi,onCancel,onSaved}:{metrics:MetricInfo[];categories:string[];kpi?:KpiDefinition;onCancel:()=>void;onSaved:(k:KpiDefinition)=>void}){
  const [form,setForm]=useState<FormState>(()=>kpi?{
    name:kpi.name,description:kpi.description??'',metric:kpi.metric,withinDays:kpi.withinDays?String(kpi.withinDays):'',
    category:kpi.category??'',target:String(kpi.target),warning:String(kpi.warning)
  }:blank(metrics[0]));
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const metric=metrics.find(m=>m.id===form.metric)!;
  const set=(k:keyof FormState)=>(e:{target:{value:string}})=>setForm(f=>({...f,[k]:e.target.value}));
  const unit=metric.unit==='%'?'%':metric.unit==='days'?'days':'cases';

  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    const body={name:form.name,description:form.description||null,withinDays:metric.daysLabel?Number(form.withinDays):null,
      category:form.category||null,target:Number(form.target),warning:Number(form.warning)};
    try{onSaved(kpi?await updateKpi(kpi.id,body):await createKpi({...body,metric:form.metric}));}
    catch(err){setError(apiErrorMessage(err));}
    finally{setBusy(false);}
  }
  return <form className="card sp-panel sp-form ka-form" onSubmit={submit}>
    <h2>{kpi?'Edit '+kpi.name:'New KPI'}</h2>
    <div className="ka-form-grid">
      <label>Name<input required minLength={3} maxLength={80} value={form.name} onChange={set('name')} placeholder="e.g. Lift cases closed within 3 days"/></label>
      <label>Calculation<select value={form.metric} disabled={!!kpi} onChange={e=>{const m=metrics.find(x=>x.id===e.target.value)!;setForm(f=>({...f,metric:m.id,withinDays:m.defaultDays?String(m.defaultDays):''}));}}>
        {metrics.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
      </select>{kpi&&<small>Fixed once created, so the KPI's history keeps its meaning.</small>}</label>
      {metric.daysLabel&&<label>{metric.daysLabel}<input required type="number" min={1} max={90} value={form.withinDays} onChange={set('withinDays')}/></label>}
      <label>Only count category<select value={form.category} onChange={set('category')}>
        <option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}
      </select></label>
      <label>Target ({unit}, {metric.direction==='higher'?'at least':'at most'})<input required type="number" step="any" min={0} max={metric.unit==='%'?100:undefined} value={form.target} onChange={set('target')}/></label>
      <label>Warning line ({unit})<input required type="number" step="any" min={0} max={metric.unit==='%'?100:undefined} value={form.warning} onChange={set('warning')}/>
        <small>{metric.direction==='higher'?'At or above the target':'At or below the target'}: an early warning before the target is missed.</small></label>
      <label className="ka-span">Description<textarea rows={2} maxLength={500} value={form.description} onChange={set('description')}/></label>
    </div>
    <p className="ka-sub">{metric.explain} {metric.direction==='higher'?'Higher':'Lower'} is better.</p>
    {error&&<div className="sp-error">{error}</div>}
    <div className="ka-form-actions"><button type="button" className="ka-button" onClick={onCancel}>Cancel</button>
      <button className="primary-button" disabled={busy}>{busy?'Saving…':kpi?'Save changes':'Create KPI'}</button></div>
  </form>;
}

function KpiCard({kpi,manager,metrics,categories,councils,onSaved}:{kpi:KpiDefinition;manager:boolean;metrics:MetricInfo[];categories:string[];councils:Council[];onSaved:(m:string)=>void}){
  const [editing,setEditing]=useState(false);
  const [panel,setPanel]=useState<''|'councils'|'history'>('');
  const [error,setError]=useState('');
  if(editing)return <KpiForm kpi={kpi} metrics={metrics} categories={categories} onCancel={()=>setEditing(false)} onSaved={k=>{setEditing(false);onSaved(`Saved “${k.name}”.`);}}/>;
  async function toggleArchive(){
    setError('');
    try{await updateKpi(kpi.id,{active:!kpi.active});onSaved(kpi.active?`Archived “${kpi.name}”. Its history is kept.`:`Restored “${kpi.name}”.`);}
    catch(e){setError(apiErrorMessage(e));}
  }
  const comparator=kpi.direction==='higher'?'≥':'≤';
  return <article className={'card sp-panel ka-kpi-card'+(kpi.active?'':' archived')}>
    <div className="sp-inline ka-kpi-head"><div>
      <h2>{kpi.name}{!kpi.active&&<span className="badge ka-inline-badge">Archived</span>}</h2>
      <p className="ka-sub">{kpi.metricLabel}{kpi.withinDays?` · ${kpi.withinDays} days`:''}{kpi.category?` · ${kpi.category} only`:''} · {kpi.direction==='higher'?'higher':'lower'} is better{kpi.description?' · '+kpi.description:''}</p>
    </div>
      <div className="ka-thresholds"><span>Target <b>{comparator} {fmt(kpi.target,kpi.unit)}{kpi.unit==='cases'?' cases':''}</b></span><span>Warning <b>{fmt(kpi.warning,kpi.unit)}</b></span></div>
    </div>
    <div className="ka-card-actions">
      <button type="button" className="ka-button" aria-expanded={panel==='councils'} onClick={()=>setPanel(panel==='councils'?'':'councils')}><Building2 size={14}/> Town Council targets{kpi.councilTargets?.length?` (${kpi.councilTargets.length})`:''}</button>
      <button type="button" className="ka-button" aria-expanded={panel==='history'} onClick={()=>setPanel(panel==='history'?'':'history')}><History size={14}/> Change history</button>
      {manager&&<><button type="button" className="ka-button" onClick={()=>setEditing(true)}><Pencil size={14}/> Edit</button>
        <button type="button" className="ka-button" onClick={toggleArchive}>{kpi.active?<><Archive size={14}/> Archive</>:<><ArchiveRestore size={14}/> Restore</>}</button></>}
    </div>
    {error&&<div className="sp-error">{error}</div>}
    {panel==='councils'&&<CouncilTargets kpi={kpi} councils={councils} manager={manager} onSaved={onSaved}/>}
    {panel==='history'&&<ChangeHistory kpi={kpi}/>}
  </article>;
}

function CouncilTargets({kpi,councils,manager,onSaved}:{kpi:KpiDefinition;councils:Council[];manager:boolean;onSaved:(m:string)=>void}){
  const [edit,setEdit]=useState<{id:string;target:string;warning:string}|null>(null);
  const [error,setError]=useState('');
  const own=new Map((kpi.councilTargets??[]).map(t=>[t.townCouncilId,t]));
  async function save(e:FormEvent){
    e.preventDefault();if(!edit)return;setError('');
    try{await setCouncilTarget(kpi.id,edit.id,{target:Number(edit.target),warning:Number(edit.warning)});setEdit(null);onSaved('Saved the council-specific target.');}
    catch(err){setError(apiErrorMessage(err));}
  }
  async function reset(id:string){
    setError('');
    try{await removeCouncilTarget(kpi.id,id);onSaved('That Town Council now uses the standard target.');}
    catch(err){setError(apiErrorMessage(err));}
  }
  return <div className="ka-subpanel">
    <p className="ka-sub">Each Town Council uses the standard target unless it has its own, for example a higher overdue limit for a larger council.</p>
    {error&&<div className="sp-error">{error}</div>}
    <div className="ka-matrix-wrap"><table className="ka-table">
      <thead><tr><th>Town Council</th><th>Target</th><th>Warning</th><th/></tr></thead>
      <tbody>{councils.map(c=>{
        const t=own.get(c.id);
        if(edit?.id===c.id)return <tr key={c.id}><td>{c.name}</td><td colSpan={3}>
          <form className="ka-inline-form" onSubmit={save}>
            <input aria-label="Target" type="number" step="any" min={0} required value={edit.target} onChange={e=>setEdit({...edit,target:e.target.value})}/>
            <input aria-label="Warning line" type="number" step="any" min={0} required value={edit.warning} onChange={e=>setEdit({...edit,warning:e.target.value})}/>
            <button className="primary-button">Save</button><button type="button" className="ka-button" onClick={()=>setEdit(null)}>Cancel</button>
          </form></td></tr>;
        return <tr key={c.id}><td>{c.name}</td>
          <td>{fmt(t?.target??kpi.target,kpi.unit)} {!t&&<small>standard</small>}</td><td>{fmt(t?.warning??kpi.warning,kpi.unit)}</td>
          <td className="ka-row-actions">{manager&&<>
            <button type="button" className="ka-button" onClick={()=>setEdit({id:c.id,target:String(t?.target??kpi.target),warning:String(t?.warning??kpi.warning)})}>Set own target</button>
            {t&&<button type="button" className="ka-button" onClick={()=>reset(c.id)}>Use standard</button>}</>}</td></tr>;
      })}</tbody>
    </table></div>
  </div>;
}

const LABELS:Record<string,string>={name:'Name',description:'Description',metric:'Calculation',withinDays:'Days',category:'Category',target:'Target',warning:'Warning',active:'Active',sortOrder:'Order'};
const ACTIONS:Record<string,string>={created:'Created',updated:'Updated',archived:'Archived',restored:'Restored',council_target_set:'Council target set',council_target_removed:'Council target removed'};
function ChangeHistory({kpi}:{kpi:KpiDefinition}){
  const {data,error,loading}=useLoad(()=>getHistory(kpi.id),[kpi.id,kpi.updatedAt,kpi.councilTargets?.length]);
  const show=(v:unknown)=>v===null||v===undefined||v===''?'—':String(v);
  return <div className="ka-subpanel">
    <Loading error={error} loading={loading} what="history"/>
    {data&&data.length===0&&<p className="ka-empty">No recorded changes.</p>}
    {data&&<ol className="ka-history">{data.map((h:ChangeLogEntry)=><li key={h.id}>
      <div><strong>{ACTIONS[h.action]??h.action}{h.council?` · ${h.council}`:''}</strong>
        <small>{new Date(h.changedAt).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'})} · {h.changedBy}</small></div>
      {h.action!=='created'&&<ul>{Object.entries(h.changes).map(([k,c])=><li key={k}>{LABELS[k]??k}: {show(c.from)} → {show(c.to)}</li>)}</ul>}
    </li>)}</ol>}
  </div>;
}
