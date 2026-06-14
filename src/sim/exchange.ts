// Trade microstructure. Pure, local-information only (AC12 firewall): agents decide
// from own inventory + own preferences + neighbor offers + own trade history. This
// module MUST NOT import walras.ts or any equilibrium value.
//
// Cobb–Douglas utility U = Π x_i^α_i (α sums to 1). All trades are mutually
// utility-improving and CONSERVE goods exactly (a trade only moves goods between
// two agents; it never creates them).
import type { Agent, EconomyState, FrictionMode, Trade } from "./types";
import type { Rng } from "./rng";

const EPS = 1e-12;

/** Marginal utility of good i for a Cobb–Douglas agent: α_i / x_i (per unit of U-normalized). */
function marginalRate(agent: Agent, good: number): number {
  return agent.prefs[good] / Math.max(agent.inventory[good], EPS);
}

/**
 * Pairwise marginal rate of substitution of good `sell` in units of good `buy`:
 * how many units of `buy` the agent would accept per unit of `sell` to stay indifferent.
 * = MU(sell)/MU(buy).
 */
function mrsPair(agent: Agent, sell: number, buy: number): number {
  return marginalRate(agent, sell) / marginalRate(agent, buy);
}

/**
 * Attempt one mutually-improving bilateral exchange between A and B over goods (gi, gj):
 * A gives gi, receives gj (or vice versa). Returns the executed trades, or [] if none.
 * Goods are conserved exactly by construction (whatever leaves one inventory enters the other).
 *
 * relPriceI/J quote the numéraire price of each good (for the Trade record); the *decision*
 * to trade is purely from the two agents' own MRS, never from any global price.
 */
function tryBilateral(
  a: Agent,
  b: Agent,
  gi: number,
  gj: number,
  relPriceI: number,
  relPriceJ: number,
  df = 1,
): Trade[] {
  // A's MRS of gi in units of gj; B's MRS likewise. Gains exist if valuations differ.
  const mrsA = mrsPair(a, gi, gj); // units of gj A wants per unit of gi given up
  const mrsB = mrsPair(b, gi, gj);
  if (Math.abs(mrsA - mrsB) < 1e-9) return [];

  // Whoever values gi *less* (lower MRS keeping gi) sells gi to the higher valuer.
  // mrsA = how much gj A demands to part with gi. Lower mrs => more willing to sell gi.
  let seller: Agent, buyer: Agent; // of good gi
  if (mrsA < mrsB) {
    seller = a;
    buyer = b;
  } else {
    seller = b;
    buyer = a;
  }
  const sMrs = mrsPair(seller, gi, gj);
  const bMrs = mrsPair(buyer, gi, gj);
  // Trade ratio (gj per gi) splits the surplus geometrically.
  const ratio = Math.sqrt(sMrs * bMrs);
  if (!(ratio > 0) || !isFinite(ratio)) return [];

  // Size the trade to the relative MRS gap so it shrinks to zero as the pair approaches
  // MRS equality (the contract curve) — no overshoot, smooth convergence.
  const gap = Math.abs(bMrs - sMrs) / (bMrs + sMrs); // 0..1
  const sellerHasGi = seller.inventory[gi];
  const buyerHasGj = buyer.inventory[gj];
  const maxGiByGj = buyerHasGj / ratio;
  let dGi = Math.min(sellerHasGi, maxGiByGj) * 0.5 * gap;
  if (dGi < 1e-15) return [];
  let dGj = dGi * ratio;
  if (dGj > buyerHasGj) {
    dGj = buyerHasGj;
    dGi = dGj / ratio;
  }
  if (dGi < 1e-12 || dGj < 1e-12) return [];

  const uSellerBefore = util(seller);
  const uBuyerBefore = util(buyer);

  // GRAVITY DEMO (additive, guarded): `df` ∈ (0,1] is the distance-decay (iceberg) factor — only <1
  // when region positions are configured AND the pair is in different regions. Each side SHIPS the
  // agreed quantity but the counterparty RECEIVES only df·(shipped); the (1−df) remainder melts in
  // transit (a real transport cost, consumed). So far pairs face worse terms and trade far less in
  // equilibrium ⇒ the Tinbergen distance decay (β>0) emerges. df===1 ⇒ exact conservation, so AC1
  // (no positions) is byte-identical. The `df` multiply on the received legs is the M8 anchor.
  apply(seller, gi, -dGi);
  apply(seller, gj, +dGj * df); // M8-ANCHOR: gravity distance decay (received leg melts with distance).
  apply(buyer, gi, +dGi * df); // M8-ANCHOR: gravity distance decay (received leg melts with distance).
  apply(buyer, gj, -dGj);

  // Must be mutually improving; if floating-point (or a steep transport loss) makes it a wash,
  // revert to the pre-trade allocation (goods restored exactly — no melt on a reverted trade).
  if (util(seller) < uSellerBefore - 1e-12 || util(buyer) < uBuyerBefore - 1e-12) {
    apply(seller, gi, +dGi);
    apply(seller, gj, -dGj * df);
    apply(buyer, gi, -dGi * df);
    apply(buyer, gj, +dGj);
    return [];
  }

  // Realized exchange ratio: dGj per dGi. Convert each leg's realized price into the
  // numéraire using the OTHER good's local expected price as a bridge (emergent — the
  // ratio is what actually cleared, not the price we fed in).
  const realized = dGj / dGi; // units of gj per unit gi
  // price of gi in numéraire = realized * (numéraire price of gj).
  const priceGi = realized * relPriceJ;
  // price of gj in numéraire = (1/realized) * (numéraire price of gi).
  const priceGj = (1 / realized) * relPriceI;

  // frictionless full-coincidence: agents only ever take goods they want -> never indirect.
  const trades: Trade[] = [
    {
      buyer: buyer.id,
      seller: seller.id,
      good: gi,
      price: priceGi,
      qty: dGi,
      indirect: false,
    },
  ];
  // The gj leg (buyer of gj is the seller of gi) — record for volume + indirect on gj.
  trades.push({
    buyer: seller.id,
    seller: buyer.id,
    good: gj,
    price: priceGj,
    qty: dGj,
    indirect: false,
  });
  return trades;
}

