import { useMemo, useState } from "preact/hooks";
import { entries, marks, notify, photos, poems, products, settings, treatments, updateSettings, weather } from "../state";
import { allPatterns } from "../lib/weather";
import { checkLabel } from "../lib/ingredients";
import { describeChange, POEM_MAX, poemTrend } from "../lib/poem";
import { levelLabel, markSummary } from "../lib/marks";
import { PoemChart } from "../components/PoemChart";
import { addDays, daysBetween, formatDate, relativeDay, today, uid } from "../lib/date";
import { summarize } from "../lib/insights";
import { areaLabel } from "../data/body";
import { lookLabel, SUGGESTED_QUESTIONS } from "../data/options";
import { back, go, route } from "../router";
import { Icon } from "../components/Icon";
import { Card, ScreenHeader, Segmented, Sheet, Toggle } from "../components/ui";

export const TONE_NOTE =
  "My eczema often looks darker, purple or gray rather than red, so redness may understate how active it is. " +
  "Please also consider itch, thickening, dryness and the dark marks it leaves.";
import { ItchChart } from "../components/ItchChart";
import { PhotoImg } from "../components/Photo";
import { PatternSentence } from "./Timeline";
import { Logo } from "../components/Logo";

const RANGES = [
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
];

export function Visit() {
  return route.value.parts[1] === "print" ? <PrintView /> : <Builder />;
}

