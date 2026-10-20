import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/lib/db";
import {
  changePasscode, createVault, delayAfter, hasVault, throttleState, TooManyAttemptsError, unlockVault,
} from "../src/lib/vault";
import { WrongPasscodeError } from "../src/lib/crypto";
import {
  deletePhotos, exportBackup, loadJournal, loadPhotoBytes, parseBackup, restoreBackup,
  saveRecord, savePhoto, saveSettings,
} from "../src/lib/repo";
import { DEFAULT_SETTINGS, type Entry } from "../src/lib/types";

const FAST = 1000;
const entry = (over: Partial<Entry> = {}): Entry => ({
  id: crypto.randomUUID(), date: "2026-09-01", itch: 5, sleep: 1, areas: ["elbows"], looks: [], triggers: [],
  treatments: [], note: "", photoIds: [], createdAt: 1, updatedAt: 1, ...over,
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  db._resetConnection();
});

describe("vault", () => {
  it("creates, locks, and unlocks", async () => {
    expect(await hasVault()).toBe(false);
    await createVault("maple-river-7", FAST);
    expect(await hasVault()).toBe(true);
    const dek = await unlockVault("maple-river-7");
    expect(dek.type).toBe("secret");
  });

  it("never stores the passcode", async () => {
    await createVault("maple-river-7", FAST);
    const meta = await db.metaGet<Record<string, unknown>>("vault");
    expect(JSON.stringify(meta)).not.toContain("maple");
  });

  it("refuses to overwrite an existing journal", async () => {
    await createVault("maple-river-7", FAST);
    await expect(createVault("other-pass", FAST)).rejects.toThrow();
  });

  it("slows down repeated wrong guesses", async () => {
    await createVault("maple-river-7", FAST);
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) {
      await expect(unlockVault("nope", t0)).rejects.toBeInstanceOf(WrongPasscodeError);
    }
    expect((await throttleState(t0)).waitMs).toBe(0);
    await expect(unlockVault("nope", t0)).rejects.toBeInstanceOf(WrongPasscodeError); // 5th
    expect((await throttleState(t0)).waitMs).toBe(30_000);
    // even the right passcode is refused while waiting
    await expect(unlockVault("maple-river-7", t0 + 1000)).rejects.toBeInstanceOf(TooManyAttemptsError);
    // after the wait the right passcode works and the counter resets
    await expect(unlockVault("maple-river-7", t0 + 31_000)).resolves.toBeTruthy();
    expect((await throttleState(t0 + 31_000)).failures).toBe(0);
  });

  it("backs off exponentially up to 15 minutes", () => {
    expect([4, 5, 6, 7].map(delayAfter)).toEqual([0, 30_000, 60_000, 120_000]);
    expect(delayAfter(50)).toBe(15 * 60_000);
  });

  it("changing the passcode keeps every record readable", async () => {
    const dek = await createVault("old-pass-11", FAST);
    await saveRecord(dek, "entry", entry({ note: "keep me" }));
    const dek2 = await changePasscode("old-pass-11", "new-pass-22");
    expect((await loadJournal(dek2)).entries[0].note).toBe("keep me");
    await expect(unlockVault("old-pass-11")).rejects.toBeInstanceOf(WrongPasscodeError);
    await expect(unlockVault("new-pass-22")).resolves.toBeTruthy();
  });
});

describe("journal storage", () => {
  it("round-trips entries, settings and photos, encrypted at rest", async () => {
    const dek = await createVault("maple-river-7", FAST);
    await saveRecord(dek, "entry", entry({ date: "2026-09-02", note: "sweaty soccer practice" }));
    await saveRecord(dek, "entry", entry({ date: "2026-09-01" }));
    await saveSettings(dek, { ...DEFAULT_SETTINGS, nickname: "E" });
    const full = new Uint8Array([1, 2, 3, 4]);
    const thumb = new Uint8Array([9, 9]);
    await savePhoto(dek, { id: "p1", date: "2026-09-02", area: "elbows", width: 4, height: 1, createdAt: 1 }, full, thumb);

    const j = await loadJournal(dek);
    expect(j.entries.map((e) => e.date)).toEqual(["2026-09-01", "2026-09-02"]); // sorted
    expect(j.settings.nickname).toBe("E");
    expect(j.photos).toHaveLength(1);
    expect(await loadPhotoBytes(dek, "p1", "full")).toEqual(full);
    expect(await loadPhotoBytes(dek, "p1", "thumb")).toEqual(thumb);

    const raw = JSON.stringify(await db.all("records"), (_, v) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : v));
    expect(raw).not.toContain("soccer");
    expect(raw).not.toContain("elbows");

    await deletePhotos(["p1"]);
    expect(await loadPhotoBytes(dek, "p1", "full")).toBeNull();
  });

  it("encrypted backup restores onto a fresh device", async () => {
    const dek = await createVault("maple-river-7", FAST);
    await saveRecord(dek, "entry", entry({ note: "backup me" }));
    await savePhoto(dek, { id: "p1", date: "2026-09-02", area: "hands", width: 1, height: 1, createdAt: 1 }, new Uint8Array([7]), new Uint8Array([8]));
    const text = JSON.stringify(await exportBackup());
    expect(text).not.toContain("backup me");

    globalThis.indexedDB = new IDBFactory(); // "new phone"
    db._resetConnection();
    await restoreBackup(parseBackup(text));
    const dek2 = await unlockVault("maple-river-7");
    const j = await loadJournal(dek2);
    expect(j.entries[0].note).toBe("backup me");
    expect(await loadPhotoBytes(dek2, "p1", "full")).toEqual(new Uint8Array([7]));
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackup("not json")).toThrow();
    expect(() => parseBackup(JSON.stringify({ format: "something-else" }))).toThrow();
  });
});
