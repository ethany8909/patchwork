import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
// @ts-expect-error - plain ESM server module without type declarations
import { createApp, dueReminders, localParts, rateLimiter, validateSubscribe } from "../server/index.mjs";
// @ts-expect-error - web-push's own encryption library, used here to play the part of the phone
import ece from "http_ece";

const P256DH = "B" + "A".repeat(86); // 87 base64url chars, the size of a real p256dh key
const AUTH = "A".repeat(22);
const sub = (endpoint = "https://fcm.googleapis.com/fcm/send/abc") => ({ endpoint, keys: { p256dh: P256DH, auth: AUTH } });

describe("reminder scheduling", () => {
  it("uses the subscriber's own time zone", () => {
    const now = new Date("2026-09-23T03:00:00Z"); // 8:00 PM Sep 22 in Los Angeles (PDT)
    expect(localParts(now, "America/Los_Angeles")).toEqual({ date: "2026-09-22", time: "20:00" });
    expect(localParts(now, "Asia/Kolkata")).toEqual({ date: "2026-09-23", time: "08:30" });
  });

  it("fires each slot once per day", () => {
    const s = { timezone: "America/Los_Angeles", reminders: [{ time: "20:00", kind: "checkin" }, { time: "08:00", kind: "treatment" }], sent: {} as Record<string, boolean> };
    const now = new Date("2026-09-23T03:00:30Z");
    const due = dueReminders(s, now);
    expect(due.map((d: { kind: string }) => d.kind)).toEqual(["checkin"]);
    s.sent[due[0].key] = true;
    expect(dueReminders(s, now)).toEqual([]);
  });
});

