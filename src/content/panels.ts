// Epistemic content (AC10). Every explanatory panel carries EXACTLY ONE tag from the four-way
// vocabulary below. The renderer stamps the tag visibly on every panel it draws, and the e2e
// panel-tag walk + the unit content-lint assert: zero untagged, pinned tags hold, and no
// banned overclaim phrase appears in any non-established panel.
//
// PINNED (AC10):
//  - comparative advantage & gains-from-trade  -> established-theory
//  - THIS sim's specific money/price/inequality outcomes -> model-result
//  - the agent behavioral rules                 -> simplification
//  - "does real inequality/money arise this way" -> open-question

export type EpistemicTag =
  | "established-theory"
  | "model-result"
  | "simplification"
  | "open-question";

export const EPISTEMIC_TAGS: readonly EpistemicTag[] = [
  "established-theory",
  "model-result",
  "simplification",
  "open-question",
] as const;

/** Human-readable label + a one-line meaning for the legend. */
export const TAG_META: Record<EpistemicTag, { label: string; meaning: string }> = {
  "established-theory": {
    label: "Established theory",
    meaning: "A result economists broadly agree on, provable on paper.",
  },
  "model-result": {
    label: "Model result",
    meaning: "What THIS toy simulation produced — true of the model, not a claim about the world.",
  },
  simplification: {
    label: "Simplification",
    meaning: "A deliberate behavioral shortcut; real agents are richer than this.",
  },
  "open-question": {
    label: "Open question",
    meaning: "An honest unknown — the model demonstrates a mechanism, it does not settle history.",
  },
};

export interface Panel {
  /** Stable id used by routes + the e2e walk. */
  id: string;
  /** Which route/view this panel belongs to. */
  route: string;
  title: string;
  /** Plain-text body (rendered as paragraphs split on blank lines). */
  body: string;
  tag: EpistemicTag;
}

