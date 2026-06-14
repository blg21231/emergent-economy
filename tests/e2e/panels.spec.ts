// AC10 — epistemic honesty (e2e panel-tag walk). Across every view, every rendered explanatory
// panel carries exactly one valid epistemic tag (zero untagged); pinned assignments hold on the
// views that own them; and no banned overclaim phrase appears in any rendered non-established panel.
import { test, expect } from "@playwright/test";

const VIEWS = ["/", "/specialization", "/prices", "/money", "/inequality", "/ledger"];
const VALID = ["established-theory", "model-result", "simplification", "open-question"];
const BANNED = ["this proves the real economy", "markets are always efficient", "this is how the economy works"];

test.describe("AC10 epistemic tags (e2e)", () => {
  test("every rendered panel carries exactly one valid tag — zero untagged", async ({ page }) => {
    for (const view of VIEWS) {
      await page.goto(`/?cpu=1#${view}`);
      if (view === "/ledger") await expect(page.locator(".ledger-card").first()).toBeVisible();
      else await expect(page.locator("canvas#scene")).toBeVisible();
      await page.waitForTimeout(150);

      const panels = page.locator(".panel");
      const n = await panels.count();
      for (let i = 0; i < n; i++) {
        const tags = panels.nth(i).locator(".etag");
        await expect(tags, `panel ${i} on ${view} has exactly one tag`).toHaveCount(1);
        const tag = await tags.getAttribute("data-etag");
        expect(VALID, `panel ${i} on ${view} tag=${tag}`).toContain(tag);
      }
    }
  });

  test("pinned tags hold on their owning views", async ({ page }) => {
    const expectTag = async (id: string, tag: string) => {
      const el = page.locator(`.panel[data-panel-id="${id}"] .etag`);
      await expect(el, `panel ${id}`).toHaveCount(1);
      expect(await el.getAttribute("data-etag")).toBe(tag);
    };

    await page.goto("/?cpu=1#/specialization");
    await expect(page.locator("canvas#scene")).toBeVisible();
    await expectTag("ca-theory", "established-theory");
    await expectTag("specialization-result", "model-result");
    await expectTag("production-rules", "simplification");

    await page.goto("/?cpu=1#/money");
    await expect(page.locator("canvas#scene")).toBeVisible();
    await expectTag("money-result", "model-result");
    await expectTag("money-anchor", "established-theory");
    await expectTag("money-history-open", "open-question");

    await page.goto("/?cpu=1#/inequality");
    await expect(page.locator("canvas#scene")).toBeVisible();
    await expectTag("inequality-result", "model-result");
    await expectTag("inequality-rule", "simplification");
    await expectTag("inequality-open", "open-question");
  });

  test("no banned overclaim phrase appears in any rendered non-established panel", async ({ page }) => {
    for (const view of VIEWS) {
      await page.goto(`/?cpu=1#${view}`);
      if (view === "/ledger") await expect(page.locator(".ledger-card").first()).toBeVisible();
      else await expect(page.locator("canvas#scene")).toBeVisible();
      await page.waitForTimeout(150);

      const panels = page.locator(".panel");
      const n = await panels.count();
      for (let i = 0; i < n; i++) {
        const panel = panels.nth(i);
        const tag = await panel.locator(".etag").getAttribute("data-etag");
        if (tag === "established-theory") continue;
        const text = ((await panel.textContent()) ?? "").toLowerCase();
        for (const phrase of BANNED) {
          expect(text.includes(phrase), `panel ${i} on ${view} contains "${phrase}"`).toBe(false);
        }
      }
    }
  });
});
