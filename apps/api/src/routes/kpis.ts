import { Router, type NextFunction, type Request, type Response } from 'express';
import { and, asc, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { cases, caseCategories, kpiChangeLog, kpiCouncilTargets, kpiDefinitions, townCouncils } from '../db/schema.js';
import { DAY_MS, METRICS, thresholdError, type CaseFacts, type PeriodKind, type Thresholds } from '../lib/kpi-calc.js';
import { backtest, dataStart, evaluate, knownAt, suggestSeverity, type KpiDef } from '../lib/kpi-engine.js';
import { categoryContributions, outstandingByBlock, volumeChanges, BASELINE_DAYS, RECENT_DAYS } from '../lib/kpi-factors.js';
import { FORECAST_HORIZON_DAYS, TREND_WINDOW, formatValue } from '../lib/kpi-trend.js';
import {
  councilTargetBody, createKpiBody, DEFAULT_PERIODS, factorsQuery, periodQuery, seriesQuery, updateKpiBody, withinDaysError
} from '../lib/kpis.js';

export const kpisRouter = Router();

/** Look at the data as it stood on an earlier date (up to a year back), e.g. to see what the forecast said then. */
const asOfParam = z.object({ asOf: z.coerce.date().optional() });
function resolveNow(req: Request) {
  const { asOf } = asOfParam.parse(req.query);
  const now = Date.now();
  if (!asOf) return { now, asOf: null };
  const t = Math.min(asOf.getTime(), now);
  if (t < now - 365 * DAY_MS) throw new z.ZodError([{ code: 'custom', path: ['asOf'], message: 'asOf can be at most a year ago', input: asOf }]);
  return { now: t, asOf: new Date(t).toISOString() };
}

// ---- Access ------------------------------------------------------------------------------------------------------
// DEMO ONLY. Changing KPI settings is limited to managers, but login is not built yet, so the role comes from the
// web app's role preview in the X-Estara-Role header. Anyone can send that header: replace this with the JWT
// session check when authentication lands. The audit log records the role (and X-Estara-User if given).
const KPI_MANAGER_ROLES = ['Administrator', 'EMS Manager'];
function requireKpiManager(req: Request, res: Response, next: NextFunction) {
  const role = req.get('x-estara-role') ?? '';
  if (!KPI_MANAGER_ROLES.includes(role)) return void res.status(403).json({ message: 'Only EMS managers can change KPI settings.' });
  next();
}
const changedBy = (req: Request) => {
  const user = (req.get('x-estara-user') ?? '').trim().slice(0, 80);
  return user ? `${user} (${req.get('x-estara-role')})` : req.get('x-estara-role')!;
};

// ---- Loading -----------------------------------------------------------------------------------------------------
type DefRow = typeof kpiDefinitions.$inferSelect;
const toDef = (r: DefRow): KpiDef => ({ id: r.id, name: r.name, metric: r.metric, withinDays: r.withinDays, category: r.category, target: r.target, warning: r.warning });

function describe(r: DefRow) {
  const info = METRICS[r.metric];
  return { ...r, unit: info.unit, direction: info.direction, metricLabel: info.label, daysLabel: info.daysLabel, explain: info.explain };
}

async function loadKpis(activeOnly = true) {
  const rows = await db.select().from(kpiDefinitions).where(activeOnly ? eq(kpiDefinitions.active, true) : undefined)
    .orderBy(asc(kpiDefinitions.sortOrder), asc(kpiDefinitions.createdAt));
  return rows;
}

async function loadOverrides() {
  const rows = await db.select().from(kpiCouncilTargets);
  return new Map(rows.map(r => [r.kpiId + '|' + r.townCouncilId, r]));
}
function thresholdsFor(def: KpiDef, councilId: string, overrides: Awaited<ReturnType<typeof loadOverrides>>): Thresholds & { overridden: boolean } {
  const o = overrides.get(def.id + '|' + councilId);
  return o ? { target: o.target, warning: o.warning, overridden: true } : { target: def.target, warning: def.warning, overridden: false };
}

/** Cases needed from `from` onwards: received since then, or still open / closed since then (for overdue counts). */
async function loadCases(from: number, now: number, townCouncilId?: string): Promise<CaseFacts[]> {
  const start = new Date(from);
  const rows = await db.select({
    townCouncilId: cases.townCouncilId, block: cases.block, category: cases.category,
    receivedAt: cases.receivedAt, acknowledgedAt: cases.acknowledgedAt, closedAt: cases.closedAt
  }).from(cases).where(and(
    townCouncilId ? eq(cases.townCouncilId, townCouncilId) : undefined,
    sql`${cases.receivedAt} <= ${new Date(now)}`,
    or(gte(cases.receivedAt, start), isNull(cases.closedAt), gte(cases.closedAt, start))
  ));
  const facts = rows.map(r => ({
    townCouncilId: r.townCouncilId, block: r.block, category: r.category, receivedAt: r.receivedAt.getTime(),
    acknowledgedAt: r.acknowledgedAt?.getTime() ?? null, closedAt: r.closedAt?.getTime() ?? null
  }));
  return now < Date.now() - 60_000 ? knownAt(facts, now) : facts;
}

function groupByCouncil(list: CaseFacts[]) {
  const map = new Map<string, CaseFacts[]>();
  for (const c of list) {
    const group = map.get(c.townCouncilId);
    if (group) group.push(c); else map.set(c.townCouncilId, [c]);
  }
  return map;
}

async function loadCouncils(townCouncilId?: string) {
  return db.select({ id: townCouncils.id, name: townCouncils.name }).from(townCouncils)
    .where(townCouncilId ? eq(townCouncils.id, townCouncilId) : undefined).orderBy(townCouncils.name);
}

/** Every active KPI for every (or one) Town Council: the data behind the overview grid and the forecast feed. */
async function evaluateAll(period: PeriodKind, now: number, townCouncilId?: string) {
  const [kpiRows, councils, overrides] = await Promise.all([loadKpis(), loadCouncils(townCouncilId), loadOverrides()]);
  const count = DEFAULT_PERIODS[period];
  const grouped = groupByCouncil(await loadCases(dataStart(period, count, now), now, townCouncilId));
  const results = [];
  for (const row of kpiRows) {
    const def = toDef(row);
    for (const council of councils) {
      const thresholds = thresholdsFor(def, council.id, overrides);
      const { series, analysis, explanation } = evaluate(def, thresholds, grouped.get(council.id) ?? [], period, now, count);
      results.push({ kpi: row, council, thresholds, series, analysis, explanation, severity: suggestSeverity(analysis) });
    }
  }
  return { kpiRows, councils, results };
}

// ---- Analytics ---------------------------------------------------------------------------------------------------

// The calculations a KPI can use, for the KPI Settings form.
kpisRouter.get('/metrics', (_req, res) => {
  res.json({
    metrics: Object.entries(METRICS).map(([id, m]) => ({ id, ...m })),
    categories: caseCategories,
    trendWindow: TREND_WINDOW, forecastHorizonDays: FORECAST_HORIZON_DAYS
  });
});

// Overview grid: latest result, status, trend and forecast for every active KPI and Town Council.
kpisRouter.get('/overview', async (req, res) => {
  const { period, townCouncilId } = periodQuery.parse(req.query);
  const { now, asOf } = resolveNow(req);
  const { kpiRows, councils, results } = await evaluateAll(period, now, townCouncilId);
  res.json({
    period, asOf, generatedAt: new Date().toISOString(), councils,
    kpis: kpiRows.map(describe),
    results: results.map(r => ({
      kpiId: r.kpi.id, townCouncilId: r.council.id, thresholds: r.thresholds,
      status: r.analysis.status, latest: r.analysis.latest, current: r.analysis.current,
      changeVsPrevious: r.analysis.changeVsPrevious, changeVsHistory: r.analysis.changeVsHistory,
      trend: r.analysis.trend, forecast: { ...r.analysis.forecast, projection: undefined },
      significantChanges: r.analysis.significantChanges.slice(-3),
      sparkline: r.series.filter(p => !p.partial).slice(-12).map(p => ({ label: p.label, value: p.value })),
      severity: r.severity, explanation: r.explanation
    }))
  });
});

/**
 * Forecast feed for the early-warning module: one row per KPI and Town Council, most urgent first, with the facts
 * behind each forecast and a plain-English explanation. ?atRiskOnly=true leaves out rows with no suggested severity.
 */
kpisRouter.get('/forecasts', async (req, res) => {
  const { period, townCouncilId } = periodQuery.parse(req.query);
  const { atRiskOnly } = z.object({ atRiskOnly: z.stringbool().default(false) }).parse(req.query);
  const { now, asOf } = resolveNow(req);
  const { results } = await evaluateAll(period, now, townCouncilId);
  const rank = { Critical: 0, Warning: 1, Watch: 2 } as const;
  const data = results
    .filter(r => !atRiskOnly || r.severity)
    .map(r => {
      const info = METRICS[r.kpi.metric];
      const f = r.analysis.forecast;
      return {
        kpiId: r.kpi.id, kpiName: r.kpi.name, townCouncilId: r.council.id, council: r.council.name,
        unit: info.unit, direction: info.direction, target: r.thresholds.target, warning: r.thresholds.warning,
        status: r.analysis.status, value: r.analysis.latest?.value ?? null, period: r.analysis.latest?.label ?? null,
        trend: r.analysis.trend.label, changeOverWindow: r.analysis.trend.changeOverWindow,
        worseInLastPeriods: { worse: r.analysis.trend.worseCount, of: r.analysis.trend.changes },
        forecast: {
          status: f.status, daysToTarget: f.daysToTarget, daysToWarning: f.daysToWarning, range: f.range,
          beyondHorizon: f.beyondHorizon, confidence: f.confidence,
          estimatedBreachAt: f.status === 'deteriorating' && f.daysToTarget !== null && !f.beyondHorizon ? new Date(now + f.daysToTarget * DAY_MS).toISOString() : null
        },
        suggestedSeverity: r.severity,
        explanation: r.explanation,
        link: `/analytics/trends?kpiId=${r.kpi.id}&townCouncilId=${r.council.id}&period=${period}`
      };
    })
    .sort((a, b) => (a.suggestedSeverity ? rank[a.suggestedSeverity] : 3) - (b.suggestedSeverity ? rank[b.suggestedSeverity] : 3) ||
      (a.forecast.daysToTarget ?? Infinity) - (b.forecast.daysToTarget ?? Infinity) || a.council.localeCompare(b.council));
  res.json({ data, period, asOf, generatedAt: new Date().toISOString(), note: 'Forecasts are estimates from recent trends, not guaranteed outcomes.' });
});

// One KPI for one Town Council: full series, analysis, projection and forecast backtest.
kpisRouter.get('/series', async (req, res) => {
  const { kpiId, townCouncilId, period, periods } = seriesQuery.parse(req.query);
  const { now, asOf } = resolveNow(req);
  const [[row], [council], overrides] = await Promise.all([
    db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, kpiId)),
    loadCouncils(townCouncilId), loadOverrides()
  ]);
  if (!row) return void res.status(404).json({ message: 'KPI not found.' });
  if (!council) return void res.status(404).json({ message: 'Town Council not found.' });
  const def = toDef(row);
  const thresholds = thresholdsFor(def, council.id, overrides);
  const count = periods ?? DEFAULT_PERIODS[period];
  const backtestDays = (period === 'week' ? 7 : 31) * 17;
  const facts = await loadCases(dataStart(period, count, now, backtestDays), now, townCouncilId);
  const { series, analysis, explanation } = evaluate(def, thresholds, facts, period, now, count);
  res.json({
    kpi: describe(row), council, thresholds, period, asOf,
    series: series.map(p => ({ label: p.label, start: new Date(p.start).toISOString(), value: p.value, sample: p.sample, pending: p.pending, partial: p.partial })),
    analysis, explanation, severity: suggestSeverity(analysis),
    backtest: backtest(def, thresholds, facts, period, now)
  });
});

