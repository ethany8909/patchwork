// Dark marks: the darker (or lighter) patches that can stay for months after a flare
// heals, most often on brown and Black skin. Each mark is rated against the user's own
// surrounding skin, with an optional photo, and the trend shows whether it is fading.

import { useState } from "preact/hooks";
import { addPhoto, deleteMark, deletePhoto, marks, notify, photos, saveMark } from "../state";
import { formatDate, today, uid } from "../lib/date";
import type { DarkMark, MarkKind, PhotoMeta } from "../lib/types";
import { levelLabel, MARK_LEVELS, markSummary } from "../lib/marks";
import { AREA_LABELS, areaLabel } from "../data/body";
import { back, go, route } from "../router";
import { Icon } from "../components/Icon";
import { Card, Empty, ScreenHeader, Segmented, Sheet } from "../components/ui";
import { CameraCapture, PhotoCompare, PhotoImg } from "../components/Photo";
import { PhotoTabs } from "./Photos";

export function Marks() {
  const sub = route.value.parts[2];
  if (sub === "new") return <NewMark />;
  const mark = marks.value.find((m) => m.id === sub);
  if (sub && mark) return <MarkDetail mark={mark} />;
  return <MarkList />;
}

const KIND_LABEL: Record<MarkKind, string> = { darker: "Darker mark", lighter: "Lighter mark" };

