// EXPLORATORY DEMO (beyond the floor) — the Tinbergen GRAVITY LAW OF TRADE, fit as a MEASUREMENT
// over realized trades. Pure, dependency-free, Node-importable (C5); NO walras/anchor import, NO
// DOM/GPU (AC12 firewall — this is a measurement over `state.tradeFlow` + `agent.node` + positions,
// never a driver of agent decisions).
//
// The famous gravity model (Tinbergen 1962): bilateral trade flow between regions i,j satisfies
//   log(F_ij) = a + b1·log(S_i) + b2·log(S_j) − β·log(D_ij)
// flow grows with the two regions' economic SIZE (S) and decays with DISTANCE (D). Here NOTHING is
// hard-coded: agents trade bilaterally with a cost that scales with distance (exchange.ts), the
// realized region-pair flows are accumulated, and this module FITS the log-linear law by OLS — the
// distance-decay coefficient β>0 is the emergent regularity, validated against the established law.
import type { EconomyState } from "./types";

/** A measured region-pair flow record. */
export interface RegionFlow {
  i: number;
  j: number;
  /** cumulative bilateral trade value between regions i and j. */
  flow: number;
  /** economic size (total realized trade throughput) of region i. */
  sizeI: number;
  /** economic size of region j. */
  sizeJ: number;
  /** euclidean distance between region centroids. */
  dist: number;
}

/** Fitted gravity regression (OLS) over log(F) ~ log(S_i), log(S_j), log(D). */
export interface GravityFit {
  /** intercept. */
  a: number;
  /** origin-size elasticity (expected > 0). */
  b1: number;
  /** destination-size elasticity (expected > 0). */
  b2: number;
  /** distance-decay coefficient: reported as a POSITIVE number for decay (the −β in the law). */
  beta: number;
  /** coefficient of determination of the log-linear fit. */
  r2: number;
  /** number of region-pairs used in the fit. */
  nPairs: number;
}

/**
 * Build the unique inter-region flow records from the accumulated bilateral node-pair flow matrix.
 * Each agent's region is its POSITION (agents sharing a position are one region), so regions may hold
 * DIFFERENT numbers of agents — the region's agent count is its exogenous economic MASS S_i (the
 * standard gravity interpretation: bigger economies trade more). Using agent count avoids the
 * simultaneity of using realized throughput as both regressor and outcome, and avoids the
 * terms-of-trade collapse of a single big-surplus exporter. Distances are from the region positions.
 * Flows F_ij come from the accumulated bilateral trade matrix.
 *
 * `regions` is the number of distinct regions. Agents are mapped to regions by their position: the
 * `regionCentroids` (one [x,y] per region, in region order) define the regions and the agent at
 * node a is assigned to the nearest centroid. The `agentsPerRegion` arg is retained for API
 * compatibility (contiguous-block fallback when no positions are configured).
 */
export function regionFlows(
  state: EconomyState,
  regions: number,
  agentsPerRegion = 1,
  regionCentroids?: [number, number][],
): RegionFlow[] {
  const matrix = state.tradeFlow;
  const positions = state.config.positions;
  const cents = regionCentroids ?? inferCentroids(state, regions, agentsPerRegion);
  const regionOf = (a: number): number => {
    if (!positions || !positions[state.agents[a].node]) return Math.floor(a / agentsPerRegion);
    return nearestCentroid(positions[state.agents[a].node], cents);
  };

  // region-pair flow matrix, summed over agents by their region (node).
  const fr: number[][] = Array.from({ length: regions }, () => new Array<number>(regions).fill(0));
  if (matrix) {
    for (let a = 0; a < matrix.length; a++) {
      const ra = regionOf(a);
      if (ra >= regions) continue;
      for (let b = 0; b < matrix.length; b++) {
        const rb = regionOf(b);
        if (rb >= regions || ra === rb) continue;
        fr[ra][rb] += matrix[a][b];
      }
    }
  }

  // region size = exogenous economic mass: the number of agents (traders) in the region.
  const size = new Array<number>(regions).fill(0);
  for (let a = 0; a < state.agents.length; a++) {
    const r = regionOf(a);
    if (r < regions) size[r] += 1;
  }

  const centroid = cents;

  const out: RegionFlow[] = [];
  for (let i = 0; i < regions; i++) {
    for (let j = i + 1; j < regions; j++) {
      // the matrix is symmetric; take the i<j flow (undirected exchange).
      out.push({
        i,
        j,
        flow: fr[i][j],
        sizeI: size[i],
        sizeJ: size[j],
        dist: distance(centroid[i], centroid[j]),
      });
    }
  }
  return out;
}

/**
 * Fit the log-linear gravity law by ordinary least squares over the region-pair records with
 * strictly positive flow, size, and distance (logs require positivity). Returns {a,b1,b2,beta,r2}.
 * `beta` is reported as the magnitude of distance decay (so β>0 means farther ⇒ less trade).
 *
 * The fit uses the symmetric design: since flow F_ij is undirected, the two size terms enter
 * symmetrically; b1 and b2 are estimated independently (both should land > 0 if size raises flow).
 * The `positions` argument is the per-region centroid list (length = regions).
 */
