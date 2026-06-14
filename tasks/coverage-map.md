# Coverage map — AC → asserting test file(s)

Workstream A+B (pure economic sim core + numeric/anchor unit tests). Each acceptance
criterion below is proven by the listed test file(s); run `npx vitest run`.

| AC | Claim | Test file | Key assertions |
|----|-------|-----------|----------------|
| **AC1** | Pure-exchange Edgeworth convergence (contract curve, conservation, weak Pareto) | `tests/unit/exchange.test.ts` | ≥20 random 2×2 economies (frictionMode `none` + `market`): MRS gap ≤2%; goods conserved ≤1e-9 **each tick**; no agent below endowment utility; ≥1 agent strictly improves |
| **AC2** | Comparative advantage & gains from trade (Ricardo) | `tests/unit/ricardo.test.ts` | trade > autarky in total output **and** utility; each agent's production-HHI rises ≥0.15 toward its **comparative-advantage** good (most-grown good = CA good — absolute-advantage specialization fails); emergent avg rel price strictly inside the autarky-ratio bound (1,2) |
| **AC3** | Prices converge to the Walrasian p\* (anchor) | `tests/unit/walras.test.ts` | solver hits ‖excess demand‖ ≤1e-6 on a known closed-form 2×2 + asymmetric 3-good economy; a 12-agent/4-good ABM starts ≥50% rel-price error from p\* → final-window within 10% on ≥3 goods (measured reduction) **and** dispersion (CV) strictly falls first-quartile→last |
| **AC4** | Money emerges (Kiyotaki–Wright) | `tests/unit/money.test.ts` | symmetric 3-good ring, frictionMode `money`: top good's indirect-share <1.2× median (Q1) → ≥3× median sustained over final third, exactly one good (top >2.5× the 2nd); money-regime volume ≥20% > barter, welfare no lower (same seed); `none` control: no good's indirect-share >1.5× median |
| **AC5** | Inequality emerges from symmetry | `tests/unit/inequality.test.ts` | Gini exact on hand-worked vectors (equality→0, one-owns-all→(N−1)/N, [1,2,3,4]→0.25, ≤1e-9); top-decile share anchors; from ±5% symmetric endowments under trade Gini rises to ≥0.25 sustained final third + top-decile rises; trade-disabled control keeps Gini ≤0.05 |
| **AC6(a)** | Determinism — bit-identical macro series | `tests/unit/determinism.test.ts` | two same-seed runs produce byte-identical {relPrices, meanHHI, gini, topDecileShare, tradeVolume, totalUtility, indirectShare, priceDispersion} every tick over N steps (`market` + `money`); different seed ⇒ different trajectory |
| **AC6(b)/(c)** | GPU↔core parity ≤1% + fallback IS the core | `tests/unit/gpu-parity.test.ts`, `tests/e2e/gpu.spec.ts` | (c) `createDriver({backend:"auto"})` resolves to `cpu` with no hardware GPU and its aggregates are **bit-identical** to the pure `economy` core (60 ticks); `createDriver({backend:"cpu"})` deterministic same-seed; agent price inputs local-only. (b) where a hardware GPU exists, GPU↔core headline parity (relPrices/meanHHI/gini/indirectShare) ≤1% — asserted in `gpu.spec.ts` (real browser GPU), **skips-with-explicit-log** in Node / software-adapter env (never faked) |
| **AC7** | WebGPU scale (≥1e5 @ ≥10 ticks/s) + universal boot | `tests/e2e/gpu.spec.ts` + perf probe `runPerfProbe()` in `src/sim/gpu/index.ts` | GPU-on: ≥1e5 agents step ≥10 ticks/s + parity, recorded to `perf-report.json`; software/headless adapter is **rejected** so the app falls back to the pure CPU core (CI-safe, no compute wedge). Perf probe applies the GPU-less-CI override (CI / `EE_REDUCED_SCALE` / no-hardware-GPU ⇒ reduced scale, recorded honestly). WebGPU-OFF fallback-boots CI teeth = workstream D's journey spec |
| **AC12** | Emergence firewall (anchors validate, never drive) | `tests/unit/separation.test.ts` | (a) import-closure walk over economy/production/exchange/money/metrics/inequality asserts **no** transitive import of `walras.ts`; (b) behavioral — hash the seeded ABM transaction-price trajectory, call `clearingPrice()` on a **different** economy between runs, re-run → trajectory **bit-identical** |

