// Reminders.
//
// Two tiers:
//  1. Push (preferred). If the Patchwork server is reachable, the browser subscribes to
//     Web Push and the server sends reminders at the chosen times, even when the app is
//     closed. The server only ever knows times of day and a time zone. Notification text
//     is generic ("Time for your check-in"), so nothing private shows on a lock screen.
//  2. In-app. On static hosting with no server, reminders fire while the app is open
//     and Today shows a gentle nudge.

import * as db from "./db";
import type { Settings, Treatment } from "./types";

export interface ReminderSlot {
  time: string; // HH:MM
  kind: "checkin" | "treatment";
}

export type ReminderMode = "push" | "in-app" | "blocked" | "unsupported" | "off";

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
const pushSupported = () => notificationsSupported() && "PushManager" in window;

export function buildSchedule(s: Settings, treatments: Treatment[]): ReminderSlot[] {
  const slots: ReminderSlot[] = [];
  if (s.reminder.enabled) slots.push({ time: s.reminder.time, kind: "checkin" });
  for (const t of treatments) {
    if (!t.active || !t.remind) continue;
    for (const time of t.times) slots.push({ time, kind: "treatment" });
  }
  const seen = new Set<string>();
  return slots.filter((x) => (seen.has(`${x.time}${x.kind}`) ? false : (seen.add(`${x.time}${x.kind}`), true)));
}

let vapidKey: string | null | undefined;
async function serverVapidKey(): Promise<string | null> {
  if (vapidKey !== undefined) return vapidKey;
  try {
    const r = await fetch("/api/push/vapid-public-key", { headers: { accept: "application/json" } });
    vapidKey = r.ok ? ((await r.json()).publicKey as string) : null;
  } catch {
    vapidKey = null;
  }
  return vapidKey;
}

function urlBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** True if a push subscription was made with this server key (base64url). */
export function madeWithKey(subscriptionKey: ArrayBuffer | null | undefined, serverKey: string): boolean {
  if (!subscriptionKey) return true; // browser doesn't say; assume it matches
  const a = new Uint8Array(subscriptionKey);
  const b = urlBase64ToBytes(serverKey);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Push the current schedule to wherever reminders are delivered from.
 * Safe to call often. Never throws: reminders are best-effort and must not break
 * the action (saving a treatment, changing a setting) that triggered the sync.
 */
export async function syncReminders(s: Settings, treatments: Treatment[]): Promise<ReminderMode> {
  try {
    return await sync(s, treatments);
  } catch {
    return "in-app";
  }
}

async function sync(s: Settings, treatments: Treatment[]): Promise<ReminderMode> {
  const schedule = buildSchedule(s, treatments);
  await db.metaSet("reminders", schedule); // read by the in-app loop; times only
  if (!schedule.length) {
    await unsubscribePush();
    return "off";
  }
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "in-app";

  const key = pushSupported() ? await serverVapidKey() : null;
  const reg = await registration();
  if (!key || !reg) return "in-app";
  try {
    let sub = await reg.pushManager.getSubscription();
    // If the server's keys changed (e.g. a redeploy without VAPID_* set), the old
    // subscription can't receive its pushes any more, so make a new one.
    if (sub && !madeWithKey(sub.options?.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) });
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reminders: schedule,
      }),
    });
    return r.ok ? "push" : "in-app";
  } catch {
    return "in-app";
  }
}

async function unsubscribePush() {
  const reg = await registration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  const json = sub.toJSON();
  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, auth: json.keys?.auth }),
    });
  } catch {
    /* server unreachable; the browser-side unsubscribe below is what matters */
  }
  await sub.unsubscribe();
}

export async function currentMode(s: Settings, treatments: Treatment[]): Promise<ReminderMode> {
  if (!buildSchedule(s, treatments).length) return "off";
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "in-app";
  try {
    const reg = await registration();
    const sub = await reg?.pushManager?.getSubscription();
    return sub && (await serverVapidKey()) ? "push" : "in-app";
  } catch {
    return "in-app";
  }
}

export const MESSAGES: Record<ReminderSlot["kind"] | "test", { title: string; body: string }> = {
  checkin: { title: "Patchwork", body: "Time for a quick check-in. It takes about 20 seconds." },
  treatment: { title: "Patchwork", body: "Treatment reminder." },
  test: { title: "Patchwork", body: "Notifications are working. Reminders will look like this." },
};

export async function showLocal(kind: keyof typeof MESSAGES) {
  const reg = await registration();
  const m = MESSAGES[kind];
  const opts: NotificationOptions = { body: m.body, icon: "/icons/icon-192.png", badge: "/icons/badge-72.png", tag: `patchwork-${kind}` };
  if (reg) await reg.showNotification(m.title, opts);
  else new Notification(m.title, opts);
}

export async function sendTest(): Promise<"push" | "local" | "failed"> {
  if ((await requestPermission()) !== "granted") return "failed";
  const reg = await registration();
  const sub = await reg?.pushManager?.getSubscription();
  if (sub) {
    const json = sub.toJSON();
    try {
      const r = await fetch("/api/push/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, auth: json.keys?.auth }),
      });
      if (r.ok) return "push";
    } catch {
      /* fall through to a local notification */
    }
  }
  await showLocal("test");
  return "local";
}

/**
 * In-app reminder loop for when push isn't available. Checks every 30 seconds and
 * fires each slot at most once per day. Returns a stop function.
 */
export function startInAppReminders(onDue: (slot: ReminderSlot) => void): () => void {
  const fired = new Set<string>();
  const tick = async () => {
    const schedule = (await db.metaGet<ReminderSlot[]>("reminders")) ?? [];
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const day = now.toDateString();
    for (const slot of schedule) {
      const id = `${day}|${slot.time}|${slot.kind}`;
      if (slot.time === hhmm && !fired.has(id)) {
        fired.add(id);
        onDue(slot);
      }
    }
  };
  const t = setInterval(tick, 30_000);
  void tick();
  return () => clearInterval(t);
}
