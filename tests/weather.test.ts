import { describe, expect, it } from "vitest";
import {
  allPatterns, formatTemp, indoorHumidity, parseForecast, skinTips, usesFahrenheit, weatherFlags, weatherPatterns,
  type DailyWeather,
} from "../src/lib/weather";
import { addDays } from "../src/lib/date";
import { mulberry32 } from "../src/lib/insights";
import type { Entry } from "../src/lib/types";

const day = (date: string, w: Partial<DailyWeather> = {}): DailyWeather => ({
  date, tMax: 22, tMin: 14, rhMean: 60, dewMean: 12, uvMax: 4, ...w,
});

const entry = (date: string, itch: number): Entry => ({
  id: date, date, itch, sleep: 0, areas: [], looks: [], triggers: [], treatments: [], note: "", photoIds: [], createdAt: 0, updatedAt: 0,
});

describe("indoor humidity estimate", () => {
  it("is 100% when the dew point equals room temperature", () => {
    expect(indoorHumidity(21)).toBeCloseTo(100, 5);
  });
  it("matches a hand calculation for cold winter air heated to 21 °C", () => {
    // dew point 0 °C: 6.11 hPa / 24.86 hPa at 21 °C ≈ 24.6%
    expect(indoorHumidity(0)).toBeCloseTo(24.6, 0);
  });
  it("never goes above 100%", () => {
    expect(indoorHumidity(26)).toBe(100);
  });
});

describe("weather flags and tips", () => {
  it("calls dry, hot, cold and high-UV days from the thresholds", () => {
    expect(weatherFlags(day("2026-01-01", { dewMean: 0 })).dry).toBe(true); // ~25% indoors
    expect(weatherFlags(day("2026-01-01", { dewMean: 10 })).dry).toBe(false); // ~49% indoors
    // A hot, dry wind day: ~36% indoors, but only 25% outside
    expect(weatherFlags(day("2026-10-16", { dewMean: 5.3, rhMean: 25, tMax: 31 })).dry).toBe(true);
    expect(skinTips(day("2026-10-16", { dewMean: 5.3, rhMean: 25 }))[0].text).toContain("outside today is only about 25%");
    expect(weatherFlags(day("2026-07-01", { tMax: 31 })).hot).toBe(true);
    expect(weatherFlags(day("2026-01-01", { tMin: 4 })).cold).toBe(true);
    expect(weatherFlags(day("2026-07-01", { uvMax: 8 })).highUv).toBe(true);
  });

  it("gives one tip per issue, or a 'mild' tip", () => {
    expect(skinTips(day("2026-10-15", { dewMean: 2, tMax: 31, uvMax: 7 })).map((t) => t.id)).toEqual(["dry", "hot", "uv"]);
    expect(skinTips(day("2026-10-15")).map((t) => t.id)).toEqual(["mild"]);
  });

  it("formats temperature for the user's region", () => {
    expect(usesFahrenheit("en-US")).toBe(true);
    expect(usesFahrenheit("en-GB")).toBe(false);
    expect(formatTemp(30, true)).toBe("86°F");
    expect(formatTemp(30, false)).toBe("30°C");
  });
});

describe("parsing Open-Meteo", () => {
  it("keeps complete days and drops days the service has no data for", () => {
    const days = parseForecast({
      daily: {
        time: ["2026-07-12", "2026-10-12"],
        temperature_2m_max: [null, 21.4],
        temperature_2m_min: [null, 15.5],
        relative_humidity_2m_mean: [null, 72],
        dew_point_2m_mean: [null, 12.6],
        uv_index_max: [null, 5.2],
      },
    });
    expect(days).toEqual([{ date: "2026-10-12", tMax: 21.4, tMin: 15.5, rhMean: 72, dewMean: 12.6, uvMax: 5.2 }]);
  });
  it("rejects a response without daily data", () => {
    expect(() => parseForecast({})).toThrow();
  });
});

describe("weather patterns", () => {
  const start = "2026-08-01";
  const days = 40;

  it("finds itch that is higher on very dry days", () => {
    const rand = mulberry32(7);
    const weather: DailyWeather[] = [];
    const entries: Entry[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const dry = rand() < 0.35;
      weather.push(day(date, { dewMean: dry ? -2 : 12 }));
      entries.push(entry(date, Math.round(3 + rand() * 1.5 + (dry ? 3 : 0))));
    }
    const p = weatherPatterns(entries, weather, start, addDays(start, days - 1));
    expect(p[0]).toMatchObject({ trigger: "weather-dry", lag: 0, strength: "strong" });
    expect(p[0].diff).toBeGreaterThan(2);
  });

  it("doesn't invent a weather pattern from noise", () => {
    const rand = mulberry32(11);
    const weather: DailyWeather[] = [];
    const entries: Entry[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      weather.push(day(date, { dewMean: rand() < 0.4 ? -2 : 12 }));
      entries.push(entry(date, Math.round(3 + rand() * 3)));
    }
    const p = weatherPatterns(entries, weather, start, addDays(start, days - 1));
    expect(p.filter((x) => x.strength === "strong")).toEqual([]);
  });

  it("only uses days that have weather data, and merges with logged triggers", () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(addDays(start, i), 3));
    const weather = [day(addDays(start, 0), { dewMean: -5 })]; // a single day of weather
    expect(weatherPatterns(entries, weather, start, addDays(start, 29))).toEqual([]); // too few days to test
    expect(allPatterns(entries, [], start, addDays(start, 29))).toEqual([]);
  });
});
