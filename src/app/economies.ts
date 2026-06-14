// The economy configurations the app drives, one per route. Each is a real EconomyConfig fed to
// createDriver — the renderer never keyframes anything (C1). These mirror the configs the unit
// tests benchmark, so what the visitor watches is the same model the anchors validate.
import type { EconomyConfig, FrictionMode } from "../sim/types";
import { makeRng } from "../sim/rng";

export type ViewKey = "specialization" | "prices" | "money" | "inequality" | "gravity";

// ── Gravity demo (exploratory, beyond the floor) ──────────────────────────────────────────────
// A multi-region spatial economy whose bilateral trade flow EMERGES to satisfy the Tinbergen
// gravity law (flow grows with region size, decays with distance). Region size = agent count.
export const GRAVITY_REGIONS = 6;
export const GRAVITY_REGION_AGENTS = [8, 3, 6, 4, 7, 2];
export const GRAVITY_POSITIONS: [number, number][] = [
  [0, 0],
  [3, 2],
  [7, 1],
  [1, 5],
  [6, 6],
  [9, 4],
];

/** Region index of each agent (contiguous blocks sized by GRAVITY_REGION_AGENTS). */
export function gravityRegionOf(): number[] {
  const out: number[] = [];
  for (let r = 0; r < GRAVITY_REGIONS; r++) {
    for (let k = 0; k < GRAVITY_REGION_AGENTS[r]; k++) out.push(r);
  }
  return out;
}

/**
 * The gravity economy fed to the live app — the SAME structure the unit benchmark validates, so the
 * arcs + fitted coefficients the visitor watches are the model the gravity anchor checks. Each agent
 * produces its region's distinct good and wants every other region's good; inter-region trade
 * carries a distance iceberg cost (transportCost), so the gravity decay emerges.
 */
export function gravityConfig(transportCost: number, tradeEnabled: boolean): EconomyConfig {
  const regionOf = gravityRegionOf();
  const n = regionOf.length;
  const g = GRAVITY_REGIONS;
  const positions: [number, number][] = [];
  const endowmentFlow: number[][] = [];
  const endowments: number[][] = [];
  const prefs: number[][] = [];
  const productivity: number[][] = [];
  const topology: number[][] = [];

  for (let i = 0; i < n; i++) {
    const region = regionOf[i];
    positions.push(GRAVITY_POSITIONS[region]);
    const flow = new Array(g).fill(0);
    flow[region] = 2;
    endowmentFlow.push(flow);
    endowments.push(new Array(g).fill(0.5));
    const own = 0.02;
    const pr = new Array(g).fill((1 - own) / (g - 1));
    pr[region] = own;
    prefs.push(pr);
    const pv = new Array(g).fill(0.1);
    pv[region] = 1;
    productivity.push(pv);
  }
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) if (j !== i) row.push(j);
    topology.push(row);
  }

  return {
    seed: 23,
    n,
    g,
    frictionMode: "none",
    // the gravity demo is ABOUT the cost of distance, so it carries a baseline transport cost even
    // at slider 0 (the slider raises it further). At an honest 0 the distance decay would vanish —
    // which is exactly the negative control the unit benchmark proves; the live view always shows
    // the law forming, so it floors the cost at a value where β emerges clearly.
    transportCost: clamp01(Math.max(0.2, transportCost)),
    tradeEnabled,
    productionEnabled: false,
    positions,
    endowments,
    endowmentFlow,
    prefs,
    productivity,
    topology,
    consumeRate: 0.15,
  };
}

/**
 * Comparative-advantage gap -> productivity matrix for the specialization economy.
 * gap in [0,1]: 0 => everyone roughly equally good at both goods (no comparative edge, low HHI);
 * 1 => sharply asymmetric relative productivity (strong edge, high HHI). Two symmetric groups
 * pull in opposite directions so trade + specialization scale monotonically with the gap. This
 * is the parameter AC8(ii) reads: raising it raises emergent mean production-HHI.
 */
