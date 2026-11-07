import express, { Router } from 'express';
import { and, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cases, townCouncils } from '../db/schema.js';
import {
  buildSampleFile, buildTemplate, checkRow, flagDuplicates, readCaseFile, importCommitBody, ImportFileError,
  DUPLICATE_WINDOW_DAYS, MAX_IMPORT_ROWS
} from '../lib/case-import.js';
import { resolveCaseDates } from '../lib/cases.js';

// Two-step import: POST /preview checks an uploaded file without saving anything,
// then POST / inserts the rows the user confirmed. Mounted before the app-wide 1 MB JSON parser.
export const caseImportRouter = Router();

const DAY_MS = 86_400_000;
const INSERT_CHUNK = 500;

caseImportRouter.get('/template', async (_req, res) => {
  const councils = await db.select({ name: townCouncils.name }).from(townCouncils).orderBy(townCouncils.name);
  res.attachment('feedback-case-import-template.xlsx')
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(await buildTemplate(councils));
});

// Fictional cases for demos and for trying out the import.
caseImportRouter.get('/sample', async (_req, res) => {
  const councils = await db.select({ name: townCouncils.name }).from(townCouncils).orderBy(townCouncils.name);
  res.attachment('feedback-case-sample-data.xlsx')
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(await buildSampleFile(councils));
});

// The file is sent as the raw request body (xlsx or csv, detected from its contents).
caseImportRouter.post('/preview', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ message: 'Upload an .xlsx or .csv file.' });
  let raw;
  try {
    raw = await readCaseFile(req.body);
  } catch (error) {
    if (error instanceof ImportFileError) return void res.status(400).json({ message: error.message });
    throw error;
  }

  const councils = await db.select({ id: townCouncils.id, name: townCouncils.name }).from(townCouncils);
  const checked = raw.map(row => checkRow(row, councils));
  const valid = checked.flatMap(r => r.value ? [r.value] : []);
  let existing: { caseRef: string; townCouncilId: string; block: string; category: string; receivedAt: Date }[] = [];
  if (valid.length) {
    const times = valid.map(v => v.receivedAt.getTime());
    existing = await db.select({
      caseRef: cases.caseRef, townCouncilId: cases.townCouncilId, block: cases.block, category: cases.category, receivedAt: cases.receivedAt
    }).from(cases).where(and(
      inArray(cases.townCouncilId, [...new Set(valid.map(v => v.townCouncilId))]),
      inArray(cases.block, [...new Set(valid.map(v => v.block))]),
      gte(cases.receivedAt, new Date(Math.min(...times) - DUPLICATE_WINDOW_DAYS * DAY_MS)),
      lte(cases.receivedAt, new Date(Math.max(...times) + DUPLICATE_WINDOW_DAYS * DAY_MS))
    ));
  }
  const rows = flagDuplicates(checked, existing);
  const count = (result: string) => rows.filter(r => r.result === result).length;
  res.json({ rows, counts: { total: rows.length, ready: count('ready'), duplicate: count('duplicate'), error: count('error') }, maxRows: MAX_IMPORT_ROWS });
});

// Inserts the confirmed rows in one transaction: either every row is saved or none are.
caseImportRouter.post('/', express.json({ limit: '10mb' }), async (req, res) => {
  const { rows } = importCommitBody.parse(req.body);
  const resolved = rows.map(row => resolveCaseDates(row));
  const failed = resolved.findIndex(r => 'error' in r);
  if (failed !== -1) return void res.status(400).json({ message: `Row ${failed + 1}: ${(resolved[failed] as { error: string }).error}` });
  const values = resolved.flatMap(r => 'value' in r ? [r.value] : []);

  const refs = await db.transaction(async tx => {
    // Same numbering as single-case creation; the unique constraint turns a clash into a 409 and rolls everything back.
    const [{ last }] = await tx.select({
      last: sql<number>`coalesce(max(substring(${cases.caseRef} from 4)::int), 0)::int`
    }).from(cases);
    const withRefs = values.map((v, i) => ({ ...v, caseRef: 'FB-' + String(last + i + 1).padStart(6, '0') }));
    for (let i = 0; i < withRefs.length; i += INSERT_CHUNK) await tx.insert(cases).values(withRefs.slice(i, i + INSERT_CHUNK));
    return withRefs.map(v => v.caseRef);
  });
  res.status(201).json({ imported: refs.length, firstRef: refs[0], lastRef: refs.at(-1) });
});
