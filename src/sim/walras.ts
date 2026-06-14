// INDEPENDENT analytic anchor — Walrasian tâtonnement clearing-price solver.
//
// FIREWALL (AC12): this file is a VALIDATION ANCHOR ONLY. It MUST NOT be imported by the
// agent decision path (economy.ts / production.ts / exchange.ts / money.ts). It reads an
// economy and computes the market-clearing price p* by driving aggregate excess demand to
// zero; the agents never see p*.
import type { EconomyState } from "./types";

export interface ClearingResult {
  /** Clearing price vector (good 0 = 1, numéraire). length G. */
  prices: Float64Array;
  /** ‖excess demand(p*)‖ achieved. */
  residual: number;
  iterations: number;
}

/**
 * Aggregate excess demand for a pure-exchange Cobb–Douglas economy at price vector p.
 * Each agent's wealth w = Σ p_k e_k ; Cobb–Douglas demand for good i = α_i w / p_i.
 * Excess demand z_i = Σ_agents (demand_i − endowment_i).
 */
export function excessDemand(state: EconomyState, prices: Float64Array): Float64Array {
  const g = state.config.g;
  const z = new Float64Array(g);
  for (const a of state.agents) {
    let wealth = 0;
    for (let k = 0; k < g; k++) wealth += prices[k] * a.inventory[k];
    for (let i = 0; i < g; i++) {
      const demand = (a.prefs[i] * wealth) / prices[i];
      z[i] += demand - a.inventory[i];
    }
  }
  return z;
}

function norm(z: Float64Array): number {
  let s = 0;
  for (let i = 0; i < z.length; i++) s += z[i] * z[i];
  return Math.sqrt(s);
}

/**
 * Solve for the clearing price vector via tâtonnement: raise the price of goods in excess
 * demand, lower those in excess supply, with good 0 pinned to the numéraire (=1). By Walras'
 * law, clearing G−1 markets clears the last. Returns p* with ‖z(p*)‖ minimized.
 */
export function clearingPrice(state: EconomyState, opts?: { maxIter?: number; tol?: number }): ClearingResult {
  const g = state.config.g;
  const maxIter = opts?.maxIter ?? 200000;
  const tol = opts?.tol ?? 1e-9;
  const prices = new Float64Array(g).fill(1);
  prices[0] = 1;

  let step = 0.05;
  let prev = Infinity;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const z = excessDemand(state, prices);
    // residual over the non-numéraire goods (good 0 cleared by Walras' law).
    let res = 0;
    for (let i = 1; i < g; i++) res += z[i] * z[i];
    res = Math.sqrt(res);
    if (res <= tol) break;

    // adaptive damping: shrink the step if we overshot (residual rose).
    if (res > prev) step *= 0.5;
    prev = res;

    for (let i = 1; i < g; i++) {
      // multiplicative update keeps prices positive; normalize z by total endowment scale.
      const adj = 1 + step * Math.tanh(z[i]);
      prices[i] *= adj;
      if (prices[i] < 1e-9) prices[i] = 1e-9;
    }
    if (step < 1e-14) break;
  }

  return { prices, residual: norm(excessDemandNonNumeraire(state, prices)), iterations: iter };
}

function excessDemandNonNumeraire(state: EconomyState, prices: Float64Array): Float64Array {
  const z = excessDemand(state, prices);
  const out = new Float64Array(z.length - 1);
  for (let i = 1; i < z.length; i++) out[i - 1] = z[i];
  return out;
}
