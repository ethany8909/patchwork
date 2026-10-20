// POEM, the Patient-Oriented Eczema Measure (Charman, Venn & Williams, Arch Dermatol 2004).
// Seven questions about the past week. None of them asks about redness, so the score
// means the same thing on every skin tone. That is why Patchwork uses it.
// Severity bands: Charman et al., Br J Dermatol 2013.

import { addDays, daysBetween } from "./date";
import type { ISODate, PoemRecord } from "./types";

export const POEM_QUESTIONS: { id: string; text: string; unit: "days" | "nights" }[] = [
  { id: "itch", text: "on how many days has your skin been itchy because of your eczema?", unit: "days" },
  { id: "sleep", text: "on how many nights has your sleep been disturbed because of your eczema?", unit: "nights" },
  { id: "bleeding", text: "on how many days has your skin been bleeding because of your eczema?", unit: "days" },
  { id: "oozing", text: "on how many days has your skin been weeping or oozing clear fluid because of your eczema?", unit: "days" },
  { id: "cracked", text: "on how many days has your skin been cracked because of your eczema?", unit: "days" },
  { id: "flaking", text: "on how many days has your skin been flaking off because of your eczema?", unit: "days" },
  { id: "dry", text: "on how many days has your skin felt dry or rough because of your eczema?", unit: "days" },
];

export const POEM_ANSWERS = ["No", "1–2", "3–4", "5–6", "Every"] as const;

/** "No days", "1–2 nights", "Every day" … */
export function answerLabel(value: number, unit: "days" | "nights"): string {
  if (value === 4) return `Every ${unit === "days" ? "day" : "night"}`;
  return `${POEM_ANSWERS[value]} ${unit}`;
}

export const POEM_MAX = 28;

export function poemScore(answers: number[]): number {
  if (answers.length !== POEM_QUESTIONS.length || answers.some((a) => !Number.isInteger(a) || a < 0 || a > 4)) {
    throw new Error("POEM needs seven answers from 0 to 4");
  }
  return answers.reduce((s, a) => s + a, 0);
}

export interface PoemBand {
  label: string;
  min: number;
  max: number;
}

export const POEM_BANDS: PoemBand[] = [
  { label: "Clear or almost clear", min: 0, max: 2 },
  { label: "Mild", min: 3, max: 7 },
  { label: "Moderate", min: 8, max: 16 },
  { label: "Severe", min: 17, max: 24 },
  { label: "Very severe", min: 25, max: 28 },
];

export function poemBand(score: number): PoemBand {
  const band = POEM_BANDS.find((b) => score >= b.min && score <= b.max);
  if (!band) throw new Error(`Score out of range: ${score}`);
  return band;
}

/** A POEM is due when none has been filled in during the last seven days. */
export function poemDue(records: PoemRecord[], on: ISODate): boolean {
  return !records.some((r) => r.date > addDays(on, -7) && r.date <= on);
}

export interface PoemTrend {
  latest: { record: PoemRecord; score: number; band: PoemBand } | null;
  /** Change from the previous questionnaire, or null if there is only one. */
  change: number | null;
  daysSinceLatest: number | null;
  points: { date: ISODate; score: number }[];
}

export function poemTrend(records: PoemRecord[], on: ISODate, start?: ISODate): PoemTrend {
  const sorted = [...records].filter((r) => r.date <= on && (!start || r.date >= start)).sort((a, b) => a.date.localeCompare(b.date));
  const points = sorted.map((r) => ({ date: r.date, score: poemScore(r.answers) }));
  const last = sorted[sorted.length - 1];
  if (!last) return { latest: null, change: null, daysSinceLatest: null, points };
  const score = points[points.length - 1].score;
  return {
    latest: { record: last, score, band: poemBand(score) },
    change: points.length > 1 ? score - points[points.length - 2].score : null,
    daysSinceLatest: daysBetween(last.date, on),
    points,
  };
}

/**
 * Describe a change between two scores. A change of 3.4 points or more is the
 * smallest difference shown to matter to patients (Schram et al., Allergy 2012),
 * so smaller moves are called "about the same".
 */
export function describeChange(change: number): string {
  if (change <= -3.4) return `Better by ${-change} points`;
  if (change >= 3.4) return `Worse by ${change} points`;
  return "About the same as last time";
}
