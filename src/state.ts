// App-wide state and actions. The data key lives only in this module's memory
// while the journal is unlocked; locking drops it along with all decrypted data.

import { computed, signal } from "@preact/signals";
import * as db from "./lib/db";
import * as repo from "./lib/repo";
import { clearFailedAttempts, createVault, hasVault, recordFailedAttempt, unlockVault, changePasscode as rekey } from "./lib/vault";
import { unwrapDataKey } from "./lib/crypto";
import { hashRecoveryCode, verifyTotp } from "./lib/totp";
import { safeEqual } from "./lib/bytes";
import { today, uid } from "./lib/date";
import type { DarkMark, Entry, PhotoMeta, PoemRecord, Product, Settings, Treatment } from "./lib/types";
import { DEFAULT_SETTINGS } from "./lib/types";
import { syncReminders } from "./lib/notify";
import { fetchWeather, type DailyWeather } from "./lib/weather";

export type Phase = "loading" | "unsupported" | "welcome" | "locked" | "second-factor" | "unlocked";

export const phase = signal<Phase>("loading");
export const journal = signal<repo.Journal | null>(null);

export const entries = computed(() => journal.value?.entries ?? []);
export const treatments = computed(() => journal.value?.treatments ?? []);
export const photos = computed(() => journal.value?.photos ?? []);
export const poems = computed(() => journal.value?.poems ?? []);
export const marks = computed(() => journal.value?.marks ?? []);
export const products = computed(() => journal.value?.products ?? []);
export const settings = computed(() => journal.value?.settings ?? DEFAULT_SETTINGS);
export const todayEntry = computed(() => entries.value.find((e) => e.date === today()) ?? null);
export const hasDemoData = computed(
  () =>
    entries.value.some((e) => e.demo) || treatments.value.some((t) => t.demo) || photos.value.some((p) => p.demo) ||
    poems.value.some((p) => p.demo) || marks.value.some((m) => m.demo) || products.value.some((p) => p.demo),
);

let dek: CryptoKey | null = null;
let pending: { dek: CryptoKey; journal: repo.Journal } | null = null;
let secondFactorFailures = 0;

function key(): CryptoKey {
  if (!dek) throw new Error("Journal is locked");
  return dek;
}

// ---------- toasts ----------

export const toast = signal<{ id: number; text: string; tone: "ok" | "error" } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function notify(text: string, tone: "ok" | "error" = "ok") {
  clearTimeout(toastTimer);
  toast.value = { id: Date.now(), text, tone };
  toastTimer = setTimeout(() => (toast.value = null), 3500);
}

// ---------- lifecycle ----------

/**
 * Why Patchwork can't run here, or null if it can. Encryption needs a secure (https)
 * page, and the journal needs the browser's database.
 */
export const unsupportedReason = signal<"insecure" | "storage" | null>(null);

export async function boot() {
  if (!window.isSecureContext || !globalThis.crypto?.subtle) {
    unsupportedReason.value = "insecure";
    phase.value = "unsupported";
    return;
  }
  try {
    phase.value = (await hasVault()) ? "locked" : "welcome";
  } catch {
    // IndexedDB missing or blocked (some private-browsing modes, or site data turned off).
    unsupportedReason.value = "storage";
    phase.value = "unsupported";
  }
}

/** Ask the browser not to clear the journal when the device runs low on space. */
function keepStorage() {
  void navigator.storage?.persist?.().catch(() => false);
}

export async function createJournal(passcode: string) {
  dek = await createVault(passcode);
  const j: repo.Journal = { entries: [], treatments: [], photos: [], poems: [], marks: [], products: [], settings: { ...DEFAULT_SETTINGS } };
  await repo.saveSettings(dek, j.settings);
  journal.value = j;
  phase.value = "unlocked";
  keepStorage();
}

/** Step 1 of unlocking. Returns true if a second factor is still required. */
export async function unlock(passcode: string): Promise<boolean> {
  const k = await unlockVault(passcode, Date.now(), { resetThrottle: false });
  const j = await repo.loadJournal(k);
  if (j.settings.twoFactor) {
    pending = { dek: k, journal: j };
    phase.value = "second-factor";
    return true;
  }
  finishUnlock(k, j);
  return false;
}

function finishUnlock(k: CryptoKey, j: repo.Journal) {
  secondFactorFailures = 0;
  void clearFailedAttempts();
  dek = k;
  journal.value = j;
  pending = null;
  phase.value = "unlocked";
}

