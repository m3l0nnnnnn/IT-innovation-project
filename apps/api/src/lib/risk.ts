export type Risk = 'Healthy' | 'Watch' | 'Warning' | 'Critical';

/** DEMONSTRATION ONLY. Thresholds must be confirmed with EMS before real use. */
export function classifyRisk(value: number, failAt: number, warningBand: number, higherIsBetter = true): Risk {
  if (![value, failAt, warningBand].every(Number.isFinite) || warningBand <= 0) {
    throw new Error('Invalid KPI inputs');
  }
  const margin = higherIsBetter ? value - failAt : failAt - value;
  if (margin <= 0) return 'Critical';
  if (margin <= warningBand) return 'Warning';
  if (margin <= 2 * warningBand) return 'Watch';
  return 'Healthy';
}
