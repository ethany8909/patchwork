// Encryption for everything Patchwork stores.
//
// Design (see docs/SECURITY.md):
//   passcode --PBKDF2-SHA256 (600k iterations, random salt)--> KEK (key-encryption key)
//   KEK wraps a random 256-bit DEK (data-encryption key) with AES-GCM.
//   Every record and photo is encrypted with the DEK using AES-256-GCM and a fresh 96-bit IV.
//
// The passcode is never stored. A wrong passcode is detected because AES-GCM
// authentication fails when unwrapping the DEK. Changing the passcode only re-wraps
// the DEK, so existing records never need to be re-encrypted.

import { fromUtf8, randomBytes, utf8 } from "./bytes";

/** OWASP (2023) recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

export interface WrappedKey {
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
  iv: Uint8Array<ArrayBuffer>;
  wrapped: Uint8Array<ArrayBuffer>;
}

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  ct: Uint8Array<ArrayBuffer>;
}

/** Normalize so the same passcode typed on different keyboards derives the same key. */
const normalize = (passcode: string) => passcode.normalize("NFKC");

async function deriveKek(passcode: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(normalize(passcode)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Create a brand-new data key and wrap it with the passcode. */
export async function createDataKey(passcode: string, iterations = PBKDF2_ITERATIONS): Promise<{ dek: CryptoKey; wrapped: WrappedKey }> {
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const wrapped = await wrapDataKey(dek, passcode, iterations);
  // Hand back a non-extractable copy so the raw key bytes can never leave WebCrypto.
  return { dek: await unwrapDataKey(wrapped, passcode, false), wrapped };
}

export async function wrapDataKey(dek: CryptoKey, passcode: string, iterations = PBKDF2_ITERATIONS): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKek(passcode, salt, iterations);
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv }));
  return { salt, iterations, iv, wrapped };
}

export class WrongPasscodeError extends Error {
  constructor() {
    super("Wrong passcode");
    this.name = "WrongPasscodeError";
  }
}

/**
 * Unwrap the data key. `extractable` is false for normal use; it is only true
 * briefly while re-wrapping the key during a passcode change.
 */
export async function unwrapDataKey(w: WrappedKey, passcode: string, extractable = false): Promise<CryptoKey> {
  const kek = await deriveKek(passcode, w.salt, w.iterations);
  try {
    return await crypto.subtle.unwrapKey(
      "raw", w.wrapped, kek, { name: "AES-GCM", iv: w.iv },
      { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"],
    );
  } catch {
    throw new WrongPasscodeError();
  }
}

/**
 * Encrypt bytes. `context` is bound in as AES-GCM additional data, so a ciphertext
 * copied onto a different record id fails to decrypt instead of silently swapping data.
 */
export async function sealBytes(dek: CryptoKey, data: Uint8Array<ArrayBuffer>, context: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(context) }, dek, data),
  );
  return { iv, ct };
}

export async function openBytes(dek: CryptoKey, sealed: Sealed, context: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv, additionalData: utf8(context) }, dek, sealed.ct),
  );
}

export async function sealJSON(dek: CryptoKey, value: unknown, context: string): Promise<Sealed> {
  return sealBytes(dek, utf8(JSON.stringify(value)), context);
}

export async function openJSON<T>(dek: CryptoKey, sealed: Sealed, context: string): Promise<T> {
  return JSON.parse(fromUtf8(await openBytes(dek, sealed, context))) as T;
}

/** Rough passcode strength check. Returns a message for the user, or null when acceptable. */
export function passcodeProblem(p: string): string | null {
  const s = p.trim();
  if (s.length < 6) return "Use at least 6 characters.";
  if (/^(.)\1+$/.test(s)) return "Avoid repeating one character.";
  const common = ["123456", "1234567", "12345678", "123456789", "654321", "111111", "000000", "123123", "password", "qwerty", "abc123", "112233", "121212"];
  if (common.includes(s.toLowerCase())) return "That passcode is too common. Try something less guessable.";
  const digits = "0123456789012";
  if (/^\d+$/.test(s) && (digits.includes(s) || digits.split("").reverse().join("").includes(s))) {
    return "Avoid number sequences like 123456.";
  }
  return null;
}
