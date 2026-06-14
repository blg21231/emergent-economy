// ─────────────────────────────────────────────────────────────────────────
// SHARED SEAM — the canonical contract every workstream honors.
// Owned by the orchestrator. Builders MUST NOT change these signatures without
// flagging it; add fields additively if needed.
//
// Architecture (CLAUDE.md / PRD C5): pure sim cores here in src/sim/** are
// dependency-free and Node-importable (no DOM/WebGPU/WebGL). The GPU path
// (src/sim/gpu/**) and the renderer (src/app/**) CONSUME these cores; never the
// reverse. The analytic anchor solver (walras.ts) MUST NOT be imported by the
// agent decision path (production/exchange/money) — see PRD AC12 (firewall).
// ─────────────────────────────────────────────────────────────────────────

/** Index into the goods vector [0..G-1]. Good 0 is the numéraire. */
export type GoodId = number;

export type FrictionMode =
  | "market" // local marketplace matching with bids/asks (price formation, AC3)
  | "barter" // double-coincidence-of-wants direct barter only
  | "money" // barter + agents may accept a non-consumed good to re-trade (AC4)
  | "none"; // full coincidence of wants / frictionless (AC4 negative control)

export interface Agent {
  id: number;
  /** Spatial node id (index into the topology). */
  node: number;
  /** Current holdings per good, length G, non-negative. */
  inventory: Float64Array;
  /** Cobb–Douglas preference exponents per good, length G, sum to 1. */
  prefs: Float64Array;
  /** Productivity per good (Ricardian technology), length G, > 0. */
  productivity: Float64Array;
  /** Per-good production share this agent currently allocates labor to, length G, sums to 1. */
  production: Float64Array;
  /**
   * Fixed per-tick endowment flow (length G). In pure-exchange economies this recurring
   * supply is what the market clears each period (so the discovered price converges to the
   * fundamentals' Walrasian p*); in production economies it is 0 and production is the flow.
   */
  endowment: Float64Array;
}

export interface EconomyConfig {
  seed: number;
  /** Number of agents. */
  n: number;
  /** Number of goods. */
  g: number;
  /** Spatial topology: adjacency list per node (who can trade with whom). */
  topology?: number[][];
  /** Per-good productivity matrix [n][g]; if absent, generated from seed. */
  productivity?: number[][];
  /** Per-good preference matrix [n][g]; if absent, generated from seed. */
  prefs?: number[][];
  /** Initial inventory matrix [n][g]; if absent, generated from seed. */
  endowments?: number[][];
  frictionMode: FrictionMode;
  /** Cost (0..1) applied to inter-node trades; raises with distance. */
  transportCost: number;
  /** When false, all trade is disabled (autarky control: AC2, AC5). */
  tradeEnabled: boolean;
  /** Production responds to comparative advantage when true (default). */
  productionEnabled?: boolean;
  /**
   * Optional initial posted-price belief per good (numéraire units, good 0 ignored).
   * Lets a run start FAR from the Walrasian p* (AC3 convergence-from-error). Defaults to 1
   * (neutral belief). This is a belief seed only — NOT an equilibrium value (AC12-safe).
   */
  initialPrices?: number[];
  /**
   * Optional recurring per-tick endowment flow matrix [n][g]. When set, each agent receives
   * this fresh supply every tick (a flow economy): the market must clear it repeatedly, so the
   * discovered price converges to the fundamentals' Walrasian p* (AC3). Absent ⇒ fixed-pool
   * pure exchange (AC1) where trade only redistributes the one-shot endowment.
   */
  endowmentFlow?: number[][];
  /**
   * Optional per-tick consumption fraction (0..1) of post-trade holdings (flow economies).
   * Keeps the stock at a steady state proportional to the flow so the discovered price tracks
   * the flow's fundamentals (AC3). 0 (default) ⇒ pure accumulation.
   */
  consumeRate?: number;
  /**
   * ADDITIVE OPTIONAL (exploratory gravity demo) — per-node 2D position [x,y]. When present, the
   * inter-node trade friction is scaled by the EUCLIDEAN DISTANCE between the two trading agents'
   * regions, so far regions trade less (the gravity-law distance decay EMERGES). When ABSENT every
   * existing economy behaves byte-identically (distance factor pinned to 1). NOT an equilibrium
   * value — pure geometry, AC12-safe; consumed only by the trade microstructure + the gravity fit.
   */
  positions?: [number, number][];
}

