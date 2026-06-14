// Coverage + correctness for the shared measurement helpers.
import { describe, it, expect } from "vitest";
import {
  cobbDouglasUtility, hhi, coefficientOfVariation, wealth, meanRelPrices, indirectShareByGood,
} from "../../src/sim/metrics";
import { economy } from "../../src/sim/economy";
import type { Agent, EconomyConfig } from "../../src/sim/types";

describe("metrics helpers", () => {
  it("cobbDouglasUtility = Π x_i^α_i", () => {
    expect(cobbDouglasUtility(Float64Array.from([4, 9]), Float64Array.from([0.5, 0.5]))).toBeCloseTo(6, 9);
  });

  it("hhi: uniform shares -> 1/G; full concentration -> 1", () => {
    expect(hhi(Float64Array.from([1 / 3, 1 / 3, 1 / 3]))).toBeCloseTo(1 / 3, 9);
    expect(hhi(Float64Array.from([1, 0, 0]))).toBeCloseTo(1, 9);
  });

  it("coefficientOfVariation: constant -> 0; <2 samples -> 0; zero-mean -> 0", () => {
    expect(coefficientOfVariation([5, 5, 5])).toBe(0);
    expect(coefficientOfVariation([7])).toBe(0);
    expect(coefficientOfVariation([])).toBe(0);
    expect(coefficientOfVariation([-1, 1])).toBe(0); // mean 0
    expect(coefficientOfVariation([2, 4])).toBeGreaterThan(0);
  });

  it("wealth = Σ inventory_i · relPrice_i", () => {
    const a = { inventory: Float64Array.from([2, 3]) } as unknown as Agent;
    expect(wealth(a, Float64Array.from([1, 2]))).toBeCloseTo(8, 9);
  });

  it("meanRelPrices on a fresh economy (no trades) defaults goods to 1", () => {
    const cfg: EconomyConfig = {
      seed: 1, n: 4, g: 3, frictionMode: "market", transportCost: 0,
      tradeEnabled: true, productionEnabled: true,
    };
    const rel = meanRelPrices(economy.create(cfg), 12);
    expect(rel[0]).toBe(1);
    expect(rel[1]).toBe(1);
    expect(rel[2]).toBe(1);
  });

  it("indirectShareByGood: re-trade fraction per good", () => {
    const trades = [
      { good: 1, qty: 4, indirect: true },
      { good: 1, qty: 4, indirect: false },
      { good: 2, qty: 5, indirect: false },
    ];
    const s = indirectShareByGood(trades, 3);
    expect(s[0]).toBe(0);
    expect(s[1]).toBeCloseTo(0.5, 9);
    expect(s[2]).toBe(0);
  });
});
