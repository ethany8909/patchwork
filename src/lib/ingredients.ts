// Finds ingredients from data/ingredients.ts in a label's text.
//
// The text often comes from reading a photo, so matching has to survive OCR mistakes:
// words split across lines ("methyliso-/thiazolinone"), words run together, and the odd
// wrong letter ("laury1"). Long names allow one or two wrong letters; short names must
// match exactly, and always as whole words, so "triethanolamine" never counts as "ethanol".

import { INGREDIENT_GROUPS, type IngredientGroup } from "../data/ingredients";

export interface Found {
  /** The ingredient name as we list it. */
  term: string;
  /** What the label actually said, if it wasn't an exact match. */
  seen: string | null;
}

export interface GroupResult {
  group: IngredientGroup;
  found: Found[];
}

export interface LabelCheck {
  results: GroupResult[];
  notes: ("parabens" | "unscented")[];
}

/** Remove claims like "fragrance-free" or "free of parabens" so they don't count as ingredients. */
function stripClaims(text: string): string {
  return text
    .replace(/\b[a-z]+[\s-]+free\b/gi, " ")
    .replace(/\b(?:free\s+(?:of|from)|without|no)\s+(?:added\s+)?[a-z]+/gi, " ");
}

/** Lower-case words and numbers, with words broken across lines joined back together. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/-\s*\n\s*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Edit distance, giving up early once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const allowedErrors = (squashedLength: number) => (squashedLength >= 16 ? 2 : squashedLength >= 8 ? 1 : 0);

interface Hit {
  group: IngredientGroup;
  term: string;
  from: number;
  to: number; // exclusive
  seen: string | null;
}

function findTerm(tokens: string[], group: IngredientGroup, term: string, hits: Hit[]) {
  const termTokens = term.split(" ");
  const squashedTerm = termTokens.join("");
  // Never fuzz numbers: "quaternium-18" is harmless, "quaternium-15" releases formaldehyde.
  const errors = /\d/.test(term) ? 0 : allowedErrors(squashedTerm.length);
  const k = termTokens.length;
  for (const size of [k, k - 1, k + 1]) {
    if (size < 1) continue;
    for (let i = 0; i + size <= tokens.length; i++) {
      const window = tokens.slice(i, i + size);
      const exact = size === k && window.join(" ") === term;
      const squashed = window.join("");
      // Whole-word matches only: the window must start and end on word boundaries,
      // which token windows guarantee.
      if (exact || squashed === squashedTerm) {
        hits.push({ group, term, from: i, to: i + size, seen: exact ? null : window.join(" ") });
      } else if (errors > 0 && editDistance(squashed, squashedTerm, errors) <= errors) {
        hits.push({ group, term, from: i, to: i + size, seen: window.join(" ") });
      }
    }
  }
}

export function checkLabel(text: string): LabelCheck {
  const cleaned = stripClaims(text);
  const tokens = tokenize(cleaned);
  const hits: Hit[] = [];
  for (const group of INGREDIENT_GROUPS) {
    for (const term of group.terms) findTerm(tokens, group, term, hits);
  }

  // Entries that only count on their own, e.g. plain "Alcohol" (but not "Cetyl Alcohol").
  const entries = cleaned.split(/[,;:•·|()[\]]+|\.\s/).map((e) => tokenize(e).join(" ")).filter(Boolean);
  const wholeHits: { group: IngredientGroup; term: string }[] = [];
  for (const group of INGREDIENT_GROUPS) {
    for (const entry of group.wholeEntries ?? []) {
      if (entries.includes(entry)) wholeHits.push({ group, term: entry });
    }
  }

  // Keep the longest, most exact match for each stretch of text ("hexyl cinnamal", not also "cinnamal").
  hits.sort((a, b) => (b.to - b.from) - (a.to - a.from) || Number(a.seen !== null) - Number(b.seen !== null));
  const used = new Set<number>();
  const byGroup = new Map<string, Found[]>();
  for (const h of hits) {
    let overlaps = false;
    for (let t = h.from; t < h.to; t++) if (used.has(t)) overlaps = true;
    if (overlaps) continue;
    for (let t = h.from; t < h.to; t++) used.add(t);
    const list = byGroup.get(h.group.id) ?? [];
    if (!list.some((f) => f.term === h.term)) list.push({ term: h.term, seen: h.seen });
    byGroup.set(h.group.id, list);
  }
  for (const w of wholeHits) {
    const list = byGroup.get(w.group.id) ?? [];
    if (!list.some((f) => f.term === w.term)) list.push({ term: w.term, seen: null });
    byGroup.set(w.group.id, list);
  }

  const results = INGREDIENT_GROUPS.filter((g) => byGroup.has(g.id)).map((group) => ({ group, found: byGroup.get(group.id)! }));
  const notes: LabelCheck["notes"] = [];
  if (tokens.some((t) => t.endsWith("paraben"))) notes.push("parabens");
  if (tokenize(text).includes("unscented")) notes.push("unscented");
  return { results, notes };
}
