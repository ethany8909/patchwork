import { render } from "preact";
import { App } from "./app";
import { boot, notify } from "./state";
import "./styles.css";

render(<App />, document.getElementById("app")!);
void boot();

// Safety net: if an action fails somewhere without its own error message, say so
// instead of silently doing nothing.
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  if (e.reason instanceof Error && e.reason.message === "Journal is locked") return; // expected after auto-lock
  notify("Something went wrong. Please try again.", "error");
});

// The service worker makes Patchwork load instantly and work offline, and it
// receives reminder pushes. Only registered in production builds.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("Offline support unavailable:", e));
  });
}
