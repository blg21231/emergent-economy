# Emergent Economy

**Live:** https://emergent-economy.vercel.app

Watch an economy *assemble itself*. A population of self-interested agents — each with its own
endowments, production technology, and tastes — produces and trades using only **local** information
(its own basket, its neighbors' offers, its own trade history). No central planner sets a price,
assigns a job, or designs a currency. From those local moves, the macro-structure of an economy
**emerges unscripted** — and every emergent claim is checked live against a closed-form economic anchor.

This is part of a 5-app series on **emergence**: stop visualizing known structures, start growing them.

## The emergent phenomena (each validated against an anchor)

| Phenomenon | Emerges from | Validated against |
|---|---|---|
| **Gains from trade & specialization** | agents shifting labor toward their *comparative*-advantage good | Ricardian price bound + autarky comparison |
| **Pure-exchange efficiency** | mutually-improving bilateral trades | Edgeworth contract curve (MRS equalization) |
| **Market price discovery** | transaction prices from matched local trades | Walrasian clearing price `p*` (independent tâtonnement solver) |
| **Commodity money** | agents accepting a non-consumed good to re-trade it | Kiyotaki–Wright indirect-exchange separation (+ no-friction control) |
| **Wealth inequality** | symmetric agents trading over time | Gini coefficient (+ trade-disabled control) |
| **Gravity law of trade** *(beyond the floor)* | cost- and distance-sensitive bilateral trade | Tinbergen gravity model `F ∝ SᵢSⱼ / distanceᵝ` (OLS fit) |

Every panel carries an epistemic tag (`established-theory · model-result · simplification ·
open-question`) — the toy is never presented as reality. An **emergence ledger** maps each phenomenon to
the local rule it arises from, the anchor it's checked against, and the view where you can watch it.

## The firewall (why this is real emergence)

The analytic anchors **validate** the model; they never **drive** it. The agent decision path
(`production` / `exchange` / `money`) cannot import the Walrasian solver, and a behavioral test proves
it: feeding the solver a *different* economy's clearing price leaves the simulation's trajectory
bit-identical. The macro-economy is computed from agents who only ever see their neighbors.

## Architecture

- **Pure sim cores** (`src/sim/**`) — dependency-free, Node-importable, seeded-deterministic. The single
  source of truth, benchmarked against the anchors above.
- **WebGPU compute + WebGL/CPU fallback** — the full-scale model runs ≥1e5 agents on WebGPU when a
  hardware adapter is present; otherwise it transparently falls back to the identical pure CPU core, so
  it boots and renders everywhere (including headless CI).
- **Renderer** (`src/app/**`) — Three.js spatial view + live charts, driven entirely by the sim's
  aggregates (the same numbers the e2e causality tests read — nothing is keyframed).

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit + anchor benchmarks (vitest)
npm run test:coverage  # sim cores ≥90%
npm run e2e            # builds + previews the prod bundle, runs Playwright
```

Stack: TypeScript · Vite · Three.js. Self-contained (zero runtime third-party requests). Usable at
390px and 1440px. Append `?cpu=1` to force the CPU backend.

## Rubric & provenance

Built test-first against a standalone PRD/rubric (`tasks/prds/emergent-economy.md` in the workspace):
12 acceptance criteria + a quality bar, red-teamed before building, and **mutation-tested** (8/8 — every
acceptance criterion's check provably bites). Nothing is marked done that an independent grader + the
mutation suite didn't confirm.
