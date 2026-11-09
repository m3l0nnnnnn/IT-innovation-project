// KPI calculations from feedback cases. Pure functions: the routes load the cases, these do the maths.
import type { kpiMetrics } from '../db/schema.js';

export type KpiMetric = (typeof kpiMetrics)[number];
export type Direction = 'higher' | 'lower';
export type Unit = '%' | 'days' | 'cases';
export type PeriodKind = 'week' | 'month';

export const DAY_MS = 86_400_000;
/** Singapore has no daylight saving, so reporting periods start at a fixed UTC+8 midnight. */
const SGT_OFFSET_MS = 8 * 3_600_000;
/** Fewer cases than this in a period makes a rate or average too noisy to report. */
export const MIN_SAMPLE = 10;

type MetricInfo = {
  label: string; unit: Unit; direction: Direction;
  /** What withinDays means for this metric; null when the metric has no day limit. */
  daysLabel: string | null; defaultDays: number | null;
  /** 'cohort': cases received in the period. 'snapshot': the position at the end of the period. */
  kind: 'cohort' | 'snapshot';
  explain: string;
};

export const METRICS: Record<KpiMetric, MetricInfo> = {
  ack_within: {
    label: 'Acknowledged on time', unit: '%', direction: 'higher', daysLabel: 'Acknowledge within (days)', defaultDays: 3, kind: 'cohort',
    explain: 'Share of cases received in the period that were acknowledged within the day limit. Cases still inside the limit are left out until they can be judged.'
  },
  closed_within: {
    label: 'Closed on time', unit: '%', direction: 'higher', daysLabel: 'Close within (days)', defaultDays: 7, kind: 'cohort',
    explain: 'Share of cases received in the period that were closed within the day limit. Cases still inside the limit are left out until they can be judged.'
  },
  overdue_open: {
    label: 'Overdue open cases', unit: 'cases', direction: 'lower', daysLabel: 'Overdue after (days)', defaultDays: 7, kind: 'snapshot',
    explain: 'Open cases older than the day limit at the end of the period (or now, for the current period).'
  },
  avg_ack_days: {
    label: 'Average response time', unit: 'days', direction: 'lower', daysLabel: null, defaultDays: null, kind: 'cohort',
    explain: 'Average days from receiving a case to acknowledging it, for cases acknowledged in the period. Cases still waiting show up in the overdue KPI.'
  },
  avg_close_days: {
    label: 'Average resolution time', unit: 'days', direction: 'lower', daysLabel: null, defaultDays: null, kind: 'cohort',
    explain: 'Average days from receiving a case to closing it, for cases closed in the period. Cases still open show up in the overdue KPI.'
  },
  repeat_rate: {
    label: 'Recurring cases', unit: '%', direction: 'lower', daysLabel: 'Repeat window (days)', defaultDays: 14, kind: 'cohort',
    explain: 'Share of cases received in the period that repeat a case of the same category at the same block within the window.'
  }
};

/** The fields of a feedback case the KPI calculations use. Times are epoch milliseconds. */
export type CaseFacts = {
  townCouncilId: string; block: string; category: string;
  receivedAt: number; acknowledgedAt: number | null; closedAt: number | null;
  /** Filled in by markRepeats for the repeat window in use. */
  repeat?: boolean;
};

/** The parts of a KPI definition the calculation needs. */
export type KpiSpec = { metric: KpiMetric; withinDays: number | null; category: string | null };

export type Period = { start: number; end: number; label: string; partial: boolean };

function sgtParts(t: number) {
  const d = new Date(t + SGT_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: (d.getUTCDay() + 6) % 7 }; // Monday = 0
}
const sgtMidnight = (year: number, month: number, day: number) => Date.UTC(year, month, day) - SGT_OFFSET_MS;
const sgtLabel = (t: number, kind: PeriodKind) => new Date(t + SGT_OFFSET_MS).toISOString().slice(0, kind === 'week' ? 10 : 7);

/** The last `count` reporting periods up to now, oldest first. Weeks start on Monday; the last period is usually partial. */
export function buildPeriods(kind: PeriodKind, count: number, now: number): Period[] {
  const p = sgtParts(now);
  const starts: number[] = [];
  for (let i = count - 1; i >= 0; i--) {
    starts.push(kind === 'week' ? sgtMidnight(p.year, p.month, p.day - p.weekday - 7 * i) : sgtMidnight(p.year, p.month - i, 1));
  }
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : (kind === 'week' ? start + 7 * DAY_MS : sgtMidnight(p.year, p.month + 1, 1));
    return { start, end, label: sgtLabel(start, kind), partial: end > now };
  });
}

/** Typical length of one period in days, for turning "periods ahead" into days. */
export const periodDays = (kind: PeriodKind) => (kind === 'week' ? 7 : 365.25 / 12);

