import { useState } from "preact/hooks";
import { addPhoto, deletePhoto, entries, notify, photos, saveEntry, settings, updateSettings } from "../state";
import { formatDate, today } from "../lib/date";
import type { PhotoMeta } from "../lib/types";
import { AREA_LABELS, areaLabel } from "../data/body";
import { back, go, route } from "../router";
import { Icon } from "../components/Icon";
import { Empty, ScreenHeader, Sheet, Toggle } from "../components/ui";
import { CameraCapture, PhotoCompare, PhotoImg, PhotoTips } from "../components/Photo";
import { Marks } from "./Marks";

export function Photos() {
  if (route.value.parts[1] === "new") return <NewPhoto />;
  if (route.value.parts[1] === "marks") return <Marks />;
  return <Gallery />;
}

/** Switch between progress photos and dark-mark tracking. */
export function PhotoTabs({ current }: { current: "photos" | "marks" }) {
  return (
    <div class="segmented segmented--nav" role="tablist" aria-label="Photos sections">
      <button role="tab" aria-selected={current === "photos"} onClick={() => go("/photos", { replace: true })}>Progress photos</button>
      <button role="tab" aria-selected={current === "marks"} onClick={() => go("/photos/marks", { replace: true })}>Dark marks</button>
    </div>
  );
}

function groupByArea(list: PhotoMeta[]): [string, PhotoMeta[]][] {
  const m = new Map<string, PhotoMeta[]>();
  for (const p of list) m.set(p.area, [...(m.get(p.area) ?? []), p]);
  return [...m.entries()].sort((a, b) => b[1][b[1].length - 1].date.localeCompare(a[1][a[1].length - 1].date));
}

