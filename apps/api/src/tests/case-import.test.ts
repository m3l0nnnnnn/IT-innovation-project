import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildSampleFile, buildTemplate, checkRow, flagDuplicates, importCommitBody, parseImportDate, readCaseFile, ImportFileError, type RawRow } from '../lib/case-import.js';

const now = new Date('2026-11-08T12:00:00Z');
const councils = [
  { id: '0b3f6c1e-1d2a-4c5b-9e8f-7a6b5c4d3e2f', name: 'North District (demo)' },
  { id: '1c4a7d2f-2e3b-4d6c-8f9a-8b7c6d5e4f3a', name: 'East District (demo)' }
];
const row = (cells: RawRow['cells'], rowNumber = 2): RawRow => ({
  rowNumber,
  cells: { council: 'North District', block: '210a', category: 'Lift', channel: 'OneService', receivedAt: '30/10/2026 09:15', ...cells }
});

test('dates are read as Singapore time in the supported formats', () => {
  const expected = '2026-10-30T01:15:00.000Z'; // 09:15 in Singapore
  assert.equal((parseImportDate('30/10/2026 09:15') as Date).toISOString(), expected);
  assert.equal((parseImportDate('30/10/2026 9:15 am') as Date).toISOString(), expected);
  assert.equal((parseImportDate('2026-10-30 09:15') as Date).toISOString(), expected);
  assert.equal((parseImportDate('2026-10-30T01:15:00Z') as Date).toISOString(), expected);
  assert.equal((parseImportDate(new Date('2026-10-30T09:15:00Z')) as Date).toISOString(), expected); // Excel date cell
  assert.equal((parseImportDate(46325.38541666667) as Date).toISOString(), expected); // Excel serial number
  assert.equal(parseImportDate(null), null);
  assert.equal(parseImportDate('31/02/2026'), 'invalid');
  assert.equal(parseImportDate('next Tuesday'), 'invalid');
  assert.equal(parseImportDate(5), 'invalid');
});

test('a valid row becomes a case, matching the council by name and fixing letter case', () => {
  const result = checkRow(row({ category: 'lift', channel: 'oneservice', postalCode: 12345 }), councils, now);
  assert.equal(result.result, 'ready', result.messages.join(' '));
  assert.equal(result.value?.townCouncilId, councils[0].id);
  assert.equal(result.value?.block, '210A');
  assert.equal(result.value?.category, 'Lift');
  assert.equal(result.value?.postalCode, '012345');
  assert.equal(result.value?.status, 'Open');
});

test('a closed date makes the case Closed', () => {
  const result = checkRow(row({ closedAt: '31/10/2026 10:00' }), councils, now);
  assert.equal(result.value?.status, 'Closed');
});

test('invalid rows explain every problem using the column headings', () => {
  const result = checkRow(row({ council: 'Nowhere TC', category: 'Graffiti', receivedAt: 'yesterday', block: null }), councils, now);
  assert.equal(result.result, 'error');
  assert.ok(result.messages.includes('Block is required.'));
  assert.ok(result.messages.some(m => m.includes('Unknown Town Council "Nowhere TC"')));
  assert.ok(result.messages.some(m => m.startsWith('Category must be one of')));
  assert.ok(result.messages.some(m => m.startsWith('Received At "yesterday" is not a date')));

  const badBlock = checkRow(row({ block: 'Blk 210' }), councils, now);
  assert.ok(badBlock.messages.some(m => m.startsWith('Block:')), badBlock.messages.join(' '));
  const future = checkRow(row({ receivedAt: '30/12/2026 09:00' }), councils, now);
  assert.deepEqual(future.messages, ['Received At cannot be in the future']);
});

test('rows repeating an existing case or an earlier row are flagged, others are not', () => {
  const rows = [
    checkRow(row({}, 2), councils, now),
    checkRow(row({ receivedAt: '01/11/2026 09:00' }, 3), councils, now), // same block and category 2 days after row 2
    checkRow(row({ block: '300', receivedAt: '01/11/2026 09:00' }, 4), councils, now),
    checkRow(row({ block: '300', category: 'Pests' }, 5), councils, now) // different category
  ];
  const existing = [{ caseRef: 'FB-000123', townCouncilId: councils[0].id, block: '210A', category: 'Lift', receivedAt: new Date('2026-10-26T00:00:00Z') }];
  const flagged = flagDuplicates(rows, existing);
  assert.deepEqual(flagged.map(r => r.result), ['duplicate', 'duplicate', 'ready', 'ready']);
  assert.match(flagged[0].messages[0], /FB-000123.*4 days apart/);
  assert.match(flagged[1].messages[0], /row 2.*2 days apart/);
});

test('the template reads back with no rows, and a filled-in copy imports', async () => {
  const template = await buildTemplate(councils);
  await assert.rejects(readCaseFile(template), ImportFileError);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Cases')!;
  sheet.addRow(['North District (demo)', '210A', null, '012345', null, 'Pests', 'Email', 'Rats at bin centre', null, null, new Date('2026-10-30T09:15:00Z')]);
  const rows = await readCaseFile(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(rows.length, 1);
  const result = checkRow(rows[0], councils, now);
  assert.equal(result.result, 'ready', result.messages.join(' '));
  assert.equal(result.value?.receivedAt.toISOString(), '2026-10-30T01:15:00.000Z');
});

test('CSV files keep text as typed, and missing columns are reported', async () => {
  const csv = '﻿Town Council,Blk,Category,Channel,Received At,Postal Code\nEast District,12,Lighting,Call,30/10/2026 18:00,012345\n';
  const rows = await readCaseFile(Buffer.from(csv));
  const result = checkRow(rows[0], councils, now);
  assert.equal(result.result, 'ready', result.messages.join(' '));
  assert.equal(result.value?.postalCode, '012345');
  assert.equal(result.value?.townCouncilId, councils[1].id);

  await assert.rejects(readCaseFile(Buffer.from('Block,Category\n12,Lift\n')), /Missing column\(s\): Town Council, Channel, Received At/);
});

test('the confirm step rejects unknown fields and duplicate links', () => {
  const valid = { townCouncilId: councils[0].id, block: '210A', category: 'Lift', channel: 'Call', receivedAt: '2026-10-30T01:15:00Z' };
  assert.equal(importCommitBody.safeParse({ rows: [valid] }).success, true);
  assert.equal(importCommitBody.safeParse({ rows: [{ ...valid, duplicateOfId: councils[1].id }] }).success, false);
  assert.equal(importCommitBody.safeParse({ rows: [] }).success, false);
});

test('the sample file has ready rows, one in-file repeat and one row for each kind of error', async () => {
  const rows = (await readCaseFile(await buildSampleFile(councils))).map(r => checkRow(r, councils));
  const flagged = flagDuplicates(rows, []);
  const count = (result: string) => flagged.filter(r => r.result === result).length;
  assert.deepEqual([count('ready'), count('duplicate'), count('error')], [20, 1, 4]);
  assert.match(flagged[20].messages[0], /row 3.*1 day apart/);
});
