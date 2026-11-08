import { z } from 'zod';

// Repeat-case hotspots: the same kind of problem reported again and again at one block.
// Grouping by block alone is not useful: with ~30 blocks per council, almost every block gets 4+ cases a quarter.

/** Working assumption (to confirm with EMS): 4 or more cases of one category at one block make a hotspot. */
export const HOTSPOT_MIN_CASES = 4;
/** How far back the "usual" level is measured, before the selected window. */
export const BASELINE_DAYS = 180;
/** A count this unlikely at the usual rate is flagged as a spike. */
export const SPIKE_P_VALUE = 0.01;
// A block-category with no earlier cases is treated as averaging one case a year, so a first-ever burst can still be judged.
const MIN_RATE_PER_DAY = 1 / 365;

export const hotspotQuery = z.object({
  townCouncilId: z.uuid().optional(),
  days: z.coerce.number().int().min(7).max(90).default(30) // baseline needs days + 180 of history
});

/** Expected number of cases in the window, from the same block and category's previous 180 days. */
export function baselineFor(casesBefore: number, windowDays: number): number {
  return casesBefore * windowDays / BASELINE_DAYS;
}

/** Chance of seeing `count` or more cases if the block kept its usual rate (Poisson upper tail). */
export function chanceAtUsualRate(count: number, baseline: number, windowDays: number): number {
  const rate = Math.max(baseline, MIN_RATE_PER_DAY * windowDays);
  let term = Math.exp(-rate); // P(X = 0)
  let below = 0;
  for (let k = 0; k < count; k++) {
    below += term;
    term *= rate / (k + 1);
  }
  return Math.max(0, 1 - below);
}

/**
 * Spike: far more cases than this block and category usually get. Using the Poisson tail rather than
 * "double the usual" stops tiny baselines (one case in six months) turning every hotspot into a spike,
 * and stops busy categories being flagged for a normal month.
 */
export function isSpike(count: number, baseline: number, windowDays: number): boolean {
  return chanceAtUsualRate(count, baseline, windowDays) < SPIKE_P_VALUE;
}
