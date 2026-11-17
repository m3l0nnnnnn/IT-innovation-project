import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedCases, loadSampleCases, sampleBlock, SEED_COUNCILS, type NewCase } from '../db/seed-data.js';
import { DEFAULT_KPIS } from '../lib/kpis.js';
import { evaluate } from '../lib/kpi-engine.js';
import type { CaseFacts } from '../lib/kpi-calc.js';

const NOW = new Date('2026-11-17T12:00:00+08:00');
const councils = SEED_COUNCILS.map((c, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, name: c.name }));
const idOf = new Map(councils.map(c => [c.name, c.id]));
const sample = await loadSampleCases(councils, NOW);
const rows = buildSeedCases(idOf, NOW, sample.cases);

const facts = (name: string): CaseFacts[] => rows.filter(r => r.townCouncilId === idOf.get(name)).map((r: NewCase) => ({
  townCouncilId: r.townCouncilId, block: r.block, category: r.category, receivedAt: r.receivedAt.getTime(),
  acknowledgedAt: r.acknowledgedAt?.getTime() ?? null, closedAt: r.closedAt?.getTime() ?? null
}));
function kpi(metric: string, council: string) {
  const k = DEFAULT_KPIS.find(d => d.metric === metric)!;
  return evaluate({ ...k, id: metric, category: null }, k, facts(council), 'week', NOW.getTime()).analysis;
}

test('the sample file\'s valid cases are loaded and its deliberate errors skipped', () => {
  assert.equal(sample.cases.length, 21);
  assert.deepEqual(sample.skipped.map(s => s.rowNumber), [23, 24, 25, 26]);
  const repeat = sample.cases.find(c => c.description?.startsWith('Sample repeat'))!;
  const original = sample.cases.find(c => c.id === repeat.duplicateOfId)!;
  assert.equal(original.block, '407A');
  assert.equal(original.category, 'Lift');
  // A closure after NOW has not happened yet: the 16 Nov case closed on 17 Nov 21:21 is still open at noon.
  const late = sample.cases.find(c => c.block === '400')!;
  assert.equal(late.closedAt, null);
  assert.equal(late.status, 'Open');
});

test('generated cases follow the sample\'s shape and include every sample case', () => {
  for (const c of sample.cases) assert.ok(rows.includes(c));
  assert.ok(rows.length > 7000);
  const central = rows.filter(r => r.townCouncilId === idOf.get('Central District (demo)'));
  assert.ok(central.every(r => r.street === 'Sample Avenue 1'));
  assert.ok(central.some(r => r.block === sampleBlock(0)) && sampleBlock(1) === '407A');
  assert.ok(rows.every(r => [null, 'Officer A', 'Officer B', 'Officer C'].includes(r.assignedOfficer ?? null)));
  assert.equal(new Set(rows.map(r => r.caseRef)).size, rows.length);
  // Same seed, same data.
  const again = buildSeedCases(idOf, NOW, sample.cases);
  assert.deepEqual(again.map(r => [r.block, r.category, r.receivedAt.getTime()]), rows.map(r => [r.block, r.category, r.receivedAt.getTime()]));
});

test('the KPIs tell the planted story', () => {
  assert.equal(kpi('closed_within', 'North District (demo)').trend.label, 'declining');
  assert.equal(kpi('closed_within', 'North District (demo)').status, 'Breached');
  assert.equal(kpi('ack_within', 'West District (demo)').trend.label, 'declining');
  assert.equal(kpi('ack_within', 'West District (demo)').status, 'Breached');
  assert.equal(kpi('ack_within', 'North District (demo)').status, 'On track');
  assert.equal(kpi('overdue_open', 'East District (demo)').trend.label, 'improving');
  for (const council of ['Central District (demo)', 'South District (demo)']) {
    for (const metric of ['closed_within', 'avg_ack_days', 'avg_close_days']) assert.equal(kpi(metric, council).status, 'On track', `${council} ${metric}`);
  }
});
