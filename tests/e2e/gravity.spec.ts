// EXPLORATORY demo (beyond the floor) — the /gravity route renders a live, sim-driven gravity
// model of trade: the scene canvas + the flow-arc map render, the LIVE fitted coefficients (β, r²)
// are shown and advance as the sim runs, and the view carries its epistemic tags (the gravity LAW
// is established-theory; THIS sim's fit is model-result). No keyframing — the fit is computed from
// the running economy's accumulated trades.
import { test, expect } from "@playwright/test";

test.describe("EXPLORATORY /gravity route (gravity model of trade)", () => {
  test("renders the scene + flow map, shows the live fit (β, r²), advances", async ({ page }) => {
    await page.goto("/?cpu=1#/gravity");
    await expect(page.locator("canvas#scene")).toBeVisible();
    await expect(page.locator("canvas.gravity-map")).toBeVisible();

    // the live fit readout exists and exposes β + r² values.
    const fit = page.locator(".fit-readout code");
    await expect(fit).toBeVisible();

    // let the sim accumulate trades, then read β / r² off the fit element's data attributes.
    await page.waitForTimeout(1200);
    const beta0 = await fit.getAttribute("data-fit-beta");
    const r20 = await fit.getAttribute("data-fit-r2");
    expect(beta0, "β reported").not.toBeNull();
    expect(r20, "r² reported").not.toBeNull();

    // KPIs surface the gravity law's headline numbers.
    await expect(page.locator(".overlay")).toContainText("distance decay");
    await expect(page.locator(".overlay")).toContainText("r²");

    // it advances (the fit is live, computed from the running sim — not canned).
    const t0 = await page.evaluate(() => window.__ECON__?.ticks() ?? 0);
    await page.waitForTimeout(700);
    const t1 = await page.evaluate(() => window.__ECON__?.ticks() ?? 0);
    expect(t1).toBeGreaterThan(t0);

    // after enough trades, the emergent distance decay is positive and the fit explains the data.
    await page.waitForTimeout(2500);
    const beta = Number(await fit.getAttribute("data-fit-beta"));
    const r2 = Number(await fit.getAttribute("data-fit-r2"));
    expect(beta, `live β=${beta}`).toBeGreaterThan(0);
    expect(r2, `live r²=${r2}`).toBeGreaterThanOrEqual(0.5);
  });

  test("carries its epistemic tags (established-theory law + model-result fit)", async ({ page }) => {
    await page.goto("/?cpu=1#/gravity");
    await expect(page.locator(".panel .etag").first()).toBeVisible();

    // the gravity law panel is established-theory; this sim's fit is model-result.
    const lawTag = await page.locator('.panel[data-panel-id="gravity-law"] .etag').getAttribute("data-etag");
    const resultTag = await page.locator('.panel[data-panel-id="gravity-result"] .etag').getAttribute("data-etag");
    expect(lawTag).toBe("established-theory");
    expect(resultTag).toBe("model-result");
  });
});