function Builder() {
  const s = settings.value;
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const chosen = photos.value.filter((p) => s.reportPhotoIds.includes(p.id));

  const addQuestion = async (text: string) => {
    const t = text.trim().slice(0, 200);
    if (!t || s.questions.some((x) => x.text === t)) return;
    await updateSettings({ questions: [...s.questions, { id: uid(), text: t }] });
  };

  return (
    <>
      <ScreenHeader title="Visit report" sub="One page for your dermatologist: what happened between visits." />

      <Card title="Appointment" icon="calendar">
        <div class="field">
          <label for="appt">Next dermatology appointment</label>
          <div class="field__with-btn">
            <input id="appt" type="date" value={s.appointment ?? ""} min={today()}
              onInput={(e) => void updateSettings({ appointment: e.currentTarget.value || null })} />
            {s.appointment && <button class="field__btn" onClick={() => void updateSettings({ appointment: null })}>Clear</button>}
          </div>
        </div>
        {s.appointment && daysBetween(today(), s.appointment) >= 0 && (
          <p class="muted small">{relativeDay(s.appointment)}. A countdown shows on your home screen so you remember to review this first.</p>
        )}
      </Card>

      <Card title="Report covers" icon="chart">
        <Segmented label="Report period" options={RANGES} value={s.reportRangeDays} onChange={(v) => void updateSettings({ reportRangeDays: v })} />
      </Card>

      <Card title="About my skin" icon="heart">
        <Toggle
          label="Add a skin-tone note for my doctor"
          description="Puts a short note at the top of the report. Helpful if your flares don't look red."
          checked={s.clinicianToneNote}
          onChange={(v) => void updateSettings({ clinicianToneNote: v })}
        />
        {s.clinicianToneNote && <p class="callout small">“{TONE_NOTE}”</p>}
      </Card>

      <Card title="Questions to ask" icon="message">
        {s.questions.length > 0 && (
          <ol class="question-list">
            {s.questions.map((x, i) => (
              <li>
                <span class="question-list__n" aria-hidden="true">{i + 1}.</span>
                <span class="question-list__text">{x.text}</span>
                <button class="icon-btn icon-btn--sm" aria-label={`Remove question: ${x.text}`}
                  onClick={() => void updateSettings({ questions: s.questions.filter((y) => y.id !== x.id) })}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <form class="inline-add" onSubmit={(e) => { e.preventDefault(); void addQuestion(q); setQ(""); }}>
          <label class="sr-only" for="newq">Add a question</label>
          <input id="newq" placeholder="Type a question…" value={q} maxLength={200} onInput={(e) => setQ(e.currentTarget.value)} />
          <button class="btn btn--secondary" type="submit" disabled={!q.trim()}>Add</button>
        </form>
        <p class="muted small">Ideas:</p>
        <div class="chips">
          {SUGGESTED_QUESTIONS.filter((t) => !s.questions.some((x) => x.text === t)).slice(0, 4).map((t) => (
            <button class="chip chip--add" onClick={() => void addQuestion(t)}><Icon name="plus" size={14} /> {t}</button>
          ))}
        </div>
      </Card>

      <Card title="Photos in the report" icon="camera">
        {chosen.length ? (
          <div class="thumb-row">{chosen.map((p) => <PhotoImg photo={p} class="thumb" />)}</div>
        ) : (
          <p class="muted small">Choose up to 4. Photos from your worst days help most.</p>
        )}
        <button class="btn btn--secondary" onClick={() => setPicking(true)} disabled={!photos.value.length}>
          {photos.value.length ? "Choose photos" : "No photos yet"}
        </button>
      </Card>

      <button class="btn btn--primary btn--block btn--lg" onClick={() => go("/visit/print")}>
        <Icon name="report" /> Preview report
      </button>
      <p class="muted small center">From the preview you can print it or save it as a PDF.</p>

      <PhotoPicker open={picking} onClose={() => setPicking(false)} />
    </>
  );
}

function PhotoPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = settings.value;
  const toggle = (id: string) => {
    const on = s.reportPhotoIds.includes(id);
    if (!on && s.reportPhotoIds.length >= 4) {
      notify("The report fits 4 photos. Remove one first.", "error");
      return;
    }
    void updateSettings({ reportPhotoIds: on ? s.reportPhotoIds.filter((x) => x !== id) : [...s.reportPhotoIds, id] });
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Choose photos (${s.reportPhotoIds.length}/4)`}>
      <ul class="pick-grid">
        {[...photos.value].reverse().map((p) => (
          <li>
            <button class="pick" aria-pressed={s.reportPhotoIds.includes(p.id)} onClick={() => toggle(p.id)}>
              <PhotoImg photo={p} class="thumb" />
              <span class="small">{areaLabel(p.area)} · {formatDate(p.date)}</span>
              {s.reportPhotoIds.includes(p.id) && <span class="pick__check"><Icon name="check" size={16} /></span>}
            </button>
          </li>
        ))}
      </ul>
      <button class="btn btn--primary btn--block" onClick={onClose}>Done</button>
    </Sheet>
  );
}

function PrintView() {
  return (
    <div class="print-wrap">
      <div class="print-bar no-print">
        <button class="btn btn--ghost" onClick={() => back("/visit")}><Icon name="back" size={18} /> Back</button>
        <button class="btn btn--primary" onClick={() => window.print()}><Icon name="printer" size={18} /> Print or save PDF</button>
      </div>
      <p class="muted small no-print center">Tip: in the print dialog, choose "Save as PDF" to share it through your patient portal or email.</p>
      <Report />
    </div>
  );
}

export function Report() {
  const s = settings.value;
  const end = today();
  const start = addDays(end, -(s.reportRangeDays - 1));
  const sum = useMemo(() => summarize(entries.value, treatments.value, start, end), [entries.value, treatments.value, start, end]);
  const weatherDays = weather.value.days;
  const patterns = useMemo(
    () => allPatterns(entries.value, weatherDays, start, end).filter((p) => p.strength !== "none" && p.diff > 0).slice(0, 4),
    [entries.value, weatherDays, start, end],
  );
  const flaggedProducts = products.value
    .map((p) => ({ p, groups: checkLabel(p.text).results.map((r) => r.group.name) }))
    .filter((x) => x.groups.length)
    .slice(0, 6);
  const notes = entries.value.filter((e) => e.date >= start && e.note.trim()).slice(-5).reverse();
  const chosen = photos.value.filter((p) => s.reportPhotoIds.includes(p.id));
  const loggedDays = sum.daysLogged || 1;
  const poem = poemTrend(poems.value, end, start);
  const poemChange = poem.points.length > 1 ? poem.points[poem.points.length - 1].score - poem.points[0].score : null;
  const trackedMarks = marks.value.filter((m) => !m.resolved || m.updates.some((u) => u.date >= start));

  return (
    <article class="report" aria-label="Visit report">
      <header class="report__head">
        <div class="report__brand"><Logo size={28} /><span>Patchwork</span></div>
        <div>
          <h1 tabIndex={-1} data-autofocus>Skin journal summary</h1>
          <p>
            {s.nickname && <><strong>{s.nickname}</strong> · </>}
            {formatDate(start, { month: "short", day: "numeric" })} – {formatDate(end, { month: "short", day: "numeric", year: "numeric" })} ({sum.days} days)
            {s.appointment && <> · Appointment {formatDate(s.appointment, { month: "short", day: "numeric" })}</>}
          </p>
        </div>
      </header>

      {s.clinicianToneNote && (
        <p class="report__tone"><strong>Note from the patient:</strong> {TONE_NOTE}</p>
      )}

      <dl class="report__stats">
        <div><dt>Latest POEM</dt><dd>{poem.latest ? `${poem.latest.score} / ${POEM_MAX}` : "—"}</dd></div>
        <div><dt>Days logged</dt><dd>{sum.daysLogged} of {sum.days}</dd></div>
        <div><dt>Average itch</dt><dd>{sum.avgItch !== null ? sum.avgItch.toFixed(1) : "—"} / 10</dd></div>
        <div><dt>Worst itch</dt><dd>{sum.maxItch ?? "—"} / 10</dd></div>
        <div><dt>Flare days (itch 7+)</dt><dd>{sum.flareDays}</dd></div>
        <div><dt>Nights sleep disturbed</dt><dd>{sum.badSleepNights}</dd></div>
      </dl>

      {poem.latest && (
        <section>
          <h2>
            Weekly POEM score <span class="report__note">(Patient-Oriented Eczema Measure, 0–28; no redness items)</span>
          </h2>
          <p>
            Latest {poem.latest.score}/{POEM_MAX}, <strong>{poem.latest.band.label.toLowerCase()}</strong>
            {" "}({formatDate(poem.latest.record.date, { month: "short", day: "numeric" })}).
            {poemChange !== null && <> Over this period: {describeChange(poemChange).toLowerCase()}.</>}
          </p>
          {poem.points.length > 1 && <PoemChart points={poem.points} print />}
        </section>
      )}

      <section>
        <h2>Worst itch each day (0–10)</h2>
        <ItchChart series={sum.series} print />
      </section>

      <div class="report__cols">
        <section>
          <h2>Where</h2>
          {sum.areas.length ? (
            <ul class="report__list">{sum.areas.slice(0, 8).map(([a, n]) => <li>{areaLabel(a)} <span>{n} d</span></li>)}</ul>
          ) : <p>—</p>}
        </section>
        <section>
          <h2>What it looked like</h2>
          {sum.looks.length ? (
            <ul class="report__list">{sum.looks.slice(0, 8).map(([l, n]) => <li>{lookLabel(l)} <span>{n} d</span></li>)}</ul>
          ) : <p>—</p>}
        </section>
      </div>

      <section>
        <h2>Treatments used</h2>
        {sum.treatmentUse.length ? (
          <ul class="report__list">
            {sum.treatmentUse.map(({ treatment: t, daysUsed }) => (
              <li>{t.name} <span>{daysUsed} of {loggedDays} logged days ({Math.round((daysUsed / loggedDays) * 100)}%)</span></li>
            ))}
          </ul>
        ) : <p>None recorded.</p>}
      </section>

      <section>
        <h2>Possible triggers <span class="report__note">(associations in the patient's own log, not proof of cause)</span></h2>
        {patterns.length ? (
          <ul class="report__bullets">{patterns.map((p) => <li><PatternSentence p={p} who="the patient" /></li>)}</ul>
        ) : <p>{sum.daysLogged < 14 ? "Not enough days logged to look for patterns." : "No clear associations found."}</p>}
      </section>

      {trackedMarks.length > 0 && (
        <section>
          <h2>Marks left after flares <span class="report__note">(rated against the patient's own surrounding skin)</span></h2>
          <ul class="report__list">
            {trackedMarks.map((m) => {
              const ms = markSummary(m, end);
              return (
                <li>
                  {m.label || areaLabel(m.area)} ({m.kind === "darker" ? "darker" : "lighter"}, since {formatDate(ms.startDate, { month: "short", year: "numeric" })})
                  <span>{levelLabel(ms.first)} → {levelLabel(ms.latest)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {flaggedProducts.length > 0 && (
        <section>
          <h2>Products the patient checked <span class="report__note">(ingredients often linked to irritation or allergy)</span></h2>
          <ul class="report__list">
            {flaggedProducts.map(({ p, groups }) => <li>{p.name} <span>{groups.join(", ")}</span></li>)}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section>
          <h2>Notes</h2>
          <ul class="report__bullets">
            {notes.map((e) => <li><strong>{formatDate(e.date)}:</strong> {e.note}</li>)}
          </ul>
        </section>
      )}

      {chosen.length > 0 && (
        <section class="report__photos">
          <h2>Photos</h2>
          <div class="report__photo-grid">
            {chosen.map((p) => (
              <figure>
                <PhotoImg photo={p} size="full" />
                <figcaption>{areaLabel(p.area)} · {formatDate(p.date, { month: "short", day: "numeric", year: "numeric" })}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Questions</h2>
        {s.questions.length ? (
          <ol class="report__bullets">{s.questions.map((x) => <li>{x.text}</li>)}</ol>
        ) : <p>—</p>}
      </section>

      <footer class="report__foot">
        Recorded by the patient in Patchwork. This is a self-reported log, not a diagnosis. Itch and sleep are
        patient-rated; "possible triggers" come from a permutation test on the patient's own entries. POEM: Charman,
        Venn &amp; Williams, Arch Dermatol 2004; severity bands from Charman et al., Br J Dermatol 2013.
      </footer>
    </article>
  );
}
