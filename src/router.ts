// Hash-based routing: works on any static host with no server rewrites,
// and the back button behaves as users expect.

import { signal } from "@preact/signals";

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/today";
  const [path, q = ""] = raw.split("?");
  return { path, parts: path.split("/").filter(Boolean), query: new URLSearchParams(q) };
}

export const route = signal<Route>(parse(typeof location !== "undefined" ? location.hash : ""));

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    route.value = parse(location.hash);
    window.scrollTo(0, 0);
  });
}

// How many in-app screens deep we are, so "Back" never leaves the app
// (history.length also counts pages from before the app was opened).
let depth = 0;

export function go(path: string, opts: { replace?: boolean } = {}) {
  if (location.hash === `#${path}`) return;
  if (opts.replace) {
    location.replace(`#${path}`);
  } else {
    depth++;
    location.hash = path;
  }
}

export function back(fallback = "/today") {
  if (depth > 0) {
    depth--;
    history.back();
  } else {
    go(fallback, { replace: true });
  }
}
