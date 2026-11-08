import { Router } from 'express';
import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import { cases, townCouncils, caseCategories, caseChannels, caseStatuses } from '../db/schema.js';
import { hotspotQuery, baselineFor, isSpike, HOTSPOT_MIN_CASES, BASELINE_DAYS } from '../lib/hotspots.js';
import { caseListQuery, caseSummaryQuery, createCaseBody, updateCaseBody, resolveCaseDates, OVERDUE_AFTER_DAYS } from '../lib/cases.js';

export const casesRouter = Router();

const CASE_REF = /^FB-\d{6}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const original = alias(cases, 'original');

const caseColumns = {
  id: cases.id,
  caseRef: cases.caseRef,
  townCouncilId: cases.townCouncilId,
  council: townCouncils.name,
  block: cases.block,
  street: cases.street,
  postalCode: cases.postalCode,
  location: cases.location,
  category: cases.category,
  channel: cases.channel,
  description: cases.description,
  status: cases.status,
  assignedOfficer: cases.assignedOfficer,
  duplicateOfId: cases.duplicateOfId,
  duplicateOfRef: original.caseRef,
  receivedAt: cases.receivedAt,
  acknowledgedAt: cases.acknowledgedAt,
  closedAt: cases.closedAt,
  createdAt: cases.createdAt,
  updatedAt: cases.updatedAt
};

function selectCases() {
  return db.select(caseColumns).from(cases)
    .innerJoin(townCouncils, eq(cases.townCouncilId, townCouncils.id))
    .leftJoin(original, eq(cases.duplicateOfId, original.id));
}

// Accepts either the UUID or the case reference (FB-000123) so URLs can use the readable ID.
function matchCase(idOrRef: string) {
  if (CASE_REF.test(idOrRef)) return eq(cases.caseRef, idOrRef.toUpperCase());
  if (UUID.test(idOrRef)) return eq(cases.id, idOrRef);
  return null;
}

async function findCase(idOrRef: string) {
  const where = matchCase(idOrRef);
  if (!where) return null;
  const [row] = await selectCases().where(where);
  return row ?? null;
}

// A duplicate must point at another existing case in the same Town Council.
async function checkDuplicateOf(duplicateOfId: string | null | undefined, townCouncilId: string, selfId?: string) {
  if (!duplicateOfId) return null;
  if (duplicateOfId === selfId) return 'A case cannot be a duplicate of itself';
  const [target] = await db.select({ townCouncilId: cases.townCouncilId }).from(cases).where(eq(cases.id, duplicateOfId));
  if (!target) return 'duplicateOfId does not match an existing case';
  if (target.townCouncilId !== townCouncilId) return 'A duplicate must belong to the same Town Council as the original case';
  return null;
}

// Options for filter dropdowns and the case form.
casesRouter.get('/meta', async (_req, res) => {
  const councils = await db.select({ id: townCouncils.id, name: townCouncils.name }).from(townCouncils).orderBy(townCouncils.name);
  res.json({ councils, categories: caseCategories, channels: caseChannels, statuses: caseStatuses });
});

// Headline counts for the case workspace, optionally for one Town Council.
casesRouter.get('/summary', async (req, res) => {
  const { townCouncilId } = caseSummaryQuery.parse(req.query);
  const open = sql`${cases.status} = 'Open'`;
  const [data] = await db.select({
    total: sql<number>`count(*)::int`,
    open: sql<number>`count(*) filter (where ${open})::int`,
    closed: sql<number>`count(*) filter (where ${cases.status} = 'Closed')::int`,
    overdue: sql<number>`count(*) filter (where ${open} and ${cases.receivedAt} < now() - make_interval(days => ${OVERDUE_AFTER_DAYS}))::int`,
    unacknowledged: sql<number>`count(*) filter (where ${open} and ${cases.acknowledgedAt} is null)::int`
  }).from(cases).where(townCouncilId ? eq(cases.townCouncilId, townCouncilId) : undefined);
  res.json({ data, overdueAfterDays: OVERDUE_AFTER_DAYS });
});

// Repeat-case hotspots in the window, each compared with its usual level (see lib/hotspots.ts).
casesRouter.get('/hotspots', async (req, res) => {
  const { townCouncilId, days } = hotspotQuery.parse(req.query);
  const windowStart = sql`now() - make_interval(days => ${days})`;
  const council = townCouncilId ? sql`and ${cases.townCouncilId} = ${townCouncilId}` : sql``;
  const { rows } = await db.execute<{
    town_council_id: string; council: string; block: string; category: string; street: string | null;
    count: number; open: number; last_received_at: string; before: number;
  }>(sql`
    with recent as (
      select ${cases.townCouncilId} as town_council_id, ${cases.block} as block, ${cases.category} as category,
        count(*)::int as count,
        count(*) filter (where ${cases.status} = 'Open')::int as open,
        max(${cases.receivedAt}) as last_received_at,
        mode() within group (order by ${cases.street}) as street
      from ${cases}
      where ${cases.receivedAt} >= ${windowStart} and ${cases.receivedAt} <= now() ${council}
      group by 1, 2, 3
      having count(*) >= ${HOTSPOT_MIN_CASES}
    ), before as (
      select ${cases.townCouncilId} as town_council_id, ${cases.block} as block, ${cases.category} as category, count(*)::int as before
      from ${cases}
      where ${cases.receivedAt} >= now() - make_interval(days => ${days + BASELINE_DAYS}) and ${cases.receivedAt} < ${windowStart} ${council}
      group by 1, 2, 3
    )
    select r.*, ${townCouncils.name} as council, coalesce(b.before, 0)::int as before
    from recent r
    join ${townCouncils} on ${townCouncils.id} = r.town_council_id
    left join before b using (town_council_id, block, category)
  `);

  const data = rows.map(r => {
    const baseline = baselineFor(r.before, days);
    return {
      townCouncilId: r.town_council_id, council: r.council, block: r.block, street: r.street, category: r.category,
      count: r.count, open: r.open, lastReceivedAt: new Date(r.last_received_at).toISOString(),
      baseline: Math.round(baseline * 10) / 10,
      spike: isSpike(r.count, baseline, days)
    };
  }).sort((a, b) => Number(b.spike) - Number(a.spike) || b.count - a.count || b.open - a.open ||
    a.council.localeCompare(b.council) || a.block.localeCompare(b.block, undefined, { numeric: true }));
  res.json({ data, windowDays: days, minCases: HOTSPOT_MIN_CASES, baselineDays: BASELINE_DAYS });
});