export function specializationProductivity(n: number, gap: number): number[][] {
  const g2 = clamp01(gap);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    // group A favors good 0, group B favors good 1; the spread widens with the gap.
    const lo = 1.0;
    const hi = 1.0 + 3.0 * g2;
    if (i % 2 === 0) out.push([hi, lo]);
    else out.push([lo, hi]);
  }
  return out;
}

export function specializationConfig(gap: number, transportCost: number, tradeEnabled: boolean): EconomyConfig {
  const n = 64;
  return {
    seed: 7,
    n,
    g: 2,
    frictionMode: "market",
    transportCost: clamp01(transportCost),
    tradeEnabled,
    productionEnabled: true,
    productivity: specializationProductivity(n, gap),
    prefs: Array.from({ length: n }, () => [0.5, 0.5]),
    endowments: Array.from({ length: n }, () => [3, 3]),
    consumeRate: 0.2,
  };
}

/** Prices economy: ≥10 agents, ≥3 goods, started FAR from p* (AC3 visual). */
export function pricesConfig(transportCost: number, tradeEnabled: boolean): EconomyConfig {
  const rng = makeRng(101);
  const n = 40;
  const g = 3;
  const prefs: number[][] = [];
  const productivity: number[][] = [];
  const endowmentFlow: number[][] = [];
  for (let i = 0; i < n; i++) {
    const pr = [0.5, 0.3, 0.2];
    prefs.push(pr);
    productivity.push([1, 1, 1]);
    endowmentFlow.push([
      2 + rng.range(-0.2, 0.2),
      1.4 + rng.range(-0.2, 0.2),
      1.0 + rng.range(-0.2, 0.2),
    ]);
  }
  return {
    seed: 101,
    n,
    g,
    frictionMode: "market",
    transportCost: clamp01(transportCost),
    tradeEnabled,
    productionEnabled: false,
    prefs,
    productivity,
    endowments: Array.from({ length: n }, () => [1, 1, 1]),
    endowmentFlow,
    // start price beliefs far off the fundamentals so the visitor watches them converge.
    initialPrices: [1, 3.0, 0.4],
    consumeRate: 0.5,
  };
}

/** Money economy: Kiyotaki–Wright ring, double-coincidence friction (AC4 visual). */
export function moneyConfig(mode: FrictionMode, transportCost: number, tradeEnabled: boolean): EconomyConfig {
  const n = 60;
  const g = 3;
  const prefs: number[][] = [];
  const productivity: number[][] = [];
  const endowments: number[][] = [];
  for (let i = 0; i < n; i++) {
    const prod = i % g;
    const consume = (prod + 1) % g;
    const pr = new Array(g).fill(0);
    pr[consume] = 1;
    prefs.push(pr);
    const pv = new Array(g).fill(0.2);
    pv[prod] = 4;
    productivity.push(pv);
    endowments.push(new Array(g).fill(1));
  }
  return {
    seed: 5,
    n,
    g,
    frictionMode: mode,
    transportCost: clamp01(transportCost),
    tradeEnabled,
    productionEnabled: true,
    prefs,
    productivity,
    endowments,
    consumeRate: 0.2,
  };
}

/** Inequality economy: near-symmetric endowments, skewed scarce-good supply (AC5 visual). */
export function inequalityConfig(transportCost: number, tradeEnabled: boolean): EconomyConfig {
  const rng = makeRng(11);
  const n = 60;
  const g = 3;
  const endowments: number[][] = [];
  const prefs: number[][] = [];
  const productivity: number[][] = [];
  for (let i = 0; i < n; i++) {
    const e: number[] = [];
    for (let k = 0; k < g; k++) e.push(5 * (1 + rng.range(-0.05, 0.05)));
    endowments.push(e);
    prefs.push([1 / 3, 1 / 3, 1 / 3]);
    const p = [1, 1, 1];
    const r = i % 10;
    const strong = r < 6 ? 0 : r < 9 ? 1 : 2;
    p[strong] = 5;
    productivity.push(p);
  }
  return {
    seed: 11,
    n,
    g,
    frictionMode: "market",
    transportCost: clamp01(transportCost),
    tradeEnabled,
    productionEnabled: true,
    endowments,
    prefs,
    productivity,
    consumeRate: 0.15,
  };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
