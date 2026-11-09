import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, buildPeriods, type CaseFacts, type PeriodValue } from '../lib/kpi-calc.js';
import { analyseSeries, explain, formatDays, type KpiContext } from '../lib/kpi-trend.js';
import { backtest, knownAt, suggestSeverity, type KpiDef } from '../lib/kpi-engine.js';

const NOW = Date.parse('2026-11-05T02:00:00Z');
const ctx = (over: Partial<KpiContext> = {}): KpiContext => ({
  metric: 'ack_within', unit: '%', direction: 'higher', thresholds: { target: 75, warning: 80 }, period: 'week', now: NOW, ...over
});
/** A weekly series with the given complete values, plus the current partial week. */
function weekly(values: (number | null)[]): PeriodValue[] {
  const periods = buildPeriods('week', values.length + 1, NOW);
  return periods.map((p, i) => ({ ...p, value: i < values.length ? values[i] : null, sample: 40, pending: 0 }));
}
const wobble = (i: number) => [0.6, -0.4, 0.3, -0.7, 0.5, -0.2][i % 6];

test('a steady decline is "declining" and forecast to breach the target', () => {
  // 95% falling 1 point a week: ~82% now, 7 points above the 75% target, so roughly 7 weeks to go.
  const values = Array.from({ length: 20 }, (_, i) => 95 - Math.max(0, i - 6) + wobble(i));
  const a = analyseSeries(weekly(values), ctx());
  assert.equal(a.trend.label, 'declining');
  assert.equal(a.status, 'On track');
  assert.equal(a.forecast.status, 'deteriorating');
  assert.ok(a.forecast.daysToTarget! > 35 && a.forecast.daysToTarget! < 65, `daysToTarget ${a.forecast.daysToTarget}`);
  assert.ok(a.forecast.range!.earliest! <= a.forecast.daysToTarget! && a.forecast.daysToTarget! <= a.forecast.range!.latest!);
  assert.equal(a.forecast.confidence, 'high');
  assert.ok(a.trend.worseCount >= 7);
  assert.ok(a.forecast.projection.length > 0 && a.forecast.projection.at(-1)!.value < a.latest!.value);
  assert.equal(suggestSeverity(a), 'Watch');
  assert.match(explain('Acknowledged within 3 days', a, ctx()), /could breach the 75% target in about \d weeks/);
});

test('noise around a flat line is "stable" and does not produce a breach forecast', () => {
  const values = Array.from({ length: 20 }, (_, i) => 88 + 3 * wobble(i));
  const a = analyseSeries(weekly(values), ctx());
  assert.equal(a.trend.label, 'stable');
  assert.equal(a.forecast.status, 'not deteriorating');
  assert.equal(a.forecast.daysToTarget, null);
  assert.equal(suggestSeverity(a), null);
});

test('for lower-is-better KPIs a rising line is the decline', () => {
  const values = Array.from({ length: 20 }, (_, i) => 3 + 0.6 * i + wobble(i) * 0.3); // overdue cases rising
  const a = analyseSeries(weekly(values), ctx({ metric: 'overdue_open', unit: 'cases', direction: 'lower', thresholds: { target: 20, warning: 12 } }));
  assert.equal(a.trend.label, 'declining');
  assert.equal(a.forecast.status, 'deteriorating');
  assert.equal(a.forecast.daysToWarning, 0); // already past the warning line
  assert.equal(a.status, 'At risk');
  assert.equal(suggestSeverity(a), 'Warning');
});

test('an improving KPI is labelled improving', () => {
  const values = Array.from({ length: 20 }, (_, i) => 70 + 1.2 * i + wobble(i));
  assert.equal(analyseSeries(weekly(values), ctx()).trend.label, 'improving');
});

test('a KPI already worse than its target is breached and critical', () => {
  const values = Array.from({ length: 20 }, (_, i) => 85 - i + wobble(i));
  const a = analyseSeries(weekly(values), ctx());
  assert.equal(a.status, 'Breached');
  assert.equal(a.forecast.status, 'breached');
  assert.equal(a.forecast.daysToTarget, 0);
  assert.equal(suggestSeverity(a), 'Critical');
});

test('too few periods is insufficient data', () => {
  const a = analyseSeries(weekly([90, null, null, 88]), ctx());
  assert.equal(a.trend.label, 'insufficient data');
  assert.equal(a.forecast.status, 'insufficient data');
});

