// Typed, encrypted persistence for journal data. Everything passing through here
// is sealed with the data key before it touches IndexedDB.

import * as db from "./db";
import { openBytes, openJSON, sealBytes, sealJSON } from "./crypto";
import { fromBase64, toBase64 } from "./bytes";
import { replaceVaultMeta, vaultMeta, type VaultMeta } from "./vault";
import type { DarkMark, Entry, PhotoMeta, PoemRecord, Product, RecordType, Settings, Treatment } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const ctx = (type: RecordType, id: string) => `${type}:${id}`;

export interface Journal {
  entries: Entry[];
  treatments: Treatment[];
  photos: PhotoMeta[];
  poems: PoemRecord[];
  marks: DarkMark[];
  products: Product[];
  settings: Settings;
}

export async function loadJournal(dek: CryptoKey): Promise<Journal> {
  const rows = await db.all("records");
  const journal: Journal = { entries: [], treatments: [], photos: [], poems: [], marks: [], products: [], settings: { ...DEFAULT_SETTINGS } };
  await Promise.all(
    rows.map(async (row) => {
      const type = row.type as RecordType;
      const value = await openJSON<unknown>(dek, row, ctx(type, row.id));
      if (type === "entry") journal.entries.push(value as Entry);
      else if (type === "treatment") journal.treatments.push(value as Treatment);
      else if (type === "photo") journal.photos.push(value as PhotoMeta);
      else if (type === "poem") journal.poems.push(value as PoemRecord);
      else if (type === "mark") journal.marks.push(value as DarkMark);
      else if (type === "product") journal.products.push(value as Product);
      else if (type === "settings") journal.settings = { ...DEFAULT_SETTINGS, ...(value as Partial<Settings>) };
    }),
  );
  journal.entries.sort((a, b) => a.date.localeCompare(b.date));
  journal.photos.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  journal.treatments.sort((a, b) => a.createdAt - b.createdAt);
  journal.poems.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  journal.marks.sort((a, b) => a.createdAt - b.createdAt);
  journal.products.sort((a, b) => b.createdAt - a.createdAt);
  return journal;
}

export async function saveRecord(dek: CryptoKey, type: RecordType, value: { id: string }): Promise<void> {
  const sealed = await sealJSON(dek, value, ctx(type, value.id));
  await db.put("records", { id: value.id, type, ...sealed });
}

export async function saveRecords(dek: CryptoKey, type: RecordType, values: { id: string }[]): Promise<void> {
  const rows = await Promise.all(
    values.map(async (v) => ({ id: v.id, type, ...(await sealJSON(dek, v, ctx(type, v.id))) })),
  );
  await db.putMany("records", rows);
}

export const saveSettings = (dek: CryptoKey, s: Settings) => saveRecord(dek, "settings", { id: "settings", ...s });

export const deleteRecords = (ids: string[]) => db.remove("records", ids);

// ---------- photos ----------

export type PhotoSize = "full" | "thumb";

export async function savePhoto(dek: CryptoKey, meta: PhotoMeta, full: Uint8Array<ArrayBuffer>, thumb: Uint8Array<ArrayBuffer>) {
  const rows = await Promise.all(
    (["full", "thumb"] as const).map(async (size) => ({
      id: `${meta.id}:${size}`,
      ...(await sealBytes(dek, size === "full" ? full : thumb, `photo-${size}:${meta.id}`)),
    })),
  );
  await db.putMany("blobs", rows);
  await saveRecord(dek, "photo", meta);
}

export async function loadPhotoBytes(dek: CryptoKey, id: string, size: PhotoSize): Promise<Uint8Array<ArrayBuffer> | null> {
  const row = await db.get("blobs", `${id}:${size}`);
  if (!row) return null;
  return openBytes(dek, row, `photo-${size}:${id}`);
}

export async function deletePhotos(ids: string[]) {
  await db.remove("blobs", ids.flatMap((id) => [`${id}:full`, `${id}:thumb`]));
  await db.remove("records", ids);
}

// ---------- encrypted backup ----------
// A backup is a copy of the already-encrypted database plus the wrapped key.
// It can only be opened with the passcode that was active when it was made.

interface BackupRow { id: string; type?: string; iv: string; ct: string }

export interface BackupFile {
  format: "patchwork-backup";
  version: 1;
  exportedAt: string;
  vault: { version: 1; createdAt: number; salt: string; iterations: number; iv: string; wrapped: string };
  records: BackupRow[];
  blobs: BackupRow[];
}

const rowOut = (r: db.EncryptedRow): BackupRow => ({ id: r.id, type: r.type, iv: toBase64(r.iv), ct: toBase64(r.ct) });
const rowIn = (r: BackupRow): db.EncryptedRow => ({
  id: String(r.id), ...(r.type ? { type: String(r.type) } : {}), iv: fromBase64(r.iv), ct: fromBase64(r.ct),
});

export async function exportBackup(): Promise<BackupFile> {
  const meta = await vaultMeta();
  if (!meta) throw new Error("Nothing to back up yet.");
  return {
    format: "patchwork-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    vault: {
      version: 1, createdAt: meta.createdAt, iterations: meta.iterations,
      salt: toBase64(meta.salt), iv: toBase64(meta.iv), wrapped: toBase64(meta.wrapped),
    },
    records: (await db.all("records")).map(rowOut),
    blobs: (await db.all("blobs")).map(rowOut),
  };
}

export function parseBackup(text: string): BackupFile {
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Patchwork backup.");
  }
  if (data?.format !== "patchwork-backup" || data.version !== 1 || !data.vault || !Array.isArray(data.records) || !Array.isArray(data.blobs)) {
    throw new Error("That file isn't a Patchwork backup.");
  }
  return data;
}

/** Replace everything on this device with the backup. Caller verifies the passcode first. */
export async function restoreBackup(b: BackupFile): Promise<void> {
  const v = b.vault;
  const meta: VaultMeta = {
    version: 1, createdAt: v.createdAt, iterations: v.iterations,
    salt: fromBase64(v.salt), iv: fromBase64(v.iv), wrapped: fromBase64(v.wrapped),
  };
  await db.wipe();
  await replaceVaultMeta(meta);
  await db.putMany("records", b.records.map(rowIn));
  await db.putMany("blobs", b.blobs.map(rowIn));
}

export function backupVaultMeta(b: BackupFile): VaultMeta {
  const v = b.vault;
  return {
    version: 1, createdAt: v.createdAt, iterations: v.iterations,
    salt: fromBase64(v.salt), iv: fromBase64(v.iv), wrapped: fromBase64(v.wrapped),
  };
}
