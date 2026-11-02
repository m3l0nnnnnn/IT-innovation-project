/**
 * Ground Operations UI fixture.
 * All records, councils and officers are fictional. No network, authentication,
 * Supabase access or persistent writes. Edits live only until the page reloads.
 */
export type DemoStatus = 'Open' | 'Closed';
export type DemoCase = {
  id:string; caseRef:string; townCouncilId:string; council:string;
  block:string; street:string|null; postalCode:string|null; location:string|null;
  category:string; channel:string; description:string|null; status:DemoStatus;
  assignedOfficer:string|null; duplicateOfId:string|null; duplicateOfRef:string|null;
  receivedAt:string; acknowledgedAt:string|null; closedAt:string|null; updatedAt:string;
  duplicates?:{id:string;caseRef:string;status:DemoStatus;receivedAt:string}[];
};
export type DemoCaseInput = Pick<DemoCase,
  'townCouncilId'|'block'|'street'|'postalCode'|'location'|'category'|
  'channel'|'description'|'assignedOfficer'|'receivedAt'>;
export type DemoCasePatch = Partial<DemoCaseInput>&{
  status?:DemoStatus;acknowledgedAt?:string|null;closedAt?:string|null;
};
export type DemoMeta = {
  councils:{id:string;name:string}[];categories:string[];channels:string[];statuses:DemoStatus[];
};
export type DemoCaseList = {data:DemoCase[];total:number;page:number;pageSize:number};
export type DemoCaseSummary = {
  data:{total:number;open:number;closed:number;overdue:number;unacknowledged:number};
  overdueAfterDays:number;
};

