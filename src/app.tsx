import { useEffect } from "preact/hooks";
import { phase, refreshWeather, settings, toast, lock, notify, todayEntry, treatments, unsupportedReason } from "./state";
import { route, go } from "./router";
import { startInAppReminders, currentMode, showLocal, syncReminders } from "./lib/notify";
import { Icon, type IconName } from "./components/Icon";
import { Spinner } from "./components/ui";
import { Welcome, onboarding } from "./screens/Welcome";
import { Unlock } from "./screens/Unlock";
import { Today } from "./screens/Today";
import { CheckIn } from "./screens/CheckIn";
import { Timeline } from "./screens/Timeline";
import { Photos } from "./screens/Photos";
import { Visit } from "./screens/Visit";
import { Learn } from "./screens/Learn";
import { Settings } from "./screens/Settings";
import { Poem } from "./screens/Poem";
import { Weather } from "./screens/Weather";
import { Products } from "./screens/Products";

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: "/today", label: "Today", icon: "home" },
  { path: "/timeline", label: "Timeline", icon: "chart" },
  { path: "/photos", label: "Photos", icon: "camera" },
  { path: "/visit", label: "Visit", icon: "report" },
  { path: "/learn", label: "Learn", icon: "book" },
];

function Screen() {
  const [first] = route.value.parts;
  switch (first) {
    case "checkin": return <CheckIn key={route.value.path} />;
    case "poem": return <Poem />;
    case "timeline": return <Timeline />;
    case "photos": return <Photos />;
    case "visit": return <Visit />;
    case "learn": return <Learn />;
    case "settings": return <Settings />;
    case "weather": return <Weather />;
    case "products": return <Products />;
    default: return <Today />;
  }
}

/** Full-screen flows hide the tab bar so there's one obvious way forward. */
const isFlow = () => {
  const p = route.value.parts;
  return p[0] === "checkin" || p[0] === "poem" || (p[0] === "photos" && p[1] === "new") || (p[0] === "visit" && p[1] === "print") || (p[0] === "settings" && p[1] === "2fa");
};

function useAutoLock() {
  const minutes = settings.value.autoLockMinutes;
  useEffect(() => {
    if (phase.value !== "unlocked") return;
    let last = Date.now();
    let hiddenAt: number | null = null;
    const limit = minutes * 60_000;
    const touch = () => (last = Date.now());
    const check = () => {
      if (Date.now() - last > limit) lock();
    };
    const vis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > limit) lock();
      else touch();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(check, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", vis);
      clearInterval(t);
    };
  }, [phase.value, minutes]);
}

function useReminders() {
  useEffect(() => {
    if (phase.value !== "unlocked") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    // Re-register the schedule each unlock (covers a server restart or a new device),
    // and only run the in-app loop when push isn't handling delivery.
    void syncReminders(settings.value, treatments.value).then(async () => {
      if (cancelled) return;
      const mode = await currentMode(settings.value, treatments.value);
      if (mode === "push" || mode === "off" || cancelled) return;
      stop = startInAppReminders((slot) => {
        if (slot.kind === "checkin" && todayEntry.value?.itch != null) return; // already done
        if (document.visibilityState === "visible") {
          notify(slot.kind === "checkin" ? "Time for your check-in. It takes about 20 seconds." : "Treatment reminder.");
        } else if (mode === "in-app") {
          void showLocal(slot.kind);
        }
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [phase.value]);
}

/** Shown instead of the app when this browser can't keep an encrypted journal. */
function Unsupported() {
  const insecure = unsupportedReason.value === "insecure";
  return (
    <main class="onboard" id="main">
      <section class="onboard__step">
        <div class="onboard__badge"><Icon name="alert" size={32} /></div>
        <h1 tabIndex={-1} data-autofocus>{insecure ? "Open Patchwork from its secure address" : "Patchwork can't save data here"}</h1>
        {insecure ? (
          <>
            <p class="lead">Patchwork encrypts your journal inside your browser, and browsers only allow that on secure pages. Open the app's address that starts with <strong>https://</strong>.</p>
            <p class="muted small">Testing on a phone? Use the deployed https:// address. On the computer running the server, http://localhost works too.</p>
          </>
        ) : (
          <p class="lead">This browser isn't letting Patchwork store data. Private browsing or blocked site data can cause this. Open Patchwork in a normal window, or allow site data, and try again.</p>
        )}
        <button class="btn btn--primary btn--block" onClick={() => location.reload()}>Try again</button>
      </section>
    </main>
  );
}

/** Load skin weather when the journal opens or the city changes, and refresh it hourly while open. */
function useWeather() {
  const place = settings.value.weatherPlace?.name;
  useEffect(() => {
    if (phase.value !== "unlocked" || !place) return;
    void refreshWeather();
    const t = setInterval(() => void refreshWeather(), 60 * 60_000);
    return () => clearInterval(t);
  }, [phase.value, place]);
}

/** Move focus to each new screen's heading so screen readers announce it. */
function useFocusOnNavigate() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-autofocus]");
    el?.focus({ preventScroll: true });
  }, [route.value.path, phase.value]);
}

export function App() {
  useAutoLock();
  useReminders();
  useWeather();
  useFocusOnNavigate();

  const p = phase.value;
  const inLearn = route.value.parts[0] === "learn";

  let body;
  if (p === "loading") body = <main class="onboard"><Spinner label="Opening Patchwork…" /></main>;
  else if (p === "unsupported") body = <Unsupported />;
  // Safety information is readable without unlocking.
  else if ((p === "welcome" || p === "locked") && inLearn) {
    body = (
      <main id="main" tabIndex={-1} class="app-main">
        <button class="link-btn" onClick={() => go("/today", { replace: true })}>
          <Icon name="back" size={18} /> {p === "locked" ? "Back to unlock" : "Back to setup"}
        </button>
        <Learn />
      </main>
    );
  }
  else if (p === "welcome" || onboarding.value) body = <Welcome />;
  else if (p === "locked" || p === "second-factor") body = <Unlock />;
  else {
    const flow = isFlow();
    body = (
      <>
        <main id="main" tabIndex={-1} class={`app-main ${flow ? "app-main--flow" : ""}`}>
          <Screen />
        </main>
        {!flow && (
          <nav class="tabbar" aria-label="Main">
            {TABS.map((t) => {
              const on = route.value.path.startsWith(t.path);
              return (
                <a href={`#${t.path}`} class={on ? "on" : ""} aria-current={on ? "page" : undefined}
                  onClick={(e) => { e.preventDefault(); go(t.path); }}>
                  <Icon name={t.icon} />
                  <span>{t.label}</span>
                </a>
              );
            })}
          </nav>
        )}
      </>
    );
  }

  return (
    <div class="shell">
      {/* Not a plain #main link: that would be read as a route by the hash router. */}
      <button class="skip" onClick={() => document.getElementById("main")?.focus()}>Skip to content</button>
      {body}
      <div class="toast-region" aria-live="polite" aria-atomic="true">
        {toast.value && (
          <div class={`toast toast--${toast.value.tone}`} key={toast.value.id} role={toast.value.tone === "error" ? "alert" : "status"}>
            <Icon name={toast.value.tone === "error" ? "alert" : "check"} size={18} />
            {toast.value.text}
          </div>
        )}
      </div>
    </div>
  );
}
