import { useEffect, useRef, useState } from "preact/hooks";
import { notify, photoUrl } from "../state";
import type { PhotoMeta } from "../lib/types";
import { areaLabel } from "../data/body";
import { formatDate } from "../lib/date";
import { processPhoto, type ProcessedPhoto } from "../lib/image";
import { LIGHTING_ADVICE } from "../lib/photoQuality";
import { Icon } from "./Icon";

const TIPS_KEY = "pw-photo-tips-hidden";
function tipsHidden(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === "1";
  } catch {
    return false;
  }
}
function setTipsHidden(v: boolean) {
  try {
    localStorage.setItem(TIPS_KEY, v ? "1" : "0");
  } catch {
    /* private mode: tips just reappear next time */
  }
}

/** The four habits that make photos comparable on any skin tone. */
export function PhotoTips({ compact = false }: { compact?: boolean }) {
  const [hidden, setHidden] = useState(tipsHidden);
  if (compact && hidden) {
    return (
      <button class="link-btn camera__tips-show" onClick={() => { setHidden(false); setTipsHidden(false); }}>
        <Icon name="sun" size={16} /> Show photo tips
      </button>
    );
  }
  return (
    <div class="photo-tips" role="note">
      <div class="row-between">
        <p class="photo-tips__title"><Icon name="sun" size={18} /> Before you shoot</p>
        {compact && (
          <button class="link-btn" onClick={() => { setHidden(true); setTipsHidden(true); }}>Hide</button>
        )}
      </div>
      <ul>
        <li><strong>Daylight, no flash.</strong> Face a window. Flash and lamps wash out texture, and darker skin needs more light to show it.</li>
        <li><strong>Same spot, same distance.</strong> About six inches away, at the same angle as last time.</li>
        <li><strong>Include some normal skin</strong> at the edge, so the patch can be compared with your own skin.</li>
        <li><strong>Tap the skin to focus</strong> before taking the photo, so the camera sets its brightness on the skin, not the background.</li>
      </ul>
    </div>
  );
}

