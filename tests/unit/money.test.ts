// AC4 — Money emerges (Kiyotaki–Wright).
// >=3 goods, asymmetric want/production, frictionMode "money", no designated money:
//  - exactly ONE good's indirect-exchange share goes from near-uniform (top < 1.2x median at
//    the first quartile) to dominate (top >= 3x median, sustained over the final third);
//  - money-regime trade volume >= 20% > barter on the same seed, welfare no lower;
//  - "none" negative control: no good's indirect-share exceeds 1.5x median.
import { describe, it, expect } from "vitest";
import { economy } from "../../src/sim/economy";
import { medianIndirectSeparation, indirectShareWindow } from "../../src/sim/money";
import type { EconomyConfig, EconomyState } from "../../src/sim/types";

// Kiyotaki–Wright ring (SYMMETRIC): agent i produces good i%g, consumes good (i+1)%g, in equal
// thirds. No good has any structural advantage, so the start is near-uniform; money emerges by
// pure symmetry-breaking — the marketability feedback (a good observed re-trading is accepted
// more, compounding) tips ONE good into the medium. Double coincidence is impossible on the ring
// (the agent who makes what you want never wants what you make), so trade REQUIRES a medium.
function makeCfg(seed: number, mode: EconomyConfig["frictionMode"]): EconomyConfig {
  const n = 60;
  const g = 3;
  const prefs: number[][] = [];
  const productivity: number[][] = [];
  const endowments: number[][] = [];
  for (let i = 0; i < n; i++) {
    const prod = i % g;
    const consume = (prod + 1) % g; // wants the NEXT good on the ring -> no double coincidence.
    const pr = new Array(g).fill(0.0);
    pr[consume] = 1; // consumes only its target good (asymmetric wants).
    prefs.push(pr);
    const pv = new Array(g).fill(0.2);
    pv[prod] = 4; // produces its own good.
    productivity.push(pv);
    endowments.push(new Array(g).fill(1));
  }
  return {
    seed, n, g, frictionMode: mode, transportCost: 0,
    tradeEnabled: true, productionEnabled: true,
    prefs, productivity, endowments, consumeRate: 0.2,
  };
}

function runCollect(cfg: EconomyConfig, ticks: number): EconomyState[] {
  let s = economy.create(cfg);
  const snaps: EconomyState[] = [];
  for (let t = 0; t < ticks; t++) {
    s = economy.step(s);
    snaps.push({ ...s, lastTrades: [...s.lastTrades] });
  }
  return snaps;
}

describe("AC4 money emergence (Kiyotaki–Wright)", () => {
  const TICKS = 180;

  it("exactly one good's indirect-share separates: <1.2x median early -> >=3x median sustained", () => {
    const snaps = runCollect(makeCfg(5, "money"), TICKS);
    const g = snaps[0].config.g;

    // first-quartile indirect shares per good (near-uniform start).
    const q = Math.floor(TICKS / 4);
    const early = indirectShareWindow(snaps.slice(0, q), g);
    const earlySep = medianIndirectSeparation(early);
    expect(earlySep.ratio).toBeLessThan(1.2);

    // final-third indirect shares (one good dominates).
    const third = Math.floor(TICKS / 3);
    const late = indirectShareWindow(snaps.slice(TICKS - third), g);
    const lateSep = medianIndirectSeparation(late);
    expect(lateSep.ratio).toBeGreaterThanOrEqual(3);

    // exactly ONE good is the dominant medium (the top must stand clearly above the rest).
    const sorted = [...late].sort((a, b) => b - a);
    expect(sorted[0]).toBeGreaterThan(sorted[1] * 2.5);
  });

  it("money-regime volume >= 20% above barter on the same seed, welfare no lower", () => {
    const moneySnaps = runCollect(makeCfg(5, "money"), TICKS);
    const barterSnaps = runCollect(makeCfg(5, "barter"), TICKS);

    const vol = (snaps: EconomyState[]) => {
      let v = 0;
      const third = Math.floor(snaps.length / 3);
      for (const s of snaps.slice(snaps.length - third)) {
        for (const t of s.lastTrades) v += t.price * t.qty;
      }
      return v;
    };
    const welfare = (snaps: EconomyState[]) =>
      economy.aggregates(snaps[snaps.length - 1]).totalUtility;

    const moneyVol = vol(moneySnaps);
    const barterVol = vol(barterSnaps);
    expect(moneyVol).toBeGreaterThanOrEqual(barterVol * 1.2);
    expect(welfare(moneySnaps)).toBeGreaterThanOrEqual(welfare(barterSnaps) - 1e-9);
  });

  it("no-friction control (frictionMode none): no good's indirect-share exceeds 1.5x median", () => {
    const snaps = runCollect(makeCfg(5, "none"), TICKS);
    const g = snaps[0].config.g;
    const third = Math.floor(TICKS / 3);
    const late = indirectShareWindow(snaps.slice(TICKS - third), g);
    const sep = medianIndirectSeparation(late);
    expect(sep.ratio).toBeLessThan(1.5);
  });
});
