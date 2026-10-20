import { useEffect, useState } from "preact/hooks";
import {
  changePasscode, deleteTreatment, eraseEverything, hasDemoData, importBackup, loadSampleData, lock, notify,
  removeSampleData, saveTreatment, settings, treatments, updateSettings,
} from "../state";
import { exportBackup } from "../lib/repo";
import { passcodeProblem, WrongPasscodeError } from "../lib/crypto";
import { newRecoveryCodes, hashRecoveryCode, newSecret, otpauthUri, verifyTotp } from "../lib/totp";
import { currentMode, requestPermission, sendTest, syncReminders, type ReminderMode } from "../lib/notify";
import { formatTime, today, uid } from "../lib/date";
import { isAppleMobile } from "../lib/device";
import type { Treatment, TreatmentKind } from "../lib/types";
import { TREATMENT_KINDS } from "../data/options";
import { APP_VERSION, FEEDBACK_EMAIL, mailtoLink, sendFeedback, type Feedback as FeedbackT } from "../lib/feedback";
import { back, go, route } from "../router";
import { Icon, type IconName } from "../components/Icon";
import { Card, PasswordField, ScreenHeader, Segmented, Sheet, Spinner, Toggle } from "../components/ui";
import { QRCode } from "../components/QRCode";

export function Settings() {
  switch (route.value.parts[1]) {
    case "reminders": return <Reminders />;
    case "treatments": return <Treatments />;
    case "security": return <Security />;
    case "2fa": return <TwoFactorSetup />;
    case "data": return <DataScreen />;
    case "feedback": return <FeedbackScreen />;
    case "about": return <About />;
    default: return <Index />;
  }
}

function Row({ icon, label, detail, path }: { icon: IconName; label: string; detail?: string; path: string }) {
  return (
    <li>
      <button class="settings-row" onClick={() => go(path)}>
        <Icon name={icon} />
        <span class="settings-row__text">
          <span>{label}</span>
          {detail && <span class="muted small">{detail}</span>}
        </span>
        <Icon name="chevron" size={18} />
      </button>
    </li>
  );
}

function Index() {
  const s = settings.value;
  return (
    <>
      <ScreenHeader title="Settings" onBack={() => back("/today")} />
      <ul class="settings-list">
        <Row icon="bell" label="Reminders" detail={s.reminder.enabled ? `Daily at ${formatTime(s.reminder.time)}` : "Off"} path="/settings/reminders" />
        <Row icon="pill" label="My treatments" detail={`${treatments.value.filter((t) => t.active).length} active`} path="/settings/treatments" />
        <Row icon="sun" label="Skin weather" detail={s.weatherPlace ? s.weatherPlace.name : "Off"} path="/weather" />
        <Row icon="bottle" label="Product check" detail="Your checked products" path="/products" />
        <Row icon="shield" label="Security" detail={s.twoFactor ? "Two-step verification on" : "Passcode only"} path="/settings/security" />
        <Row icon="download" label="Backup & data" detail="Encrypted backup, sample data, delete" path="/settings/data" />
        <Row icon="message" label="Report a bug or share an idea" path="/settings/feedback" />
        <Row icon="info" label="About Patchwork" detail={`Version ${APP_VERSION}`} path="/settings/about" />
      </ul>
      <div class="field">
        <label for="nick">Your first name or nickname <span class="muted">(optional, shown on your report)</span></label>
        <input id="nick" value={s.nickname} maxLength={40} autoComplete="given-name"
          onChange={(e) => void updateSettings({ nickname: e.currentTarget.value.trim() })} />
      </div>
      <button class="btn btn--secondary btn--block" onClick={lock}><Icon name="lock" /> Lock now</button>
    </>
  );
}

// ---------- reminders ----------

const MODE_TEXT: Record<ReminderMode, string> = {
  push: "Reminders arrive as notifications, even when Patchwork is closed.",
  "in-app": "Reminders appear while Patchwork is open. Install the app and allow notifications for reminders when it's closed.",
  blocked: "Notifications are blocked for Patchwork in your browser or phone settings. Reminders will only appear inside the app.",
  unsupported: "This browser can't show notifications. Reminders will appear inside the app. On iPhone, add Patchwork to your Home Screen first.",
  off: "No reminders are scheduled.",
};

