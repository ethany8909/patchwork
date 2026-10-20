import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Content Security Policy for production. Scripts come only from our own origin, with no
 * inline scripts. 'wasm-unsafe-eval' lets the on-device label reader (WebAssembly) run; it
 * does not allow eval(). The only outside connections are Open-Meteo's weather and city
 * search, used only after the user picks a city. (frame-ancestors and other header-only
 * directives are also sent as HTTP headers by server/index.mjs.)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

function securityHeadersMeta(): Plugin {
  return {
    name: "patchwork-csp",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    ],
  };
}

/** Builds public sw.js from the template, listing every emitted file for offline use. */
function serviceWorker(): Plugin {
  return {
    name: "patchwork-sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      const statics = [
        "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
        "/icons/badge-72.png", "/icons/favicon.svg", "/icons/apple-touch-icon.png",
      ];
      const precache = [...new Set(["/index.html", ...files.map((f) => `/${f}`), ...statics])];
      const version = createHash("sha256").update(precache.join("|")).digest("hex").slice(0, 12);
      const source = readFileSync("src/sw.template.js", "utf8")
        .replaceAll('"__VERSION__"', JSON.stringify(version))
        .replaceAll("__PRECACHE__", JSON.stringify(precache));
      if (source.includes("__VERSION__") || source.includes("__PRECACHE__")) throw new Error("sw.js placeholders not replaced");
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [preact(), securityHeadersMeta(), serviceWorker()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
  server: {
    // In development, forward API calls to the Node server (npm start).
    proxy: { "/api": "http://localhost:8787" },
  },
});
