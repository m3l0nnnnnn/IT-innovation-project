import { useEffect, useMemo, useState, type FormEvent } from 'react';
import axios from 'axios';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardList, Clock3, FilePlus2, FilterX, Pencil, RefreshCcw, Search, X
} from 'lucide-react';
import './ground-operations.css';

type CaseStatus = 'Open' | 'Closed';
type CaseItem = {
  id: string; caseRef: string; townCouncilId: string; council: string;
  block: string; street: string | null; postalCode: string | null;
  location: string | null; category: string; channel: string;
  description: string | null; status: CaseStatus; assignedOfficer: string | null;
  duplicateOfId: string | null; duplicateOfRef: string | null;
  receivedAt: string; acknowledgedAt: string | null; closedAt: string | null;
  updatedAt: string;
  duplicates?: {id:string; caseRef:string; status:CaseStatus; receivedAt:string}[];
};
type ListResponse = {data:CaseItem[];total:number;page:number;pageSize:number};
type SummaryResponse = {data:{total:number;open:number;closed:number;overdue:number;unacknowledged:number};overdueAfterDays:number};
type MetaResponse = {councils:{id:string;name:string}[];categories:string[];channels:string[];statuses:CaseStatus[]};
type Draft = {
  townCouncilId:string;block:string;street:string;postalCode:string;
  location:string;category:string;channel:string;description:string;
  assignedOfficer:string;receivedAt:string;
};
const LIMIT=25;
const emptyDraft:Draft={
  townCouncilId:'',block:'',street:'',postalCode:'',location:'',
  category:'Cleanliness',channel:'OneService',description:'',assignedOfficer:'',
  receivedAt:''
};
function datetimeInput(value:Date) {
  const local=new Date(value.getTime()-value.getTimezoneOffset()*60_000);
  return local.toISOString().slice(0,16);
}
function dateLabel(value:string|null|undefined) {
  if(!value)return '—';
  const d=new Date(value);
  return Number.isFinite(d.getTime())
    ?d.toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'}):'—';
}
function ageDays(value:string) {
  return Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86_400_000));
}
function messageOf(error:unknown):string {
  if(axios.isAxiosError(error)){
    const body=error.response?.data as {message?:string;issues?:{message:string}[]} | undefined;
    if(body?.issues?.length)return body.issues.map(i=>i.message).join('; ');
    return body?.message??'Unable to reach the API. Check the backend connection.';
  }
  return error instanceof Error?error.message:'An unexpected error occurred.';
}
function formFrom(row:CaseItem):Draft {
  return {
    townCouncilId:row.townCouncilId,block:row.block,street:row.street??'',
    postalCode:row.postalCode??'',location:row.location??'',category:row.category,
    channel:row.channel,description:row.description??'',
    assignedOfficer:row.assignedOfficer??'',receivedAt:datetimeInput(new Date(row.receivedAt))
  };
}
function casePayload(form:Draft){
  return {
    townCouncilId:form.townCouncilId,
    block:form.block.trim().toUpperCase(),
    street:form.street.trim()||null,
    postalCode:form.postalCode.trim()||null,
    location:form.location.trim()||null,
    category:form.category,
    channel:form.channel,
    description:form.description.trim()||null,
    assignedOfficer:form.assignedOfficer.trim()||null,
    receivedAt:new Date(form.receivedAt).toISOString()
  };
}
export default function GroundCases(){
  const [meta,setMeta]=useState<MetaResponse|null>(null);
  const [records,setRecords]=useState<ListResponse|null>(null);
  const [summary,setSummary]=useState<SummaryResponse|null>(null);
  const [query,setQuery]=useState('');
  const [stableQuery,setStableQuery]=useState('');
  const [townCouncilId,setTownCouncilId]=useState('');
  const [category,setCategory]=useState('');
  const [status,setStatus]=useState('');
  const [tab,setTab]=useState<'all'|'outstanding'>('all');
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState('receivedAt');
  const [order,setOrder]=useState<'asc'|'desc'>('desc');
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedRef,setSelectedRef]=useState<string|null>(null);
  const [detail,setDetail]=useState<CaseItem|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detailError,setDetailError]=useState('');
  const [editing,setEditing]=useState<'new'|'existing'|null>(null);
  const [draft,setDraft]=useState<Draft>(emptyDraft);
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    let active=true;
    axios.get<MetaResponse>('/api/cases/meta')
      .then(({data})=>{if(active)setMeta(data)})
      .catch(e=>{if(active)setError(messageOf(e))});
    return ()=>{active=false};
  },[]);
  useEffect(()=>{
    const id=window.setTimeout(()=>setStableQuery(query.trim()),280);
    return ()=>window.clearTimeout(id);
  },[query]);
  const params=useMemo(()=>{
    const p=new URLSearchParams({page:String(page),pageSize:String(LIMIT),sort,order});
    if(stableQuery)p.set('q',stableQuery);
    if(townCouncilId)p.set('townCouncilId',townCouncilId);
    if(category)p.set('category',category);
    if(tab==='outstanding'){
      p.set('overdue','true');
    } else if(status){
      p.set('status',status);
    }
    return p.toString();
  },[page,sort,order,stableQuery,townCouncilId,category,tab,status]);

  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    axios.get<ListResponse>('/api/cases?'+params).then(({data})=>{
      if(active){setRecords(data);setLoading(false)}
    }).catch(e=>{if(active){setError(messageOf(e));setLoading(false)}});
    return ()=>{active=false};
  },[params,revision]);

  useEffect(()=>{
    let active=true;
    const p=new URLSearchParams();
    if(townCouncilId)p.set('townCouncilId',townCouncilId);
    axios.get<SummaryResponse>('/api/cases/summary?'+p.toString()).then(({data})=>{
      if(active)setSummary(data)
    }).catch(()=>{if(active)setSummary(null)});
    return ()=>{active=false};
  },[townCouncilId,revision]);

  useEffect(()=>{
    if(!selectedRef){setDetail(null);return;}
    let active=true;
    setDetailLoading(true);setDetailError('');
    axios.get<{data:CaseItem}>('/api/cases/'+encodeURIComponent(selectedRef)).then(({data})=>{
      if(active){setDetail(data.data);setDetailLoading(false)}
    }).catch(e=>{if(active){setDetail(null);setDetailLoading(false);setDetailError(messageOf(e))}});
    return ()=>{active=false};
  },[selectedRef,revision]);

  function chooseTab(next:'all'|'outstanding'){setTab(next);setPage(1);setSelectedRef(null)}
  function resetFilters(){
    setQuery('');setStableQuery('');setCategory('');setTownCouncilId('');setStatus('');
    setPage(1);setSort('receivedAt');setOrder('desc');
  }
  function openCreate(){
    setSelectedRef(null);setFormError('');
    setDraft({...emptyDraft,townCouncilId:townCouncilId||meta?.councils[0]?.id||'',receivedAt:datetimeInput(new Date())});
    setEditing('new');
  }
  function openEdit(){
    if(!detail)return;
    setDraft(formFrom(detail));setFormError('');setEditing('existing');
  }
  async function save(event:FormEvent){
    event.preventDefault();setFormError('');
    if(!draft.receivedAt||!Number.isFinite(new Date(draft.receivedAt).getTime())){
      setFormError('Enter a valid received date and time.');return;
    }
    if(!draft.description.trim()){setFormError('Add a description so officers can understand the feedback.');return}
    setSaving(true);
    try {
      if(editing==='new'){
        const {data}=await axios.post<{data:CaseItem}>('/api/cases',casePayload(draft));
        setSelectedRef(data.data.caseRef);
        setNotice('Case '+data.data.caseRef+' created successfully.');
      } else if(detail) {
        await axios.patch('/api/cases/'+encodeURIComponent(detail.caseRef),casePayload(draft));
        setNotice('Case '+detail.caseRef+' updated successfully.');
      }
      setEditing(null);setRevision(v=>v+1);
    } catch(e){setFormError(messageOf(e))}
    finally{setSaving(false)}
  }
  async function updateStatus(patch:Record<string,string>,description:string){
    if(!detail)return;
    if(!window.confirm(description+' for '+detail.caseRef+'?'))return;
    setSaving(true);setDetailError('');
    try{
      await axios.patch('/api/cases/'+encodeURIComponent(detail.caseRef),patch);
      setNotice('Case '+detail.caseRef+' updated.');
      setRevision(v=>v+1);
    } catch(e){setDetailError(messageOf(e))}
    finally{setSaving(false)}
  }
  const totalPages=Math.max(1,Math.ceil((records?.total??0)/LIMIT));
  return <section className="ground-page">
    <header className="page-header ground-heading">
      <div>
        <p className="eyebrow">GROUND OPERATIONS · FEEDBACK MANAGEMENT</p>
        <h1>Feedback cases</h1>
        <p className="subtext">Track resident feedback, investigate overdue issues and follow cases through resolution.</p>
      </div>
      <button className="primary-button" type="button" onClick={openCreate} disabled={!meta}>
        <FilePlus2 size={16}/> New case
      </button>
    </header>
    <div className="ground-note"><AlertTriangle size={17}/>
      <span>Prototype workspace using synthetic data. The 7-day overdue threshold is illustrative and requires EMS confirmation.</span>
    </div>
    {notice&&<div className="ground-success" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
    <div className="ground-stats">
      {[
        ['Total cases',summary?.data.total,'All case records'],
        ['Open',summary?.data.open,'Awaiting closure'],
        ['Overdue',summary?.data.overdue,'Open for more than 7 days'],
        ['Unacknowledged',summary?.data.unacknowledged,'Open without a recorded acknowledgement']
      ].map(([label,value,sub])=><div className="card ground-stat" key={String(label)}>
        <span>{label}</span><strong>{typeof value==='number'?value.toLocaleString('en-SG'):'—'}</strong><small>{sub}</small>
      </div>)}
    </div>
    <div className="ground-tabs" role="tablist" aria-label="Feedback case views">
      <button role="tab" aria-selected={tab==='all'} className={tab==='all'?'active':''} onClick={()=>chooseTab('all')} type="button">All Cases</button>
      <button role="tab" aria-selected={tab==='outstanding'} className={tab==='outstanding'?'active':''} onClick={()=>chooseTab('outstanding')} type="button"><Clock3 size={16}/> Overdue Cases</button>
    </div>
    <div className="card ground-workspace">
      <div className="ground-filter-bar">
        <label className="ground-search">
          <Search size={17}/>
          <span className="sr-only">Search cases</span>
          <input value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Search reference, block or description..."/>
        </label>
        <label>
          <span>Town Council</span>
          <select value={townCouncilId} onChange={e=>{setTownCouncilId(e.target.value);setPage(1)}}>
            <option value="">All councils</option>
            {meta?.councils.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}}>
            <option value="">All categories</option>
            {meta?.categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {tab==='all'&&<label>
          <span>Status</span>
          <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}>
            <option value="">All statuses</option>
            {meta?.statuses.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </label>}
        <button className="ground-quiet" type="button" onClick={resetFilters}><FilterX size={16}/> Clear</button>
      </div>
      <div className="ground-table-toolbar">
        <p>{records?.total.toLocaleString('en-SG')??'—'} matching case(s)</p>
        <label>Sort by <select value={sort+':'+order} onChange={e=>{
          const [nextSort,nextOrder]=e.target.value.split(':');setSort(nextSort);setOrder(nextOrder as 'asc'|'desc');setPage(1)
        }}>
          <option value="receivedAt:desc">Newest first</option><option value="receivedAt:asc">Oldest first</option>
          <option value="caseRef:asc">Reference (A–Z)</option><option value="category:asc">Category</option>
        </select></label>
        <button type="button" className="ground-refresh" aria-label="Refresh cases" onClick={()=>setRevision(v=>v+1)}><RefreshCcw size={16}/></button>
      </div>
      {error&&<div className="notice error" role="alert"><AlertTriangle size={17}/>{error}</div>}
      {loading?<p className="ground-state">Loading feedback records...</p>:!records?.data.length?
        <p className="ground-state">No cases match these filters.</p>:
        <div className="table-wrap">
          <table className="ground-table"><thead><tr>
            <th scope="col">Reference</th><th scope="col">Council / Location</th>
            <th scope="col">Category</th><th scope="col">Received</th>
            <th scope="col">Officer</th><th scope="col">Status</th><th scope="col">Age</th>
          </tr></thead><tbody>
            {records.data.map(c=><tr key={c.id}>
              <td><button type="button" className="ground-ref" onClick={()=>{setEditing(null);setSelectedRef(c.caseRef)}}>{c.caseRef}</button></td>
              <td><strong>{c.council}</strong><small>Blk {c.block}{c.location?' · '+c.location:''}</small></td>
              <td>{c.category}</td>
              <td>{dateLabel(c.receivedAt)}</td>
              <td>{c.assignedOfficer||'Unassigned'}</td>
              <td><span className={'badge '+c.status.toLowerCase()}>{c.status}</span></td>
              <td>{c.status==='Open'?ageDays(c.receivedAt)+' days':'—'}</td>
            </tr>)}
          </tbody></table>
        </div>}
      <div className="ground-pagination">
        <span>Page {page} of {totalPages} · {LIMIT} per page</span>
        <div><button type="button" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/> Previous</button>
          <button type="button" disabled={page>=totalPages||loading} onClick={()=>setPage(p=>p+1)}>Next <ChevronRight size={16}/></button></div>
      </div>
    </div>
    {selectedRef&&!editing&&<div className="ground-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedRef(null)}}>
      <section className="ground-drawer" role="dialog" aria-modal="true" aria-label={'Case '+selectedRef}>
        <header><div><p className="eyebrow">FEEDBACK CASE DETAILS</p><h2>{selectedRef}</h2></div>
          <button type="button" className="ground-icon-button" onClick={()=>setSelectedRef(null)} aria-label="Close case details"><X size={19}/></button>
        </header>
        {detailLoading?<p className="ground-state">Loading details...</p>:detailError?<div className="notice error">{detailError}</div>:detail&&<>
          <div className="ground-detail-status"><span className={'badge '+detail.status.toLowerCase()}>{detail.status}</span>
            <span>{detail.council}</span></div>
          <dl className="ground-details">
            {[
              ['Received',dateLabel(detail.receivedAt)],['Category',detail.category],
              ['Channel',detail.channel],['Location','Block '+detail.block+(detail.street?', '+detail.street:'')+(detail.location?' · '+detail.location:'')],
              ['Assigned officer',detail.assignedOfficer||'Unassigned'],
              ['Acknowledged',dateLabel(detail.acknowledgedAt)],
              ['Closed',dateLabel(detail.closedAt)],
              ['Linked duplicate',detail.duplicateOfRef??'None']
            ].map(([key,val])=><div key={key}><dt>{key}</dt><dd>{val}</dd></div>)}
          </dl>
          <h3>Feedback description</h3>
          <p className="ground-description">{detail.description||'No description supplied.'}</p>
          {detail.duplicates?.length?<>
            <h3>Cases linked as duplicates</h3>
            {detail.duplicates.map(d=><button className="ground-related" type="button" key={d.id} onClick={()=>setSelectedRef(d.caseRef)}>
              {d.caseRef} · {d.status} <ChevronRight size={15}/></button>)}
          </>:null}
          <div className="ground-drawer-actions">
            <button className="ground-secondary" type="button" onClick={openEdit}><Pencil size={16}/> Edit case</button>
            {detail.status==='Open'&&!detail.acknowledgedAt&&
              <button className="ground-secondary" type="button" disabled={saving}
                onClick={()=>updateStatus({acknowledgedAt:new Date().toISOString()},'Record acknowledgement')}>Acknowledge</button>}
            <button className="primary-button" type="button" disabled={saving}
              onClick={()=>updateStatus({status:detail.status==='Open'?'Closed':'Open'},detail.status==='Open'?'Close case':'Reopen case')}>
              <CheckCircle2 size={16}/>{detail.status==='Open'?'Close case':'Reopen case'}
            </button>
          </div>
          <p className="ground-warning">Prototype controls update the connected synthetic database. No production permissions are configured yet.</p>
        </>}
      </section>
    </div>}
    {editing&&<div className="ground-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setEditing(null)}}>
      <section className="ground-drawer" role="dialog" aria-modal="true" aria-label={editing==='new'?'Create new case':'Edit feedback case'}>
        <header><div><p className="eyebrow">GROUND OPERATIONS</p><h2>{editing==='new'?'Create feedback case':'Edit '+detail?.caseRef}</h2></div>
          <button className="ground-icon-button" type="button" disabled={saving} onClick={()=>setEditing(null)} aria-label="Close form"><X size={19}/></button>
        </header>
        <form onSubmit={save} className="ground-form">
          <label>Town Council *
            <select required value={draft.townCouncilId} onChange={e=>setDraft(d=>({...d,townCouncilId:e.target.value}))}>
              <option value="">Select a council</option>
              {meta?.councils.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="ground-form-pair">
            <label>Block number *
              <input required pattern="[0-9]{1,4}[a-zA-Z]?" placeholder="210A" value={draft.block} onChange={e=>setDraft(d=>({...d,block:e.target.value}))}/>
            </label>
            <label>Postal code
              <input inputMode="numeric" pattern="[0-9]{6}" placeholder="123456" value={draft.postalCode} onChange={e=>setDraft(d=>({...d,postalCode:e.target.value}))}/>
            </label>
          </div>
          <label>Street<input value={draft.street} maxLength={200} onChange={e=>setDraft(d=>({...d,street:e.target.value}))}/></label>
          <label>Specific location<input value={draft.location} maxLength={200} placeholder="Lift lobby" onChange={e=>setDraft(d=>({...d,location:e.target.value}))}/></label>
          <div className="ground-form-pair">
            <label>Category *
              <select required value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value}))}>
                {meta?.categories.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Channel *
              <select required value={draft.channel} onChange={e=>setDraft(d=>({...d,channel:e.target.value}))}>
                {meta?.channels.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label>Received at *
            <input required type="datetime-local" value={draft.receivedAt} onChange={e=>setDraft(d=>({...d,receivedAt:e.target.value}))}/>
          </label>
          <label>Assigned officer
            <input maxLength={100} placeholder="Officer name" value={draft.assignedOfficer} onChange={e=>setDraft(d=>({...d,assignedOfficer:e.target.value}))}/>
          </label>
          <label>Description *
            <textarea required rows={4} maxLength={2000} value={draft.description} placeholder="Describe the feedback without personal resident details" onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/>
          </label>
          {formError&&<div className="notice error" role="alert">{formError}</div>}
          <div className="ground-drawer-actions">
            <button type="button" className="ground-secondary" disabled={saving} onClick={()=>setEditing(null)}><ArrowLeft size={15}/> Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving?'Saving…':editing==='new'?'Create case':'Save changes'}</button>
          </div>
          <p className="ground-warning">Use synthetic information only. RBAC and auditing must be completed before any production deployment.</p>
        </form>
      </section>
    </div>}
  </section>;
}