/** After capture: lighting advice plus this photo next to the user's own last photo of the same area. */
function Review({ photo, ghost, onRetake, onUse }: {
  photo: ProcessedPhoto;
  ghost: PhotoMeta | null;
  onRetake: () => void;
  onUse: () => void | Promise<void>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // set synchronously, so a fast double tap can't save the photo twice
  const use = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await onUse();
    } catch {
      notify("Couldn't save the photo. Please try again.", "error");
      busy.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([photo.full], { type: "image/jpeg" }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const issues = photo.lighting?.issues ?? [];
  const sameAsLast = ghost?.light !== undefined && photo.lighting && !issues.includes("unlike-last");
  return (
    <div class="review">
      <div class={`review__pair ${ghost ? "" : "review__pair--single"}`}>
        <figure>
          {src ? <img src={src} alt="The photo you just took" /> : <div class="photo photo--loading" />}
          <figcaption>This photo</figcaption>
        </figure>
        {ghost && (
          <figure>
            <PhotoImg photo={ghost} size="full" />
            <figcaption>Last time · {formatDate(ghost.date)}</figcaption>
          </figure>
        )}
      </div>
      {issues.length > 0 ? (
        <div class="banner banner--warn" role="status">
          <Icon name="sun" size={18} />
          <div>{issues.map((i) => <p>{LIGHTING_ADVICE[i]}</p>)}</div>
        </div>
      ) : photo.lighting ? (
        <p class="review__ok" role="status">
          <Icon name="check" size={16} /> Lighting looks good{sameAsLast ? ", and close to your last photo" : ""}.
        </p>
      ) : null}
      <p class="muted small">
        Patchwork compares your photos with your own earlier photos, never with a "standard" skin color.
      </p>
      <div class="btn-row">
        <button class="btn btn--secondary" onClick={onRetake} disabled={saving}><Icon name="camera" size={18} /> Retake</button>
        <button class="btn btn--primary" onClick={() => void use()} disabled={saving}>
          <Icon name="check" size={18} /> {saving ? "Saving…" : "Use this photo"}
        </button>
      </div>
    </div>
  );
}

/** Decrypts a photo on demand. Nothing is decrypted until it's actually on screen. */
export function PhotoImg({ photo, size = "thumb", class: cls = "", alt }: {
  photo: PhotoMeta;
  size?: "thumb" | "full";
  class?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void photoUrl(photo.id, size).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [photo.id, size]);
  const label = alt ?? `${areaLabel(photo.area)}, ${formatDate(photo.date, { month: "long", day: "numeric", year: "numeric" })}`;
  return src
    ? <img class={`photo ${cls}`} src={src} alt={label} width={photo.width} height={photo.height} decoding="async" />
    : <div class={`photo photo--loading ${cls}`} role="img" aria-label={`${label} (loading)`} />;
}

/** Before/after slider. Drag, or use the range input with a keyboard. */
export function PhotoCompare({ before, after }: { before: PhotoMeta; after: PhotoMeta }) {
  const [pos, setPos] = useState(50);
  return (
    <div class="compare">
      <div class="compare__stage">
        <PhotoImg photo={before} size="full" class="compare__img" />
        <div class="compare__after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <PhotoImg photo={after} size="full" class="compare__img" />
        </div>
        <div class="compare__line" style={{ left: `${pos}%` }} aria-hidden="true" />
        <span class="compare__tag compare__tag--l">{formatDate(before.date)}</span>
        <span class="compare__tag compare__tag--r">{formatDate(after.date)}</span>
      </div>
      <label class="compare__range">
        <span class="sr-only">Slide to compare the two photos</span>
        <input type="range" min={0} max={100} value={pos} onInput={(e) => setPos(Number(e.currentTarget.value))} />
      </label>
    </div>
  );
}

/**
 * Live camera with a faint "ghost" of the last photo of the same area, so the new
 * photo lines up with the old one. Falls back to the system camera/file picker.
 */
export function CameraCapture({ ghost, onCaptured, onCancel }: {
  ghost: PhotoMeta | null;
  onCaptured: (p: ProcessedPhoto) => void | Promise<void>;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"starting" | "live" | "fallback" | "working">("starting");
  const [showGhost, setShowGhost] = useState(true);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [review, setReview] = useState<ProcessedPhoto | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (review) return; // camera stays off while reviewing a shot
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("fallback");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) return;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          setStatus("live");
        }
      } catch {
        if (!cancelled) setStatus("fallback");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, review, attempt]);

  const shoot = async () => {
    if (!video.current) return;
    setStatus("working");
    try {
      setReview(await processPhoto(video.current, ghost?.light));
    } catch {
      notify("Couldn't take the photo. Please try again.", "error");
      setStatus("live");
    }
  };

  const pick = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = ""; // allow choosing the same file again after a retake
    if (!f) return;
    setStatus("working");
    try {
      setReview(await processPhoto(f, ghost?.light));
    } catch {
      notify("That file couldn't be opened as a photo. Try a JPEG or PNG.", "error");
      setStatus("fallback");
    }
  };

  if (review) {
    return (
      <Review
        photo={review}
        ghost={ghost}
        onRetake={() => { setReview(null); setStatus("starting"); setAttempt((n) => n + 1); }}
        onUse={() => onCaptured(review)}
      />
    );
  }

  return (
    <div class="camera">
      <PhotoTips compact />
      <div class="camera__stage">
        <video ref={video} playsInline muted class={status === "live" || status === "working" ? "" : "hidden"} />
        {ghost && showGhost && status === "live" && (
          <div class="camera__ghost" aria-hidden="true"><PhotoImg photo={ghost} size="full" /></div>
        )}
        {status === "starting" && <p class="camera__msg">Starting camera…</p>}
        {status === "working" && <p class="camera__msg">Saving securely…</p>}
        {status === "fallback" && (
          <div class="camera__msg">
            <p>Camera preview isn't available here. You can still take or choose a photo.</p>
          </div>
        )}
      </div>
      <div class="camera__controls">
        <button class="btn btn--ghost" onClick={onCancel}>Cancel</button>
        {status === "live" ? (
          <button class="shutter" aria-label="Take photo" onClick={shoot}><span /></button>
        ) : (
          <button class="btn btn--primary" onClick={() => fileInput.current?.click()} disabled={status === "working"}>
            <Icon name="camera" /> Take or choose photo
          </button>
        )}
        {status === "live" ? (
          <button class="icon-btn" aria-label="Switch camera" onClick={() => setFacing(facing === "environment" ? "user" : "environment")}>
            <Icon name="flip" />
          </button>
        ) : <span class="camera__spacer" />}
      </div>
      {status === "live" && (
        <button class="link-btn camera__library" onClick={() => fileInput.current?.click()}>
          Choose an existing photo instead
        </button>
      )}
      {ghost && status === "live" && (
        <label class="camera__ghost-toggle">
          <input type="checkbox" checked={showGhost} onChange={(e) => setShowGhost(e.currentTarget.checked)} />
          Show outline of last photo ({formatDate(ghost.date)}) to line it up
        </label>
      )}
      {/* No `capture` attribute: with it, phones open the camera only and the photo library can't be chosen. */}
      <input ref={fileInput} type="file" accept="image/*" class="hidden" onChange={pick} />
    </div>
  );
}