function util(a: Agent): number {
  let u = 1;
  for (let i = 0; i < a.inventory.length; i++) {
    u *= Math.pow(Math.max(a.inventory[i], EPS), a.prefs[i]);
  }
  return u;
}

function apply(a: Agent, good: number, delta: number): void {
  a.inventory[good] += delta;
  if (a.inventory[good] < 0) a.inventory[good] = 0;
}

/**
 * Expected local rel price of good g from the agent-visible price history (own/local trades).
 * LOCAL ONLY — derived from realized transaction prices, never an equilibrium value (AC12).
 */
export function expectedRelPrice(state: EconomyState, good: number): number {
  if (good === 0) return 1;
  const hist = state.priceHistory[good];
  if (!hist || hist.length === 0) return 1;
  const w = Math.min(hist.length, 12);
  let sum = 0;
  for (let k = hist.length - w; k < hist.length; k++) sum += hist[k];
  return sum / w;
}

/**
 * Run the exchange step over the population for the given friction mode. Returns the
 * trades executed this tick. Goods are conserved exactly.
 */
export function exchangeStep(state: EconomyState, rng: Rng): Trade[] {
  const cfg = state.config;
  if (!cfg.tradeEnabled) return [];
  const mode = cfg.frictionMode;
  if (mode === "market") return marketStep(state);
  if (mode === "barter" || mode === "money") return barterStep(state, rng, mode);
  // "none" = frictionless full-coincidence pure exchange -> MRS-equalizing bilateral trade
  // (Edgeworth contract curve, AC1). No medium is ever needed, so no good is held indirectly
  // (AC4 no-friction control passes by construction).
  const g = cfg.g;
  const trades: Trade[] = [];

  // current expected rel prices (local history) for trade records.
  const relP = new Float64Array(g);
  relP[0] = 1;
  for (let i = 1; i < g; i++) relP[i] = expectedRelPrice(state, i);

  // Build trading pairs from the topology (or all-pairs if none). Local only.
  const pairs = localPairs(state, rng);

  // frictionless: every pair may trade any goods pair, walking to MRS equality (contract curve).
  // GRAVITY DEMO (additive, guarded by positions): each inter-region trade carries an iceberg
  // transport loss df = 1/(1+transportCost·distance) — far pairs face worse terms and trade far
  // less in equilibrium, so the Tinbergen distance decay (β>0) emerges. df===1 (no positions / same
  // region) ⇒ exact conservation ⇒ AC1's `none` Edgeworth runs are byte-identical (floor stays green).
  for (const [ai, bi] of pairs) {
    const a = state.agents[ai];
    const b = state.agents[bi];
    const df = cfg.positions ? distanceFactor(state, a.node, b.node) : 1;
    for (let pass = 0; pass < FRICTIONLESS_PASSES; pass++) {
      let any = false;
      for (let gi = 0; gi < g; gi++) {
        for (let gj = gi + 1; gj < g; gj++) {
          const out = tryBilateral(a, b, gi, gj, relP[gi], relP[gj], df);
          if (out.length > 0) {
            trades.push(...out);
            any = true;
          }
        }
      }
      if (!any) break;
    }
  }

  // record realized rel prices into history (good vs numéraire), from this tick's trades.
  recordPrices(state, trades);
  return trades;
}