// One curated explanatory panel set. Each pinned assignment above is represented; the rest are
// tagged to the simplest honest reading. NO non-established panel may contain a banned phrase
// (see BANNED_PHRASES) — the lint enforces it.
export const PANELS: readonly Panel[] = [
  {
    id: "intro-emergence",
    route: "/",
    title: "Macro-order, grown from local rules",
    body:
      "Nobody in this world sets a price, assigns a job, or designs a currency. Each agent only sees its own basket, its own tastes, and the neighbors it can reach. Watch the macro-economy assemble itself from those purely local moves.\n\nEvery claim below is checked live against a closed-form economic anchor, and every panel is tagged with how much you should trust it.",
    tag: "model-result",
  },
  {
    id: "ca-theory",
    route: "/specialization",
    title: "Comparative advantage & the gains from trade",
    body:
      "Ricardo's result: even when one agent is better at producing everything, both gain by specializing in the good where their RELATIVE productivity is highest and trading for the rest. Total output rises; the price of trade settles between the two parties' opportunity-cost ratios.\n\nThis is the classical theorem the model is checked against — not something the model invented.",
    tag: "established-theory",
  },
  {
    id: "specialization-result",
    route: "/specialization",
    title: "What this sim produced: regions self-sort by trade",
    body:
      "Starting from agents who all split their labor evenly, local price signals pull each one toward its comparative-advantage good. Production concentration (HHI) climbs and the map sorts into specialized regions. Widen the comparative-advantage gap and the sorting sharpens — measured, not scripted.",
    tag: "model-result",
  },
  {
    id: "production-rules",
    route: "/specialization",
    title: "The behavioral rule agents actually follow",
    body:
      "Each tick an agent nudges a fixed fraction of its labor toward whichever good offers the highest revenue per unit of effort at its own locally-observed prices. No optimization over the future, no learning curve, no firms. A real producer is far more sophisticated than this rule.",
    tag: "simplification",
  },
  {
    id: "price-result",
    route: "/prices",
    title: "Prices collapse onto the clearing value",
    body:
      "Transaction prices start scattered and far from equilibrium. As agents trade, the price cloud contracts and its moving average drifts toward p*, the market-clearing price an independent solver computes for the same economy. The agents never see p* — they only react to the trades they witness.",
    tag: "model-result",
  },
  {
    id: "price-anchor",
    route: "/prices",
    title: "The Walrasian clearing price (the anchor)",
    body:
      "p* is the price vector at which aggregate excess demand is zero — the equilibrium of general-equilibrium theory. We solve for it separately by tâtonnement and use it ONLY to grade the agents' emergent prices. It is a ruler held up to the model, never a value fed into it.",
    tag: "established-theory",
  },
  {
    id: "money-result",
    route: "/money",
    title: "One good becomes money, unprompted",
    body:
      "Under double-coincidence friction, an agent will accept a good it neither makes nor consumes if it expects to re-trade it. The more a good is taken for re-trade, the more marketable it looks, so it is taken more — a self-reinforcing loop. In this run one good's indirect-exchange share pulls away from the rest and it tips into commodity money.",
    tag: "model-result",
  },
  {
    id: "money-anchor",
    route: "/money",
    title: "Kiyotaki–Wright: money as a re-trade medium",
    body:
      "The Kiyotaki–Wright search model shows a commodity can become a medium of exchange purely from the friction of barter — no government, no decree. Our anchor checks that exactly one good's indirect-exchange share separates under friction, and that NO good separates when the friction is removed.",
    tag: "established-theory",
  },
  {
    id: "money-history-open",
    route: "/money",
    title: "Is this how money actually arose in history?",
    body:
      "The model shows ONE clean mechanism by which a medium of exchange can self-select. Whether real historical monies — cattle, shells, silver, salt — emerged this way, by state fiat, or by some mix, is genuinely contested among economists and anthropologists. The sim demonstrates a possibility; it does not adjudicate the historical record.",
    tag: "open-question",
  },
  {
    id: "inequality-result",
    route: "/inequality",
    title: "Symmetry in, inequality out",
    body:
      "Agents start with near-identical endowments and identical tastes. Yet once they specialize and trade, small differences in which good is scarce compound into large differences in wealth: the Gini coefficient climbs and the top decile's share grows. Turn trade off and inequality collapses back toward zero.",
    tag: "model-result",
  },
  {
    id: "inequality-rule",
    route: "/inequality",
    title: "How wealth is even measured here",
    body:
      "Wealth is the numéraire value of an agent's inventory at current relative prices, and inequality is the Gini of that across agents. There is no inheritance, no capital income, no luck shocks beyond trade matching. This is a deliberately thin notion of wealth.",
    tag: "simplification",
  },
  {
    id: "inequality-open",
    route: "/inequality",
    title: "Does real-world inequality arise this way?",
    body:
      "The model shows trade and specialization ALONE can turn equal starts into unequal ends. Real inequality also involves institutions, power, inheritance, and policy that this toy omits entirely. Whether the trade-and-specialization channel is large or small in the real economy is an open empirical question this sim cannot answer.",
    tag: "open-question",
  },
  {
    id: "gravity-law",
    route: "/gravity",
    title: "The gravity law of trade (the anchor)",
    body:
      "Tinbergen's gravity equation, one of the most empirically robust regularities in economics: bilateral trade between two places grows with the product of their economic sizes and falls with the distance between them — log(F) = a + b1·log(size_i) + b2·log(size_j) − β·log(distance). It is named by analogy to Newton's law; β is the distance-decay elasticity.",
    tag: "established-theory",
  },
  {
    id: "gravity-result",
    route: "/gravity",
    title: "What this sim produced: gravity, unscripted",
    body:
      "Nobody told these agents to obey gravity. Each one only trades with neighbors for goods it wants, and every inter-region trade pays a transport cost that rises with distance. From those local moves, the realized region-pair flows fall onto the gravity law: the live fit shows a positive distance-decay β and positive size coefficients with a high r². Set the transport cost to zero and the distance decay collapses — the decay is real, not baked in.",
    tag: "model-result",
  },
  {
    id: "gravity-rule",
    route: "/gravity",
    title: "How distance enters the model",
    body:
      "Distance is modeled as an iceberg transport cost: ship a good a long way and only a fraction arrives, the rest melts in transit. Region 'size' is simply the number of trading agents that live there. Real trade costs (tariffs, contracts, language, institutions) are far richer than one melting fraction — this is a deliberately thin stand-in for the cost of distance.",
    tag: "simplification",
  },
  {
    id: "ledger-intro",
    route: "/ledger",
    title: "The emergence ledger",
    body:
      "Each macro-phenomenon below is traced to the local rule it arises from, the closed-form anchor it is validated against, the in-app view where you can watch it, and an honest status. Nothing here is asserted without a route to see it and a ruler to check it.",
    tag: "model-result",
  },
];

// Banned overclaim phrases (AC10). The content-lint scans every non-established panel body+title;
// finding any of these is a FAIL. (Established-theory panels are exempt from the lint, but a
// blanket-established build still FAILS via the pinned-tag assertions.)
export const BANNED_PHRASES: readonly string[] = [
  "this proves the real economy",
  "markets are always efficient",
  "this is how the economy works",
] as const;

export function panelsForRoute(route: string): Panel[] {
  return PANELS.filter((p) => p.route === route);
}
