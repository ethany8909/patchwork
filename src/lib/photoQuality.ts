// Lighting checks for progress photos. Two kinds of advice:
//  1. Absolute problems that hide texture on any skin: too dim, glare from a flash, backlight.
//  2. Consistency with the user's own last photo of the same area. We never compare skin
//     with a "standard" skin color; we compare this photo with the person's earlier one.
//
// The "too dim" test looks at the brightest parts of the frame as well as the average, so a
// well-lit photo of dark skin is not mistaken for an underexposed one.

export interface LightingReport {
  /** Mean luma, 0-255. */
  mean: number;
  /** 95th-percentile luma. */
  p95: number;
  /** Share of pixels that are blown out (luma >= 250). */
  clipped: number;
  /** Share of pixels that are near black (luma <= 12). */
  crushed: number;
  issues: LightingIssue[];
}

export type LightingIssue = "dim" | "glare" | "backlit" | "unlike-last";

export const LIGHTING_ADVICE: Record<LightingIssue, string> = {
  dim: "This looks dim, which hides texture, especially on darker skin. Move next to a window with daylight.",
  glare: "Part of the photo is washed out, often from a flash or a lamp. Turn the flash off and use indirect daylight.",
  backlit: "The light is behind the skin, so the skin is in shadow. Turn so the window is in front of you.",
  "unlike-last": "The lighting is quite different from your last photo of this area. For a fair comparison, use the same spot and time of day.",
};

/** Luma (Rec. 601) of each RGBA pixel. */
export function lumaValues(rgba: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) out.push(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  return out;
}

export function assessLighting(rgba: ArrayLike<number>, previousMean?: number): LightingReport {
  const l = lumaValues(rgba);
  if (!l.length) throw new Error("No pixels to assess");
  const sorted = [...l].sort((a, b) => a - b);
  const mean = l.reduce((s, x) => s + x, 0) / l.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const clipped = l.filter((x) => x >= 250).length / l.length;
  const crushed = l.filter((x) => x <= 12).length / l.length;

  const issues: LightingIssue[] = [];
  if (p95 < 110 && mean < 70) issues.push("dim");
  if (clipped > 0.06) issues.push("glare");
  if (clipped > 0.15 && crushed > 0.2) issues.push("backlit");
  if (previousMean !== undefined && Math.abs(mean - previousMean) > 40 && !issues.includes("dim")) issues.push("unlike-last");
  return { mean: Math.round(mean), p95: Math.round(p95), clipped, crushed, issues };
}
