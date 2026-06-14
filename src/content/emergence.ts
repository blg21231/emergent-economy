// Emergence ledger (AC9). A machine-readable manifest mapping EACH of the five emergent
// phenomena -> the local rule(s) it arises from -> the named closed-form anchor it is validated
// against -> >=1 in-app route that demonstrates it live -> a status ∈ {validated|partial|illustrative}.
//
// The unit schema test (tests/unit/ledger.test.ts) asserts all five are present and well-formed;
// the e2e ledger walk visits each entry's route and confirms the linked view renders + visibly
// contains its claim + an epistemic tag. `emergence.json` is generated from this same source
// (scripts/gen-emergence.ts -> public/emergence.json) so the manifest is a build artifact, not a
// hand-edited file that can drift.

import type { EpistemicTag } from "./panels";

export type Phenomenon =
  | "gains-from-trade"
  | "specialization"
  | "price-convergence"
  | "commodity-money"
  | "inequality"
  | "trade-gravity";

export type LedgerStatus = "validated" | "partial" | "illustrative";

export interface LedgerEntry {
  phenomenon: Phenomenon;
  title: string;
  /** >=1 local rule the phenomenon arises from. */
  localRules: string[];
  /** The named closed-form anchor it is validated against. */
  anchor: string;
  /** >=1 in-app route/view that demonstrates it live. */
  routes: string[];
  status: LedgerStatus;
  /** The headline claim this view makes (shown verbatim in the ledger + linked view). */
  claim: string;
  /** Epistemic tag for the ledger row. */
  tag: EpistemicTag;
}

export const PHENOMENA: readonly Phenomenon[] = [
  "gains-from-trade",
  "specialization",
  "price-convergence",
  "commodity-money",
  "inequality",
  "trade-gravity",
] as const;

export const LEDGER: readonly LedgerEntry[] = [
  {
    phenomenon: "gains-from-trade",
    title: "Gains from trade",
    localRules: [
      "agents accept any mutually utility-improving bilateral swap",
      "production migrates toward the locally most-profitable good",
    ],
    anchor: "Edgeworth contract curve (MRS equalization, Pareto-improving)",
    routes: ["/specialization"],
    status: "validated",
    claim:
      "An open economy reaches higher total output and utility than the same economy in autarky — gains from trade are strictly positive.",
    tag: "model-result",
  },
  {
    phenomenon: "specialization",
    title: "Specialization along comparative advantage",
    localRules: [
      "each agent shifts labor toward its highest revenue-per-effort good at local prices",
    ],
    anchor: "Ricardian comparative advantage (autarky-price bound + HHI rise)",
    routes: ["/specialization"],
    status: "validated",
    claim:
      "Production concentration (HHI) rises and each agent specializes toward its comparative-advantage good, with the emergent price inside the Ricardian bound.",
    tag: "model-result",
  },
  {
    phenomenon: "price-convergence",
    title: "Convergence to the clearing price",
    localRules: [
      "posted prices grope up or down with the sign of locally-observed excess demand (tâtonnement from realized trades)",
    ],
    anchor: "Walrasian clearing price p* (excess demand = 0)",
    routes: ["/prices"],
    status: "validated",
    claim:
      "Transaction prices start far from equilibrium and converge to within 10% of the independently-solved Walrasian p*, with dispersion strictly falling.",
    tag: "model-result",
  },
  {
    phenomenon: "commodity-money",
    title: "Spontaneous commodity money",
    localRules: [
      "an agent accepts a non-consumed good to re-trade when no direct double-coincidence swap exists",
      "marketability belief reinforces from observed re-trade flow",
    ],
    anchor: "Kiyotaki–Wright indirect-share separation (+ no-friction control)",
    routes: ["/money"],
    status: "validated",
    claim:
      "Exactly one good's indirect-exchange share separates to dominate under friction, and no good separates without it — money self-selects.",
    tag: "model-result",
  },
  {
    phenomenon: "inequality",
    title: "Inequality from symmetry",
    localRules: [
      "specialization concentrates each agent on a single good whose relative scarcity sets its terms of trade",
    ],
    anchor: "Gini coefficient (+ trade-disabled control)",
    routes: ["/inequality"],
    status: "validated",
    claim:
      "Near-identical starts under trade produce a sustained Gini >= 0.25 and a heavier tail; the trade-disabled control stays near zero.",
    tag: "model-result",
  },
  {
    phenomenon: "trade-gravity",
    title: "Trade gravity (size × size ÷ distance)",
    localRules: [
      "agents trade bilaterally with neighbors across regions for goods they want",
      "inter-region trade carries an iceberg transport cost that rises with distance (cost ∝ transportCost·distance)",
    ],
    anchor: "Tinbergen gravity model (log F_ij = a + b1·log S_i + b2·log S_j − β·log D_ij)",
    routes: ["/gravity"],
    status: "validated",
    claim:
      "Bilateral region-pair trade flow EMERGES to fit the gravity law — it grows with both regions' size and decays with distance (β>0, r²≥0.6); remove the distance cost and the decay vanishes.",
    tag: "model-result",
  },
];

export interface EmergenceManifest {
  generatedFrom: string;
  phenomena: LedgerEntry[];
}

/** The serializable manifest written to public/emergence.json. */
export function buildManifest(): EmergenceManifest {
  return {
    generatedFrom: "src/content/emergence.ts",
    phenomena: [...LEDGER],
  };
}
