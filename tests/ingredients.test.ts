import { describe, expect, it } from "vitest";
import { checkLabel, editDistance, tokenize } from "../src/lib/ingredients";

const flagged = (text: string) => checkLabel(text).results.map((r) => r.group.id);
const found = (text: string, group: string) => checkLabel(text).results.find((r) => r.group.id === group)?.found.map((f) => f.term) ?? [];

describe("label checker", () => {
  const bodyWash =
    "Ingredients: Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance (Parfum), " +
    "Glycerin, Citric Acid, Methylisothiazolinone, Methylchloroisothiazolinone, Limonene, Linalool, CI 42090.";

  it("flags fragrance, isothiazolinones and other common culprits on a typical body wash", () => {
    expect(flagged(bodyWash)).toEqual(["fragrance", "isothiazolinones", "limonene-linalool", "capb"]);
    expect(found(bodyWash, "fragrance").sort()).toEqual(["fragrance", "parfum"]);
    expect(found(bodyWash, "isothiazolinones").sort()).toEqual(["methylchloroisothiazolinone", "methylisothiazolinone"]);
  });

  it("doesn't confuse look-alike ingredients", () => {
    // laureth sulfate is not lauryl sulfate; citric acid is not citrus; triethanolamine is not ethanol;
    // cetyl and cetearyl alcohol are not drying alcohols; quaternium-18 is not quaternium-15;
    // dipropylene glycol is not propylene glycol.
    const text = "Water, Sodium Laureth Sulfate, Citric Acid, Triethanolamine, Cetyl Alcohol, Cetearyl Alcohol, Quaternium-18, Dipropylene Glycol, Benzyl Alcohol";
    expect(flagged(text)).toEqual([]);
  });

  it("ignores claims like fragrance-free and paraben-free", () => {
    expect(flagged("Fragrance-free. Free of parabens. Made without added fragrance. Ingredients: Water, Petrolatum")).toEqual([]);
  });

  it("flags plain Alcohol only when it is its own ingredient", () => {
    expect(flagged("Water, Alcohol, Glycerin")).toEqual(["alcohol"]);
    expect(flagged("Water, Alcohol Denat., Glycerin")).toEqual(["alcohol"]);
    expect(flagged("Water, Stearyl Alcohol, Glycerin")).toEqual([]);
  });

  it("survives common photo-reading mistakes", () => {
    // a wrong letter, a word split across lines, and words run together
    expect(flagged("Aqua, Methylisothiazolin0ne")).toEqual(["isothiazolinones"]);
    expect(flagged("Water, Sodium Laury1 Sulfate")).toEqual(["sls"]);
    expect(flagged("Glycerin, methyliso-\nthiazolinone, salt")).toEqual(["isothiazolinones"]);
    expect(flagged("Water, PropyleneGlycol")).toEqual(["propylene-glycol"]);
    expect(flagged("Water, DMDM Hydantoin, Quaternium-15")).toEqual(["formaldehyde"]);
  });

  it("reports the longest match once", () => {
    expect(found("Hexyl Cinnamal, Linalool", "fragrance-chemicals")).toEqual(["hexyl cinnamal"]);
  });

  it("adds notes for parabens and 'unscented' without flagging them", () => {
    const r = checkLabel("Unscented lotion. Ingredients: Water, Glycerin, Methylparaben, Propylparaben");
    expect(r.results).toEqual([]);
    expect(r.notes).toEqual(["parabens", "unscented"]);
  });

  it("tokenizes and measures edits", () => {
    expect(tokenize("Quaternium-15, 2-Bromo-2-Nitropropane-1,3-Diol")).toEqual(["quaternium", "15", "2", "bromo", "2", "nitropropane", "1", "3", "diol"]);
    expect(editDistance("lauryl", "laury1", 1)).toBe(1);
    expect(editDistance("abcdef", "uvwxyz", 1)).toBe(2); // gives up early past the limit
  });
});
