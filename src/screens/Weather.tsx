// Skin weather: today's conditions translated into skin-care tips, and the week ahead.

import { useState } from "preact/hooks";
import { notify, refreshWeather, settings, updateSettings, weather } from "../state";
import {
  COLD_C, DRY_RH, formatTemp, HIGH_UV, HOT_C, indoorHumidity, searchPlaces, skinTips, weatherFlags,
  type DailyWeather, type Place,
} from "../lib/weather";
import { formatDate, today } from "../lib/date";
import { back, go } from "../router";
import { Icon } from "../components/Icon";
import { Card, ScreenHeader, Spinner } from "../components/ui";

/** Today's forecast, or the next day available if the city is in a different time zone. */
export function todayWeather(days: DailyWeather[]): DailyWeather | null {
  const t = today();
  return days.find((d) => d.date === t) ?? days.find((d) => d.date > t) ?? null;
}

export function OpenMeteoCredit() {
  return <a class="credit" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a>;
}

/** Short words for a day's conditions, always written out (never color alone). */
export function WeatherFlags({ day }: { day: DailyWeather }) {
  const f = weatherFlags(day);
  const list = [f.dry && "Very dry", f.hot && "Hot", f.cold && "Cold", f.highUv && "High UV"].filter(Boolean) as string[];
  return list.length ? (
    <span class="flag-row">{list.map((x) => <span class="badge badge--possible">{x}</span>)}</span>
  ) : <span class="badge badge--strong">Mild</span>;
}

export function Weather() {
  const place = settings.value.weatherPlace;
  const [changing, setChanging] = useState(false);
  if (!place || changing) {
    return (
      <>
        <ScreenHeader title="Skin weather" onBack={() => (changing ? setChanging(false) : back("/today"))} />
        <PlacePicker onDone={() => setChanging(false)} />
      </>
    );
  }
  return (
    <>
      <ScreenHeader title="Skin weather" sub={place.name} onBack={() => back("/today")} />
      <Forecast />
      <div class="btn-row">
        <button class="btn btn--secondary" onClick={() => setChanging(true)}><Icon name="search" size={18} /> Change city</button>
        <button class="btn btn--ghost" onClick={async () => {
          await updateSettings({ weatherPlace: null });
          await refreshWeather();
          notify("Skin weather turned off.");
          go("/today", { replace: true });
        }}>Turn off</button>
      </div>
    </>
  );
}

function Forecast() {
  const w = weather.value;
  const t = today();
  const day = todayWeather(w.days);
  const week = w.days.filter((d) => d.date >= t).slice(0, 7);

  if (!day) {
    if (w.status === "error") {
      return (
        <div class="banner banner--warn" role="alert">
          <Icon name="alert" size={18} />
          <span>Couldn't get the weather. Check your connection. <button class="link-btn inline" onClick={() => void refreshWeather()}>Try again</button></span>
        </div>
      );
    }
    return <Spinner label="Getting the forecast…" />;
  }

  const indoor = Math.round(indoorHumidity(day.dewMean));
  return (
    <>
      <Card title={day.date === t ? "Today" : formatDate(day.date, { weekday: "long", month: "short", day: "numeric" })} icon="sun">
        <dl class="stats stats--wrap">
          <div><dt>High / low</dt><dd>{formatTemp(day.tMax)} / {formatTemp(day.tMin)}</dd></div>
          <div><dt>Humidity outside</dt><dd>{day.rhMean !== null ? `${Math.round(day.rhMean)}%` : "—"}</dd></div>
          <div><dt>Indoors (est.)</dt><dd>~{indoor}%</dd></div>
          <div><dt>UV</dt><dd>{day.uvMax !== null ? Math.round(day.uvMax) : "—"}</dd></div>
        </dl>
        <ul class="skin-tips">
          {skinTips(day).map((tip) => (
            <li class={tip.id === "mild" ? "" : "skin-tips__warn"}>
              <strong>{tip.title}.</strong> {tip.text}
            </li>
          ))}
        </ul>
        {w.status === "error" && <p class="muted small">Showing the last forecast Patchwork loaded. You seem to be offline.</p>}
      </Card>

      <Card title="Next 7 days" icon="calendar">
        <ul class="forecast">
          {week.map((d) => (
            <li>
              <span class="forecast__day">{d.date === t ? "Today" : formatDate(d.date, { weekday: "short" })}</span>
              <span class="forecast__temp">{formatTemp(d.tMax)} / {formatTemp(d.tMin)}</span>
              <WeatherFlags day={d} />
            </li>
          ))}
        </ul>
      </Card>

      <details class="explainer">
        <summary>How Patchwork reads the weather</summary>
        <p>
          <strong>Indoors</strong> is an estimate: Patchwork takes the outdoor dew point (how much water the air holds) and
          works out the humidity of that air warmed to {formatTemp(21)}, because heating makes cold air much drier.
          <strong> Very dry</strong> means under {DRY_RH}% humidity, indoors or outside. The EPA suggests keeping homes between
          30 and 50%.
        </p>
        <p>
          <strong>Hot</strong> means a high of {formatTemp(HOT_C)} or more, <strong>cold</strong> a low of {formatTemp(COLD_C)} or
          less, and <strong>high UV</strong> an index of {HIGH_UV} or more.
        </p>
        <p>
          On your Timeline, Patchwork compares your itch on very dry, hot and cold days with other days, using the same test as
          the triggers you log. <button class="link-btn inline" onClick={() => go("/learn/weather")}>Weather and your skin</button>
        </p>
      </details>

      <p class="muted small">
        Patchwork sends only your city's map coordinates to Open-Meteo. Nothing from your journal is sent. <OpenMeteoCredit />
      </p>
    </>
  );
}

function PlacePicker({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async (e: Event) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await searchPlaces(q);
      setResults(r);
      if (!r.length) setErr("No places found. Try the name of a nearby city.");
    } catch {
      setErr("Couldn't search right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (p: Place) => {
    await updateSettings({ weatherPlace: p });
    void refreshWeather();
    onDone();
  };

  return (
    <>
      <p>
        See how today's humidity, heat and UV may affect your skin, and find out whether dry, hot or cold days line up
        with your flares.
      </p>
      <form class="inline-add" onSubmit={search}>
        <label class="sr-only" for="city">City</label>
        <input id="city" placeholder="Your city or town" value={q} autoComplete="address-level2" maxLength={80}
          onInput={(e) => setQ(e.currentTarget.value)} />
        <button class="btn btn--primary" type="submit" disabled={busy || q.trim().length < 2}><Icon name="search" size={18} /> Search</button>
      </form>
      <p class="field-msg field-msg--error" role="alert">{err}</p>
      {results && results.length > 0 && (
        <ul class="settings-list">
          {results.map((p) => (
            <li>
              <button class="settings-row" onClick={() => void choose(p)}>
                <Icon name="sun" />
                <span class="settings-row__text"><span>{p.name}</span></span>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p class="muted small">
        Your search, and later your city's map coordinates, go to Open-Meteo, a free weather service. Pick a city rather
        than your home address: it's accurate enough for weather. <OpenMeteoCredit />
      </p>
    </>
  );
}
