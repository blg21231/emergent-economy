// App entry (AC8/AC9/AC10/AC11). Boots the renderer, the live charts, the parameter controls, the
// epistemic panels and the emergence ledger, all driven by ONE SimController whose driver comes
// from createDriver (CPU fallback works everywhere — the CI-critical limb). The __ECON__ hook
// exposes the live aggregates the charts render, so the e2e causality laws are measured from the
// real visuals (AC8). Self-contained: no third-party requests, system fonts only (C3).
import "./style.css";
import * as THREE from "three";
import { SimController } from "./controls";
import { configFor } from "./controls";
import { installHook } from "./hook";
import { SpatialView } from "./render/spatial";
import { LineChart } from "./render/charts";
import { GravityMap } from "./render/gravity-map";
import { ROUTES, currentPath, onRouteChange, routeFor } from "./routes";
import { TAG_META, panelsForRoute, type Panel } from "../content/panels";
import { LEDGER } from "../content/emergence";
import { walrasianStar } from "./anchor";
import { fitGravity, flowsFromMatrix, type GravityFit } from "../sim/gravity";
import { GRAVITY_POSITIONS, GRAVITY_REGIONS, gravityRegionOf } from "./economies";
import type { EconomyConfig, SimDriver } from "../sim/types";

// Force the CPU backend when ?cpu=1 is present (the CI-critical WebGPU-OFF e2e limb, AC7/AC11).
const params = new URLSearchParams(window.location.search);
const forceCpu = params.get("cpu") === "1" || params.get("backend") === "cpu";

const root = document.getElementById("app")!;

// ── shell DOM ────────────────────────────────────────────────────────────────
root.innerHTML = `
  <header class="topbar">
    <div class="brand">Emergent Economy <small>— markets, money & specialization, self-organized</small></div>
    <nav class="routes" id="nav"></nav>
  </header>
  <div id="content"></div>
  <footer class="foot">A seeded, deterministic agent simulation. Every macro pattern is computed from local rules and checked against a closed-form economic anchor. <span id="backend-tag"></span></footer>
`;

const nav = document.getElementById("nav")!;
for (const r of ROUTES) {
  const a = document.createElement("a");
  a.textContent = r.label;
  a.dataset.path = r.path;
  a.href = `#${r.path}`;
  nav.appendChild(a);
}

const content = document.getElementById("content")!;
const backendTag = document.getElementById("backend-tag")!;

// ── controller + hook ──────────────────────────────────────────────────────────
const controller = new SimController(
  { view: routeFor(currentPath()).view },
  { backend: forceCpu ? "cpu" : "auto", scale: forceCpu ? 4000 : 1e5 },
);

let spatial: SpatialView | null = null;
let charts: LineChart[] = [];
let dominantGood: Uint8Array = new Uint8Array(0);
let renderHandle = 0;

installHook(controller);

function setNavActive(path: string): void {
  const links = nav.querySelectorAll("a");
  links.forEach((l) => {
    const el = l as HTMLAnchorElement;
    el.classList.toggle("active", el.dataset.path === path);
  });
}

/** Per-agent dominant good from the active config's productivity (the economy's true structure). */
function computeDominantGood(cfg: EconomyConfig): Uint8Array {
  const out: Uint8Array = new Uint8Array(cfg.n);
  const prod = cfg.productivity;
  for (let i = 0; i < cfg.n; i++) {
    if (prod && prod[i]) {
      let best = 0;
      for (let k = 1; k < cfg.g; k++) if (prod[i][k] > prod[i][best]) best = k;
      out[i] = best;
    } else out[i] = i % cfg.g;
  }
  return out;
}

// ── view renderers ─────────────────────────────────────────────────────────────
function clearLoop(): void {
  if (renderHandle) cancelAnimationFrame(renderHandle);
  renderHandle = 0;
  spatial?.dispose();
  spatial = null;
  charts = [];
}

