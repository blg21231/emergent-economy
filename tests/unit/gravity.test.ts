// EXPLORATORY DEMO (beyond the floor) — the Tinbergen GRAVITY LAW OF TRADE as an EMERGENT
// regularity. In a multi-region spatial economy where agents trade bilaterally with cost that
// scales with DISTANCE (an iceberg transport loss), the realized bilateral region-pair trade flow
// F_ij should satisfy the gravity law: log(F_ij) = a + b1·log(S_i) + b2·log(S_j) − β·log(D_ij) —
// flow grows with the two regions' economic SIZE and decays with DISTANCE. This is NOT hard-coded:
// agents only ever see local offers + a distance-scaled transport cost; the law is MEASURED over
// realized trades and FIT by OLS.
//
// Region "size" = number of agents (traders) in the region — the standard gravity mass: bigger
// economies have more traders and trade more. Same rigor as the five floor anchors:
//  - POSITIVE: with transport cost the law emerges — β>0 (distance suppresses trade), both size
//    coefficients > 0 (bigger regions trade more), and the OLS r² clears a pinned floor.
//  - NEGATIVE CONTROL: with transportCost=0 (distance is free) the distance decay vanishes (β≈0),
//    proving the emergent decay is real, not an artifact of how flows are accumulated.
//  - DETERMINISM: same seed ⇒ identical fitted coefficients.
import { describe, it, expect } from "vitest";
import { economy } from "../../src/sim/economy";
import { fitGravity, flowsFromMatrix, regionFlows, type RegionFlow } from "../../src/sim/gravity";
import type { EconomyConfig } from "../../src/sim/types";

// 6 regions scattered on a 2D plane (so distance is not collinear with size); region size = the
// number of agents that live there. Each agent produces its region's distinct good (G = REGIONS)
// and wants every other region's good, so every region-pair has a trade motive.
const REGIONS = 6;
const REGION_AGENTS = [8, 3, 6, 4, 7, 2]; // economic size S_i (agent counts), decorrelated from D.
const POSITIONS: [number, number][] = [
  [0, 0],
  [3, 2],
  [7, 1],
  [1, 5],
  [6, 6],
  [9, 4],
];
const N = REGION_AGENTS.reduce((s, x) => s + x, 0);
const G = REGIONS;

// agent → region map (contiguous blocks), and the per-agent position (its region's centroid).
const REGION_OF: number[] = [];
for (let r = 0; r < REGIONS; r++) for (let k = 0; k < REGION_AGENTS[r]; k++) REGION_OF.push(r);

