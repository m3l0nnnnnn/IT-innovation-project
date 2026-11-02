import { getDemoCasesSnapshot } from './ground-demo';

export type InspectionStatus='Open'|'Follow-up'|'Resolved';
export type InspectionPriority='Low'|'Medium'|'High';
export type InspectionCategory='Cleanliness'|'Lift'|'Lighting'|'Pests'|'Water Seepage'|'Estate Maintenance';
export type Inspection={
  id:string;ref:string;townCouncilId:string;council:string;block:string;
  location:string;category:InspectionCategory;priority:InspectionPriority;
  status:InspectionStatus;notes:string;inspector:string;observedAt:string;
  linkedCaseRef:string|null;photoDataUrl:string|null;
};
export type InspectionDraft=Pick<Inspection,
  'townCouncilId'|'block'|'location'|'category'|'priority'|'notes'|
  'inspector'|'observedAt'|'linkedCaseRef'|'photoDataUrl'>;

const categories:InspectionCategory[]=['Cleanliness','Lift','Lighting','Pests','Water Seepage','Estate Maintenance'];
const statuses:InspectionStatus[]=['Open','Follow-up','Resolved'];
export const inspectionCategories=[...categories];
export const inspectionStatuses=[...statuses];
const seededNotes=[
  'Examine the lift lobby and verify whether the problem is ongoing.',
  'Common corridor has visible maintenance concerns requiring follow-up.',
  'Observe the bin centre and check whether clearance is needed.',
  'Inspect walkway lighting and note any faulty fixtures.',
  'Check reported dampness and document the affected area.',
  'Site walkthrough completed; monitor whether the issue recurs.'
];

const cases=getDemoCasesSnapshot();
const seed=Array.from({length:24},(_,i)=>{
  const source=cases[(i*3)%cases.length];
  const observedAt=new Date(Date.now()-(i%25)*86_400_000).toISOString();
  const status:InspectionStatus=i%6===0?'Resolved':i%3===0?'Follow-up':'Open';
  return {
    id:'inspection-'+String(i+1).padStart(3,'0'),
    ref:'INSP-'+String(i+1).padStart(4,'0'),
    townCouncilId:source.townCouncilId,council:source.council,block:source.block,
    location:source.location??'Common area',
    category:categories[i%categories.length],
    priority:(i%5===0?'High':i%3===0?'Medium':'Low') as InspectionPriority,
    status,notes:seededNotes[i%seededNotes.length],
    inspector:['Inspector A','Inspector B','Inspector C'][i%3],
    observedAt,linkedCaseRef:i%3===0?source.caseRef:null,photoDataUrl:null
  };
});
let inspections:Inspection[]=seed;
export function getDemoInspectionsSnapshot():Inspection[]{
  return inspections.map(x=>({...x}));
}
function newId():string{
  const max=inspections.reduce((n,x)=>Math.max(n,Number(x.ref.replace('INSP-',''))||0),0);
  return String(max+1).padStart(4,'0');
}
export function createDemoInspection(draft:InspectionDraft):Inspection{
  const match=cases.find(c=>c.townCouncilId===draft.townCouncilId);
  if(!match)throw Error('Select a demonstration Town Council.');
  if(!draft.block.trim()||!draft.notes.trim())throw Error('Enter a block and inspection observation.');
  const n=newId();
  const item:Inspection={...draft,id:'inspection-'+n,ref:'INSP-'+n,
    council:match.council,block:draft.block.trim().toUpperCase(),status:'Open'};
  inspections=[item,...inspections];
  return {...item};
}
export function updateDemoInspection(ref:string,patch:Partial<Inspection>):Inspection{
  const idx=inspections.findIndex(x=>x.ref===ref);
  if(idx<0)throw Error('Inspection not found.');
  const prior=inspections[idx];
  const next={...prior,...patch,id:prior.id,ref:prior.ref,townCouncilId:prior.townCouncilId,council:prior.council};
  inspections=[...inspections.slice(0,idx),next,...inspections.slice(idx+1)];
  return {...next};
}
export function currentDemoCouncils(){
  return [...new Map(cases.map(c=>[c.townCouncilId,c.council])).entries()]
    .map(([id,name])=>({id,name}));
}
/** Re-encode chosen image on a canvas to remove metadata, downscale to <=1280px,
 * then hold it only in memory. Nothing is uploaded or saved on disk by the app.
 * A production backend must repeat file signature, size and metadata checks.
 */
export async function photoToDemoJpeg(file:File):Promise<string>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))
    throw Error('Choose a JPEG, PNG or WebP image.');
  if(file.size>5*1024*1024)throw Error('Choose an image smaller than 5 MB.');
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(bitmap.width*scale);
    canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d');
    if(!ctx||!canvas.width||!canvas.height)throw Error('Cannot process this image.');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const encoded=canvas.toDataURL('image/jpeg',0.82);
    if(encoded.length>7_000_000)throw Error('Processed image is too large.');
    return encoded;
  }finally{bitmap.close();}
}
