// AC12 — the emergence firewall: anchors validate, never drive.
//  (a) ARCHITECTURE: the agent-decision modules (economy/production/exchange/money + their
//      transitive sim imports) do NOT import walras.ts (the analytic anchor solver), directly
//      or transitively.
//  (b) BEHAVIORAL: run the seeded ABM and hash its transaction-price trajectory; call walras()
//      on a DIFFERENT economy in between; re-run the same seeded ABM -> trajectories BIT-
//      IDENTICAL. If feeding a different p* could change the ABM, the anchor is driving it -> FAIL.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { economy } from "../../src/sim/economy";
import { createCpuDriver } from "../../src/sim/gpu/index";
import { clearingPrice } from "../../src/sim/walras";
import type { EconomyConfig, EconomyState } from "../../src/sim/types";

const here = dirname(fileURLToPath(import.meta.url));
const simDir = resolve(here, "../../src/sim");

// the decision path (must be walras-free) and everything it pulls in.
const DECISION_MODULES = ["economy.ts", "production.ts", "exchange.ts", "money.ts", "metrics.ts", "inequality.ts", "rng.ts", "types.ts"];

function importsOf(file: string): string[] {
  const src = readFileSync(resolve(simDir, file), "utf8");
  const out: string[] = [];
  const re = /(?:import|export)[^;]*?from\s+["'](\.[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let spec = m[1].replace(/^\.\//, "");
    if (!spec.endsWith(".ts")) spec += ".ts";
    out.push(spec);
  }
  return out;
}

describe("AC12 (a) architecture: decision path never imports the anchor solver", () => {
  it("no decision module imports walras.ts (directly or transitively)", () => {
    // walk the import closure of every decision module; assert walras never appears.
    const seen = new Set<string>();
    const queue = [...DECISION_MODULES];
    while (queue.length) {
      const f = queue.shift()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const dep of importsOf(f)) {
        expect(dep).not.toBe("walras.ts");
        if (!seen.has(dep)) queue.push(dep);
      }
    }
    // sanity: we actually traversed the graph (not a no-op).
    expect(seen.has("exchange.ts")).toBe(true);
    expect(seen.has("walras.ts")).toBe(false);
  });
});

function priceTrajectoryHash(cfg: EconomyConfig, ticks: number): string {
  let state: EconomyState = economy.create(cfg);
  const parts: string[] = [];
  for (let t = 0; t < ticks; t++) {
    state = economy.step(state);
    for (const tr of state.lastTrades) {
      parts.push(`${tr.good}:${tr.price.toExponential(15)}:${tr.qty.toExponential(15)}`);
    }
    parts.push("|");
  }
  return parts.join(",");
}

describe("AC12 (b) behavioral firewall: perturbed p* cannot move the ABM", () => {
  it("calling walras() on a DIFFERENT economy between runs leaves the trajectory bit-identical", () => {
    const cfg: EconomyConfig = {
      seed: 31, n: 16, g: 3, frictionMode: "market", transportCost: 0.05,
      tradeEnabled: true, productionEnabled: true, consumeRate: 0.2,
      initialPrices: [1, 2.0, 0.5],
    };

    const before = priceTrajectoryHash(cfg, 60);

    // feed the analytic solver a COMPLETELY different economy's clearing price — a value the
    // agents must never see. If the anchor were driving the agents, this would shift the run.
    const other: EconomyConfig = {
      seed: 999, n: 24, g: 3, frictionMode: "none", transportCost: 0,
      tradeEnabled: true, productionEnabled: false,
      prefs: Array.from({ length: 24 }, () => [0.5, 0.3, 0.2]),
      endowments: Array.from({ length: 24 }, (_, i) => [i + 1, 24 - i, 5]),
      productivity: Array.from({ length: 24 }, () => [1, 1, 1]),
    };
    const pStarPrime = clearingPrice(economy.create(other), { tol: 1e-12 });
    expect(pStarPrime.residual).toBeLessThanOrEqual(1e-6); // the anchor really ran

    const after = priceTrajectoryHash(cfg, 60);
    expect(after).toBe(before); // BIT-IDENTICAL — the anchor cannot reach the agents.
  });
});

describe("AC12 (c) agent price inputs are local-history-derived, not the equilibrium p*", () => {
  it("each agent's price inputs equal the realized local relPrices and differ from the Walrasian p* far from equilibrium", () => {
    // Start FAR from equilibrium so the realized local prices are demonstrably NOT yet p*.
    const cfg: EconomyConfig = {
      seed: 7, n: 12, g: 3, frictionMode: "market", transportCost: 0,
      tradeEnabled: true, productionEnabled: true, consumeRate: 0.2,
      initialPrices: [1, 3.0, 0.4],
    };
    const pStar = clearingPrice(economy.create(cfg), { tol: 1e-12 }).prices;

    const driver = createCpuDriver(cfg);
    for (let t = 0; t < 8; t++) driver.step(); // only a few ticks: still far from p*
    const inputs = driver.agentPriceInputs();
    const rel = driver.aggregates().relPrices;

    // (c1) every agent's inputs are exactly the realized local relPrices (no hidden equilibrium term).
    for (const row of inputs) {
      for (let i = 0; i < rel.length; i++) expect(row[i]).toBeCloseTo(rel[i], 12);
    }
    // (c2) those local inputs are NOT the equilibrium p* (proving they're local history, not the anchor):
    //      at least one non-numéraire good's local price is >5% off p* this early in the run.
    let differs = false;
    for (let i = 1; i < rel.length; i++) {
      if (Math.abs(rel[i] - pStar[i]) / Math.max(pStar[i], 1e-9) > 0.05) differs = true;
    }
    expect(differs, `local relPrices=${[...rel]} vs p*=${[...pStar]}`).toBe(true);
    driver.dispose();
  });
});