// Why is this KPI where it is? Category contributions, blocks with unusual outstanding cases, complaint volume changes.
kpisRouter.get('/factors', async (req, res) => {
  const { kpiId, townCouncilId } = factorsQuery.parse(req.query);
  const { now, asOf } = resolveNow(req);
  const [[row], [council]] = await Promise.all([
    db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, kpiId)), loadCouncils(townCouncilId)
  ]);
  if (!row) return void res.status(404).json({ message: 'KPI not found.' });
  if (!council) return void res.status(404).json({ message: 'Town Council not found.' });
  const from = now - (365 + RECENT_DAYS + 7) * DAY_MS;
  const facts = await loadCases(from, now, townCouncilId);
  const [{ earliest }] = await db.select({ earliest: sql<string | null>`min(${cases.receivedAt})` }).from(cases).where(eq(cases.townCouncilId, townCouncilId));
  const historyStart = earliest ? new Date(earliest).getTime() : now;
  const def = toDef(row);
  const info = METRICS[def.metric];
  const contributions = categoryContributions(def, facts, caseCategories, now);
  const blocks = outstandingByBlock(facts, now);
  const volumes = volumeChanges(facts, caseCategories, now, historyStart);
  res.json({
    kpi: describe(row), council, asOf, windows: { recentDays: RECENT_DAYS, baselineDays: BASELINE_DAYS },
    contributions, blocks: blocks.slice(0, 12), unusualBlocks: blocks.filter(b => b.unusual).length,
    volumes, summary: summarise(row.name, info.unit, contributions, blocks, volumes)
  });
});

