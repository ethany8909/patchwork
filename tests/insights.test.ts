import { describe, expect, it } from "vitest";
import { MIN_DAYS_FOR_PATTERNS, mulberry32, permutationP, summarize, triggerPatterns } from "../src/lib/insights";
import { addDays } from "../src/lib/date";
import type { Entry, Treatment } from "../src/lib/types";

const START = "2026-07-01";
function makeEntries(n: number, fn: (i: number, rand: () => number) => Partial<Entry>): Entry[] {
  const rand = mulberry32(7);
  return Array.from({ length: n }, (_, i) => ({
    id: String(i), date: addDays(START, i), itch: 3, sleep: 0, areas: [], looks: [], triggers: [],
    treatments: [], note: "", photoIds: [], createdAt: 0, updatedAt: 0, ...fn(i, rand),
  }));
}

describe("permutation test", () => {
  it("is small for clearly different groups and large for identical ones", () => {
    expect(permutationP([8, 9, 8, 9, 8, 9], [2, 3, 2, 3, 2, 3], 1)).toBeLessThan(0.01);
    expect(permutationP([4, 5, 4, 5], [4, 5, 5, 4], 1)).toBeGreaterThan(0.5);
  });
  it("is deterministic for a given seed", () => {
    expect(permutationP([1, 5, 2, 8], [3, 3, 9, 1], 42)).toBe(permutationP([1, 5, 2, 8], [3, 3, 9, 1], 42));
  });
});

describe("trigger patterns", () => {
  it("finds a real same-day trigger", () => {
    const es = makeEntries(40, (i, r) => {
      const sweat = i % 3 === 0;
      return { triggers: sweat ? ["sweat"] : [], itch: Math.round((sweat ? 7 : 3) + r() * 2) };
    });
    const p = triggerPatterns(es, START, addDays(START, 39)).find((x) => x.trigger === "sweat")!;
    expect(p.strength).toBe("strong");
    expect(p.lag).toBe(0);
    expect(p.diff).toBeGreaterThan(3);
  });

  it("finds a next-day trigger", () => {
    const es = makeEntries(40, (i, r) => ({ triggers: i % 4 === 0 ? ["stress"] : [], itch: 3 + Math.round(r()) }));
    for (let i = 1; i < es.length; i++) if (es[i - 1].triggers.includes("stress")) es[i].itch = 8;
    const p = triggerPatterns(es, START, addDays(START, 39)).find((x) => x.trigger === "stress")!;
    expect(p.lag).toBe(1);
    expect(p.strength).toBe("strong");
  });

  it("does not invent a pattern from noise", () => {
    const es = makeEntries(40, (i, r) => ({ triggers: i % 3 === 0 ? ["pets"] : [], itch: Math.floor(r() * 10) }));
    const p = triggerPatterns(es, START, addDays(START, 39)).find((x) => x.trigger === "pets");
    expect(p?.strength ?? "none").not.toBe("strong");
  });

  it(`says nothing with fewer than ${MIN_DAYS_FOR_PATTERNS} logged days`, () => {
    const es = makeEntries(MIN_DAYS_FOR_PATTERNS - 1, (i) => ({ triggers: i % 2 ? ["sweat"] : [], itch: i % 2 ? 9 : 1 }));
    expect(triggerPatterns(es, START, addDays(START, 30))).toEqual([]);
  });
});

describe("summary", () => {
  it("counts days, flares, areas and treatment use", () => {
    const tr: Treatment = { id: "t1", name: "Moisturizer", kind: "moisturizer", times: ["08:00"], remind: false, active: true, createdAt: 0 };
    const es = makeEntries(10, (i) => ({
      itch: i < 3 ? 8 : 2, areas: i % 2 ? ["hands"] : ["hands", "elbows"], sleep: i < 2 ? 3 : 0,
      treatments: i < 6 ? ["t1"] : [],
    }));
    es[9].itch = null;
    const s = summarize(es, [tr], START, addDays(START, 13));
    expect(s.days).toBe(14);
    expect(s.daysLogged).toBe(9);
    expect(s.flareDays).toBe(3);
    expect(s.badSleepNights).toBe(2);
    expect(s.maxItch).toBe(8);
    expect(s.areas[0]).toEqual(["hands", 10]);
    expect(s.treatmentUse[0].daysUsed).toBe(6);
    expect(s.series).toHaveLength(14);
  });
});
