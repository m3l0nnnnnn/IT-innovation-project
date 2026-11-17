// Builds the seed feedback cases without touching the database: seed.ts writes them, and the tests check the KPI
// story they tell. All cases are FICTIONAL.
//
// The cases follow the sample import file (data/feedback-case-sample-data.xlsx): the same Town Councils, block
// numbering (400, 407A, 414 …), "Sample Avenue" streets, case types, officers, channels and response times.
// The sample's 20 valid cases are included as they are; its 5 deliberately broken rows are skipped.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { cases } from './schema.js';
import { caseCategories, caseChannels } from './schema.js';
import { checkRow, flagDuplicates, parseImportDate, readCaseFile, DUPLICATE_WINDOW_DAYS, SAMPLE_CASE_TYPES } from '../lib/case-import.js';

export type NewCase = typeof cases.$inferInsert;
type Category = (typeof caseCategories)[number];
type Trend = 'stable' | 'declining' | 'improving';

export const SAMPLE_FILE = fileURLToPath(new URL('../../data/feedback-case-sample-data.xlsx', import.meta.url));
export const SEED = 12;
export const DAYS = 395;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Same order as the sample file, which numbers blocks and streets by council: Central has Sample Avenue 1 and
// blocks 400, 435A …; East has Sample Avenue 2 and blocks 407A, 442 …; and so on.
// ack / close shape each council's KPI story. The sample's fortnight already shows it: North leaves cases open past
// 7 days, and West's cases go unacknowledged.
export const SEED_COUNCILS: { name: string; dailyCases: number; ack: Trend; close: Trend }[] = [
  { name: 'Central District (demo)', dailyCases: 5, ack: 'stable', close: 'stable' },
  { name: 'East District (demo)', dailyCases: 5, ack: 'improving', close: 'improving' },
  { name: 'North District (demo)', dailyCases: 6, ack: 'stable', close: 'declining' },
  { name: 'South District (demo)', dailyCases: 4, ack: 'stable', close: 'stable' },
  { name: 'West District (demo)', dailyCases: 4, ack: 'declining', close: 'stable' }
];
const BLOCKS_PER_COUNCIL = 40;
// The sample assigns Officers A–C and leaves one case in four unassigned.
const OFFICERS = ['Officer A', 'Officer B', 'Officer C', null];

/** The sample's block numbering: block k is 400 + 7k, with an "A" on every fourth, dealt out to councils in turn. */
export function sampleBlock(k: number) {
  return String(400 + 7 * k) + (k % 4 === 1 ? 'A' : '');
}
const councilBlocks = (index: number) =>
  Array.from({ length: BLOCKS_PER_COUNCIL }, (_, j) => sampleBlock(index + SEED_COUNCILS.length * j));

/** Deterministic PRNG (mulberry32) so every teammate gets the same data. */
function prng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How much slower than normal a council works on a given day (1 = normal). */
function slowdown(trend: Trend, dayIndex: number) {
  if (trend === 'declining') return 1 + 1.2 * Math.max(0, (dayIndex - (DAYS - 120)) / 120);
  if (trend === 'improving') return dayIndex < DAYS - 90 ? 1.7 : 0.9;
  return 1;
}

/**
 * Builds about 13 months of cases ending at `now`, plus the sample file's valid cases.
 * councilIds maps each SEED_COUNCILS name to its database id.
 */
