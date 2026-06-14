// AC6(a) — Determinism: same seed ⇒ bit-identical macro time series.
// Two runs with the same seed/config produce identical {relPrices, meanHHI, gini,
// indirectShare} arrays over N steps (exact array/number equality).
import { describe, it, expect } from "vitest";
import { economy } from "../../src/sim/economy";
import type { Aggregates, EconomyConfig } from "../../src/sim/types";

function macroSeries(cfg: EconomyConfig, ticks: number): number[][] {
  let state = economy.create(cfg);
  const rows: number[][] = [];
  for (let t = 0; t < ticks; t++) {
    state = economy.step(state);
    const a: Aggregates = economy.aggregates(state);
    rows.push([
      ...a.relPrices,
      a.meanHHI,
      a.gini,
      a.topDecileShare,
      a.tradeVolume,
      a.totalUtility,
      ...a.indirectShare,
      ...a.priceDispersion,
    ]);
  }
  return rows;
}

const configs: Record<string, EconomyConfig> = {
  market: {
    seed: 99, n: 20, g: 3, frictionMode: "market", transportCost: 0.1,
    tradeEnabled: true, productionEnabled: true, consumeRate: 0.2,
  },
  money: {
    seed: 77, n: 30, g: 3, frictionMode: "money", transportCost: 0,
    tradeEnabled: true, productionEnabled: true, consumeRate: 0.2,
    prefs: Array.from({ length: 30 }, (_, i) => {
      const p = [0, 0, 0];
      p[(i % 3 + 1) % 3] = 1;
      return p;
    }),
    productivity: Array.from({ length: 30 }, (_, i) => {
      const p = [0.2, 0.2, 0.2];
      p[i % 3] = 4;
      return p;
    }),
    endowments: Array.from({ length: 30 }, () => [1, 1, 1]),
  },
};

describe("AC6(a) seeded determinism — bit-identical macro time series", () => {
  for (const [name, cfg] of Object.entries(configs)) {
    it(`frictionMode=${name}: two same-seed runs are byte-identical`, () => {
      const a = macroSeries(cfg, 80);
      const b = macroSeries(cfg, 80);
      expect(a.length).toBe(b.length);
      for (let t = 0; t < a.length; t++) {
        expect(a[t]).toEqual(b[t]); // strict deep equality of every aggregate, every tick
      }
    });
  }

  it("a different seed produces a different trajectory (RNG actually wired)", () => {
    const a = macroSeries({ ...configs.market, seed: 1 }, 40);
    const b = macroSeries({ ...configs.market, seed: 2 }, 40);
    expect(a).not.toEqual(b);
  });
});
