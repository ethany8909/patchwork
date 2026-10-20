// Time-based one-time passwords (RFC 6238), compatible with Google Authenticator,
// Microsoft Authenticator, Authy, 1Password, etc. Implemented directly on WebCrypto.

import { fromBase32, randomBytes, sha256Hex, toBase32 } from "./bytes";

export const PERIOD = 30;
export const DIGITS = 6;

export function newSecret(): string {
  return toBase32(randomBytes(20)); // 160 bits, the RFC 4226 recommendation
}

export function otpauthUri(secretB32: string, account: string): string {
  const label = encodeURIComponent(`Patchwork:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=Patchwork&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

/** HOTP (RFC 4226): HMAC-SHA1 over the counter, then dynamic truncation. */
export async function hotp(secret: Uint8Array<ArrayBuffer>, counter: number, digits = DIGITS): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256); // not >>>, counters can exceed 32 bits
  }
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const counterAt = (unixSeconds: number) => Math.floor(unixSeconds / PERIOD);

export async function totpAt(secretB32: string, unixSeconds: number, digits = DIGITS): Promise<string> {
  return hotp(fromBase32(secretB32), counterAt(unixSeconds), digits);
}

/**
 * Check a code, allowing one step of clock drift either way.
 * Returns the matching counter, or null. Codes at or before `lastUsedCounter`
 * are rejected so an observed code can't be replayed.
 */
export async function verifyTotp(
  secretB32: string,
  code: string,
  nowSeconds = Date.now() / 1000,
  lastUsedCounter = -1,
): Promise<number | null> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = fromBase32(secretB32);
  const now = counterAt(nowSeconds);
  for (const c of [now - 1, now, now + 1]) {
    if (c <= lastUsedCounter) continue;
    if ((await hotp(secret, c)) === clean) return c;
  }
  return null;
}

// Recovery codes: shown once, stored only as SHA-256 hashes.
const RC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

export function newRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const chars = Array.from(b, (x) => RC_ALPHABET[x % RC_ALPHABET.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export const normalizeRecoveryCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryCode = (c: string) => sha256Hex(`patchwork-recovery:${normalizeRecoveryCode(c)}`);
