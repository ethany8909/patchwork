import { describe, expect, it } from "vitest";
import { assessLighting, lumaValues } from "../src/lib/photoQuality";

/** n pixels of one RGB color, as RGBA bytes. */
function fill(n: number, [r, g, b]: [number, number, number]): number[] {
  return Array.from({ length: n }, () => [r, g, b, 255]).flat();
}

describe("photo lighting checks", () => {
  it("computes luma from RGBA", () => {
    expect(lumaValues([255, 255, 255, 255, 0, 0, 0, 255])).toEqual([255, 0]);
  });

  it("does not call a well-lit photo of deep brown skin 'dim'", () => {
    // Mostly dark skin (luma ~ 55) with a brighter, daylit background in part of the frame.
    const px = [...fill(800, [78, 52, 38]), ...fill(200, [200, 196, 190])];
    expect(assessLighting(px).issues).not.toContain("dim");
  });

  it("flags a genuinely underexposed photo", () => {
    expect(assessLighting(fill(1000, [30, 22, 18])).issues).toContain("dim");
  });

  it("flags flash glare and backlight", () => {
    const glare = [...fill(850, [150, 110, 90]), ...fill(150, [255, 255, 255])];
    expect(assessLighting(glare).issues).toContain("glare");
    const backlit = [...fill(300, [5, 4, 3]), ...fill(500, [90, 70, 60]), ...fill(200, [255, 255, 255])];
    expect(assessLighting(backlit).issues).toEqual(expect.arrayContaining(["glare", "backlit"]));
  });

  it("compares with the user's own last photo, not a fixed standard", () => {
    const px = fill(1000, [150, 110, 90]);
    const mean = assessLighting(px).mean;
    expect(assessLighting(px, mean + 10).issues).not.toContain("unlike-last");
    expect(assessLighting(px, mean + 60).issues).toContain("unlike-last");
    expect(assessLighting(px).issues).toEqual([]);
  });
});
