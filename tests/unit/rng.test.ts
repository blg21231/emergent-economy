// Seam coverage — the shared deterministic RNG (makeRng) underpins AC6 determinism.
import { describe, it, expect } from "vitest";
import { makeRng } from "../../src/sim/rng";

describe("makeRng deterministic stream", () => {
  it("same seed ⇒ identical sequence; different seed ⇒ different", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const c = makeRng(43);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    const sc = Array.from({ length: 20 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it("next() in [0,1), range() in [min,max), int() in [0,n)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const u = r.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const x = r.range(5, 9);
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThan(9);
      const n = r.int(4);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("normal() is deterministic and roughly standard-normal (mean~0, sd~1)", () => {
    const r = makeRng(123);
    const N = 5000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const z = r.normal();
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.1);
    // determinism: the spare-value path reproduces.
    const a = makeRng(9);
    const b = makeRng(9);
    expect([a.normal(), a.normal(), a.normal()]).toEqual([b.normal(), b.normal(), b.normal()]);
  });
});
