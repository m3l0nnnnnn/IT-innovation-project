import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, ClipboardCheck, ImagePlus, MapPin,
  Plus, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import { getDemoCasesSnapshot, type DemoCase } from './ground-demo';
import { createDemoInspection, currentDemoCouncils, getDemoInspectionsSnapshot,
  inspectionCategories, photoToDemoJpeg, updateDemoInspection,
  type Inspection, type InspectionCategory, type InspectionDraft, type InspectionPriority,
  type InspectionStatus } from './ground-inspections';
import './estate-monitoring.css';

type View='inspections'|'map';
type Risk='Low'|'Watch'|'Elevated';
type Block={
  key:string;townCouncilId:string;council:string;block:string;
  cases:DemoCase[];inspections:Inspection[];openCases:number;
  openObservations:number;score:number;risk:Risk;
};
function formatDate(value:string){
  return new Date(value).toLocaleDateString('en-SG',{day:'2-digit',month:'short',year:'numeric'});
}
function formatDateTime(value:string){
  return new Date(value).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'});
}
function localTime(value:Date){
  return new Date(value.getTime()-value.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}
function getBlocks(cases:DemoCase[],inspections:Inspection[],councilId:string):Block[]{
  const grouped=new Map<string,{council:string;townCouncilId:string;block:string;cases:DemoCase[];inspections:Inspection[]}>();
  function group(id:string,council:string,block:string){
    const key=id+':'+block;
    const existing=grouped.get(key);
    if(existing)return existing;
    const next:{townCouncilId:string;council:string;block:string;cases:DemoCase[];inspections:Inspection[]}={townCouncilId:id,council,block,cases:[],inspections:[]};
    grouped.set(key,next);return next;
  }
  for(const item of cases){
    if(councilId&&councilId!==item.townCouncilId)continue;
    group(item.townCouncilId,item.council,item.block).cases.push(item);
  }
  for(const item of inspections){
    if(councilId&&councilId!==item.townCouncilId)continue;
    group(item.townCouncilId,item.council,item.block).inspections.push(item);
  }
  const cutoff=Date.now()-30*86_400_000;
  return [...grouped.values()].map(g=>{
    const recent=g.cases.filter(c=>c.status==='Open'&&Date.parse(c.receivedAt)>=cutoff);
    const openObservations=g.inspections.filter(i=>i.status!=='Resolved').length;
    const score=recent.reduce((n,c)=>n+(c.category==='Lift'?2:1),0)+openObservations;
    const risk:Risk=score>=5?'Elevated':score>=2?'Watch':'Low';
    return {...g,key:g.townCouncilId+':'+g.block,openCases:recent.length,openObservations,score,risk};
  }).sort((a,b)=>b.score-a.score||a.council.localeCompare(b.council)||a.block.localeCompare(b.block));
}
function StatusTag({status}:{status:string}){
  return <span className={'em-tag em-tag-'+status.toLowerCase().replaceAll(' ','-')}>{status}</span>;
}
const emptyDraft=(councilId:string):InspectionDraft=>({
  townCouncilId:councilId,block:'',location:'Common corridor',
  category:'Estate Maintenance',priority:'Medium',notes:'',inspector:'',
  observedAt:localTime(new Date()),linkedCaseRef:null,photoDataUrl:null
});
export default function EstateMonitoring({initialView}:{initialView:View}){
  const [revision,setRevision]=useState(0);
  const [councilId,setCouncilId]=useState('');
  const [status,setStatus]=useState('');
  const [category,setCategory]=useState('');
  const [query,setQuery]=useState('');
  const [selectedInspection,setSelectedInspection]=useState<string|null>(null);
  const [selectedBlock,setSelectedBlock]=useState<string|null>(null);
  const [showForm,setShowForm]=useState(false);
  const [draft,setDraft]=useState<InspectionDraft>(emptyDraft(''));
  const [photoError,setPhotoError]=useState('');
  const [notice,setNotice]=useState('');
  const [photoBusy,setPhotoBusy]=useState(false);
  const councils=useMemo(()=>currentDemoCouncils(),[]);
  const data=useMemo(()=>({
    cases:getDemoCasesSnapshot(),
    inspections:getDemoInspectionsSnapshot()
  }),[revision]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return data.inspections.filter(i=>(!councilId||i.townCouncilId===councilId)&&
      (!status||i.status===status)&&(!category||i.category===category)&&
      (!q||[i.ref,i.block,i.location,i.category,i.notes,i.inspector,i.linkedCaseRef].join(' ').toLowerCase().includes(q)))
      .sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
  },[data,councilId,status,category,query]);
  const blocks=useMemo(()=>getBlocks(data.cases,data.inspections,councilId),[data,councilId]);
  const chosen=selectedInspection?data.inspections.find(i=>i.ref===selectedInspection):null;
  const block=selectedBlock?blocks.find(b=>b.key===selectedBlock):null;
  const filteredCases=useMemo(()=>data.cases.filter(c=>c.townCouncilId===draft.townCouncilId),[data,draft.townCouncilId]);
  const summary=useMemo(()=>{
    const rows=data.inspections.filter(i=>!councilId||i.townCouncilId===councilId);
    return {total:rows.length,unresolved:rows.filter(i=>i.status!=='Resolved').length,
      high:rows.filter(i=>i.priority==='High'&&i.status!=='Resolved').length,
      photos:rows.filter(i=>!!i.photoDataUrl).length};
  },[data,councilId]);
  function update<T extends keyof InspectionDraft>(key:T,value:InspectionDraft[T]){
    setDraft(current=>({...current,[key]:value}));
  }
  function openNew(prefill?:{townCouncilId:string;block:string}){
    setPhotoError('');setSelectedInspection(null);
    setDraft({...emptyDraft(prefill?.townCouncilId||councilId||councils[0]?.id||''),block:prefill?.block||''});
    setShowForm(true);
  }
  async function choosePhoto(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];
    if(!file)return;
    setPhotoBusy(true);setPhotoError('');
    try{
      const result=await photoToDemoJpeg(file);
      update('photoDataUrl',result);
    }catch(error){setPhotoError(error instanceof Error?error.message:'Could not process this photo.')}
    finally{setPhotoBusy(false);event.target.value='';}
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setPhotoError('');
    if(!draft.observedAt||!Number.isFinite(Date.parse(draft.observedAt))){setPhotoError('Choose a valid inspection date.');return;}
    if(Date.parse(draft.observedAt)>Date.now()+300_000){setPhotoError('The observation date cannot be in the future.');return;}
    try{
      const item=createDemoInspection({...draft,observedAt:new Date(draft.observedAt).toISOString()});
      setRevision(r=>r+1);setNotice(item.ref+' added to the fictional demo records.');
      setShowForm(false);setSelectedInspection(item.ref);
    }catch(e){setPhotoError(e instanceof Error?e.message:'Could not create the observation.')}
  }
  function changeStatus(ref:string,status:InspectionStatus){
    updateDemoInspection(ref,{status});
    setRevision(r=>r+1);setNotice(ref+' marked as '+status+' (demo only).');
  }
  return <section className="em-page">
    <header className="page-header em-page-title">
      <div><p className="eyebrow">GROUND OPERATIONS · ESTATE MONITORING</p>
        <h1>{initialView==='map'?'Block map':'Estate inspections'}</h1>
        <p className="subtext">Inspect shared estate areas, document findings and explore block-level operational signals.</p>
      </div>
      <button className="primary-button" onClick={()=>openNew()} type="button"><Plus size={17}/> New observation</button>
    </header>
    <div className="em-caution"><AlertTriangle size={17}/>
      <span>Fictional locations and inspection records only. The block map is a schematic layout, not geographic coordinates or an official estate risk rating. All changes reset on refresh.</span>
    </div>
    {notice&&<div className="em-success" role="status"><CheckCircle2 size={17}/>{notice}
      <button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    <div className="em-nav-tabs">
      <Link to="/operations/inspections" className={initialView==='inspections'?'active':''}><ClipboardCheck size={16}/> Inspections</Link>
      <Link to="/operations/map" className={initialView==='map'?'active':''}><MapPin size={16}/> Block Map</Link>
      <Link to="/operations/insights"><ArrowRight size={15}/> Operational Insights</Link>
    </div>
    <div className="em-filter card">
      <label>Town Council
        <select value={councilId} onChange={e=>{setCouncilId(e.target.value);setSelectedBlock(null)}}>
          <option value="">All fictional councils</option>
          {councils.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {initialView==='inspections'&&<>
        <label>Status
          <select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['Open','Follow-up','Resolved'].map(s=><option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Category
          <select value={category} onChange={e=>setCategory(e.target.value)}>
            <option value="">All categories</option>
            {inspectionCategories.map(c=><option key={c}>{c}</option>)}
          </select>
        </label>
      </>}
      <button type="button" className="em-refresh" onClick={()=>setRevision(r=>r+1)}><RefreshCw size={15}/> Refresh</button>
    </div>
    {initialView==='inspections'?<>
      <div className="em-metrics">
        {[
          ['Inspections',summary.total],['Open or follow-up',summary.unresolved],
          ['High priority open',summary.high],['Photos attached',summary.photos]
        ].map(([label,value])=><div className="card em-metric" key={label}>
          <span>{label}</span><strong>{value}</strong>
        </div>)}
      </div>
      <div className="card em-list-card">
        <div className="em-list-toolbar">
          <label className="em-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search observations, blocks and officers..." aria-label="Search inspections"/></label>
          <span>{filtered.length} observation(s)</span>
        </div>
        {filtered.length===0?<div className="em-empty">No inspections match these filters.</div>:
          <div className="em-inspection-list">
            {filtered.map(i=><button type="button" key={i.ref} className="em-inspection-item" onClick={()=>setSelectedInspection(i.ref)}>
              <span className="em-item-symbol"><ClipboardCheck size={21}/></span>
              <span className="em-item-details"><strong>{i.category} · Blk {i.block}</strong>
                <small>{i.council} · {i.location}</small>
                <small>{formatDate(i.observedAt)} · {i.inspector}</small>
              </span>
              <span className="em-item-tags"><StatusTag status={i.status}/><StatusTag status={i.priority}/>{i.photoDataUrl&&<Camera size={16}/>}</span>
            </button>)}
          </div>}
      </div>
    </>:<>
      <div className="em-map-layout">
        <div className="card em-map-card">
          <div className="em-map-header"><div><h2>Illustrative block layout</h2><p>Markers represent fictional blocks and are not positioned on a real map.</p></div>
            <span>{blocks.length} blocks</span>
          </div>
          <div className="em-schematic">
            <div className="em-road em-road-1"/><div className="em-road em-road-2"/><div className="em-road em-road-3"/>
            {blocks.map((b,index)=><button
              type="button" key={b.key} className={'em-map-point em-risk-'+b.risk.toLowerCase()+(selectedBlock===b.key?' selected':'')}
              style={{left:String(9+(index%5)*20)+'%',top:String(13+(Math.floor(index/5)%5)*20)+'%'}}
              title={b.council+' — Blk '+b.block+' — '+b.risk+' (illustrative)'}
              onClick={()=>setSelectedBlock(b.key)}>
              <span>{b.block}</span>
            </button>)}
            {blocks.length===0&&<div className="em-map-empty">No fictional blocks in this selection.</div>}
            <div className="em-map-watermark">NOT A GEOGRAPHIC MAP</div>
          </div>
          <div className="em-map-legend">
            <span><i className="em-legend-low"/> Low</span><span><i className="em-legend-watch"/> Watch</span>
            <span><i className="em-legend-elevated"/> Elevated</span>
            <small>Illustrative score: recent open cases (lift cases ×2) + unresolved inspection observations</small>
          </div>
        </div>
        <aside className="card em-map-details">
          {block?<><p className="eyebrow">SELECTED BLOCK</p><h2>Blk {block.block}</h2>
            <p>{block.council}</p>
            <StatusTag status={block.risk}/>
            <dl className="em-map-facts">
              <div><dt>Demo risk score</dt><dd>{block.score}</dd></div>
              <div><dt>Recent open feedback</dt><dd>{block.openCases}</dd></div>
              <div><dt>Unresolved observations</dt><dd>{block.openObservations}</dd></div>
            </dl>
            <h3>Linked cases</h3>
            {block.cases.length?block.cases.slice(0,6).map(c=><div className="em-related" key={c.id}>
              <strong>{c.caseRef}</strong><small>{c.category} · {c.status}</small></div>):<p className="em-muted">No feedback records for this block.</p>}
            <h3>Inspection observations</h3>
            {block.inspections.length?block.inspections.slice(0,5).map(i=><button className="em-related em-related-button"
              key={i.ref} onClick={()=>setSelectedInspection(i.ref)}>
              <strong>{i.ref}</strong><small>{i.category} · {i.status}</small></button>):<p className="em-muted">No inspection observations recorded.</p>}
            <button type="button" className="primary-button em-new-at-block"
              onClick={()=>openNew({townCouncilId:block.townCouncilId,block:block.block})}><Plus size={16}/> Inspect this block</button>
          </>:<div className="em-map-instruction"><MapPin size={28}/><h2>Choose a block</h2>
            <p>Select any marker to see the contributing case and inspection records.</p></div>}
          <p className="em-small-disclaimer">The score is an interface demonstration, not a validated prediction or official Town Council grade.</p>
        </aside>
      </div>
    </>}
    {selectedInspection&&chosen&&!showForm&&<div className="em-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedInspection(null)}}>
      <section className="em-drawer" role="dialog" aria-modal="true" aria-label={'Inspection '+chosen.ref}>
        <header><div><p className="eyebrow">ESTATE OBSERVATION</p><h2>{chosen.ref}</h2></div>
          <button type="button" onClick={()=>setSelectedInspection(null)} aria-label="Close inspection"><X size={19}/></button></header>
        <div className="em-detail-tags"><StatusTag status={chosen.status}/><StatusTag status={chosen.priority}/></div>
        <h3>{chosen.category} — Blk {chosen.block}</h3>
        <p className="em-muted">{chosen.council} · {chosen.location}</p>
        {chosen.photoDataUrl?<img className="em-observation-photo" src={chosen.photoDataUrl} alt={'Inspection photo for '+chosen.ref}/>:
          <div className="em-image-placeholder"><Camera size={30}/><span>No photo attached</span></div>}
        <dl className="em-detail-fields">
          {[
            ['Observed',formatDateTime(chosen.observedAt)],
            ['Inspector',chosen.inspector],['Linked case',chosen.linkedCaseRef||'None']
          ].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
        </dl>
        <h3>Observation</h3><p className="em-note">{chosen.notes}</p>
        <div className="em-drawer-actions">
          {chosen.status!=='Follow-up'&&<button className="em-secondary" type="button"
            onClick={()=>changeStatus(chosen.ref,'Follow-up')}><ShieldAlert size={16}/> Flag follow-up</button>}
          {chosen.status!=='Resolved'&&<button className="primary-button" type="button"
            onClick={()=>changeStatus(chosen.ref,'Resolved')}><CheckCircle2 size={16}/> Mark resolved</button>}
          {chosen.status==='Resolved'&&<button className="em-secondary" type="button"
            onClick={()=>changeStatus(chosen.ref,'Open')}>Reopen</button>}
        </div>
        <p className="em-small-disclaimer">Status changes apply to this local demo only and reset on refresh.</p>
      </section>
    </div>}
    {showForm&&<div className="em-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!photoBusy)setShowForm(false)}}>
      <section className="em-drawer" role="dialog" aria-modal="true" aria-label="Create estate observation">
        <header><div><p className="eyebrow">GROUND OPERATIONS</p><h2>New inspection observation</h2></div>
          <button type="button" onClick={()=>setShowForm(false)} aria-label="Close form"><X size={19}/></button></header>
        <form className="em-form" onSubmit={submit}>
          <label>Town Council *
            <select required value={draft.townCouncilId} onChange={e=>update('townCouncilId',e.target.value)}>
              <option value="">Choose council</option>
              {councils.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="em-pair">
            <label>Block *<input required maxLength={10} value={draft.block} placeholder="210A" onChange={e=>update('block',e.target.value)}/></label>
            <label>Priority
              <select value={draft.priority} onChange={e=>update('priority',e.target.value as InspectionPriority)}>
                {['Low','Medium','High'].map(p=><option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <label>Inspection area *<input required maxLength={100} value={draft.location} onChange={e=>update('location',e.target.value)}/></label>
          <label>Category
            <select value={draft.category} onChange={e=>update('category',e.target.value as InspectionCategory)}>
              {inspectionCategories.map(c=><option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="em-pair">
            <label>Inspector name *<input required maxLength={80} placeholder="Inspector A" value={draft.inspector} onChange={e=>update('inspector',e.target.value)}/></label>
            <label>Observed at *<input required type="datetime-local" value={draft.observedAt} onChange={e=>update('observedAt',e.target.value)}/></label>
          </div>
          <label>Related feedback case (optional)
            <select value={draft.linkedCaseRef??''} onChange={e=>update('linkedCaseRef',e.target.value||null)}>
              <option value="">No linked case</option>
              {filteredCases.slice(0,80).map(c=><option key={c.id} value={c.caseRef}>{c.caseRef} — Blk {c.block} / {c.category}</option>)}
            </select>
          </label>
          <label>Observation details *
            <textarea required maxLength={1200} rows={5} value={draft.notes}
              placeholder="Describe what was observed and what follow-up is required"
              onChange={e=>update('notes',e.target.value)}/>
          </label>
          <div className="em-photo-field">
            <span><ImagePlus size={17}/> Inspection photo (optional)</span>
            {draft.photoDataUrl&&<img className="em-photo-preview" src={draft.photoDataUrl} alt="Selected observation"/>}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
              onChange={choosePhoto} aria-label="Choose inspection photo"/>
            <small>JPEG, PNG or WebP under 5 MB. Re-encoded to remove metadata, stored only in memory.</small>
            {draft.photoDataUrl&&<button type="button" className="em-secondary" onClick={()=>update('photoDataUrl',null)}>Remove photo</button>}
          </div>
          {photoError&&<div role="alert" className="notice error"><AlertTriangle size={16}/>{photoError}</div>}
          <div className="em-drawer-actions"><button type="button" className="em-secondary" onClick={()=>setShowForm(false)}>Cancel</button>
            <button className="primary-button" type="submit" disabled={photoBusy}>{photoBusy?'Processing photo…':'Save demo observation'}</button></div>
          <p className="em-small-disclaimer">Use fictional information only. No file, observation or location data is uploaded to a server.</p>
        </form>
      </section>
    </div>}
  </section>;
}