export interface EconomyState {
  config: EconomyConfig;
  tick: number;
  agents: Agent[];
  /** Transaction log for the most recent tick: per trade {good, price (in numéraire), qty, indirect}. */
  lastTrades: Trade[];
  /** Rolling per-good transaction-price history (numéraire units), one array per good. */
  priceHistory: number[][];
  /**
   * Per-good marketability belief (recency-weighted observed trade flow), length G. Drives
   * indirect (re-trade) acceptance in the "money" regime so a commodity money can self-select
   * (AC4). Local-observation only — NOT an equilibrium value (AC12-safe).
   */
  marketability?: Float64Array;
  /**
   * ADDITIVE OPTIONAL (exploratory gravity demo) — cumulative bilateral node-pair trade flow
   * (numéraire value), an N×N matrix. Only allocated + accumulated when config.positions are set;
   * absent (and untouched) for every existing economy, so behavior is byte-identical without it.
   * The gravity fit reads this over agent.node to build region-pair flows F_ij.
   */
  tradeFlow?: number[][];
}

export interface Trade {
  buyer: number;
  seller: number;
  good: GoodId;
  /** Price in numéraire units per unit of `good`. */
  price: number;
  qty: number;
  /** True when the buyer neither consumes nor produces `good` (acquired to re-trade) — AC4. */
  indirect: boolean;
}

/** Macro aggregates — the single source the renderer charts AND e2e causality reads (AC8). */
export interface Aggregates {
  tick: number;
  /** Mean transaction relative price per good (good 0 = 1, numéraire). length G. */
  relPrices: Float64Array;
  /** Coefficient of variation of transaction prices per good (dispersion). length G. */
  priceDispersion: Float64Array;
  /** Per-agent production Herfindahl index (concentration), length N. */
  perAgentHHI: Float64Array;
  /** Mean production HHI across agents. */
  meanHHI: number;
  /** Gini coefficient of wealth (numéraire-valued inventory). */
  gini: number;
  /** Top-decile wealth share. */
  topDecileShare: number;
  /** Per-good indirect-exchange share (fraction of acquisitions that are re-trade), length G. */
  indirectShare: Float64Array;
  /** Total trade volume (numéraire) this tick. */
  tradeVolume: number;
  /** Total realized utility across agents (welfare). */
  totalUtility: number;
}

/** Canonical pure-core API (implemented in economy.ts, workstream A). */
export interface EconomyCore {
  create(config: EconomyConfig): EconomyState;
  step(state: EconomyState): EconomyState;
  /** Advance `ticks` steps, returning the final state. */
  run(state: EconomyState, ticks: number): EconomyState;
  /** Compute aggregates from the current state (pure). */
  aggregates(state: EconomyState): Aggregates;
}

/** window.__ECON__ testability hook contract (AC8, AC12). */
export interface EconHook {
  /** Pause/resume the sim clock (freeze/resume e2e). */
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  /** The exact aggregates the on-screen charts render this frame. */
  getAggregates(): Aggregates;
  /** Set a live parameter; triggers recompute (causality e2e). */
  setParam(name: ParamName, value: number | boolean): void;
  /** Each agent's price *inputs* — must be local-trade-history-derived only (AC12c). */
  getAgentPriceInputs(): number[][];
  /** Step count completed (for determinism/perf probes). */
  ticks(): number;
}

export type ParamName =
  | "transportCost"
  | "comparativeAdvantageGap"
  | "tradeEnabled"
  | "frictionMode"
  | "n";

/**
 * SHARED SEAM (Round 2) — the unified driver the renderer consumes (src/app/**), produced by the
 * GPU layer (src/sim/gpu/index.ts). It selects the WebGPU compute path when available, else the
 * pure CPU core (which must be byte-for-byte the canonical economy.ts). The renderer NEVER imports
 * the GPU code or the core directly — it goes through createDriver, so the same UI works on both.
 */
export interface SimDriver {
  /** "webgpu" when the GPU compute path is active, else "cpu" (the pure core fallback). */
  backend: "webgpu" | "cpu";
  /** Advance one tick. */
  step(): void;
  /** The aggregates the charts + e2e causality read (AC8). */
  aggregates(): Aggregates;
  /** Completed tick count. */
  ticks(): number;
  /** Agent count actually being simulated (may be reduced on the CPU fallback). */
  agentCount(): number;
  /** Per-agent local price inputs (AC12c) — local-trade-history-derived only. */
  agentPriceInputs(): number[][];
  /**
   * ADDITIVE OPTIONAL (exploratory gravity demo) — the live cumulative bilateral node-pair trade
   * flow matrix (N×N) accumulated by the running sim, or null when positions aren't configured.
   * The gravity view reads it to fit the live gravity law; absent on economies without positions.
   */
  tradeFlow?(): number[][] | null;
  /** Release GPU resources. */
  dispose(): void;
}

export interface DriverOptions {
  /** Force a backend (tests / CI). "cpu" guarantees the pure core. */
  backend?: "webgpu" | "cpu" | "auto";
  /** Target agent count for the GPU path (e.g. 1e5). The CPU fallback may use fewer. */
  scale?: number;
}