function makeCfg(transportCost: number): EconomyConfig {
  const positions: [number, number][] = [];
  const endowmentFlow: number[][] = [];
  const endowments: number[][] = [];
  const prefs: number[][] = [];
  const productivity: number[][] = [];
  const topology: number[][] = [];

  for (let i = 0; i < N; i++) {
    const region = REGION_OF[i];
    positions.push(POSITIONS[region]);
    // every agent is identical within a size class: a recurring surplus of its region's good and a
    // diversified appetite for every OTHER region's good. So a region's TOTAL surplus + demand
    // scale with its agent count ⇒ bigger regions trade more (the gravity mass term).
    const flow = new Array(G).fill(0);
    flow[region] = 2;
    endowmentFlow.push(flow);
    endowments.push(new Array(G).fill(0.5));
    const own = 0.02;
    const pr = new Array(G).fill((1 - own) / (G - 1));
    pr[region] = own;
    prefs.push(pr);
    const pv = new Array(G).fill(0.1);
    pv[region] = 1; // marks the surplus good (productionEnabled is false; nothing is produced).
    productivity.push(pv);
  }
  // fully-connected topology: every agent can reach every other, so distance — not connectivity —
  // is what throttles inter-region flow.
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) if (j !== i) row.push(j);
    topology.push(row);
  }

  return {
    seed: 23,
    n: N,
    g: G,
    frictionMode: "none", // frictionless consumption trade; distance is the only friction.
    transportCost,
    tradeEnabled: true,
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

const TICKS = 100;

describe("EXPLORATORY: gravity law of trade emerges from local distance-sensitive trading", () => {
  it("(positive) with distance cost the gravity law fits: β>0, size coefs>0, r²≥0.6", () => {
    const state = economy.run(economy.create(makeCfg(0.2)), TICKS);
    const flows = regionFlows(state, REGIONS, 1, POSITIONS);
    const fit = fitGravity(flows, POSITIONS);

    // eslint-disable-next-line no-console
    console.log(
      `[gravity] a=${fit.a.toFixed(3)} b1=${fit.b1.toFixed(3)} b2=${fit.b2.toFixed(3)} ` +
        `beta=${fit.beta.toFixed(3)} r2=${fit.r2.toFixed(3)} pairs=${fit.nPairs}`,
    );

    expect(fit.nPairs).toBeGreaterThanOrEqual(REGIONS); // enough region-pairs to fit.
    expect(fit.beta).toBeGreaterThan(0); // distance SUPPRESSES trade (the gravity decay).
    expect(fit.b1).toBeGreaterThan(0); // origin size raises flow.
    expect(fit.b2).toBeGreaterThan(0); // destination size raises flow.
    expect(fit.r2).toBeGreaterThanOrEqual(0.6); // the log-linear law explains most of the variance.
  });

  it("(negative control) with transportCost=0 the distance decay vanishes: β≈0", () => {
    const state = economy.run(economy.create(makeCfg(0)), TICKS);
    const flows = regionFlows(state, REGIONS, 1, POSITIONS);
    const fit = fitGravity(flows, POSITIONS);

    // eslint-disable-next-line no-console
    console.log(`[gravity-control] beta=${fit.beta.toFixed(3)} r2=${fit.r2.toFixed(3)}`);

    // no distance cost ⇒ distance no longer suppresses trade; the decay coefficient collapses.
    expect(Math.abs(fit.beta)).toBeLessThan(0.25);
  });

  it("(determinism) same seed ⇒ identical fitted coefficients", () => {
    const a = fitGravity(regionFlows(economy.run(economy.create(makeCfg(0.2)), TICKS), REGIONS, 1, POSITIONS), POSITIONS);
    const b = fitGravity(regionFlows(economy.run(economy.create(makeCfg(0.2)), TICKS), REGIONS, 1, POSITIONS), POSITIONS);
    expect(b.beta).toBe(a.beta);
    expect(b.b1).toBe(a.b1);
    expect(b.b2).toBe(a.b2);
    expect(b.r2).toBe(a.r2);
  });

  it("regionFlows infers centroids + region assignment from positions when not passed", () => {
    const state = economy.run(economy.create(makeCfg(0.2)), 20);
    const inferred = regionFlows(state, REGIONS); // no agentsPerRegion/centroids -> infer from positions.
    const explicit = regionFlows(state, REGIONS, 1, POSITIONS);
    expect(inferred.length).toBe(explicit.length);
    // same region-pairs, same flows (assignment is identical).
    for (let k = 0; k < inferred.length; k++) {
      expect(inferred[k].flow).toBeCloseTo(explicit[k].flow, 6);
      expect(inferred[k].dist).toBeCloseTo(explicit[k].dist, 6);
    }
  });

  it("regionFlows falls back to contiguous blocks + index centroids when no positions", () => {
    // a position-less economy: regionFlows uses the agentsPerRegion block fallback (tradeFlow is
    // never accumulated without positions, so flows are 0 — the function still returns well-formed
    // records over the requested regions).
    const noPos: EconomyConfig = {
      seed: 1, n: 4, g: 2, frictionMode: "none", transportCost: 0,
      tradeEnabled: true, productionEnabled: false,
      prefs: Array.from({ length: 4 }, () => [0.5, 0.5]),
      endowments: Array.from({ length: 4 }, () => [2, 2]),
      productivity: Array.from({ length: 4 }, () => [1, 1]),
    };
    const state = economy.run(economy.create(noPos), 5);
    const flows = regionFlows(state, 2, 2);
    expect(flows.length).toBe(1); // C(2,2) = 1 region-pair.
    expect(flows[0].flow).toBe(0); // no positions ⇒ no accumulated flow.
    expect(state.tradeFlow).toBeUndefined(); // matrix never allocated (byte-identical floor).
  });

  it("flowsFromMatrix assigns agents by regionOf and computes size×distance records", () => {
    // 4 agents, 2 regions (agents 0,1 -> region 0; agents 2,3 -> region 1).
    const matrix = [
      [0, 0, 5, 3],
      [0, 0, 2, 4],
      [5, 2, 0, 0],
      [3, 4, 0, 0],
    ];
    const regionOf = [0, 0, 1, 1];
    const centroids: [number, number][] = [
      [0, 0],
      [3, 4],
    ];
    const sizes = [2, 2];
    const flows = flowsFromMatrix(matrix, regionOf, centroids, sizes);
    expect(flows.length).toBe(1);
    expect(flows[0].flow).toBe(5 + 3 + 2 + 4); // all 0<->1 cross-region cells.
    expect(flows[0].dist).toBeCloseTo(5, 9); // 3-4-5 triangle.
    expect(flows[0].sizeI).toBe(2);
    expect(flows[0].sizeJ).toBe(2);
  });

  it("flowsFromMatrix tolerates a null matrix and out-of-range regions", () => {
    const flows = flowsFromMatrix(null, [0, 1], [[0, 0], [1, 0]], [1, 1]);
    expect(flows.length).toBe(1);
    expect(flows[0].flow).toBe(0);
    // out-of-range region indices are skipped (no throw).
    const m = [[0, 9], [9, 0]];
    const f2 = flowsFromMatrix(m, [0, 5], [[0, 0], [1, 0]], [1, 1]); // agent 1 -> region 5 (>= regions).
    expect(f2[0].flow).toBe(0); // the cross-region cell is skipped (region 5 out of range).
  });

  it("fitGravity returns zeros when too few positive observations to fit", () => {
    const sparse: RegionFlow[] = [
      { i: 0, j: 1, flow: 0, sizeI: 1, sizeJ: 1, dist: 1 }, // flow 0 -> dropped.
      { i: 0, j: 2, flow: 10, sizeI: 2, sizeJ: 1, dist: 2 },
    ];
    const fit = fitGravity(sparse, []);
    expect(fit.nPairs).toBeLessThan(4);
    expect(fit).toMatchObject({ a: 0, b1: 0, b2: 0, beta: 0, r2: 0 });
  });
});
