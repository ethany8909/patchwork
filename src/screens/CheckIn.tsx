import { useMemo, useState } from "preact/hooks";
import { addPhoto, blankEntry, deleteEntry, entries, notify, photos, saveEntry, settings, treatments, updateSettings } from "../state";
import { formatLong, today } from "../lib/date";
import type { Entry } from "../lib/types";
import { CHANGES, FEELS, LOOKS, SLEEP_OPTIONS, TRIGGERS, WARNINGS, type Option } from "../data/options";
import { areaLabel } from "../data/body";
import { back, go, route } from "../router";
import { Icon } from "../components/Icon";
import { BodyMap } from "../components/BodyMap";
import { Chips, ItchScale, Sheet, toggleIn, useStepStart } from "../components/ui";
import { CameraCapture, PhotoImg } from "../components/Photo";

const STEPS = ["Itch & sleep", "Where", "How it looks & feels", "What was different", "Photo & note"];

export function CheckIn() {
  const date = route.value.parts[1] ?? today();
  const existing = useMemo(() => entries.value.find((e) => e.date === date) ?? null, [date]);
  const [draft, setDraft] = useState<Entry>(() => existing ?? blankEntry(date));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(existing ?? blankEntry(date)) && (draft.itch !== null || draft.areas.length > 0 || draft.note !== "");

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const flip = (k: ListKey, id: string) => setDraft((d) => ({ ...d, [k]: toggleIn(d[k], id) }));
  const last = step === STEPS.length - 1;
  useStepStart(step);

  const save = async () => {
    setSaving(true);
    try {
      await saveEntry(draft);
      notify(existing ? "Check-in updated." : "Saved. Nice work.");
      go(date === today() ? "/today" : "/timeline", { replace: true });
    } catch {
      notify("Couldn't save. Please try again.", "error");
      setSaving(false);
    }
  };

  const close = () => (dirty ? setConfirmClose(true) : back());

  return (
    <div class="flow">
      <header class="flow__head">
        <button class="icon-btn" aria-label="Close check-in" onClick={close}><Icon name="close" /></button>
        <div class="flow__title">
          <p class="muted small">{date === today() ? "Today" : formatLong(date)}</p>
          <h1 tabIndex={-1} data-autofocus>{STEPS[step]}</h1>
        </div>
        <span class="flow__count" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{step + 1}/{STEPS.length}</span>
      </header>
      <div class="flow__bar" aria-hidden="true"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

      <div class="flow__body">
        {step === 0 && (
          <>
            <h2 class="q">Worst itch in the last 24 hours</h2>
            <ItchScale value={draft.itch} onChange={(v) => set("itch", v)} />
            <h2 class="q">How did itch affect last night's sleep?</h2>
            <div class="radio-cards" role="radiogroup" aria-label="Sleep">
              {SLEEP_OPTIONS.map((o) => (
                <button type="button" role="radio" aria-checked={draft.sleep === o.value} onClick={() => set("sleep", o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && <BodyMap selected={draft.areas} onToggle={(id) => flip("areas", id)} />}

        {step === 2 && (
          <>
            <h2 class="q">How does the skin feel?</h2>
            <p class="muted small">Pick everything that fits. Tap <Icon name="info" size={14} /> for a description.</p>
            <Chips label="How the skin feels" options={FEELS} selected={draft.looks} onToggle={(id) => flip("looks", id)} />
            <h2 class="q">Compared with your own normal skin nearby, it looks…</h2>
            <p class="muted small">
              Look at skin close to the patch that isn't affected. Eczema doesn't always look red, especially on
              brown and Black skin. <button class="link-btn inline" onClick={() => go("/learn/skin-tones")}>How it can look</button>
            </p>
            <Chips label="Color compared with your normal skin" options={CHANGES} selected={draft.looks} onToggle={(id) => flip("looks", id)} />
            <h2 class="q">Any of these?</h2>
            <Chips label="Warning signs" options={WARNINGS} selected={draft.looks} onToggle={(id) => flip("looks", id)} />
            {draft.looks.some((l) => LOOKS.find((o) => o.id === l)?.warn) && (
              <div class="banner banner--warn" role="alert">
                <Icon name="alert" size={18} />
                <span>
                  Crusts, pus, blisters, or skin that's painful, swollen or hot can be signs of infection.{" "}
                  <button class="link-btn inline" onClick={() => go("/learn/urgent")}>When to get care now</button>
                </span>
              </div>
            )}
          </>
        )}

        {step === 3 && <Differences draft={draft} flip={flip} />}

        {step === 4 && <PhotoAndNote draft={draft} set={set} />}
      </div>

      <footer class="flow__foot">
        {step > 0 ? (
          <button class="btn btn--ghost" onClick={() => setStep(step - 1)}><Icon name="back" size={18} /> Back</button>
        ) : <span />}
        {last ? (
          <button class="btn btn--primary" onClick={save} disabled={saving || draft.itch === null}>
            <Icon name="check" size={18} /> Save check-in
          </button>
        ) : (
          <div class="flow__next">
            {draft.itch !== null && step > 0 && (
              <button class="btn btn--ghost" onClick={save} disabled={saving}>Save now</button>
            )}
            <button class="btn btn--primary" onClick={() => setStep(step + 1)}>
              {step === 0 && draft.itch === null ? "Skip" : "Next"} <Icon name="chevron" size={18} />
            </button>
          </div>
        )}
      </footer>
      {last && draft.itch === null && <p class="muted small center">Add a worst-itch score on step 1 to save.</p>}
      {existing && last && (
        <button class="link-btn link-btn--danger center" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={16} /> Delete this check-in
        </button>
      )}

      <Sheet open={confirmClose} onClose={() => setConfirmClose(false)} title="Leave without saving?">
        <p>Your answers for this check-in will be lost.</p>
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => setConfirmClose(false)}>Keep going</button>
          <button class="btn btn--danger" onClick={() => { setConfirmClose(false); back(); }}>Discard</button>
        </div>
      </Sheet>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this check-in?">
        <p>This removes the check-in for {formatLong(date)}. Photos you took stay in your photo library.</p>
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button class="btn btn--danger" onClick={async () => { await deleteEntry(draft.id); notify("Check-in deleted."); go("/timeline", { replace: true }); }}>Delete</button>
        </div>
      </Sheet>
    </div>
  );
}

type Setter = <K extends keyof Entry>(k: K, v: Entry[K]) => void;
type ListKey = "areas" | "looks" | "triggers" | "treatments";
type Flipper = (k: ListKey, id: string) => void;

function Differences({ draft, flip }: { draft: Entry; flip: Flipper }) {
  const [custom, setCustom] = useState("");
  const s = settings.value;
  const options: Option[] = [...TRIGGERS, ...s.customTriggers.map((t) => ({ id: t, label: t }))];
  const active = treatments.value.filter((t) => t.active || draft.treatments.includes(t.id));

  const addCustom = async (e: Event) => {
    e.preventDefault();
    const t = custom.trim().slice(0, 40);
    if (!t) return;
    if (!s.customTriggers.includes(t) && !TRIGGERS.some((o) => o.label.toLowerCase() === t.toLowerCase())) {
      await updateSettings({ customTriggers: [...s.customTriggers, t] });
    }
    if (!draft.triggers.includes(t)) flip("triggers", t);
    setCustom("");
  };

  return (
    <>
      <h2 class="q">Anything that might have made it worse?</h2>
      <p class="muted small">Over time, Patchwork checks which of these line up with worse days.</p>
      <Chips label="Possible triggers" options={options} selected={draft.triggers} onToggle={(id) => flip("triggers", id)} />
      <form class="inline-add" onSubmit={addCustom}>
        <label class="sr-only" for="custom-trigger">Add your own trigger</label>
        <input id="custom-trigger" placeholder="Add your own…" value={custom} maxLength={40} onInput={(e) => setCustom(e.currentTarget.value)} />
        <button class="btn btn--secondary" type="submit" disabled={!custom.trim()}>Add</button>
      </form>

      <h2 class="q">What did you use today?</h2>
      {active.length ? (
        <ul class="checklist">
          {active.map((t) => (
            <li>
              <label class="check-row">
                <input
                  type="checkbox"
                  checked={draft.treatments.includes(t.id)}
                  onChange={() => flip("treatments", t.id)}
                />
                <span>{t.name}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted small">No treatments added yet. <button class="link-btn inline" onClick={() => go("/settings/treatments")}>Add your treatments</button> to track what you use.</p>
      )}
    </>
  );
}

function PhotoAndNote({ draft, set }: { draft: Entry; set: Setter }) {
  const [camera, setCamera] = useState(false);
  const [area, setArea] = useState<string>(draft.areas[0] ?? "");
  const attached = photos.value.filter((p) => draft.photoIds.includes(p.id));
  const ghost = [...photos.value].reverse().find((p) => p.area === area && !p.markId) ?? null;

  return (
    <>
      <h2 class="q">Progress photo <span class="muted">(optional)</span></h2>
      {attached.length > 0 && (
        <div class="thumb-row">
          {attached.map((p) => <PhotoImg photo={p} class="thumb" />)}
        </div>
      )}
      <div class="field">
        <label for="photo-area">Which area?</label>
        <select id="photo-area" value={area} onChange={(e) => setArea(e.currentTarget.value)}>
          <option value="" disabled>Choose an area</option>
          {(draft.areas.length ? draft.areas : ["hands", "inner-elbows", "behind-knees", "face", "scalp", "neck", "outer-elbows", "knees"]).map((a) => (
            <option value={a}>{areaLabel(a)}</option>
          ))}
        </select>
      </div>
      <button class="btn btn--secondary btn--block" disabled={!area} onClick={() => setCamera(true)}>
        <Icon name="camera" /> {attached.length ? "Add another photo" : "Take a photo"}
      </button>
      <p class="muted small">Photos are encrypted on this device and stripped of location data.</p>

      <h2 class="q"><label for="note">Note <span class="muted">(optional)</span></label></h2>
      <textarea id="note" rows={3} maxLength={1000} placeholder="Anything else? New job, sports tournament, a food you tried…"
        value={draft.note} onInput={(e) => set("note", e.currentTarget.value)} />

      <Sheet open={camera} onClose={() => setCamera(false)} title={`Photo: ${areaLabel(area)}`}>
        {camera && (
          <CameraCapture
            ghost={ghost}
            onCancel={() => setCamera(false)}
            onCaptured={async (p) => {
              const meta = await addPhoto({ date: draft.date, area, width: p.width, height: p.height, light: p.lighting?.mean }, p.full, p.thumb);
              set("photoIds", [...draft.photoIds, meta.id]);
              setCamera(false);
              notify("Photo saved and encrypted.");
            }}
          />
        )}
      </Sheet>
    </>
  );
}
