import { pgTable, uuid, text, timestamp, numeric, integer, boolean, index, type AnyPgColumn } from 'drizzle-orm/pg-core';

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