/** Marks each case that repeats a same-category case at the same block within `windowDays`. */
export function markRepeats(cases: CaseFacts[], windowDays: number) {
  const last = new Map<string, number>();
  const sorted = [...cases].sort((a, b) => a.receivedAt - b.receivedAt);
  for (const c of sorted) {
    const key = c.townCouncilId + '|' + c.block + '|' + c.category;
    const before = last.get(key);
    c.repeat = before !== undefined && c.receivedAt - before <= windowDays * DAY_MS;
    last.set(key, c.receivedAt);
  }
}

/**
 * Numerator and denominator for a KPI over cases received in [start, end).
 * value = num / den (× 100 for percentages). Snapshot metrics count at `end` instead (den = 1).
 */
export function aggregate(spec: KpiSpec, cases: CaseFacts[], start: number, end: number, now: number) {
  const info = METRICS[spec.metric];
  const days = (spec.withinDays ?? info.defaultDays ?? 0) * DAY_MS;
  const matches = spec.category ? cases.filter(c => c.category === spec.category) : cases;

  if (info.kind === 'snapshot') {
    const at = Math.min(end, now);
    let count = 0;
    for (const c of matches) if (c.receivedAt < at - days && (c.closedAt === null || c.closedAt > at)) count++;
    return { num: count, den: 1, pending: 0, sample: count };
  }

  let num = 0, den = 0, pending = 0;
  const until = Math.min(end, now);

  // Average times use the cases completed in the period. Averaging the cases *received* in the period would
  // leave out (or undercount) the slow ones still open, so the latest periods would always look better than they are.
  if (spec.metric === 'avg_ack_days' || spec.metric === 'avg_close_days') {
    for (const c of matches) {
      const done = spec.metric === 'avg_ack_days' ? c.acknowledgedAt : c.closedAt;
      if (done === null || done < start || done >= until) continue;
      num += (done - c.receivedAt) / DAY_MS;
      den++;
    }
    return { num, den, pending: 0, sample: den };
  }

  for (const c of matches) {
    if (c.receivedAt < start || c.receivedAt >= until) continue;
    switch (spec.metric) {
      case 'ack_within':
      case 'closed_within': {
        // Not yet judgeable: still inside the limit. Counting only the early successes would flatter the period.
        if (c.receivedAt + days > now) { pending++; break; }
        const done = spec.metric === 'ack_within' ? c.acknowledgedAt : c.closedAt;
        den++;
        if (done !== null && done - c.receivedAt <= days) num++;
        break;
      }
      case 'repeat_rate':
        den++;
        if (c.repeat) num++;
        break;
    }
  }
  return { num, den, pending, sample: den };
}

export function toValue(spec: KpiSpec, agg: { num: number; den: number }): number | null {
  const info = METRICS[spec.metric];
  if (info.kind === 'snapshot') return agg.num;
  if (agg.den < MIN_SAMPLE) return null;
  return (agg.num / agg.den) * (info.unit === '%' ? 100 : 1);
}

export type PeriodValue = Period & { value: number | null; sample: number; pending: number };

/** One KPI value per period for one set of cases (normally one Town Council). */
export function kpiSeries(spec: KpiSpec, cases: CaseFacts[], periods: Period[], now: number): PeriodValue[] {
  if (spec.metric === 'repeat_rate') markRepeats(cases, spec.withinDays ?? METRICS.repeat_rate.defaultDays!);
  return periods.map(p => {
    const agg = aggregate(spec, cases, p.start, p.end, now);
    return { ...p, value: toValue(spec, agg), sample: agg.sample, pending: agg.pending };
  });
}

export type Thresholds = { target: number; warning: number };
export type KpiStatus = 'On track' | 'At risk' | 'Breached' | 'No data';

/** Breached: worse than the target. At risk: between the warning line and the target. */
export function kpiStatus(value: number | null, direction: Direction, t: Thresholds): KpiStatus {
  if (value === null) return 'No data';
  const worse = (a: number, b: number) => (direction === 'higher' ? a < b : a > b);
  if (worse(value, t.target)) return 'Breached';
  if (worse(value, t.warning)) return 'At risk';
  return 'On track';
}

/** The warning line must sit on the healthy side of the target (or on it, for no warning band). */
export function thresholdError(direction: Direction, unit: Unit, t: Thresholds): string | null {
  if (unit === '%' && [t.target, t.warning].some(v => v < 0 || v > 100)) return 'Percentage targets must be between 0 and 100';
  if ([t.target, t.warning].some(v => v < 0)) return 'Targets cannot be negative';
  if (direction === 'higher' && t.warning < t.target) return 'For this KPI higher is better, so the warning line must be at or above the target';
  if (direction === 'lower' && t.warning > t.target) return 'For this KPI lower is better, so the warning line must be at or below the target';
  return null;
}
