// AC9 — emergence ledger (schema limb). All five phenomena are mapped with >=1 local rule, a named
// anchor, >=1 in-app route, a valid status, a claim, and a valid epistemic tag. The generated
// public/emergence.json must match the canonical source. (The e2e ledger walk covers the rendered
// view + per-phenomenon claim/tag.)
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEDGER,
  PHENOMENA,
  buildManifest,
  type LedgerStatus,
  type Phenomenon,
} from "../../src/content/emergence";
import { ROUTES } from "../../src/app/routes";
import { EPISTEMIC_TAGS } from "../../src/content/panels";

const VALID_STATUS: LedgerStatus[] = ["validated", "partial", "illustrative"];
const ROUTE_PATHS = new Set(ROUTES.map((r) => r.path));

describe("AC9 emergence ledger schema", () => {
  it("maps all five emergent phenomena, no phenomenon missing", () => {
    const have = new Set(LEDGER.map((e) => e.phenomenon));
    for (const p of PHENOMENA) {
      expect(have.has(p), `phenomenon ${p} not mapped`).toBe(true);
    }
    expect(LEDGER.length).toBe(PHENOMENA.length);
  });

  it("each entry has >=1 local rule, a named anchor, >=1 in-app route, a status, a claim, a tag", () => {
    for (const e of LEDGER) {
      expect(e.localRules.length, `${e.phenomenon} local rules`).toBeGreaterThanOrEqual(1);
      for (const r of e.localRules) expect(r.trim().length).toBeGreaterThan(0);
      expect(e.anchor.trim().length, `${e.phenomenon} anchor`).toBeGreaterThan(0);
      expect(e.routes.length, `${e.phenomenon} routes`).toBeGreaterThanOrEqual(1);
      for (const rt of e.routes) {
        expect(ROUTE_PATHS.has(rt), `${e.phenomenon} route ${rt} is a real route`).toBe(true);
      }
      expect(VALID_STATUS).toContain(e.status);
      expect(e.claim.trim().length, `${e.phenomenon} claim`).toBeGreaterThan(0);
      expect(EPISTEMIC_TAGS).toContain(e.tag);
    }
  });

  it("named anchors reference the expected closed-form results", () => {
    const byPhen = (p: Phenomenon) => LEDGER.find((e) => e.phenomenon === p)!;
    expect(byPhen("gains-from-trade").anchor.toLowerCase()).toContain("edgeworth");
    expect(byPhen("specialization").anchor.toLowerCase()).toContain("ricard");
    expect(byPhen("price-convergence").anchor.toLowerCase()).toContain("walras");
    expect(byPhen("commodity-money").anchor.toLowerCase()).toContain("kiyotaki");
    expect(byPhen("inequality").anchor.toLowerCase()).toContain("gini");
  });
});

describe("AC9 generated manifest", () => {
  it("public/emergence.json exists and equals the canonical manifest", () => {
    const path = resolve(__dirname, "../../public/emergence.json");
    expect(existsSync(path), "run `npm run gen:emergence`").toBe(true);
    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk).toEqual(buildManifest());
  });
});
