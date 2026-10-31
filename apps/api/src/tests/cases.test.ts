import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCaseBody, updateCaseBody, caseListQuery, resolveCaseDates } from '../lib/cases.js';

const now = new Date('2026-11-01T12:00:00Z');
const received = new Date('2026-10-30T09:00:00Z');
const valid = {
  townCouncilId: '0b3f6c1e-1d2a-4c5b-9e8f-7a6b5c4d3e2f', block: '210a', category: 'Lift', channel: 'OneService',
  receivedAt: '2026-10-30T09:00:00Z'
};

test('valid case body is accepted and block is normalised', () => {
  const parsed = createCaseBody.parse(valid);
  assert.equal(parsed.block, '210A');
  assert.ok(parsed.receivedAt instanceof Date);
});
test('invalid block, category, postal code and unknown fields are rejected', () => {
  assert.equal(createCaseBody.safeParse({ ...valid, block: 'Blk 210' }).success, false);
  assert.equal(createCaseBody.safeParse({ ...valid, category: 'Graffiti' }).success, false);
  assert.equal(createCaseBody.safeParse({ ...valid, postalCode: '12345' }).success, false);
  assert.equal(createCaseBody.safeParse({ ...valid, caseRef: 'FB-000001' }).success, false);
});
test('empty optional text becomes null and partial updates are allowed', () => {
  assert.equal(createCaseBody.parse({ ...valid, street: '  ' }).street, null);
  assert.deepEqual(Object.keys(updateCaseBody.parse({ status: 'Closed' })), ['status']);
});
test('list query applies defaults and caps page size', () => {
  const q = caseListQuery.parse({ overdue: 'true' });
  assert.equal(q.overdue, true);
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 25);
  assert.equal(caseListQuery.safeParse({ pageSize: '500' }).success, false);
});

test('closing without a date stamps closedAt with now', () => {
  const r = resolveCaseDates({ receivedAt: received, status: 'Closed' as const }, now);
  assert.ok('value' in r);
  assert.equal(r.value.closedAt?.getTime(), now.getTime());
});
test('closedAt implies Closed and reopening clears closedAt', () => {
  const closed = resolveCaseDates({ receivedAt: received, closedAt: now }, now);
  assert.ok('value' in closed && closed.value.status === 'Closed');
  const reopened = resolveCaseDates({ receivedAt: received, closedAt: now, status: 'Open' as const }, now);
  assert.ok('value' in reopened && reopened.value.closedAt === null);
});
test('dates out of order or in the future are rejected', () => {
  assert.ok('error' in resolveCaseDates({ receivedAt: received, closedAt: new Date('2026-10-29T00:00:00Z') }, now));
  assert.ok('error' in resolveCaseDates({ receivedAt: received, acknowledgedAt: new Date('2026-10-29T00:00:00Z') }, now));
  assert.ok('error' in resolveCaseDates({ receivedAt: new Date('2026-11-05T00:00:00Z') }, now));
});
