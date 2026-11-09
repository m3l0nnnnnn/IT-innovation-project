// Ties the KPI calculation, trend and forecast together for one KPI and one Town Council.
import { DAY_MS, METRICS, buildPeriods, kpiSeries, type CaseFacts, type KpiSpec, type PeriodKind, type Thresholds } from './kpi-calc.js';
import { analyseSeries, explain, type Analysis, type KpiContext } from './kpi-trend.js';
import { DEFAULT_PERIODS } from './kpis.js';

export type KpiDef = KpiSpec & { id: string; name: string } & Thresholds;

/** The cases as they were known at time t: later cases left out, later acknowledgements and closures undone. */
export function knownAt(cases: CaseFacts[], t: number): CaseFacts[] {
  const out: CaseFacts[] = [];
  for (const c of cases) {
    if (c.receivedAt > t) continue;
    out.push({
      ...c,
      acknowledgedAt: c.acknowledgedAt !== null && c.acknowledgedAt <= t ? c.acknowledgedAt : null,
      closedAt: c.closedAt !== null && c.closedAt <= t ? c.closedAt : null
    });
  }
  return out;
}

export function context(def: KpiSpec, thresholds: Thresholds, period: PeriodKind, now: number): KpiContext {
  const info = METRICS[def.metric];
  return { metric: def.metric, unit: info.unit, direction: info.direction, thresholds, period, now };
}

export function evaluate(def: KpiDef, thresholds: Thresholds, cases: CaseFacts[], period: PeriodKind, now: number, count: number = DEFAULT_PERIODS[period]) {
  const series = kpiSeries(def, cases, buildPeriods(period, count, now), now);
  const ctx = context(def, thresholds, period, now);
  const analysis = analyseSeries(series, ctx);
  return { series, analysis, explanation: explain(def.name, analysis, ctx) };
}

/** How far back the case data must go for `count` periods (plus look-back for repeat windows and day limits). */
export function dataStart(period: PeriodKind, count: number, now: number, extraDays = 0) {
  const length = period === 'week' ? 7 : 31;
  return now - (count * length + 100 + extraDays) * DAY_MS;
}

export const BACKTEST_POINTS = 16;

/**
 * Forecast backtest: re-run the forecast at the end of each of the last 16 weeks (months), using only what was known
 * then, and compare with what happened. Shows managers how early the forecast would have warned and how reliable it is.
 */
export function backtest(def: KpiDef, thresholds: Thresholds, cases: CaseFacts[], period: PeriodKind, now: number) {
  const ends = buildPeriods(period, BACKTEST_POINTS + 1, now).filter(p => !p.partial).map(p => p.end).slice(-BACKTEST_POINTS);
  const points = ends.map(t => {
    const { analysis } = evaluate(def, thresholds, knownAt(cases, t), period, t);
    const f = analysis.forecast;
    return {
      asOf: new Date(t).toISOString(),
      value: analysis.latest?.value ?? null,
      status: analysis.status,
      forecast: f.status,
      daysToTarget: f.status === 'deteriorating' && !f.beyondHorizon ? f.daysToTarget : null,
      predictedBreachAt: f.status === 'deteriorating' && !f.beyondHorizon && f.daysToTarget !== null ? new Date(t + f.daysToTarget * DAY_MS).toISOString() : null,
      confidence: f.confidence
    };
  });

  // The first sustained breach (two periods in a row, so a one-off dip does not count) after a period that was not
  // breached, and the start of the unbroken run of credible warnings before it. Low-confidence forecasts are not
  // counted as warnings: a manager would not act on them, and counting them would flatter the lead time.
  const breached = (i: number) => points[i]?.status === 'Breached';
  let breachIndex = -1;
  for (let i = 1; i < points.length; i++) {
    if (breached(i) && !breached(i - 1) && (breached(i + 1) || i === points.length - 1)) { breachIndex = i; break; }
  }
  const warned = (i: number) => points[i].predictedBreachAt !== null && points[i].confidence !== 'low';
  let firstWarning = -1;
  if (breachIndex > 0) {
    for (let i = breachIndex - 1; i >= 0 && warned(i); i--) firstWarning = i;
  }
  const leadDays = firstWarning >= 0 ? Math.round((ends[breachIndex] - ends[firstWarning]) / DAY_MS) : null;
  return {
    points,
    breachedAt: breachIndex >= 0 ? points[breachIndex].asOf : null,
    firstWarningAt: firstWarning >= 0 ? points[firstWarning].asOf : null,
    leadDays,
    // Error of the first warning's predicted date, in days (positive = breach came later than predicted).
    errorDays: firstWarning >= 0 ? Math.round((ends[breachIndex] - Date.parse(points[firstWarning].predictedBreachAt!)) / DAY_MS) : null
  };
}

export type Severity = 'Critical' | 'Warning' | 'Watch';

/**
 * A SUGGESTED early-warning level for the alert module, following the project's risk classes. The early-warning
 * module (Brina) owns the final rules; this keeps the KPI facts and the suggestion together.
 * Critical: already worse than the target. Warning: forecast to breach within 4 weeks (medium or high confidence), or
 * past the warning line and declining. Watch: past the warning line, declining, or any forecast breach within 6 months.
 */
export function suggestSeverity(a: Analysis): Severity | null {
  const f = a.forecast;
  if (a.status === 'Breached') return 'Critical';
  const soon = f.status === 'deteriorating' && !f.beyondHorizon && f.daysToTarget !== null;
  if (soon && f.daysToTarget! <= 28 && f.confidence !== 'low') return 'Warning';
  if (a.status === 'At risk' && a.trend.label === 'declining') return 'Warning';
  if (a.status === 'At risk' || a.trend.label === 'declining' || soon) return 'Watch';
  return null;
}
