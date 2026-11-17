import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Building2, ClipboardList, MessageSquare, ShieldCheck } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COUNCILS, METRICS, riskRecords, getActions, series, getRules, auditEntries, useStudioVersion } from './studio-data';
import { getDemoCasesSnapshot } from './ground-demo';
import { getDemoInspectionsSnapshot } from './ground-inspections';
import { useDemoRole, isPreviewVisible } from './role-preview';
import './studio-pages.css';
import './studio-dashboard.css';

const formatDate = (value:string) => new Date(value).toLocaleDateString('en-SG');
const overdue = (due:string) => {
  const now=new Date();
  const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  return due < today;
};

function Panel({title,children,link}:{title:string;children:ReactNode;link?:{to:string;label:string}}){
  return <article className="card sp-panel"><div className="sp-inline"><h2>{title}</h2>
    {link&&<Link className="sp-link" to={link.to}>{link.label}<ArrowRight size={15}/></Link>}
  </div>{children}</article>;
}
function Empty({children}:{children:ReactNode}){return <p className="rd-empty">{children}</p>;}
function Stats({items}:{items:{label:string;value:number|string;detail:string}[]}){
  const icons=[Building2,MessageSquare,AlertTriangle,ClipboardList];
  return <div className="sp-stats-grid">{items.map((item,i)=>{
    const Icon=icons[i%icons.length];
    return <div className="card sp-stat" key={item.label}><div className="sp-inline"><span>{item.label}</span><Icon size={21}/></div>
      <strong>{item.value}</strong><small>{item.detail}</small></div>;
  })}</div>;
}

