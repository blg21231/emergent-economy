// AC1 — Pure-exchange convergence (Edgeworth box, theory anchor).
// 2-agent / 2-good pure-exchange (no production), frictionMode "none" and "market":
// repeated local trading converges to the contract curve (MRS gap <=2%), conserves
// goods each tick (<=1e-9), and weakly Pareto-improves (no agent below endowment utility).
import { describe, it, expect } from "vitest";
import { makeRng } from "../../src/sim/rng";
import { economy } from "../../src/sim/economy";
import type { EconomyConfig, EconomyState, FrictionMode } from "../../src/sim/types";

// Cobb–Douglas utility for an agent's inventory.
function utility(inv: Float64Array, prefs: Float64Array): number {
  let u = 1;
  for (let i = 0; i < inv.length; i++) u *= Math.pow(Math.max(inv[i], 1e-12), prefs[i]);
  return u;
}

// MRS of good 1 in terms of good 0 = (dU/dx1)/(dU/dx0) = (a1/x1)/(a0/x0) = a1*x0/(a0*x1).
function mrs(inv: Float64Array, prefs: Float64Array): number {
  return (prefs[1] * inv[0]) / (prefs[0] * inv[1]);
}

function totalGoods(state: EconomyState): number[] {
  const g = state.config.g;
  const tot = new Array(g).fill(0);
  for (const a of state.agents) for (let i = 0; i < g; i++) tot[i] += a.inventory[i];
  return tot;
}

function buildEconomy(seed: number, mode: FrictionMode): EconomyConfig {
  const rng = makeRng(seed);
  // distinct Cobb–Douglas prefs (each summing to 1) and distinct endowments.
  const a0 = rng.range(0.25, 0.75);
  const b0 = rng.range(0.25, 0.75);
  return {
    seed,
    n: 2,
    g: 2,
    frictionMode: mode,
    transportCost: 0,
    tradeEnabled: true,
    productionEnabled: false,
    prefs: [
      [a0, 1 - a0],
      [b0, 1 - b0],
    ],
    endowments: [
      [rng.range(1, 10), rng.range(1, 10)],
      [rng.range(1, 10), rng.range(1, 10)],
    ],
    productivity: [
      [1, 1],
      [1, 1],
    ],
  };
}

for (const mode of ["none", "market"] as FrictionMode[]) {
  describe(`AC1 pure-exchange convergence (frictionMode=${mode})`, () => {
    it("converges to the contract curve (MRS gap <=2%) over >=20 random 2x2 economies", () => {
      for (let seed = 1; seed <= 22; seed++) {
        const cfg = buildEconomy(seed, mode);
        let state = economy.create(cfg);

        const endowmentUtil = state.agents.map((a) =>
          utility(a.inventory, a.prefs),
        );
        const initialTotals = totalGoods(state);

        // conservation must hold every tick, not just at the end. The Marshallian "market"
        // mode discovers the price by tâtonnement over the run, so allow enough ticks for the
        // fixed pool to settle onto the contract curve; "none" reaches it in one tick.
        const ticks = mode === "market" ? 220 : 60;
        for (let t = 0; t < ticks; t++) {
          state = economy.step(state);
          const tot = totalGoods(state);
          for (let i = 0; i < cfg.g; i++) {
            expect(Math.abs(tot[i] - initialTotals[i])).toBeLessThanOrEqual(1e-9);
          }
        }

        const mrsA = mrs(state.agents[0].inventory, state.agents[0].prefs);
        const mrsB = mrs(state.agents[1].inventory, state.agents[1].prefs);
        const gap = Math.abs(mrsA - mrsB) / ((mrsA + mrsB) / 2);
        expect(gap).toBeLessThanOrEqual(0.02);

        // weak Pareto improvement: neither agent below endowment utility.
        for (let k = 0; k < 2; k++) {
          const u = utility(state.agents[k].inventory, state.agents[k].prefs);
          expect(u).toBeGreaterThanOrEqual(endowmentUtil[k] - 1e-9);
        }
      }
    });

    it("strictly improves at least one agent when endowments are off the contract curve", () => {
      const cfg = buildEconomy(7, mode);
      let state = economy.create(cfg);
      const u0 = state.agents.map((a) => utility(a.inventory, a.prefs));
      state = economy.run(state, mode === "market" ? 220 : 60);
      const u1 = state.agents.map((a) => utility(a.inventory, a.prefs));
      const gained = u1.some((u, k) => u > u0[k] + 1e-6);
      expect(gained).toBe(true);
    });
  });
}
