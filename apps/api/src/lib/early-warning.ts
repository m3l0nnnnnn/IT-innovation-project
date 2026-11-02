/**
 * Estara's read-only early-warning evaluator.
 * Adapted from the pure rule design in user-provided TC Pulse (2026-11-01 v2):
 * green/amber/red bands, headroom, least-squares trends, projected breaches
 * and consecutive deterioration. No financial penalties or MND claims.
 *
 * EMS thresholds must be confirmed before use with operational data.
 */
export type Direction = 'higher' | 'lower';
export type Severity = 'Healthy' | 'Watch' | 'Warning' | 'Critical';
export type Signal = 'BREACHED' | 'PROJECTED_BREACH' | 'HEADROOM' | 'CONSECUTIVE_DECLINE';

export interface MonitorInput {
  name: string;
  values: number[]; // Consecutive reporting periods, oldest to newest.
  direction: Direction;
  greenLimit: number; // Green -> Amber boundary (higher: below; lower: at/above).
  redLimit: number; // Amber -> Red boundary.
  minValue: number;
  maxValue: number;
  unit?: string;
}

export interface MonitorOptions {
  window?: number;
  horizonPeriods?: number;
  headroomWatch?: number;
  headroomWarning?: number;
  declineMinHeadroom?: number;
}
export interface WarningEvaluation {
  name: string;
  value: number;
  unit: string;
  severity: Severity;
  band: 'Green' | 'Amber' | 'Red';
  signals: Signal[];
  slopePerPeriod: number | null;
  projectedBreachPeriods: number | null;
  projectedNextValue: number | null;
  headroomUsed: number | null;
  reportingPeriods: number;
  explanation: string;
}

const defaults: Required<MonitorOptions> = {
  window: 6,
  horizonPeriods: 3,
  headroomWatch: 0.75,
  headroomWarning: 0.90,
  declineMinHeadroom: 0.50
};
const precise = (n: number) => Number(n.toFixed(2));
function format(n: number, unit: string) { return precise(n) + unit; }
function bandOf(i: MonitorInput, value: number): 'Green' | 'Amber' | 'Red' {
  if (i.direction === 'higher') {
    if (value >= i.greenLimit) return 'Green';
    if (value >= i.redLimit) return 'Amber';
    return 'Red';
  }
  if (value < i.greenLimit) return 'Green';
  if (value < i.redLimit) return 'Amber';
  return 'Red';
}
function linearSlope(points: number[]): number {
  const n = points.length;
  const meanX = (n - 1) / 2;
  const meanY = points.reduce((sum, v) => sum + v, 0) / n;
  let numerator = 0, denominator = 0;
  for (let x = 0; x < n; x++) {
    numerator += (x - meanX) * (points[x] - meanY);
    denominator += (x - meanX) ** 2;
  }
  return numerator / denominator;
}
function validate(i: MonitorInput, p: Required<MonitorOptions>) {
  if (!i.name.trim() || !['higher','lower'].includes(i.direction)) throw new Error('Invalid KPI name or direction.');
  if (!i.values.length || i.values.length > 120 || i.values.some(v=>!Number.isFinite(v))) throw new Error('Invalid KPI readings.');
  if (![i.greenLimit,i.redLimit,i.minValue,i.maxValue].every(Number.isFinite) || i.minValue >= i.maxValue) throw new Error('Invalid KPI thresholds.');
  if (i.direction === 'higher' && !(i.minValue <= i.redLimit && i.redLimit < i.greenLimit && i.greenLimit < i.maxValue)) throw new Error('Higher-is-better bands are not ordered.');
  if (i.direction === 'lower' && !(i.minValue < i.greenLimit && i.greenLimit < i.redLimit && i.redLimit <= i.maxValue)) throw new Error('Lower-is-better bands are not ordered.');
  if (i.values.some(v=>v<i.minValue || v>i.maxValue)) throw new Error('KPI reading falls outside configured scale.');
  if (![p.headroomWatch,p.headroomWarning,p.declineMinHeadroom].every(v=>Number.isFinite(v)&&v>=0&&v<=1) ||
      p.headroomWarning<p.headroomWatch || !Number.isInteger(p.window) || p.window<3 || p.window>24 ||
      !Number.isInteger(p.horizonPeriods) || p.horizonPeriods<1 || p.horizonPeriods>24) throw new Error('Invalid warning configuration.');
}

export function evaluateEarlyWarning(input: MonitorInput, options: MonitorOptions = {}): WarningEvaluation {
  const params = { ...defaults, ...options };
  validate(input, params);
  const points = input.values.slice(-params.window);
  const current = points[points.length-1];
  const band = bandOf(input, current);
  const slope = points.length >= 3 ? linearSlope(points) : null;
  const towardSign = input.direction === 'higher' ? -1 : 1;
  const deteriorating = slope !== null && towardSign * slope > 1e-9;
  const boundary = band === 'Red' ? null : band === 'Green' ? input.greenLimit : input.redLimit;
  const periods = deteriorating && boundary !== null ? Math.max(0, Math.abs(boundary-current)/Math.abs(slope!)) : null;
  const used = input.direction === 'higher' ?
    (input.maxValue-current)/(input.maxValue-input.greenLimit) :
    (current-input.minValue)/(input.greenLimit-input.minValue);
  const headroomUsed = Math.max(0, used);
  const changes = points.slice(1).map((v,index)=>towardSign*(v-points[index]));
  const lastTwo = changes.length>=2 && changes.slice(-2).every(c=>c>0);
  const lastThree = changes.length>=3 && changes.slice(-3).every(c=>c>0);
  const within = (horizon:number)=>periods!==null && periods<=horizon+1e-9;
  const signals: Signal[] = [];
  let severity: Severity='Healthy';
  if (band!=='Green') {
    signals.push('BREACHED');
    severity=band==='Red'?'Critical':'Warning';
  } else {
    if (within(1) || (within(params.horizonPeriods)&&lastThree)) signals.push('PROJECTED_BREACH');
    if (headroomUsed>=params.headroomWatch-1e-9) signals.push('HEADROOM');
    if (lastTwo && headroomUsed>=params.declineMinHeadroom-1e-9) signals.push('CONSECUTIVE_DECLINE');
    if (signals.length) severity=within(1)||headroomUsed>=params.headroomWarning-1e-9?'Warning':'Watch';
  }
  const unit = input.unit ?? '';
  const projectedNextValue = slope===null?null:Math.min(input.maxValue,Math.max(input.minValue,current+slope));
  const detail = band==='Red'?'has breached the red limit':
    band==='Amber'?'has crossed the first performance threshold':
    signals.includes('PROJECTED_BREACH')?'may cross its first threshold in '+precise(periods!)+' reporting periods':
    signals.includes('HEADROOM')?'has used '+Math.round(headroomUsed*100)+'% of the available headroom':
    signals.includes('CONSECUTIVE_DECLINE')?'has declined in consecutive periods near the threshold':
    'has no warning signal under the configured rules';
  return {
    name:input.name,value:current,unit,severity,band,signals,
    slopePerPeriod:slope===null?null:precise(slope),
    projectedBreachPeriods:periods===null?null:precise(periods),
    projectedNextValue:projectedNextValue===null?null:precise(projectedNextValue),
    headroomUsed:precise(headroomUsed),
    reportingPeriods:points.length,
    explanation:input.name+' is at '+format(current,unit)+' and '+detail+'. This is an indicative monitoring result, not a confirmed EMS performance grade.'
  };
}
