// Contributing-factor analysis: why is a KPI where it is? Categories that moved it, blocks with unusually many
// outstanding cases, and categories whose complaint volume changed sharply.
import { DAY_MS, METRICS, aggregate, markRepeats, toValue, type CaseFacts, type KpiSpec } from './kpi-calc.js';
import { poissonLowerTail, poissonUpperTail, round } from './stats.js';

/** "Recent" is the last four weeks, compared with the twelve weeks before. */
export const RECENT_DAYS = 28;
export const BASELINE_DAYS = 84;
/** A count this unlikely at the usual rate is flagged. */
export const FACTOR_P_VALUE = 0.01;
/** Volume changes smaller than this (±25%) are not worth a manager's attention even if statistically clear. */
const MIN_VOLUME_RATIO_CHANGE = 0.25;
const MIN_BLOCK_OPEN = 3;
/** Contributions smaller than this are shown as neutral: window-edge rounding, not a real effect. */
const NEUTRAL = { '%': 0.5, days: 0.05, cases: 0.5 } as const;

export type CategoryContribution = {
  category: string;
  /** Change in the overall KPI caused by this category. Sums (with the others) to the overall change. */
  contribution: number;
  effect: 'worse' | 'better' | 'neutral';
  recentValue: number | null; baselineValue: number | null;
  recentCases: number; baselineCases: number;
};

/**
 * Splits the change in a KPI between categories. A rate is Σ num_c / Σ den, so each category's share of the change is
 * num_c(recent)/den(recent) − num_c(before)/den(before): the categories' contributions add up exactly to the total change.
 * That counts both a category getting worse and a slow category becoming a bigger share of the workload.
 */
export function categoryContributions(spec: KpiSpec, cases: CaseFacts[], categories: readonly string[], now: number) {
  const info = METRICS[spec.metric];
  const sign = info.direction === 'higher' ? 1 : -1;
  const scale = info.unit === '%' ? 100 : 1;
  const recentStart = now - RECENT_DAYS * DAY_MS, baseStart = recentStart - BASELINE_DAYS * DAY_MS;
  if (spec.metric === 'repeat_rate') markRepeats(cases, spec.withinDays ?? METRICS.repeat_rate.defaultDays!);

  // Snapshot KPIs (overdue cases) compare the count now with the average count at the weekly points before.
  const snapshot = info.kind === 'snapshot';
  const baselinePoints = Array.from({ length: BASELINE_DAYS / 7 }, (_, i) => baseStart + (i + 1) * 7 * DAY_MS);
  const measure = (s: KpiSpec, recent: boolean) => {
    if (snapshot) {
      if (recent) return aggregate(s, cases, 0, now, now);
      const counts = baselinePoints.map(t => aggregate(s, cases, 0, t, now).num);
      return { num: counts.reduce((a, b) => a + b, 0) / counts.length, den: 1, pending: 0, sample: 0 };
    }
    return recent ? aggregate(s, cases, recentStart, now, now) : aggregate(s, cases, baseStart, recentStart, now);
  };
  const overallRecent = measure(spec, true), overallBase = measure(spec, false);
  const recentValue = toValue(spec, overallRecent), baselineValue = toValue(spec, overallBase);

  const rows: CategoryContribution[] = [];
  for (const category of spec.category ? [spec.category] : categories) {
    const s = { ...spec, category };
    const r = measure(s, true), b = measure(s, false);
    const share = (part: { num: number }, whole: { den: number }) => (whole.den > 0 ? (part.num / whole.den) * scale : 0);
    const contribution = snapshot ? r.num - b.num : share(r, overallRecent) - share(b, overallBase);
    const volume = (from: number, to: number) => cases.filter(c => c.category === category && c.receivedAt >= from && c.receivedAt < to).length;
    rows.push({
      category,
      contribution: round(contribution, 2),
      effect: Math.abs(contribution) < NEUTRAL[info.unit] ? 'neutral' : sign * contribution < 0 ? 'worse' : 'better',
      recentValue: valueOrNull(toValue(s, r)), baselineValue: valueOrNull(toValue(s, b)),
      recentCases: volume(recentStart, now), baselineCases: volume(baseStart, recentStart)
    });
  }
  // Biggest drag on performance first.
  rows.sort((a, b) => sign * a.contribution - sign * b.contribution);
  return {
    recentValue: valueOrNull(recentValue), baselineValue: valueOrNull(baselineValue),
    change: recentValue !== null && baselineValue !== null ? round(recentValue - baselineValue, 2) : null,
    categories: rows
  };
}
const valueOrNull = (v: number | null) => (v === null ? null : round(v, 2));

