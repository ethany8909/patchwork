import { describe, expect, it } from "vitest";
import webpush from "web-push";
import { madeWithKey } from "../src/lib/notify";

const bytes = (b64url: string) => {
  const b = Buffer.from(b64url, "base64url");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("push subscription keys", () => {
  const server = webpush.generateVAPIDKeys().publicKey;

  it("keeps a subscription made with the server's current key", () => {
    expect(madeWithKey(bytes(server), server)).toBe(true);
  });

  it("detects a subscription made with an old key, so the app resubscribes", () => {
    const old = webpush.generateVAPIDKeys().publicKey;
    expect(madeWithKey(bytes(old), server)).toBe(false);
  });

  it("assumes a match when the browser doesn't report the key", () => {
    expect(madeWithKey(null, server)).toBe(true);
  });
});
