import { pgTable, uuid, text, timestamp, numeric, integer, boolean } from 'drizzle-orm/pg-core';

// Schema for future persistent storage. The current API serves synthetic demo data.
export const townCouncils = pgTable('town_councils', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique()
});
export const cases = pgTable('feedback_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id).notNull(),
  location: text('location').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true })
});
export const kpis = pgTable('kpi_measurements', {
  id: uuid('id').defaultRandom().primaryKey(),
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id).notNull(),
  name: text('name').notNull(),
  value: numeric('value').notNull(),
  threshold: numeric('threshold'),
  measuredAt: timestamp('measured_at', { withTimezone: true }).defaultNow().notNull()
});
export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  townCouncilId: uuid('town_council_id').references(() => townCouncils.id).notNull(),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('New'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
export const actions = pgTable('corrective_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  alertId: uuid('alert_id').references(() => alerts.id),
  title: text('title').notNull(),
  owner: text('owner'),
  status: text('status').notNull().default('Planned'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completed: boolean('completed').notNull().default(false),
  effectivenessScore: integer('effectiveness_score')
});
