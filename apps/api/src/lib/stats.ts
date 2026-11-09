// Small statistics helpers for KPI trends, forecasts and contributing-factor analysis.

export type Fit = {
  /** Change per period (x is the period index). */
  slope: number;
  intercept: number;
  /** Standard error of the slope; Infinity when it cannot be estimated (fewer than 3 points). */
  slopeSE: number;
  /** Share of the variation the straight line explains (0–1). */
  r2: number;
  n: number;
};

/** Ordinary least-squares line through (x, y) points. */
export function linearFit(points: { x: number; y: number }[]): Fit | null {
  const n = points.length;
  if (n < 2) return null;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
    syy += (p.y - meanY) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const sse = points.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const slopeSE = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : Infinity;
  const r2 = syy === 0 ? 1 : Math.max(0, 1 - sse / syy);
  return { slope, intercept, slopeSE, r2, n };
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

/** Sample standard deviation (n − 1). */
export function stdDev(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

/** P(X ≥ k) for a Poisson count with the given expected value. */
export function poissonUpperTail(k: number, expected: number): number {
  if (k <= 0) return 1;
  if (expected <= 0) return 0;
  let term = Math.exp(-expected);
  let below = 0;
  for (let i = 0; i < k; i++) {
    below += term;
    term *= expected / (i + 1);
  }
  return Math.min(1, Math.max(0, 1 - below));
}

/** P(X ≤ k) for a Poisson count with the given expected value. */
export function poissonLowerTail(k: number, expected: number): number {
  if (k < 0) return 0;
  if (expected <= 0) return 1;
  let term = Math.exp(-expected);
  let total = 0;
  for (let i = 0; i <= k; i++) {
    total += term;
    term *= expected / (i + 1);
  }
  return Math.min(1, total);
}

export const round = (value: number, digits = 1) => {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
};