export type BlockOutstanding = {
  block: string; open: number; overdue: number; expected: number; chance: number; unusual: boolean;
  topCategory: string; oldestDays: number;
};

/**
 * Blocks with more open cases than their usual share of the council's workload would explain. A block's usual share is
 * its share of all cases over the last year, so a big block with many residents is not flagged just for being big.
 */
export function outstandingByBlock(cases: CaseFacts[], now: number, overdueDays = 7): BlockOutstanding[] {
  const yearAgo = now - 365 * DAY_MS;
  const volume = new Map<string, number>();
  let total = 0;
  for (const c of cases) if (c.receivedAt >= yearAgo) { volume.set(c.block, (volume.get(c.block) ?? 0) + 1); total++; }
  const open = cases.filter(c => c.closedAt === null || c.closedAt > now);
  const blocks = new Map<string, CaseFacts[]>();
  for (const c of open) {
    const list = blocks.get(c.block);
    if (list) list.push(c); else blocks.set(c.block, [c]);
  }

  const rows: BlockOutstanding[] = [];
  for (const [block, list] of blocks) {
    // Add-one smoothing so a block with few earlier cases still gets a small expected count.
    const share = ((volume.get(block) ?? 0) + 1) / (total + volume.size + 1);
    const expected = open.length * share;
    const chance = poissonUpperTail(list.length, expected);
    const byCategory = new Map<string, number>();
    for (const c of list) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    rows.push({
      block, open: list.length,
      overdue: list.filter(c => c.receivedAt < now - overdueDays * DAY_MS).length,
      expected: round(expected, 1), chance,
      unusual: list.length >= MIN_BLOCK_OPEN && chance < FACTOR_P_VALUE,
      topCategory: [...byCategory].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      oldestDays: round(Math.max(...list.map(c => (now - c.receivedAt) / DAY_MS)), 0)
    });
  }
  return rows.sort((a, b) => Number(b.unusual) - Number(a.unusual) || a.chance - b.chance || b.open - a.open);
}

export type VolumeChange = {
  category: string; recent: number; expected: number; ratio: number | null;
  change: 'increase' | 'decrease' | 'normal';
  /** Same four weeks a year ago, when there is that much history; helps spot seasonal patterns. */
  lastYear: number | null; seasonal: boolean;
};

/** Categories whose case count in the last four weeks is far from the twelve weeks before (Poisson tails). */
export function volumeChanges(cases: CaseFacts[], categories: readonly string[], now: number, historyStart: number): VolumeChange[] {
  const recentStart = now - RECENT_DAYS * DAY_MS, baseStart = recentStart - BASELINE_DAYS * DAY_MS;
  const lastYearStart = recentStart - 365 * DAY_MS, lastYearEnd = now - 365 * DAY_MS;
  const hasLastYear = historyStart <= lastYearStart;
  const count = (cat: string | null, from: number, to: number) =>
    cases.filter(c => (cat === null || c.category === cat) && c.receivedAt >= from && c.receivedAt < to).length;

  return [null, ...categories].map(category => {
    const recent = count(category, recentStart, now);
    const expected = count(category, baseStart, recentStart) * RECENT_DAYS / BASELINE_DAYS;
    const ratio = expected > 0 ? recent / expected : null;
    const up = poissonUpperTail(recent, Math.max(expected, 0.5)) < FACTOR_P_VALUE;
    const down = expected > 0 && poissonLowerTail(recent, expected) < FACTOR_P_VALUE;
    const big = ratio === null || Math.abs(ratio - 1) >= MIN_VOLUME_RATIO_CHANGE;
    const change: VolumeChange['change'] = big && up ? 'increase' : big && down ? 'decrease' : 'normal';
    const lastYear = hasLastYear ? count(category, lastYearStart, lastYearEnd) : null;
    // Seasonal: this year's change is within 25% of the level seen at the same time last year.
    const seasonal = change !== 'normal' && lastYear !== null && lastYear > 0 && Math.abs(recent / lastYear - 1) < MIN_VOLUME_RATIO_CHANGE;
    return { category: category ?? 'All categories', recent, expected: round(expected, 1), ratio: ratio === null ? null : round(ratio, 2), change, lastYear, seasonal };
  });
}
