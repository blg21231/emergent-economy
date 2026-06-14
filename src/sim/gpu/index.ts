// SHARED SEAM (Round 2) — the unified SimDriver factory the renderer consumes.
//
// Selects the WebGPU compute path when available, else the pure CPU core (byte-for-byte the
// canonical economy.ts). The renderer only ever calls createDriver — identical on both backends.
//
// Node-import safety (C5): all navigator/GPU access is guarded by capability checks, so importing
// this module in bare Node never throws (navigator.gpu is undefined there ⇒ CPU fallback).

import type { Aggregates, DriverOptions, EconomyConfig, SimDriver } from "../types";
import { economy } from "../economy";
import { createWebGpuEconomy } from "./webgpu-economy";

/** CPU driver: the pure core, wrapped to the SimDriver interface. Always available, deterministic. */
export function createCpuDriver(config: EconomyConfig): SimDriver {
  let state = economy.create(config);
  let cache: Aggregates = economy.aggregates(state);
  return {
    backend: "cpu",
    step() {
      state = economy.step(state);
      cache = economy.aggregates(state);
    },
    aggregates() {
      return cache;
    },
    ticks() {
      return state.tick;
    },
    agentCount() {
      return state.agents.length;
    },
    agentPriceInputs() {
      // Local-trade-history-derived expected relative prices per agent (AC12c). In the single
      // shared-local-market model every agent reads the same realized history; expose it per agent.
      const g = config.g;
      const rel = cache.relPrices;
      return state.agents.map(() => Array.from({ length: g }, (_v, i) => rel[i]));
    },
    tradeFlow() {
      // exploratory gravity demo: the live cumulative bilateral flow matrix (null without positions).
      return state.tradeFlow ?? null;
    },
    dispose() {
      /* no GPU resources on the CPU path */
    },
  };
}

/**
 * Capability check: true only when navigator.gpu exists, an adapter+device can be acquired, AND the
 * adapter is a REAL (hardware) GPU — software/SwiftShader adapters are rejected.
 *
 * Why not an end-to-end compute probe? On the headless ANGLE/SwiftShader software adapter, compute
 * submission wedges the entire page event loop (timers starve), so even a timeout-raced probe can't
 * recover — it would hang the app in CI. Adapter *metadata* (architecture/description) cleanly
 * distinguishes the headless software path from a real GPU without ever submitting compute, so the
 * CPU fallback stays honest AND CI-safe (AC7 universal boot). Resolves false (never throws/hangs)
 * in bare Node / unsupported / software-only environments.
 */
export async function webgpuAvailable(): Promise<boolean> {
  const device = await acquireDevice();
  if (!device) return false;
  device.destroy();
  return true;
}

const SOFTWARE_ADAPTER = /swiftshader|software|llvmpipe|microsoft basic/i;

/**
 * Try to acquire a REAL-GPU GPUDevice; returns null (never throws) when WebGPU is absent, no adapter
 * exists, or the only adapter is a software rasterizer (which would wedge on compute). Honors the
 * EE_FORCE_WEBGPU global override (set by a human who knows their GPU works) to bypass the
 * software-adapter rejection.
 */
async function acquireDevice(): Promise<GPUDevice | null> {
  try {
    const gpu: GPU | undefined =
      typeof navigator !== "undefined" ? (navigator as Navigator & { gpu?: GPU }).gpu : undefined;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const forced =
      typeof globalThis !== "undefined" &&
      (globalThis as { EE_FORCE_WEBGPU?: boolean }).EE_FORCE_WEBGPU === true;
    if (!forced && isSoftwareAdapter(adapter)) return null;
    const device = await adapter.requestDevice();
    return device ?? null;
  } catch {
    return null;
  }
}

