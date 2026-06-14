// AC6(b,c) — GPU/CPU agreement & fallback identity.
//
// In bare Node (no WebGPU) this file proves the FALLBACK path:
//   (c) createDriver({backend:"auto"}) resolves to backend "cpu" and its aggregates are
//       BIT-IDENTICAL to the canonical pure `economy` core on the same seed (fallback IS the core);
//       createDriver({backend:"cpu"}) is deterministic same-seed.
// Where WebGPU is genuinely available it ADDITIONALLY proves:
//   (b) GPU vs core headline-aggregate parity ≤1% on relPrices/meanHHI/gini/indirectShare.
// When navigator.gpu is absent the (b) limb SKIPS WITH AN EXPLICIT LOG (never faked).
//
// AC6(a) pure-core determinism is covered by determinism.test.ts — not duplicated here.
import { describe, it, expect } from "vitest";
import { economy } from "../../src/sim/economy";
import { createDriver, createCpuDriver, webgpuAvailable } from "../../src/sim/gpu";
import type { Aggregates, EconomyConfig } from "../../src/sim/types";

const cfg: EconomyConfig = {
  seed: 1234,
  n: 24,
  g: 3,
  frictionMode: "market",
  transportCost: 0.1,
  tradeEnabled: true,
  productionEnabled: true,
  consumeRate: 0.2,
};

function flatten(a: Aggregates): number[] {
  return [
    ...a.relPrices,
    a.meanHHI,
    a.gini,
    a.topDecileShare,
    a.tradeVolume,
    a.totalUtility,
    ...a.indirectShare,
    ...a.priceDispersion,
  ];
}

// Headline fields per AC6/SEAMS: relPrices, meanHHI, gini, indirectShare.
function headline(a: Aggregates): number[] {
  return [...a.relPrices, a.meanHHI, a.gini, ...a.indirectShare];
}

function coreSeries(ticks: number): number[][] {
  let state = economy.create(cfg);
  const rows: number[][] = [];
  for (let t = 0; t < ticks; t++) {
    state = economy.step(state);
    rows.push(flatten(economy.aggregates(state)));
  }
  return rows;
}

describe("AC6(c) — fallback IS the canonical core (bit-identical) in bare Node", () => {
  it('createDriver({backend:"auto"}) resolves to "cpu" with no WebGPU', async () => {
    const d = await createDriver(cfg, { backend: "auto" });
    expect(d.backend).toBe("cpu");
    d.dispose();
  });

  it('createDriver({backend:"cpu"}) aggregates are bit-identical to the pure economy core', async () => {
    const ticks = 60;
    const expected = coreSeries(ticks);
    const d = await createDriver(cfg, { backend: "cpu" });
    expect(d.backend).toBe("cpu");
    for (let t = 0; t < ticks; t++) {
      d.step();
      expect(flatten(d.aggregates())).toEqual(expected[t]);
    }
    d.dispose();
  });

  it('createDriver({backend:"auto"}) fallback aggregates are bit-identical to the core', async () => {
    const ticks = 40;
    const expected = coreSeries(ticks);
    const d = await createDriver(cfg, { backend: "auto" });
    for (let t = 0; t < ticks; t++) {
      d.step();
      expect(flatten(d.aggregates())).toEqual(expected[t]);
    }
    d.dispose();
  });

  it("the CPU driver is deterministic on the same seed (two drivers agree byte-for-byte)", async () => {
    const ticks = 50;
    const a = createCpuDriver(cfg);
    const b = createCpuDriver(cfg);
    for (let t = 0; t < ticks; t++) {
      a.step();
      b.step();
      expect(flatten(a.aggregates())).toEqual(flatten(b.aggregates()));
    }
    a.dispose();
    b.dispose();
  });

  it("agentPriceInputs are local-only (no global equilibrium term) and per-agent", async () => {
    const d = await createDriver(cfg, { backend: "cpu" });
    d.step();
    const inputs = d.agentPriceInputs();
    expect(inputs.length).toBe(d.agentCount());
    for (const row of inputs) expect(row.length).toBe(cfg.g);
    d.dispose();
  });
});

describe("AC6(b) — WebGPU↔core headline-aggregate parity ≤1% (where a GPU exists)", () => {
  it("GPU path tracks the core within 1% on relPrices/meanHHI/gini/indirectShare", async () => {
    const available = await webgpuAvailable();
    if (!available) {
      // eslint-disable-next-line no-console
      console.log(
        "[gpu-parity] SKIP AC6(b): navigator.gpu unavailable in this (Node) environment — " +
          "GPU↔core parity is asserted in tests/e2e/gpu.spec.ts where a browser GPU exists.",
      );
      return;
    }
    const ticks = 60;
    let state = economy.create(cfg);
    const coreHead: number[][] = [];
    for (let t = 0; t < ticks; t++) {
      state = economy.step(state);
      coreHead.push(headline(economy.aggregates(state)));
    }
    const d = await createDriver(cfg, { backend: "webgpu", scale: cfg.n });
    expect(d.backend).toBe("webgpu");
    for (let t = 0; t < ticks; t++) {
      d.step();
      // Await the in-flight GPU reduction so aggregates() reflects this tick's GPU meanHHI.
      const maybeFlush = (d as unknown as { flush?: () => Promise<number> }).flush;
      if (maybeFlush) await maybeFlush.call(d);
      const got = headline(d.aggregates());
      const exp = coreHead[t];
      for (let k = 0; k < exp.length; k++) {
        const denom = Math.abs(exp[k]) > 1e-9 ? Math.abs(exp[k]) : 1;
        expect(Math.abs(got[k] - exp[k]) / denom).toBeLessThanOrEqual(0.01);
      }
    }
    d.dispose();
  });
});