function renderLedgerView(): void {
  clearLoop();
  const cards = LEDGER.map((e) => `
    <article class="ledger-card" data-phenomenon="${e.phenomenon}" data-tag="${e.tag}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <h3>${e.title}</h3>
        <span class="status ${e.status}">${e.status}</span>
      </div>
      <span class="etag ${e.tag}" data-etag="${e.tag}">${TAG_META[e.tag].label}</span>
      <p class="claim">${e.claim}</p>
      <dl>
        <dt>Local rule(s)</dt><dd>${e.localRules.join("; ")}</dd>
        <dt>Validated against</dt><dd>${e.anchor}</dd>
        <dt>See it live</dt><dd>${e.routes
          .map((rt) => `<a class="golink" href="#${rt}">${rt}</a>`)
          .join(" · ")}</dd>
      </dl>
    </article>`).join("");
  content.innerHTML = `
    <section class="ledger">
      <div class="hero" style="padding:0">
        <h1>Emergence ledger</h1>
        <p class="lede">Each emergent phenomenon, traced to the local rule it arises from, the closed-form anchor it is checked against, the view where you can watch it, and an honest status.</p>
      </div>
      <div class="ledger-grid">${cards}</div>
      <div class="panels" id="ledger-panels"></div>
    </section>`;
  renderPanels(document.getElementById("ledger-panels")!, panelsForRoute("/ledger"));
}

function renderGravityView(): void {
  clearLoop();
  const cfg = configFor(controller.getParams());
  dominantGood = computeDominantGood(cfg);

  content.innerHTML = `
    <main class="stage">
      <div class="viewport">
        <canvas id="scene"></canvas>
        <canvas id="gravity-map" class="gravity-map"></canvas>
        <div class="overlay" id="kpis"></div>
        <div class="fit-readout" id="fit"></div>
      </div>
      <aside class="sidebar">
        <div class="controls" id="controls"></div>
        <div class="panels" id="panels"></div>
      </aside>
    </main>`;

  // keep `three` load-bearing on this route too (canvas#scene renders the trading population);
  // the gravity flow arcs draw on the 2D overlay canvas above it.
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  spatial = new SpatialView(canvas);
  spatial.build(cfg.n, cfg.g);

  const mapCanvas = document.getElementById("gravity-map") as HTMLCanvasElement;
  const map = new GravityMap(mapCanvas);
  map.resize();

  buildControls(document.getElementById("controls")!, "gravity");
  renderPanels(document.getElementById("panels")!, panelsForRoute("/gravity"));

  const kpis = document.getElementById("kpis")!;
  const fitEl = document.getElementById("fit")!;
  const regionOf = gravityRegionOf();
  const sizes = (() => {
    const s = new Array(GRAVITY_REGIONS).fill(0);
    for (const r of regionOf) s[r] += 1;
    return s;
  })();

  const loop = (): void => {
    controller.tick();
    const agg = controller.aggregates();
    if (spatial) {
      spatial.update(agg, dominantGood);
      spatial.render();
    }
    const matrix = controller.getDriver().tradeFlow?.() ?? null;
    const flows = flowsFromMatrix(matrix, regionOf, GRAVITY_POSITIONS, sizes);
    const fit: GravityFit = fitGravity(flows, GRAVITY_POSITIONS);
    map.draw(flows);
    kpis.innerHTML = `
      <div class="kpi"><b>${agg.tick}</b><span>tick</span></div>
      <div class="kpi"><b>${fit.beta.toFixed(2)}</b><span>distance decay β</span></div>
      <div class="kpi"><b>${fit.r2.toFixed(2)}</b><span>gravity fit r²</span></div>`;
    fitEl.innerHTML = `
      <div class="fit-title">Live gravity fit</div>
      <code data-fit-beta="${fit.beta.toFixed(3)}" data-fit-r2="${fit.r2.toFixed(3)}">log F = ${fit.a.toFixed(2)}
        + ${fit.b1.toFixed(2)}·log Sᵢ + ${fit.b2.toFixed(2)}·log Sⱼ − ${fit.beta.toFixed(2)}·log Dᵢⱼ
        &nbsp; (r² = ${fit.r2.toFixed(2)})</code>`;
    renderHandle = requestAnimationFrame(loop);
  };
  renderHandle = requestAnimationFrame(loop);
}

