import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { AreaChart, Area, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LayoutDashboard, MessageSquare, BarChart3, BellRing, ClipboardList, FileText, Bot, Search, Download, TrendingDown, TrendingUp, ShieldCheck, ArrowRight, AlertTriangle, Building2 } from 'lucide-react';

type Case = { id:string; council:string; location:string; category:string; received:string; status:string; officer:string };
type Kpi = { id:string; name:string; unit:string; value:number; target:number; trend:number; points:number[] };
type Alert = { id:string; council:string; title:string; severity:'Watch'|'Warning'|'Critical'; status:string; reason:string; date:string };
type Action = { id:string; title:string; owner:string; council:string; priority:string; status:string; due:string; alertId:string };
type Score = { council:string; period:string; score:number; change:number };
type ListResult<T> = { demo:boolean; data:T[] };
type Overview = { demo:boolean; summary:{councils:number;activeAlerts:number;openCases:number;activeActions:number};kpis:Kpi[];alerts:Alert[];scores:Score[] };

function useApi<T>(path:string) {
  const [data,setData] = useState<T|null>(null);
  const [error,setError] = useState('');
  useEffect(() => {
    let active=true;
    axios.get<T>('/api/'+path).then(r => { if(active) setData(r.data); }).catch(() => {
      if(active) setError('Cannot connect to the Estara API. Make sure npm run dev is running.');
    });
    return () => { active=false; };
  },[path]);
  return {data,error};
}
function State({error,ready}:{error:string;ready:boolean}) {
  if(error) return <div className="notice error"><AlertTriangle size={17}/>{error}</div>;
  if(!ready) return <div className="notice">Loading demonstration data...</div>;
  return null;
}
function Badge({value}:{value:string}) {
  return <span className={'badge '+value.toLowerCase().replaceAll(' ','-')}>{value}</span>;
}
function Heading({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtext">{description}</p></div>{action}</header>;
}
const nav = [
  {to:'/',label:'Overview',icon:LayoutDashboard,end:true},
  {to:'/cases',label:'Feedback Cases',icon:MessageSquare,end:false},
  {to:'/analytics',label:'KPI Analytics',icon:BarChart3,end:false},
  {to:'/alerts',label:'Early Warnings',icon:BellRing,end:false},
  {to:'/actions',label:'Corrective Actions',icon:ClipboardList,end:false},
  {to:'/reports',label:'Reports & Scores',icon:FileText,end:false},
  {to:'/assistant',label:'AI Assistant',icon:Bot,end:false}
];
function Sidebar() {
  return <aside className="sidebar">
    <Link className="brand" to="/"><img className="brand-logo" src="/estara-logo.webp" alt="Estara logo"/><div><strong>Estara</strong><small>PERFORMANCE INTELLIGENCE</small></div></Link>
    <p className="side-label">WORKSPACE</p>
    <nav className="nav">{nav.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => 'nav-item'+(isActive?' active':'')}><item.icon size={18}/><span>{item.label}</span></NavLink>)}</nav>
    <div className="side-bottom"><div className="side-info"><ShieldCheck size={17}/><div><strong>Demo environment</strong><p>Fictional sample records only</p></div></div><small>ESTARA · INITIAL SKELETON</small></div>
  </aside>;
}
function Layout() {
  return <div className="app-layout"><Sidebar/><main className="main-area"><div className="topbar"><div>Estara <span>/</span> Management workspace</div><span className="demo-pill"><i/> DEMO DATA</span></div><div className="content"><Routes>
    <Route index element={<Dashboard/>}/>
    <Route path="cases" element={<Cases/>}/>
    <Route path="analytics" element={<Analytics/>}/>
    <Route path="alerts" element={<Alerts/>}/>
    <Route path="actions" element={<Actions/>}/>
    <Route path="reports" element={<Reports/>}/>
    <Route path="assistant" element={<Assistant/>}/>
    <Route path="*" element={<div className="card">Page not found. <Link to="/">Return to dashboard</Link>.</div>}/>
  </Routes><footer>Estara prototype · All records and thresholds shown are illustrative, not EMS production data.</footer></div></main></div>;
}
function Dashboard(){
  const {data,error}=useApi<Overview>('overview');
  const trend=(data?.kpis[0]?.points ?? []).map((value,i)=>({month:['May','Jun','Jul','Aug','Sep','Oct'][i],value}));
  return <><Heading eyebrow="MANAGEMENT OVERVIEW" title="Performance at a glance" description="Monitor operational health, identify emerging risks and follow up on corrective actions." action={<span className="date-chip">October 2026 · Demo</span>}/><State error={error} ready={!!data}/>{data && <>
    <section className="stat-grid">
      <Stat icon={<Building2/>} label="Monitored districts" value={data.summary.councils} foot="Fictional demonstration areas" tone="blue"/>
      <Stat icon={<BellRing/>} label="Active warnings" value={data.summary.activeAlerts} foot="Awaiting review or follow-up" tone="amber"/>
      <Stat icon={<MessageSquare/>} label="Open cases" value={data.summary.openCases} foot="Reported feedback cases" tone="teal"/>
      <Stat icon={<ClipboardList/>} label="Active actions" value={data.summary.activeActions} foot="Follow-ups in progress" tone="purple"/>
    </section>
    <section className="dashboard-grid">
      <div className="card"><CardTitle title="Response rate trend" sub="Illustrative six-month history"/><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{top:10,right:15,left:-25,bottom:0}}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#26b4ba" stopOpacity={0.28}/><stop offset="100%" stopColor="#26b4ba" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid strokeDasharray="3 4" stroke="#e9eff4"/><XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/><YAxis domain={[80,100]} tick={{fontSize:11}} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="value" stroke="#159aa4" strokeWidth={3} fill="url(#area)"/></AreaChart></ResponsiveContainer></div><Link className="more" to="/analytics">View analytics <ArrowRight size={15}/></Link></div>
      <div className="card"><CardTitle title="Key performance indicators" sub="Latest synthetic KPI measurements"/><div className="kpi-stack">{data.kpis.map(k => <div className="kpi-item" key={k.id}><div><strong>{k.name}</strong><b>{k.value}{k.unit}</b></div><div className="progress"><span style={{width:Math.min(100,k.value)+'%'}}/></div><small>Illustrative target: {k.target}{k.unit} · Change: {k.trend>0?'+':''}{k.trend}</small></div>)}</div></div>
    </section>
    <section className="dashboard-grid"><div className="card"><CardTitle title="Recent early warnings" sub="Alerts needing management visibility"/>{data.alerts.map(a => <div className="list-row" key={a.id}><div className="round-icon"><AlertTriangle size={17}/></div><div className="grow"><strong>{a.title}</strong><small>{a.council} · {a.date}</small></div><Badge value={a.severity}/></div>)}<Link className="more" to="/alerts">See all warnings <ArrowRight size={15}/></Link></div><div className="card"><CardTitle title="Management scores" sub="Example district scorecards"/>{data.scores.map(s => <div className="score-row" key={s.council}><div><strong>{s.council}</strong><small>{s.period}</small></div><div className="score"><b>{s.score}</b><span className={s.change<0?'down':'up'}>{s.change>0?'+':''}{s.change}</span></div></div>)}<Link className="more" to="/reports">View reports <ArrowRight size={15}/></Link></div></section>
  </>}</>;
}
function Stat({icon,label,value,foot,tone}:{icon:ReactNode;label:string;value:number;foot:string;tone:string}) {
  return <article className="stat card"><span className={'stat-icon '+tone}>{icon}</span><p>{label}</p><strong>{value}</strong><small>{foot}</small></article>;
}
function CardTitle({title,sub}:{title:string;sub:string}){return <div className="card-head"><h2>{title}</h2><p>{sub}</p></div>}
function Cases(){
  const {data,error}=useApi<ListResult<Case>>('cases');const [query,setQuery]=useState('');
  const filtered=(data?.data??[]).filter(c=>[c.id,c.council,c.category,c.location,c.status].join(' ').toLowerCase().includes(query.toLowerCase()));
  return <><Heading eyebrow="DATA MANAGEMENT · CHARLES" title="Feedback cases" description="Review case records received by Town Councils, track case status and locate recurring issues."/><State error={error} ready={!!data}/>{data && <div className="card"><div className="table-tools"><label className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search cases, category or location..." aria-label="Search feedback cases"/></label><span className="count">{filtered.length} case(s)</span></div><div className="table-wrap"><table><thead><tr><th>Case ID</th><th>District</th><th>Location</th><th>Category</th><th>Received</th><th>Officer</th><th>Status</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td className="id">{c.id}</td><td>{c.council}</td><td>{c.location}</td><td>{c.category}</td><td>{c.received}</td><td>{c.officer}</td><td><Badge value={c.status}/></td></tr>)}</tbody></table>{!filtered.length&&<p className="empty">No matching cases.</p>}</div></div>}</>;
}
function Analytics(){
  const {data,error}=useApi<ListResult<Kpi>>('kpis'); const [selected,setSelected]=useState('K1');
  const current=data?.data.find(k=>k.id===selected)??data?.data[0];
  const points=(current?.points??[]).map((value,i)=>({period:['May','Jun','Jul','Aug','Sep','Oct'][i],value,target:current?.target}));
  return <><Heading eyebrow="PERFORMANCE ANALYTICS · JOEL" title="KPI analytics" description="Compare measurements against targets and explore changes across reporting periods."/><State error={error} ready={!!data}/>{data&&<><div className="metric-grid">{data.data.map(k=><button type="button" className={'metric card'+(selected===k.id?' selected':'')} key={k.id} onClick={()=>setSelected(k.id)}><span>{k.name}</span><strong>{k.value}{k.unit}</strong><small className={k.trend<0?'down':'up'}>{k.trend<0?<TrendingDown size={14}/>:<TrendingUp size={14}/>} {k.trend>0?'+':''}{k.trend} vs previous period</small></button>)}</div><div className="card"><CardTitle title={current?.name??'KPI history'} sub="Six example reporting periods with an illustrative target"/><div className="chart large"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{top:12,right:16,left:-22,bottom:4}}><CartesianGrid strokeDasharray="4 4" stroke="#e9eff4"/><XAxis dataKey="period" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Line dataKey="value" stroke="#119cac" strokeWidth={3} dot={{r:4}}/><Line dataKey="target" stroke="#e1a34d" strokeDasharray="6 5" dot={false}/></LineChart></ResponsiveContainer></div><p className="hint">Thresholds, projections and management scores must be verified with EMS before production use.</p></div></>}</>;
}
function Alerts(){
  const {data,error}=useApi<ListResult<Alert>>('alerts');const [filter,setFilter]=useState('All');
  const filtered=(data?.data??[]).filter(a=>filter==='All'||a.severity===filter);
  return <><Heading eyebrow="EARLY WARNING · BRINA" title="Early-warning alerts" description="See emerging risks, evidence and priority levels before performance issues escalate."/><State error={error} ready={!!data}/>{data&&<><div className="filter-bar">{['All','Critical','Warning','Watch'].map(f=><button key={f} className={filter===f?'filter active':'filter'} onClick={()=>setFilter(f)}>{f}</button>)}</div><div className="alerts-list">{filtered.map(a=><article className="alert-card card" key={a.id}><span className="alert-ico"><BellRing size={20}/></span><div className="grow"><div className="alert-line"><small>{a.id} · {a.council} · {a.date}</small><Badge value={a.severity}/></div><h2>{a.title}</h2><p>{a.reason}</p><div className="chip">Status: {a.status}</div></div></article>)}</div>{!filtered.length&&<div className="card empty">No alerts in this category.</div>}</>}</>;
}
function Actions(){
  const {data,error}=useApi<ListResult<Action>>('actions');
  return <><Heading eyebrow="CORRECTIVE ACTIONS · MAAHIRAH" title="Corrective actions" description="Track response plans, owners, deadlines and progress for emerging issues."/><State error={error} ready={!!data}/>{data&&<div className="action-grid">{data.data.map(a=><article className="card action" key={a.id}><div className="action-meta"><span className="id">{a.id}</span><Badge value={a.status}/></div><h2>{a.title}</h2><p>{a.council}</p><div className="action-details"><span>Assigned to <strong>{a.owner}</strong></span><span>Due <strong>{a.due}</strong></span><span>Priority <strong>{a.priority}</strong></span><span>Linked alert <strong>{a.alertId}</strong></span></div></article>)}</div>}</>;
}
function Reports(){
  const {data,error}=useApi<ListResult<Score>>('reports');
  function exportCsv(){
    if(!data)return;
    const lines=['Council,Period,Score,Change',...data.data.map(s=>[s.council,s.period,s.score,s.change].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(','))];
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='estara-demo-scores.csv';link.click();URL.revokeObjectURL(url);
  }
  return <><Heading eyebrow="MANAGEMENT REPORTING · PHOEBE" title="Reports & management scores" description="Compare example district scores and export a demonstration dataset." action={<button className="primary-button" onClick={exportCsv} disabled={!data}><Download size={16}/> Export CSV</button>}/><State error={error} ready={!!data}/>{data&&<><div className="report-grid">{data.data.map(s=><article className="card report" key={s.council}><p>{s.council}</p><strong>{s.score}<span>/ 100</span></strong><small className={s.change<0?'down':'up'}>{s.change>0?'+':''}{s.change} from prior report</small><p className="muted">{s.period}</p></article>)}</div><div className="notice">Power BI and PowerPoint exports are planned enhancements; they are not connected in this starter.</div></>}</>;
}
function Assistant(){
  return <><Heading eyebrow="AI INSIGHTS · SHARED" title="Estara AI assistant" description="Planned conversational analysis of authorised performance data."/><div className="ai-card card"><div className="ai-mark"><Bot size={35}/></div><h2>Intelligent summaries, coming soon.</h2><p>The AI assistant is not connected yet. In a future version, authorised managers could ask questions about trends, warnings and corrective actions using approved, verified data.</p><div className="prompts"><span>Why is the response rate declining?</span><span>Summarise this week's warnings</span><span>Which actions need attention?</span></div><p className="ai-warning"><ShieldCheck size={16}/> Do not upload real EMS or resident data to external AI services without approval.</p></div></>;
}
export default Layout;
