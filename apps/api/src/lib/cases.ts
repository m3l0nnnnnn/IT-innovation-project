import { z } from 'zod';
import { caseCategories, caseChannels, caseStatuses } from '../db/schema.js';

// Allow a few minutes of clock difference before treating a date as "in the future".
const CLOCK_SKEW_MS = 5 * 60_000;

const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null).nullish();

const caseFields = {
  townCouncilId: z.uuid(),
  block: z.string().trim().toUpperCase().regex(/^\d{1,4}[A-Z]?$/, 'Block must be a number with an optional letter, e.g. 210 or 210A'),
  street: optionalText(200),
  postalCode: z.string().trim().regex(/^\d{6}$/, 'Postal code must be 6 digits').nullish(),
  location: optionalText(200),
  category: z.enum(caseCategories),
  channel: z.enum(caseChannels),
  description: optionalText(2000),
  status: z.enum(caseStatuses).optional(),
  assignedOfficer: optionalText(100),
  duplicateOfId: z.uuid().nullish(),
  receivedAt: z.coerce.date(),
  acknowledgedAt: z.coerce.date().nullish(),
  closedAt: z.coerce.date().nullish()
};

export const createCaseBody = z.strictObject(caseFields);
export const updateCaseBody = z.strictObject(caseFields).partial();
export type CaseInput = z.infer<typeof createCaseBody>;

export const caseListQuery = z.object({
  townCouncilId: z.uuid().optional(),
  block: z.string().trim().toUpperCase().max(5).optional(),
  category: z.enum(caseCategories).optional(),
  channel: z.enum(caseChannels).optional(),
  status: z.enum(caseStatuses).optional(),
  officer: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  overdue: z.stringbool().optional(), // open for more than 7 days
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['receivedAt', 'caseRef', 'block', 'category', 'status']).default('receivedAt'),
  order: z.enum(['asc', 'desc']).default('desc')
});

type CaseDates = { status?: 'Open' | 'Closed'; receivedAt: Date; acknowledgedAt?: Date | null; closedAt?: Date | null };

/**
 * Keeps status and closedAt consistent (cases are binary Open/Closed) and checks the dates make sense.
 * Closing without a date stamps closedAt with now; reopening clears closedAt; a closedAt implies Closed.
 */
export function resolveCaseDates<T extends CaseDates>(input: T, now = new Date()):
  { value: T & { status: 'Open' | 'Closed'; acknowledgedAt: Date | null; closedAt: Date | null } } | { error: string } {
  let closedAt = input.closedAt ?? null;
  let status = input.status;
  if (status === 'Closed' && !closedAt) closedAt = now;
  if (status === 'Open') closedAt = null;
  if (!status) status = closedAt ? 'Closed' : 'Open';
  const acknowledgedAt = input.acknowledgedAt ?? null;
  const latest = now.getTime() + CLOCK_SKEW_MS;

  if (input.receivedAt.getTime() > latest) return { error: 'receivedAt cannot be in the future' };
  if (acknowledgedAt && acknowledgedAt < input.receivedAt) return { error: 'acknowledgedAt cannot be before receivedAt' };
  if (acknowledgedAt && acknowledgedAt.getTime() > latest) return { error: 'acknowledgedAt cannot be in the future' };
  if (closedAt && closedAt < input.receivedAt) return { error: 'closedAt cannot be before receivedAt' };
  if (closedAt && closedAt.getTime() > latest) return { error: 'closedAt cannot be in the future' };
  return { value: { ...input, status, acknowledgedAt, closedAt } };
}
