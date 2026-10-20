// Minimal promise wrapper around IndexedDB.
//
// Stores:
//   meta    - small plaintext values: wrapped key + KDF params, unlock-attempt counter,
//             reminder schedule. Never health data.
//   records - encrypted JSON records { id, type, iv, ct }
//   blobs   - encrypted photo bytes  { id, iv, ct }

const DB_NAME = "patchwork";
const DB_VERSION = 1;

export type StoreName = "meta" | "records" | "blobs";

export interface EncryptedRow {
  id: string;
  type?: string;
  iv: Uint8Array<ArrayBuffer>;
  ct: Uint8Array<ArrayBuffer>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("records")) {
        db.createObjectStore("records", { keyPath: "id" }).createIndex("type", "type");
      }
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // If the browser closes the connection (iOS can after a long time in the
      // background), open a fresh one next time instead of failing forever.
      db.onclose = () => (dbPromise = null);
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("Database is open in another tab. Close it and try again."));
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function metaGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return result(db.transaction("meta").objectStore("meta").get(key)) as Promise<T | undefined>;
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  await done(tx);
}

export async function metaDelete(key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").delete(key);
  await done(tx);
}

export async function put(store: "records" | "blobs", row: EncryptedRow): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(row);
  await done(tx);
}

export async function putMany(store: "records" | "blobs", rows: EncryptedRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const r of rows) os.put(r);
  await done(tx);
}

export async function get(store: "records" | "blobs", id: string): Promise<EncryptedRow | undefined> {
  const db = await open();
  return result(db.transaction(store).objectStore(store).get(id));
}

export async function all(store: "records" | "blobs"): Promise<EncryptedRow[]> {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function remove(store: "records" | "blobs", ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const id of ids) os.delete(id);
  await done(tx);
}

/** Erase everything. Used by "Delete all my data" and "Forgot passcode". */
export async function wipe(): Promise<void> {
  const db = await open();
  const tx = db.transaction(["meta", "records", "blobs"], "readwrite");
  for (const s of ["meta", "records", "blobs"] as const) tx.objectStore(s).clear();
  await done(tx);
}

/** Test helper: forget the cached connection (fake-indexeddb resets between tests). */
export function _resetConnection() {
  dbPromise = null;
}