/** Step 2: a 6-digit authenticator code or a one-time recovery code. */
export async function verifySecondFactor(input: string): Promise<boolean> {
  if (!pending) return false;
  const tf = pending.journal.settings.twoFactor;
  if (!tf) return false;
  const s = pending.journal.settings;
  const counter = await verifyTotp(tf.secret, input, Date.now() / 1000, tf.lastCounter);
  if (counter !== null) {
    s.twoFactor = { ...tf, lastCounter: counter };
  } else {
    const h = await hashRecoveryCode(input);
    const match = tf.recoveryHashes.find((x) => safeEqual(x, h));
    if (!match || input.replace(/\W/g, "").length !== 8) {
      // Wrong codes share the passcode's backoff budget; after a few, start over from the passcode.
      const wait = await recordFailedAttempt();
      if (++secondFactorFailures >= 3 || wait > 0) {
        cancelSecondFactor();
        notify("Too many wrong codes. Enter your passcode again.", "error");
      }
      return false;
    }
    s.twoFactor = { ...tf, recoveryHashes: tf.recoveryHashes.filter((x) => x !== match) };
    notify(`Recovery code used. ${s.twoFactor.recoveryHashes.length} left.`);
  }
  await repo.saveSettings(pending.dek, s);
  finishUnlock(pending.dek, pending.journal);
  return true;
}

export function cancelSecondFactor() {
  pending = null;
  secondFactorFailures = 0;
  phase.value = "locked";
}

const objectUrls = new Map<string, string>();

export function lock() {
  dek = null;
  pending = null;
  journal.value = null;
  weather.value = NO_WEATHER;
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  phase.value = "locked";
}

// ---------- mutations ----------

function patch(fn: (j: repo.Journal) => repo.Journal) {
  if (journal.value) journal.value = fn(journal.value);
}

export function blankEntry(date = today()): Entry {
  const now = Date.now();
  return {
    id: uid(), date, itch: null, sleep: null, areas: [], looks: [], triggers: [], treatments: [],
    note: "", photoIds: [], createdAt: now, updatedAt: now,
  };
}

