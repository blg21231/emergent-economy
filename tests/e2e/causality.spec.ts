// AC8 — sim-driven, not canned (parameter causality). On the LIVE app:
//  - freeze/resume: pausing the sim clock holds the rendered economy still (<=0.1% pixel change
//    between frames); resuming changes >=1%;
//  - 3 parameter-causality magnitude laws, each measured from window.__ECON__.getAggregates()
//    (the SAME aggregates the on-screen charts render):
//      (i)  [transport] raising transportCost reduces trade volume AND raises price dispersion;
//      (ii) raising comparativeAdvantageGap raises mean production-HHI;
//      (iii) trade OFF (autarky) collapses total welfare below the trade run.
//
// Mutation M6 targets limb (i): run with `--grep transport`.
import { test, expect, type Page } from "@playwright/test";

const BACKEND = "?cpu=1";

/** Set a live parameter via the hook (rebuilds the driver) and let it run `ticks` sim steps. */
async function setParamAndRun(page: Page, name: string, value: number | boolean, minTicks: number): Promise<void> {
  await page.evaluate(({ n, v }) => window.__ECON__?.setParam(n as never, v as never), { n: name, v: value });
  // the rebuild is async; poll until the new driver has stepped past `minTicks`.
  await page.waitForFunction(
    (m) => (window.__ECON__?.ticks() ?? 0) >= m,
    minTicks,
    { timeout: 30_000, polling: 100 },
  );
}

async function aggregates(page: Page): Promise<{
  tradeVolume: number; meanHHI: number; totalUtility: number;
  priceDispersion: number[]; relPrices: number[]; gini: number;
}> {
  return page.evaluate(() => {
    const a = window.__ECON__!.getAggregates();
    return {
      tradeVolume: a.tradeVolume,
      meanHHI: a.meanHHI,
      totalUtility: a.totalUtility,
      priceDispersion: Array.from(a.priceDispersion),
      relPrices: Array.from(a.relPrices),
      gini: a.gini,
    };
  });
}

/** Mean dispersion over the non-numéraire goods. */
function meanDispersion(d: number[]): number {
  let s = 0;
  let c = 0;
  for (let i = 1; i < d.length; i++) {
    s += d[i];
    c++;
  }
  return c > 0 ? s / c : 0;
}