function summarise(name: string, unit: (typeof METRICS)[keyof typeof METRICS]['unit'], c: ReturnType<typeof categoryContributions>,
  blocks: ReturnType<typeof outstandingByBlock>, volumes: ReturnType<typeof volumeChanges>): string[] {
  const out: string[] = [];
  if (c.change !== null && c.recentValue !== null && c.baselineValue !== null) {
    const drags = c.categories.filter(x => x.effect === 'worse').slice(0, 2);
    const moved = `${name} is ${formatValue(c.recentValue, unit)} over the last 4 weeks, against ${formatValue(c.baselineValue, unit)} in the 12 weeks before`;
    out.push(drags.length
      ? `${moved}. The biggest drag: ${drags.map(d => `${d.category} (${d.contribution > 0 ? '+' : ''}${d.contribution} ${unit === '%' ? 'pts' : unit})`).join(', ')}.`
      : `${moved}. No category is pulling it in the wrong direction.`);
  }
  const unusual = blocks.filter(b => b.unusual);
  if (unusual.length) out.push(`${unusual.length} block${unusual.length > 1 ? 's have' : ' has'} unusually many outstanding cases, led by Blk ${unusual[0].block} (${unusual[0].open} open, about ${unusual[0].expected} expected; mostly ${unusual[0].topCategory}).`);
  for (const v of volumes.filter(v => v.change !== 'normal' && v.category !== 'All categories').slice(0, 3)) {
    out.push(`${v.category} complaints ${v.change === 'increase' ? 'rose' : 'fell'} to ${v.recent} in 4 weeks (about ${v.expected} usual)` +
      (v.seasonal ? ', similar to the same time last year, so possibly seasonal.' : '.'));
  }
  if (!out.length) out.push('No clear contributing factors found in the last 4 weeks.');
  return out;
}

