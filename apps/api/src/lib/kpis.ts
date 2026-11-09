import { z } from 'zod';
import { caseCategories, kpiMetrics } from '../db/schema.js';
import { METRICS, type KpiMetric } from './kpi-calc.js';

/**
 * Starting KPIs. Targets are WORKING ASSUMPTIONS to confirm with EMS, set so that a Town Council performing
 * normally on the seed data sits comfortably on track. Managers can change them in KPI Settings.
 */
export const DEFAULT_KPIS: { name: string; description: string; metric: KpiMetric; withinDays: number | null; target: number; warning: number }[] = [
  { name: 'Acknowledged within 3 days', description: 'Feedback must be acknowledged within 3 days (working assumption).', metric: 'ack_within', withinDays: 3, target: 75, warning: 80 },
  { name: 'Closed within 7 days', description: 'Cases left unclosed for more than 7 days count as an exception (working assumption).', metric: 'closed_within', withinDays: 7, target: 70, warning: 75 },
  { name: 'Overdue open cases', description: 'Open cases older than 7 days.', metric: 'overdue_open', withinDays: 7, target: 15, warning: 10 },
  { name: 'Average response time', description: 'Days from receiving a case to acknowledging it.', metric: 'avg_ack_days', withinDays: null, target: 2.5, warning: 2 },
  { name: 'Average resolution time', description: 'Days from receiving a case to closing it.', metric: 'avg_close_days', withinDays: null, target: 8, warning: 7 },
  { name: 'Recurring cases', description: 'Cases repeating a same-category case at the same block within 14 days.', metric: 'repeat_rate', withinDays: 14, target: 40, warning: 35 }
];

const threshold = z.coerce.number().finite().min(0).max(100_000);
const name = z.string().trim().min(3).max(80);
const description = z.string().trim().max(500).transform(v => v || null).nullish();
const withinDays = z.coerce.number().int().min(1).max(90).nullish();

export const createKpiBody = z.strictObject({
  name, description,
  metric: z.enum(kpiMetrics),
  withinDays,
  category: z.enum(caseCategories).nullish(),
  target: threshold,
  warning: threshold
});
// The calculation (metric) is fixed after creation: changing it would silently rewrite the KPI's history.
export const updateKpiBody = z.strictObject({
  name: name.optional(), description,
  withinDays,
  category: z.enum(caseCategories).nullish(),
  target: threshold.optional(),
  warning: threshold.optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional()
});
export const councilTargetBody = z.strictObject({ target: threshold, warning: threshold });

/** withinDays is required for metrics with a day limit and must be empty for the others. */
export function withinDaysError(metric: KpiMetric, days: number | null | undefined): string | null {
  const info = METRICS[metric];
  if (info.daysLabel && !days) return `${info.daysLabel.replace(' (days)', '')} needs a number of days`;
  if (!info.daysLabel && days) return `${info.label} does not use a day limit`;
  return null;
}

export const periodQuery = z.object({
  period: z.enum(['week', 'month']).default('week'),
  townCouncilId: z.uuid().optional()
});
export const seriesQuery = z.object({
  kpiId: z.uuid(),
  townCouncilId: z.uuid(),
  period: z.enum(['week', 'month']).default('week'),
  periods: z.coerce.number().int().min(8).max(60).optional()
});
export const factorsQuery = z.object({ kpiId: z.uuid(), townCouncilId: z.uuid() });

/** Number of periods shown by default: about six months of weeks, or a year of months. */
export const DEFAULT_PERIODS = { week: 26, month: 13 } as const;
