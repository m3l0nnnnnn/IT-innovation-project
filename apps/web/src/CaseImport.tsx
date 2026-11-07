import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertTriangle, ArrowLeft, Download, FileSpreadsheet, FlaskConical, Upload, X } from 'lucide-react';
import {
  apiErrorMessage, importCases, previewImport, IMPORT_SAMPLE_URL, IMPORT_TEMPLATE_URL, type ImportPreview, type ImportRow
} from './cases-api';

const resultLabel:Record<ImportRow['result'],[string,string]>={
  ready:['Ready','closed'],duplicate:['Possible duplicate','warning'],error:['Error','critical']
};
function dateLabel(value:string|null){
  return value?new Date(value).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'}):'—';
}

/** Two-step Excel/CSV import: upload and check the file, then save the rows the user ticks. */
export default function CaseImport({onClose,onImported}:{
  onClose:()=>void; onImported:(result:{imported:number;firstRef:string;lastRef:string})=>void;
}){
  const [fileName,setFileName]=useState('');
  const [preview,setPreview]=useState<ImportPreview|null>(null);
  const [selected,setSelected]=useState<Set<number>>(new Set());
  const [filter,setFilter]=useState<'all'|ImportRow['result']>('all');
  const [busy,setBusy]=useState<''|'checking'|'importing'>('');
  const [error,setError]=useState('');
  const [dragging,setDragging]=useState(false);

  const visible=useMemo(()=>preview?.rows.filter(r=>filter==='all'||r.result===filter)??[],[preview,filter]);
  const visibleImportable=visible.filter(r=>r.value);
  const allVisibleSelected=visibleImportable.length>0&&visibleImportable.every(r=>selected.has(r.rowNumber));

  function choose(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];
    event.target.value='';
    if(file)void check(file);
  }
  // Dropping a file anywhere on the panel works like choosing it, before or after a preview.
  function dragOver(event:DragEvent){
    if(!event.dataTransfer.types.includes('Files'))return;
    event.preventDefault(); // without this the browser opens the dropped file itself
    event.dataTransfer.dropEffect=busy?'none':'copy';
    if(!busy)setDragging(true);
  }
  function dragLeave(event:DragEvent){
    if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false);
  }
  function drop(event:DragEvent){
    if(!event.dataTransfer.types.includes('Files'))return;
    event.preventDefault();setDragging(false);
    const file=event.dataTransfer.files[0];
    if(!file||busy)return;
    // The file input's accept filter doesn't apply to drops, so check the type here.
    if(!/\.(xlsx|csv)$/i.test(file.name)){setError(`"${file.name}" is not an .xlsx or .csv file.`);return;}
    void check(file);
  }
  async function check(file:File){
    setFileName(file.name);setPreview(null);setError('');setFilter('all');setBusy('checking');
    try{
      const result=await previewImport(file);
      setPreview(result);
      // Clean rows start ticked; possible duplicates wait for the user to decide.
      setSelected(new Set(result.rows.filter(r=>r.result==='ready').map(r=>r.rowNumber)));
    }catch(e){setError(apiErrorMessage(e))}
    finally{setBusy('')}
  }
  function toggle(rowNumber:number){
    setSelected(current=>{
      const next=new Set(current);
      if(!next.delete(rowNumber))next.add(rowNumber);
      return next;
    });
  }
  function toggleVisible(){
    setSelected(current=>{
      const next=new Set(current);
      for(const r of visibleImportable)allVisibleSelected?next.delete(r.rowNumber):next.add(r.rowNumber);
      return next;
    });
  }
  async function save(){
    if(!preview)return;
    const rows=preview.rows.filter(r=>r.value&&selected.has(r.rowNumber)).map(r=>r.value!);
    if(!window.confirm(`Import ${rows.length} case${rows.length===1?'':'s'} into the shared database?`))return;
    setBusy('importing');setError('');
    try{onImported(await importCases(rows))}
    catch(e){setError(apiErrorMessage(e))}
    finally{setBusy('')}
  }

  return <div className="ground-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}
    onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
    <section className={'ground-drawer ground-drawer-wide'+(dragging&&preview?' ground-import-dragging':'')}
      role="dialog" aria-modal="true" aria-label="Import feedback cases">
      <header><div><p className="eyebrow">GROUND OPERATIONS · DATA IMPORT</p><h2>Import feedback cases</h2></div>
        <button type="button" className="ground-icon-button" disabled={!!busy} onClick={onClose} aria-label="Close import"><X size={19}/></button>
      </header>

      {!preview&&<>
        <p className="ground-import-intro">Upload an Excel (.xlsx) or CSV file with one case per row. Every row is checked
          with the same rules as the case form before anything is saved, and you choose which rows to import.</p>
        <div className="ground-import-start">
          <label className={'ground-import-drop'+(busy?' busy':'')+(dragging?' dragging':'')}>
            <FileSpreadsheet size={28}/>
            <strong>{busy==='checking'?'Checking '+fileName+'…':dragging?'Drop the file to check it':'Drop a file here or click to choose'}</strong>
            <small>.xlsx or .csv · up to 2,000 rows · 5 MB</small>
            <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!!busy} onChange={choose}/>
          </label>
          <div className="ground-import-downloads">
            <a className="ground-secondary" href={IMPORT_TEMPLATE_URL} download><Download size={16}/> Download template</a>
            <a className="ground-secondary" href={IMPORT_SAMPLE_URL} download><FlaskConical size={16}/> Download sample data</a>
            <small>Fictional cases from the last two weeks, with a few deliberate mistakes to show how errors appear.</small>
          </div>
        </div>
        <p className="ground-warning">Dates are read as Singapore time. Text dates should be DD/MM/YYYY HH:MM. Town Councils are
          matched by name; Category, Channel and Status must use the values in the template's drop-down lists.</p>
      </>}

      {error&&<div className="notice error" role="alert"><AlertTriangle size={17}/>{error}</div>}

      {preview&&<>
        <div className="ground-import-summary">
          <span><FileSpreadsheet size={16}/> {fileName} · {preview.counts.total.toLocaleString('en-SG')} rows</span>
          {(['all','ready','duplicate','error'] as const).map(key=>{
            const count=key==='all'?preview.counts.total:preview.counts[key];
            return <button type="button" key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}
              aria-pressed={filter===key}>{key==='all'?'All':resultLabel[key][0]} <b>{count}</b></button>;
          })}
        </div>
        {preview.counts.duplicate>0&&<p className="ground-warning">Possible duplicates are not ticked. Tick them if they are new
          cases at the same block, not repeats of an existing one.</p>}
        <div className="table-wrap ground-import-table">
          <table className="ground-table"><thead><tr>
            <th scope="col"><input type="checkbox" aria-label="Select all importable rows shown" checked={allVisibleSelected}
              disabled={!visibleImportable.length||!!busy} onChange={toggleVisible}/></th>
            <th scope="col">Row</th><th scope="col">Council / Block</th><th scope="col">Category</th>
            <th scope="col">Received</th><th scope="col">Check</th>
          </tr></thead><tbody>
            {visible.map(r=><tr key={r.rowNumber} className={r.result==='error'?'ground-import-error':''}>
              <td><input type="checkbox" aria-label={'Import row '+r.rowNumber} disabled={!r.value||!!busy}
                checked={selected.has(r.rowNumber)} onChange={()=>toggle(r.rowNumber)}/></td>
              <td>{r.rowNumber}</td>
              <td><strong>{r.council??'—'}</strong><small>Blk {r.block??'—'}{r.description?' · '+r.description:''}</small></td>
              <td>{r.category??'—'}</td>
              <td>{dateLabel(r.receivedAt)}</td>
              <td><span className={'badge '+resultLabel[r.result][1]}>{resultLabel[r.result][0]}</span>
                {r.messages.map(m=><small key={m}>{m}</small>)}</td>
            </tr>)}
          </tbody></table>
          {!visible.length&&<p className="ground-state">No rows in this view.</p>}
        </div>
        <div className="ground-drawer-actions">
          <button type="button" className="ground-secondary" disabled={!!busy} onClick={()=>{setPreview(null);setError('');setSelected(new Set())}}>
            <ArrowLeft size={15}/> Back
          </button>
          <button type="button" className="primary-button" disabled={!selected.size||!!busy} onClick={save}>
            <Upload size={16}/>{busy==='importing'?'Importing…':busy==='checking'?'Checking…':`Import ${selected.size} case${selected.size===1?'':'s'}`}
          </button>
        </div>
        <p className="ground-warning">Rows with errors can't be imported. Fix them in the file, then go Back and upload it again. The import saves
          every ticked row or none of them.</p>
      </>}
    </section>
  </div>;
}
