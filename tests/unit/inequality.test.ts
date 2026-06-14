// AC5 — Inequality emerges from symmetry.
//  (a) Gini exact on hand-worked vectors (equality->0, one-owns-all->(N-1)/N, <=1e-9);
//  (b) from near-symmetric endowments (+-5%) under trade, Gini rises to >=0.25 sustained over
//      the final third + top-decile share rises; a trade-disabled control keeps Gini <=0.05.
import { describe, it, expect } from "vitest";
import { gini, topDecileShare } from "../../src/sim/inequality";
import { economy } from "../../src/sim/economy";
import { makeRng } from "../../src/sim/rng";
import type { EconomyConfig } from "../../src/sim/types";

describe("AC5 (a) Gini correctness on closed-form anchors", () => {
  it("perfect equality -> 0", () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0, 12);
    expect(Math.abs(gini([1, 1, 1, 1, 1, 1]))).toBeLessThanOrEqual(1e-9);
  });

  it("one agent owns all -> (N-1)/N", () => {
    for (const n of [2, 5, 10, 50]) {
      const v = new Array(n).fill(0);
      v[0] = 100;
      expect(Math.abs(gini(v) - (n - 1) / n)).toBeLessThanOrEqual(1e-9);
    }
  });

  it("degenerate inputs are safe (empty / all-zero -> 0)", () => {
    expect(gini([])).toBe(0);
    expect(gini([0, 0, 0])).toBe(0);
    expect(topDecileShare([])).toBe(0);
    expect(topDecileShare([0, 0])).toBe(0);
  });

  it("matches a hand-worked intermediate case", () => {
    // values [1,2,3,4]: mean=2.5, Σ|xi-xj| = 2*(1+2+3+1+2+1)=20; Gini=20/(2*4*10)=0.25.
    expect(Math.abs(gini([1, 2, 3, 4]) - 0.25)).toBeLessThanOrEqual(1e-9);
  });

  it("top-decile share: one-owns-all -> 1, equality -> ~1/ceil(n*0.1)", () => {
    const owns = new Array(20).fill(0);
    owns[0] = 1;
    expect(topDecileShare(owns)).toBeCloseTo(1, 12);
    // 20 equal -> top decile (top 2) share = 2/20 = 0.1.
    expect(topDecileShare(new Array(20).fill(3))).toBeCloseTo(0.1, 12);
  });
});

// near-symmetric endowments (+-5%), symmetric prefs, heterogeneous productivity: under trade,
// comparative advantage drives divergent specialization -> divergent wealth (emergent inequality);
// autarky (same endowments) keeps everyone self-provisioning similarly -> Gini stays low.
function makeCfg(seed: number, tradeEnabled: boolean): EconomyConfig {
  const rng = makeRng(seed);
  const n = 30;
  const g = 3;
  const endowments: number[][] = [];
  const prefs: number[][] = [];
  const productivity: number[][] = [];
  for (let i = 0; i < n; i++) {
    // endowments within +-5% of a common base (5).
    const e: number[] = [];
    for (let k = 0; k < g; k++) e.push(5 * (1 + rng.range(-0.05, 0.05)));
    endowments.push(e);
    // symmetric preferences (identical across agents — everyone wants all goods equally).
    prefs.push([1 / 3, 1 / 3, 1 / 3]);
    // each agent is strong in exactly ONE good, with the SAME total productivity (so autarky
    // self-provisioning gives everyone a similar-value basket — low Gini). But the SUPPLY is
    // asymmetric: many agents can make good 0, few can make good 2. Under trade this makes
    // good 2 scarce and dear, so its few specialists capture outsized terms-of-trade gains
    // and grow rich — emergent, trade-driven inequality from near-symmetric starts.
    const p = [1, 1, 1];
    // skewed assignment over a block of 10: 6 -> good0, 3 -> good1, 1 -> good2 (good 2 scarce).
    // every agent's TOTAL productivity is identical (one good at 5, the rest at 1 => sum 7),
    // so autarky self-provisioning is equal-value; only trade's terms-of-trade create the gap.
    const r = i % 10;
    const strong = r < 6 ? 0 : r < 9 ? 1 : 2;
    p[strong] = 5;
    productivity.push(p);
  }
  return {
    seed, n, g, frictionMode: "market", transportCost: 0,
    tradeEnabled, productionEnabled: true,
    endowments, prefs, productivity, consumeRate: 0.15,
  };
}

describe("AC5 (b) inequality emerges from symmetry — only with trade", () => {
  const TICKS = 240;

  it("trade run: Gini rises to >=0.25 sustained over the final third + top-decile rises", () => {
    let state = economy.create(makeCfg(11, true));
    const giniInit = economy.aggregates(state).gini;
    const topInit = economy.aggregates(state).topDecileShare;

    const giniSeries: number[] = [];
    const topSeries: number[] = [];
    for (let t = 0; t < TICKS; t++) {
      state = economy.step(state);
      const agg = economy.aggregates(state);
      giniSeries.push(agg.gini);
      topSeries.push(agg.topDecileShare);
    }

    // starts near zero (near-symmetric endowments).
    expect(giniInit).toBeLessThan(0.05);

    // sustained >=0.25 over the final third.
    const third = Math.floor(TICKS / 3);
    const finalGini = giniSeries.slice(TICKS - third);
    const minFinal = Math.min(...finalGini);
    expect(minFinal).toBeGreaterThanOrEqual(0.25);

    // heavier tail: final top-decile share strictly above initial.
    const finalTop = topSeries[topSeries.length - 1];
    expect(finalTop).toBeGreaterThan(topInit + 1e-6);
  });

  it("trade-disabled control from the SAME endowments keeps Gini <=0.05", () => {
    let state = economy.create(makeCfg(11, false));
    let maxGini = 0;
    for (let t = 0; t < TICKS; t++) {
      state = economy.step(state);
      maxGini = Math.max(maxGini, economy.aggregates(state).gini);
    }
    expect(maxGini).toBeLessThanOrEqual(0.05);
  });
});
