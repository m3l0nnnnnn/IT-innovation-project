// Seeds Town Councils and ~13 months of FICTIONAL feedback cases: npm run db:seed
// Re-running replaces all feedback cases. The same SEED always produces the same cases (dates are relative to today).
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from './index.js';
import { townCouncils, cases, caseCategories, caseChannels } from './schema.js';

const SEED = 12;
const DAYS = 395;
const DAY_MS = 86_400_000;

// Deterministic PRNG (mulberry32) so every teammate gets the same data.
let state = SEED;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
function weighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let r = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, w] of entries) if ((r -= w) <= 0) return value;
  return entries[entries.length - 1][0];
}

type Category = (typeof caseCategories)[number];
type Channel = (typeof caseChannels)[number];

// trend shapes the planted KPI story: 'declining' gets slower over the last 4 months,
// 'improving' gets faster after a fix ~3 months ago, 'stable' stays roughly on target.
const COUNCILS = [
  { name: 'North District (demo)', prefix: 'North', blockBase: 200, dailyCases: 6, trend: 'declining' },
  { name: 'Central District (demo)', prefix: 'Central', blockBase: 80, dailyCases: 5, trend: 'stable' },
  { name: 'East District (demo)', prefix: 'East', blockBase: 300, dailyCases: 5, trend: 'improving' },
  { name: 'West District (demo)', prefix: 'West', blockBase: 500, dailyCases: 4, trend: 'stable' },
  { name: 'South District (demo)', prefix: 'South', blockBase: 700, dailyCases: 4, trend: 'stable' }
] as const;

const CATEGORY_WEIGHTS: Record<Category, number> = {
  Cleanliness: 30, 'Estate Maintenance': 20, Lift: 12, Lighting: 10, Pests: 10, 'Water Seepage': 8, Others: 10
};
const CHANNEL_WEIGHTS: Record<Channel, number> = { OneService: 45, Call: 25, Email: 25, 'Walk-in': 5 };
const SPOTS: Record<Category, string[]> = {
  Cleanliness: ['Void deck', 'Refuse chute L3', 'Corridor L7', 'Staircase L2', 'Bin centre'],
  'Estate Maintenance': ['Void deck', 'Playground', 'Corridor railing L5', 'Pavilion', 'Drain near carpark'],
  Lift: ['Lift A', 'Lift B', 'Lift lobby L1'],
  Lighting: ['Corridor L4', 'Staircase L9', 'Void deck', 'Carpark L2'],
  Pests: ['Bin centre', 'Void deck', 'Drain near block', 'Corridor L6'],
  'Water Seepage': ['Ceiling unit #08-12', 'Corridor L10', 'Roof', 'Ceiling unit #03-45'],
  Others: ['Void deck', 'Notice board', 'Carpark L1']
};
const DESCRIPTIONS: Record<Category, string[]> = {
  Cleanliness: ['Litter not cleared', 'Refuse chute smells', 'Bulky items left in corridor', 'Spill not cleaned'],
  'Estate Maintenance': ['Broken railing', 'Cracked floor tiles', 'Damaged playground equipment', 'Choked drain'],
  Lift: ['Lift not working', 'Lift door not closing properly', 'Lift stops between floors', 'Lift button faulty'],
  Lighting: ['Corridor light not working', 'Flickering staircase light', 'Void deck lights off at night'],
  Pests: ['Rats spotted near bins', 'Cockroach infestation', 'Mosquito breeding in drain'],
  'Water Seepage': ['Water seeping from ceiling', 'Leak in common corridor', 'Water stain spreading on wall'],
  Others: ['Noise from void deck at night', 'Illegal parking', 'Notice board damaged']
};
const OFFICERS = ['Officer A', 'Officer B', 'Officer C', 'Officer D', 'Officer E', 'Officer F'];

type NewCase = typeof cases.$inferInsert;

// Monsoon months (Nov–Jan) bring more water seepage complaints.
function categoryFor(date: Date): Category {
  const monsoon = [10, 11, 0].includes(date.getMonth());
  return weighted({ ...CATEGORY_WEIGHTS, 'Water Seepage': CATEGORY_WEIGHTS['Water Seepage'] * (monsoon ? 2.5 : 1) });
}

// How much slower than normal a council responds on a given day (1 = normal).
function slowdown(trend: string, dayIndex: number) {
  if (trend === 'declining') return 1 + 1.8 * Math.max(0, (dayIndex - (DAYS - 120)) / 120);
  if (trend === 'improving') return dayIndex < DAYS - 90 ? 1.7 : 0.9;
  return 1;
}

