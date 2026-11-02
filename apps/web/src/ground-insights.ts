import type { DemoCase } from './ground-demo';

/**
 * Read-only, deterministic summaries for the fictional Ground Operations dataset.
 * Inspired by TC Pulse's workload, themes and feedback drivers. No AI or external API.
 * Case volume and themes use the selected window; officer workload is current open cases.
 */
export type WindowDays=30|90|0;
export type AgeBucket={recent:number;aging:number;old:number};
export type WorkloadOfficer={
  councilId:string;council:string;officer:string;
  open:number;overdue:number;ages:AgeBucket;aboveAverage:boolean;
};
export type WorkloadCouncil={
  councilId:string;council:string;officers:WorkloadOfficer[];
  unassigned:WorkloadOfficer;meanAssignedOpen:number;
};
export type CategoryInsight={category:string;count:number;open:number;share:number};
export type ThemeInsight={theme:string;category:string;count:number;example:string};
export type HotspotInsight={
  councilId:string;council:string;block:string;count:number;
  open:number;leadingCategory:string;
};
export type GroundInsights={
  totals:{received:number;currentOpen:number;overdue:number;unassigned:number;hotspots:number};
  categories:CategoryInsight[];
  themes:ThemeInsight[];
  hotspots:HotspotInsight[];
  workload:WorkloadCouncil[];
  windowDays:WindowDays;
};

