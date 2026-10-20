// First-run onboarding: value -> privacy -> passcode -> reminder -> ready.
// Only the passcode step needs typing; everything else is one tap.

import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { createJournal, importBackup, loadSampleData, notify, phase, updateSettings } from "../state";
import { WrongPasscodeError } from "../lib/crypto";
import { passcodeProblem } from "../lib/crypto";
import { requestPermission } from "../lib/notify";
import { isAppleMobile, isInstalled } from "../lib/device";
import { go } from "../router";
import { Icon } from "../components/Icon";
import { PasswordField, Sheet, Spinner } from "../components/ui";
import { Logo } from "../components/Logo";

type Step = "intro" | "privacy" | "passcode" | "reminder" | "ready";
const ORDER: Step[] = ["intro", "privacy", "passcode", "reminder", "ready"];

// Kept outside the component so a detour to a Learn article doesn't restart onboarding.
const stepSig = signal<Step>("intro");
const setStep = (s: Step) => (stepSig.value = s);

/**
 * True from the first onboarding screen until the user leaves "You're all set".
 * The journal is unlocked halfway through (after the passcode step), so the app
 * shell uses this to keep showing onboarding instead of jumping to Today.
 */
export const onboarding = signal(false);
function finish(path: string) {
  onboarding.value = false;
  stepSig.value = "intro";
  go(path, { replace: true });
}

export function Welcome() {
  const step = stepSig.value;
  useEffect(() => {
    if (phase.value === "welcome") {
      onboarding.value = true;
      if (step === "reminder" || step === "ready") stepSig.value = "intro"; // fresh start after an erase
    }
  }, []);
  const idx = ORDER.indexOf(step);

  return (
    <main class="onboard" id="main">
      <div class="onboard__progress" aria-hidden="true">
        {ORDER.map((s, i) => <span class={i <= idx ? "on" : ""} key={s} />)}
      </div>
      <p class="sr-only" aria-live="polite">Step {idx + 1} of {ORDER.length}</p>
      {step === "intro" && <Intro next={() => setStep("privacy")} />}
      {step === "privacy" && <Privacy next={() => setStep("passcode")} />}
      {step === "passcode" && <CreatePasscode next={() => setStep("reminder")} />}
      {step === "reminder" && <Reminder next={() => setStep("ready")} />}
      {step === "ready" && <Ready />}
    </main>
  );
}

function Intro({ next }: { next: () => void }) {
  const [restoring, setRestoring] = useState<string | null>(null);
  return (
    <section class="onboard__step">
      <Logo size={72} />
      <h1 tabIndex={-1} data-autofocus>Patchwork</h1>
      <p class="lead">Everything for managing eczema in one private app, built for every skin tone.</p>
      <ul class="value-list">
        <li><Icon name="clipboard" /><span><strong>No "how red is it?"</strong> Check-ins compare your skin with your own normal skin, and a weekly research-grade score (POEM) asks nothing about redness.</span></li>
        <li><Icon name="sun" /><span><strong>Skin weather.</strong> What today's humidity, heat and UV mean for your skin, and whether dry days line up with your flares.</span></li>
        <li><Icon name="bottle" /><span><strong>Check product labels.</strong> Photograph an ingredient list to spot common irritants. The photo never leaves your phone.</span></li>
        <li><Icon name="spot" /><span><strong>Photos and dark marks that compare.</strong> Your last photo side by side, and the marks flares leave rated against your own skin as they fade.</span></li>
        <li><Icon name="report" /><span><strong>A one-page report for your doctor.</strong> Trends, patterns, products and your questions, ready to print.</span></li>
      </ul>
      {isAppleMobile() && !isInstalled() && (
        <div class="banner banner--info" role="note">
          <Icon name="info" size={18} />
          <span>
            <strong>On iPhone or iPad, install Patchwork first:</strong> tap Share, then Add to Home Screen, and open it
            from there. Safari and the home-screen app keep separate data, so a journal started here won't appear there.
          </span>
        </div>
      )}
      <button class="btn btn--primary btn--block" onClick={next}>Get started</button>
      <label class="link-btn file-link">
        Moving from another device? Restore a backup
        <input type="file" class="sr-only"
          onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void f.text().then(setRestoring); e.currentTarget.value = ""; }} />
      </label>
      {restoring !== null && <RestoreSheet text={restoring} onClose={() => setRestoring(null)} />}
    </section>
  );
}

function RestoreSheet({ text, onClose }: { text: string; onClose: () => void }) {
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
      finish("/today");
    } catch (x) {
      setErr(x instanceof WrongPasscodeError ? "That passcode doesn't open this backup." : x instanceof Error ? x.message : "Couldn't restore.");
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Restore a backup">
      {busy ? <Spinner label="Restoring…" /> : (
        <form onSubmit={submit}>
          <PasswordField id="restore-pass" label="Passcode used when the backup was made" value={pass} onInput={setPass} autoComplete="current-password" autoFocus />
          <p class="field-msg field-msg--error" role="alert">{err}</p>
          <button class="btn btn--primary btn--block" type="submit" disabled={!pass}>Restore</button>
        </form>
      )}
    </Sheet>
  );
}