export default function StudioDashboard(){
  useStudioVersion();
  const role=useDemoRole();
  const [councilId,setCouncilId]=useState(COUNCILS[0]?.id??'');
  const [inspector,setInspector]=useState('');
  const allCases=getDemoCasesSnapshot();
  const allInspections=getDemoInspectionsSnapshot();
  const allRisks=riskRecords().filter(r=>r.level!=='Healthy'&&r.state!=='Resolved');
  const allActions=getActions();
  const activeActions=allActions.filter(a=>a.status!=='Completed');
  const council=COUNCILS.find(c=>c.id===councilId)??COUNCILS[0];
  const inspections=allInspections.filter(i=>i.townCouncilId===councilId);
  const inspectors=[...new Set(inspections.map(i=>i.inspector))].sort();
  const selectedInspections=inspections.filter(i=>!inspector||i.inspector===inspector);
  const pendingInspections=selectedInspections.filter(i=>i.status!=='Resolved');
  const rules=getRules();
  const audit=auditEntries();
  const scorecards=COUNCILS.map(c=>{
    const points=series(c.id,'management');
    const latest=points.at(-1)?.value??0;
    return {...c,latest,change:Math.round((latest-(points.at(-2)?.value??latest))*10)/10,
      period:points.at(-1)?.month??'No data'};
  });
  const titles={
    Administrator:['System overview','Review demo data checks, warning configuration and recent workspace changes.'],
    'EMS Manager':['Performance at a glance','Review council performance, warnings and corrective-action follow-ups.'],
    'Field Inspector':['Inspection overview','Review recorded inspections and follow-up observations for a selected demonstration inspector.'],
    'Management Viewer':['Management overview','Review council scores, performance changes and corrective-action progress.']
  };
  const shortcuts=role==='Administrator'?
    [{to:'/risk/rules',label:'Warning rules'},{to:'/cases',label:'Feedback records'},{to:'/settings',label:'Profile & appearance'}]:
    role==='EMS Manager'?[{to:'/analytics',label:'KPI analytics'},{to:'/alerts',label:'Review warnings'},{to:'/actions',label:'Corrective actions'},{to:'/reports',label:'Management reports'}]:
    role==='Field Inspector'?[{to:'/operations/inspections',label:'Record / review inspections'},{to:'/operations/map',label:'Open block map'},{to:'/cases',label:'Feedback cases'}]:
    [{to:'/reports',label:'Reports, digest & downloads'},{to:'/analytics/trends',label:'Performance trends'},{to:'/assistant',label:'Insights assistant'}];

  function councilPicker(){return <label>Demonstration council<select value={councilId} onChange={e=>{
    setCouncilId(e.target.value);setInspector('');
  }}>{COUNCILS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>;}
  function warnings(){const items=allRisks;
    return <div className="sp-history-list">{items.slice(0,5).map(r=><Link className="sp-history-row rd-row-link" to="/alerts" key={r.id}>
      <div><strong>{r.metric.name}</strong><small>{r.council} · {r.current}{r.metric.unit} · {r.state}</small></div>
      <span className={'sp-pill sp-'+r.level.toLowerCase()}>{r.level}</span>
    </Link>)}{!items.length&&<Empty>No unresolved threshold concerns in this scope.</Empty>}</div>;
  }
  function actions(items=activeActions){return <div className="sp-history-list">{[...items].sort((a,b)=>a.due.localeCompare(b.due)).slice(0,5).map(a=><Link to="/actions" className="sp-history-row rd-row-link" key={a.id}>
    <div><strong>{a.title}</strong><small>{a.council} · {a.owner} · Due {formatDate(a.due)}</small></div>
    <span className={'sp-pill '+(overdue(a.due)?'sp-critical':'sp-planned')}>{overdue(a.due)?'Overdue':a.status}</span>
  </Link>)}{!items.length&&<Empty>No active corrective actions in this scope.</Empty>}</div>;}
  function history(){const chart=series(councilId,'response').map(p=>({month:p.month.slice(2),value:p.value}));
    return <><p className="rd-caption">{council?.name} · synthetic monthly acknowledgement rate (%)</p>
      <div className="sp-chart" role="img" aria-label={'Monthly acknowledgement-rate trend for '+council?.name}>
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--ui-border)"/>
        <XAxis dataKey="month" tick={{fontSize:10}}/><YAxis domain={[0,100]} tick={{fontSize:11}}/>
        <Tooltip/><Area dataKey="value" name="Acknowledgement rate (%)" stroke="#0ea7ae" fill="#1daeb43b" strokeWidth={3}/>
      </AreaChart></ResponsiveContainer></div></>;
  }

  return <section className="sp-page rd-dashboard">
    <header className="page-header"><div><p className="eyebrow">ESTARA · {role.toUpperCase()} DASHBOARD</p>
      <h1>{titles[role][0]}</h1><p className="subtext">{titles[role][1]}</p></div>
      <span className="sp-tag">{role} · demo</span></header>
    <div className="sp-notice"><ShieldCheck size={17}/>Fictional demonstration data. Switching roles changes this view; it does not sign in a user or enforce permissions.</div>
    <nav className="rd-shortcuts" aria-label="Dashboard shortcuts">{shortcuts.filter(s=>isPreviewVisible(role,s.to)).map(s=><Link className="sp-secondary" key={s.to} to={s.to}>{s.label}<ArrowRight size={14}/></Link>)}</nav>

    {role==='EMS Manager'&&<>
      <Stats items={[
        {label:'Monitored demo councils',value:COUNCILS.length,detail:'All demonstration councils'},
        {label:'Open feedback',value:allCases.filter(c=>c.status==='Open').length,detail:'Across all demonstration councils'},
        {label:'Unresolved risk flags',value:allRisks.length,detail:'Watch, Warning and Critical; excludes Resolved'},
        {label:'Active corrective actions',value:activeActions.length,detail:'Planned or in progress across all councils'}
      ]}/>
      <div className="sp-toolbar">{councilPicker()}<span className="rd-caption">Council filter applies to the chart and key indicators below. Other panels cover all councils.</span></div>
      <div className="sp-columns"><Panel title="Response-rate history" link={{to:'/analytics',label:'Analytics'}}>{history()}</Panel>
        <Panel title="Warnings needing review" link={{to:'/alerts',label:'All warnings'}}>{warnings()}</Panel></div>
      <div className="sp-columns"><Panel title="Councils needing attention"><div className="sp-history-list">{COUNCILS.map(c=>({c,risks:allRisks.filter(r=>r.councilId===c.id)})).filter(x=>x.risks.length).map(({c,risks})=><Link className="sp-history-row rd-row-link" to="/alerts" key={c.id}><div><strong>{c.name}</strong><small>{risks[0].metric.name} · {risks.length} unresolved flags</small></div><span className={'sp-pill sp-'+risks[0].level.toLowerCase()}>{risks[0].level}</span></Link>)}{!allRisks.length&&<Empty>No councils currently flagged by the demo rules.</Empty>}</div></Panel>
        <Panel title="Corrective actions to follow up" link={{to:'/actions',label:'All actions'}}>{actions()}</Panel></div>
      <Panel title={'Key indicators · '+council?.name} link={{to:'/analytics',label:'Explore scores'}}><div className="sp-mini-grid">{METRICS.map(m=><div key={m.id}><span>{m.name}</span><strong>{series(councilId,m.id).at(-1)?.value??'—'}{m.unit}</strong><small>Demo target: {m.higherBetter?'≥':'≤'} {m.threshold}{m.unit}</small></div>)}</div></Panel>
    </>}

    {role==='Administrator'&&<>
      <Stats items={[
        {label:'Demo councils',value:COUNCILS.length,detail:'Configured fictional councils'},
        {label:'Feedback records',value:allCases.length,detail:'In-memory demonstration records'},
        {label:'Unassigned open cases',value:allCases.filter(c=>c.status==='Open'&&!c.assignedOfficer).length,detail:'Records that may need an owner'},
        {label:'Enabled warning metrics',value:rules.enabled.length+'/'+METRICS.length,detail:'Under current demonstration rules'}
      ]}/>
      <div className="sp-columns"><Panel title="Data checks"><div className="sp-mini-grid">
        <div><span>Unknown council references</span><strong>{allCases.filter(c=>!COUNCILS.some(tc=>tc.id===c.townCouncilId)).length}</strong></div>
        <div><span>Missing category or block</span><strong>{allCases.filter(c=>!c.category.trim()||!c.block.trim()).length}</strong></div>
        <div><span>Missing / invalid received date</span><strong>{allCases.filter(c=>!Number.isFinite(Date.parse(c.receivedAt))).length}</strong></div>
      </div><p className="rd-caption">Checks apply to the current demo feedback records. This is not a database connection or import-health check.</p></Panel>
      <Panel title="Warning configuration" link={{to:'/risk/rules',label:'Review rules'}}><dl className="sp-detail-list">
        <div><dt>Warning buffer</dt><dd>{rules.buffer}</dd></div><div><dt>Forecast horizon</dt><dd>{rules.horizon} month(s)</dd></div>
        <div><dt>Enabled metrics</dt><dd>{rules.enabled.length}</dd></div></dl></Panel></div>
      <Panel title="Recent workspace changes"><div className="sp-history-list">{audit.slice(0,6).map((a,i)=><div className="sp-history-row" key={a.when+i}><div><strong>{a.event}</strong><small>{a.detail}</small><small>{new Date(a.when).toLocaleString('en-SG')} · {a.who}</small></div></div>)}{!audit.length&&<Empty>No recorded workspace changes yet.</Empty>}</div></Panel>
      <p className="sp-footnote">User administration, account approvals and import monitoring are not connected in this prototype. The history above records only the changes supported by the current in-memory demo.</p>
    </>}

    {role==='Field Inspector'&&<>
      <div className="sp-toolbar">{councilPicker()}<label>Demonstration inspector<select value={inspector} onChange={e=>setInspector(e.target.value)}><option value="">All inspectors</option>{inspectors.map(i=><option key={i}>{i}</option>)}</select></label></div>
      <p className="rd-caption">Filters select recorded observations, not a personal work assignment. A future inspection schedule is not implemented.</p>
      <Stats items={[
        {label:'Recorded inspections',value:selectedInspections.length,detail:'Selected council and inspector'},
        {label:'Open observations',value:selectedInspections.filter(i=>i.status==='Open').length,detail:'Records with Open status'},
        {label:'Follow-up observations',value:selectedInspections.filter(i=>i.status==='Follow-up').length,detail:'Records marked for follow-up'},
        {label:'Resolved observations',value:selectedInspections.filter(i=>i.status==='Resolved').length,detail:'Records with Resolved status'}
      ]}/>
      <div className="sp-columns"><Panel title="Observations to follow up" link={{to:'/operations/inspections',label:'Inspections'}}><div className="sp-history-list">{[...pendingInspections].sort((a,b)=>({High:0,Medium:1,Low:2}[a.priority]-{High:0,Medium:1,Low:2}[b.priority])||a.observedAt.localeCompare(b.observedAt)).slice(0,6).map(i=><Link className="sp-history-row rd-row-link" to="/operations/inspections" key={i.id}><div><strong>{i.ref} · {i.category}</strong><small>Block {i.block} · {i.location} · {i.inspector}</small><small>{i.priority} priority · {i.status} · {formatDate(i.observedAt)}</small></div><ArrowRight size={15}/></Link>)}{!pendingInspections.length&&<Empty>No pending observations match these filters.</Empty>}</div></Panel>
      <Panel title="Recent recorded findings"><div className="sp-history-list">{[...selectedInspections].sort((a,b)=>b.observedAt.localeCompare(a.observedAt)).slice(0,4).map(i=><div className="sp-history-row" key={i.id}><div><strong>{i.ref} · Block {i.block}</strong><small>{i.notes}</small><small>{i.photoDataUrl?'Photo recorded':'No photo recorded'} · {i.linkedCaseRef??'No linked feedback case'}</small></div></div>)}{!selectedInspections.length&&<Empty>No inspection records match these filters.</Empty>}</div></Panel></div>
    </>}

    {role==='Management Viewer'&&<>
      <Stats items={[
        {label:'Demo councils',value:COUNCILS.length,detail:'Portfolio overview'},
        {label:'Scores down this month',value:scorecards.filter(c=>c.change<0).length,detail:'Compared with each council’s previous month'},
        {label:'Critical risk flags',value:allRisks.filter(r=>r.level==='Critical').length,detail:'Unresolved flags under demo rules'},
        {label:'Completed actions',value:allActions.filter(a=>a.status==='Completed').length+'/'+allActions.length,detail:'Recorded completion; not proof of effectiveness'}
      ]}/>
      <Panel title="Council scorecards" link={{to:'/reports',label:'Reports & downloads'}}><div className="sp-report-grid rd-scorecards">{scorecards.map(c=><div className="sp-report card" key={c.id}><p>{c.name}</p><strong className="sp-large">{c.latest}<small>/100</small></strong><span className={c.change<0?'sp-trend-down':'sp-trend-up'}>{c.change>0?'+':''}{c.change} vs previous month</span><small>{c.period} · synthetic score</small></div>)}</div></Panel>
      <div className="sp-toolbar">{councilPicker()}<span className="rd-caption">Selects the trend chart only. Scorecards and summaries cover all councils.</span></div>
      <div className="sp-columns"><Panel title="Performance trend" link={{to:'/analytics/trends',label:'Explore trends'}}>{history()}</Panel>
      <Panel title="Major risk summary" link={{to:'/alerts',label:'View warnings'}}>{warnings()}</Panel></div>
      <Panel title="Corrective-action progress"><div className="sp-mini-grid">{(['Planned','In Progress','Completed'] as const).map(status=><div key={status}><span>{status}</span><strong>{allActions.filter(a=>a.status===status).length}</strong></div>)}</div><p className="rd-caption">This is a summary of recorded action status. Before-and-after outcome evidence should be reviewed in the management report.</p></Panel>
    </>}
    <p className="sp-footnote">Dashboard links open the corresponding module. Council / person filters on this dashboard do not automatically carry over to other pages. Demo records and changes are held in memory and reset on reload.</p>
  </section>;
}