## Exploratory demo (beyond the floor) — Quality Bar "Exploratory latitude used well"
| AC | Claim | Test file | Key assertions |
|----|-------|-----------|----------------|
| **Gravity** (Tinbergen) | Trade gravity emerges: bilateral region-pair flow F_ij fits log F = a + b1·log Sᵢ + b2·log Sⱼ − β·log Dᵢⱼ from local distance-sensitive trading | `tests/unit/gravity.test.ts`, `tests/e2e/gravity.spec.ts` | unit: 6-region spatial economy, transportCost>0 ⇒ **β>0** (distance decay), b1>0, b2>0, **r²≥0.6** (achieved ~0.885); **negative control** transportCost=0 ⇒ β≈0 (|β|<0.25); determinism (same seed ⇒ identical fit); `flowsFromMatrix`/`regionFlows` helpers + edge cases. e2e: `/gravity` renders scene + flow-arc map, live fitted β/r² advance, gravity LAW=established-theory + this-sim fit=model-result; ledger now lists 6 phenomena (`trade-gravity` → `/gravity` → validated). **M8** (zero the distance-decay factor in exchange.ts) kills the emergent-β assertion |

## Workstream D (renderer / app / interaction / ledger / content / e2e)
| AC | Claim | Test file | Key assertions |
|----|-------|-----------|----------------|
| **AC8** | Sim-driven, not canned (parameter causality) | `tests/e2e/causality.spec.ts` | freeze (paused canvas pixel-signature change ≤0.1%) / resume (≥1%); 3 magnitude laws read from `window.__ECON__.getAggregates()`: (i) `[transport]` ↑transportCost ⇒ ↓tradeVolume **and** ↑price dispersion (`--grep transport`, M6 target); (ii) ↑comparativeAdvantageGap ⇒ ↑meanHHI; (iii) tradeEnabled=false ⇒ totalUtility below the trade run |
| **AC9** | Emergence ledger | `tests/unit/ledger.test.ts`, `tests/e2e/ledger.spec.ts` | schema: all 5 phenomena mapped (≥1 local rule, named anchor, ≥1 real route, status, claim, tag) + generated `public/emergence.json` equals the canonical manifest; e2e: rendered ledger lists all 5 with status+tag+claim+live link, each linked view renders a canvas + a tagged panel, `/emergence.json` served 200 |
| **AC10** | Epistemic honesty (anti-overclaim) | `tests/unit/content.test.ts`, `tests/e2e/panels.spec.ts` | every panel exactly one valid tag (unit + e2e zero-untagged walk); pinned tags hold (CA/gains=established-theory, sim money/price/inequality outcomes=model-result, behavioral rules=simplification, "does it arise this way"=open-question); banned-overclaim lint over every non-established panel finds none; not-a-blanket-established build |
| **AC11** | Shipped, self-contained, usable | `tests/e2e/journey.spec.ts` | journey over all 6 views: 0 console errors + 0 cross-origin; WebGPU-OFF (`?cpu=1`) boots+renders+animates (backend=cpu, ticks advance) — the CI teeth; air-gapped boot (all cross-origin aborted) still renders landing + an emergence view; no horizontal overflow + every nav link in-viewport/clickable at 390px **and** 1440px; `three` load-bearing (WebGL canvas#scene renders) |

## Supporting coverage (shared helpers / seam)
| File | Test | Purpose |
|------|------|---------|
| `src/sim/metrics.ts` | `tests/unit/metrics.test.ts` | CobbDouglas utility, HHI, CV edge cases, wealth, meanRelPrices, indirectShareByGood |
| `src/sim/rng.ts` | `tests/unit/rng.test.ts` | seam: deterministic stream, range/int bounds, normal() distribution + spare-path determinism |

## src/sim coverage (E3: cores ≥90% lines)
`npx vitest run --coverage` → **All files 95.01% lines / 91.74% branches**. Every functional
module ≥90% lines (`economy` 100, `walras` 100, `inequality` 100, `money` 100, `rng` 100,
`metrics` 95.5, `production` 95.2, `exchange` 91.0). `types.ts` is pure type declarations
(0% runtime — no executable code).

## Notes
- **Mutation intents** (PRD §Mutation Tests) bite these files: M1→exchange (conservation),
  M2→production (comparative vs absolute), M3→walras (excess-demand sign), M4→money (indirect
  acceptance), M5→inequality (Gini normalization), M7→exchange (anchor-drives-agents). The
  `from`/`to` strings are pinned by the orchestrator in iteration 1.
- AC6(b)/(c)/AC7 (GPU↔core parity, scale, fallback) added by workstream C (`src/sim/gpu/**`). The
  GPU-on parity/perf limbs run only on hardware-GPU machines (`EE_WEBGPU_E2E=1`); headless CI only
  exposes a SwiftShader software adapter on which WebGPU compute wedges the page loop, so the driver
  rejects software adapters and the e2e skips-with-log. AC8–AC11 (renderer/app/ledger/content/ship)
  are workstream D.
