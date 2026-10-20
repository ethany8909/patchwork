import { describe, expect, it } from "vitest";
import {
  createDataKey, openBytes, openJSON, passcodeProblem, sealBytes, sealJSON,
  unwrapDataKey, wrapDataKey, WrongPasscodeError,
} from "../src/lib/crypto";
import { fromBase32, fromBase64, toBase32, toBase64, utf8 } from "../src/lib/bytes";

const FAST = 1000; // PBKDF2 iterations for tests only

describe("encryption", () => {
  it("round-trips JSON with the data key", async () => {
    const { dek } = await createDataKey("correct horse", FAST);
    const sealed = await sealJSON(dek, { itch: 7, areas: ["elbows"] }, "entry:1");
    expect(await openJSON(dek, sealed, "entry:1")).toEqual({ itch: 7, areas: ["elbows"] });
  });

  it("ciphertext does not contain the plaintext", async () => {
    const { dek } = await createDataKey("correct horse", FAST);
    const sealed = await sealJSON(dek, { note: "very private note" }, "entry:1");
    expect(new TextDecoder().decode(sealed.ct)).not.toContain("private");
  });

  it("uses a fresh IV every time", async () => {
    const { dek } = await createDataKey("correct horse", FAST);
    const a = await sealBytes(dek, utf8("same"), "x");
    const b = await sealBytes(dek, utf8("same"), "x");
    expect(toBase64(a.iv)).not.toBe(toBase64(b.iv));
    expect(toBase64(a.ct)).not.toBe(toBase64(b.ct));
  });

  it("refuses a ciphertext moved to a different record id", async () => {
    const { dek } = await createDataKey("correct horse", FAST);
    const sealed = await sealBytes(dek, utf8("hello"), "entry:A");
    await expect(openBytes(dek, sealed, "entry:B")).rejects.toThrow();
  });

  it("detects tampering", async () => {
    const { dek } = await createDataKey("correct horse", FAST);
    const sealed = await sealBytes(dek, utf8("hello"), "x");
    sealed.ct[0] ^= 1;
    await expect(openBytes(dek, sealed, "x")).rejects.toThrow();
  });

  it("rejects a wrong passcode", async () => {
    const { wrapped } = await createDataKey("correct horse", FAST);
    await expect(unwrapDataKey(wrapped, "wrong horse")).rejects.toBeInstanceOf(WrongPasscodeError);
  });

  it("re-wrapping for a new passcode keeps old data readable", async () => {
    const { wrapped } = await createDataKey("old-passcode", FAST);
    const dek = await unwrapDataKey(wrapped, "old-passcode", true);
    const sealed = await sealJSON(dek, { a: 1 }, "k");
    const rewrapped = await wrapDataKey(dek, "new-passcode", FAST);
    const dek2 = await unwrapDataKey(rewrapped, "new-passcode");
    expect(await openJSON(dek2, sealed, "k")).toEqual({ a: 1 });
    await expect(unwrapDataKey(rewrapped, "old-passcode")).rejects.toBeInstanceOf(WrongPasscodeError);
  });

  it("the everyday data key is not extractable", async () => {
    const { dek } = await createDataKey("correct horse", FAST);
    expect(dek.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", dek)).rejects.toThrow();
  });

  it("normalizes unicode so the same passcode always unlocks", async () => {
    const { wrapped } = await createDataKey("café-2026", FAST);       // precomposed é
    await expect(unwrapDataKey(wrapped, "café-2026")).resolves.toBeTruthy(); // e + combining accent
  });
});

describe("passcode rules", () => {
  it.each(["12345", "111111", "123456", "654321", "password", "345678"])("rejects %s", (p) => {
    expect(passcodeProblem(p)).not.toBeNull();
  });
  it.each(["482915", "maple-river-7", "9 lanterns"])("accepts %s", (p) => {
    expect(passcodeProblem(p)).toBeNull();
  });
});

describe("encodings", () => {
  it("base64 round-trips binary", () => {
    const b = new Uint8Array(70000).map((_, i) => i % 256);
    expect(fromBase64(toBase64(b))).toEqual(b);
  });
  it("base32 matches RFC 4648 vectors", () => {
    expect(toBase32(utf8("foobar"))).toBe("MZXW6YTBOI");
    expect(new TextDecoder().decode(fromBase32("MZXW6YTBOI"))).toBe("foobar");
    expect(toBase32(utf8("f"))).toBe("MY");
  });
});
