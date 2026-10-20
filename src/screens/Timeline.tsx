import { useMemo, useState } from "preact/hooks";
import { entries, loadSampleData, poems, settings, treatments, weather } from "../state";
import { allPatterns, WEATHER_TRIGGER_LABELS } from "../lib/weather";
import { poemTrend } from "../lib/poem";
import { PoemChart } from "../components/PoemChart";
import { addDays, formatDate, today } from "../lib/date";
import { MIN_DAYS_FOR_PATTERNS, summarize, type Pattern, type Summary } from "../lib/insights";
import { areaLabel } from "../data/body";
import { triggerLabel } from "../data/options";
import { go } from "../router";
import { Icon } from "../components/Icon";
import { Card, Empty, ScreenHeader, Segmented, Sheet } from "../components/ui";
import { ItchChart } from "../components/ItchChart";
import { BodyHeat } from "../components/BodyMap";

const RANGES = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
];

export function Timeline() {
  const [days, setDays] = useState(30);
  const [missed, setMissed] = useState(false);
  const end = today();
  const start = addDays(end, -(days - 1));
  const summary = useMemo(() => summarize(entries.value, treatments.value, start, end), [entries.value, treatments.value, start, end]);
  const weatherDays = weather.value.days;
  const patterns = useMemo(() => allPatterns(entries.value, weatherDays, start, end), [entries.value, weatherDays, start, end]);
  const list = entries.value.filter((e) => e.date >= start).slice().reverse();
  const poemPoints = poemTrend(poems.value, end, start).points;

  if (!entries.value.some((e) => e.itch !== null)) {
    return (
      <>
        <ScreenHeader title="Timeline" />
        <Empty icon="chart" title="Nothing logged yet">
          <p class="muted">Your itch chart, patterns and history build up here as you check in.</p>
          <button class="btn btn--primary" onClick={() => go("/checkin")}>Do a check-in</button>
          <button class="link-btn" onClick={() => void loadSampleData()}>Or explore with sample data</button>
        </Empty>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Timeline" action={
        <button class="btn btn--ghost" onClick={() => setMissed(true)}><Icon name="plus" size={18} /> Missed day</button>
      } />
      <Segmented label="Time range" options={RANGES} value={days} onChange={setDays} />

      <Stats s={summary} />

      <Card title="Worst itch each day" icon="chart">
        <ItchChart series={summary.series} />
      </Card>

      <Card title="Weekly eczema score (POEM)" icon="clipboard">
        {poemPoints.length ? (
          <>
            <PoemChart points={poemPoints} />
            <p class="muted small">0–28. Lower is better. Counts days with itch, poor sleep, bleeding, oozing, cracking, flaking and dryness, with no questions about redness.</p>
          </>
        ) : (
          <p class="muted">Your weekly score appears here after your first questionnaire.</p>
        )}
        <button class="link-btn" onClick={() => go("/poem")}><Icon name="plus" size={16} /> Answer this week's questions</button>
      </Card>

      <Patterns patterns={patterns} logged={summary.daysLogged} />

      {summary.areas.length > 0 && (
        <Card title="Where it shows up" icon="heart">
          <div class="areas-split">
            <BodyHeat counts={summary.areas} />
            <ol class="ranked">
              {summary.areas.slice(0, 6).map(([a, n]) => (
                <li><span>{areaLabel(a)}</span><span class="muted">{n} {n === 1 ? "day" : "days"}</span></li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      <Card title="Check-ins" icon="calendar">
        <ul class="entry-list">
          {list.map((e) => (
            <li>
              <button class="entry-row" onClick={() => go(`/checkin/${e.date}`)}>
                <span class="entry-row__date">
                  <strong>{formatDate(e.date, { weekday: "short" })}</strong>
                  <span class="muted">{formatDate(e.date)}</span>
                </span>
                <span class="entry-row__body">
                  {e.itch !== null ? <span class="itch-pill">Itch {e.itch}</span> : <span class="muted small">Treatments only</span>}
                  <span class="muted small">{e.areas.slice(0, 3).map(areaLabel).join(", ")}{e.areas.length > 3 ? ` +${e.areas.length - 3}` : ""}</span>
                </span>
                <span class="entry-row__icons">
                  {e.note && <Icon name="message" size={16} label="Has a note" />}
                  {e.photoIds.length > 0 && <Icon name="camera" size={16} label="Has a photo" />}
                  <Icon name="chevron" size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <MissedDaySheet open={missed} onClose={() => setMissed(false)} />
    </>
  );
}

function Stats({ s }: { s: Summary }) {
  return (
    <dl class="stat-grid">
      <div><dt>Days logged</dt><dd>{s.daysLogged}<span class="muted">/{s.days}</span></dd></div>
      <div><dt>Average itch</dt><dd>{s.avgItch !== null ? s.avgItch.toFixed(1) : "—"}</dd></div>
      <div><dt>Flare days (7+)</dt><dd>{s.flareDays}</dd></div>
      <div><dt>Bad nights</dt><dd>{s.badSleepNights}</dd></div>
    </dl>
  );
}

/** `who` is "you" in the app and "the patient" on the report for the doctor. */
export function PatternSentence({ p, who = "you" }: { p: Pattern; who?: string }) {
  const weatherLabel = WEATHER_TRIGGER_LABELS[p.trigger];
  if (weatherLabel) {
    return (
      <>
        Itch was <strong>{p.diff.toFixed(1)} points higher</strong> {p.lag === 1 ? "the day after" : "on"}{" "}
        <strong>{weatherLabel}</strong>{" "}
        <span class="muted">({p.withMean.toFixed(1)} vs {p.withoutMean.toFixed(1)}, from {p.nWith} and {p.nWithout} days; local weather)</span>
      </>
    );
  }
  return (
    <>
      Itch was <strong>{p.diff.toFixed(1)} points higher</strong> {p.lag === 1 ? "the day after" : "on days"} {who} logged{" "}
      <strong>{triggerLabel(p.trigger).toLowerCase()}</strong>{" "}
      <span class="muted">({p.withMean.toFixed(1)} vs {p.withoutMean.toFixed(1)}, from {p.nWith} and {p.nWithout} days)</span>
    </>
  );
}

function Patterns({ patterns, logged }: { patterns: Pattern[]; logged: number }) {
  const shown = patterns.filter((p) => p.strength !== "none" && p.diff > 0);
  return (
    <Card title="Possible triggers" icon="sparkle">
      {logged < MIN_DAYS_FOR_PATTERNS ? (
        <>
          <p>Patterns appear after {MIN_DAYS_FOR_PATTERNS} days of check-ins in this range. You have {logged}.</p>
          <div class="meter" role="progressbar" aria-valuemin={0} aria-valuemax={MIN_DAYS_FOR_PATTERNS} aria-valuenow={logged} aria-label="Days logged toward patterns">
            <span style={{ width: `${(logged / MIN_DAYS_FOR_PATTERNS) * 100}%` }} />
          </div>
        </>
      ) : shown.length === 0 ? (
        <p>No clear patterns yet. That's useful to know too: nothing you've logged lines up reliably with worse days.</p>
      ) : (
        <ul class="patterns">
          {shown.map((p) => (
            <li>
              <span class={`badge badge--${p.strength}`}>
                <Icon name={p.strength === "strong" ? "sparkle" : "info"} size={14} />
                {p.strength === "strong" ? "Clear pattern" : "Possible pattern"}
              </span>
              <p><PatternSentence p={p} /></p>
            </li>
          ))}
        </ul>
      )}
      <details class="explainer">
        <summary>How Patchwork decides</summary>
        <p>
          For each trigger, Patchwork compares your itch on days with and without it, then shuffles the days
          thousands of times to see how often a gap that big shows up by pure chance. It checks both the same
          day and the next day. A <em>clear pattern</em> almost never appears by chance and is based on at least 5 days;
          a <em>possible pattern</em> is worth watching.
        </p>
        <p>
          {settings.value.weatherPlace
            ? "It also checks very dry, hot and cold days, using local weather for your city."
            : <>Add your city in <button class="link-btn inline" onClick={() => go("/weather")}>Skin weather</button> and it will also check very dry, hot and cold days.</>}
        </p>
        <p>
          Patterns aren't proof. Two things can happen on the same days for other reasons. Bring them to your doctor
          as questions, not answers. {settings.value.appointment ? "They're included in your visit report." : ""}
        </p>
      </details>
    </Card>
  );
}

function MissedDaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(addDays(today(), -1));
  return (
    <Sheet open={open} onClose={onClose} title="Log a missed day">
      <div class="field">
        <label for="missed-date">Which day?</label>
        <input id="missed-date" type="date" value={date} max={today()} onInput={(e) => setDate(e.currentTarget.value)} />
      </div>
      <p class="muted small">Log from memory as best you can. A rough answer is more useful than a gap.</p>
      <button class="btn btn--primary btn--block" disabled={!date} onClick={() => { onClose(); go(`/checkin/${date}`); }}>
        Continue
      </button>
    </Sheet>
  );
}
