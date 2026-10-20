import { describe, expect, it } from "vitest";
import { answerLabel, describeChange, POEM_BANDS, POEM_QUESTIONS, poemBand, poemDue, poemScore, poemTrend } from "../src/lib/poem";
import { poemBucket } from "../src/lib/demo";
import type { PoemRecord } from "../src/lib/types";

const rec = (date: string, answers: number[], id = date): PoemRecord => ({ id, date, answers, createdAt: 0 });

describe("POEM scoring", () => {
  it("has the seven published questions, with sleep counted in nights", () => {
    expect(POEM_QUESTIONS).toHaveLength(7);
    expect(POEM_QUESTIONS.filter((q) => q.unit === "nights").map((q) => q.id)).toEqual(["sleep"]);
    expect(POEM_QUESTIONS.some((q) => /red/i.test(q.text))).toBe(false);
  });

  it("sums seven 0-4 answers into 0-28", () => {
    expect(poemScore([0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(poemScore([4, 4, 4, 4, 4, 4, 4])).toBe(28);
    expect(poemScore([2, 1, 0, 0, 1, 3, 4])).toBe(11);
  });

  it("rejects incomplete or out-of-range answers", () => {
    expect(() => poemScore([1, 2, 3])).toThrow();
    expect(() => poemScore([5, 0, 0, 0, 0, 0, 0])).toThrow();
    expect(() => poemScore([1.5, 0, 0, 0, 0, 0, 0])).toThrow();
  });

  it("uses the published severity bands with no gaps or overlaps", () => {
    for (let s = 0; s <= 28; s++) expect(POEM_BANDS.filter((b) => s >= b.min && s <= b.max)).toHaveLength(1);
    expect(poemBand(2).label).toBe("Clear or almost clear");
    expect(poemBand(3).label).toBe("Mild");
    expect(poemBand(7).label).toBe("Mild");
    expect(poemBand(8).label).toBe("Moderate");
    expect(poemBand(16).label).toBe("Moderate");
    expect(poemBand(17).label).toBe("Severe");
    expect(poemBand(25).label).toBe("Very severe");
  });

  it("labels answers in plain words", () => {
    expect(answerLabel(0, "days")).toBe("No days");
    expect(answerLabel(2, "nights")).toBe("3–4 nights");
    expect(answerLabel(4, "days")).toBe("Every day");
  });
});

describe("POEM schedule and trend", () => {
  it("is due when nothing was answered in the last seven days", () => {
    expect(poemDue([], "2026-10-10")).toBe(true);
    expect(poemDue([rec("2026-10-04", [0, 0, 0, 0, 0, 0, 0])], "2026-10-10")).toBe(false);
    expect(poemDue([rec("2026-10-03", [0, 0, 0, 0, 0, 0, 0])], "2026-10-10")).toBe(true);
  });

  it("reports the latest band and the change from the previous week", () => {
    const t = poemTrend([rec("2026-10-01", [3, 3, 1, 1, 2, 2, 3]), rec("2026-10-08", [2, 1, 0, 0, 1, 1, 2])], "2026-10-10");
    expect(t.latest?.score).toBe(7);
    expect(t.latest?.band.label).toBe("Mild");
    expect(t.change).toBe(-8);
    expect(t.daysSinceLatest).toBe(2);
    expect(t.points.map((p) => p.score)).toEqual([15, 7]);
  });

  it("calls small changes 'about the same' (minimal important difference 3.4)", () => {
    expect(describeChange(-3)).toBe("About the same as last time");
    expect(describeChange(3)).toBe("About the same as last time");
    expect(describeChange(-4)).toBe("Better by 4 points");
    expect(describeChange(5)).toBe("Worse by 5 points");
  });

  it("maps a number of days to the POEM answer scale", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(poemBucket)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});
