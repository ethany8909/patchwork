// Skin weather: local weather, translated into what it means for eczema-prone skin.
//
// Data comes from Open-Meteo (free, no account, CC BY 4.0). Only the coordinates of the
// city the user picks are sent; nothing from the journal ever is.
//
// Why dew point: cold or dry outdoor air gets much drier once it is heated indoors, and
// people spend most of their time indoors. The dew point tells us how much water the air
// holds, so we can estimate the humidity of that same air warmed to room temperature.

import { triggerPatterns, rankPatterns, type Pattern } from "./insights";
import type { Entry, ISODate, WeatherPlace } from "./types";

export type Place = WeatherPlace;

export interface DailyWeather {
  date: ISODate;
  /** °C */
  tMax: number;
  tMin: number;
  /** Mean outdoor relative humidity, %. */
  rhMean: number | null;
  /** Mean dew point, °C. */
  dewMean: number;
  uvMax: number | null;
}

/** Room temperature used for the indoor estimate: 21 °C (70 °F). */
export const ROOM_C = 21;
/** Below this humidity, indoors (estimated) or outdoors, the air counts as very dry (EPA suggests keeping homes at 30-50%). */
export const DRY_RH = 30;
export const HOT_C = 30; // 86 °F
export const COLD_C = 5; // 41 °F
export const HIGH_UV = 6;

/** Saturation vapor pressure in hPa (Magnus formula, Alduchov & Eskridge 1996). */
function saturationPressure(tC: number): number {
  return 6.1094 * Math.exp((17.625 * tC) / (tC + 243.04));
}

/** Estimated relative humidity (%) of outdoor air with this dew point once it is warmed to room temperature. */
export function indoorHumidity(dewPointC: number, roomC = ROOM_C): number {
  const rh = (100 * saturationPressure(dewPointC)) / saturationPressure(roomC);
  return Math.max(0, Math.min(100, rh));
}

export interface WeatherFlags {
  dry: boolean;
  hot: boolean;
  cold: boolean;
  highUv: boolean;
}

/** The drier of the outdoor humidity and the indoor estimate, and where it is. */
export function driestAir(d: DailyWeather): { rh: number; where: "indoors" | "outdoors" } {
  const indoor = indoorHumidity(d.dewMean);
  return d.rhMean !== null && d.rhMean < indoor ? { rh: d.rhMean, where: "outdoors" } : { rh: indoor, where: "indoors" };
}

export function weatherFlags(d: DailyWeather): WeatherFlags {
  return {
    dry: driestAir(d).rh < DRY_RH,
    hot: d.tMax >= HOT_C,
    cold: d.tMin <= COLD_C,
    highUv: (d.uvMax ?? 0) >= HIGH_UV,
  };
}

// ---------- display ----------

/** Fahrenheit for the US (and a few other places), Celsius everywhere else. */
export function usesFahrenheit(locale = typeof navigator !== "undefined" ? navigator.language : "en-US"): boolean {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region === "US" || region === "LR" || region === "MM";
  } catch {
    return false;
  }
}

