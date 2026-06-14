// Kiyotaki–Wright money measurement + acceptance policy (AC4). Part of the agent DECISION
// path, so it MUST NOT import walras.ts or any equilibrium value (firewall AC12).
//
// A commodity becomes "money" when agents accept it *indirectly* — neither to consume nor
// produce, but to re-trade. Marketability is self-reinforcing: an agent is more willing to
// accept a good the more it observes that good already changing hands locally. From a small
// asymmetry (one good more available) this tips so one good's INDIRECT-EXCHANGE SHARE
// dominates — emergent commodity money.
import type { EconomyState, Trade } from "./types";

/** Per-good indirect-exchange share over a window of ticks (mean of per-tick shares). */
export function indirectShareWindow(snaps: { lastTrades: Trade[] }[], g: number): Float64Array {
  const indirect = new Float64Array(g);
  const total = new Float64Array(g);
  for (const s of snaps) {
    for (const t of s.lastTrades) {
      total[t.good] += t.qty;
      if (t.indirect) indirect[t.good] += t.qty;
    }
  }
  const out = new Float64Array(g);
  for (let i = 0; i < g; i++) out[i] = total[i] > 0 ? indirect[i] / total[i] : 0;
  return out;
}

/**
 * Separation statistic: the ratio of the top good's indirect-share to the MEDIAN good's.
 * ratio < 1.2 ≈ near-uniform (no money); ratio >= 3 ≈ one good dominates (money emerged).
 */
export function medianIndirectSeparation(shares: Float64Array): { ratio: number; topGood: number } {
  const g = shares.length;
  let topGood = 0;
  let top = -Infinity;
  for (let i = 0; i < g; i++) {
    if (shares[i] > top) {
      top = shares[i];
      topGood = i;
    }
  }
  const sorted = [...shares].sort((a, b) => a - b);
  const mid = Math.floor(g / 2);
  const median = g % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const ratio = median > 1e-9 ? top / median : top > 1e-9 ? Infinity : 0;
  return { ratio, topGood };
}

/**
 * Marketability of each good from local observation: a recency-weighted count of how much of
 * each good has recently changed hands. This is the belief that drives indirect acceptance —
 * derived only from observed local trades (AC12-safe), never from an equilibrium value.
 * Stored on the state so it persists/compounds across ticks.
 */
export function updateMarketability(state: EconomyState): Float64Array {
  const g = state.config.g;
  if (!state.marketability || state.marketability.length !== g) {
    state.marketability = new Float64Array(g).fill(1);
  }
  const m = state.marketability;
  const flow = new Float64Array(g);
  for (const t of state.lastTrades) flow[t.good] += t.qty;
  const decay = 0.92;
  for (let i = 0; i < g; i++) m[i] = decay * m[i] + (1 - decay) * flow[i];
  return m;
}
