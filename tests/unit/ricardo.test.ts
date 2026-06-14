// AC2 — Comparative advantage & gains from trade (Ricardo, numeric).
// 2 agents / 2 goods, agent 0 absolutely better at BOTH but relative productivity differs.
//  (a) trade > autarky in total output AND total utility (gains from trade > 0);
//  (b) each agent specializes toward its COMPARATIVE-advantage good — production-HHI rises
//      >=0.15 absolute vs autarky AND the most-grown good is the comparative-advantage good
//      (absolute-advantage specialization FAILS this);
//  (c) emergent avg relative price lands within the autarky-relative-price bound.
import { describe, it, expect } from "vitest";
import { economy } from "../../src/sim/economy";
import { hhi, cobbDouglasUtility } from "../../src/sim/metrics";
import type { EconomyConfig } from "../../src/sim/types";

// agent 0: absolutely better at both. productivity[0] = [4, 2], agent 1 = [1, 1].
// relative productivity (self/other): agent0 -> [4, 2]; agent1 -> [1/4, 1/2].
// comparative advantage: agent0's relative edge is largest in good0 (4 > 2) -> good0.
//                        agent1's relative edge is largest in good1 (1/2 > 1/4) -> good1.
const PROD = [
  [4, 2],
  [1, 1],
];
const CA_GOOD = [0, 1]; // comparative-advantage good per agent.

function makeCfg(tradeEnabled: boolean): EconomyConfig {
  return {
    seed: 42,
    n: 2,
    g: 2,
    frictionMode: "market",
    transportCost: 0,
    tradeEnabled,
    productionEnabled: true,
    productivity: PROD,
    // both like both goods (so both want to trade); a good-0-weighted demand keeps the
    // emergent price strictly interior to the autarky bound (1,2) so BOTH agents specialize.
    prefs: [
      [0.7, 0.3],
      [0.7, 0.3],
    ],
    endowments: [
      [1, 1],
      [1, 1],
    ],
    // consume post-trade holdings so production tracks current prices (no stock lock-in).
    consumeRate: 0.3,
  };
}

function totalOutput(state: ReturnType<typeof economy.create>): number {
  let t = 0;
  for (const a of state.agents) for (let i = 0; i < a.inventory.length; i++) t += a.inventory[i];
  return t;
}

function totalUtility(state: ReturnType<typeof economy.create>): number {
  let u = 0;
  for (const a of state.agents) u += cobbDouglasUtility(a.inventory, a.prefs);
  return u;
}

describe("AC2 comparative advantage & gains from trade", () => {
  const TICKS = 300;

  it("(a) trade strictly beats autarky in output and utility", () => {
    const autarky = economy.run(economy.create(makeCfg(false)), TICKS);
    const trade = economy.run(economy.create(makeCfg(true)), TICKS);
    expect(totalOutput(trade)).toBeGreaterThan(totalOutput(autarky) + 1e-6);
    expect(totalUtility(trade)).toBeGreaterThan(totalUtility(autarky) + 1e-6);
  });

  it("(b) each agent specializes toward its COMPARATIVE-advantage good, HHI rises >=0.15", () => {
    const autarky = economy.run(economy.create(makeCfg(false)), TICKS);
    const trade = economy.run(economy.create(makeCfg(true)), TICKS);

    for (let k = 0; k < 2; k++) {
      const hAut = hhi(autarky.agents[k].production);
      const hTr = hhi(trade.agents[k].production);
      expect(hTr - hAut).toBeGreaterThanOrEqual(0.15);

      // most-grown good (largest increase in production share) is the comparative-advantage good.
      let best = 0;
      let bestDelta = -Infinity;
      for (let g = 0; g < 2; g++) {
        const d = trade.agents[k].production[g] - autarky.agents[k].production[g];
        if (d > bestDelta) {
          bestDelta = d;
          best = g;
        }
      }
      expect(best).toBe(CA_GOOD[k]);
    }
  });

  it("(c) emergent avg relative price lands within the autarky-price bound", () => {
    // autarky relative price of good1 in good0 for each agent = opportunity cost = prod[0]/prod[1].
    // agent0: 4/2 = 2 ; agent1: 1/1 = 1. bound = (1, 2).
    const lo = Math.min(PROD[0][0] / PROD[0][1], PROD[1][0] / PROD[1][1]);
    const hi = Math.max(PROD[0][0] / PROD[0][1], PROD[1][0] / PROD[1][1]);

    const trade = economy.run(economy.create(makeCfg(true)), TICKS);
    const agg = economy.aggregates(trade);
    const p1 = agg.relPrices[1];
    expect(p1).toBeGreaterThan(lo);
    expect(p1).toBeLessThan(hi);
  });
});
