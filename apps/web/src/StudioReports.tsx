import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, Copy, Download, FileText, Printer, ShieldCheck } from 'lucide-react';
import { COUNCILS, METRICS, series, getActions, riskRecords, weeklyDigest,
  operationsSnapshot, useStudioVersion } from './studio-data';
import './studio-pages.css';

type View='scores'|'digest'|'exports';
function csvCell(value:unknown){
  let s=String(value??'');
  if(/^\s*[=+\-@\t\r]/.test(s))s="'"+s; // avoid Excel formula execution
  return '"'+s.replaceAll('"','""')+'"';
}
function download(filename:string,data:string,mime:string){
  const url=URL.createObjectURL(new Blob(['\ufeff',data],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),4000);
}
export default function StudioReports(){
  useStudioVersion();
  const [councilId,setCouncilId]=useState('');
  const [view,setView]=useState<View>('scores');
  const [copied,setCopied]=useState(false);
  const councils=COUNCILS.filter(c=>!councilId||c.id===councilId);
  const rows=councils.map(c=>{
    const points=series(c.id,'management');
    const latest=points.at(-1)?.value??0;
    return {council:c,period:points.at(-1)?.month??'—',score:latest,
      change:Math.round((latest-(points.at(-2)?.value??latest))*10)/10};
  });
  const digest=weeklyDigest(councilId);
  const snap=operationsSnapshot();
  const digestText=[
    'ESTARA — FICTIONAL MANAGEMENT DIGEST',
    'Scope: '+(COUNCILS.find(c=>c.id===councilId)?.name??'All demonstration councils'),
    'Generated: '+new Date().toLocaleDateString('en-SG'),
    'Management scores: '+rows.map(r=>r.council.name+' '+r.score+'/100 (synthetic)').join('; '),
    'Hypothetical warnings: '+digest.risk.length,
    ...digest.risk.slice(0,10).map(r=>'- '+r.council+': '+r.metric.name+' ['+r.level+']'),
    'Open actions: '+digest.actions.length,
    ...digest.actions.slice(0,10).map(a=>'- '+a.title+' / '+a.owner+' / '+a.status+' / due '+a.due),
    'FICTIONAL DATA — NOT AN OFFICIAL EMS REPORT'
  ].join('\n');
  function csv(data:unknown[][],name:string){
    download(name,data.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }
  function exportScores(){
    csv([['Council','Month','Synthetic management score','Change','Data status'],
      ...rows.map(r=>[r.council.name,r.period,r.score,r.change,'FICTIONAL DEMO'])],
    'estara-management-scores-DEMO.csv');
  }
  function exportHistory(){
    csv([['Council','Metric','Month','Value','Illustrative target','Unit','Data status'],
      ...councils.flatMap(c=>METRICS.flatMap(m=>series(c.id,m.id)
        .map(p=>[c.name,m.name,p.month,p.value,m.threshold,m.unit,'FICTIONAL DEMO'])))],
    'estara-kpi-history-DEMO.csv');
  }
  function copyDigest(){
    if(!navigator.clipboard){download('estara-digest-DEMO.txt',digestText,'text/plain');return;}
    void navigator.clipboard.writeText(digestText).then(()=>{
      setCopied(true);window.setTimeout(()=>setCopied(false),2000);
    }).catch(()=>download('estara-digest-DEMO.txt',digestText,'text/plain'));
  }
  return <section className="sp-page sp-report-page">
    <header className="page-header"><div><p className="eyebrow">MANAGEMENT REPORTS · PHOEBE</p>
      <h1>Management reporting</h1>
      <p className="subtext">Review fictional scorecards, prepare management digests and export synthetic datasets.</p></div>
      <button className="primary-button" onClick={()=>window.print()}><Printer size={16}/> Print / Save PDF</button>
    </header>
    <div className="sp-notice"><ShieldCheck size={16}/>
      Simulated scores are not official EMS management results. Forecasts and alerts are estimates; exports contain fictional data only.
    </div>
    <div className="sp-toolbar card">
      <label>Reporting scope<select value={councilId} onChange={e=>setCouncilId(e.target.value)}>
        <option value="">All demo councils</option>{COUNCILS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label><span className="sp-tag">Monthly synthetic records · 2025–2026</span>
    </div>
    <div className="sp-tabs" role="tablist" aria-label="Management reports views">
      {[{key:'scores',name:'Scores & Reports',icon:FileText},{key:'digest',name:'Weekly Digest',icon:CalendarDays},{key:'exports',name:'Exports',icon:Download}].map(t=>
        <button key={t.key} role="tab" aria-selected={view===t.key} className={view===t.key?'active':''}
          onClick={()=>setView(t.key as View)}><t.icon size={16}/>{t.name}</button>)}
    </div>
    {view==='scores'&&<>
      <div className="sp-report-grid">{rows.map(r=><article className="card sp-report" key={r.council.id}>
        <p>{r.council.name}</p><div className="sp-large">{r.score.toFixed(1)}<small>/100</small></div>
        <span className={r.change>=0?'sp-trend-up':'sp-trend-down'}>{r.change>=0?'+':''}{r.change.toFixed(1)} vs prior month</span>
        <small>{r.period} · Simulated score</small></article>)}</div>
      <article className="card sp-panel"><h2>Management summary</h2>
        <div className="sp-stats-strip">
          <div><span>Feedback cases</span><strong>{snap.cases}</strong></div>
          <div><span>Currently open</span><strong>{snap.open}</strong></div>
          <div><span>Overdue (demo rule)</span><strong>{snap.overdue}</strong></div>
          <div><span>Hypothetical risks</span><strong>{riskRecords(councilId).filter(r=>r.level!=='Healthy').length}</strong></div>
          <div><span>Corrective actions</span><strong>{getActions().filter(a=>!councilId||a.councilId===councilId).length}</strong></div>
        </div>
        <p className="sp-footnote">Ground Operations totals are aggregated separately from the fictitious management-score series. No official scoring formula is implied.</p>
        <Link className="sp-link" to="/analytics">Inspect KPI performance</Link>
      </article>
    </>}
    {view==='digest'&&<div className="sp-columns">
      <article className="card sp-panel"><h2>Weekly management digest · draft</h2>
        <p>Based on current simulated alerts and open follow-up actions.</p>
        <h3>Priority warnings ({digest.risk.length})</h3>
        {digest.risk.slice(0,10).map(r=><div className="sp-digest-item" key={r.id}><strong>{r.metric.name}</strong>
          <small>{r.council} · {r.level}</small></div>)}
        {!digest.risk.length&&<p>No demo warnings.</p>}
        <h3>Active actions ({digest.actions.length})</h3>
        {digest.actions.slice(0,10).map(a=><div className="sp-digest-item" key={a.id}><strong>{a.title}</strong>
          <small>{a.owner} · due {a.due} · {a.status}</small></div>)}
        {!digest.actions.length&&<p>No open demo actions.</p>}
      </article>
      <article className="card sp-panel"><h2>Draft for handover</h2><p>Copy the text to an email or Teams message manually.</p>
        <pre className="sp-digest-text">{digestText}</pre>
        <button className="primary-button" onClick={copyDigest}>{copied?<Check size={16}/>:<Copy size={16}/>}
          {copied?'Copied':'Copy digest'}</button>
        <p className="sp-footnote">Nothing is automatically delivered or scheduled.</p>
      </article>
    </div>}
    {view==='exports'&&<div className="sp-export-grid">
      <article className="card sp-panel"><Download size={27}/><h2>Monthly KPI history</h2>
        <p>All synthetic monthly measurements and illustrative thresholds.</p>
        <button className="sp-secondary" onClick={exportHistory}><Download size={16}/> CSV</button></article>
      <article className="card sp-panel"><FileText size={27}/><h2>Management scorecards</h2>
        <p>Export a synthetic score overview for spreadsheet presentations.</p>
        <button className="sp-secondary" onClick={exportScores}><Download size={16}/> CSV</button></article>
      <article className="card sp-panel"><Printer size={27}/><h2>Printable report</h2>
        <p>Use your browser to print or save the selected report as a PDF.</p>
        <button className="sp-secondary" onClick={()=>window.print()}><Printer size={16}/> Print / PDF</button></article>
    </div>}
    <p className="sp-footnote">Power BI, native PowerPoint export and automatic Teams delivery are not yet integrated. This prototype does not pretend to generate them.</p>
  </section>;
}