function MarkList() {
  const t = today();
  const active = marks.value.filter((m) => !m.resolved);
  const done = marks.value.filter((m) => m.resolved);
  return (
    <>
      <ScreenHeader title="Photos" action={
        <button class="btn btn--primary" onClick={() => go("/photos/marks/new")}><Icon name="plus" size={18} /> Add mark</button>
      } />
      <PhotoTabs current="marks" />
      <button class="tip tip--link" onClick={() => go("/learn/dark-marks")}>
        <Icon name="info" />
        <p>Marks left after a flare are common on brown and Black skin and can take months to fade. <strong>Learn more</strong></p>
        <Icon name="chevron" size={18} />
      </button>

      {marks.value.length === 0 ? (
        <Empty icon="spot" title="No marks tracked">
          <p class="muted">
            When a flare heals, it can leave a darker or lighter patch. Track it here to see it fade, and to show your
            dermatologist how long it has lasted.
          </p>
          <button class="btn btn--primary" onClick={() => go("/photos/marks/new")}>Track a mark</button>
        </Empty>
      ) : (
        <>
          <ul class="mark-list">
            {active.map((m) => <MarkRow mark={m} on={t} />)}
          </ul>
          {done.length > 0 && (
            <>
              <h2 class="q">Faded or no longer tracking</h2>
              <ul class="mark-list">{done.map((m) => <MarkRow mark={m} on={t} />)}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}

function MarkRow({ mark, on }: { mark: DarkMark; on: string }) {
  const s = markSummary(mark, on);
  const latestPhoto = lastPhotoOf(mark);
  return (
    <li>
      <button class="mark-row" onClick={() => go(`/photos/marks/${mark.id}`)}>
        {latestPhoto ? <PhotoImg photo={latestPhoto} class="thumb" /> : <span class="mark-row__icon"><Icon name="spot" /></span>}
        <span class="mark-row__text">
          <strong>{mark.label || areaLabel(mark.area)}</strong>
          <span class="muted small">{KIND_LABEL[mark.kind]} · {areaLabel(mark.area)} · since {formatDate(s.startDate)}</span>
          <LevelTrack mark={mark} />
          <span class="small">{s.text}</span>
        </span>
        {s.updateDue && <span class="badge">Update due</span>}
        <Icon name="chevron" size={18} />
      </button>
    </li>
  );
}

/** Dots for each rating, oldest to newest, with the level written out (never color alone). */
function LevelTrack({ mark }: { mark: DarkMark }) {
  const ups = [...mark.updates].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <span class="level-track" aria-label={`Ratings over time: ${ups.map((u) => `${formatDate(u.date)} ${levelLabel(u.level)}`).join(", ")}`}>
      {ups.map((u) => <span class={`level-dot level-${u.level}`} title={`${formatDate(u.date)}: ${levelLabel(u.level)}`}>{u.level}</span>)}
    </span>
  );
}

function lastPhotoOf(mark: DarkMark): PhotoMeta | null {
  const ids = [...mark.updates].sort((a, b) => b.date.localeCompare(a.date)).map((u) => u.photoId).filter(Boolean);
  return photos.value.find((p) => p.id === ids[0]) ?? null;
}

function LevelPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div class="radio-cards radio-cards--stack" role="radiogroup" aria-label="How noticeable is it compared with the skin around it?">
      {MARK_LEVELS.map((l) => (
        <button type="button" role="radio" aria-checked={value === l.value} onClick={() => onChange(l.value)}>
          <span class={`level-dot level-${l.value}`} aria-hidden="true">{l.value}</span>
          <span><strong>{l.label}</strong><span class="muted small"> · {l.hint}</span></span>
        </button>
      ))}
    </div>
  );
}

function NewMark() {
  const [area, setArea] = useState("");
  const [kind, setKind] = useState<MarkKind>("darker");
  const [label, setLabel] = useState("");
  const [level, setLevel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!area || level === null) return;
    setSaving(true);
    const now = Date.now();
    const m = await saveMark({
      id: uid(), area, kind, label: label.trim().slice(0, 40), resolved: false,
      updates: [{ date: today(), level, photoId: null }], createdAt: now, updatedAt: now,
    });
    notify("Mark saved. Add a photo so you can see it fade.");
    go(`/photos/marks/${m.id}`, { replace: true });
  };

  return (
    <>
      <ScreenHeader title="Track a mark" onBack={() => back("/photos/marks")} />
      <div class="field">
        <label for="mark-area">Where is it?</label>
        <select id="mark-area" value={area} onChange={(e) => setArea(e.currentTarget.value)}>
          <option value="" disabled>Choose an area</option>
          {Object.entries(AREA_LABELS).sort((x, y) => x[1].localeCompare(y[1])).map(([id, l]) => <option value={id}>{l}</option>)}
        </select>
      </div>
      <h2 class="q">Compared with the skin around it, the mark is…</h2>
      <Segmented label="Darker or lighter" value={kind} onChange={setKind}
        options={[{ value: "darker", label: "Darker" }, { value: "lighter", label: "Lighter" }]} />
      <h2 class="q">How noticeable is it right now?</h2>
      <LevelPicker value={level} onChange={setLevel} />
      <div class="field">
        <label for="mark-label">Nickname <span class="muted">(optional)</span></label>
        <input id="mark-label" maxLength={40} placeholder="e.g. Left elbow spot" value={label} onInput={(e) => setLabel(e.currentTarget.value)} />
      </div>
      <button class="btn btn--primary btn--block" disabled={!area || level === null || saving} onClick={save}>
        <Icon name="check" /> Save mark
      </button>
    </>
  );
}

function MarkDetail({ mark }: { mark: DarkMark }) {
  const [updating, setUpdating] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const s = markSummary(mark, today());
  const ups = [...mark.updates].sort((a, b) => a.date.localeCompare(b.date));
  const withPhotos = ups.map((u) => photos.value.find((p) => p.id === u.photoId)).filter((p): p is PhotoMeta => !!p);

  return (
    <>
      <ScreenHeader title={mark.label || areaLabel(mark.area)} sub={`${KIND_LABEL[mark.kind]} · ${areaLabel(mark.area)}`} onBack={() => back("/photos/marks")} />

      <Card title="How it's changing" icon="chart">
        <dl class="stats">
          <div><dt>When you started</dt><dd>{levelLabel(s.first)}</dd></div>
          <div><dt>Latest ({formatDate(s.latestDate)})</dt><dd>{levelLabel(s.latest)}</dd></div>
        </dl>
        <LevelTrack mark={mark} />
        <p>{s.text}</p>
        {!mark.resolved && (
          <button class="btn btn--primary btn--block" onClick={() => setUpdating(true)}>
            <Icon name="camera" /> {s.updateDue ? "Update due: rate it again" : "Rate it again"}
          </button>
        )}
      </Card>

      {withPhotos.length >= 2 && (
        <Card title="First vs latest photo" icon="compare">
          <PhotoCompare before={withPhotos[0]} after={withPhotos[withPhotos.length - 1]} />
        </Card>
      )}

      <Card title="History" icon="calendar">
        <ol class="mark-history">
          {[...ups].reverse().map((u) => {
            const p = photos.value.find((x) => x.id === u.photoId);
            return (
              <li>
                {p ? <PhotoImg photo={p} class="thumb" /> : <span class={`level-dot level-${u.level}`} aria-hidden="true">{u.level}</span>}
                <span><strong>{formatDate(u.date, { month: "long", day: "numeric", year: "numeric" })}</strong><br />{levelLabel(u.level)}</span>
              </li>
            );
          })}
        </ol>
      </Card>

      <div class="btn-row">
        <button class="btn btn--secondary" onClick={async () => {
          await saveMark({ ...mark, resolved: !mark.resolved });
          notify(mark.resolved ? "Tracking again." : "Marked as faded. Nice.");
        }}>
          {mark.resolved ? "Start tracking again" : "It's faded: stop tracking"}
        </button>
        <button class="link-btn link-btn--danger" onClick={() => setConfirm(true)}><Icon name="trash" size={16} /> Delete</button>
      </div>

      <UpdateSheet mark={mark} open={updating} onClose={() => setUpdating(false)} />
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete this mark?">
        <p>This deletes the mark, its ratings and its photos.</p>
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => setConfirm(false)}>Cancel</button>
          <button class="btn btn--danger" onClick={async () => { await deleteMark(mark.id); notify("Mark deleted."); go("/photos/marks", { replace: true }); }}>Delete</button>
        </div>
      </Sheet>
    </>
  );
}