test('a sudden drop is flagged as a significant change', () => {
  const values = [...Array.from({ length: 15 }, (_, i) => 90 + wobble(i)), 76, 89];
  const a = analyseSeries(weekly(values), ctx());
  const drop = a.significantChanges.find(c => c.value === 76);
  assert.ok(drop, 'drop flagged');
  assert.equal(drop!.direction, 'worse');
  assert.equal(a.significantChanges.length, 1);
});

test('comparisons with the previous period and history', () => {
  const values = [...Array.from({ length: 14 }, () => 90), 86, 84];
  const a = analyseSeries(weekly(values), ctx());
  assert.equal(a.changeVsPrevious, -2);
  assert.equal(a.historicalAverage, 90);
  assert.equal(a.changeVsHistory, -6);
});

test('durations read naturally', () => {
  assert.equal(formatDays(0.4), 'less than a day');
  assert.equal(formatDays(9), '9 days');
  assert.equal(formatDays(30), 'about 4 weeks');
  assert.equal(formatDays(120), 'about 4 months');
});

test('knownAt undoes acknowledgements and closures after the date', () => {
  const t = NOW - 10 * DAY_MS;
  const cases: CaseFacts[] = [
    { townCouncilId: 'a', block: '1', category: 'Lift', receivedAt: t - 5 * DAY_MS, acknowledgedAt: t - 4 * DAY_MS, closedAt: t + DAY_MS },
    { townCouncilId: 'a', block: '1', category: 'Lift', receivedAt: t + DAY_MS, acknowledgedAt: null, closedAt: null }
  ];
  const known = knownAt(cases, t);
  assert.equal(known.length, 1);
  assert.equal(known[0].acknowledgedAt, t - 4 * DAY_MS);
  assert.equal(known[0].closedAt, null);
});

test('backtest finds how early the forecast warned before a breach', () => {
  // A council whose on-time acknowledgement share falls smoothly from 92% over the last 14 weeks.
  const cases: CaseFacts[] = [];
  for (let k = 0; k < 3000; k++) {
    const received = NOW - (300 - k * 0.1) * DAY_MS;
    const late = Math.max(0, (98 - (300 - k * 0.1)) / 98);
    const ackDays = (k * 0.618034) % 1 < 0.92 - 0.5 * late ? 1 : 4; // evenly spread, so no random noise
    cases.push({ townCouncilId: 'a', block: String(100 + (k % 30)), category: 'Lift', receivedAt: received, acknowledgedAt: received + ackDays * DAY_MS, closedAt: received + (ackDays + 2) * DAY_MS });
  }
  const def: KpiDef = { id: 'k', name: 'Acknowledged within 3 days', metric: 'ack_within', withinDays: 3, category: null, target: 75, warning: 80 };
  const result = backtest(def, def, cases, 'week', NOW);
  assert.equal(result.points.length, 16);
  assert.ok(result.breachedAt && Date.parse(result.breachedAt) > Date.parse('2026-08-30'), `breach ${result.breachedAt}`);
  assert.ok(result.leadDays !== null && result.leadDays >= 7, `lead ${result.leadDays}`);
  assert.equal(typeof result.errorDays, 'number');
  // Before the decline the forecast does not warn.
  assert.equal(result.points[0].forecast, 'not deteriorating');
});

test('backtest ignores a one-week dip below target', () => {
  const cases: CaseFacts[] = [];
  for (let k = 0; k < 3000; k++) {
    const received = NOW - (300 - k * 0.1) * DAY_MS;
    const dip = received > NOW - 60 * DAY_MS && received < NOW - 53 * DAY_MS;
    const ackDays = (k * 0.618034) % 1 < (dip ? 0.6 : 0.9) ? 1 : 4;
    cases.push({ townCouncilId: 'a', block: '1', category: 'Lift', receivedAt: received, acknowledgedAt: received + ackDays * DAY_MS, closedAt: received + (ackDays + 2) * DAY_MS });
  }
  const def: KpiDef = { id: 'k', name: 'x', metric: 'ack_within', withinDays: 3, category: null, target: 75, warning: 80 };
  const result = backtest(def, def, cases, 'week', NOW);
  assert.ok(result.points.some(p => p.status === 'Breached'), 'the dip week is breached');
  assert.equal(result.breachedAt, null);
});