export async function saveEntry(e: Entry) {
  const next = { ...e, updatedAt: Date.now() };
  await repo.saveRecord(key(), "entry", next);
  patch((j) => ({
    ...j,
    entries: [...j.entries.filter((x) => x.id !== e.id), next].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export async function deleteEntry(id: string) {
  await repo.deleteRecords([id]);
  patch((j) => ({ ...j, entries: j.entries.filter((x) => x.id !== id) }));
}

/** Tick or untick a treatment for a day, creating that day's entry if needed. */
export async function toggleTreatmentUsed(treatmentId: string, date = today()) {
  const e = entries.value.find((x) => x.date === date) ?? blankEntry(date);
  const used = e.treatments.includes(treatmentId);
  await saveEntry({ ...e, treatments: used ? e.treatments.filter((t) => t !== treatmentId) : [...e.treatments, treatmentId] });
}

export async function saveTreatment(t: Treatment) {
  await repo.saveRecord(key(), "treatment", t);
  patch((j) => ({ ...j, treatments: [...j.treatments.filter((x) => x.id !== t.id), t].sort((a, b) => a.createdAt - b.createdAt) }));
  void syncReminders(settings.value, treatments.value);
}

export async function deleteTreatment(id: string) {
  await repo.deleteRecords([id]);
  patch((j) => ({ ...j, treatments: j.treatments.filter((x) => x.id !== id) }));
  void syncReminders(settings.value, treatments.value);
}

// ---------- weekly POEM ----------

export async function savePoem(answers: number[], date = today()): Promise<PoemRecord> {
  // One questionnaire per day: re-answering the same day replaces it.
  const existing = poems.value.find((p) => p.date === date);
  const rec: PoemRecord = { id: existing?.id ?? uid(), date, answers: [...answers], createdAt: Date.now() };
  await repo.saveRecord(key(), "poem", rec);
  patch((j) => ({ ...j, poems: [...j.poems.filter((x) => x.id !== rec.id), rec].sort((a, b) => a.date.localeCompare(b.date)) }));
  return rec;
}

export async function deletePoem(id: string) {
  await repo.deleteRecords([id]);
  patch((j) => ({ ...j, poems: j.poems.filter((x) => x.id !== id) }));
}

// ---------- dark marks ----------

export async function saveMark(m: DarkMark) {
  const next = { ...m, updatedAt: Date.now() };
  await repo.saveRecord(key(), "mark", next);
  patch((j) => ({ ...j, marks: [...j.marks.filter((x) => x.id !== m.id), next].sort((a, b) => a.createdAt - b.createdAt) }));
  return next;
}

export async function deleteMark(id: string) {
  const m = marks.value.find((x) => x.id === id);
  const photoIds = m?.updates.flatMap((u) => (u.photoId ? [u.photoId] : [])) ?? [];
  for (const p of photoIds) await deletePhoto(p);
  await repo.deleteRecords([id]);
  patch((j) => ({ ...j, marks: j.marks.filter((x) => x.id !== id) }));
}

// ---------- product label checks ----------

export async function saveProduct(p: Product) {
  await repo.saveRecord(key(), "product", p);
  patch((j) => ({ ...j, products: [p, ...j.products.filter((x) => x.id !== p.id)].sort((a, b) => b.createdAt - a.createdAt) }));
}

export async function deleteProduct(id: string) {
  await repo.deleteRecords([id]);
  patch((j) => ({ ...j, products: j.products.filter((x) => x.id !== id) }));
}

// ---------- skin weather ----------

export interface WeatherState {
  status: "off" | "loading" | "ready" | "error";
  /** About two months of past days plus the next week, oldest first. */
  days: DailyWeather[];
  /** The city these days are for. */
  place: string | null;
}
const NO_WEATHER: WeatherState = { status: "off", days: [], place: null };
export const weather = signal<WeatherState>(NO_WEATHER);

/** Load weather for the chosen city (cached for an hour; failures keep the last good data). */
export async function refreshWeather() {
  const place = settings.value.weatherPlace;
  if (!place) {
    weather.value = NO_WEATHER;
    return;
  }
  const same = weather.value.place === place.name;
  weather.value = { status: same && weather.value.days.length ? "ready" : "loading", days: same ? weather.value.days : [], place: place.name };
  try {
    const days = await fetchWeather(place);
    if (settings.value.weatherPlace?.name === place.name) weather.value = { status: "ready", days, place: place.name };
  } catch {
    if (settings.value.weatherPlace?.name === place.name) weather.value = { ...weather.value, status: "error" };
  }
}

export async function updateSettings(p: Partial<Settings>) {
  const next = { ...settings.value, ...p };
  await repo.saveSettings(key(), next);
  patch((j) => ({ ...j, settings: next }));
  if ("reminder" in p) void syncReminders(next, treatments.value);
}

export async function addPhoto(meta: Omit<PhotoMeta, "id" | "createdAt">, full: Uint8Array<ArrayBuffer>, thumb: Uint8Array<ArrayBuffer>): Promise<PhotoMeta> {
  const m: PhotoMeta = { ...meta, id: uid(), createdAt: Date.now() };
  await repo.savePhoto(key(), m, full, thumb);
  patch((j) => ({ ...j, photos: [...j.photos, m].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt) }));
  return m;
}

export async function deletePhoto(id: string) {
  await repo.deletePhotos([id]);
  for (const size of ["full", "thumb"]) {
    const k = `${id}:${size}`;
    const url = objectUrls.get(k);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(k);
  }
  patch((j) => ({
    ...j,
    photos: j.photos.filter((p) => p.id !== id),
    settings: { ...j.settings, reportPhotoIds: j.settings.reportPhotoIds.filter((x) => x !== id) },
  }));
}

/** Decrypt a photo into a temporary object URL (revoked when the journal locks). */
export async function photoUrl(id: string, size: repo.PhotoSize): Promise<string | null> {
  const k = `${id}:${size}`;
  const cached = objectUrls.get(k);
  if (cached) return cached;
  const bytes = await repo.loadPhotoBytes(key(), id, size);
  if (!bytes || !dek) return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  objectUrls.set(k, url);
  return url;
}

// ---------- security ----------

export async function changePasscode(oldP: string, newP: string) {
  dek = await rekey(oldP, newP);
}

export async function eraseEverything() {
  lock();
  await db.wipe();
  phase.value = "welcome";
}

export async function importBackup(text: string, passcode: string) {
  const b = repo.parseBackup(text);
  const k = await unwrapDataKey(repo.backupVaultMeta(b), passcode); // throws on wrong passcode
  await repo.restoreBackup(b);
  const j = await repo.loadJournal(k);
  lock();
  finishUnlock(k, j);
  keepStorage();
}

// ---------- sample data ----------

export async function loadSampleData() {
  const { buildSampleData } = await import("./lib/demo");
  const s = await buildSampleData();
  const k = key();
  await repo.saveRecords(k, "treatment", s.treatments);
  await repo.saveRecords(k, "entry", s.entries);
  await repo.saveRecords(k, "poem", s.poems);
  await repo.saveRecords(k, "mark", s.marks);
  await repo.saveRecords(k, "product", s.products);
  for (const p of s.photos) await repo.savePhoto(k, p.meta, p.full, p.thumb);
  const nextSettings = { ...settings.value, ...s.settings };
  await repo.saveSettings(k, nextSettings);
  journal.value = await repo.loadJournal(k);
}

export async function removeSampleData() {
  const j = journal.value;
  if (!j) return;
  const photoIds = j.photos.filter((p) => p.demo).map((p) => p.id);
  await repo.deletePhotos(photoIds);
  await repo.deleteRecords([
    ...j.entries.filter((e) => e.demo).map((e) => e.id),
    ...j.treatments.filter((t) => t.demo).map((t) => t.id),
    ...j.poems.filter((p) => p.demo).map((p) => p.id),
    ...j.marks.filter((m) => m.demo).map((m) => m.id),
    ...j.products.filter((p) => p.demo).map((p) => p.id),
  ]);
  const s = { ...j.settings, reportPhotoIds: j.settings.reportPhotoIds.filter((x) => !photoIds.includes(x)) };
  await repo.saveSettings(key(), s);
  journal.value = await repo.loadJournal(key());
}