function Reminders() {
  const s = settings.value;
  const [mode, setMode] = useState<ReminderMode | null>(null);
  const refresh = () => void currentMode(settings.value, treatments.value).then(setMode);
  useEffect(refresh, [s.reminder.enabled, s.reminder.time]);

  const setEnabled = async (on: boolean) => {
    if (on) await requestPermission();
    await updateSettings({ reminder: { ...s.reminder, enabled: on } });
    setMode(await syncReminders(settings.value, treatments.value));
  };

  return (
    <>
      <ScreenHeader title="Reminders" onBack={() => back("/settings")} />
      <Card>
        <Toggle label="Daily check-in reminder" checked={s.reminder.enabled} onChange={(v) => void setEnabled(v)} />
        {s.reminder.enabled && (
          <div class="field">
            <label for="rt">Time</label>
            <input id="rt" type="time" value={s.reminder.time}
              onChange={(e) => void updateSettings({ reminder: { ...s.reminder, time: e.currentTarget.value || "20:00" } }).then(refresh)} />
          </div>
        )}
        {mode && <p class="muted small" role="status">{MODE_TEXT[mode]}</p>}
      </Card>
      <Card title="Treatment reminders" icon="pill">
        <p class="muted small">Turn on reminders for each treatment in <button class="link-btn inline" onClick={() => go("/settings/treatments")}>My treatments</button>.</p>
      </Card>
      <Card title="Privacy" icon="lock">
        <p class="small">Every reminder says only "Time for a quick check-in" or "Treatment reminder." Nothing about your skin or your medicines is ever shown on your lock screen or sent to our server. The server only knows what times to send a reminder.</p>
      </Card>
      <button class="btn btn--secondary btn--block" onClick={async () => {
        const r = await sendTest();
        notify(r === "failed" ? "Notifications aren't allowed yet. Check your browser or phone settings." : "Test notification sent.", r === "failed" ? "error" : "ok");
        refresh();
      }}>
        <Icon name="bell" /> Send a test notification
      </button>
    </>
  );
}

// ---------- treatments ----------