export function formatTemp(c: number, fahrenheit = usesFahrenheit()): string {
  return fahrenheit ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`;
}

export interface SkinTip {
  id: "dry" | "hot" | "cold" | "uv" | "mild";
  title: string;
  text: string;
}

/** General skin-care tips for a day's weather (AAD and EPA guidance; see the "weather" Learn article). */
export function skinTips(d: DailyWeather, fahrenheit = usesFahrenheit()): SkinTip[] {
  const f = weatherFlags(d);
  const tips: SkinTip[] = [];
  if (f.dry) {
    const air = driestAir(d);
    const where = air.where === "indoors" ? "Heated indoors, today's air is" : "The air outside today is";
    tips.push({
      id: "dry",
      title: "Very dry air",
      text: `${where} only about ${Math.round(air.rh)}% humidity. Moisturize right after bathing, and a humidifier in your bedroom can help (clean it often).`,
    });
  }
  if (f.hot) {
    tips.push({
      id: "hot",
      title: `Hot day (${formatTemp(d.tMax, fahrenheit)})`,
      text: "Sweat and overheating are common triggers. Wear loose cotton, take breaks to cool down, and rinse off sweat.",
    });
  }
  if (f.cold) {
    tips.push({
      id: "cold",
      title: `Cold day (${formatTemp(d.tMin, fahrenheit)})`,
      text: "Cold, windy weather dries skin out. Cover up outside and moisturize more often.",
    });
  }
  if (f.highUv) {
    tips.push({
      id: "uv",
      title: `High UV (${Math.round(d.uvMax ?? 0)})`,
      text: "Sunburn can set off a flare. Seek shade, and use a fragrance-free sunscreen with zinc oxide or titanium dioxide, SPF 30+.",
    });
  }
  if (!tips.length) {
    tips.push({ id: "mild", title: "Mild conditions", text: "Nothing in today's weather is a common skin trigger. Keep up your usual routine." });
  }
  return tips;
}

// ---------- patterns ----------

export const WEATHER_TRIGGER_LABELS: Record<string, string> = {
  "weather-dry": "very dry days",
  "weather-hot": "hot days",
  "weather-cold": "cold days",
};

export function weatherTriggers(d: DailyWeather): string[] {
  const f = weatherFlags(d);
  return [...(f.dry ? ["weather-dry"] : []), ...(f.hot ? ["weather-hot"] : []), ...(f.cold ? ["weather-cold"] : [])];
}

/**
 * The same permutation test as logged triggers, using the measured weather of each day
 * instead of what was ticked. Only days with weather data take part, so days we know
 * nothing about are never counted as "not dry".
 */
export function weatherPatterns(entries: Entry[], days: DailyWeather[], start: ISODate, end: ISODate): Pattern[] {
  const itch = new Map(entries.map((e) => [e.date, e.itch]));
  const daily: Entry[] = days.map((d) => ({
    id: `weather-${d.date}`, date: d.date, itch: itch.get(d.date) ?? null, sleep: null, areas: [], looks: [],
    triggers: weatherTriggers(d), treatments: [], note: "", photoIds: [], createdAt: 0, updatedAt: 0,
  }));
  return triggerPatterns(daily, start, end);
}

/** Logged-trigger patterns plus weather patterns, strongest first. */
export function allPatterns(entries: Entry[], days: DailyWeather[], start: ISODate, end: ISODate): Pattern[] {
  return rankPatterns([...triggerPatterns(entries, start, end), ...(days.length ? weatherPatterns(entries, days, start, end) : [])]);
}

// ---------- Open-Meteo ----------

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

interface ForecastResponse {
  daily?: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    relative_humidity_2m_mean: (number | null)[];
    dew_point_2m_mean: (number | null)[];
    uv_index_max: (number | null)[];
  };
}

/** Days missing temperature or dew point (Open-Meteo has none for its oldest past days) are left out. */
export function parseForecast(json: ForecastResponse): DailyWeather[] {
  const d = json.daily;
  if (!d || !Array.isArray(d.time)) throw new Error("Unexpected weather data");
  const out: DailyWeather[] = [];
  d.time.forEach((date, i) => {
    const tMax = d.temperature_2m_max?.[i];
    const tMin = d.temperature_2m_min?.[i];
    const dewMean = d.dew_point_2m_mean?.[i];
    if (tMax == null || tMin == null || dewMean == null) return;
    out.push({ date, tMax, tMin, dewMean, rhMean: d.relative_humidity_2m_mean?.[i] ?? null, uvMax: d.uv_index_max?.[i] ?? null });
  });
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, referrerPolicy: "no-referrer" });
    if (!r.ok) throw new Error(`Weather service error ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; days: DailyWeather[] }>();

/** About three months of past days (for patterns) and the next week, cached for an hour. */
export async function fetchWeather(place: Place, now = Date.now()): Promise<DailyWeather[]> {
  const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < 60 * 60_000) return hit.days;
  const params = new URLSearchParams({
    latitude: place.lat.toFixed(2),
    longitude: place.lon.toFixed(2),
    daily: "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,dew_point_2m_mean,uv_index_max",
    timezone: "auto",
    past_days: "92",
    forecast_days: "7",
  });
  const days = parseForecast(await getJson<ForecastResponse>(`${FORECAST}?${params}`));
  cache.set(key, { at: now, days });
  return days;
}

interface GeocodeResponse {
  results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
}

/** City search. Only the typed text goes to Open-Meteo. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const lang = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2);
  const params = new URLSearchParams({ name: q, count: "6", language: lang, format: "json" });
  const json = await getJson<GeocodeResponse>(`${GEOCODE}?${params}`);
  return (json.results ?? []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", "),
    lat: Math.round(r.latitude * 100) / 100,
    lon: Math.round(r.longitude * 100) / 100,
  }));
}
