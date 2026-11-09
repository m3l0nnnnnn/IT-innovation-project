import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, type CaseFacts } from '../lib/kpi-calc.js';
import { categoryContributions, outstandingByBlock, volumeChanges } from '../lib/kpi-factors.js';

const NOW = Date.parse('2026-11-05T02:00:00Z');
const CATS = ['Cleanliness', 'Lift', 'Pests'] as const;
function make(daysAgo: number, category: string, ackAfter: number, block = '101', open = false): CaseFacts {
  const receivedAt = NOW - daysAgo * DAY_MS;
  return { townCouncilId: 'tc', block, category, receivedAt, acknowledgedAt: receivedAt + ackAfter * DAY_MS, closedAt: open ? null : receivedAt + (ackAfter + 1) * DAY_MS };
}

test('category contributions add up to the overall change and find the category that got worse', () => {
  const cases: CaseFacts[] = [];
  for (let d = 4; d < 112; d += 0.5) {
    const recent = d < 28;
    cases.push(make(d, 'Cleanliness', 1));
    cases.push(make(d + 0.1, 'Pests', 1));
    cases.push(make(d + 0.2, 'Lift', recent ? 5 : 1)); // lift acknowledgements became late in the last 4 weeks
  }
  const r = categoryContributions({ metric: 'ack_within', withinDays: 3, category: null }, cases, CATS, NOW);
  assert.ok(r.change! < -25);
  const total = r.categories.reduce((s, c) => s + c.contribution, 0);
  assert.ok(Math.abs(total - r.change!) < 0.05, `${total} vs ${r.change}`);
  assert.equal(r.categories[0].category, 'Lift');
  assert.equal(r.categories[0].effect, 'worse');
  assert.equal(r.categories[0].recentValue, 0);
  assert.equal(r.categories.find(c => c.category === 'Pests')!.effect, 'neutral');
});

test('overdue contributions compare the open count now with the usual count', () => {
  const cases: CaseFacts[] = [];
  for (let d = 8; d < 25; d++) cases.push(make(d, 'Pests', 1, '101', true)); // 17 overdue pests cases built up recently
  const r = categoryContributions({ metric: 'overdue_open', withinDays: 7, category: null }, cases, CATS, NOW);
  assert.equal(r.recentValue, 17);
  assert.equal(r.categories[0].category, 'Pests');
  assert.equal(r.categories[0].effect, 'worse');
});

test('a block with far more open cases than its usual share is unusual; a busy block at its usual share is not', () => {
  const cases: CaseFacts[] = [];
  for (let d = 20; d < 360; d += 1) for (const block of ['101', '102', '103', '104', '105']) cases.push(make(d, 'Lift', 1, block));
  for (let d = 20; d < 360; d += 1) cases.push(make(d + 0.5, 'Cleanliness', 1, '106'), make(d + 0.7, 'Cleanliness', 1, '106')); // big block
  for (let i = 0; i < 8; i++) cases.push(make(3 + i, 'Pests', 1, '103', true));
  for (const block of ['101', '102', '104', '105']) cases.push(make(2, 'Lift', 1, block, true));
  cases.push(make(2, 'Cleanliness', 1, '106', true), make(3, 'Cleanliness', 1, '106', true));
  const rows = outstandingByBlock(cases, NOW);
  assert.equal(rows[0].block, '103');
  assert.equal(rows[0].unusual, true);
  assert.equal(rows[0].open, 8);
  assert.equal(rows[0].topCategory, 'Pests');
  assert.equal(rows[0].overdue, 3); // received 8–10 days ago; exactly 7 days is not yet overdue
  assert.equal(rows.filter(r => r.unusual).length, 1);
});

test('volume changes flag a surge and mark it seasonal when last year looked the same', () => {
  const cases: CaseFacts[] = [];
  for (let d = 0; d < 420; d += 1) cases.push(make(d + 0.3, 'Cleanliness', 1));
  for (let d = 0; d < 420; d += 7) cases.push(make(d + 0.6, 'Pests', 1));
  for (let d = 0; d < 28; d += 1.4) cases.push(make(d + 0.1, 'Pests', 1)); // pests surge now
  for (let d = 365; d < 393; d += 1.4) cases.push(make(d + 0.1, 'Pests', 1)); // ...and at the same time last year
  const rows = volumeChanges(cases, CATS, NOW, NOW - 420 * DAY_MS);
  const pests = rows.find(r => r.category === 'Pests')!;
  assert.equal(pests.change, 'increase');
  assert.equal(pests.seasonal, true);
  assert.equal(rows.find(r => r.category === 'Cleanliness')!.change, 'normal');
  assert.equal(rows[0].category, 'All categories');
  // Without a year of history there is no seasonal comparison.
  assert.equal(volumeChanges(cases, CATS, NOW, NOW - 200 * DAY_MS).find(r => r.category === 'Pests')!.lastYear, null);
});