function UpdateSheet({ mark, open, onClose }: { mark: DarkMark; open: boolean; onClose: () => void }) {
  const [level, setLevel] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const ghost = lastPhotoOf(mark);
  const reset = () => { setLevel(null); setPhotoId(null); setCamera(false); onClose(); };
  // Closing without saving discards a photo taken here; nothing else would ever show it.
  const close = () => {
    if (photoId) void deletePhoto(photoId);
    reset();
  };

  const save = async () => {
    if (level === null) return;
    const date = today();
    const replaced = mark.updates.find((u) => u.date === date)?.photoId;
    const updates = [...mark.updates.filter((u) => u.date !== date), { date, level, photoId: photoId ?? replaced ?? null }];
    await saveMark({ ...mark, updates, resolved: level === 0 ? mark.resolved : false });
    if (photoId && replaced && replaced !== photoId) await deletePhoto(replaced); // today's earlier photo
    notify(level === 0 ? "Saved. It has faded to match your skin." : "Rating saved.");
    reset();
  };

  return (
    <Sheet open={open} onClose={close} title={camera ? `Photo: ${areaLabel(mark.area)}` : "Rate this mark"}>
      {camera ? (
        <CameraCapture
          ghost={ghost}
          onCancel={() => setCamera(false)}
          onCaptured={async (p) => {
            const meta = await addPhoto({ date: today(), area: mark.area, width: p.width, height: p.height, light: p.lighting?.mean, markId: mark.id }, p.full, p.thumb);
            setPhotoId(meta.id);
            setCamera(false);
            notify("Photo saved and encrypted.");
          }}
        />
      ) : (
        <>
          <p class="muted small">
            Compare it with the skin right around it, not with how it looked last time.
            {mark.updates.some((u) => u.date === today()) && " This replaces the rating you already saved today."}
          </p>
          <LevelPicker value={level} onChange={setLevel} />
          {photoId ? (
            <p class="review__ok"><Icon name="check" size={16} /> Photo added.</p>
          ) : (
            <button class="btn btn--secondary btn--block" onClick={() => setCamera(true)}>
              <Icon name="camera" /> Add a photo {ghost ? "(lined up with your last one)" : ""}
            </button>
          )}
          <button class="btn btn--primary btn--block" disabled={level === null} onClick={save}>Save rating</button>
        </>
      )}
    </Sheet>
  );
}