// ---- KPI & threshold management ----------------------------------------------------------------------------------

kpisRouter.get('/definitions', async (req, res) => {
  const { includeArchived } = z.object({ includeArchived: z.stringbool().default(false) }).parse(req.query);
  const [rows, targets] = await Promise.all([
    loadKpis(!includeArchived),
    db.select({ kpiId: kpiCouncilTargets.kpiId, townCouncilId: kpiCouncilTargets.townCouncilId, council: townCouncils.name, target: kpiCouncilTargets.target, warning: kpiCouncilTargets.warning, updatedAt: kpiCouncilTargets.updatedAt })
      .from(kpiCouncilTargets).innerJoin(townCouncils, eq(townCouncils.id, kpiCouncilTargets.townCouncilId)).orderBy(townCouncils.name)
  ]);
  res.json({ data: rows.map(r => ({ ...describe(r), councilTargets: targets.filter(t => t.kpiId === r.id) })) });
});

kpisRouter.get('/definitions/:id/history', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const data = await db.select({
    id: kpiChangeLog.id, action: kpiChangeLog.action, changedBy: kpiChangeLog.changedBy, changes: kpiChangeLog.changes,
    changedAt: kpiChangeLog.changedAt, townCouncilId: kpiChangeLog.townCouncilId, council: townCouncils.name
  }).from(kpiChangeLog).leftJoin(townCouncils, eq(townCouncils.id, kpiChangeLog.townCouncilId))
    .where(eq(kpiChangeLog.kpiId, id)).orderBy(desc(kpiChangeLog.changedAt)).limit(100);
  res.json({ data });
});

