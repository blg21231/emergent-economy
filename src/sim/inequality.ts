// Wealth-distribution measurement (AC5). Pure, no DOM/GPU, no walras import.
// Canonical Gini + tail-share helpers; mutation target M5 (the normalization must bite).

/**
 * Gini coefficient of a non-negative wealth vector.
 *  - perfect equality -> 0
 *  - one agent owns all -> (N-1)/N
 * Gini = Σ_i Σ_j |x_i − x_j| / (2 N Σx)  (the relative mean absolute difference / 2).
 */
export function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  if (sum <= 0) return 0;
  let absDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      absDiff += Math.abs(values[i] - values[j]);
    }
  }
  // normalization by 2 N Σx is what makes equality->0 and one-owns-all->(N-1)/N.
  return absDiff / (2 * n * sum);
}

/** Top-decile (top 10%) share of total wealth. */
export function topDecileShare(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  if (sum <= 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil(n * 0.1));
  let top = 0;
  for (let i = 0; i < k; i++) top += sorted[i];
  return top / sum;
}
