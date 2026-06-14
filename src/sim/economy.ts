// EconomyCore — composes production + exchange + metrics into the canonical pure model
// (the GPU path must reproduce this). Seeded-deterministic via makeRng(seed). No DOM/GPU.
// FIREWALL (AC12): this module and its transitive imports (production, exchange, metrics,
// money) MUST NOT import walras.ts or any precomputed equilibrium value.
import type {
  Aggregates,
  Agent,
  EconomyConfig,
  EconomyCore,
  EconomyState,
} from "./types";
import { makeRng, type Rng } from "./rng";
import { exchangeStep } from "./exchange";
import { productionStep } from "./production";
import { updateMarketability } from "./money";
import {
  coefficientOfVariation,
  cobbDouglasUtility,
  gini,
  hhi,
  indirectShareByGood,
  meanRelPrices,
  topDecileShare,
  wealth,
} from "./metrics";

// RNG state is keyed by the economy seed + tick so a run is reproducible and a re-run from
// any state reproduces bit-identically. We re-derive the per-tick rng from (seed, tick).
function tickRng(seed: number, tick: number): Rng {
  // mix seed and tick deterministically.
  return makeRng((seed ^ (tick * 0x9e3779b1)) >>> 0);
}

function genProductivity(rng: Rng, n: number, g: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < g; j++) row.push(rng.range(0.5, 2.5));
    out.push(row);
  }
  return out;
}

function genPrefs(rng: Rng, n: number, g: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const raw: number[] = [];
    let s = 0;
    for (let j = 0; j < g; j++) {
      const v = rng.range(0.2, 1);
      raw.push(v);
      s += v;
    }
    out.push(raw.map((v) => v / s));
  }
  return out;
}

function genEndowments(rng: Rng, n: number, g: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < g; j++) row.push(rng.range(1, 10));
    out.push(row);
  }
  return out;
}

function create(config: EconomyConfig): EconomyState {
  const rng = makeRng(config.seed >>> 0);
  const { n, g } = config;
  const productivity = config.productivity ?? genProductivity(rng, n, g);
  const prefs = config.prefs ?? genPrefs(rng, n, g);
  const endowments = config.endowments ?? genEndowments(rng, n, g);

  const agents: Agent[] = [];
  for (let i = 0; i < n; i++) {
    const inv = Float64Array.from(endowments[i]);
    const pr = Float64Array.from(prefs[i]);
    const prod = Float64Array.from(productivity[i]);
    // initial production shares: uniform (no specialization at t=0).
    const share = new Float64Array(g).fill(1 / g);
    const flow = config.endowmentFlow
      ? Float64Array.from(config.endowmentFlow[i])
      : new Float64Array(g);
    agents.push({
      id: i,
      node: i,
      inventory: inv,
      prefs: pr,
      productivity: prod,
      production: share,
      endowment: flow,
    });
  }

  const priceHistory: number[][] = [];
  for (let j = 0; j < g; j++) {
    if (j === 0) priceHistory.push([1]);
    else priceHistory.push([config.initialPrices?.[j] ?? 1]);
  }

  return { config, tick: 0, agents, lastTrades: [], priceHistory };
}

function step(state: EconomyState): EconomyState {
  const rng = tickRng(state.config.seed, state.tick);
  // 0) recurring endowment flow (flow economies, AC3) — fresh supply the market re-clears.
  for (const a of state.agents) {
    for (let i = 0; i < state.config.g; i++) a.inventory[i] += a.endowment[i];
  }
  // 1) produce (the only other source of new goods).
  productionStep(state);
  // 2) trade (conserves goods exactly).
  const trades = exchangeStep(state, rng);
  state.lastTrades = trades;
  // 2a) accumulate cumulative bilateral node-pair flow (gravity demo) — ONLY when positions are
  //     configured, so every existing economy is byte-identical (the matrix is never allocated).
  if (state.config.positions) accumulateFlows(state, trades);
  // 2b) update the marketability belief from observed flow (drives money emergence, AC4).
  updateMarketability(state);
  // 3) consume a fraction of post-trade holdings (flow economies) — keeps the stock at a
  //    steady state proportional to the flow so prices track the fundamentals (AC3).
  const c = state.config.consumeRate ?? 0;
  if (c > 0) {
    for (const a of state.agents) {
      for (let i = 0; i < state.config.g; i++) a.inventory[i] *= 1 - c;
    }
  }
  state.tick += 1;
  return state;
}

/**
 * Accumulate this tick's realized trades into the cumulative bilateral node-pair flow matrix
 * (gravity demo). Allocated lazily on first use; symmetric (flow is undirected exchange value).
 * Self-node trades (intra-region) are skipped — the gravity law is about INTER-region flow.
 */
function accumulateFlows(state: EconomyState, trades: { buyer: number; seller: number; price: number; qty: number }[]): void {
  const n = state.config.n;
  if (!state.tradeFlow) {
    state.tradeFlow = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  }
  const flow = state.tradeFlow;
  for (const t of trades) {
    if (t.seller < 0) continue; // market-regime trades have no bilateral counterparty.
    const nb = state.agents[t.buyer]?.node;
    const ns = state.agents[t.seller]?.node;
    if (nb === undefined || ns === undefined || nb === ns) continue;
    const value = t.price * t.qty;
    flow[ns][nb] += value;
    flow[nb][ns] += value;
  }
}

function run(state: EconomyState, ticks: number): EconomyState {
  for (let t = 0; t < ticks; t++) step(state);
  return state;
}

function aggregates(state: EconomyState): Aggregates {
  const g = state.config.g;
  const n = state.config.n;
  const relPrices = meanRelPrices(state, 12);

  const priceDispersion = new Float64Array(g);
  for (let i = 0; i < g; i++) {
    if (i === 0) {
      priceDispersion[0] = 0;
      continue;
    }
    const hist = state.priceHistory[i];
    const w = Math.min(hist.length, 12);
    priceDispersion[i] = coefficientOfVariation(hist.slice(hist.length - w));
  }

  const perAgentHHI = new Float64Array(n);
  let meanHHI = 0;
  for (let i = 0; i < n; i++) {
    perAgentHHI[i] = hhi(state.agents[i].production);
    meanHHI += perAgentHHI[i];
  }
  meanHHI /= n;

  const wealths: number[] = state.agents.map((a) => wealth(a, relPrices));
  const giniVal = gini(wealths);
  const topDecile = topDecileShare(wealths);

  const indirectShare = indirectShareByGood(state.lastTrades, g);

  let tradeVolume = 0;
  for (const t of state.lastTrades) tradeVolume += t.price * t.qty;

  let totalUtility = 0;
  for (const a of state.agents) totalUtility += cobbDouglasUtility(a.inventory, a.prefs);

  return {
    tick: state.tick,
    relPrices,
    priceDispersion,
    perAgentHHI,
    meanHHI,
    gini: giniVal,
    topDecileShare: topDecile,
    indirectShare,
    tradeVolume,
    totalUtility,
  };
}

export const economy: EconomyCore = { create, step, run, aggregates };
