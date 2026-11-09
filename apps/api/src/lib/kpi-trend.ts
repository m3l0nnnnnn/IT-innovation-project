// Trend analysis and days-to-fail forecasting for one KPI series.
import { DAY_MS, kpiStatus, periodDays, type Direction, type KpiMetric, type KpiStatus, type PeriodKind, type PeriodValue, type Thresholds, type Unit } from './kpi-calc.js';
import { linearFit, mean, round, stdDev, type Fit } from './stats.js';

/** Complete periods used to judge the current trend: about a quarter of weeks (weekly rates are noisy), or half a year. */
export const TREND_WINDOW: Record<PeriodKind, number> = { week: 12, month: 6 };
/** How far ahead the forecast looks before calling a breach "not expected soon". */
export const FORECAST_HORIZON_DAYS = 180;
/** A period this many standard deviations from the previous ones is a significant change. */
export const SIGNIFICANT_Z = 2.5;
const BASELINE_PERIODS = 8;

/** Two-sided 95% Student t critical values; small samples need a stronger slope before we call a trend. */
export function tCritical(df: number): number {
  const table: [number, number][] = [[1, 12.71], [2, 4.3], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [7, 2.36], [8, 2.31], [9, 2.26], [10, 2.23], [12, 2.18], [15, 2.13], [20, 2.09], [30, 2.04]];
  for (const [d, t] of table) if (df <= d) return t;
  return 1.96;
}

/** The smallest change over the trend window that matters in practice, so tiny but steady drifts stay "stable". */
export function meaningfulChange(unit: Unit, target: number): number {
  if (unit === '%') return 2; // percentage points
  if (unit === 'days') return Math.max(0.25, 0.05 * target);
  return Math.max(2, 0.1 * target);
}

export type TrendLabel = 'improving' | 'stable' | 'declining' | 'insufficient data';
export type ForecastStatus = 'breached' | 'deteriorating' | 'not deteriorating' | 'insufficient data';
export type Confidence = 'high' | 'medium' | 'low';

export type KpiContext = { metric: KpiMetric; unit: Unit; direction: Direction; thresholds: Thresholds; period: PeriodKind; now: number };

export type Analysis = ReturnType<typeof analyseSeries>;

/** Everything the analytics pages and the early-warning module need to know about one KPI series. */
export function analyseSeries(series: PeriodValue[], ctx: KpiContext) {
  const { unit, direction, thresholds, period, now } = ctx;
  const sign = direction === 'higher' ? 1 : -1; // positive "good change" means better
  const complete = series.filter(p => !p.partial && p.value !== null) as (PeriodValue & { value: number })[];
  const latest = complete.at(-1) ?? null;
  const previous = complete.at(-2) ?? null;
  const current = series.at(-1)?.partial ? series.at(-1)! : null;
  const minChange = meaningfulChange(unit, thresholds.target);

  // Compare with history: the previous period, and the average of the periods before the trend window.
  const window = complete.slice(-TREND_WINDOW[period]);
  const history = complete.slice(0, -TREND_WINDOW[period]);
  const historicalAverage = history.length >= 3 ? mean(history.map(p => p.value)) : null;

  // Trend: straight line through the last few complete periods, x = index in the full series.
  const indexOf = new Map(series.map((p, i) => [p.start, i]));
  const fit = linearFit(window.map(p => ({ x: indexOf.get(p.start)!, y: p.value })));
  const trend = classifyTrend(fit, sign, minChange);

  // Consistency: how many period-on-period changes in the window went the wrong way, and the current streak.
  let worseCount = 0, streak = 0;
  for (let i = 1; i < window.length; i++) {
    const worse = sign * (window[i].value - window[i - 1].value) < 0;
    if (worse) worseCount++;
    streak = worse ? streak + 1 : 0;
  }

  const significantChanges = findSignificantChanges(complete, sign, minChange);
  const forecast = forecastBreach({ latest, fit, sign, ctx, series });

  return {
    status: kpiStatus(latest?.value ?? null, direction, thresholds) as KpiStatus,
    latest: latest && { label: latest.label, value: round(latest.value, 2), sample: latest.sample },
    current: current && { label: current.label, value: current.value === null ? null : round(current.value, 2), sample: current.sample, pending: current.pending },
    previous: previous && { label: previous.label, value: round(previous.value, 2) },
    changeVsPrevious: latest && previous ? round(latest.value - previous.value, 2) : null,
    historicalAverage: historicalAverage === null ? null : round(historicalAverage, 2),
    changeVsHistory: latest && historicalAverage !== null ? round(latest.value - historicalAverage, 2) : null,
    trend: {
      label: trend,
      slopePerPeriod: fit ? round(fit.slope, 3) : null,
      changeOverWindow: fit ? round(fit.slope * (window.length - 1), 2) : null,
      r2: fit ? round(fit.r2, 2) : null,
      periods: window.length,
      worseCount, changes: Math.max(0, window.length - 1), worseStreak: streak
    },
    significantChanges,
    forecast
  };
}