function renderEconomyView(path: string): void {
  clearLoop();
  const route = routeFor(path);
  const cfg = configFor(controller.getParams());
  dominantGood = computeDominantGood(cfg);

  const isLanding = !!route.landing;
  content.innerHTML = `
    ${isLanding ? `<div class="hero"><h1>Watch an economy assemble itself</h1><p class="lede">No central planner sets a price, assigns a job, or designs a currency. Each agent only sees its own basket, its tastes, and the neighbors it can reach. From those local moves, the macro-economy emerges — and every claim is checked against a closed-form anchor.</p></div>` : ""}
    <main class="stage">
      <div class="viewport">
        <canvas id="scene"></canvas>
        <div class="overlay" id="kpis"></div>
      </div>
      <aside class="sidebar">
        <div class="controls" id="controls"></div>
        <div class="charts" id="charts"></div>
        <div class="panels" id="panels"></div>
      </aside>
    </main>`;

  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  spatial = new SpatialView(canvas);
  spatial.build(cfg.n, cfg.g);

  buildControls(document.getElementById("controls")!, route.view);
  buildCharts(document.getElementById("charts")!, route.view, cfg);
  renderPanels(document.getElementById("panels")!, panelsForRoute(isLanding ? "/" : path));

  const kpis = document.getElementById("kpis")!;
  const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));

  // ── render loop: step the sim (unless paused) and redraw from the SAME aggregates. ──
  const loop = (): void => {
    controller.tick();
    const agg = controller.aggregates();
    if (spatial) {
      spatial.update(agg, dominantGood);
      spatial.render();
    }
    for (const ch of charts) ch.draw();
    pushChartData(route.view, agg);
    kpis.innerHTML = kpiHtml(route.view, agg, fmt);
    renderHandle = requestAnimationFrame(loop);
  };
  // seed chart series before first draw so something is visible immediately.
  pushChartData(route.view, controller.aggregates());
  renderHandle = requestAnimationFrame(loop);
}

function kpiHtml(view: string, agg: ReturnType<SimController["aggregates"]>, fmt: (v: number) => string): string {
  const cells: { label: string; value: string }[] = [];
  cells.push({ label: "tick", value: String(agg.tick) });
  cells.push({ label: "trade volume", value: fmt(agg.tradeVolume) });
  if (view === "specialization") {
    cells.push({ label: "mean HHI", value: agg.meanHHI.toFixed(3) });
    cells.push({ label: "welfare", value: fmt(agg.totalUtility) });
  } else if (view === "prices") {
    cells.push({ label: "rel price g1", value: agg.relPrices[1]?.toFixed(3) ?? "—" });
    cells.push({ label: "dispersion g1", value: (agg.priceDispersion[1] ?? 0).toFixed(3) });
  } else if (view === "money") {
    let top = 0;
    for (let i = 0; i < agg.indirectShare.length; i++) top = Math.max(top, agg.indirectShare[i]);
    cells.push({ label: "top money-share", value: top.toFixed(2) });
    cells.push({ label: "welfare", value: fmt(agg.totalUtility) });
  } else if (view === "inequality") {
    cells.push({ label: "Gini", value: agg.gini.toFixed(3) });
    cells.push({ label: "top-decile", value: agg.topDecileShare.toFixed(2) });
  }
  return cells.map((c) => `<div class="kpi"><b>${c.value}</b><span>${c.label}</span></div>`).join("");
}