function Privacy({ next }: { next: () => void }) {
  return (
    <section class="onboard__step">
      <div class="onboard__badge"><Icon name="shield" size={36} /></div>
      <h1 tabIndex={-1} data-autofocus>Your data stays yours</h1>
      <ul class="value-list">
        <li><Icon name="lock" /><span>Everything you log is <strong>encrypted on this device</strong> with a passcode only you know.</span></li>
        <li><Icon name="close" /><span><strong>No account, no ads, no tracking.</strong> Your journal and photos are never uploaded.</span></li>
        <li><Icon name="info" /><span><strong>Patchwork doesn't diagnose.</strong> We tested AI diagnosis in our research and it failed people with darker skin, so this app records, and your doctor decides.</span></li>
      </ul>
      <button class="btn btn--primary btn--block" onClick={next}>Create my passcode</button>
      <button class="link-btn" onClick={() => go("/learn/why-no-ai")}>Why no AI diagnosis?</button>
    </section>
  );
}

function CreatePasscode({ next }: { next: () => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const problem = p1 ? passcodeProblem(p1) : null;
  const mismatch = p2.length > 0 && p1 !== p2;
  const ok = p1.length > 0 && !problem && p1 === p2 && ack;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await createJournal(p1);
      next();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  if (busy) return <section class="onboard__step"><Spinner label="Encrypting your journal…" /></section>;

  return (
    <form class="onboard__step" onSubmit={submit} noValidate>
      <h1 tabIndex={-1} data-autofocus>Create a passcode</h1>
      <p class="muted">At least 6 characters. A short phrase like <em>maple-river-7</em> is stronger than a number.</p>
      <PasswordField id="p1" label="Passcode" value={p1} onInput={setP1} autoComplete="new-password" autoFocus invalid={!!problem} describedBy="p1-help" />
      <p id="p1-help" class={`field-msg ${problem ? "field-msg--error" : ""}`} aria-live="polite">
        {problem ?? (p1 ? "Looks good." : "")}
      </p>
      <PasswordField id="p2" label="Type it again" value={p2} onInput={setP2} autoComplete="new-password" invalid={mismatch} describedBy="p2-help" />
      <p id="p2-help" class={`field-msg ${mismatch ? "field-msg--error" : ""}`} aria-live="polite">{mismatch ? "These don't match yet." : ""}</p>
      <label class="check-row">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.currentTarget.checked)} />
        <span>I understand that if I forget my passcode, <strong>no one can recover my journal</strong>. That's what keeps it private.</span>
      </label>
      {err && <p class="field-msg field-msg--error" role="alert">{err}</p>}
      <button class="btn btn--primary btn--block" type="submit" disabled={!ok}>Create my journal</button>
    </form>
  );
}

function Reminder({ next }: { next: () => void }) {
  const [time, setTime] = useState("20:00");
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await requestPermission();
      await updateSettings({ reminder: { enabled: true, time } });
      if (perm !== "granted") notify("Reminders will show inside the app. You can allow notifications later in Settings.");
    } catch {
      notify("Couldn't turn on reminders. You can try again in Settings.", "error");
    }
    next();
  };

  return (
    <section class="onboard__step">
      <div class="onboard__badge"><Icon name="bell" size={36} /></div>
      <h1 tabIndex={-1} data-autofocus>A daily nudge?</h1>
      <p class="lead">Logging most days is what makes patterns visible. Pick a time you're usually winding down.</p>
      <div class="field">
        <label for="rtime">Remind me at</label>
        <input id="rtime" type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} />
      </div>
      <p class="muted small">Reminders just say "Time for a quick check-in." Nothing about your skin appears on your lock screen.</p>
      <button class="btn btn--primary btn--block" onClick={enable} disabled={busy}>Turn on reminders</button>
      <button class="link-btn" onClick={next}>Not now</button>
    </section>
  );
}

function Ready() {
  const [busy, setBusy] = useState(false);
  const sample = async () => {
    setBusy(true);
    try {
      await loadSampleData();
      notify("Sample data loaded. Remove it any time in Settings.");
    } catch {
      notify("Couldn't create sample data. You can try again from Settings.", "error");
    }
    finish("/today");
  };
  if (busy) return <section class="onboard__step"><Spinner label="Creating sample data…" /></section>;
  return (
    <section class="onboard__step">
      <div class="onboard__badge onboard__badge--ok"><Icon name="check" size={36} /></div>
      <h1 tabIndex={-1} data-autofocus>You're all set</h1>
      <p class="lead">Your journal is encrypted and ready.</p>
      <button class="btn btn--primary btn--block" onClick={() => finish("/checkin")}>Do my first check-in</button>
      <button class="btn btn--secondary btn--block" onClick={sample}>Explore with sample data first</button>
      <button class="link-btn" onClick={() => finish("/today")}>Go to home</button>
    </section>
  );
}
