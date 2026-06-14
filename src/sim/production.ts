// Ricardian production. Each agent has a fixed labor budget allocated across goods by
// `production` shares. Output of good g = productivity[g] * production[g] * LABOR.
//
// Local-information only (AC12): agents adjust their allocation from their OWN expected
// local prices (own trade history) toward the good with the highest revenue-per-labor.
// Under trade this drives specialization along COMPARATIVE advantage, because at a common
// local market price the agent with the higher *relative* productivity earns most there.
// This module MUST NOT import walras.ts or any equilibrium value.
import type { Agent, EconomyState } from "./types";
import { expectedRelPrice } from "./exchange";

/** Total labor budget per agent per tick (normalized). */
const LABOR = 1;
/** How fast production shares migrate toward the target allocation (0..1). */
const ADJUST = 0.06;
/** Logit sharpness for the revenue-weighted production target — larger ⇒ sharper specialization. */
const LOGIT_SHARPNESS = 12;

/**
 * Adjust each agent's production shares toward the revenue-maximizing good given its OWN
 * locally-expected prices, then produce. Goods are created here (production is the only
 * source of new goods; trade conserves). Returns nothing; mutates inventories + shares.
 */
export function productionStep(state: EconomyState): void {
  const cfg = state.config;
  if (cfg.productionEnabled === false) return;
  const g = cfg.g;

  // local expected prices (numéraire) from each agent's visible history. In this model
  // the price history is shared-local (one local market); each agent reads it the same way,
  // but the *decision* uses only realized local trade prices — never an equilibrium value.
  const price = new Float64Array(g);
  price[0] = 1;
  for (let i = 1; i < g; i++) price[i] = expectedRelPrice(state, i);

  for (const a of state.agents) {
    if (cfg.tradeEnabled) {
      adjustToward(a, price, g);
    } else {
      // autarky: value goods by own preferences (self-sufficiency), not market prices.
      adjustTowardAutarky(a, g);
    }
    produce(a, g);
  }
}

/**
 * Revenue per unit labor on good g = productivity[g] * expectedPrice[g]. Migrate production toward
 * a logit (softmax) target over revenues, NOT winner-take-all: when one good's revenue dominates
 * (a large comparative-advantage gap) the target concentrates and HHI rises toward 1; when goods
 * are near-equally profitable (a small gap) the target stays diversified and HHI stays low. So the
 * emergent specialization responds monotonically to the comparative-advantage gap (AC8-ii), while
 * a clear single best good still drives full specialization (AC2). The `rev` line is M2's target.
 */
function adjustToward(a: Agent, price: Float64Array, g: number): void {
  const rev = new Float64Array(g);
  let maxRev = -Infinity;
  for (let i = 0; i < g; i++) {
    rev[i] = a.productivity[i] * price[i];
    if (rev[i] > maxRev) maxRev = rev[i];
  }
  // logit over revenue advantage; sharpness scales with the spread so a bigger gap concentrates
  // harder. The relative gap (rev/maxRev − 1) is dimensionless so the response is scale-free.
  const target = new Float64Array(g);
  let sum = 0;
  for (let i = 0; i < g; i++) {
    target[i] = Math.exp(LOGIT_SHARPNESS * (rev[i] / Math.max(maxRev, 1e-12) - 1));
    sum += target[i];
  }
  for (let i = 0; i < g; i++) {
    const t = sum > 0 ? target[i] / sum : 1 / g;
    a.production[i] += ADJUST * (t - a.production[i]);
  }
  normalize(a.production, g);
}

/**
 * Autarky allocation: with no trade, the agent self-provisions. The utility-maximizing
 * Cobb–Douglas self-sufficient allocation puts labor share α_i on each good (independent of
 * productivity), so production shares track preferences. We migrate toward that target.
 */
function adjustTowardAutarky(a: Agent, g: number): void {
  for (let i = 0; i < g; i++) {
    a.production[i] += ADJUST * (a.prefs[i] - a.production[i]);
  }
  normalize(a.production, g);
}

function normalize(v: Float64Array, g: number): void {
  let s = 0;
  for (let i = 0; i < g; i++) {
    if (v[i] < 0) v[i] = 0;
    s += v[i];
  }
  if (s <= 0) {
    for (let i = 0; i < g; i++) v[i] = 1 / g;
    return;
  }
  for (let i = 0; i < g; i++) v[i] /= s;
}

function produce(a: Agent, g: number): void {
  for (let i = 0; i < g; i++) {
    a.inventory[i] += a.productivity[i] * a.production[i] * LABOR;
  }
}
