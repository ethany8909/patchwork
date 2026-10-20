import { describe, expect, it } from "vitest";
import { hotp, totpAt, verifyTotp, newSecret, newRecoveryCodes, hashRecoveryCode, otpauthUri } from "../src/lib/totp";
import { toBase32, utf8 } from "../src/lib/bytes";

// RFC 6238 Appendix B, SHA-1, 8 digits, secret = ASCII "12345678901234567890"
const RFC_SECRET = toBase32(utf8("12345678901234567890"));
const VECTORS: [number, string][] = [
  [59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"],
  [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(VECTORS)("t=%i -> %s", async (t, code) => {
    expect(await totpAt(RFC_SECRET, t, 8)).toBe(code);
  });

  it("HOTP matches RFC 4226 vectors", async () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    for (let i = 0; i < expected.length; i++) {
      expect(await hotp(utf8("12345678901234567890"), i)).toBe(expected[i]);
    }
  });

  it("accepts the current code and one step of drift", async () => {
    const s = newSecret();
    const now = 1_800_000_000;
    expect(await verifyTotp(s, await totpAt(s, now), now)).not.toBeNull();
    expect(await verifyTotp(s, await totpAt(s, now - 30), now)).not.toBeNull();
    expect(await verifyTotp(s, await totpAt(s, now + 30), now)).not.toBeNull();
    expect(await verifyTotp(s, await totpAt(s, now - 90), now)).toBeNull();
  });

  it("blocks replay of an already-used code", async () => {
    const s = newSecret();
    const now = 1_800_000_000;
    const code = await totpAt(s, now);
    const used = await verifyTotp(s, code, now);
    expect(used).not.toBeNull();
    expect(await verifyTotp(s, code, now, used!)).toBeNull();
  });

  it("rejects malformed codes", async () => {
    const s = newSecret();
    for (const bad of ["", "12345", "1234567", "abcdef"]) expect(await verifyTotp(s, bad)).toBeNull();
  });

  it("builds an authenticator URI", () => {
    expect(otpauthUri("ABC", "me")).toBe("otpauth://totp/Patchwork%3Ame?secret=ABC&issuer=Patchwork&algorithm=SHA1&digits=6&period=30");
  });
});

describe("recovery codes", () => {
  it("are unique, readable, and hash identically regardless of formatting", async () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(await hashRecoveryCode(codes[0])).toBe(await hashRecoveryCode(codes[0].toLowerCase().replace("-", " ")));
  });
});
