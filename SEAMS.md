# Build seams & workstream ownership — `emergent-economy`

The orchestrator owns `src/sim/types.ts` (the canonical contract), `src/sim/rng.ts`, and all build/CI
config. Builders honor these signatures exactly; additive fields are fine, signature changes must be flagged.

## Architecture invariants (PRD C5 / AC12)
- `src/sim/**` = **pure** cores: no DOM, no WebGPU/WebGL, importable in bare Node.
- The **renderer** (`src/app/**`) and **GPU path** (`src/sim/gpu/**`) consume the cores; never the reverse.
- **Firewall (AC12):** the agent decision path — `production.ts`, `exchange.ts`, `money.ts` — MUST NOT
  import `walras.ts` (the analytic anchor solver) or any precomputed equilibrium value, directly or
  transitively. The solver validates; it never drives the agents.
- Macro `Aggregates` (types.ts) is the **single** source both the charts and the e2e causality specs read
  (AC8). No separate hidden probe.

## Workstreams (disjoint files + ACs)

### A — Core engine (foundational; provides the economy seam)
- Files: `src/sim/economy.ts` (implements `EconomyCore`), `src/sim/exchange.ts`, `src/sim/production.ts`,
  `src/sim/metrics.ts` (HHI/utility helpers shared).
- ACs: **AC1** (Edgeworth contract-curve convergence + conservation), **AC2** (Ricardo gains/HHI/price-bound),
  **AC12** (firewall: no solver import + perturbed-p\* ⇒ identical trajectory).
- Tests: `tests/unit/exchange.test.ts`, `tests/unit/ricardo.test.ts`, `tests/unit/separation.test.ts`.

### B — Anchors, money, inequality
- Files: `src/sim/walras.ts` (independent tâtonnement clearing-price solver — NOT imported by A's decision
  path), `src/sim/money.ts`, `src/sim/inequality.ts`.
- ACs: **AC3** (Walrasian p\* + ABM convergence from ≥50% error → ≤10%), **AC4** (Kiyotaki–Wright money
  emergence + no-friction control), **AC5** (Gini correctness + emergence ≥0.25 + trade-disabled control ≤0.05).
- Tests: `tests/unit/walras.test.ts`, `tests/unit/money.test.ts`, `tests/unit/inequality.test.ts`.

### C — GPU compute + determinism + scale/fallback
- Files: `src/sim/gpu/webgpu-economy.ts` (≥1e5 agents on WebGPU compute, reproduces the pure core),
  `src/sim/gpu/index.ts` (capability detect + fallback wiring to the pure core).
- ACs: **AC6** (determinism + GPU↔core ≤1% on relPrices/meanHHI/gini/indirectShare), **AC7** (1e5 perf
  probe with a GPU-less CI env override; WebGPU-off fallback boots).
- Tests: `tests/unit/determinism.test.ts`, `tests/unit/gpu-parity.test.ts` (skips-with-log when no GPU in Node).

### D — Renderer, app, interaction, ledger, content
- Files: `src/app/main.ts`, `src/app/render/*` (Three.js spatial view + charts), `src/app/controls.ts`,
  `src/app/routes.ts`, `src/app/hook.ts` (window.__ECON__), `src/content/panels.ts` (epistemic tags),
  `src/content/emergence.ts` (+ `emergence.json` ledger), `index.html`.
- ACs: **AC8** (sim-driven + 3 causality laws read from `__ECON__` chart aggregates), **AC9** (emergence
  ledger), **AC10** (epistemic tags + banned-phrase lint), **AC11** (ship/self-contained/usable).
- Tests: `tests/e2e/*.spec.ts` (journey, causality, fallback, ledger, panel-tags, airgap, viewports),
  `tests/unit/content.test.ts` (tag schema + banned-phrase lint), `tests/unit/ledger.test.ts`.

## Build order
1. Orchestrator: scaffold + seams (done).
2. Round 1 (parallel): **A** + **B** — the full economic model + all numeric ACs.
3. Integrate + mutation-test the numeric core.
4. Round 2 (parallel): **C** + **D** — GPU/scale + renderer/app/content/e2e (build on the green core).
5. Integrate → evaluator → loop → CI → Vercel → smoke.