kpisRouter.post('/definitions', requireKpiManager, async (req, res) => {
  const input = createKpiBody.parse(req.body);
  const info = METRICS[input.metric];
  const error = withinDaysError(input.metric, input.withinDays) ?? thresholdError(info.direction, info.unit, input);
  if (error) return void res.status(400).json({ message: error });
  if (await nameTaken(input.name)) return void res.status(409).json({ message: 'A KPI with this name already exists.' });
  const created = await db.transaction(async tx => {
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${kpiDefinitions.sortOrder}), 0) + 1` }).from(kpiDefinitions);
    const [row] = await tx.insert(kpiDefinitions).values({ ...input, withinDays: input.withinDays ?? null, category: input.category ?? null, sortOrder: next }).returning();
    await tx.insert(kpiChangeLog).values({ kpiId: row.id, action: 'created', changedBy: changedBy(req), changes: diff({}, row) });
    return row;
  });
  res.status(201).json({ data: describe(created) });
});

kpisRouter.patch('/definitions/:id', requireKpiManager, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const changes = updateKpiBody.parse(req.body);
  const [existing] = await db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, id));
  if (!existing) return void res.status(404).json({ message: 'KPI not found.' });
  const merged = { ...existing, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) } as DefRow;
  const info = METRICS[existing.metric];
  const error = withinDaysError(existing.metric, merged.withinDays) ?? thresholdError(info.direction, info.unit, merged);
  if (error) return void res.status(400).json({ message: error });
  const changed = diff(existing, merged);
  if (!Object.keys(changed).length) return void res.json({ data: describe(existing) });
  if (changed.name && await nameTaken(merged.name, id)) return void res.status(409).json({ message: 'A KPI with this name already exists.' });
  const action = changes.active === false && existing.active ? 'archived' : changes.active === true && !existing.active ? 'restored' : 'updated';
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(kpiDefinitions).set({ ...changes, updatedAt: new Date() }).where(eq(kpiDefinitions.id, id)).returning();
    await tx.insert(kpiChangeLog).values({ kpiId: id, action, changedBy: changedBy(req), changes: changed });
    return row;
  });
  res.json({ data: describe(updated) });
});

// A Town Council's own target and warning line for a KPI.
kpisRouter.put('/definitions/:id/targets/:townCouncilId', requireKpiManager, async (req, res) => {
  const id = z.uuid().parse(req.params.id), townCouncilId = z.uuid().parse(req.params.townCouncilId);
  const input = councilTargetBody.parse(req.body);
  const [def] = await db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, id));
  if (!def) return void res.status(404).json({ message: 'KPI not found.' });
  const info = METRICS[def.metric];
  const error = thresholdError(info.direction, info.unit, input);
  if (error) return void res.status(400).json({ message: error });
  const [before] = await db.select().from(kpiCouncilTargets).where(and(eq(kpiCouncilTargets.kpiId, id), eq(kpiCouncilTargets.townCouncilId, townCouncilId)));
  const from = before ?? { target: def.target, warning: def.warning };
  await db.transaction(async tx => {
    await tx.insert(kpiCouncilTargets).values({ kpiId: id, townCouncilId, ...input })
      .onConflictDoUpdate({ target: [kpiCouncilTargets.kpiId, kpiCouncilTargets.townCouncilId], set: { ...input, updatedAt: new Date() } });
    await tx.insert(kpiChangeLog).values({ kpiId: id, townCouncilId, action: 'council_target_set', changedBy: changedBy(req), changes: diff(from, { ...from, ...input }) });
  });
  res.json({ data: { kpiId: id, townCouncilId, ...input } });
});

kpisRouter.delete('/definitions/:id/targets/:townCouncilId', requireKpiManager, async (req, res) => {
  const id = z.uuid().parse(req.params.id), townCouncilId = z.uuid().parse(req.params.townCouncilId);
  const where = and(eq(kpiCouncilTargets.kpiId, id), eq(kpiCouncilTargets.townCouncilId, townCouncilId));
  const [before] = await db.select().from(kpiCouncilTargets).where(where);
  if (!before) return void res.status(404).json({ message: 'This Town Council uses the standard target.' });
  await db.transaction(async tx => {
    await tx.delete(kpiCouncilTargets).where(where);
    await tx.insert(kpiChangeLog).values({ kpiId: id, townCouncilId, action: 'council_target_removed', changedBy: changedBy(req),
      changes: { target: { from: before.target, to: null }, warning: { from: before.warning, to: null } } });
  });
  res.status(204).end();
});

// Names are unique ignoring case, so "Closed within 7 days" and "closed within 7 days" cannot both exist.
async function nameTaken(name: string, exceptId?: string) {
  const [row] = await db.select({ id: kpiDefinitions.id }).from(kpiDefinitions)
    .where(and(sql`lower(${kpiDefinitions.name}) = lower(${name})`, exceptId ? sql`${kpiDefinitions.id} <> ${exceptId}` : undefined));
  return !!row;
}

const AUDITED = ['name', 'description', 'metric', 'withinDays', 'category', 'target', 'warning', 'active', 'sortOrder'] as const;
function diff(before: Partial<Record<string, unknown>>, after: Partial<Record<string, unknown>>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of AUDITED) {
    if (!(key in after)) continue;
    const a = before[key] ?? null, b = after[key] ?? null;
    if (a !== b) out[key] = { from: a, to: b };
  }
  return out;
}
