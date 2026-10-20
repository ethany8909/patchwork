// Patchwork server: serves the built app, sends reminder pushes, and collects feedback.
//
// Privacy by design: this server never receives journal data. For reminders it stores
// only a push-subscription address, a time zone, and times of day. Push payloads say
// only which kind of reminder to show ("checkin" / "treatment").
//
// Built on Node's own http module (no web framework) to keep dependencies minimal.

import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";

const gzipAsync = promisify(gzip);

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self'", "img-src 'self' blob: data:",
  "media-src 'self' blob:", "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com",
  "font-src 'self'", "worker-src 'self'",
  "manifest-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

/** Text files worth gzipping. Images are already compressed. */
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt"]);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS = new Set(["checkin", "treatment"]);
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

// ---------- pure helpers (exported for tests) ----------

export function validTimezone(tz) {
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateSubscribe(body) {
  const sub = body?.subscription;
  if (!sub || typeof sub.endpoint !== "string" || sub.endpoint.length > 1024) return "Invalid subscription.";
  let u;
  try {
    u = new URL(sub.endpoint);
  } catch {
    return "Invalid subscription endpoint.";
  }
  if (u.protocol !== "https:") return "Push endpoint must use https.";
  const { p256dh, auth } = sub.keys ?? {};
  if (typeof p256dh !== "string" || !B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return "Invalid subscription keys.";
  if (typeof auth !== "string" || !B64URL.test(auth) || auth.length < 16 || auth.length > 32) return "Invalid subscription keys.";
  if (!validTimezone(body.timezone)) return "Invalid time zone.";
  if (!Array.isArray(body.reminders) || body.reminders.length > 12) return "Invalid reminders.";
  for (const r of body.reminders) {
    if (!r || typeof r.time !== "string" || !TIME_RE.test(r.time) || !KINDS.has(r.kind)) return "Invalid reminder.";
  }
  return null;
}

/** Local date and HH:MM for a time zone. */
export function localParts(now, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Reminders due for a subscription right now that haven't been sent yet today. */
export function dueReminders(sub, now) {
  const { date, time } = localParts(now, sub.timezone);
  return sub.reminders
    .filter((r) => r.time === time)
    .map((r) => ({ ...r, key: `${date}|${r.time}|${r.kind}` }))
    .filter((r) => !sub.sent?.[r.key]);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Fixed-window rate limiter keyed by client + route. */
export function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) {
      hits.set(key, { start: now, n: 1 });
      if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
      return true;
    }
    h.n++;
    return h.n <= limit;
  };
}

// ---------- server ----------

export async function createApp({
  dataDir = process.env.DATA_DIR ?? path.join(HERE, "data"),
  distDir = path.join(HERE, "..", "dist"),
  adminToken = process.env.ADMIN_TOKEN ?? "",
  vapid = null,
  sendPush = null,
  log = console,
} = {}) {
  await mkdir(dataDir, { recursive: true });
  try {
    await stat(path.join(distDir, "index.html"));
  } catch {
    log.warn(`No built app in ${distDir}. Run "npm run build" before "npm start".`);
  }
  const subsFile = path.join(dataDir, "subscriptions.json");
  const feedbackFile = path.join(dataDir, "feedback.jsonl");

  // VAPID keys identify this server to browser push services.
  let keys = vapid;
  if (!keys && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (!keys) {
    const f = path.join(dataDir, "vapid.json");
    try {
      keys = JSON.parse(await readFile(f, "utf8"));
    } catch {
      keys = webpush.generateVAPIDKeys();
      await writeFile(f, JSON.stringify(keys), { mode: 0o600 });
      log.warn("Generated new VAPID keys in", f, "(set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in production)");
    }
  }
  const subject = process.env.VAPID_SUBJECT ?? "mailto:patchwork@example.com";
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  const push = sendPush ?? ((sub, payload) => webpush.sendNotification(sub, payload, { TTL: 60 * 60 }));

  /** endpoint -> { endpoint, keys, timezone, reminders, sent, createdAt, updatedAt } */
  let subs = new Map();
  try {
    for (const s of JSON.parse(await readFile(subsFile, "utf8"))) subs.set(s.endpoint, s);
  } catch {
    /* first run */
  }
  let saving = Promise.resolve();
  const persist = () => {
    saving = saving.then(async () => {
      const tmp = `${subsFile}.tmp`;
      await writeFile(tmp, JSON.stringify([...subs.values()]), { mode: 0o600 });
      await rename(tmp, subsFile); // atomic replace
    }).catch((e) => log.error("save failed", e));
    return saving;
  };

  async function deliver(sub, kind) {
    try {
      await push({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ kind }));
      return true;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        subs.delete(sub.endpoint); // browser unsubscribed or app uninstalled
        await persist();
      } else {
        log.error("push failed", e?.statusCode ?? e?.message);
      }
      return false;
    }
  }

  async function tick(now = new Date()) {
    let changed = false;
    for (const sub of [...subs.values()]) {
      for (const r of dueReminders(sub, now)) {
        sub.sent = { ...Object.fromEntries(Object.entries(sub.sent ?? {}).filter(([k]) => k.startsWith(r.key.slice(0, 10)))), [r.key]: true };
        changed = true;
        await deliver(sub, r.kind);
      }
    }
    if (changed) await persist();
  }

  const limitApi = rateLimiter(30, 60_000);
  const limitFeedback = rateLimiter(5, 10 * 60_000);
  /** file -> gzipped copy, rebuilt if the file changes */
  const gzipped = new Map();

  function headers(res, extra = {}) {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=()");
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  }

  function json(res, status, body) {
    headers(res, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.writeHead(status);
    res.end(JSON.stringify(body));
  }

  async function readJson(req, max = 16 * 1024) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > max) throw Object.assign(new Error("Too large"), { status: 413 });
      chunks.push(c);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
    } catch {
      throw Object.assign(new Error("Invalid JSON"), { status: 400 });
    }
  }

  const clientIp = (req) =>
    (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()) || req.socket.remoteAddress || "?";

  async function api(req, res, url) {
    const ip = clientIp(req);
    if (req.method === "POST") {
      // Same-origin only: a browser always sends Origin on cross-site POSTs.
      const origin = req.headers.origin;
      let originHost = null;
      try {
        originHost = origin ? new URL(origin).host : null;
      } catch {
        /* "null" or malformed origin: treat as cross-origin */
      }
      if (origin && originHost !== req.headers.host) return json(res, 403, { error: "Cross-origin requests are not allowed." });
      if (!limitApi(`${ip}|api`)) return json(res, 429, { error: "Too many requests." });
    }
    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case "GET /api/health":
        return json(res, 200, { ok: true, subscriptions: subs.size });
      case "GET /api/push/vapid-public-key":
        return json(res, 200, { publicKey: keys.publicKey });
      case "POST /api/push/subscribe": {
        const body = await readJson(req);
        const err = validateSubscribe(body);
        if (err) return json(res, 400, { error: err });
        const { endpoint, keys: k } = body.subscription;
        const prev = subs.get(endpoint);
        const now = Date.now();
        subs.set(endpoint, {
          endpoint, keys: { p256dh: k.p256dh, auth: k.auth }, timezone: body.timezone,
          reminders: body.reminders.map((r) => ({ time: r.time, kind: r.kind })),
          sent: prev?.sent ?? {}, createdAt: prev?.createdAt ?? now, updatedAt: now,
        });
        await persist();
        return json(res, 200, { ok: true });
      }
      case "POST /api/push/unsubscribe":
      case "POST /api/push/test": {
        const body = await readJson(req);
        const sub = subs.get(body?.endpoint);
        // Knowing the endpoint isn't enough: the caller must also hold its secret auth key.
        if (!sub || !safeEqual(sub.keys.auth, body?.auth ?? "")) return json(res, 404, { error: "Not found." });
        if (route.endsWith("unsubscribe")) {
          subs.delete(sub.endpoint);
          await persist();
          return json(res, 200, { ok: true });
        }
        return (await deliver(sub, "test")) ? json(res, 200, { ok: true }) : json(res, 502, { error: "Push service refused the message." });
      }
      case "POST /api/feedback": {
        if (!limitFeedback(`${ip}|feedback`)) return json(res, 429, { error: "Too many messages. Try again later." });
        const b = await readJson(req);
        const type = ["bug", "idea", "other"].includes(b?.type) ? b.type : null;
        const message = typeof b?.message === "string" ? b.message.trim() : "";
        if (!type || !message || message.length > 2000) return json(res, 400, { error: "Please include a message (up to 2000 characters)." });
        const contact = typeof b.contact === "string" ? b.contact.trim().slice(0, 200) : "";
        const device = b.device && typeof b.device === "object"
          ? Object.fromEntries(Object.entries(b.device).slice(0, 10).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 300)]))
          : undefined;
        await appendFile(feedbackFile, JSON.stringify({ at: new Date().toISOString(), type, message, contact, device }) + "\n", { mode: 0o600 });
        return json(res, 200, { ok: true });
      }
      case "GET /api/feedback": {
        const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        if (!adminToken || !safeEqual(token, adminToken)) return json(res, 401, { error: "Unauthorized." });
        let lines = [];
        try {
          lines = (await readFile(feedbackFile, "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
        } catch {
          /* no feedback yet */
        }
        return json(res, 200, { feedback: lines.reverse() });
      }
      default:
        return json(res, 404, { error: "Not found." });
    }
  }

  async function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      headers(res);
      res.writeHead(405);
      return res.end();
    }
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      headers(res);
      res.writeHead(400);
      return res.end();
    }
    if (rel === "/") rel = "/index.html";
    const file = path.resolve(distDir, `.${rel}`);
    // Refuse anything that escapes the build folder (e.g. /../server/data).
    if (!file.startsWith(path.resolve(distDir) + path.sep)) {
      headers(res);
      res.writeHead(403);
      return res.end();
    }
    let st;
    try {
      st = await stat(file);
      if (!st.isFile()) throw new Error("not a file");
    } catch {
      headers(res, { "Content-Type": "text/plain; charset=utf-8" });
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(file);
    const cache = rel.startsWith("/assets/")
      ? "public, max-age=31536000, immutable" // content-hashed file names
      : rel === "/sw.js" || ext === ".html" || ext === ".webmanifest" ? "no-cache" : "public, max-age=86400";
    const base = { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": cache };
    if (COMPRESSIBLE.has(ext)) base.Vary = "Accept-Encoding";
    if (rel === "/sw.js") base["Service-Worker-Allowed"] = "/";

    // Gzip text files (the app's JavaScript shrinks to about a third), compressing each file once.
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
      let hit = gzipped.get(file);
      if (!hit || hit.mtimeMs !== st.mtimeMs) {
        hit = { mtimeMs: st.mtimeMs, body: await gzipAsync(await readFile(file)) };
        gzipped.set(file, hit);
      }
      headers(res, { ...base, "Content-Encoding": "gzip", "Content-Length": String(hit.body.length) });
      res.writeHead(200);
      return res.end(req.method === "HEAD" ? undefined : hit.body);
    }

    headers(res, { ...base, "Content-Length": String(st.size) });
    res.writeHead(200);
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    if (req.headers["x-forwarded-proto"] === "https") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    try {
      if (url.pathname.startsWith("/api/")) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (e) {
      if (!res.headersSent) json(res, e?.status ?? 500, { error: e?.status ? e.message : "Server error." });
      if (!e?.status) log.error(e);
    }
  });

  return { server, tick, subs, persist, publicKey: keys.publicKey };
}

// Start when run directly: `node server/index.mjs`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  const app = await createApp();
  app.server.listen(port, () => console.log(`Patchwork running on http://localhost:${port}`));
  setInterval(() => void app.tick(), 20_000);
  void app.tick();
}
