import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, aggregate, buildPeriods, kpiSeries, kpiStatus, markRepeats, thresholdError, toValue, type CaseFacts } from '../lib/kpi-calc.js';
import { createKpiBody, withinDaysError } from '../lib/kpis.js';
import { linearFit, poissonLowerTail, poissonUpperTail } from '../lib/stats.js';

// Wednesday 5 Nov 2026, 10:00 Singapore time.
const NOW = Date.parse('2026-11-05T02:00:00Z');
const at = (daysAgo: number) => NOW - daysAgo * DAY_MS;
const kase = (receivedDaysAgo: number, ackAfter: number | null, closeAfter: number | null, extra: Partial<CaseFacts> = {}): CaseFacts => ({
  townCouncilId: 'tc', block: '101', category: 'Lift', receivedAt: at(receivedDaysAgo),
  acknowledgedAt: ackAfter === null ? null : at(receivedDaysAgo) + ackAfter * DAY_MS,
  closedAt: closeAfter === null ? null : at(receivedDaysAgo) + closeAfter * DAY_MS, ...extra
});

test('weeks start on Monday midnight Singapore time and the last one is partial', () => {
  const weeks = buildPeriods('week', 3, NOW);
  assert.deepEqual(weeks.map(w => w.label), ['2026-10-19', '2026-10-26', '2026-11-02']);
  assert.equal(new Date(weeks[2].start).toISOString(), '2026-11-01T16:00:00.000Z'); // Mon 2 Nov 00:00 SGT
  assert.deepEqual(weeks.map(w => w.partial), [false, false, true]);
  assert.equal(weeks[0].end, weeks[1].start);
});

test('months follow the calendar in Singapore time', () => {
  const months = buildPeriods('month', 13, NOW);
  assert.equal(months[0].label, '2025-11');
  assert.equal(months.at(-1)!.label, '2026-11');
  assert.equal(new Date(months.at(-1)!.start).toISOString(), '2026-10-31T16:00:00.000Z');
  // A period that starts just after midnight SGT on the 1st is still that month.
  assert.equal(buildPeriods('month', 1, Date.parse('2026-10-31T16:30:00Z'))[0].label, '2026-11');
});

test('on-time rates leave out cases that are still inside the day limit', () => {
  const spec = { metric: 'ack_within' as const, withinDays: 3, category: null };
  const cases = [kase(10, 1, null), kase(10, 4, null), kase(9, null, null), kase(1, null, null), kase(2, 0.5, null)];
  const r = aggregate(spec, cases, at(30), NOW, NOW);
  assert.deepEqual(r, { num: 1, den: 3, pending: 2, sample: 3 });
});

test('closure rate, averages and repeat rate', () => {
  const cases = [kase(20, 1, 3), kase(20, 2, 10), kase(15, 1, null), kase(14, 1, 6)];
  assert.equal(aggregate({ metric: 'closed_within', withinDays: 7, category: null }, cases, at(30), NOW, NOW).num, 2);
  // Average resolution uses the cases closed in the window: 3, 10 and 6 days.
  const avg = aggregate({ metric: 'avg_close_days', withinDays: null, category: null }, cases, at(30), NOW, NOW);
  assert.equal(avg.den, 3);
  assert.ok(Math.abs(avg.num / avg.den - 19 / 3) < 1e-9);

  const repeats = [kase(30, 1, 2), kase(20, 1, 2), kase(3, 1, 2), kase(2, 1, 2, { block: '102' })];
  markRepeats(repeats, 14);
  assert.deepEqual(repeats.map(c => c.repeat), [false, true, false, false]);
});

