import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRisk } from '../lib/risk.js';

test('risk thresholds are deterministic', () => {
  assert.equal(classifyRisk(89, 90, 2), 'Critical');
  assert.equal(classifyRisk(91, 90, 2), 'Warning');
  assert.equal(classifyRisk(93, 90, 2), 'Watch');
  assert.equal(classifyRisk(96, 90, 2), 'Healthy');
});
test('invalid inputs are rejected', () => {
  assert.throws(() => classifyRisk(NaN, 90, 2));
});