// Days until acknowledgement / closure; most cases meet the 3-day and 7-day targets.
const ackDays = (factor: number) => (rand() < 0.75 ? rand() * 1.5 : 1.5 + rand() * 3.5) * factor;
const closeDays = (factor: number) => (rand() < 0.8 ? 1 + rand() * 5 : 6 + rand() * 12) * factor;

function makeCase(councilId: string, council: (typeof COUNCILS)[number], block: number, category: Category, received: Date, factor: number, now: Date): NewCase {
  const ack = new Date(received.getTime() + ackDays(factor) * DAY_MS);
  const close = new Date(received.getTime() + Math.max(closeDays(factor), (ack.getTime() - received.getTime()) / DAY_MS + 0.2) * DAY_MS);
  const closed = close <= now;
  return {
    id: randomUUID(),
    caseRef: '', // assigned in date order once all cases exist
    townCouncilId: councilId,
    block: String(block),
    street: `${council.prefix} Avenue ${1 + (block % 3)}`,
    postalCode: null, // fictional blocks have no real postal code; add real ones before using OneMap
    location: pick(SPOTS[category]),
    category,
    channel: weighted(CHANNEL_WEIGHTS),
    description: pick(DESCRIPTIONS[category]),
    status: closed ? 'Closed' : 'Open',
    assignedOfficer: pick(OFFICERS),
    receivedAt: received,
    acknowledgedAt: ack <= now ? ack : null,
    closedAt: closed ? close : null
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.');

  const now = new Date();
  const start = new Date(now.getTime() - DAYS * DAY_MS);
  start.setHours(0, 0, 0, 0);

  await db.insert(townCouncils).values(COUNCILS.map(c => ({ name: c.name }))).onConflictDoNothing();
  const councilRows = await db.select().from(townCouncils);
  const councilId = new Map(councilRows.map(r => [r.name, r.id]));

  const rows: NewCase[] = [];
  for (const council of COUNCILS) {
    const id = councilId.get(council.name)!;
    const blocks = Array.from({ length: 30 }, (_, i) => council.blockBase + i);

    for (let day = 0; day < DAYS; day++) {
      const date = new Date(start.getTime() + day * DAY_MS);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const count = Math.round(council.dailyCases * (weekend ? 0.6 : 1) * (0.6 + rand() * 0.8));
      for (let n = 0; n < count; n++) {
        const received = new Date(date.getTime() + int(7, 21) * 3_600_000 + int(0, 59) * 60_000);
        if (received > now) continue;
        rows.push(makeCase(id, council, pick(blocks), categoryFor(date), received, slowdown(council.trend, day), now));
      }
    }

    // Two repeat-case hotspots per council in the last 45 days (≥ 4 cases at one block = hotspot).
    for (const category of ['Lift', 'Pests'] as const) {
      const block = pick(blocks);
      for (let n = 0, total = int(5, 8); n < total; n++) {
        const received = new Date(now.getTime() - int(1, 45) * DAY_MS - int(0, 12) * 3_600_000);
        rows.push(makeCase(id, council, block, category, received, slowdown(council.trend, DAYS - 1), now));
      }
    }
  }

  rows.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  // ~3% of cases are duplicates: same block and category within 3 days of an earlier case.
  const recent = new Map<string, NewCase>();
  for (const row of rows) {
    const key = `${row.townCouncilId}|${row.block}|${row.category}`;
    const earlier = recent.get(key);
    if (earlier && row.receivedAt.getTime() - earlier.receivedAt.getTime() < 3 * DAY_MS && rand() < 0.5) row.duplicateOfId = earlier.id;
    else recent.set(key, row);
  }
  rows.forEach((row, i) => (row.caseRef = 'FB-' + String(i + 1).padStart(6, '0')));

  await db.transaction(async tx => {
    await tx.execute(sql`truncate table ${cases}`);
    for (let i = 0; i < rows.length; i += 500) await tx.insert(cases).values(rows.slice(i, i + 500));
  });

  const open = rows.filter(r => r.status === 'Open').length;
  const duplicates = rows.filter(r => r.duplicateOfId).length;
  console.log(`Seeded ${COUNCILS.length} town councils and ${rows.length} feedback cases (${open} open, ${duplicates} duplicates).`);
}

try {
  await main();
} catch (err) {
  console.error('Seeding failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