const DAY=86_400_000;
const topicRules:{category:string;topics:{title:string;test:RegExp}[]}[]=[
  {category:'Lift',topics:[
    {title:'Lift breakdowns',test:/\b(?:breakdowns?|broke down|not working|stuck|stoppages?|trapped)\b/i},
    {title:'Lift doors',test:/\bdoors?\b/i},
    {title:'Lift noise or vibration',test:/\b(?:noise|noisy|vibrat\w*|jerk\w*)\b/i}
  ]},
  {category:'Cleanliness',topics:[
    {title:'Bulky items and dumping',test:/\b(?:bulky|dumped|dumping|mattress|furniture)\b/i},
    {title:'Littering',test:/\b(?:litter|rubbish|trash)\b/i},
    {title:'Bin centre hygiene',test:/\b(?:bin centre|smell|stench|refuse)\b/i}
  ]},
  {category:'Lighting',topics:[
    {title:'Corridor and lobby lighting',test:/\b(?:corridor|lobby|stairwell)\b/i},
    {title:'Street lighting',test:/\b(?:street|lamp|walkway|road)\b/i}
  ]},
  {category:'Pests',topics:[
    {title:'Cockroaches and rats',test:/\b(?:cockroaches?|rats?|rodents?)\b/i},
    {title:'Mosquitoes',test:/\bmosquitoes?\b/i}
  ]},
  {category:'Water Seepage',topics:[
    {title:'Leaks and seepage',test:/\b(?:seepage|leak|drip|water)\b/i}
  ]},
  {category:'Estate Maintenance',topics:[
    {title:'Damaged estate fixtures',test:/\b(?:damaged|crack|broken|handrail|tiles?)\b/i}
  ]}
];
function topicOf(row:DemoCase):string{
  const group=topicRules.find(t=>t.category===row.category);
  const body=row.description??'';
  return group?.topics.find(t=>t.test.test(body))?.title??row.category;
}
function ageBucket(rows:DemoCase[],time:number):AgeBucket{
  const bucket:AgeBucket={recent:0,aging:0,old:0};
  for(const row of rows){
    const age=Math.max(0,(time-Date.parse(row.receivedAt))/DAY);
    if(age<=7)bucket.recent++;
    else if(age<=30)bucket.aging++;
    else bucket.old++;
  }
  return bucket;
}
function asOfficer(councilId:string,council:string,officer:string,rows:DemoCase[],time:number):WorkloadOfficer{
  return {
    councilId,council,officer,open:rows.length,
    overdue:rows.filter(r=>time-Date.parse(r.receivedAt)>7*DAY).length,
    ages:ageBucket(rows,time),aboveAverage:false
  };
}
function tally<T extends string>(values:T[]):Map<T,number>{
  const counts=new Map<T,number>();
  for(const v of values)counts.set(v,(counts.get(v)??0)+1);
  return counts;
}
function excerpt(value:string,max=100){
  const s=value.replace(/\s+/g,' ').trim();
  if(s.length<=max)return s;
  const cut=s.slice(0,max);
  const last=cut.lastIndexOf(' ');
  return (last>=max*0.5?cut.slice(0,last):cut).trimEnd()+'…';
}
export function deriveGroundInsights(
  records:DemoCase[],townCouncilId='',windowDays:WindowDays=90,now=new Date()
):GroundInsights{
  const time=now.getTime();
  const scoped=records.filter(c=>!townCouncilId||c.townCouncilId===townCouncilId);
  const received=scoped.filter(c=>Number.isFinite(Date.parse(c.receivedAt)) &&
    Date.parse(c.receivedAt)<=time &&
    (!windowDays || Date.parse(c.receivedAt)>=time-windowDays*DAY));
  const open=scoped.filter(c=>c.status==='Open');
  const categoryTotals=tally(received.map(c=>c.category));
  const categories:CategoryInsight[]=[...categoryTotals.entries()].map(([category,count])=>({
    category,count,open:received.filter(c=>c.category===category&&c.status==='Open').length,
    share:received.length?Math.round(count/received.length*100):0
  })).sort((a,b)=>b.count-a.count||a.category.localeCompare(b.category));

  const themesMap=new Map<string,{category:string;rows:DemoCase[]}>();
  for(const c of received){
    const theme=topicOf(c);
    const prior=themesMap.get(theme)??{category:c.category,rows:[]};
    prior.rows.push(c);themesMap.set(theme,prior);
  }
  const themes:ThemeInsight[]=[...themesMap.entries()].map(([theme,v])=>({
    theme,category:v.category,count:v.rows.length,
    example:excerpt(v.rows[0].description??'No description supplied')
  })).sort((a,b)=>b.count-a.count||a.theme.localeCompare(b.theme)).slice(0,7);

  const byBlock=new Map<string,DemoCase[]>();
  for(const row of received){
    const key=row.townCouncilId+'|'+row.block;
    byBlock.set(key,[...(byBlock.get(key)??[]),row]);
  }
  const hotspots:HotspotInsight[]=[...byBlock.values()].filter(group=>group.length>=3).map(group=>{
    const first=group[0];
    const categories=tally(group.map(c=>c.category));
    const leading=[...categories.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
    return {
      councilId:first.townCouncilId,council:first.council,block:first.block,
      count:group.length,open:group.filter(c=>c.status==='Open').length,
      leadingCategory:leading
    };
  }).sort((a,b)=>b.count-a.count||b.open-a.open||a.council.localeCompare(b.council)||a.block.localeCompare(b.block));

  const councils=new Map<string,string>();
  for(const row of scoped)councils.set(row.townCouncilId,row.council);
  const workload:WorkloadCouncil[]=[...councils.entries()].map(([councilId,council])=>{
    const councilRows=scoped.filter(c=>c.townCouncilId===councilId);
    const assignedNames=[...new Set(councilRows.map(c=>c.assignedOfficer).filter((v):v is string=>!!v))].sort();
    const officers=assignedNames.map(officer=>asOfficer(
      councilId,council,officer,open.filter(c=>c.townCouncilId===councilId&&c.assignedOfficer===officer),time
    ));
    const meanAssignedOpen=officers.length?officers.reduce((n,o)=>n+o.open,0)/officers.length:0;
    for(const o of officers)o.aboveAverage=o.open>=3&&officers.length>=3&&o.open>=1.5*meanAssignedOpen;
    officers.sort((a,b)=>b.open-a.open||a.officer.localeCompare(b.officer));
    const unassigned=asOfficer(councilId,council,'Unassigned',open.filter(c=>c.townCouncilId===councilId&&!c.assignedOfficer),time);
    return {councilId,council,officers,unassigned,meanAssignedOpen};
  }).sort((a,b)=>a.council.localeCompare(b.council));

  return {
    totals:{
      received:received.length,currentOpen:open.length,
      overdue:open.filter(c=>time-Date.parse(c.receivedAt)>7*DAY).length,
      unassigned:open.filter(c=>!c.assignedOfficer).length,
      hotspots:hotspots.length
    },
    categories,themes,hotspots,workload,windowDays
  };
}