function classifyTrend(fit: Fit | null, sign: number, minChange: number): TrendLabel {
  if (!fit || fit.n < 4) return 'insufficient data';
  const t = fit.slopeSE > 0 ? Math.abs(fit.slope) / fit.slopeSE : Infinity;
  const meaningful = Math.abs(fit.slope) * (fit.n - 1) >= minChange;
  if (t < tCritical(fit.n - 2) || !meaningful) return 'stable';
  return sign * fit.slope > 0 ? 'improving' : 'declining';
}

/** Periods well outside the spread of the previous eight, by a margin that matters. */
function findSignificantChanges(complete: (PeriodValue & { value: number })[], sign: number, minChange: number) {
  const out: { label: string; value: number; expected: number; change: number; z: number; direction: 'better' | 'worse' }[] = [];
  for (let i = 6; i < complete.length; i++) {
    const before = complete.slice(Math.max(0, i - BASELINE_PERIODS), i).map(p => p.value);
    const expected = mean(before);
    // A floor on the spread stops a very steady history turning every small wobble into "significant".
    const spread = Math.max(stdDev(before), minChange / 2);
    const change = complete[i].value - expected;
    const z = change / spread;
    if (Math.abs(z) >= SIGNIFICANT_Z && Math.abs(change) >= minChange) {
      out.push({ label: complete[i].label, value: round(complete[i].value, 2), expected: round(expected, 2), change: round(change, 2), z: round(z, 1), direction: sign * change > 0 ? 'better' : 'worse' });
    }
  }
  return out;
}

type ForecastInput = { latest: (PeriodValue & { value: number }) | null; fit: Fit | null; sign: number; ctx: KpiContext; series: PeriodValue[] };

/**
 * Days-to-fail: extend the recent straight-line trend until it crosses the target (and the warning line).
 * The range uses the slope ± one standard error. Estimates only: real performance rarely moves in a straight line.
 */
export function forecastBreach({ latest, fit, sign, ctx, series }: ForecastInput) {
  const { thresholds, period, now, unit } = ctx;
  const len = periodDays(period);
  const empty = { daysToTarget: null, daysToWarning: null, range: null, beyondHorizon: false, confidence: null, projection: [] as { label: string; value: number; low: number; high: number }[] };
  if (!latest || !fit || fit.n < 4) return { status: 'insufficient data' as ForecastStatus, ...empty };

  const lastIndex = series.findIndex(p => p.start === latest.start);
  const lastEnd = series[lastIndex].end;
  const fittedLast = fit.intercept + fit.slope * lastIndex;
  const clamp = (v: number) => Math.max(0, unit === '%' ? Math.min(100, v) : v);

  // Projection for the chart: the fitted line from the latest complete period onwards (through the current partial
  // period, then future periods), with a ±1 standard-error band on the slope that widens with distance.
  const ahead = period === 'week' ? 6 : 3;
  const se = Number.isFinite(fit.slopeSE) ? fit.slopeSE : 0;
  const lastSeries = series.length - 1;
  const projection = [];
  for (let i = lastIndex; i <= lastSeries + ahead; i++) {
    const label = i <= lastSeries ? series[i].label : labelAhead(series[lastSeries].start, period, i - lastSeries);
    const v = fittedLast + fit.slope * (i - lastIndex);
    const spread = se * (i - lastIndex);
    projection.push({ label, value: round(clamp(v), 2), low: round(clamp(v - spread), 2), high: round(clamp(v + spread), 2) });
  }

  if (kpiStatus(latest.value, ctx.direction, thresholds) === 'Breached') {
    return { status: 'breached' as ForecastStatus, ...empty, daysToTarget: 0, projection };
  }

  const t = se > 0 ? Math.abs(fit.slope) / se : Infinity;
  // Only forecast a breach when the line is heading the wrong way by more than its own uncertainty.
  if (sign * fit.slope >= 0 || t < 1) return { status: 'not deteriorating' as ForecastStatus, ...empty, projection };

  const daysUntil = (line: number, slope: number) => {
    if (sign * slope >= 0) return null; // this slope never reaches the line
    const periodsAhead = Math.max(0, (line - fittedLast) / slope);
    return Math.max(0, lastEnd + periodsAhead * len * DAY_MS - now) / DAY_MS;
  };
  const daysToTarget = daysUntil(thresholds.target, fit.slope)!;
  const pastWarning = sign * (fittedLast - thresholds.warning) < 0 || sign * (latest.value - thresholds.warning) < 0;
  const daysToWarning = pastWarning ? 0 : daysUntil(thresholds.warning, fit.slope);
  const worseSlope = fit.slope - sign * se; // steeper decline gives the earliest likely date
  const betterSlope = fit.slope + sign * se;
  const earliest = daysUntil(thresholds.target, worseSlope);
  const latestDays = daysUntil(thresholds.target, betterSlope);

  const confidence: Confidence = t >= tCritical(fit.n - 2) && fit.r2 >= 0.6 && fit.n >= 6 ? 'high' : t >= tCritical(fit.n - 2) ? 'medium' : 'low';
  return {
    status: 'deteriorating' as ForecastStatus,
    daysToTarget: Math.round(daysToTarget),
    daysToWarning: daysToWarning === null ? null : Math.round(daysToWarning),
    range: { earliest: earliest === null ? null : Math.round(earliest), latest: latestDays === null ? null : Math.round(latestDays) },
    beyondHorizon: daysToTarget > FORECAST_HORIZON_DAYS,
    confidence,
    projection
  };
}

