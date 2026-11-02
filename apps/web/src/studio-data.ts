import { useSyncExternalStore } from 'react';
import { getDemoCouncils, getDemoCasesSnapshot } from './ground-demo';

export type MetricId='response'|'resolution'|'closure'|'backlog'|'management';
export type RiskLevel='Healthy'|'Watch'|'Warning'|'Critical';
export type AlertState='New'|'Acknowledged'|'Monitoring'|'Resolved';
export type ActionState='Planned'|'In Progress'|'Completed';
export type DemoMetric={id:MetricId;name:string;unit:string;threshold:number;higherBetter:boolean;note:string};
export type MonthlyPoint={month:string;value:number;simulated:true};
export type RiskRecord={
  id:string;councilId:string;council:string;metric:DemoMetric;
  current:number;forecast:number;slope:number;level:RiskLevel;
  margin:number;reason:string;state:AlertState;
};
export type DemoAction={
  id:string;councilId:string;council:string;alertId:string;
  title:string;owner:string;due:string;status:ActionState;priority:'Low'|'Medium'|'High';
  baseline:number|null;after:number|null;effectiveness:string;notes:string;
};
export type DemoRule={buffer:number;horizon:1|2|3;enabled:MetricId[]};
export type DemoAudit={when:string;who:string;event:string;detail:string};
export const METRICS:DemoMetric[]=[
  {id:'response',name:'Feedback acknowledgement rate',unit:'%',threshold:90,higherBetter:true,note:'Synthetic percentage acknowledged within a demo target'},
  {id:'resolution',name:'Response / resolution timeliness',unit:'%',threshold:88,higherBetter:true,note:'Synthetic percentage meeting a demonstration SLA'},
  {id:'closure',name:'Case closure rate',unit:'%',threshold:85,higherBetter:true,note:'Synthetic percentage of feedback closed'},
  {id:'backlog',name:'Outstanding issues older than 7 days',unit:' cases',threshold:15,higherBetter:false,note:'Illustrative KPI series; not the current Feedback Cases count'},
  {id:'management',name:'Management report score',unit:' / 100',threshold:90,higherBetter:true,note:'Simulated report score — not an EMS official score'}
];
export const COUNCILS=getDemoCouncils();
const BASE_MONTHS=Array.from({length:18},(_,i)=>{
  const d=new Date(Date.UTC(2025,5+i,1));
  return d.toISOString().slice(0,7);
});
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function round(v:number,digits=1){const m=10**digits;return Math.round(v*m)/m;}
const raw=new Map<string,MonthlyPoint[]>();
for(const [index,council] of COUNCILS.entries()){
  for(const [metricIndex,metric] of METRICS.entries()){
    const points=BASE_MONTHS.map((month,i)=>{
      const noise=Math.sin((i+2)*1.6+index*3+metricIndex)*1.2;
      const drift=[-0.54,0.12,-0.25,0.37,-0.16][index]+[0,0.12,-0.09,0.15,0.04][metricIndex];
      const baseline=metric.id==='backlog'?12+index*1.5:96-index*1.25-metricIndex*0.7;
      const value=clamp(baseline+drift*i+noise,metric.id==='backlog'?0:65,metric.id==='backlog'?60:100);
      return {month,value:round(value),simulated:true as const};
    });
    raw.set(council.id+':'+metric.id,points);
  }
}
export function series(councilId:string,metricId:MetricId):MonthlyPoint[]{
  return raw.get(councilId+':'+metricId)?.map(p=>({...p}))??[];
}
export function trend(points:MonthlyPoint[],window=6):number{
  const values=points.slice(-window).map(p=>p.value);
  if(values.length<2)return 0;
  const n=values.length,meanX=(n-1)/2;
  const meanY=values.reduce((a,b)=>a+b,0)/n;
  const numerator=values.reduce((s,y,i)=>s+(i-meanX)*(y-meanY),0);
  const denominator=values.reduce((s,_y,i)=>s+(i-meanX)**2,0);
  return denominator?numerator/denominator:0;
}
export function forecast(points:MonthlyPoint[],metric:DemoMetric,horizon:number):number{
  if(!points.length)return 0;
  const limit=metric.id==='backlog'?100:100;
  return round(clamp(points[points.length-1].value+trend(points)*horizon,0,limit));
}
export function classify(current:number,projected:number,metric:DemoMetric,buffer:number):RiskLevel{
  if(metric.higherBetter){
    if(current<metric.threshold)return 'Critical';
    if(projected<metric.threshold)return 'Warning';
    if(current<metric.threshold+buffer)return 'Watch';
    return 'Healthy';
  }
  if(current>metric.threshold)return 'Critical';
  if(projected>metric.threshold)return 'Warning';
  if(current>metric.threshold-buffer)return 'Watch';
  return 'Healthy';
}
let rules:DemoRule={buffer:3,horizon:2,enabled:METRICS.map(m=>m.id)};
let states:Record<string,AlertState>={};
const seedCouncils=COUNCILS;
let actions:DemoAction[]=seedCouncils.slice(0,4).map((c,i)=>({
  id:'ACT-'+String(i+1).padStart(3,'0'),councilId:c.id,council:c.name,
  alertId:c.id+':response',
  title:['Review repeat feedback handling','Assign backlog review officer','Check overdue feedback escalation','Review weekly closure process'][i],
  owner:['Manager A','Officer B','Manager C','Officer D'][i],
  due:new Date(Date.UTC(2026,10,10+i*4)).toISOString().slice(0,10),
  status:i===0?'In Progress':i===1?'Completed':'Planned',
  priority:i===1?'Medium':'High',baseline:i===1?89:null,
  after:i===1?92:null,effectiveness:i===1?'Improved in synthetic example':'Not yet measured',
  notes:'Illustrative corrective-action record'
}));
let audit:DemoAudit[]=[{when:new Date().toISOString(),who:'Demo workspace',event:'Demo initialised',detail:'Fictional data loaded in memory'}];
let version=0;
const listeners=new Set<()=>void>();
function broadcast(){version+=1;listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
function snapshot(){return version;}
export function useStudioVersion(){return useSyncExternalStore(subscribe,snapshot,()=>0);}
function record(event:string,detail:string){
  audit=[{when:new Date().toISOString(),who:'Demo user',event,detail},...audit].slice(0,100);
  broadcast();
}
export function getRules():DemoRule{return {...rules,enabled:[...rules.enabled]};}
export function setRules(next:DemoRule){
  if(!Number.isFinite(next.buffer)||next.buffer<0||next.buffer>20)throw Error('Warning buffer must be 0–20.');
  if(![1,2,3].includes(next.horizon))throw Error('Forecast horizon must be 1, 2 or 3 months.');
  rules={buffer:next.buffer,horizon:next.horizon,enabled:[...next.enabled]};
  record('Warning rules updated','Threshold buffer '+next.buffer+', forecast '+next.horizon+' month(s)');
}
export function riskRecords(councilId=''):RiskRecord[]{
  const out:RiskRecord[]=[];
  for(const council of COUNCILS){
    if(councilId&&council.id!==councilId)continue;
    for(const metric of METRICS){
      if(!rules.enabled.includes(metric.id))continue;
      const points=series(council.id,metric.id);
      const current=points.at(-1)?.value??0,projected=forecast(points,metric,rules.horizon);
      const level=classify(current,projected,metric,rules.buffer);
      const slope=round(trend(points),2);
      const direction=metric.higherBetter?'below':'above';
      const reason=level==='Critical'
        ?'Latest synthetic measurement breaches the illustrative threshold.'
        :level==='Warning'
        ?'Straight-line forecast crosses the illustrative threshold within '+rules.horizon+' months.'
        :level==='Watch'
        ?'Current reading is near the illustrative threshold (buffer: '+rules.buffer+').'
        :'No simulated threshold concern currently identified.';
      const id=council.id+':'+metric.id;
      out.push({id,councilId:council.id,council:council.name,metric,current,
        forecast:projected,slope,level,margin:metric.higherBetter?round(current-metric.threshold):round(metric.threshold-current),
        reason:reason+' A higher/lower value is '+(metric.higherBetter?'better':'worse')+'.',
        state:states[id]??'New'});
    }
  }
  const severity:Record<RiskLevel,number>={Critical:0,Warning:1,Watch:2,Healthy:3};
  return out.sort((a,b)=>severity[a.level]-severity[b.level]||a.margin-b.margin);
}
export function setAlertState(id:string,state:AlertState){
  if(!riskRecords().some(x=>x.id===id))throw Error('Alert not found.');
  states={...states,[id]:state};record('Alert status updated',id+' → '+state);
}
export function getActions(){return actions.map(a=>({...a}));}
export function addAction(input:Omit<DemoAction,'id'|'council'>){
  const council=COUNCILS.find(c=>c.id===input.councilId);
  if(!council)throw Error('Choose a Town Council.');
  if(!input.title.trim()||!input.owner.trim())throw Error('Enter a title and owner.');
  const seq=Math.max(0,...actions.map(a=>Number(a.id.slice(4))))+1;
  const item={...input,id:'ACT-'+String(seq).padStart(3,'0'),council:council.name};
  actions=[item,...actions];record('Corrective action created',item.id+': '+item.title);
  return item;
}
export function updateAction(id:string,patch:Partial<DemoAction>){
  if(!actions.some(a=>a.id===id))throw Error('Action not found.');
  actions=actions.map(a=>a.id===id?{...a,...patch,id,councilId:a.councilId,council:a.council}:a);
  record('Corrective action updated',id+': '+(patch.status??'details edited'));
}
export function auditEntries(){return audit.map(entry=>({...entry}));}
export function operationsSnapshot(){
  const cases=getDemoCasesSnapshot();
  return {cases:cases.length,open:cases.filter(c=>c.status==='Open').length,
    overdue:cases.filter(c=>c.status==='Open'&&Date.now()-Date.parse(c.receivedAt)>7*86_400_000).length};
}
export function weeklyDigest(councilId=''){
  const risk=riskRecords(councilId).filter(r=>r.level!=='Healthy');
  const currentActions=actions.filter(a=>(!councilId||a.councilId===councilId)&&a.status!=='Completed');
  return {risk,actions:currentActions};
}