function isSoftwareAdapter(adapter: GPUAdapter): boolean {
  const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
  if (info) {
    const sig = `${info.vendor ?? ""} ${info.architecture ?? ""} ${info.description ?? ""}`;
    if (SOFTWARE_ADAPTER.test(sig)) return true;
  }
  // No info available (older browsers): assume a software fallback adapter is software.
  return (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter === true;
}

/**
 * Create the simulation driver. Honors opts.backend ("cpu" | "webgpu" | "auto"):
 *   - "cpu": always the deterministic pure core.
 *   - "webgpu": the GPU compute path; falls back to CPU if WebGPU can't be acquired.
 *   - "auto" (default): WebGPU when available, else CPU.
 * opts.scale sets the WebGPU agent population (default 1e5); the CPU fallback uses config.n.
 */
export async function createDriver(config: EconomyConfig, opts?: DriverOptions): Promise<SimDriver> {
  const backend = opts?.backend ?? "auto";
  if (backend === "cpu") return createCpuDriver(config);

  const device = await acquireDevice();
  if (!device) {
    // WebGPU absent, or only a software adapter (which would wedge on compute): fall back to the
    // identical pure core (AC6c, AC7 universal-boot). CI-safe — no compute is ever submitted here.
    return createCpuDriver(config);
  }
  const scale = opts?.scale ?? 100_000;
  return createWebGpuEconomy(device, config, scale);
}

// ── Perf probe (AC7) ─────────────────────────────────────────────────────────────────────────
export interface PerfReport {
  backend: "webgpu" | "cpu";
  scale: number;
  ticks: number;
  seconds: number;
  ticksPerSec: number;
  /** True when run at the full target scale; false when reduced (no GPU / CI / env override). */
  fullScale: boolean;
  timestamp: string;
}

/**
 * Step the active driver at a target scale and record ticks/sec. Applies the GPU-less-CI override:
 * when WebGPU is absent OR process.env.CI / EE_REDUCED_SCALE is set, run at a reduced scale instead
 * of failing — recording the backend + scale + rate honestly. Writes perf-report.json in Node when
 * possible and always logs to console.
 */
export async function runPerfProbe(opts?: {
  targetScale?: number;
  reducedScale?: number;
  ticks?: number;
  config?: Partial<EconomyConfig>;
}): Promise<PerfReport> {
  const targetScale = opts?.targetScale ?? 100_000;
  const reducedScale = opts?.reducedScale ?? 2_000;
  const ticks = opts?.ticks ?? 60;

  const reduced =
    (typeof process !== "undefined" && (!!process.env.CI || !!process.env.EE_REDUCED_SCALE)) ||
    !(await webgpuAvailable());
  const scale = reduced ? reducedScale : targetScale;

  const config: EconomyConfig = {
    seed: 7,
    n: 60,
    g: 3,
    frictionMode: "market",
    transportCost: 0.1,
    tradeEnabled: true,
    productionEnabled: true,
    consumeRate: 0.2,
    ...opts?.config,
  };

  const driver = await createDriver(config, { backend: "auto", scale });
  const flush = (driver as unknown as { flush?: () => Promise<number> }).flush;

  const start = now();
  for (let t = 0; t < ticks; t++) {
    driver.step();
    if (flush) await flush.call(driver); // count GPU reduction time honestly in the rate
  }
  const seconds = (now() - start) / 1000;
  driver.dispose();

  const report: PerfReport = {
    backend: driver.backend,
    scale: driver.agentCount(),
    ticks,
    seconds,
    ticksPerSec: ticks / Math.max(seconds, 1e-9),
    fullScale: !reduced,
    timestamp: new Date().toISOString(),
  };

  // eslint-disable-next-line no-console
  console.log(
    `[perf] backend=${report.backend} scale=${report.scale} ticks=${report.ticks} ` +
      `rate=${report.ticksPerSec.toFixed(1)} ticks/s fullScale=${report.fullScale}`,
  );
  await writeReport(report);
  return report;
}

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

async function writeReport(report: PerfReport): Promise<void> {
  // Best-effort: write perf-report.json when running under Node (skip silently in the browser).
  try {
    if (typeof process === "undefined" || !process.versions?.node) return;
    // Computed specifier so the bundler can't statically see (and warn about externalizing) a
    // node: builtin — this path only ever runs under Node (guarded above), never in the browser.
    const spec = ["node:", "fs/promises"].join("");
    const fs = await import(/* @vite-ignore */ spec);
    await fs.writeFile("perf-report.json", JSON.stringify(report, null, 2));
  } catch {
    /* non-fatal: console log already recorded the result */
  }
}