test('overdue count is a snapshot at the end of the period', () => {
  const spec = { metric: 'overdue_open' as const, withinDays: 7, category: null };
  const cases = [kase(20, 1, null), kase(20, 1, 15), kase(5, 1, null), kase(30, 1, 2)];
  assert.equal(aggregate(spec, cases, 0, NOW, NOW).num, 1); // only the 20-day-old open case
  assert.equal(aggregate(spec, cases, 0, at(6), NOW).num, 2); // 6 days ago the second 20-day case was not yet closed
  assert.equal(aggregate(spec, cases, 0, at(14), NOW).num, 0); // 14 days ago the 20-day cases were only 6 days old
});

test('category filter and minimum sample size', () => {
  const spec = { metric: 'closed_within' as const, withinDays: 7, category: 'Pests' };
  const cases = Array.from({ length: 12 }, (_, i) => kase(20 + i, 1, 2, { category: i < 9 ? 'Pests' : 'Lift' }));
  const agg = aggregate(spec, cases, at(60), NOW, NOW);
  assert.equal(agg.den, 9);
  assert.equal(toValue(spec, agg), null); // fewer than 10 cases
  assert.equal(toValue({ ...spec, category: null }, aggregate({ ...spec, category: null }, cases, at(60), NOW, NOW)), 100);
});

test('kpiSeries gives one value per period', () => {
  const cases = Array.from({ length: 60 }, (_, i) => kase(i * 0.5 + 8, 1, i % 4 === 0 ? 9 : 2));
  const series = kpiSeries({ metric: 'closed_within', withinDays: 7, category: null }, cases, buildPeriods('week', 6, NOW), NOW);
  assert.equal(series.length, 6);
  assert.ok(series.some(p => p.value !== null && p.value > 60 && p.value < 90));
  assert.equal(series.at(-1)!.value, null); // the current week has no judgeable cases yet
});

test('status depends on the direction of the KPI', () => {
  const higher = { target: 75, warning: 80 };
  assert.equal(kpiStatus(85, 'higher', higher), 'On track');
  assert.equal(kpiStatus(78, 'higher', higher), 'At risk');
  assert.equal(kpiStatus(74.9, 'higher', higher), 'Breached');
  assert.equal(kpiStatus(75, 'higher', higher), 'At risk');
  const lower = { target: 15, warning: 10 };
  assert.equal(kpiStatus(8, 'lower', lower), 'On track');
  assert.equal(kpiStatus(12, 'lower', lower), 'At risk');
  assert.equal(kpiStatus(16, 'lower', lower), 'Breached');
  assert.equal(kpiStatus(null, 'lower', lower), 'No data');
});

test('threshold and day-limit validation', () => {
  assert.equal(thresholdError('higher', '%', { target: 75, warning: 80 }), null);
  assert.match(thresholdError('higher', '%', { target: 80, warning: 75 })!, /at or above/);
  assert.match(thresholdError('lower', 'cases', { target: 10, warning: 15 })!, /at or below/);
  assert.match(thresholdError('higher', '%', { target: 120, warning: 130 })!, /between 0 and 100/);
  assert.match(withinDaysError('ack_within', null)!, /needs a number of days/);
  assert.match(withinDaysError('avg_ack_days', 3)!, /does not use a day limit/);
  assert.equal(createKpiBody.safeParse({ name: 'Lift cases closed in 2 days', metric: 'closed_within', withinDays: 2, category: 'Lift', target: 70, warning: 80 }).success, true);
  assert.equal(createKpiBody.safeParse({ name: 'X', metric: 'closed_within', target: 70, warning: 80 }).success, false);
});

test('statistics helpers', () => {
  const fit = linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }])!;
  assert.ok(Math.abs(fit.slope - 2) < 1e-12 && Math.abs(fit.intercept - 1) < 1e-12 && fit.r2 === 1);
  assert.equal(linearFit([{ x: 1, y: 1 }]), null);
  assert.ok(Math.abs(poissonUpperTail(1, 2) - (1 - Math.exp(-2))) < 1e-12);
  assert.ok(Math.abs(poissonLowerTail(0, 2) - Math.exp(-2)) < 1e-12);
  assert.equal(poissonUpperTail(0, 3), 1);
});
