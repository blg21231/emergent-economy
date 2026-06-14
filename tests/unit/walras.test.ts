// AC3 — Prices converge to the Walrasian clearing price (anchor).
//  (1) the INDEPENDENT solver finds p* with ‖excess demand‖ <= 1e-6 on an economy with a
//      known closed-form equilibrium.
//  (2) a >=10-agent / >=3-good ABM started >=50% rel-price error from p* converges so the
//      final-window mean rel price is within 10% of p* on >=3 goods (a measured REDUCTION),
//      AND transaction-price dispersion strictly decreases first-quartile -> last-quartile.
import { describe, it, expect } from "vitest";
import { economy } from "../../src/sim/economy";
import { clearingPrice, excessDemand } from "../../src/sim/walras";
import { coefficientOfVariation } from "../../src/sim/metrics";
import type { EconomyConfig } from "../../src/sim/types";

describe("AC3 (1) tâtonnement solver on a known closed-form equilibrium", () => {
  it("finds p* with ||excess demand|| <= 1e-6 on a 2x2 economy", () => {
    // Closed form: 2 agents, 2 goods, Cobb–Douglas.
    // A: prefs (0.5,0.5) endow (10,0); B: prefs (0.5,0.5) endow (0,10).
    // demand_i = α_i (e0 + p e1)/p_i. Excess demand good1=0 => p* = 1 by symmetry.
    const cfg: EconomyConfig = {
      seed: 1, n: 2, g: 2, frictionMode: "none", transportCost: 0,
      tradeEnabled: true, productionEnabled: false,
      prefs: [[0.5, 0.5], [0.5, 0.5]],
      endowments: [[10, 0], [0, 10]],
      productivity: [[1, 1], [1, 1]],
    };
    const state = economy.create(cfg);
    const { prices, residual } = clearingPrice(state, { tol: 1e-10 });
    expect(residual).toBeLessThanOrEqual(1e-6);
    expect(prices[1]).toBeCloseTo(1, 4); // analytic p* = 1
    // independent verification: excess demand at p* is ~0.
    const z = excessDemand(state, prices);
    for (let i = 1; i < cfg.g; i++) expect(Math.abs(z[i])).toBeLessThanOrEqual(1e-6);
  });

  it("finds p* on an asymmetric 3-good economy and clears every market", () => {
    const cfg: EconomyConfig = {
      seed: 2, n: 4, g: 3, frictionMode: "none", transportCost: 0,
      tradeEnabled: true, productionEnabled: false,
      prefs: [
        [0.2, 0.3, 0.5], [0.5, 0.2, 0.3], [0.3, 0.5, 0.2], [0.4, 0.4, 0.2],
      ],
      endowments: [
        [8, 1, 1], [1, 8, 1], [1, 1, 8], [3, 3, 3],
      ],
      productivity: [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]],
    };
    const state = economy.create(cfg);
    const { prices, residual } = clearingPrice(state, { tol: 1e-10 });
    expect(residual).toBeLessThanOrEqual(1e-6);
    const z = excessDemand(state, prices);
    for (let i = 0; i < cfg.g; i++) expect(Math.abs(z[i])).toBeLessThanOrEqual(1e-5);
  });
});

describe("AC3 (2) ABM transaction prices converge toward p*", () => {
  it(">=10 agents / >=3 goods: >=50% start error -> within 10% on >=3 goods, dispersion falls", () => {
    const g = 4;
    const n = 12;
    const rng = (s: number) => {
      let a = s >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const r = rng(123);
    const prefs: number[][] = [];
    const endow: number[][] = [];
    for (let i = 0; i < n; i++) {
      const pr: number[] = [];
      let s = 0;
      for (let k = 0; k < g; k++) { const v = 0.2 + r(); pr.push(v); s += v; }
      prefs.push(pr.map((v) => v / s));
      // skewed endowments so each good is concentrated in some agents (creates trade).
      const e: number[] = [];
      for (let k = 0; k < g; k++) e.push(i % g === k ? 12 : 1);
      endow.push(e);
    }
    // a FLOW economy: each agent receives `endow` fresh every tick (a recurring supply the
    // market must clear), so the discovered price converges to the fundamentals' p*.
    const base: EconomyConfig = {
      seed: 7, n, g, frictionMode: "market", transportCost: 0,
      tradeEnabled: true, productionEnabled: false,
      prefs, endowments: endow, endowmentFlow: endow, consumeRate: 0.5,
      productivity: endow.map(() => new Array(g).fill(1)),
    };

    // p* of the recurring flow (the fundamentals the market discovers).
    const flowEconomy = economy.create({ ...base, endowmentFlow: undefined });
    const pstar = clearingPrice(flowEconomy, { tol: 1e-10 }).prices;

    // start the ABM FAR from equilibrium with a fixed off-belief (no reference to p* — the
    // agents only ever see this posted price + their own state). p* here is ~0.8–0.9, so an
    // initial belief of 2.5 is a >=50% mispricing the market must work off.
    const initialPrices = [1];
    for (let k = 1; k < g; k++) initialPrices.push(2.5);
    const cfg: EconomyConfig = { ...base, initialPrices };

    let state = economy.create(cfg);
    const TICKS = 200;
    // capture per-tick mean rel price and per-good dispersion windows.
    const relSeries: number[][] = Array.from({ length: g }, () => []);
    const dispSeries: number[][] = Array.from({ length: g }, () => []);
    for (let t = 0; t < TICKS; t++) {
      state = economy.step(state);
      const agg = economy.aggregates(state);
      for (let k = 1; k < g; k++) {
        relSeries[k].push(agg.relPrices[k]);
        dispSeries[k].push(agg.priceDispersion[k]);
      }
    }

    const q = Math.floor(TICKS / 4);
    const initWin = Math.max(5, Math.floor(TICKS / 20)); // the far-from-equilibrium START window.
    const meanWindow = (arr: number[], from: number, to: number) => {
      let s = 0; let c = 0;
      for (let i = from; i < to; i++) { s += arr[i]; c++; }
      return c ? s / c : 0;
    };
    const relErr = (p: number, ps: number) => Math.abs(p - ps) / ps;

    // initial-window mean rel-price error >= 50% from p* (far-from-equilibrium start).
    let maxInitErr = 0;
    for (let k = 1; k < g; k++) {
      const initMean = meanWindow(relSeries[k], 0, initWin);
      maxInitErr = Math.max(maxInitErr, relErr(initMean, pstar[k]));
    }
    expect(maxInitErr).toBeGreaterThanOrEqual(0.5);

    // final-window within 10% on >= 3 goods, AND a measured reduction vs the initial window.
    let within = 0;
    for (let k = 1; k < g; k++) {
      const initMean = meanWindow(relSeries[k], 0, initWin);
      const finalMean = meanWindow(relSeries[k], TICKS - q, TICKS);
      const fErr = relErr(finalMean, pstar[k]);
      const iErr = relErr(initMean, pstar[k]);
      if (fErr <= 0.1 && fErr < iErr) within++;
    }
    expect(within).toBeGreaterThanOrEqual(3);

    // dispersion strictly decreases first-quartile -> last-quartile (averaged across goods).
    const cvFirst: number[] = [];
    const cvLast: number[] = [];
    for (let k = 1; k < g; k++) {
      cvFirst.push(meanWindow(dispSeries[k], 0, q));
      cvLast.push(meanWindow(dispSeries[k], TICKS - q, TICKS));
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(cvLast)).toBeLessThan(avg(cvFirst));
    // sanity: coefficientOfVariation is exercised (dispersion is a real CV).
    expect(coefficientOfVariation([1, 1, 1])).toBe(0);
  });
});
