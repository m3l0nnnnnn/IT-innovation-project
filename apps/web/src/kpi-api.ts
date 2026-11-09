import axios from 'axios';
import { getDemoRole } from './role-preview';

/** Client for the KPI & Performance Analytics API (apps/api/src/routes/kpis.ts). */
export type Unit='%'|'days'|'cases';
export type Direction='higher'|'lower';
export type PeriodKind='week'|'month';
export type KpiStatus='On track'|'At risk'|'Breached'|'No data';
export type TrendLabel='improving'|'stable'|'declining'|'insufficient data';
export type ForecastStatus='breached'|'deteriorating'|'not deteriorating'|'insufficient data';
export type Confidence='high'|'medium'|'low';
export type Severity='Critical'|'Warning'|'Watch';
export type MetricId='ack_within'|'closed_within'|'overdue_open'|'avg_ack_days'|'avg_close_days'|'repeat_rate';

export type Council={id:string;name:string};
export type KpiDefinition={
  id:string;name:string;description:string|null;metric:MetricId;withinDays:number|null;category:string|null;
  target:number;warning:number;active:boolean;sortOrder:number;createdAt:string;updatedAt:string;
  unit:Unit;direction:Direction;metricLabel:string;daysLabel:string|null;explain:string;
  councilTargets?:{kpiId:string;townCouncilId:string;council:string;target:number;warning:number;updatedAt:string}[];
};
export type Thresholds={target:number;warning:number;overridden:boolean};
export type Trend={label:TrendLabel;slopePerPeriod:number|null;changeOverWindow:number|null;r2:number|null;
  periods:number;worseCount:number;changes:number;worseStreak:number};
export type Forecast={
  status:ForecastStatus;daysToTarget:number|null;daysToWarning:number|null;
  range:{earliest:number|null;latest:number|null}|null;beyondHorizon:boolean;confidence:Confidence|null;
  projection?:{label:string;value:number;low:number;high:number}[];
};
export type SignificantChange={label:string;value:number;expected:number;change:number;z:number;direction:'better'|'worse'};
export type Analysis={
  status:KpiStatus;
  latest:{label:string;value:number;sample:number}|null;
  current:{label:string;value:number|null;sample:number;pending:number}|null;
  previous:{label:string;value:number}|null;
  changeVsPrevious:number|null;historicalAverage:number|null;changeVsHistory:number|null;
  trend:Trend;significantChanges:SignificantChange[];forecast:Forecast;
};
export type OverviewResult={
  kpiId:string;townCouncilId:string;thresholds:Thresholds;status:KpiStatus;
  latest:Analysis['latest'];current:Analysis['current'];changeVsPrevious:number|null;changeVsHistory:number|null;
  trend:Trend;forecast:Forecast;significantChanges:SignificantChange[];
  sparkline:{label:string;value:number|null}[];severity:Severity|null;explanation:string;
};
export type Overview={period:PeriodKind;asOf:string|null;generatedAt:string;councils:Council[];kpis:KpiDefinition[];results:OverviewResult[]};
export type SeriesPoint={label:string;start:string;value:number|null;sample:number;pending:number;partial:boolean};
export type Backtest={
  points:{asOf:string;value:number|null;status:KpiStatus;forecast:ForecastStatus;daysToTarget:number|null;predictedBreachAt:string|null;confidence:Confidence|null}[];
  breachedAt:string|null;firstWarningAt:string|null;leadDays:number|null;errorDays:number|null;
};
export type SeriesResult={
  kpi:KpiDefinition;council:Council;thresholds:Thresholds;period:PeriodKind;asOf:string|null;
  series:SeriesPoint[];analysis:Analysis;explanation:string;severity:Severity|null;backtest:Backtest;
};
export type Factors={
  kpi:KpiDefinition;council:Council;asOf:string|null;windows:{recentDays:number;baselineDays:number};
  contributions:{recentValue:number|null;baselineValue:number|null;change:number|null;categories:{
    category:string;contribution:number;effect:'worse'|'better'|'neutral';recentValue:number|null;baselineValue:number|null;recentCases:number;baselineCases:number;
  }[]};
  blocks:{block:string;open:number;overdue:number;expected:number;chance:number;unusual:boolean;topCategory:string;oldestDays:number}[];
  unusualBlocks:number;
  volumes:{category:string;recent:number;expected:number;ratio:number|null;change:'increase'|'decrease'|'normal';lastYear:number|null;seasonal:boolean}[];
  summary:string[];
};
export type MetricInfo={id:MetricId;label:string;unit:Unit;direction:Direction;daysLabel:string|null;defaultDays:number|null;explain:string};
export type ChangeLogEntry={id:string;action:string;changedBy:string;changes:Record<string,{from:unknown;to:unknown}>;changedAt:string;townCouncilId:string|null;council:string|null};
export type KpiInput={name:string;description?:string|null;metric:MetricId;withinDays:number|null;category:string|null;target:number;warning:number};
export type KpiPatch=Partial<Omit<KpiInput,'metric'>>&{active?:boolean};

