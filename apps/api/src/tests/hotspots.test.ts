import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineFor, chanceAtUsualRate, hotspotQuery, isSpike } from '../lib/hotspots.js';

test('baseline scales the previous 180 days to the window length', () => {
  assert.equal(baselineFor(12, 30), 2);
  assert.equal(baselineFor(0, 90), 0);
});

test('chance at the usual rate is the Poisson upper tail', () => {
  assert.equal(chanceAtUsualRate(0, 2, 30), 1);
  assert.ok(Math.abs(chanceAtUsualRate(1, 2, 30) - (1 - Math.exp(-2))) < 1e-12);
  assert.ok(Math.abs(chanceAtUsualRate(5, 1.2, 30) - 0.00775) < 1e-4);
});

test('a burst well above the usual level is a spike; a busy category having a normal month is not', () => {
  assert.equal(isSpike(5, 1.2, 30), true); // seeded Lift hotspot
  assert.equal(isSpike(4, 0.3, 30), true);
  assert.equal(isSpike(4, 1.5, 30), false); // Cleanliness at its usual level
  assert.equal(isSpike(7, 3, 90), false);
  assert.equal(isSpike(11, 2, 90), true);
});

test('a block with no earlier cases is judged against roughly one case a year', () => {
  assert.equal(isSpike(4, 0, 30), true);
  assert.equal(isSpike(4, 0, 90), true);
});

test('window defaults to 30 days and is limited to 7–90', () => {
  assert.equal(hotspotQuery.parse({}).days, 30);
  assert.equal(hotspotQuery.safeParse({ days: '365' }).success, false);
  assert.equal(hotspotQuery.safeParse({ days: '3' }).success, false);
});