function labelAhead(start: number, period: PeriodKind, steps: number) {
  const d = new Date(start + 8 * 3_600_000);
  if (period === 'week') d.setUTCDate(d.getUTCDate() + 7 * steps);
  else d.setUTCMonth(d.getUTCMonth() + steps, 1);
  return d.toISOString().slice(0, period === 'week' ? 10 : 7);
}

/** Formats a KPI value with its unit, e.g. 82.4%, 3.1 days, 12 cases. */
export function formatValue(value: number, unit: Unit): string {
  if (unit === '%') return round(value, 1) + '%';
  if (unit === 'days') return round(value, 1) + ' days';
  return Math.round(value) + ' cases';
}
function formatChange(value: number, unit: Unit): string {
  const v = Math.abs(value);
  if (unit === '%') return round(v, 1) + ' percentage points';
  if (unit === 'days') return round(v, 1) + ' days';
  return round(v, 1) + ' cases';
}
export function formatDays(days: number): string {
  if (days < 1) return 'less than a day';
  if (days < 14) return Math.round(days) + (Math.round(days) === 1 ? ' day' : ' days');
  if (days < 70) return 'about ' + Math.round(days / 7) + ' weeks';
  return 'about ' + Math.round(days / 30.4) + ' months';
}

/** A plain-English explanation of the trend and forecast, for alerts and the analytics pages. */
export function explain(kpiName: string, a: Analysis, ctx: KpiContext): string {
  const { unit, thresholds, period } = ctx;
  const p = period === 'week' ? 'week' : 'month';
  const parts: string[] = [];
  if (!a.latest) return `${kpiName}: not enough cases in recent ${p}s to calculate this KPI.`;
  parts.push(`${kpiName} was ${formatValue(a.latest.value, unit)} in the latest complete ${p}`);
  if (a.trend.label === 'declining' || a.trend.label === 'improving') {
    const verb = a.trend.label === 'declining' ? 'worsened' : 'improved';
    parts[0] += `, and has ${verb} by ${formatChange(a.trend.changeOverWindow ?? 0, unit)} over the last ${a.trend.periods} ${p}s` +
      (a.trend.label === 'declining' ? ` (worse in ${a.trend.worseCount} of ${a.trend.changes} ${p}s)` : '');
  } else if (a.trend.label === 'stable') parts[0] += `, broadly stable over the last ${a.trend.periods} ${p}s`;
  const f = a.forecast;
  const target = formatValue(thresholds.target, unit);
  if (f.status === 'breached') parts.push(`It is already worse than the ${target} target`);
  else if (f.status === 'deteriorating' && f.daysToTarget !== null) {
    if (f.beyondHorizon) parts.push(`At this rate it would not reach the ${target} target within 6 months`);
    else {
      const range = f.range && f.range.earliest !== null
        ? ` (likely ${formatDays(f.range.earliest)} to ${f.range.latest === null ? 'not at all, if the decline eases' : formatDays(f.range.latest)})` : '';
      parts.push(`At this rate it could breach the ${target} target in ${formatDays(f.daysToTarget)}${range}. This is an estimate, not a certainty`);
    }
  }
  return parts.join('. ') + '.';
}