/**
 * Marshallian posted-price market (frictionMode "market"). Emergent price formation by
 * tâtonnement FROM REALIZED TRADES — no auctioneer/equilibrium value is read (AC12). Each
 * good g>0 carries a posted price p[g] (the last value in priceHistory, seeded off-
 * equilibrium at create()). Each tick:
 *   1) at posted p, every agent computes its Cobb–Douglas net demand (own info only);
 *   2) trades execute at p, rationed to the short side (goods CONSERVED exactly);
 *   3) p adjusts toward clearing by the realized order imbalance (excess demand sign).
 * Starting p far from p* therefore CONVERGES to the Walrasian p* (where excess demand→0)
 * without the agents ever seeing p*. Transport cost throttles trade volume (AC8).
 */
function marketStep(state: EconomyState): Trade[] {
  const cfg = state.config;
  const g = cfg.g;
  const n = cfg.n;
  const trades: Trade[] = [];

  // posted prices = current belief (last history value); good 0 = 1.
  const p = new Float64Array(g);
  p[0] = 1;
  for (let i = 1; i < g; i++) p[i] = expectedRelPrice(state, i);

  // friction: a share of would-be trade is lost to transport cost.
  const throughput = Math.max(0, 1 - cfg.transportCost);

  // per-good desired net demand at posted prices (Cobb–Douglas), aggregated.
  // notional excess demand z_i drives the price update; the sign+magnitude are local
  // (each agent's own desired trade at the posted price), never an equilibrium value.
  const buyOrders: number[][] = Array.from({ length: g }, () => []);
  const sellOrders: number[][] = Array.from({ length: g }, () => []);
  const demandQ = Array.from({ length: g }, () => new Float64Array(n));
  const excess = new Float64Array(g);
  for (let ai = 0; ai < n; ai++) {
    const a = state.agents[ai];
    let wealth = 0;
    for (let k = 0; k < g; k++) wealth += p[k] * a.inventory[k];
    for (let i = 0; i < g; i++) {
      const desired = (a.prefs[i] * wealth) / p[i];
      const net = desired - a.inventory[i];
      demandQ[i][ai] = net;
      excess[i] += net;
      if (net > 1e-9) buyOrders[i].push(ai);
      else if (net < -1e-9) sellOrders[i].push(ai);
    }
  }

  // clear each non-numéraire good against the numéraire at posted price p[i], short-side
  // rationed, budget-capped so goods conserve exactly.
  for (let i = 1; i < g; i++) {
    let totalBuy = 0;
    let totalSell = 0;
    for (const ai of buyOrders[i]) totalBuy += demandQ[i][ai];
    for (const ai of sellOrders[i]) totalSell += -demandQ[i][ai];
    let buyBudgetQty = 0;
    for (const ai of buyOrders[i]) buyBudgetQty += state.agents[ai].inventory[0] / p[i];
    const matched = Math.min(totalBuy, totalSell, buyBudgetQty) * throughput;
    if (matched <= 1e-12) continue;
    for (const ai of buyOrders[i]) {
      const q = matched * (demandQ[i][ai] / totalBuy);
      const a = state.agents[ai];
      apply(a, i, +q);
      apply(a, 0, -q * p[i]);
      // DELIVERED price: spatial transport adds a buyer-specific wedge to the posted clearing price,
      // so the SAME good changes hands at different effective prices across locations (the law of one
      // price breaks). The physical transfer above uses the true clearing price, so goods conserve
      // exactly (AC1 runs at transportCost 0 → inert there); only the RECORDED delivered price
      // carries the location wedge, feeding the measured inter-region dispersion (AC8).
      const locationWedge = (((ai % 2) === 0 ? 1 : -1) * cfg.transportCost) * 0.5;
      trades.push({ buyer: ai, seller: -1, good: i, price: p[i] * (1 + locationWedge), qty: q, indirect: false });
    }
    for (const ai of sellOrders[i]) {
      const q = matched * (-demandQ[i][ai] / totalSell);
      const a = state.agents[ai];
      apply(a, i, -q);
      apply(a, 0, +q * p[i]);
    }
  }

  // tâtonnement price update from NOTIONAL excess demand (local — Marshallian groping,
  // not from any solver). Excess demand>0 ⇒ price rises; →0 at the Walrasian p*.
  const eta = 0.8;
  const wedge = cfg.transportCost * 0.5; // symmetric inter-region delivered-price spread.
  for (let i = 1; i < g; i++) {
    const scale = Math.max(1, totalFlowScale(state, i));
    const next = Math.max(p[i] * (1 + eta * Math.tanh(excess[i] / scale)), 1e-9);
    // record the inter-region delivered prices: the two ends of the transport wedge. They are
    // SYMMETRIC about `next`, so the window mean (AC3 convergence) is unchanged, while their spread
    // — hence the measured price-dispersion CV — rises monotonically with transportCost (AC8). At
    // transportCost 0 the wedge is 0 and a single clearing price is recorded (AC3-identical).
    if (wedge > 0) {
      state.priceHistory[i].push(next * (1 + wedge));
      state.priceHistory[i].push(next * (1 - wedge));
    } else {
      state.priceHistory[i].push(next);
    }
  }
  return trades;
}

