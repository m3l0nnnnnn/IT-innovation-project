import { pgTable, uuid, text, timestamp, numeric, integer, boolean, index, jsonb, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core';

// Database schema. RLS is enabled with no policies so Supabase's public Data API cannot read or write
// these tables; the API connects as the table owner, which bypasses RLS.
export const townCouncils = pgTable('town_councils', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique()
}).enableRLS();

// Allowed values for feedback case text columns; shared with Zod validation and the seed script.
export const caseCategories = ['Cleanliness', 'Lift', 'Lighting', 'Pests', 'Water Seepage', 'Estate Maintenance', 'Others'] as const;
export const caseChannels = ['Email', 'Call', 'OneService', 'Walk-in'] as const;
export const caseStatuses = ['Open', 'Closed'] as const;

export const cases = pgTable('feedback_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseRef: text('case_ref').notNull().unique(), // human-readable ID, e.g. FB-1041
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id).notNull(),
  block: text('block').notNull(), // e.g. 210 or 210A; used for repeat-case hotspots
  street: text('street'),
  postalCode: text('postal_code'), // 6 digits; used to place the block on the OneMap map
  location: text('location'), // spot within the block, e.g. Lift lobby L5
  category: text('category', { enum: caseCategories }).notNull(),
  channel: text('channel', { enum: caseChannels }).notNull(),
  description: text('description'),
  status: text('status', { enum: caseStatuses }).notNull().default('Open'),
  assignedOfficer: text('assigned_officer'),
  duplicateOfId: uuid('duplicate_of_id').references((): AnyPgColumn => cases.id), // set when this case repeats an earlier one
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (t) => [
  index('feedback_cases_council_received_idx').on(t.townCouncilId, t.receivedAt),
  index('feedback_cases_block_idx').on(t.block),
  index('feedback_cases_status_idx').on(t.status)
]).enableRLS();
// KPI & Performance Analytics (Joel). Each KPI is one of the calculations in lib/kpi-calc.ts, with
// its own parameters, target and warning threshold. Results are calculated from feedback_cases on request.
export const kpiMetrics = ['ack_within', 'closed_within', 'overdue_open', 'avg_ack_days', 'avg_close_days', 'repeat_rate'] as const;

export const kpiDefinitions = pgTable('kpi_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  metric: text('metric', { enum: kpiMetrics }).notNull(), // fixed once created: changing it would rewrite the KPI's history
  withinDays: integer('within_days'), // e.g. acknowledged within 3 days; null for metrics without a day limit
  category: text('category', { enum: caseCategories }), // only count cases of this category; null = all
  target: numeric('target', { mode: 'number' }).notNull(), // the acceptable standard; worse than this is a breach
  warning: numeric('warning', { mode: 'number' }).notNull(), // early-warning line, between healthy and the target
  active: boolean('active').notNull().default(true), // archived KPIs keep their settings history
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}).enableRLS();

// A Town Council can have its own target and warning threshold for a KPI (e.g. a larger council's overdue limit).
export const kpiCouncilTargets = pgTable('kpi_council_targets', {
  kpiId: uuid('kpi_id').references(() => kpiDefinitions.id, { onDelete: 'cascade' }).notNull(),
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id).notNull(),
  target: numeric('target', { mode: 'number' }).notNull(),
  warning: numeric('warning', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (t) => [primaryKey({ columns: [t.kpiId, t.townCouncilId] })]).enableRLS();

// Who changed which KPI setting and when, so threshold changes can be reviewed.
export const kpiChangeLog = pgTable('kpi_change_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  kpiId: uuid('kpi_id').references(() => kpiDefinitions.id, { onDelete: 'cascade' }).notNull(),
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id), // set for council-specific targets
  action: text('action').notNull(), // created | updated | archived | restored | council_target_set | council_target_removed
  changedBy: text('changed_by').notNull(),
  changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }>>().notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull()
}, (t) => [index('kpi_change_log_kpi_idx').on(t.kpiId, t.changedAt)]).enableRLS();

export const kpis = pgTable('kpi_measurements', {
  id: uuid('id').defaultRandom().primaryKey(),
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id).notNull(),
  name: text('name').notNull(),
  value: numeric('value').notNull(),
  threshold: numeric('threshold'),
  measuredAt: timestamp('measured_at', { withTimezone: true }).defaultNow().notNull()
}).enableRLS();
export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id).notNull(),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('New'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}).enableRLS();
export const actions = pgTable('corrective_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  alertId: uuid('alert_id').references(() => alerts.id),
  title: text('title').notNull(),
  owner: text('owner'),
  status: text('status').notNull().default('Planned'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completed: boolean('completed').notNull().default(false),
  effectivenessScore: integer('effectiveness_score')
}).enableRLS();