test.describe("AC8 freeze / resume (the macro visuals are computed, not keyframed)", () => {
  test("pausing holds the canvas still; resuming changes it", async ({ page }) => {
    await page.goto(`/${BACKEND}#/specialization`);
    await expect(page.locator("canvas#scene")).toBeVisible();
    await page.waitForTimeout(600); // let the economy develop a visible state.

    const shot = async () => (await page.locator("canvas#scene").screenshot()).toString("base64");
    const diffPct = (a: string, b: string): number => {
      // base64 string-level diff is a coarse proxy; use raw pixel diff instead.
      return a === b ? 0 : 100;
    };
    void diffPct;

    // freeze.
    await page.evaluate(() => window.__ECON__?.setPaused(true));
    await page.waitForTimeout(150);
    const frozenA = await pixelHash(page);
    await page.waitForTimeout(400);
    const frozenB = await pixelHash(page);
    const frozenChange = pixelChangePct(frozenA, frozenB);
    expect(frozenChange, `frozen change ${frozenChange}%`).toBeLessThanOrEqual(0.1);
    void shot;

    // resume.
    await page.evaluate(() => window.__ECON__?.setPaused(false));
    await page.waitForTimeout(600);
    const resumed = await pixelHash(page);
    const resumedChange = pixelChangePct(frozenB, resumed);
    expect(resumedChange, `resumed change ${resumedChange}%`).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Average the chart-backing aggregates over a window of live ticks. The render loop keeps stepping,
 * so a single snapshot is noisy; averaging makes the transport causality law noise-robust and gives
 * the mutation (transportCost pinned to 0) a margin it cannot pass. (M6 lesson.)
 */
async function avgAggregates(
  page: Page,
  samples: number,
  gapMs: number,
): Promise<{ vol: number; disp: number }> {
  const vols: number[] = [];
  const disps: number[] = [];
  for (let i = 0; i < samples; i++) {
    const a = await aggregates(page);
    vols.push(a.tradeVolume);
    disps.push(meanDispersion(a.priceDispersion));
    await page.waitForTimeout(gapMs);
  }
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { vol: mean(vols), disp: mean(disps) };
}

test.describe("AC8 causality law (i) [transport]", () => {
  test("transport raises -> trade volume falls AND inter-region price dispersion rises", async ({ page }) => {
    await page.goto(`/${BACKEND}#/prices`);
    await expect(page.locator("canvas#scene")).toBeVisible();

    await setParamAndRun(page, "transportCost", 0, 150);
    const low = await avgAggregates(page, 15, 40);

    await setParamAndRun(page, "transportCost", 0.6, 150);
    const high = await avgAggregates(page, 15, 40);

    // Dispersion rises MATERIALLY (>=10%): the noise-robust killer — if transport is decoupled
    // (pinned to 0), low≈high and this margin cannot be met. Volume also falls.
    expect(
      high.disp,
      `disp low=${low.disp} high=${high.disp}`,
    ).toBeGreaterThan(low.disp * 1.1 + 1e-9);
    expect(high.vol, `vol low=${low.vol} high=${high.vol}`).toBeLessThan(low.vol);
  });
});

test.describe("AC8 causality law (ii) comparative-advantage gap", () => {
  test("raising the comparative-advantage gap raises mean production-HHI", async ({ page }) => {
    await page.goto(`/${BACKEND}#/specialization`);
    await expect(page.locator("canvas#scene")).toBeVisible();

    await setParamAndRun(page, "comparativeAdvantageGap", 0.1, 150);
    const small = await aggregates(page);

    await setParamAndRun(page, "comparativeAdvantageGap", 1.0, 150);
    const large = await aggregates(page);

    expect(large.meanHHI, `HHI small=${small.meanHHI} large=${large.meanHHI}`).toBeGreaterThan(small.meanHHI);
  });
});

test.describe("AC8 causality law (iii) autarky welfare", () => {
  test("turning trade OFF collapses total welfare below the trade run", async ({ page }) => {
    await page.goto(`/${BACKEND}#/specialization`);
    await expect(page.locator("canvas#scene")).toBeVisible();

    await setParamAndRun(page, "tradeEnabled", true, 200);
    const trade = await aggregates(page);

    await setParamAndRun(page, "tradeEnabled", false, 200);
    const autarky = await aggregates(page);

    expect(autarky.totalUtility, `welfare trade=${trade.totalUtility} autarky=${autarky.totalUtility}`).toBeLessThan(trade.totalUtility);
  });
});

// ── pixel readback helpers (real GPU via the ANGLE flags in playwright.config) ──
async function pixelHash(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector("canvas#scene") as HTMLCanvasElement;
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    const w = c.width;
    const h = c.height;
    const px = new Uint8Array(w * h * 4);
    if (gl) gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // coarse downsample to a small signature so freeze/resume comparison is robust + cheap.
    const buckets = 64;
    const sig = new Array(buckets).fill(0);
    const step = Math.max(1, Math.floor(px.length / 4 / buckets));
    let bi = 0;
    for (let i = 0; i < px.length; i += step * 4) {
      sig[bi % buckets] += px[i] + px[i + 1] + px[i + 2];
      bi++;
    }
    return sig;
  });
}

function pixelChangePct(a: number[], b: number[]): number {
  let diff = 0;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    diff += Math.abs(a[i] - b[i]);
    total += Math.abs(a[i]) + Math.abs(b[i]);
  }
  if (total === 0) return 0;
  return (diff / total) * 100;
}
