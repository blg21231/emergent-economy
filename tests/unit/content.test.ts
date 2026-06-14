// AC10 — epistemic honesty (unit limbs). Every panel carries exactly one valid tag; the pinned
// assignments hold; a banned-overclaim-phrase lint over every non-established panel finds none;
// a blanket-established build would fail the pinned-tag assertions.
import { describe, it, expect } from "vitest";
import {
  PANELS,
  EPISTEMIC_TAGS,
  BANNED_PHRASES,
  type EpistemicTag,
} from "../../src/content/panels";

describe("AC10 epistemic tags", () => {
  it("every panel carries exactly one valid tag", () => {
    expect(PANELS.length).toBeGreaterThan(0);
    for (const p of PANELS) {
      expect(EPISTEMIC_TAGS).toContain(p.tag);
      // exactly one: tag is a single string field, not an array — assert the type at runtime.
      expect(typeof p.tag).toBe("string");
    }
  });

  it("every panel has a unique id and non-empty title+body", () => {
    const ids = new Set<string>();
    for (const p of PANELS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.title.trim().length).toBeGreaterThan(0);
      expect(p.body.trim().length).toBeGreaterThan(0);
    }
  });

  const findPanel = (id: string) => PANELS.find((p) => p.id === id);

  it("pinned: comparative advantage & gains-from-trade => established-theory", () => {
    expect(findPanel("ca-theory")?.tag).toBe<EpistemicTag>("established-theory");
  });

  it("pinned: THIS sim's specific money/price/inequality outcomes => model-result", () => {
    expect(findPanel("money-result")?.tag).toBe<EpistemicTag>("model-result");
    expect(findPanel("price-result")?.tag).toBe<EpistemicTag>("model-result");
    expect(findPanel("inequality-result")?.tag).toBe<EpistemicTag>("model-result");
    expect(findPanel("specialization-result")?.tag).toBe<EpistemicTag>("model-result");
  });

  it("pinned: agent behavioral rules => simplification", () => {
    expect(findPanel("production-rules")?.tag).toBe<EpistemicTag>("simplification");
    expect(findPanel("inequality-rule")?.tag).toBe<EpistemicTag>("simplification");
  });

  it("pinned: 'does real-world inequality/money arise this way' => open-question", () => {
    expect(findPanel("money-history-open")?.tag).toBe<EpistemicTag>("open-question");
    expect(findPanel("inequality-open")?.tag).toBe<EpistemicTag>("open-question");
  });

  it("NOT a blanket-established-theory build (multiple tags present)", () => {
    const tags = new Set(PANELS.map((p) => p.tag));
    expect(tags.size).toBeGreaterThanOrEqual(3);
    expect(tags.has("model-result")).toBe(true);
    expect(tags.has("simplification")).toBe(true);
    expect(tags.has("open-question")).toBe(true);
  });
});

describe("AC10 banned-overclaim lint over non-established panels", () => {
  it("no banned phrase appears in any model-result/simplification/open-question panel", () => {
    for (const p of PANELS) {
      if (p.tag === "established-theory") continue;
      const hay = `${p.title}\n${p.body}`.toLowerCase();
      for (const phrase of BANNED_PHRASES) {
        expect(hay.includes(phrase.toLowerCase()), `panel ${p.id} contains "${phrase}"`).toBe(false);
      }
    }
  });

  it("the lint actually bites (a planted overclaim is caught)", () => {
    const planted = {
      tag: "model-result" as EpistemicTag,
      body: "Honestly, this is how the economy works, full stop.",
    };
    const hay = planted.body.toLowerCase();
    const hit = BANNED_PHRASES.some((p) => hay.includes(p.toLowerCase()));
    expect(hit).toBe(true);
  });
});