function Gallery() {
  const [viewing, setViewing] = useState<PhotoMeta | null>(null);
  const [comparing, setComparing] = useState<PhotoMeta[] | null>(null);
  const groups = groupByArea(photos.value.filter((p) => !p.markId));

  return (
    <>
      <ScreenHeader title="Photos" action={
        <button class="btn btn--primary" onClick={() => go("/photos/new")}><Icon name="camera" size={18} /> New</button>
      } />
      <PhotoTabs current="photos" />
      <button class="tip tip--link" onClick={() => go("/learn/photos")}>
        <Icon name="sun" />
        <p>Daylight, no flash, same distance each time. Each photo is compared with your own earlier photos. <strong>Photo tips</strong></p>
        <Icon name="chevron" size={18} />
      </button>

      {groups.length === 0 ? (
        <Empty icon="camera" title="No photos yet">
          <p class="muted">Progress photos show your doctor what a flare looked like at its worst, even if your skin is calm on appointment day.</p>
          <button class="btn btn--primary" onClick={() => go("/photos/new")}>Take your first photo</button>
        </Empty>
      ) : (
        groups.map(([area, list]) => (
          <section class="photo-group" aria-labelledby={`g-${area}`}>
            <div class="row-between">
              <h2 id={`g-${area}`}>{areaLabel(area)} <span class="muted small">{list.length}</span></h2>
              {list.length > 1 && (
                <button class="btn btn--ghost" onClick={() => setComparing(list)}><Icon name="compare" size={18} /> Compare</button>
              )}
            </div>
            <ul class="photo-strip">
              {list.map((p) => (
                <li>
                  <button class="photo-tile" onClick={() => setViewing(p)} aria-label={`Open photo from ${formatDate(p.date)}`}>
                    <PhotoImg photo={p} class="thumb" />
                    <span>{formatDate(p.date)}</span>
                    {settings.value.reportPhotoIds.includes(p.id) && <span class="photo-tile__flag" title="In visit report"><Icon name="report" size={14} /></span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Viewer photo={viewing} onClose={() => setViewing(null)} />
      <CompareSheet list={comparing} onClose={() => setComparing(null)} />
    </>
  );
}

function Viewer({ photo, onClose }: { photo: PhotoMeta | null; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const s = settings.value;
  if (!photo) return <Sheet open={false} onClose={onClose} title="Photo">{null}</Sheet>;
  const inReport = s.reportPhotoIds.includes(photo.id);
  const toggleReport = (on: boolean) => {
    if (on && s.reportPhotoIds.length >= 4) {
      notify("The report fits 4 photos. Remove one first.", "error");
      return;
    }
    void updateSettings({ reportPhotoIds: on ? [...s.reportPhotoIds, photo.id] : s.reportPhotoIds.filter((x) => x !== photo.id) });
  };
  return (
    <Sheet open onClose={() => { setConfirm(false); onClose(); }} title={`${areaLabel(photo.area)} · ${formatDate(photo.date, { month: "long", day: "numeric", year: "numeric" })}`}>
      <PhotoImg photo={photo} size="full" class="viewer-img" />
      <Toggle label="Include in visit report" description="Up to 4 photos" checked={inReport} onChange={toggleReport} />
      {confirm ? (
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => setConfirm(false)}>Keep</button>
          <button class="btn btn--danger" onClick={async () => {
            await deletePhoto(photo.id);
            // also detach it from the check-in that referenced it
            const e = entries.value.find((x) => x.photoIds.includes(photo.id));
            if (e) await saveEntry({ ...e, photoIds: e.photoIds.filter((x) => x !== photo.id) });
            setConfirm(false);
            onClose();
            notify("Photo deleted.");
          }}>Delete permanently</button>
        </div>
      ) : (
        <button class="link-btn link-btn--danger" onClick={() => setConfirm(true)}><Icon name="trash" size={16} /> Delete photo</button>
      )}
    </Sheet>
  );
}

function CompareSheet({ list, onClose }: { list: PhotoMeta[] | null; onClose: () => void }) {
  const [a, setA] = useState(0);
  const [b, setB] = useState<number | null>(null);
  if (!list) return <Sheet open={false} onClose={onClose} title="Compare">{null}</Sheet>;
  const bi = b ?? list.length - 1;
  const pick = (id: string, value: number, set: (n: number) => void, label: string) => (
    <div class="field">
      <label for={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => set(Number(e.currentTarget.value))}>
        {list.map((p, i) => <option value={i}>{formatDate(p.date, { month: "short", day: "numeric", year: "numeric" })}</option>)}
      </select>
    </div>
  );
  return (
    <Sheet open onClose={() => { setA(0); setB(null); onClose(); }} title={`Compare: ${areaLabel(list[0].area)}`}>
      <PhotoCompare before={list[a]} after={list[bi]} />
      <div class="two-col">
        {pick("cmp-a", a, setA, "Left")}
        {pick("cmp-b", bi, setB, "Right")}
      </div>
    </Sheet>
  );
}

function NewPhoto() {
  const [area, setArea] = useState(route.value.query.get("area") ?? "");
  const [shooting, setShooting] = useState(false);
  const recentAreas = [...new Set([...entries.value].reverse().flatMap((e) => e.areas))].slice(0, 6);
  const ghost = [...photos.value].reverse().find((p) => p.area === area && !p.markId) ?? null;

  if (shooting && area) {
    return (
      <>
        <ScreenHeader title={areaLabel(area)} sub={ghost ? "Line up with the faint outline of your last photo." : "Hold the camera about six inches away."} onBack={() => setShooting(false)} />
        <CameraCapture
          ghost={ghost}
          onCancel={() => setShooting(false)}
          onCaptured={async (p) => {
            const meta = await addPhoto({ date: today(), area, width: p.width, height: p.height, light: p.lighting?.mean }, p.full, p.thumb);
            const e = entries.value.find((x) => x.date === today());
            if (e) await saveEntry({ ...e, photoIds: [...e.photoIds, meta.id] });
            notify("Photo saved and encrypted.");
            go("/photos", { replace: true });
          }}
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="New photo" onBack={() => back("/photos")} />
      <p class="muted">Which area are you photographing?</p>
      {recentAreas.length > 0 && (
        <>
          <h2 class="q">Recently logged</h2>
          <div class="chips">
            {recentAreas.map((a) => (
              <button class="chip" aria-pressed={area === a} onClick={() => setArea(a)}>{areaLabel(a)}</button>
            ))}
          </div>
        </>
      )}
      <div class="field">
        <label for="area-all">All areas</label>
        <select id="area-all" value={area} onChange={(e) => setArea(e.currentTarget.value)}>
          <option value="" disabled>Choose…</option>
          {Object.entries(AREA_LABELS).sort((x, y) => x[1].localeCompare(y[1])).map(([id, label]) => <option value={id}>{label}</option>)}
        </select>
      </div>
      <PhotoTips />
      <button class="btn btn--primary btn--block" disabled={!area} onClick={() => setShooting(true)}>
        <Icon name="camera" /> Open camera
      </button>
      <p class="muted small">Photos stay on this device, encrypted, with location data removed.</p>
    </>
  );
}
