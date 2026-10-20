import { useEffect, useState } from "preact/hooks";
import { cancelSecondFactor, eraseEverything, phase, unlock, verifySecondFactor } from "../state";
import { WrongPasscodeError } from "../lib/crypto";
import { throttleState, TooManyAttemptsError } from "../lib/vault";
import { go } from "../router";
import { Logo } from "../components/Logo";
import { PasswordField, Sheet, Spinner } from "../components/ui";
import { Icon } from "../components/Icon";

const fmtWait = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
};

export function Unlock() {
  return phase.value === "second-factor" ? <SecondFactor /> : <PasscodeStep />;
}

function PasscodeStep() {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [waitMs, setWaitMs] = useState(0);
  const [forgot, setForgot] = useState(false);

  // Count down any lockout left over from earlier attempts (survives reloads).
  useEffect(() => {
    void throttleState().then((t) => setWaitMs(t.waitMs));
  }, []);
  useEffect(() => {
    if (waitMs <= 0) return;
    const t = setTimeout(() => setWaitMs((w) => Math.max(0, w - 1000)), 1000);
    return () => clearTimeout(t);
  }, [waitMs]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!pass || busy || waitMs > 0) return;
    setBusy(true);
    setErr(null);
    try {
      await unlock(pass);
    } catch (x) {
      setPass("");
      if (x instanceof WrongPasscodeError) {
        const t = await throttleState();
        setWaitMs(t.waitMs);
        setErr(t.waitMs > 0 ? "Too many wrong tries." : "That passcode didn't work. Try again.");
      } else if (x instanceof TooManyAttemptsError) {
        setWaitMs(x.waitMs);
        setErr("Too many wrong tries.");
      } else {
        setErr("Couldn't open your journal. Please try again.");
      }
      setBusy(false);
    }
  };

  if (busy) return <main class="onboard" id="main"><section class="onboard__step"><Spinner label="Unlocking…" /></section></main>;

  return (
    <main class="onboard" id="main">
      <form class="onboard__step" onSubmit={submit}>
        <Logo size={64} />
        <h1 tabIndex={-1} data-autofocus>Welcome back</h1>
        <PasswordField id="unlock" label="Passcode" value={pass} onInput={setPass} autoComplete="current-password" autoFocus invalid={!!err} describedBy="unlock-err" />
        <p id="unlock-err" class="field-msg field-msg--error" role="alert">
          {err}{waitMs > 0 && ` Try again in ${fmtWait(waitMs)}.`}
        </p>
        <button class="btn btn--primary btn--block" type="submit" disabled={!pass || waitMs > 0}>
          <Icon name="lock" /> Unlock
        </button>
        <button type="button" class="link-btn" onClick={() => setForgot(true)}>Forgot passcode?</button>
        <button type="button" class="link-btn link-btn--warn" onClick={() => go("/learn/urgent")}>
          <Icon name="alert" size={18} /> Signs you should get care now
        </button>
      </form>
      <ForgotSheet open={forgot} onClose={() => setForgot(false)} />
    </main>
  );
}

function ForgotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Forgot your passcode?">
      <p>Your journal is encrypted with your passcode, and it isn't stored anywhere, not even by us. That means it can't be reset or recovered.</p>
      <p>If you have an encrypted backup, you can restore it after starting over, using the passcode you had when you made it.</p>
      <p><strong>To erase this journal and start over</strong>, type <code>ERASE</code> below. This can't be undone.</p>
      <div class="field">
        <label for="erase">Type ERASE</label>
        <input id="erase" value={typed} autoCapitalize="characters" onInput={(e) => setTyped(e.currentTarget.value)} />
      </div>
      <button class="btn btn--danger btn--block" disabled={typed.trim() !== "ERASE"} onClick={() => void eraseEverything()}>
        Erase and start over
      </button>
    </Sheet>
  );
}

function SecondFactor() {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const ok = await verifySecondFactor(code);
    if (!ok) {
      setErr(recovery ? "That recovery code isn't valid or was already used." : "That code didn't match. Codes change every 30 seconds.");
      setCode("");
      setBusy(false);
    }
  };

  return (
    <main class="onboard" id="main">
      <form class="onboard__step" onSubmit={submit} noValidate>
        <div class="onboard__badge"><Icon name="key" size={32} /></div>
        <h1 tabIndex={-1} data-autofocus>Two-step verification</h1>
        <p class="muted">
          {recovery ? "Enter one of the recovery codes you saved. Each works once." : "Enter the 6-digit code from your authenticator app."}
        </p>
        <div class="field">
          <label for="code">{recovery ? "Recovery code" : "6-digit code"}</label>
          {recovery ? (
            // Distinct keys: otherwise the element is reused and keeps the numeric input's
            // pattern/maxLength, and the browser silently blocks submitting a recovery code.
            <input key="recovery" id="code" value={code} autoComplete="off" autoCapitalize="characters" spellcheck={false} placeholder="XXXX-XXXX"
              onInput={(e) => setCode(e.currentTarget.value)} autoFocus />
          ) : (
            <input key="totp" id="code" class="code-input" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              pattern="[0-9]*" onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ""))} autoFocus />
          )}
        </div>
        <p class="field-msg field-msg--error" role="alert">{err}</p>
        <button class="btn btn--primary btn--block" type="submit" disabled={busy || (recovery ? code.length < 8 : code.length !== 6)}>Verify</button>
        <button type="button" class="link-btn" onClick={() => { setRecovery(!recovery); setCode(""); setErr(null); }}>
          {recovery ? "Use my authenticator app instead" : "Use a recovery code"}
        </button>
        <button type="button" class="link-btn" onClick={cancelSecondFactor}>Cancel</button>
      </form>
    </main>
  );
}
