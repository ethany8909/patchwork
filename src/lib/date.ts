import type { ISODate } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date (not UTC), so a late-night log counts for the right day. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = (): ISODate => toISODate(new Date());

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDate(s: ISODate, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return parseISODate(s).toLocaleDateString(undefined, opts);
}

export function formatLong(s: ISODate): string {
  return formatDate(s, { weekday: "long", month: "long", day: "numeric" });
}

export function relativeDay(s: ISODate, ref: ISODate = today()): string {
  const diff = daysBetween(ref, s);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  return formatDate(s, { weekday: "short", month: "short", day: "numeric" });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Hi there";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** "20:00" -> "8:00 PM" in the user's locale. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const uid = () => crypto.randomUUID();
