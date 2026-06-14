// Pure measurement helpers — no DOM/GPU, no walras import (firewall AC12).
// These are the single source the Aggregates (types.ts) are built from.
import type { Agent, EconomyState } from "./types";

// Gini + tail share live in inequality.ts (the canonical module / mutation target M5);
// re-export so aggregates and the renderer have one import surface.
export { gini, topDecileShare } from "./inequality";

/** Cobb–Douglas utility U = Π x_i^α_i (prefs sum to 1). */
export function cobbDouglasUtility(inv: Float64Array, prefs: Float64Array): number {
  let u = 1;
  for (let i = 0; i < inv.length; i++) {
    u *= Math.pow(Math.max(inv[i], 1e-12), prefs[i]);
  }
  return u;
}

/** Herfindahl index of a share vector (sums of squares); 1/G (uniform) .. 1 (full concentration). */
export function hhi(shares: Float64Array): number {
  let h = 0;
  for (let i = 0; i < shares.length; i++) h += shares[i] * shares[i];
  return h;
}

/** Coefficient of variation (std/mean) of a sample; 0 when fewer than 2 points or zero mean. */
export function coefficientOfVariation(samples: number[]): number {
  const n = samples.length;
  if (n < 2) return 0;
  let mean = 0;
  for (const s of samples) mean += s;
  mean /= n;
  if (mean === 0) return 0;
  let varSum = 0;
  for (const s of samples) varSum += (s - mean) * (s - mean);
  const sd = Math.sqrt(varSum / n);
  return sd / Math.abs(mean);
}

/** Numéraire-valued wealth of an agent given relative prices (good 0 = 1). */
export function wealth(agent: Agent, relPrices: Float64Array): number {
  let w = 0;
  for (let i = 0; i < agent.inventory.length; i++) {
    w += agent.inventory[i] * relPrices[i];
  }
  return w;
}

/** Mean transaction relative price per good from price history (good 0 pinned to 1). */
export function meanRelPrices(state: EconomyState, window: number): Float64Array {
  const g = state.config.g;
  const out = new Float64Array(g);
  out[0] = 1;
  for (let i = 1; i < g; i++) {
    const hist = state.priceHistory[i];
    if (!hist || hist.length === 0) {
      out[i] = 1;
      continue;
    }
    const start = Math.max(0, hist.length - window);
    let sum = 0;
    let count = 0;
    for (let k = start; k < hist.length; k++) {
      sum += hist[k];
      count++;
    }
    out[i] = count > 0 ? sum / count : 1;
  }
  return out;
}

/** Per-good indirect-exchange share: fraction of acquisitions of that good that were re-trade (indirect). */
export function indirectShareByGood(
  trades: { good: number; qty: number; indirect: boolean }[],
  g: number,
): Float64Array {
  const total = new Float64Array(g);
  const indirect = new Float64Array(g);
  for (const t of trades) {
    total[t.good] += t.qty;
    if (t.indirect) indirect[t.good] += t.qty;
  }
  const out = new Float64Array(g);
  for (let i = 0; i < g; i++) out[i] = total[i] > 0 ? indirect[i] / total[i] : 0;
  return out;
}