const api=axios.create({baseURL:'/api/kpis'});
// Demo only: the role preview stands in for login until authentication exists. The API trusts this header.
api.interceptors.request.use(config=>{config.headers.set('X-Estara-Role',getDemoRole());return config;});

const params=(o:Record<string,string|number|undefined|null>)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined&&v!==null&&v!==''));

export async function getOverview(period:PeriodKind,asOf?:string){return (await api.get<Overview>('/overview',{params:params({period,asOf})})).data;}
export async function getSeries(kpiId:string,townCouncilId:string,period:PeriodKind,asOf?:string){
  return (await api.get<SeriesResult>('/series',{params:params({kpiId,townCouncilId,period,asOf})})).data;
}
export async function getFactors(kpiId:string,townCouncilId:string,asOf?:string){
  return (await api.get<Factors>('/factors',{params:params({kpiId,townCouncilId,asOf})})).data;
}
export async function getMetrics(){return (await api.get<{metrics:MetricInfo[];categories:string[]}>('/metrics')).data;}
export async function getDefinitions(includeArchived=false){
  return (await api.get<{data:KpiDefinition[]}>('/definitions',{params:includeArchived?{includeArchived:'true'}:{}})).data.data;
}
export async function getHistory(id:string){return (await api.get<{data:ChangeLogEntry[]}>(`/definitions/${id}/history`)).data.data;}
export async function createKpi(input:KpiInput){return (await api.post<{data:KpiDefinition}>('/definitions',input)).data.data;}
export async function updateKpi(id:string,patch:KpiPatch){return (await api.patch<{data:KpiDefinition}>(`/definitions/${id}`,patch)).data.data;}
export async function setCouncilTarget(id:string,townCouncilId:string,t:{target:number;warning:number}){
  await api.put(`/definitions/${id}/targets/${townCouncilId}`,t);
}
export async function removeCouncilTarget(id:string,townCouncilId:string){await api.delete(`/definitions/${id}/targets/${townCouncilId}`);}

/** Formats a KPI value with its unit. */
export function fmt(value:number|null|undefined,unit:Unit){
  if(value===null||value===undefined||Number.isNaN(value))return '—';
  if(unit==='%')return value.toFixed(1)+'%';
  if(unit==='days')return value.toFixed(1)+' d';
  return String(Math.round(value));
}
/** Signed change with the right unit: +2.1 pts, −0.4 d, +3 cases. */
export function fmtChange(value:number|null|undefined,unit:Unit){
  if(value===null||value===undefined)return '—';
  const sign=value>0?'+':value<0?'−':'±';
  const v=Math.abs(value);
  if(unit==='%')return sign+v.toFixed(1)+' pts';
  if(unit==='days')return sign+v.toFixed(1)+' d';
  return sign+(Number.isInteger(v)?v:v.toFixed(1))+' cases';
}
export function fmtDays(days:number){
  if(days<1)return '< 1 day';
  if(days<14)return Math.round(days)+(Math.round(days)===1?' day':' days');
  if(days<70)return '~'+Math.round(days/7)+' weeks';
  return '~'+Math.round(days/30.4)+' months';
}
export function periodName(p:PeriodKind,plural=false){return (p==='week'?'week':'month')+(plural?'s':'');}
/** Labels like "w/c 2 Nov" for weeks and "Nov 2026" for months. */
export function periodLabel(label:string,p:PeriodKind){
  if(p==='month'){const [y,m]=label.split('-').map(Number);return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-SG',{month:'short',year:'numeric',timeZone:'UTC'});}
  const [y,m,d]=label.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d)).toLocaleDateString('en-SG',{day:'numeric',month:'short',timeZone:'UTC'});
}