export function buildSeedCases(councilIds: Map<string, string>, now: Date, sampleCases: NewCase[] = []): NewCase[] {
  const rand = prng(SEED);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];

  // The sample spreads cases evenly over categories and channels. Monsoon months (Nov–Jan) bring more water seepage.
  const categoryFor = (date: Date): Category => {
    const seepage = [10, 11, 0].includes(date.getMonth()) ? 2.5 : 1;
    let r = rand() * (caseCategories.length - 1 + seepage);
    for (const c of caseCategories) if ((r -= c === 'Water Seepage' ? seepage : 1) <= 0) return c;
    return 'Others';
  };
  // Sample timings: acknowledged 2–21 hours after receipt, closed 1–3 days after receipt. Slower councils (factor > 1)
  // take longer and have more cases in the slow tail, which misses the 3-day and 7-day limits.
  const ackDays = (f: number) => (rand() < 0.85 / f ? int(2, 21) * HOUR_MS / DAY_MS : 1 + rand() * 5) * f;
  const closeDays = (f: number) => (rand() < 0.75 / f ? 1 + rand() * 2 : 4 + rand() * 12) * f;

  const make = (councilIndex: number, block: string, category: Category, received: Date, day: number): NewCase => {
    const council = SEED_COUNCILS[councilIndex];
    const [, location, description] = SAMPLE_CASE_TYPES.find(t => t[0] === category)!;
    const ack = new Date(received.getTime() + ackDays(slowdown(council.ack, day)) * DAY_MS);
    const close = new Date(Math.max(received.getTime() + closeDays(slowdown(council.close, day)) * DAY_MS, ack.getTime() + HOUR_MS));
    const closed = close <= now;
    return {
      id: randomUUID(),
      caseRef: '', // assigned in date order once all cases exist
      townCouncilId: councilIds.get(council.name)!,
      block,
      street: `Sample Avenue ${councilIndex + 1}`,
      postalCode: null, // fictional blocks have no real postal code; add real ones before using OneMap
      location, category,
      channel: pick(caseChannels),
      description,
      status: closed ? 'Closed' : 'Open',
      assignedOfficer: pick(OFFICERS),
      receivedAt: received,
      acknowledgedAt: ack <= now ? ack : null,
      closedAt: closed ? close : null
    };
  };

  const start = new Date(now.getTime() - DAYS * DAY_MS);
  start.setHours(0, 0, 0, 0);
  const rows: NewCase[] = [];
  SEED_COUNCILS.forEach((council, ci) => {
    const blocks = councilBlocks(ci);
    for (let day = 0; day < DAYS; day++) {
      const date = new Date(start.getTime() + day * DAY_MS);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const count = Math.round(council.dailyCases * (weekend ? 0.6 : 1) * (0.6 + rand() * 0.8));
      for (let n = 0; n < count; n++) {
        const received = new Date(date.getTime() + int(7, 21) * HOUR_MS + int(0, 59) * 60_000);
        if (received > now) continue;
        rows.push(make(ci, pick(blocks), categoryFor(date), received, day));
      }
    }
    // Two repeat-case hotspots per council in the last 45 days (≥ 4 cases at one block = hotspot).
    for (const category of ['Lift', 'Pests'] as const) {
      const block = pick(blocks);
      for (let n = 0, total = int(5, 8); n < total; n++) {
        rows.push(make(ci, block, category, new Date(now.getTime() - int(1, 45) * DAY_MS - int(0, 12) * HOUR_MS), DAYS - 1));
      }
    }
  });

  const sampleIds = new Set(sampleCases.map(c => c.id));
  rows.push(...sampleCases);
  rows.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  // ~3% of cases are duplicates: same block and category within 3 days of an earlier case.
  // The sample's own cases keep the duplicate links they came with.
  const recent = new Map<string, NewCase>();
  for (const row of rows) {
    const key = `${row.townCouncilId}|${row.block}|${row.category}`;
    const earlier = recent.get(key);
    if (!sampleIds.has(row.id!) && earlier && row.receivedAt.getTime() - earlier.receivedAt.getTime() < 3 * DAY_MS && rand() < 0.5) row.duplicateOfId = earlier.id;
    else if (!row.duplicateOfId) recent.set(key, row);
  }
  rows.forEach((row, i) => (row.caseRef = 'FB-' + String(i + 1).padStart(6, '0')));
  return rows;
}

/**
 * The sample file's cases, checked with the same rules as an import. Rows that fail (the sample's deliberate errors)
 * are returned as `skipped`; a row flagged as a possible duplicate is linked to the earlier case it repeats.
 */
export async function loadSampleCases(councils: { id: string; name: string }[], now: Date, file = SAMPLE_FILE) {
  const raw = await readCaseFile(await readFile(file));
  // An acknowledgement or closure later than now has not happened yet, so it is left out, as it would be live.
  for (const row of raw) {
    for (const key of ['acknowledgedAt', 'closedAt'] as const) {
      const at = parseImportDate(row.cells[key] ?? null);
      if (at instanceof Date && at > now) row.cells[key] = null;
    }
  }
  const checked = flagDuplicates(raw.map(r => checkRow(r, councils, now)), []);
  const loaded: NewCase[] = [];
  for (const row of checked) {
    if (!row.value) continue;
    const v = row.value;
    const earlier = row.result === 'duplicate'
      ? loaded.find(c => c.townCouncilId === v.townCouncilId && c.block === v.block && c.category === v.category &&
          Math.abs(v.receivedAt.getTime() - c.receivedAt.getTime()) <= DUPLICATE_WINDOW_DAYS * DAY_MS)
      : undefined;
    loaded.push({ id: randomUUID(), caseRef: '', ...v, duplicateOfId: earlier?.id ?? null });
  }
  return {
    cases: loaded,
    skipped: checked.filter(r => !r.value).map(r => ({ rowNumber: r.rowNumber, messages: r.messages }))
  };
}