// ── charts ───────────────────────────────────────────────────────────────────
function buildCharts(host: HTMLElement, view: string, cfg: EconomyConfig): void {
  charts = [];
  host.innerHTML = "";
  const mk = (opts: ConstructorParameters<typeof LineChart>[1]): LineChart => {
    const c = document.createElement("canvas");
    c.className = "chart";
    host.appendChild(c);
    const chart = new LineChart(c, opts);
    charts.push(chart);
    return chart;
  };

  if (view === "prices") {
    const star = walrasianStar(cfg);
    const refs = [] as { value: number; label: string; color?: string }[];
    for (let i = 1; i < cfg.g; i++) refs.push({ value: star[i], label: `p*${i}`, color: i === 1 ? "#ffffff" : "#cbd5f5" });
    mk({ title: "Relative prices → p*", lineLabels: labelsFor("g", cfg.g - 1), refs });
    mk({ title: "Price dispersion (CV)", lineLabels: labelsFor("g", cfg.g - 1), yMin: 0 });
  } else if (view === "money") {
    mk({ title: "Indirect-exchange share (money signal)", lineLabels: labelsFor("good ", cfg.g), yMin: 0, yMax: 1 });
    mk({ title: "Trade volume", lineLabels: ["volume"], yMin: 0 });
  } else if (view === "inequality") {
    mk({ title: "Gini coefficient", lineLabels: ["Gini"], yMin: 0, yMax: 1 });
    mk({ title: "Top-decile wealth share", lineLabels: ["top decile"], yMin: 0, yMax: 1 });
  } else {
    mk({ title: "Mean production HHI (specialization)", lineLabels: ["mean HHI"], yMin: 0, yMax: 1 });
    mk({ title: "Total welfare", lineLabels: ["welfare"] });
  }
}

function pushChartData(view: string, agg: ReturnType<SimController["aggregates"]>): void {
  if (charts.length === 0) return;
  if (view === "prices") {
    const rel: number[] = [];
    const disp: number[] = [];
    for (let i = 1; i < agg.relPrices.length; i++) {
      rel.push(agg.relPrices[i]);
      disp.push(agg.priceDispersion[i] ?? 0);
    }
    charts[0].push(agg.tick, rel);
    charts[1].push(agg.tick, disp);
  } else if (view === "money") {
    charts[0].push(agg.tick, Array.from(agg.indirectShare));
    charts[1].push(agg.tick, [agg.tradeVolume]);
  } else if (view === "inequality") {
    charts[0].push(agg.tick, [agg.gini]);
    charts[1].push(agg.tick, [agg.topDecileShare]);
  } else {
    charts[0].push(agg.tick, [agg.meanHHI]);
    charts[1].push(agg.tick, [agg.totalUtility]);
  }
}

function labelsFor(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_v, i) => `${prefix}${prefix.endsWith(" ") ? i : i + 1}`);
}

