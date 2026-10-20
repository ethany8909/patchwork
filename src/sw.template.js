/* Patchwork service worker.
 * Generated at build time from src/sw.template.js by the plugin in vite.config.ts,
 * which fills in the build hash and the list of built files below.
 *
 * - Precaches the app so it opens instantly and works offline.
 * - Never caches /api/ requests.
 * - Shows reminder notifications from push messages. The payload only says which
 *   kind of reminder it is; the text is generic so nothing private appears on a
 *   lock screen.
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `patchwork-${VERSION}`;

const MESSAGES = {
  checkin: { body: "Time for a quick check-in. It takes about 20 seconds.", url: "/#/checkin" },
  treatment: { body: "Treatment reminder.", url: "/#/today" },
  test: { body: "Notifications are working. Reminders will look like this.", url: "/#/settings/reminders" },
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("patchwork-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // Network first so updates arrive, but never make the user wait more than 2.5s.
    event.respondWith(
      Promise.race([fetch(req), timeout(2500)])
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Built assets have content hashes in their names, so cache-first is always safe.
  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        // /ocr/ is the label reader (several MB): cached the first time it's used, so it then works offline.
        if (res.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/ocr/"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let kind = "checkin";
  try {
    kind = (event.data && event.data.json().kind) || "checkin";
  } catch {
    /* empty or non-JSON payload: treat as a check-in reminder */
  }
  const m = MESSAGES[kind] || MESSAGES.checkin;
  event.waitUntil(
    self.registration.showNotification("Patchwork", {
      body: m.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: `patchwork-${kind}`,
      data: { url: m.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/#/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