describe("push encryption", () => {
  it("sends standard encrypted Web Push that only the subscriber can read", () => {
    // Act as the phone: a P-256 key pair and auth secret, exactly what a browser generates.
    const phone = createECDH("prime256v1");
    phone.generateKeys();
    const auth = randomBytes(16);
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/example",
      keys: { p256dh: phone.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    };
    const vapid = webpush.generateVAPIDKeys();
    const req = webpush.generateRequestDetails(subscription, JSON.stringify({ kind: "checkin" }), {
      vapidDetails: { subject: "mailto:test@example.com", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 3600,
    });
    expect(req.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(req.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(Buffer.from(req.body as Buffer).toString("latin1")).not.toContain("checkin"); // encrypted in transit
    const plain = ece.decrypt(req.body, { version: "aes128gcm", privateKey: phone, authSecret: auth.toString("base64url") });
    expect(plain.toString()).toBe('{"kind":"checkin"}');
  });
});

describe("input validation", () => {
  const ok = { subscription: sub(), timezone: "America/Los_Angeles", reminders: [{ time: "20:00", kind: "checkin" }] };
  it("accepts a well-formed subscription", () => expect(validateSubscribe(ok)).toBeNull());
  it.each([
    ["http endpoint", { ...ok, subscription: sub("http://evil.example/x") }],
    ["bad time zone", { ...ok, timezone: "Mars/Olympus" }],
    ["bad time", { ...ok, reminders: [{ time: "25:00", kind: "checkin" }] }],
    ["unknown kind", { ...ok, reminders: [{ time: "20:00", kind: "medication-name" }] }],
    ["too many reminders", { ...ok, reminders: Array(13).fill({ time: "20:00", kind: "checkin" }) }],
    ["missing keys", { ...ok, subscription: { endpoint: "https://x.example/1" } }],
  ])("rejects %s", (_, body) => expect(validateSubscribe(body)).not.toBeNull());

  it("rate limiter blocks after the limit, per key", () => {
    const allow = rateLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => allow("a", 0))).toEqual([true, true, true, false]);
    expect(allow("b", 0)).toBe(true);
    expect(allow("a", 2000)).toBe(true); // new window
  });
});

describe("HTTP API", () => {
  let base = "";
  let app: Awaited<ReturnType<typeof createApp>>;
  let dataDir = "";
  const sent: { endpoint: string; payload: string }[] = [];
  const APP_JS = "console.log('patchwork');\n".repeat(200);

  beforeAll(async () => {
    const root = await mkdtemp(path.join(tmpdir(), "patchwork-"));
    dataDir = path.join(root, "data");
    const distDir = path.join(root, "dist");
    await mkdir(path.join(distDir, "assets"), { recursive: true });
    await writeFile(path.join(distDir, "index.html"), "<!doctype html><title>t</title>");
    await writeFile(path.join(distDir, "assets", "app.js"), APP_JS);
    await writeFile(path.join(root, "secret.txt"), "do not serve");
    app = await createApp({
      dataDir, distDir, adminToken: "admin-secret",
      sendPush: async (s: { endpoint: string }, payload: string) => { sent.push({ endpoint: s.endpoint, payload }); },
      log: { warn() {}, error() {} },
    });
    await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => app.server.close(() => r())));

  const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("serves the app with security headers", async () => {
    const r = await fetch(base + "/");
    expect(r.status).toBe(200);
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    // Scripts only from this site (WebAssembly allowed for the on-device label reader, but not eval),
    // and the only outside connections are Open-Meteo's weather and city search.
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com;");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("gzips text files for browsers that accept it", async () => {
    const gz = await fetch(base + "/assets/app.js", { headers: { "accept-encoding": "gzip" } });
    expect(gz.headers.get("content-encoding")).toBe("gzip");
    expect(gz.headers.get("vary")).toBe("Accept-Encoding");
    expect(gz.headers.get("cache-control")).toContain("immutable");
    expect(Number(gz.headers.get("content-length"))).toBeLessThan(APP_JS.length / 10);
    expect(await gz.text()).toBe(APP_JS); // fetch un-gzips it, as a browser would
    const plain = await fetch(base + "/assets/app.js", { headers: { "accept-encoding": "identity" } });
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(await plain.text()).toBe(APP_JS);
  });

  it("refuses path traversal", async () => {
    const r = await fetch(base + "/%2e%2e/secret.txt");
    expect([403, 404]).toContain(r.status);
    expect(await r.text()).not.toContain("do not serve");
  });

  it("publishes the VAPID public key", async () => {
    const r = await (await fetch(base + "/api/push/vapid-public-key")).json();
    expect(r.publicKey).toBe(app.publicKey);
  });

  it("subscribes, sends a test push, and stores no health data", async () => {
    const s = sub("https://fcm.googleapis.com/fcm/send/device-1");
    expect((await post("/api/push/subscribe", { subscription: s, timezone: "America/Los_Angeles", reminders: [{ time: "20:00", kind: "checkin" }] })).status).toBe(200);
    expect((await post("/api/push/test", { endpoint: s.endpoint, auth: AUTH })).status).toBe(200);
    expect(sent.at(-1)).toEqual({ endpoint: s.endpoint, payload: JSON.stringify({ kind: "test" }) });
    const stored = JSON.parse(await readFile(path.join(dataDir, "subscriptions.json"), "utf8"));
    expect(Object.keys(stored[0]).sort()).toEqual(["createdAt", "endpoint", "keys", "reminders", "sent", "timezone", "updatedAt"]);
  });

  it("sends due reminders exactly once", async () => {
    const before = sent.length;
    await app.tick(new Date("2026-09-23T03:00:05Z"));
    await app.tick(new Date("2026-09-23T03:00:25Z"));
    expect(sent.length - before).toBe(1);
    expect(sent.at(-1)?.payload).toBe(JSON.stringify({ kind: "checkin" }));
  });

  it("won't unsubscribe someone else without their secret", async () => {
    const r = await post("/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", auth: "wrong".padEnd(22, "x") });
    expect(r.status).toBe(404);
    expect(app.subs.size).toBe(1);
    expect((await post("/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", auth: AUTH })).status).toBe(200);
    expect(app.subs.size).toBe(0);
  });

  it("rejects cross-origin POSTs and bad JSON", async () => {
    expect((await post("/api/feedback", { type: "bug", message: "x" }, { origin: "https://evil.example" })).status).toBe(403);
    const r = await fetch(base + "/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    expect(r.status).toBe(400);
  });

  it("stores feedback and only shows it to the admin", async () => {
    expect((await post("/api/feedback", { type: "idea", message: "Dark mode report?", contact: "" })).status).toBe(200);
    expect((await post("/api/feedback", { type: "idea", message: "" })).status).toBe(400);
    expect((await fetch(base + "/api/feedback")).status).toBe(401);
    const r = await fetch(base + "/api/feedback", { headers: { authorization: "Bearer admin-secret" } });
    const { feedback } = await r.json();
    expect(feedback[0].message).toBe("Dark mode report?");
  });

  it("rate-limits feedback", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await post("/api/feedback", { type: "bug", message: `m${i}` })).status);
    expect(codes).toContain(429);
  });
});
