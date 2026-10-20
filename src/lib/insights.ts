// Summary statistics and trigger patterns.
//
// Our research taught us that small samples mislead (a skin-tone gap that looked like
// zero internally was 0.21 AUROC on new patients). So every pattern here carries its
// sample size and a permutation-test p-value, and nothing is shown until there is
// enough data. These are prompts for a conversation with a doctor, not conclusions.

import { addDays, dateRange } from "./date";
import type { Entry, ISODate, Treatment } from "./types";

export const FLARE_ITCH = 7;
export const MIN_DAYS_FOR_PATTERNS = 14;
const MIN_GROUP = 3;
const PERMUTATIONS = 2000;

export interface Summary {
  start: ISODate;
  end: ISODate;
  days: number;
  daysLogged: number;
  avgItch: number | null;
  maxItch: number | null;
  flareDays: number;
  badSleepNights: number;
  areas: [string, number][];
  looks: [string, number][];
  triggers: [string, number][];
  treatmentUse: { treatment: Treatment; daysUsed: number }[];
  series: { date: ISODate; itch: number | null; sleep: number | null }[];
}

const countBy = (lists: string[][]): [string, number][] => {
  const m = new Map<string, number>();
  for (const l of lists) for (const x of new Set(l)) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function inRange(entries: Entry[], start: ISODate, end: ISODate): Entry[] {
  return entries.filter((e) => e.date >= start && e.date <= end);
}

export function summarize(entries: Entry[], treatments: Treatment[], start: ISODate, end: ISODate): Summary {
  const es = inRange(entries, start, end);
  const byDate = new Map(es.map((e) => [e.date, e]));
  const itches = es.map((e) => e.itch).filter((x): x is number => x !== null);
  return {
    start,
    end,
    days: dateRange(start, end).length,
    daysLogged: itches.length,
    avgItch: itches.length ? itches.reduce((a, b) => a + b, 0) / itches.length : null,
    maxItch: itches.length ? Math.max(...itches) : null,
    flareDays: itches.filter((x) => x >= FLARE_ITCH).length,
    badSleepNights: es.filter((e) => (e.sleep ?? 0) >= 2).length,
    areas: countBy(es.map((e) => e.areas)),
    looks: countBy(es.map((e) => e.looks)),
    triggers: countBy(es.map((e) => e.triggers)),
    treatmentUse: treatments
      .filter((t) => t.active || es.some((e) => e.treatments.includes(t.id)))
      .map((t) => ({ treatment: t, daysUsed: es.filter((e) => e.treatments.includes(t.id)).length })),
    series: dateRange(start, end).map((date) => {
      const e = byDate.get(date);
      return { date, itch: e?.itch ?? null, sleep: e?.sleep ?? null };
    }),
  };
}

// ---------- trigger patterns ----------

/** Small seeded PRNG so a pattern's p-value doesn't change every time the screen renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Two-sided permutation test for a difference in means.
 * Shuffles the group labels and counts how often a difference at least as large appears by chance.
 */
export function permutationP(a: number[], b: number[], seed: number, iterations = PERMUTATIONS): number {
  const observed = Math.abs(mean(a) - mean(b));
  const pooled = [...a, ...b];
  const rand = mulberry32(seed);
  let extreme = 0;
  for (let i = 0; i < iterations; i++) {
    for (let j = pooled.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [pooled[j], pooled[k]] = [pooled[k], pooled[j]];
    }
    const diff = Math.abs(mean(pooled.slice(0, a.length)) - mean(pooled.slice(a.length)));
    if (diff >= observed - 1e-12) extreme++;
  }
  return (extreme + 1) / (iterations + 1);
}

export type Strength = "strong" | "possible" | "none";

export interface Pattern {
  trigger: string;
  /** 0 = same day, 1 = the day after the trigger was logged. */
  lag: 0 | 1;
  withMean: number;
  withoutMean: number;
  diff: number;
  nWith: number;
  nWithout: number;
  p: number;
  strength: Strength;
}

function testLag(trigger: string, lag: 0 | 1, itchByDate: Map<ISODate, number>, entryByDate: Map<ISODate, Entry>): Omit<Pattern, "strength"> | null {
  const withT: number[] = [];
  const withoutT: number[] = [];
  for (const [date, itch] of itchByDate) {
    const src = entryByDate.get(lag === 0 ? date : addDays(date, -1));
    if (!src) continue; // we don't know what happened that day
    (src.triggers.includes(trigger) ? withT : withoutT).push(itch);
  }
  if (withT.length < MIN_GROUP || withoutT.length < MIN_GROUP) return null;
  const withMean = mean(withT);
  const withoutMean = mean(withoutT);
  return {
    trigger, lag, withMean, withoutMean, diff: withMean - withoutMean,
    nWith: withT.length, nWithout: withoutT.length,
    p: permutationP(withT, withoutT, hashString(`${trigger}:${lag}`)),
  };
}

export function triggerPatterns(entries: Entry[], start: ISODate, end: ISODate): Pattern[] {
  const es = inRange(entries, addDays(start, -1), end);
  const entryByDate = new Map(es.map((e) => [e.date, e]));
  const itchByDate = new Map<ISODate, number>();
  for (const e of es) if (e.date >= start && e.itch !== null) itchByDate.set(e.date, e.itch);
  if (itchByDate.size < MIN_DAYS_FOR_PATTERNS) return [];

  const triggers = new Set(es.flatMap((e) => e.triggers));
  const out: Pattern[] = [];
  for (const t of triggers) {
    const candidates = [testLag(t, 0, itchByDate, entryByDate), testLag(t, 1, itchByDate, entryByDate)]
      .filter((x): x is Omit<Pattern, "strength"> => x !== null);
    if (!candidates.length) continue;
    const best = candidates.reduce((a, b) => (b.p < a.p ? b : a));
    // We looked at two lags and kept the better one, so double p (Bonferroni) to stay honest.
    const p = Math.min(1, best.p * candidates.length);
    const big = Math.abs(best.diff) >= 1;
    const strength: Strength = p < 0.05 && best.nWith >= 5 && big ? "strong" : p < 0.2 && big ? "possible" : "none";
    out.push({ ...best, p, strength });
  }
  return rankPatterns(out);
}

const RANK: Record<Strength, number> = { strong: 0, possible: 1, none: 2 };

/** Clear patterns first, then possible ones; the biggest difference first within each. */
export function rankPatterns(list: Pattern[]): Pattern[] {
  return [...list].sort((a, b) => RANK[a.strength] - RANK[b.strength] || b.diff - a.diff);
}