// ── controls (live parameter setters, AC8) ──────────────────────────────────────
function buildControls(host: HTMLElement, view: string): void {
  const p = controller.getParams();
  const rebuild = (): void => {
    // after a parameter change the driver is rebuilt; rebind charts/series + spatial cloud.
    const cfg = configFor(controller.getParams());
    dominantGood = computeDominantGood(cfg);
    spatial?.build(cfg.n, cfg.g);
    // the gravity view has no chart host (it draws the flow map instead); skip chart rebind there.
    const chartHost = document.getElementById("charts");
    if (chartHost) buildCharts(chartHost, view, cfg);
  };

  const rows: string[] = [`<h3>Live parameters</h3>`];
  rows.push(`
    <div class="ctl">
      <label>Transport / trade cost <span id="tc-val">${p.transportCost.toFixed(2)}</span></label>
      <input type="range" id="tc" min="0" max="0.9" step="0.05" value="${p.transportCost}" />
    </div>`);
  if (view === "specialization") {
    rows.push(`
      <div class="ctl">
        <label>Comparative-advantage gap <span id="cag-val">${p.comparativeAdvantageGap.toFixed(2)}</span></label>
        <input type="range" id="cag" min="0" max="1" step="0.05" value="${p.comparativeAdvantageGap}" />
      </div>`);
  }
  if (view === "money") {
    rows.push(`
      <div class="ctl">
        <label>Friction regime</label>
        <select class="sel" id="friction">
          <option value="money">money (re-trade allowed)</option>
          <option value="barter">barter (direct only)</option>
          <option value="none">none (frictionless)</option>
        </select>
      </div>`);
  }
  rows.push(`
    <div class="ctl"><div class="row">
      <button class="btn" id="trade-toggle" aria-pressed="${p.tradeEnabled}">Trade: ${p.tradeEnabled ? "ON" : "OFF (autarky)"}</button>
      <button class="btn" id="pause-toggle" aria-pressed="${controller.isPaused()}">${controller.isPaused() ? "Resume" : "Pause"}</button>
    </div></div>`);
  host.innerHTML = rows.join("");

  const tc = host.querySelector<HTMLInputElement>("#tc")!;
  tc.addEventListener("input", () => {
    host.querySelector("#tc-val")!.textContent = Number(tc.value).toFixed(2);
  });
  tc.addEventListener("change", async () => {
    await controller.setTransportCost(Number(tc.value));
    rebuild();
  });

  const cag = host.querySelector<HTMLInputElement>("#cag");
  if (cag) {
    cag.addEventListener("input", () => {
      host.querySelector("#cag-val")!.textContent = Number(cag.value).toFixed(2);
    });
    cag.addEventListener("change", async () => {
      await controller.setComparativeAdvantageGap(Number(cag.value));
      rebuild();
    });
  }

  const friction = host.querySelector<HTMLSelectElement>("#friction");
  if (friction) {
    friction.value = p.frictionMode;
    friction.addEventListener("change", async () => {
      await controller.setFrictionMode(friction.value as never);
      rebuild();
    });
  }

  const tradeBtn = host.querySelector<HTMLButtonElement>("#trade-toggle")!;
  tradeBtn.addEventListener("click", async () => {
    const next = !controller.getParams().tradeEnabled;
    await controller.setTradeEnabled(next);
    tradeBtn.textContent = `Trade: ${next ? "ON" : "OFF (autarky)"}`;
    tradeBtn.setAttribute("aria-pressed", String(next));
    rebuild();
  });

  const pauseBtn = host.querySelector<HTMLButtonElement>("#pause-toggle")!;
  pauseBtn.addEventListener("click", () => {
    const next = !controller.isPaused();
    controller.setPaused(next);
    pauseBtn.textContent = next ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(next));
  });
}

// ── panels (epistemic content, AC10) ────────────────────────────────────────────
function renderPanels(host: HTMLElement, panels: Panel[]): void {
  host.innerHTML = panels
    .map(
      (p) => `
      <article class="panel" data-panel-id="${p.id}">
        <span class="etag ${p.tag}" data-etag="${p.tag}">${TAG_META[p.tag].label}</span>
        <h2>${p.title}</h2>
        ${p.body
          .split("\n\n")
          .map((para) => `<p>${escapeHtml(para)}</p>`)
          .join("")}
      </article>`,
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

// ── routing ─────────────────────────────────────────────────────────────────────
async function route(): Promise<void> {
  const path = currentPath();
  setNavActive(path);
  // switch the controller's economy to this route's view (rebuilds the driver) then render.
  const view = routeFor(path).view;
  if (controller.getParams().view !== view) {
    await controller.setView(view);
  }
  if (path === "/ledger") renderLedgerView();
  else if (path === "/gravity") renderGravityView();
  else renderEconomyView(path);
}

onRouteChange(() => {
  void route();
});

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  await controller.init();
  const d: SimDriver = controller.getDriver();
  backendTag.textContent = `Backend: ${d.backend} · ${d.agentCount()} agents · three r${THREE.REVISION}`;
  await route();
}

void boot();