const councils=[
  {id:'11111111-1111-4111-8111-111111111111',name:'North District (demo)'},
  {id:'22222222-2222-4222-8222-222222222222',name:'East District (demo)'},
  {id:'33333333-3333-4333-8333-333333333333',name:'Central District (demo)'},
  {id:'44444444-4444-4444-8444-444444444444',name:'West District (demo)'},
  {id:'55555555-5555-4555-8555-555555555555',name:'South District (demo)'}
];
const categories=['Cleanliness','Lift','Lighting','Pests','Water Seepage','Estate Maintenance','Others'];
const channels=['OneService','Email','Call','Walk-in'];
const descriptions=[
  'Resident reported recurring lift interruptions during evening hours.',
  'Lighting near the common corridor requires inspection.',
  'Litter and bulky items observed near the bin centre.',
  'Resident reported signs of pest activity at ground floor.',
  'Water seepage observed at the shared stairwell wall.',
  'Damaged walkway surface requires follow-up.',
  'Unresolved feedback received through the service counter.'
];
const officers=['Officer A','Officer B','Officer C','Officer D',null];
const now=()=>new Date();
const daysAgo=(days:number)=>new Date(Date.now()-days*86_400_000).toISOString();
const caseRef=(n:number)=>'FB-'+String(n).padStart(6,'0');
let records:DemoCase[]=Array.from({length:80},(_,i)=>{
  const council=councils[i%councils.length];
  const age=1+(i*7)%39;
  const receivedAt=daysAgo(age);
  const closed=i%4===1||i%4===2;
  const closedAt=closed?daysAgo(Math.max(0,age-1-(i%5))):null;
  return {
    id:'case-'+String(i+1).padStart(4,'0'),caseRef:caseRef(i+1),
    townCouncilId:council.id,council:council.name,
    block:String(101+(i*11)%300),street:['North Street','East Avenue','Central Drive','West Road','South Lane'][i%5],
    postalCode:null,location:['Lift lobby','Common corridor','Bin centre','Void deck','Stairwell'][i%5],
    category:categories[i%categories.length],channel:channels[i%channels.length],
    description:descriptions[i%descriptions.length],status:closed?'Closed':'Open',
    assignedOfficer:officers[i%officers.length],
    duplicateOfId:null,duplicateOfRef:null,receivedAt,
    acknowledgedAt:i%5===0?null:daysAgo(Math.max(0,age-1)),
    closedAt,updatedAt:closedAt??receivedAt
  };
});
const meta:DemoMeta={councils,categories,channels,statuses:['Open','Closed']};
export async function getDemoMeta(){return meta;}
export async function getDemoSummary(townCouncilId:string):Promise<DemoCaseSummary>{
  const all=records.filter(x=>!townCouncilId||x.townCouncilId===townCouncilId);
  return {overdueAfterDays:7,data:{
    total:all.length,
    open:all.filter(c=>c.status==='Open').length,
    closed:all.filter(c=>c.status==='Closed').length,
    overdue:all.filter(c=>c.status==='Open'&&Date.now()-Date.parse(c.receivedAt)>7*86_400_000).length,
    unacknowledged:all.filter(c=>c.status==='Open'&&!c.acknowledgedAt).length
  }};
}
export async function listDemoCases(params:URLSearchParams):Promise<DemoCaseList>{
  const page=Math.max(1,Number(params.get('page')??1));
  const pageSize=Math.min(100,Math.max(1,Number(params.get('pageSize')??25)));
  const council=params.get('townCouncilId')??'';
  const category=params.get('category')??'';
  const status=params.get('status')??'';
  const query=(params.get('q')??'').trim().toLowerCase();
  const onlyOverdue=params.get('overdue')==='true';
  const sort=params.get('sort')??'receivedAt';
  const order=params.get('order')==='asc'?1:-1;
  const match=records.filter(c=>{
    if(council&&c.townCouncilId!==council)return false;
    if(category&&c.category!==category)return false;
    if(status&&c.status!==status)return false;
    if(onlyOverdue&&(c.status!=='Open'||Date.now()-Date.parse(c.receivedAt)<=7*86_400_000))return false;
    if(query&&![c.caseRef,c.block,c.street,c.location,c.description].join(' ').toLowerCase().includes(query))return false;
    return true;
  });
  match.sort((a,b)=>{
    const left=String(a[sort as keyof DemoCase]??'');
    const right=String(b[sort as keyof DemoCase]??'');
    return left.localeCompare(right,undefined,{numeric:true})*order;
  });
  return {data:match.slice((page-1)*pageSize,page*pageSize),total:match.length,page,pageSize};
}
export async function getDemoCase(idOrRef:string):Promise<DemoCase>{
  const match=records.find(c=>c.caseRef===idOrRef||c.id===idOrRef);
  if(!match)throw new Error('Demo case not found.');
  const duplicates=records.filter(c=>c.duplicateOfId===match.id)
    .map(c=>({id:c.id,caseRef:c.caseRef,status:c.status,receivedAt:c.receivedAt}));
  return {...match,duplicates};
}
export async function createDemoCase(input:DemoCaseInput):Promise<DemoCase>{
  const n=Math.max(...records.map(c=>Number(c.caseRef.slice(3))),0)+1;
  const council=councils.find(c=>c.id===input.townCouncilId);
  if(!council)throw new Error('Select a Town Council.');
  const result:DemoCase={
    ...input,id:'case-'+String(n).padStart(4,'0'),caseRef:caseRef(n),
    council:council.name,status:'Open',duplicateOfId:null,duplicateOfRef:null,
    acknowledgedAt:null,closedAt:null,updatedAt:now().toISOString()
  };
  records=[result,...records];
  return result;
}
export async function patchDemoCase(idOrRef:string,changes:DemoCasePatch):Promise<DemoCase>{
  const index=records.findIndex(c=>c.caseRef===idOrRef||c.id===idOrRef);
  if(index===-1)throw new Error('Demo case not found.');
  const existing=records[index];
  const councilId=changes.townCouncilId??existing.townCouncilId;
  const council=councils.find(c=>c.id===councilId);
  if(!council)throw new Error('Select a Town Council.');
  const status=changes.status??existing.status;
  const closedAt=status==='Closed'?(existing.closedAt??now().toISOString()):null;
  const update:DemoCase={...existing,...changes,status,closedAt,
    council:council.name,updatedAt:now().toISOString()};
  records=[...records.slice(0,index),update,...records.slice(index+1)];
  return update;
}