casesRouter.get('/', async (req, res) => {
  const query = caseListQuery.parse(req.query);
  const filters: (SQL | undefined)[] = [
    query.townCouncilId ? eq(cases.townCouncilId, query.townCouncilId) : undefined,
    query.block ? eq(cases.block, query.block) : undefined,
    query.category ? eq(cases.category, query.category) : undefined,
    query.channel ? eq(cases.channel, query.channel) : undefined,
    query.status ? eq(cases.status, query.status) : undefined,
    query.officer ? ilike(cases.assignedOfficer, `%${query.officer}%`) : undefined,
    query.from ? gte(cases.receivedAt, query.from) : undefined,
    query.to ? lte(cases.receivedAt, query.to) : undefined,
    query.overdue === true ? and(eq(cases.status, 'Open'), lt(cases.receivedAt, sql`now() - make_interval(days => ${OVERDUE_AFTER_DAYS})`)) : undefined,
    query.q ? or(
      ilike(cases.caseRef, `%${query.q}%`), ilike(cases.block, `%${query.q}%`), ilike(cases.street, `%${query.q}%`),
      ilike(cases.location, `%${query.q}%`), ilike(cases.description, `%${query.q}%`)
    ) : undefined
  ];
  const where = and(...filters);
  const direction = query.order === 'asc' ? asc : desc;

  const [data, [{ total }]] = await Promise.all([
    selectCases().where(where)
      .orderBy(direction(cases[query.sort]), direction(cases.caseRef))
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(cases).where(where)
  ]);
  res.json({ data, page: query.page, pageSize: query.pageSize, total });
});

casesRouter.get('/:id', async (req, res) => {
  const found = await findCase(req.params.id);
  if (!found) return void res.status(404).json({ message: 'Case not found.' });
  const duplicates = await db.select({ id: cases.id, caseRef: cases.caseRef, receivedAt: cases.receivedAt, status: cases.status })
    .from(cases).where(eq(cases.duplicateOfId, found.id)).orderBy(cases.receivedAt);
  res.json({ data: { ...found, duplicates } });
});

casesRouter.post('/', async (req, res) => {
  const resolved = resolveCaseDates(createCaseBody.parse(req.body));
  if ('error' in resolved) return void res.status(400).json({ message: resolved.error });
  const input = resolved.value;
  const duplicateError = await checkDuplicateOf(input.duplicateOfId, input.townCouncilId);
  if (duplicateError) return void res.status(400).json({ message: duplicateError });

  // Next readable reference after the highest existing one; the unique constraint guards against races (409).
  const [{ caseRef }] = await db.select({
    caseRef: sql<string>`'FB-' || lpad((coalesce(max(substring(${cases.caseRef} from 4)::int), 0) + 1)::text, 6, '0')`
  }).from(cases);
  const [created] = await db.insert(cases).values({ ...input, caseRef }).returning({ id: cases.id });
  res.status(201).location(`/api/cases/${created.id}`).json({ data: await findCase(created.id) });
});

casesRouter.patch('/:id', async (req, res) => {
  const existing = await findCase(req.params.id);
  if (!existing) return void res.status(404).json({ message: 'Case not found.' });
  const changes = updateCaseBody.parse(req.body);

  // Validate the merged record so a partial update can't leave the dates or status inconsistent.
  const merged = {
    receivedAt: existing.receivedAt, acknowledgedAt: existing.acknowledgedAt, closedAt: existing.closedAt,
    ...changes,
    status: changes.status ?? (changes.closedAt !== undefined ? undefined : existing.status)
  };
  const resolved = resolveCaseDates(merged);
  if ('error' in resolved) return void res.status(400).json({ message: resolved.error });
  const townCouncilId = changes.townCouncilId ?? existing.townCouncilId;
  const duplicateOfId = changes.duplicateOfId !== undefined ? changes.duplicateOfId : existing.duplicateOfId;
  const duplicateError = await checkDuplicateOf(duplicateOfId, townCouncilId, existing.id);
  if (duplicateError) return void res.status(400).json({ message: duplicateError });

  await db.update(cases).set({ ...resolved.value, updatedAt: new Date() }).where(eq(cases.id, existing.id));
  res.json({ data: await findCase(existing.id) });
});

casesRouter.delete('/:id', async (req, res) => {
  const existing = await findCase(req.params.id);
  if (!existing) return void res.status(404).json({ message: 'Case not found.' });
  await db.transaction(async tx => {
    // Unlink any cases marked as duplicates of this one before deleting it.
    await tx.update(cases).set({ duplicateOfId: null, updatedAt: new Date() }).where(eq(cases.duplicateOfId, existing.id));
    await tx.delete(cases).where(eq(cases.id, existing.id));
  });
  res.status(204).end();
});
