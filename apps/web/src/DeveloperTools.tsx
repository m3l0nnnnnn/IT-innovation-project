import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, RefreshCcw, ShieldCheck, UsersRound } from 'lucide-react';
import { auditEntries, addAuditEntry, useStudioVersion } from './studio-data';
import { DEMO_ROLES, useDemoRole, setDemoRole, type DemoRole } from './role-preview';
import './studio-pages.css';

type DemoUser={id:number;name:string;role:DemoRole;status:string};
const starting:DemoUser[]=[
  {id:1,name:'Demo Administrator',role:'Administrator',status:'Fictional profile'},
  {id:2,name:'Demo Operations Manager',role:'EMS Manager',status:'Fictional profile'},
  {id:3,name:'Demo Estate Officer',role:'Estate Officer',status:'Fictional profile'},
  {id:4,name:'Demo Inspector',role:'Field Inspector',status:'Fictional profile'},
  {id:5,name:'Demo Report Reader',role:'Management Viewer',status:'Fictional profile'}
];
export default function DeveloperTools(){
  useStudioVersion();
  const role=useDemoRole();
  const [users,setUsers]=useState(starting);
  const [status,setStatus]=useState<'Checking'|'Reachable'|'Unavailable'>('Checking');
  const [stamp,setStamp]=useState('');
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    setStatus('Checking');
    fetch('/api/health',{signal:abort.signal}).then(response=>{
      if(!response.ok)throw Error('API returned '+response.status);
      setStatus('Reachable');setStamp(new Date().toLocaleTimeString('en-SG'));
    }).catch(error=>{if(!abort.signal.aborted){setStatus('Unavailable');setStamp('API not responding: '+String(error instanceof Error?error.message:'Network error'));}});
    return ()=>abort.abort();
  },[version]);
  function changeRole(id:number,next:DemoRole){
    setUsers(items=>items.map(u=>u.id===id?{...u,role:next}:u));
    addAuditEntry('Demo user-role change','Fictional user #'+id+' assigned '+next+' in local view');
  }
  const events=auditEntries();
  return <section className="sp-page">
    <header className="page-header"><div><p className="eyebrow">PERSONAL WORKSPACE · DEVELOPMENT TOOLS</p>
      <h1>Prototype management</h1>
      <p className="subtext">Review demonstration accounts, client-side events and connection diagnostics without a separate Administration menu.</p>
    </div></header>
    <div className="sp-notice"><AlertTriangle size={17}/>
      Developer preview only. Changing a demo user's role does not create an account, change login permissions or modify Supabase.
    </div>
    <div className="sp-columns">
      <article className="card sp-panel"><h2><UsersRound size={18}/> Fictional user roles</h2>
        <p>Adjust sample assignments for future interface demonstrations.</p>
        <div className="sp-users">{users.map(user=><div className="sp-user-row" key={user.id}>
          <div><strong>{user.name}</strong><small>{user.status}</small></div>
          <select aria-label={'Role for '+user.name} value={user.role}
            onChange={e=>changeRole(user.id,e.target.value as DemoRole)}>
            {DEMO_ROLES.map(r=><option key={r}>{r}</option>)}
          </select>
        </div>)}</div>
        <h3>Current view</h3>
        <p>Showing {role} navigation. The actual role-preview selector is beneath your profile.</p>
        <button className="sp-secondary" onClick={()=>setDemoRole('Administrator')}><ShieldCheck size={15}/> Return to admin preview</button>
      </article>
      <article className="card sp-panel"><h2><Activity size={18}/> System status</h2>
        <p>This diagnostic only checks what the demo browser can verify.</p>
        <div className="sp-detail-list">
          <div><span>Frontend demo</span><strong>Running in this browser</strong></div>
          <div><span>Demo data</span><strong>In-memory / no persistence</strong></div>
          <div><span>Estara API health</span><strong>{status}</strong></div>
          <div><span>Last check</span><strong>{stamp||'Checking…'}</strong></div>
          <div><span>Supabase data access</span><strong>Not connected to prototype pages</strong></div>
          <div><span>Microsoft 365 / Teams</span><strong>Not configured</strong></div>
          <div><span>Real authentication</span><strong>Not implemented</strong></div>
          <div><span>Live early-warning delivery</span><strong>Not enabled</strong></div>
        </div>
        <button className="sp-secondary" onClick={()=>setVersion(v=>v+1)}><RefreshCcw size={15}/> Recheck API</button>
      </article>
    </div>
    <article className="card sp-panel"><h2><ClipboardList size={18}/> Demo activity log</h2>
      <p>Client-side actions from this page session. This is not an immutable security audit trail.</p>
      {events.map((entry,i)=><div className="sp-history-row" key={entry.when+i}>
        <div><strong>{entry.event}</strong><small>{entry.detail}</small></div>
        <span className="sp-tag">{new Date(entry.when).toLocaleTimeString('en-SG')}</span>
      </div>)}
    </article>
    <p className="sp-footnote">Production needs real authentication, server-enforced role permissions, audit retention and tenancy isolation.</p>
  </section>;
}
