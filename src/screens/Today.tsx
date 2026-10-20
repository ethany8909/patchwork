import { useState } from "preact/hooks";
import {
  blankEntry, entries, hasDemoData, lock, marks, notify, photos, poems, products, saveEntry, settings, todayEntry,
  toggleTreatmentUsed, treatments, weather,
} from "../state";
import { formatTemp, indoorHumidity, skinTips } from "../lib/weather";
import { OpenMeteoCredit, todayWeather } from "./Weather";
import { describeChange, poemDue, poemTrend, POEM_MAX } from "../lib/poem";
import { markSummary } from "../lib/marks";
import { addDays, daysBetween, formatLong, formatTime, greeting, relativeDay, today } from "../lib/date";
import { summarize } from "../lib/insights";
import { areaLabel } from "../data/body";
import { SLEEP_OPTIONS } from "../data/options";
import { go } from "../router";
import { Icon } from "../components/Icon";
import { Card, ItchScale } from "../components/ui";
import { ItchChart } from "../components/ItchChart";

export function Today() {
  const s = settings.value;
  const t = today();
  const e = todayEntry.value;
  const checkedIn = e !== null && e.itch !== null;
  const last14 = summarize(entries.value, treatments.value, addDays(t, -13), t);
  const loggedThisWeek = entries.value.filter((x) => x.itch !== null && x.date > addDays(t, -7)).length;
  const active = treatments.value.filter((x) => x.active);
  const daysToVisit = s.appointment ? daysBetween(t, s.appointment) : null;

  return (
    <>
      <header class="today-head">
        <div>
          <p class="muted">{formatLong(t)}</p>
          <h1 tabIndex={-1} data-autofocus>{greeting()}{s.nickname ? `, ${s.nickname}` : ""}</h1>
        </div>
        <div class="today-head__actions">
          <button class="icon-btn" aria-label="Lock journal" onClick={lock}><Icon name="lock" /></button>
          <button class="icon-btn" aria-label="Settings" onClick={() => go("/settings")}><Icon name="gear" /></button>
        </div>
      </header>

      {hasDemoData.value && (
        <div class="banner banner--info" role="note">
          <Icon name="info" size={18} />
          <span>You're looking at sample data. <button class="link-btn inline" onClick={() => go("/settings/data")}>Remove it</button> when you're ready to start.</span>
        </div>
      )}

      {checkedIn ? <DoneCard /> : <CheckInCard />}

      <SkinWeatherCard />
      <PoemCard />
      <MarksCard />
      <ProductCard />

      {active.length > 0 && (
        <Card title="Treatments today" icon="pill">
          <ul class="checklist">
            {active.map((tr) => {
              const done = e?.treatments.includes(tr.id) ?? false;
              return (
                <li>
                  <label class="check-row">
                    <input type="checkbox" checked={done} onChange={() => void toggleTreatmentUsed(tr.id)} />
                    <span>
                      <span class={done ? "done" : ""}>{tr.name}</span>
                      {tr.times.length > 0 && <span class="muted small"> · {tr.times.map(formatTime).join(", ")}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {daysToVisit !== null && daysToVisit >= 0 && (
        <Card class="card--accent">
          <div class="row-between">
            <div>
              <p class="eyebrow">Dermatology visit</p>
              <p class="big">{relativeDay(s.appointment!)}</p>
            </div>
            <button class="btn btn--secondary" onClick={() => go("/visit")}>
              <Icon name="report" /> Prep report
            </button>
          </div>
        </Card>
      )}

      <Card title="Last 14 days" icon="chart">
        {last14.daysLogged === 0 ? (
          <p class="muted">Your itch chart appears here after your first check-in.</p>
        ) : (
          <>
            <ItchChart series={last14.series} />
            <p class="muted small">
              You've checked in {loggedThisWeek} of the last 7 days.{" "}
              {loggedThisWeek >= 5 ? "That's plenty for spotting patterns." : "Most days is enough. Missing some is fine."}
            </p>
          </>
        )}
        <button class="link-btn" onClick={() => go("/timeline")}>See your full timeline <Icon name="chevron" size={16} /></button>
      </Card>

      <Tips />

      <button class="link-btn link-btn--warn center" onClick={() => go("/learn/urgent")}>
        <Icon name="alert" size={18} /> Signs you should get care now
      </button>
    </>
  );
}

function CheckInCard() {
  const [quick, setQuick] = useState<number | null>(null);
  const logQuick = async (v: number) => {
    setQuick(v);
    const e = todayEntry.value ?? blankEntry();
    await saveEntry({ ...e, itch: v });
    notify("Itch logged. Add details any time today.");
  };
  return (
    <Card class="card--hero">
      <h2 class="hero-q">How's your skin today?</h2>
      <button class="btn btn--primary btn--block btn--lg" onClick={() => go("/checkin")}>
        <Icon name="plus" /> Check in <span class="btn__meta">about 1 min</span>
      </button>
      <p class="muted small center">Short on time? Just log your worst itch:</p>
      <ItchScale value={quick} onChange={(v) => void logQuick(v)} />
    </Card>
  );
}

function DoneCard() {
  const e = todayEntry.value!;
  const photoToday = photos.value.some((p) => p.date === e.date);
  return (
    <Card class="card--done">
      <div class="row-between">
        <div class="done-head">
          <span class="done-check"><Icon name="check" size={18} /></span>
          <h2>Checked in today</h2>
        </div>
        <button class="btn btn--ghost" onClick={() => go(`/checkin/${e.date}`)}><Icon name="edit" size={18} /> Edit</button>
      </div>
      <dl class="stats">
        <div><dt>Worst itch</dt><dd>{e.itch}/10</dd></div>
        <div><dt>Sleep</dt><dd>{e.sleep !== null ? SLEEP_OPTIONS[e.sleep].label : "—"}</dd></div>
      </dl>
      {e.areas.length > 0 && <p class="small"><strong>Where:</strong> {e.areas.map(areaLabel).join(", ")}</p>}
      {!photoToday && (
        <button class="link-btn" onClick={() => go("/photos/new")}><Icon name="camera" size={18} /> Add a progress photo</button>
      )}
    </Card>
  );
}

function PoemCard() {
  const t = today();
  const trend = poemTrend(poems.value, t);
  const due = poemDue(poems.value, t);
  const latest = trend.latest;
  return (
    <Card title="Weekly eczema score" icon="clipboard" class={due ? "card--accent" : ""}>
      {latest && (
        <div class="poem-mini">
          <p class="poem-mini__score"><strong>{latest.score}</strong><span class="muted"> / {POEM_MAX}</span></p>
          <div>
            <p><strong>{latest.band.label}</strong> · {relativeDay(latest.record.date)}</p>
            {trend.change !== null && <p class="muted small">{describeChange(trend.change)}</p>}
          </div>
        </div>
      )}
      {due ? (
        <>
          <p class="small">{latest ? "Time for this week's score." : "Seven quick questions about the past week. No redness questions, so it works the same on every skin tone."}</p>
          <button class="btn btn--primary btn--block" onClick={() => go("/poem")}>
            <Icon name="clipboard" /> {latest ? "Answer this week's questions" : "Get your first score"} <span class="btn__meta">1 min</span>
          </button>
        </>
      ) : (
        <button class="link-btn" onClick={() => go("/timeline")}>See your score over time <Icon name="chevron" size={16} /></button>
      )}
    </Card>
  );
}

function MarksCard() {
  const t = today();
  const active = marks.value.filter((m) => !m.resolved);
  if (!active.length) return null;
  const due = active.filter((m) => markSummary(m, t).updateDue).length;
  const fading = active.filter((m) => markSummary(m, t).faded > 0).length;
  return (
    <Card title="Dark marks" icon="spot">
      <p>
        {active.length} {active.length === 1 ? "mark" : "marks"} tracked
        {fading > 0 && <> · {fading} fading</>}
        {due > 0 && <> · <strong>{due} ready for a new rating</strong></>}
      </p>
      <button class="link-btn" onClick={() => go("/photos/marks")}>Open dark marks <Icon name="chevron" size={16} /></button>
    </Card>
  );
}

function SkinWeatherCard() {
  const place = settings.value.weatherPlace;
  const w = weather.value;
  if (!place) {
    return (
      <Card title="Skin weather" icon="sun">
        <p class="small">See what today's humidity, heat and UV mean for your skin, and whether dry days line up with your flares.</p>
        <button class="btn btn--secondary" onClick={() => go("/weather")}><Icon name="search" size={18} /> Choose your city</button>
      </Card>
    );
  }
  const day = todayWeather(w.days);
  const tips = day ? skinTips(day) : [];
  return (
    <Card title={`Skin weather · ${place.name.split(",")[0]}`} icon="sun">
      {day ? (
        <>
          <p class="weather-mini">
            <span><strong>{formatTemp(day.tMax)}</strong> / {formatTemp(day.tMin)}</span>
            <span><Icon name="drop" size={16} /> {day.rhMean !== null ? `${Math.round(day.rhMean)}% outside, ` : ""}~{Math.round(indoorHumidity(day.dewMean))}% indoors</span>
            {day.uvMax !== null && <span>UV {Math.round(day.uvMax)}</span>}
          </p>
          <ul class="skin-tips">
            {tips.map((t) => <li class={t.id === "mild" ? "" : "skin-tips__warn"}><strong>{t.title}.</strong> {t.text}</li>)}
          </ul>
        </>
      ) : (
        <p class="muted small">{w.status === "error" ? "The weather isn't available right now. Check your connection." : "Getting today's weather…"}</p>
      )}
      <div class="card-foot">
        <button class="link-btn" onClick={() => go("/weather")}>The week ahead <Icon name="chevron" size={16} /></button>
        <OpenMeteoCredit />
      </div>
    </Card>
  );
}

function ProductCard() {
  const n = products.value.length;
  return (
    <Card title="Product check" icon="bottle">
      <p class="small">Photograph the ingredients on a lotion, soap or shampoo to spot ones that often bother eczema-prone skin.</p>
      <div class="row-between">
        <button class="btn btn--secondary" onClick={() => go("/products/new")}><Icon name="camera" size={18} /> Check a label</button>
        {n > 0 && <button class="link-btn" onClick={() => go("/products")}>My products ({n}) <Icon name="chevron" size={16} /></button>}
      </div>
    </Card>
  );
}

function Tips() {
  const s = settings.value;
  const recentPhoto = photos.value.some((p) => p.date >= addDays(today(), -14));
  let tip: { icon: "shield" | "camera" | "bell"; text: string; action: string; path: string } | null = null;
  if (!s.twoFactor) tip = { icon: "shield", text: "Add two-step verification so a passcode alone can't open your journal.", action: "Set it up", path: "/settings/2fa" };
  else if (!recentPhoto && entries.value.length >= 3) tip = { icon: "camera", text: "A progress photo every week or two makes changes easy to see.", action: "Take one", path: "/photos/new" };
  else if (!s.reminder.enabled) tip = { icon: "bell", text: "A daily reminder makes it easier to log most days.", action: "Turn on", path: "/settings/reminders" };
  if (!tip) return null;
  return (
    <div class="tip">
      <Icon name={tip.icon} />
      <p>{tip.text}</p>
      <button class="btn btn--ghost" onClick={() => go(tip!.path)}>{tip.action}</button>
    </div>
  );
}
