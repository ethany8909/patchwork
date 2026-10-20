// Dark (or light) marks that stay after a flare heals: post-inflammatory hyper- and
// hypopigmentation. They are most common on brown and Black skin and can take months
// to fade, so Patchwork tracks each one against the user's own surrounding skin.

import { daysBetween } from "./date";
import type { DarkMark, ISODate } from "./types";

export const MARK_LEVELS = [
  { value: 3, label: "Very noticeable", hint: "Stands out clearly from the skin around it." },
  { value: 2, label: "Noticeable", hint: "Easy to see if you look for it." },
  { value: 1, label: "Faint", hint: "Only just visible." },
  { value: 0, label: "Faded", hint: "Matches the skin around it." },
] as const;

export const levelLabel = (level: number) => MARK_LEVELS.find((l) => l.value === level)?.label ?? "—";

/** Suggest a fresh photo and rating every two weeks; marks change slowly. */
export const MARK_UPDATE_DAYS = 14;

export interface MarkSummary {
  first: number;
  latest: number;
  /** Positive = lighter (fading), measured in steps of the 0-3 scale. */
  faded: number;
  startDate: ISODate;
  latestDate: ISODate;
  daysTracked: number;
  updateDue: boolean;
  text: string;
}

export function markSummary(mark: DarkMark, on: ISODate): MarkSummary {
  if (!mark.updates.length) throw new Error("A mark needs at least one rating");
  const ups = [...mark.updates].sort((a, b) => a.date.localeCompare(b.date));
  const first = ups[0];
  const last = ups[ups.length - 1];
  const faded = first.level - last.level;
  const daysTracked = daysBetween(first.date, last.date);
  const months = Math.max(1, Math.round(daysTracked / 30));
  let text: string;
  if (last.level === 0) text = "Faded to match the skin around it.";
  else if (ups.length === 1) text = "First rating saved. Rate it again in two weeks.";
  else if (faded > 0) text = `${faded === 1 ? "One step" : `${faded} steps`} lighter over ${daysTracked < 45 ? `${daysTracked} days` : `${months} months`}.`;
  else if (faded < 0) text = "More noticeable than when you started. Worth mentioning at your next visit.";
  else text = "No change yet. These marks often take several months to fade.";
  return {
    first: first.level,
    latest: last.level,
    faded,
    startDate: first.date,
    latestDate: last.date,
    daysTracked,
    updateDue: !mark.resolved && last.level > 0 && daysBetween(last.date, on) >= MARK_UPDATE_DAYS,
    text,
  };
}
