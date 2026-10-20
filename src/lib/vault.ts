// The vault: creating, unlocking, and re-keying the encrypted journal,
// plus brute-force throttling of unlock attempts.

import * as db from "./db";
import {
  createDataKey, PBKDF2_ITERATIONS, unwrapDataKey, wrapDataKey,
  WrongPasscodeError, type WrappedKey,
} from "./crypto";

interface VaultMeta extends WrappedKey {
  version: 1;
  createdAt: number;
}

interface Throttle {
  failures: number;
  lockedUntil: number;
}

/** Free attempts before delays start. */
const FREE_ATTEMPTS = 4;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

export function delayAfter(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - FREE_ATTEMPTS - 1));
}

export async function hasVault(): Promise<boolean> {
  return (await db.metaGet<VaultMeta>("vault")) !== undefined;
}

export async function createVault(passcode: string, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  if (await hasVault()) throw new Error("A journal already exists on this device.");
  const { dek, wrapped } = await createDataKey(passcode, iterations);
  const meta: VaultMeta = { version: 1, createdAt: Date.now(), ...wrapped };
  await db.metaSet("vault", meta);
  await db.metaDelete("throttle");
  return dek;
}

export async function throttleState(now = Date.now()): Promise<{ failures: number; waitMs: number }> {
  const t = (await db.metaGet<Throttle>("throttle")) ?? { failures: 0, lockedUntil: 0 };
  return { failures: t.failures, waitMs: Math.max(0, t.lockedUntil - now) };
}

export class TooManyAttemptsError extends Error {
  constructor(public waitMs: number) {
    super("Too many attempts");
    this.name = "TooManyAttemptsError";
  }
}

/** Count a failed attempt (wrong passcode or wrong second-factor code) toward the backoff. */
export async function recordFailedAttempt(now = Date.now()): Promise<number> {
  const { failures } = await throttleState(now);
  const next = failures + 1;
  await db.metaSet("throttle", { failures: next, lockedUntil: now + delayAfter(next) } satisfies Throttle);
  return delayAfter(next);
}

export const clearFailedAttempts = () => db.metaDelete("throttle");

/**
 * Unwrap the data key. With two-step verification the caller passes
 * `resetThrottle: false` and clears the counter only after the second factor also
 * passes, so wrong authenticator codes keep counting toward the backoff.
 */
export async function unlockVault(passcode: string, now = Date.now(), opts: { resetThrottle?: boolean } = {}): Promise<CryptoKey> {
  const meta = await db.metaGet<VaultMeta>("vault");
  if (!meta) throw new Error("No journal on this device.");
  const { waitMs } = await throttleState(now);
  if (waitMs > 0) throw new TooManyAttemptsError(waitMs);
  try {
    const dek = await unwrapDataKey(meta, passcode);
    if (opts.resetThrottle !== false) await clearFailedAttempts();
    return dek;
  } catch (e) {
    if (e instanceof WrongPasscodeError) await recordFailedAttempt(now);
    throw e;
  }
}

export async function changePasscode(oldPasscode: string, newPasscode: string): Promise<CryptoKey> {
  const meta = await db.metaGet<VaultMeta>("vault");
  if (!meta) throw new Error("No journal on this device.");
  const extractable = await unwrapDataKey(meta, oldPasscode, true);
  const wrapped = await wrapDataKey(extractable, newPasscode, meta.iterations);
  await db.metaSet("vault", { ...meta, ...wrapped } satisfies VaultMeta);
  return unwrapDataKey(wrapped, newPasscode, false);
}

/** Wrapped-key metadata, for encrypted backups. Contains no secrets on its own. */
export async function vaultMeta(): Promise<VaultMeta | undefined> {
  return db.metaGet<VaultMeta>("vault");
}

export async function replaceVaultMeta(meta: VaultMeta): Promise<void> {
  await db.metaSet("vault", meta);
  await db.metaDelete("throttle");
}

export type { VaultMeta };
