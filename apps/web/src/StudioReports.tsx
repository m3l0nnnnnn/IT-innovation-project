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
  function printManagementReport(){
    const esc=(value:unknown)=>String(value??'—').replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]!));
    const fmt=(value:number|null|undefined,unit='')=>
      value==null||!Number.isFinite(value)?'Not recorded':value.toFixed(1)+unit;
    const table=(headers:string[],body:unknown[][],empty:string)=>
      `<table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${
        body.length?body.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join(''):
        `<tr><td colspan="${headers.length}">${esc(empty)}</td></tr>`
      }</tbody></table>`;
    const scope=COUNCILS.find(c=>c.id===councilId)?.name??'All demonstration councils';
    const months=[...new Set(rows.map(r=>r.period).filter(p=>p!=='—'))].sort();
    const period=months.length===1?months[0]:months.join(', ')||'Not available';
    const risks=riskRecords(councilId).filter(r=>r.level!=='Healthy');
    const scopedActions=getActions().filter(a=>!councilId||a.councilId===councilId);
    const activeActions=scopedActions.filter(a=>a.status!=='Completed');
    const generated=new Intl.DateTimeFormat('en-SG',{
      dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'
    }).format(new Date())+' (Singapore time)';
    const scoreRows=rows.map(r=>[r.council.name,r.period,fmt(r.score,' / 100'),
      (r.change>0?'+':'')+fmt(r.change)+' points']);
    const kpiRows=councils.flatMap(c=>METRICS.map(m=>{
      const points=series(c.id,m.id),latest=points.at(-1),previous=points.at(-2);
      const delta=latest&&previous?latest.value-previous.value:null;
      const deltaUnit=m.unit==='%'?' percentage points':m.id==='backlog'?' cases':' points';
      const reading=latest?fmt(latest.value,m.unit):'Not recorded';
      const meets=latest?(m.higherBetter?latest.value>=m.threshold:latest.value<=m.threshold):null;
      return [c.name,m.name,latest?.month??'—',reading,
        (m.higherBetter?'>= ':'<= ')+fmt(m.threshold,m.unit),
        delta==null?'Not recorded':(delta>0?'+':'')+fmt(delta)+deltaUnit,
        meets==null?'Not available':meets?'Meets demo target':'Outside demo target'];
    }));
    const riskRows=risks.map(r=>[r.council,r.metric.name,r.level,r.state,
      fmt(r.current,r.metric.unit),r.reason]);
    const actionRows=scopedActions.map(a=>[a.id+' — '+a.title,a.council,
      a.owner,a.priority,a.due,a.status,a.alertId||'None']);
    const outcomeRows=scopedActions.map(a=>[a.id,fmt(a.baseline),fmt(a.after),
      a.effectiveness||'Not yet measured',a.notes||'No notes']);
    const report=`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>Estara Management Report</title><style>
      @page{size:A4 landscape;margin:14mm}
      *{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#162c3d;margin:0;line-height:1.4}
      h1{font-size:24pt;margin:0 0 5px}h2{font-size:14pt;margin:23px 0 7px;color:#07364b}
      h3{font-size:11pt;margin:12px 0 6px}p{margin:6px 0}header{border-bottom:3px solid #119cac;padding-bottom:12px}
      .notice{background:#f1f6f7;border-left:4px solid #119cac;padding:9px 12px;margin:12px 0}
      .muted{color:#4b5d6b;font-size:9pt}.summary{font-size:11pt;padding:9px 0}
      table{border-collapse:collapse;width:100%;margin:8px 0 15px;table-layout:auto;font-size:9pt}
      th,td{border:1px solid #bdcbd2;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
      th{background:#e8f0f3;color:#12394d}thead{display:table-header-group}tr{break-inside:avoid}
      h2,h3{break-after:avoid}footer{border-top:1px solid #bdcbd2;margin-top:20px;padding-top:9px;font-size:9pt}
      </style></head><body>
      <header><p>ESTARA · MANAGEMENT REPORTING</p><h1>Town Council Performance Report</h1>
      <p><strong>Reporting scope:</strong> ${esc(scope)}</p>
      <p><strong>Latest score period:</strong> ${esc(period)}<br><strong>Generated:</strong> ${esc(generated)}</p></header>
      <div class="notice"><strong>FICTIONAL DEMONSTRATION DATA — NOT AN OFFICIAL EMS REPORT.</strong>
      Scores, targets and warnings are illustrative. Forecasts are estimates. This report is a snapshot of the current prototype state.</div>
      <h2>1. Executive overview</h2><p class="summary">${councils.length} council(s) selected;
      ${risks.length} non-healthy risk flag(s); ${activeActions.length} open corrective action(s);
      ${scopedActions.filter(a=>a.status==='Completed').length} completed action(s).</p>
      <p>Warnings needing attention:</p>${table(['Council','Indicator','Severity'],
        risks.filter(r=>r.state!=='Resolved').slice(0,5).map(r=>[r.council,r.metric.name,r.level]),'No unresolved demo warning flags in this scope.')}
      <h2>2. Management scorecards</h2>
      ${table(['Council','Month','Synthetic score','Change vs previous month'],scoreRows,'No score records available.')}
      <p class="muted">Changes are score points, not percentage changes. Scores come from a separate synthetic series, not an official EMS scoring formula.</p>
      <h2>3. Latest KPI readings</h2>
      ${table(['Council','KPI','Month','Latest value','Illustrative target','Change vs previous month','Target comparison'],kpiRows,'No KPI records available.')}
      <p class="muted">Target comparison uses the latest reading only; warning severity can also consider trends and forecast rules. The backlog KPI series is illustrative and is not the live count of feedback cases.</p>
      <h2>4. Warning details and evidence</h2>
      ${table(['Council','Indicator','Severity','Workflow status','Latest reading','Trigger / evidence'],riskRows,'No non-healthy demo risk flags in this scope.')}
      <p class="muted">This section includes non-healthy indicators even if their workflow status is Resolved, so measured risk and follow-up status remain visible separately.</p>
      <h2>5. Corrective actions</h2>
      ${table(['Reference / action','Council','Owner','Priority','Due date','Status','Linked warning'],actionRows,'No corrective actions recorded in this scope.')}
      <h3>Recorded outcomes</h3>
      ${table(['Action','Before reading','After reading','Recorded effectiveness','Remarks'],outcomeRows,'No outcome records available.')}
      <p class="muted">Before/after values are reproduced as recorded. Their units and comparability require validation in the linked action. A change alone does not prove that the action caused improvement.</p>
      <h2>6. Operational workload — all councils</h2>
      ${table(['Scope','Feedback cases','Currently open','Open for more than 7 days'],
        [['All demonstration councils',snap.cases,snap.open,snap.overdue]],'No operational snapshot available.')}
      <p class="muted">These are overall Ground Operations totals, regardless of the reporting-scope filter. They are shown separately from the selected-council scores, warnings and actions.</p>
      <h2>7. Data and reporting limitations</h2>
      <ul><li>All data in this report is fictional. The reporting month is the latest available synthetic month, not necessarily the current month.</li>
      <li>Actual EMS KPI definitions, targets and management scoring require client validation.</li>
      <li>This is a manually generated report, with no automatic Teams delivery, Power BI connection or native PowerPoint export.</li>
      <li>Unrecorded outcomes are labelled rather than treated as evidence of success.</li></ul>
      <footer>Estara prototype · Scope: ${esc(scope)} · Generated ${esc(generated)}</footer>
      </body></html>`;
    // Print an isolated document, never the currently selected application tab.
    const frame=document.createElement('iframe');
    frame.title='Printable Estara management report';
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:1120px;height:800px;border:0';
    let cleanupTimer:number|undefined;
    const cleanup=()=>{window.clearTimeout(cleanupTimer);frame.remove();};
    frame.onload=()=>{
      const target=frame.contentWindow;
      if(!target){cleanup();window.alert('Unable to open print preview. Please try again.');return;}
      target.addEventListener('afterprint',cleanup,{once:true});
      cleanupTimer=window.setTimeout(cleanup,300000);
      target.requestAnimationFrame(()=>target.requestAnimationFrame(()=>{
        try{target.focus();target.print();}
        catch{cleanup();window.alert('Print preview could not open. Please try again.');}
      }));
    };
    frame.srcdoc=report;
    document.body.append(frame);
  }

  return <section className="sp-page sp-report-page">
    <header className="page-header"><div><p className="eyebrow">MANAGEMENT REPORTS · PHOEBE</p>
      <h1>Management reporting</h1>
      <p className="subtext">Review fictional scorecards, prepare management digests and export synthetic datasets.</p></div>
      <button className="primary-button" onClick={printManagementReport}><Printer size={16}/> Print / Save PDF</button>
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
        <p>Generate a report with scorecards, KPI readings, warnings and corrective actions for the selected scope.</p>
        <button className="sp-secondary" onClick={printManagementReport}><Printer size={16}/> Print / PDF</button></article>
    </div>}
    <p className="sp-footnote">Power BI, native PowerPoint export and automatic Teams delivery are not yet integrated. This prototype does not pretend to generate them.</p>
  </section>;
}