export function fitGravity(flows: RegionFlow[], _positions: [number, number][]): GravityFit {
  // design rows: [1, log Si, log Sj, log Dij] → log Fij. Keep only finite, positive observations.
  const X: number[][] = [];
  const y: number[] = [];
  for (const f of flows) {
    if (f.flow > 0 && f.sizeI > 0 && f.sizeJ > 0 && f.dist > 0) {
      X.push([1, Math.log(f.sizeI), Math.log(f.sizeJ), Math.log(f.dist)]);
      y.push(Math.log(f.flow));
    }
  }
  const nPairs = y.length;
  if (nPairs < 4) {
    return { a: 0, b1: 0, b2: 0, beta: 0, r2: 0, nPairs };
  }

  const coef = olsNormalEquations(X, y); // [a, b1, b2, gammaDistance]
  const a = coef[0];
  const b1 = coef[1];
  const b2 = coef[2];
  const gammaDistance = coef[3]; // sign of the distance term in the regression.
  const beta = -gammaDistance; // report decay as positive: a negative distance slope ⇒ β>0.

  // r² of the fit.
  let yMean = 0;
  for (const v of y) yMean += v;
  yMean /= nPairs;
  let ssTot = 0;
  let ssRes = 0;
  for (let k = 0; k < nPairs; k++) {
    const pred = a + b1 * X[k][1] + b2 * X[k][2] + gammaDistance * X[k][3];
    ssRes += (y[k] - pred) ** 2;
    ssTot += (y[k] - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { a, b1, b2, beta, r2, nPairs };
}

/** The unique agent positions, in first-seen order, taken as the region centroids. */
function inferCentroids(state: EconomyState, regions: number, agentsPerRegion: number): [number, number][] {
  const positions = state.config.positions;
  if (!positions) {
    return Array.from({ length: regions }, (_v, r) => [r * agentsPerRegion, 0] as [number, number]);
  }
  const out: [number, number][] = [];
  for (let a = 0; a < state.agents.length && out.length < regions; a++) {
    const p = positions[state.agents[a].node];
    if (!p) continue;
    if (!out.some((c) => c[0] === p[0] && c[1] === p[1])) out.push([p[0], p[1]]);
  }
  while (out.length < regions) out.push([out.length, 0]);
  return out;
}

/** Index of the nearest centroid to a point (region assignment). */
function nearestCentroid(p: [number, number], cents: [number, number][]): number {
  let best = 0;
  let bestD = Infinity;
  for (let r = 0; r < cents.length; r++) {
    const d = distance(p, cents[r]);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/**
 * Renderer-friendly flow builder: given the live cumulative bilateral node-pair flow `matrix`, the
 * per-node region assignment `regionOf`, the region `centroids`, and the region `sizes` (agent
 * counts), produce the unique inter-region flow records. Decoupled from EconomyState so the app can
 * fit the live gravity law straight off `driver.tradeFlow()`. Same math as regionFlows.
 */
export function flowsFromMatrix(
  matrix: number[][] | null,
  regionOf: number[],
  centroids: [number, number][],
  sizes: number[],
): RegionFlow[] {
  const regions = centroids.length;
  const fr: number[][] = Array.from({ length: regions }, () => new Array<number>(regions).fill(0));
  if (matrix) {
    for (let a = 0; a < matrix.length; a++) {
      const ra = regionOf[a];
      if (ra === undefined || ra >= regions) continue;
      for (let b = 0; b < matrix.length; b++) {
        const rb = regionOf[b];
        if (rb === undefined || rb >= regions || ra === rb) continue;
        fr[ra][rb] += matrix[a][b];
      }
    }
  }
  const out: RegionFlow[] = [];
  for (let i = 0; i < regions; i++) {
    for (let j = i + 1; j < regions; j++) {
      out.push({ i, j, flow: fr[i][j], sizeI: sizes[i], sizeJ: sizes[j], dist: distance(centroids[i], centroids[j]) });
    }
  }
  return out;
}

function distance(p: [number, number], q: [number, number]): number {
  const dx = p[0] - q[0];
  const dy = p[1] - q[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Solve the OLS normal equations (XᵀX)β = Xᵀy by Gaussian elimination with partial pivoting.
 * Small, well-conditioned (4×4) for the gravity design; pure arithmetic, deterministic.
 */
function olsNormalEquations(X: number[][], y: number[]): number[] {
  const p = X[0].length;
  const xtx: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < p; i++) {
      xty[i] += X[r][i] * y[r];
      for (let j = 0; j < p; j++) xtx[i][j] += X[r][i] * X[r][j];
    }
  }
  return solveLinear(xtx, xty);
}

/** Gaussian elimination with partial pivoting for an n×n system A·x = b. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  // augmented matrix.
  const m: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // partial pivot.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      const tmp = m[pivot];
      m[pivot] = m[col];
      m[col] = tmp;
    }
    const diag = m[col][col];
    if (Math.abs(diag) < 1e-15) continue; // singular column; leave coefficient at 0.
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / diag;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const diag = m[i][i];
    x[i] = Math.abs(diag) < 1e-15 ? 0 : m[i][n] / diag;
  }
  return x;
}