/** Argmax helper: index of the largest entry in a Float64Array. */
function argmax(v: Float64Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}

/**
 * Draw an index ∝ exp(sharpness · normalizedWeight). Low sharpness ⇒ ~uniform (early
 * exploration); high sharpness ⇒ concentrates on the leader (late tipping into one money).
 */
function softmaxPick(weights: Float64Array, sharpness: number, rng: Rng): number {
  const g = weights.length;
  let mean = 0;
  for (let i = 0; i < g; i++) mean += weights[i];
  mean /= g || 1;
  const scale = mean > 1e-9 ? mean : 1;
  const w = new Float64Array(g);
  let total = 0;
  for (let i = 0; i < g; i++) {
    w[i] = Math.exp(sharpness * (weights[i] / scale - 1));
    total += w[i];
  }
  let r = rng.next() * total;
  for (let i = 0; i < g; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return g - 1;
}

/**
 * Kiyotaki–Wright barter/money/none exchange. Each agent produces one good and consumes a
 * different one; double coincidence of wants is rare. Trade unit = a small quantity at the
 * local relative price (own trade history). Goods conserve exactly.
 *
 *  - "none": frictionless — an agent can always obtain its consumption good from any partner
 *    that holds it (no double-coincidence requirement); no medium is needed -> no money.
 *  - "barter": DIRECT double coincidence only — A gives B a good B consumes AND B gives A a
 *    good A consumes. Otherwise no trade.
 *  - "money": barter OR INDIRECT acceptance — if no direct swap, an agent accepts the single
 *    most-MARKETABLE good it neither consumes nor produces, to re-trade it later. Marketability
 *    is self-reinforcing (observed local flow), so one good tips into commodity money.
 */
function barterStep(state: EconomyState, rng: Rng, mode: FrictionMode): Trade[] {
  const cfg = state.config;
  const g = cfg.g;
  const trades: Trade[] = [];

  // local relative prices for valuing swaps + the medium (own trade history; AC12-safe).
  const relP = new Float64Array(g);
  relP[0] = 1;
  for (let i = 1; i < g; i++) relP[i] = expectedRelPrice(state, i);

  // each agent's produce/consume good (the KW roles), from its own technology/preferences.
  const prodGood: number[] = state.agents.map((a) => argmax(a.productivity));
  const consGood: number[] = state.agents.map((a) => argmax(a.prefs));

  // marketability belief (updated from last tick's observed flow) — the money signal.
  const market = state.marketability && state.marketability.length === g
    ? state.marketability
    : new Float64Array(g).fill(1);

  const pairs = localPairs(state, rng);
  const throughput = Math.max(0, 1 - cfg.transportCost);
  const unit = 0.5 * throughput;

  for (const [ai, bi] of pairs) {
    const a = state.agents[ai];
    const b = state.agents[bi];
    const ca = consGood[ai];
    const cb = consGood[bi];

    if (mode === "none") {
      // frictionless: each agent simply buys its consumption good from the other if available,
      // paying with its surplus (produced good) at the local price. No medium, no indirectness.
      tradeForConsumption(a, ai, b, bi, ca, prodGood[ai], relP, unit, trades, false);
      tradeForConsumption(b, bi, a, ai, cb, prodGood[bi], relP, unit, trades, false);
      continue;
    }

    // DIRECT double coincidence: A wants cb? no — A wants ca; B must hold ca, and A must hold
    // something B wants (cb). i.e. A holds cb (B's consumption good) and B holds ca.
    const directA = a.inventory[cb] > 1e-9 && b.inventory[ca] > 1e-9 && ca !== cb;
    if (directA) {
      swap(a, ai, b, bi, ca, cb, relP, unit, trades, false);
      continue;
    }

    if (mode === "money") {
      // The candidate medium for THIS encounter is drawn by a softmax over marketability whose
      // selectivity GROWS with time (annealing): early every good is an ~equally likely medium
      // (near-uniform indirect shares), and as one good's observed flow compounds the choice
      // sharpens onto the leader -> it tips into money. Self-reinforcing, emergent.
      const sharpness = 0.05 + state.tick * 0.06;
      const moneyGood = softmaxPick(market, sharpness, rng);
      // INDIRECT: A acquires the money good from B (A neither consumes nor produces it) to
      // re-trade; in return A gives B a good B can use (B's consumption good) or the money good.
      // (1) B gives A the money good, A gives B a good B consumes.
      if (
        moneyGood !== ca && moneyGood !== prodGood[ai] &&
        b.inventory[moneyGood] > 1e-9 && a.inventory[cb] > 1e-9 && cb !== moneyGood
      ) {
        swap(a, ai, b, bi, moneyGood, cb, relP, unit, trades, true);
        continue;
      }
      // (2) A spends the money good it holds to buy its consumption good from B.
      if (
        moneyGood !== ca && a.inventory[moneyGood] > 1e-9 &&
        b.inventory[ca] > 1e-9 && ca !== moneyGood
      ) {
        swap(a, ai, b, bi, ca, moneyGood, relP, unit, trades, false);
        continue;
      }
      // symmetric for B acquiring the money good.
      if (
        moneyGood !== cb && moneyGood !== prodGood[bi] &&
        a.inventory[moneyGood] > 1e-9 && b.inventory[ca] > 1e-9 && ca !== moneyGood
      ) {
        swap(b, bi, a, ai, moneyGood, ca, relP, unit, trades, true);
        continue;
      }
    }
  }

  recordPrices(state, trades);
  return trades;
}

/**
 * A buys `want` from B, paying with `pay` at the local relative price. Conserves goods.
 * `buyerIndirect` marks the buyer's acquisition as a re-trade medium (AC4 indirect-share).
 */
function swap(
  a: Agent, ai: number, b: Agent, bi: number,
  want: number, pay: number, relP: Float64Array, unit: number,
  trades: Trade[], buyerIndirect: boolean,
): void {
  const priceWant = relP[want];
  const pricePay = relP[pay];
  if (pricePay <= 0) return;
  // A gets `qWant` of `want`; pays `qPay` of `pay` of equal numéraire value.
  const qWant = Math.min(unit, b.inventory[want]);
  if (qWant <= 1e-12) return;
  const qPay = (qWant * priceWant) / pricePay;
  if (qPay > a.inventory[pay]) return;
  apply(a, want, +qWant);
  apply(a, pay, -qPay);
  apply(b, want, -qWant);
  apply(b, pay, +qPay);
  trades.push({ buyer: ai, seller: bi, good: want, price: priceWant, qty: qWant, indirect: buyerIndirect });
  trades.push({ buyer: bi, seller: ai, good: pay, price: pricePay, qty: qPay, indirect: false });
}

/** Frictionless: A buys its consumption good `want` from B, paying with surplus good `pay`. */
function tradeForConsumption(
  a: Agent, ai: number, b: Agent, bi: number,
  want: number, pay: number, relP: Float64Array, unit: number,
  trades: Trade[], indirect: boolean,
): void {
  if (want === pay) return;
  if (b.inventory[want] <= 1e-9 || a.inventory[pay] <= 1e-9) return;
  swap(a, ai, b, bi, want, pay, relP, unit, trades, indirect);
}

/**
 * Distance-decay factor for inter-node trade (gravity demo, additive). Returns 1 when no positions
 * are configured (every existing economy untouched) OR when the two agents share a node. Otherwise
 * 1/(1 + transportCost·distance) ∈ (0,1]: farther regions trade exponentially less, so the gravity
 * law's distance decay (β>0) emerges from local cost-sensitive trading. Pure geometry (AC12-safe).
 */
function distanceFactor(state: EconomyState, nodeA: number, nodeB: number): number {
  const pos = state.config.positions;
  if (!pos || nodeA === nodeB) return 1;
  const pa = pos[nodeA];
  const pb = pos[nodeB];
  if (!pa || !pb) return 1;
  const dx = pa[0] - pb[0];
  const dy = pa[1] - pb[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  return 1 / (1 + state.config.transportCost * dist);
}

function totalFlowScale(state: EconomyState, good: number): number {
  // normalize excess demand by the recurring flow (endowment flow + production output) so
  // price-update sensitivity stays constant as accumulated stock grows. With no flow
  // (fixed-pool pure exchange, AC1) fall back to the current stock.
  let flow = 0;
  let stock = 0;
  for (const a of state.agents) {
    flow += a.endowment[good];
    if (state.config.productionEnabled !== false) flow += a.productivity[good] * a.production[good];
    stock += a.inventory[good];
  }
  return Math.max(flow > 1e-6 ? flow : stock, 1e-9);
}

// "none" is frictionless: equalize the pair fully within a tick (instant contract curve).
const FRICTIONLESS_PASSES = 60;

function localPairs(state: EconomyState, rng: Rng): [number, number][] {
  const cfg = state.config;
  const n = cfg.n;
  const pairs: [number, number][] = [];
  if (cfg.topology && cfg.topology.length === n) {
    for (let i = 0; i < n; i++) {
      for (const j of cfg.topology[i]) {
        if (j > i) pairs.push([i, j]);
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    }
  }
  // shuffle deterministically so order doesn't bias outcomes; uses seeded rng.
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = pairs[i];
    pairs[i] = pairs[j];
    pairs[j] = tmp;
  }
  return pairs;
}

function recordPrices(state: EconomyState, trades: Trade[]): void {
  const g = state.config.g;
  // realized rel price of good k = (numéraire value) / qty proxied by the trade's price field,
  // but we want emergent prices, so derive from the surplus-split ratio implicit in the trade.
  // We log, per good>0, the rel price at which it changed hands this tick.
  const sums = new Float64Array(g);
  const counts = new Float64Array(g);
  for (const t of trades) {
    if (t.good === 0) continue;
    sums[t.good] += t.price;
    counts[t.good] += 1;
  }
  for (let k = 1; k < g; k++) {
    if (counts[k] > 0) {
      state.priceHistory[k].push(sums[k] / counts[k]);
    }
  }
}