function Treatments() {
  const [editing, setEditing] = useState<Treatment | null>(null);
  const list = treatments.value;
  return (
    <>
      <ScreenHeader title="My treatments" onBack={() => back("/settings")} action={
        <button class="btn btn--primary" onClick={() => setEditing({ id: uid(), name: "", kind: "moisturizer", times: [], remind: false, active: true, createdAt: Date.now() })}>
          <Icon name="plus" size={18} /> Add
        </button>
      } />
      <p class="muted small">Add what your clinician prescribed or what you use. Patchwork tracks how often you use each one; it never suggests treatments.</p>
      {list.length === 0 ? (
        <p class="muted">No treatments yet.</p>
      ) : (
        <ul class="settings-list">
          {list.map((t) => (
            <li>
              <button class="settings-row" onClick={() => setEditing(t)}>
                <Icon name="pill" />
                <span class="settings-row__text">
                  <span>{t.name}{!t.active && <span class="muted"> (paused)</span>}</span>
                  <span class="muted small">
                    {TREATMENT_KINDS.find((k) => k.id === t.kind)?.label}
                    {t.times.length ? ` · ${t.times.map(formatTime).join(", ")}` : " · as needed"}
                    {t.remind ? " · reminders on" : ""}
                  </span>
                </span>
                <Icon name="edit" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <TreatmentEditor t={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TreatmentEditor({ t, onClose }: { t: Treatment; onClose: () => void }) {
  const [d, setD] = useState<Treatment>(t);
  const isNew = !treatments.value.some((x) => x.id === t.id);
  const save = async () => {
    if (d.remind && d.times.length) await requestPermission();
    await saveTreatment({ ...d, name: d.name.trim(), times: [...new Set(d.times)].sort() });
    notify(isNew ? "Treatment added." : "Treatment saved.");
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={isNew ? "Add treatment" : "Edit treatment"}>
      <div class="field">
        <label for="tname">Name</label>
        <input id="tname" value={d.name} maxLength={60} placeholder="e.g. Moisturizer, the cream from Dr. Lee" autoFocus
          onInput={(e) => setD({ ...d, name: e.currentTarget.value })} />
      </div>
      <div class="field">
        <label for="tkind">Type</label>
        <select id="tkind" value={d.kind} onChange={(e) => setD({ ...d, kind: e.currentTarget.value as TreatmentKind })}>
          {TREATMENT_KINDS.map((k) => <option value={k.id}>{k.label}</option>)}
        </select>
      </div>
      <fieldset class="field">
        <legend>When do you use it?</legend>
        {d.times.map((time, i) => (
          <div class="field__with-btn">
            <input type="time" aria-label={`Time ${i + 1}`} value={time}
              onChange={(e) => setD({ ...d, times: d.times.map((x, j) => (j === i ? e.currentTarget.value : x)) })} />
            <button class="field__btn" onClick={() => setD({ ...d, times: d.times.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button class="link-btn" onClick={() => setD({ ...d, times: [...d.times, d.times.length ? "21:00" : "08:00"] })}>
          <Icon name="plus" size={16} /> Add a time
        </button>
        {d.times.length === 0 && <p class="muted small">No set times means "as needed".</p>}
      </fieldset>
      {d.times.length > 0 && <Toggle label="Remind me at these times" checked={d.remind} onChange={(v) => setD({ ...d, remind: v })} />}
      <Toggle label="Currently using" description="Pause instead of deleting to keep its history in reports." checked={d.active} onChange={(v) => setD({ ...d, active: v })} />
      <button class="btn btn--primary btn--block" disabled={!d.name.trim()} onClick={save}>Save</button>
      {!isNew && (
        <button class="link-btn link-btn--danger" onClick={async () => { await deleteTreatment(t.id); notify("Treatment deleted."); onClose(); }}>
          <Icon name="trash" size={16} /> Delete
        </button>
      )}
    </Sheet>
  );
}

// ---------- security ----------

function Security() {
  const s = settings.value;
  const [changing, setChanging] = useState(false);
  const [disabling, setDisabling] = useState(false);
  return (
    <>
      <ScreenHeader title="Security" onBack={() => back("/settings")} />
      <Card title="How your journal is protected" icon="shield">
        <ul class="bullets small">
          <li>Every check-in, note and photo is encrypted with <strong>AES-256-GCM</strong> before it's saved.</li>
          <li>The key comes from your passcode through <strong>600,000 rounds of PBKDF2-SHA-256</strong>, so guessing is slow.</li>
          <li>Your passcode is never stored. Repeated wrong guesses lock the app for longer and longer.</li>
          <li>Photos are stripped of GPS location before they're encrypted. Nothing is uploaded.</li>
        </ul>
      </Card>

      <Card title="Two-step verification" icon="key">
        {s.twoFactor ? (
          <>
            <p class="small"><span class="badge badge--strong"><Icon name="check" size={14} /> On</span> Unlocking needs your passcode <em>and</em> a code from your authenticator app.</p>
            <p class="muted small">{s.twoFactor.recoveryHashes.length} recovery codes left.</p>
            <button class="btn btn--secondary" onClick={() => setDisabling(true)}>Turn off</button>
          </>
        ) : (
          <>
            <p class="small">Add a second lock: a 6-digit code from an authenticator app (like Google Authenticator, Microsoft Authenticator, or Authy) on another device. Then someone who learns your passcode still can't open your journal.</p>
            <button class="btn btn--primary" onClick={() => go("/settings/2fa")}>Set up</button>
          </>
        )}
      </Card>

      <Card title="Auto-lock" icon="lock">
        <p class="muted small">Lock Patchwork after this long without use.</p>
        <Segmented label="Auto-lock after" value={s.autoLockMinutes} onChange={(v) => void updateSettings({ autoLockMinutes: v })}
          options={[{ value: 1, label: "1 min" }, { value: 5, label: "5 min" }, { value: 15, label: "15 min" }]} />
      </Card>

      <button class="btn btn--secondary btn--block" onClick={() => setChanging(true)}><Icon name="key" /> Change passcode</button>

      {changing && <ChangePasscode onClose={() => setChanging(false)} />}
      <Sheet open={disabling} onClose={() => setDisabling(false)} title="Turn off two-step verification?">
        <p>Your journal will open with just your passcode.</p>
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => setDisabling(false)}>Keep it on</button>
          <button class="btn btn--danger" onClick={async () => { await updateSettings({ twoFactor: null }); setDisabling(false); notify("Two-step verification turned off."); }}>Turn off</button>
        </div>
      </Sheet>
    </>
  );
}

function ChangePasscode({ onClose }: { onClose: () => void }) {
  const [oldP, setOld] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const problem = p1 ? passcodeProblem(p1) : null;
  const ok = oldP && p1 && !problem && p1 === p2;
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await changePasscode(oldP, p1);
      notify("Passcode changed.");
      onClose();
    } catch (x) {
      setErr(x instanceof WrongPasscodeError ? "Your current passcode isn't right." : "Couldn't change the passcode.");
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Change passcode">
      {busy ? <Spinner label="Re-encrypting your key…" /> : (
        <form onSubmit={submit}>
          <PasswordField id="cp-old" label="Current passcode" value={oldP} onInput={setOld} autoComplete="current-password" autoFocus />
          <PasswordField id="cp-1" label="New passcode" value={p1} onInput={setP1} autoComplete="new-password" invalid={!!problem} describedBy="cp-help" />
          <p id="cp-help" class="field-msg field-msg--error" aria-live="polite">{problem ?? (p2 && p1 !== p2 ? "New passcodes don't match." : "")}</p>
          <PasswordField id="cp-2" label="New passcode again" value={p2} onInput={setP2} autoComplete="new-password" />
          <p class="field-msg field-msg--error" role="alert">{err}</p>
          <button class="btn btn--primary btn--block" type="submit" disabled={!ok}>Change passcode</button>
          <p class="muted small">Backups made before this change still open with your old passcode.</p>
        </form>
      )}
    </Sheet>
  );
}

function TwoFactorSetup() {
  const [secret] = useState(newSecret);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [showKey, setShowKey] = useState(false);
  const uri = otpauthUri(secret, settings.value.nickname || "My journal");

  const verify = async (e: Event) => {
    e.preventDefault();
    const counter = await verifyTotp(secret, code);
    if (counter === null) {
      setErr("That code didn't match. Check the time on your devices, and try the newest code.");
      return;
    }
    const recovery = newRecoveryCodes();
    await updateSettings({
      twoFactor: { secret, lastCounter: counter, recoveryHashes: await Promise.all(recovery.map(hashRecoveryCode)), enabledAt: Date.now() },
    });
    setCodes(recovery);
  };

  if (codes) {
    return (
      <>
        <ScreenHeader title="Save your recovery codes" />
        <p>If you lose the device with your authenticator app, each of these codes can unlock Patchwork once. <strong>This is the only time they're shown.</strong> Write them down or store them in a password manager.</p>
        <ol class="recovery-codes">{codes.map((c) => <li><code>{c}</code></li>)}</ol>
        <button class="btn btn--secondary btn--block" onClick={async () => {
          try {
            await navigator.clipboard.writeText(codes.join("\n"));
            notify("Copied. Paste them somewhere safe.");
          } catch {
            notify("Couldn't copy. Please write them down.", "error");
          }
        }}>Copy codes</button>
        <button class="btn btn--primary btn--block" onClick={() => { notify("Two-step verification is on."); go("/settings/security", { replace: true }); }}>
          I've saved them
        </button>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Two-step verification" onBack={() => back("/settings/security")} />
      <ol class="steps">
        <li>
          <p>Open an authenticator app on another device (Google Authenticator, Microsoft Authenticator, Authy, or your password manager) and scan this code.</p>
          <div class="qr-wrap"><QRCode text={uri} size={196} label="QR code for your authenticator app" /></div>
          <button class="link-btn" onClick={() => setShowKey(!showKey)}>{showKey ? "Hide setup key" : "Can't scan? Enter a setup key instead"}</button>
          {showKey && <p class="setup-key"><code>{secret.match(/.{1,4}/g)?.join(" ")}</code></p>}
        </li>
        <li>
          <form onSubmit={verify}>
            <div class="field">
              <label for="tfa-code">Enter the 6-digit code it shows</label>
              <input id="tfa-code" class="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                onInput={(e) => { setCode(e.currentTarget.value.replace(/\D/g, "")); setErr(null); }} />
            </div>
            <p class="field-msg field-msg--error" role="alert">{err}</p>
            <button class="btn btn--primary btn--block" type="submit" disabled={code.length !== 6}>Verify and turn on</button>
          </form>
        </li>
      </ol>
    </>
  );
}

// ---------- data ----------

function saveFile(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function DataScreen() {
  const [importing, setImporting] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState<File | null>(null);

  const download = async () => {
    setBusy("Preparing backup…");
    try {
      const b = await exportBackup();
      // .json, not a custom extension: phones' file pickers only let you choose file types they know.
      const file = new File([JSON.stringify(b)], `patchwork-backup-${today()}.json`, { type: "application/json" });
      if (isAppleMobile() && navigator.canShare?.({ files: [file] })) {
        setReady(file); // iOS saves files through the share sheet, which needs a tap of its own
      } else {
        saveFile(file);
        notify("Backup saved. It opens only with your current passcode.");
      }
    } catch {
      notify("Couldn't make a backup. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file] });
      setReady(null);
      notify("Backup saved. It opens only with your current passcode.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet
      saveFile(file);
      setReady(null);
    }
  };

  /** Run a long action behind a spinner; always clears the spinner, even on failure. */
  const run = async (label: string, fn: () => Promise<void>, done: string, then?: string) => {
    setBusy(label);
    try {
      await fn();
      notify(done);
      if (then) go(then);
    } catch {
      notify("Something went wrong. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const pickFile = (e: Event) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) void f.text().then(setImporting);
    (e.currentTarget as HTMLInputElement).value = "";
  };

  if (busy) return <Spinner label={busy} />;

  return (
    <>
      <ScreenHeader title="Backup & data" onBack={() => back("/settings")} />
      <Card title="Encrypted backup" icon="download">
        <p class="small">Your journal lives only on this device. A backup file lets you move to a new phone or recover from a lost one. It stays encrypted and opens only with the passcode you have now.</p>
        <button class="btn btn--primary" onClick={download}><Icon name="download" /> Download backup</button>
        <label class="btn btn--secondary file-btn">
          <Icon name="upload" /> Restore from backup
          <input type="file" onChange={pickFile} />
        </label>
      </Card>

      <Sheet open={ready !== null} onClose={() => setReady(null)} title="Your backup is ready">
        <p class="small">Tap <strong>Save backup</strong>, then choose <strong>Save to Files</strong>. The file stays encrypted and opens only with your current passcode.</p>
        <button class="btn btn--primary btn--block" onClick={() => ready && void share(ready)}>
          <Icon name="download" /> Save backup
        </button>
      </Sheet>

      <Card title="Sample data" icon="sparkle">
        {hasDemoData.value ? (
          <>
            <p class="small">Sample check-ins, treatments and photos are loaded. Removing them leaves your own entries untouched.</p>
            <button class="btn btn--secondary" onClick={() => void run("Removing sample data…", removeSampleData, "Sample data removed.")}>Remove sample data</button>
          </>
        ) : (
          <>
            <p class="small">Load 45 days of made-up check-ins to see how charts, patterns and the visit report work.</p>
            <button class="btn btn--secondary" onClick={() => void run("Creating sample data…", loadSampleData, "Sample data loaded.", "/timeline")}>Load sample data</button>
          </>
        )}
      </Card>

      <Card title="Delete everything" icon="trash" class="card--danger">
        <p class="small">Permanently erase your journal, photos and settings from this device.</p>
        <button class="btn btn--danger" onClick={() => setErasing(true)}>Delete all my data</button>
      </Card>

      {importing !== null && <ImportSheet text={importing} onClose={() => setImporting(null)} />}
      <EraseSheet open={erasing} onClose={() => setErasing(false)} />
    </>
  );
}

function ImportSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await importBackup(text, pass);
      notify("Backup restored.");
      go("/today", { replace: true });
    } catch (x) {
      setErr(x instanceof WrongPasscodeError ? "That passcode doesn't open this backup." : x instanceof Error ? x.message : "Couldn't restore.");
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Restore backup">
      {busy ? <Spinner label="Restoring…" /> : (
        <form onSubmit={submit}>
          <p class="small"><strong>This replaces everything currently on this device</strong> with the backup.</p>
          <PasswordField id="imp" label="Passcode used when the backup was made" value={pass} onInput={setPass} autoComplete="current-password" autoFocus />
          <p class="field-msg field-msg--error" role="alert">{err}</p>
          <button class="btn btn--primary btn--block" type="submit" disabled={!pass}>Restore</button>
        </form>
      )}
    </Sheet>
  );
}

function EraseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Delete all data?">
      <p>This erases every check-in, photo, treatment and setting on this device. It can't be undone. Download a backup first if you might want it later.</p>
      <div class="field">
        <label for="del">Type DELETE to confirm</label>
        <input id="del" value={typed} autoCapitalize="characters" onInput={(e) => setTyped(e.currentTarget.value)} />
      </div>
      <button class="btn btn--danger btn--block" disabled={typed.trim() !== "DELETE"} onClick={() => void eraseEverything()}>
        Delete everything
      </button>
    </Sheet>
  );
}

// ---------- feedback ----------

function FeedbackScreen() {
  const [f, setF] = useState<FeedbackT>({ type: "bug", message: "", contact: "", includeDevice: true });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "offline">("idle");
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setState("sending");
    setErr(null);
    try {
      setState(await sendFeedback(f));
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't send.");
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <>
        <ScreenHeader title="Thank you" onBack={() => back("/settings")} />
        <div class="empty">
          <div class="empty__icon empty__icon--ok"><Icon name="check" size={28} /></div>
          <p>We read every message. {f.contact ? "We'll reply if we have a question." : ""}</p>
          <button class="btn btn--primary" onClick={() => go("/today")}>Back to home</button>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Feedback" sub="Found a bug? Have an idea? Tell us." onBack={() => back("/settings")} />
      <form onSubmit={submit}>
        <Segmented label="Type" value={f.type} onChange={(type) => setF({ ...f, type })}
          options={[{ value: "bug", label: "Bug" }, { value: "idea", label: "Idea" }, { value: "other", label: "Other" }]} />
        <div class="field">
          <label for="fb-msg">{f.type === "bug" ? "What happened, and what did you expect?" : f.type === "idea" ? "What would make Patchwork better for you?" : "Your message"}</label>
          <textarea id="fb-msg" rows={6} maxLength={2000} required value={f.message} onInput={(e) => setF({ ...f, message: e.currentTarget.value })} />
          <p class="muted small">{f.message.length}/2000 · Please don't include health details. We don't need them.</p>
        </div>
        <div class="field">
          <label for="fb-contact">Email for a reply <span class="muted">(optional)</span></label>
          <input id="fb-contact" type="email" autoComplete="email" maxLength={200} value={f.contact} onInput={(e) => setF({ ...f, contact: e.currentTarget.value })} />
        </div>
        <Toggle label="Include device info" description="Browser, screen size and app version. Never your journal." checked={f.includeDevice} onChange={(v) => setF({ ...f, includeDevice: v })} />
        <p class="field-msg field-msg--error" role="alert">{err}</p>
        {state === "offline" ? (
          <div class="banner banner--info">
            <Icon name="info" size={18} />
            <span>
              Couldn't reach the feedback server.{" "}
              {FEEDBACK_EMAIL
                ? <a href={mailtoLink(f)}>Send it by email instead</a>
                : <button type="button" class="link-btn inline" onClick={() => void navigator.clipboard.writeText(f.message).then(() => notify("Copied."))}>Copy your message</button>}
            </span>
          </div>
        ) : (
          <button class="btn btn--primary btn--block" type="submit" disabled={!f.message.trim() || state === "sending"}>
            {state === "sending" ? "Sending…" : "Send"}
          </button>
        )}
      </form>
    </>
  );
}

// ---------- about ----------

function About() {
  return (
    <>
      <ScreenHeader title="About Patchwork" onBack={() => back("/settings")} />
      <p>Patchwork is a private, all-in-one eczema app: daily check-ins and a weekly score that work on every skin tone, skin weather, a product label check, progress photos and dark-mark tracking, and a one-page summary for your dermatologist.</p>
      <Card title="Not a medical device" icon="info">
        <p class="small">Patchwork doesn't diagnose, and it never recommends treatments. <button class="link-btn inline" onClick={() => go("/learn/why-no-ai")}>Why no AI diagnosis?</button></p>
      </Card>
      <Card title="Privacy" icon="lock">
        <p class="small">No account, no ads, no analytics, no third-party trackers. Your journal and photos are encrypted and never leave your device. If you turn on reminders, our server stores only your reminder times, your time zone, and the anonymous address your browser gives it for notifications. If you turn on skin weather, the app asks Open-Meteo for your chosen city's weather, sending only that city's map coordinates. Label photos are read on your device and never uploaded or saved.</p>
      </Card>
      <Card title="Open-source software used" icon="book">
        <ul class="bullets small">
          <li>Preact and @preact/signals (MIT): user interface</li>
          <li>qrcode-generator by Kazuhiko Arase (MIT): QR codes for two-step setup</li>
          <li>web-push (MPL-2.0): sending reminder notifications from the server</li>
          <li>tesseract.js (Apache-2.0): reading ingredient labels on your device</li>
          <li><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a> (CC BY 4.0)</li>
          <li>Vite, TypeScript, Vitest: building and testing</li>
        </ul>
      </Card>
      <p class="muted small">Version {APP_VERSION}</p>
    </>
  );
}
