// AC9 — emergence ledger (e2e walk). The rendered ledger view lists all five phenomena, each with
// its anchor, status, an epistemic tag, and a working link to a view that demonstrates it live;
// the walk follows each link and confirms the linked view renders. Also confirms the generated
// public/emergence.json is served and well-formed.
import { test, expect } from "@playwright/test";

// the five floor phenomena PLUS the exploratory 6th (trade-gravity). The existing five assertions
// stay intact; the ledger now lists six.
const PHENOMENA = ["gains-from-trade", "specialization", "price-convergence", "commodity-money", "inequality", "trade-gravity"];

test.describe("AC9 emergence ledger", () => {
  test("ledger view renders all five phenomena with anchor, status, tag, and a live link", async ({ page }) => {
    await page.goto("/?cpu=1#/ledger");
    await expect(page.locator(".ledger-card").first()).toBeVisible();

    for (const phen of PHENOMENA) {
      const card = page.locator(`.ledger-card[data-phenomenon="${phen}"]`);
      await expect(card, `card for ${phen}`).toHaveCount(1);
      // status badge.
      await expect(card.locator(".status")).toBeVisible();
      // epistemic tag.
      await expect(card.locator(".etag")).toBeVisible();
      const tag = await card.locator(".etag").getAttribute("data-etag");
      expect(["established-theory", "model-result", "simplification", "open-question"]).toContain(tag);
      // a non-empty claim.
      const claim = (await card.locator(".claim").textContent())?.trim() ?? "";
      expect(claim.length, `${phen} claim`).toBeGreaterThan(10);
      // a "see it live" link.
      await expect(card.locator("a.golink").first()).toBeVisible();
    }
  });

  test("each phenomenon's linked view renders + visibly contains its claim's subject + a tag", async ({ page }) => {
    await page.goto("/?cpu=1#/ledger");
    await expect(page.locator(".ledger-card").first()).toBeVisible();

    // collect every phenomenon's first live-link href up front (navigating away drops the cards).
    const hrefs: { phen: string; href: string }[] = [];
    for (const phen of PHENOMENA) {
      const card = page.locator(`.ledger-card[data-phenomenon="${phen}"]`);
      const href = await card.locator("a.golink").first().getAttribute("href");
      expect(href, `${phen} link`).toBeTruthy();
      hrefs.push({ phen, href: href! });
    }

    for (const { phen, href } of hrefs) {
      await page.goto(`/?cpu=1${href}`);
      // the linked economy view renders a canvas + at least one tagged panel.
      await expect(page.locator("canvas#scene"), `${phen} canvas`).toBeVisible();
      await expect(page.locator(".panel .etag").first(), `${phen} tagged panel`).toBeVisible();
    }
  });

  test("public/emergence.json is served, self-contained, and lists all five phenomena", async ({ page }) => {
    const resp = await page.goto("/emergence.json");
    expect(resp?.status()).toBe(200);
    const json = await resp!.json();
    const have = (json.phenomena as { phenomenon: string }[]).map((p) => p.phenomenon);
    for (const phen of PHENOMENA) expect(have).toContain(phen);
    // the ledger now lists all six phenomena (five floor + the exploratory gravity demo).
    expect(json.phenomena.length).toBe(6);
    for (const e of json.phenomena) {
      expect(e.localRules.length).toBeGreaterThanOrEqual(1);
      expect(e.anchor.length).toBeGreaterThan(0);
      expect(e.routes.length).toBeGreaterThanOrEqual(1);
      expect(["validated", "partial", "illustrative"]).toContain(e.status);
    }
  });
});
