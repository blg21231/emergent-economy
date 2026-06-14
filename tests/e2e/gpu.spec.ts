// AC7 (GPU-on limb) + AC6(b) in a real browser.
//
// Launches the app; if navigator.gpu resolves a device, it builds a WebGPU driver via the real
// driver factory and asserts:
//   AC7  — ≥1e5 agents step at ≥10 simulated ticks/sec (recorded);
//   AC6b — GPU↔core headline-aggregate parity ≤1% (relPrices, meanHHI, gini, indirectShare).
// If WebGPU is unavailable in this headless env, it SKIPS WITH AN EXPLICIT LOG — the WebGPU-OFF
// fallback-boots limb is owned by workstream D's journey spec (which carries the CI teeth).
//
// Playwright is configured with ANGLE + --enable-unsafe-webgpu, BUT headless CI only exposes a
// SwiftShader (software) adapter, on which WebGPU *compute* wedges the page event loop — so the
// driver's detection rejects software adapters and this spec skips with a log there. To exercise
// the GPU-on limb on a real machine with a hardware GPU, run with EE_WEBGPU_E2E=1 (which sets the
// EE_FORCE_WEBGPU override in-page to bypass the software-adapter rejection). Never faked.
import { test, expect } from "@playwright/test";

const FORCE = process.env.EE_WEBGPU_E2E === "1";

test("AC7/AC6b — WebGPU 1e5-agent scale + GPU↔core parity (skips with log if no GPU)", async ({
  page,
}) => {
  // Apply the human-opt-in override before any app code runs (real-GPU machines only).
  if (FORCE) {
    await page.addInitScript(() => {
      (globalThis as { EE_FORCE_WEBGPU?: boolean }).EE_FORCE_WEBGPU = true;
    });
  }
  await page.goto("/");

  // Decide the GPU-on vs skip path FIRST (doesn't depend on the app being fully booted) so a
  // GPU-less / software-adapter env skips immediately. webgpuAvailable() inspects adapter metadata
  // only (no compute submitted) so it is fast and never wedges — and it rejects SwiftShader.
  // Detect a usable (hardware) WebGPU adapter via in-page navigator.gpu ONLY — do NOT import a
  // /src/* source path here (it 404s under `vite preview`, the production harness this suite runs
  // against). Mirrors the driver's software-adapter rejection so the skip decision matches runtime.
  const gpuOk = await page.evaluate(async (force) => {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) return false;
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return false;
      if (force) return true;
      const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
      const sig = info ? `${info.vendor ?? ""} ${info.architecture ?? ""} ${info.description ?? ""}` : "";
      if (/swiftshader|software|llvmpipe|microsoft basic/i.test(sig)) return false;
      return (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter !== true;
    } catch {
      return false;
    }
  }, FORCE);

  if (!gpuOk) {
    // eslint-disable-next-line no-console
    console.log(
      "[gpu.spec] SKIP AC7 GPU-on / AC6b: no hardware WebGPU adapter in this env (headless CI " +
        "exposes only SwiftShader, on which compute wedges). The WebGPU-OFF fallback-boots limb " +
        "(the CI teeth) is owned by workstream D's journey spec. Run EE_WEBGPU_E2E=1 on a real GPU.",
    );
    test.skip(true, "Hardware WebGPU unavailable in this environment");
    return;
  }

  // GPU is present — the app must have booted and installed the testability hook (workstream D).
  await page.waitForFunction(() => !!window.__ECON__, { timeout: 30_000 });

  // Build a real WebGPU driver from the app's own module graph (dev-served source path), step a
  // ≥1e5-agent population, and measure ticks/sec + GPU↔core headline parity ≤1%.
  const result = await page.evaluate(async () => {
    // Vite dev-served runtime paths (resolved by the browser, not by tsc) — held in vars so the
    // TS compiler doesn't try to resolve them as module specifiers.
    const gpuPath = "/src/sim/gpu/index.ts";
    const corePath = "/src/sim/economy.ts";
    const mod = (await import(/* @vite-ignore */ gpuPath)) as typeof import("../../src/sim/gpu");
    const core = (await import(/* @vite-ignore */ corePath)) as typeof import("../../src/sim/economy");
    const cfg = {
      seed: 1234,
      n: 24,
      g: 3,
      frictionMode: "market" as const,
      transportCost: 0.1,
      tradeEnabled: true,
      productionEnabled: true,
      consumeRate: 0.2,
    };

    // Parity at the core's own scale so the GPU population mirrors the core exactly.
    const parityDriver = await mod.createDriver(cfg, { backend: "webgpu", scale: cfg.n });
    const flush = (parityDriver as { flush?: () => Promise<number> }).flush;
    let coreState = core.economy.create(cfg);
    const headlineDiffs: number[] = [];
    const ticks = 40;
    for (let t = 0; t < ticks; t++) {
      coreState = core.economy.step(coreState);
      const ca = core.economy.aggregates(coreState);
      parityDriver.step();
      if (flush) await flush.call(parityDriver);
      const ga = parityDriver.aggregates();
      const expHead = [...ca.relPrices, ca.meanHHI, ca.gini, ...ca.indirectShare];
      const gotHead = [...ga.relPrices, ga.meanHHI, ga.gini, ...ga.indirectShare];
      for (let k = 0; k < expHead.length; k++) {
        const denom = Math.abs(expHead[k]) > 1e-9 ? Math.abs(expHead[k]) : 1;
        headlineDiffs.push(Math.abs(gotHead[k] - expHead[k]) / denom);
      }
    }
    parityDriver.dispose();

    // Scale + perf at ≥1e5 agents.
    const scale = 100_000;
    const perfDriver = await mod.createDriver(cfg, { backend: "webgpu", scale });
    const pflush = (perfDriver as { flush?: () => Promise<number> }).flush;
    const backend = perfDriver.backend;
    const agentCount = perfDriver.agentCount();
    const probeTicks = 30;
    const start = performance.now();
    for (let t = 0; t < probeTicks; t++) {
      perfDriver.step();
      if (pflush) await pflush.call(perfDriver);
    }
    const seconds = (performance.now() - start) / 1000;
    perfDriver.dispose();

    return {
      backend,
      agentCount,
      ticksPerSec: probeTicks / Math.max(seconds, 1e-9),
      maxHeadlineDiff: Math.max(...headlineDiffs),
    };
  });

  // eslint-disable-next-line no-console
  console.log(
    `[gpu.spec] backend=${result.backend} agents=${result.agentCount} ` +
      `rate=${result.ticksPerSec.toFixed(1)} ticks/s maxHeadlineDiff=${(result.maxHeadlineDiff * 100).toFixed(3)}%`,
  );

  expect(result.backend).toBe("webgpu");
  expect(result.agentCount).toBeGreaterThanOrEqual(100_000); // AC7 ≥1e5 agents
  expect(result.ticksPerSec).toBeGreaterThanOrEqual(10); // AC7 ≥10 ticks/sec
  expect(result.maxHeadlineDiff).toBeLessThanOrEqual(0.01); // AC6b ≤1%
});
