import { describe, expect, it } from "vitest";
import { levelLabel, MARK_UPDATE_DAYS, markSummary } from "../src/lib/marks";
import type { DarkMark } from "../src/lib/types";

function mark(updates: [string, number][], resolved = false): DarkMark {
  return {
    id: "m", area: "inner-elbows", kind: "darker", label: "", resolved, createdAt: 0, updatedAt: 0,
    updates: updates.map(([date, level]) => ({ date, level, photoId: null })),
  };
}

describe("dark mark summaries", () => {
  it("reports fading in steps, oldest rating first, whatever order they were saved in", () => {
    const s = markSummary(mark([["2026-09-20", 2], ["2026-07-01", 3], ["2026-08-15", 3]]), "2026-09-25");
    expect(s.first).toBe(3);
    expect(s.latest).toBe(2);
    expect(s.faded).toBe(1);
    expect(s.daysTracked).toBe(81);
    expect(s.text).toBe("One step lighter over 3 months.");
  });

  it("asks for a new rating every two weeks until the mark has faded", () => {
    expect(markSummary(mark([["2026-09-01", 2]]), "2026-09-14").updateDue).toBe(false);
    expect(markSummary(mark([["2026-09-01", 2]]), `2026-09-${String(1 + MARK_UPDATE_DAYS).padStart(2, "0")}`).updateDue).toBe(true);
    expect(markSummary(mark([["2026-09-01", 0]]), "2026-10-30").updateDue).toBe(false);
    expect(markSummary(mark([["2026-09-01", 2]], true), "2026-10-30").updateDue).toBe(false);
  });

  it("flags a mark that is getting more noticeable", () => {
    expect(markSummary(mark([["2026-09-01", 1], ["2026-09-20", 3]]), "2026-09-21").text).toMatch(/More noticeable/);
  });

  it("explains that unchanged marks are normal", () => {
    expect(markSummary(mark([["2026-09-01", 2], ["2026-09-20", 2]]), "2026-09-21").text).toMatch(/several months/);
  });

  it("requires at least one rating and labels every level", () => {
    expect(() => markSummary(mark([]), "2026-09-01")).toThrow();
    expect([0, 1, 2, 3].map(levelLabel)).toEqual(["Faded", "Faint", "Noticeable", "Very noticeable"]);
  });
});
