// Bug reports and ideas. Sent to the Patchwork server if one is running; otherwise
// the user can send it by email instead. Health data is never included.

export interface Feedback {
  type: "bug" | "idea" | "other";
  message: string;
  contact: string;
  includeDevice: boolean;
}

export const APP_VERSION = "1.0.0";

export function deviceInfo(): Record<string, string> {
  return {
    app: APP_VERSION,
    userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height} @${window.devicePixelRatio}x`,
    viewport: `${innerWidth}x${innerHeight}`,
    installed: String(matchMedia("(display-mode: standalone)").matches),
    language: navigator.language,
  };
}

export async function sendFeedback(f: Feedback): Promise<"sent" | "offline"> {
  const body = {
    type: f.type,
    message: f.message.trim().slice(0, 2000),
    contact: f.contact.trim().slice(0, 200),
    device: f.includeDevice ? deviceInfo() : undefined,
  };
  try {
    const r = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) return "sent";
    if (r.status === 429) throw new Error("You've sent a lot of feedback recently. Please try again later.");
    return "offline";
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("You've")) throw e;
    return "offline";
  }
}

/** Email fallback. The address is set at build time (VITE_FEEDBACK_EMAIL). */
export const FEEDBACK_EMAIL: string = import.meta.env.VITE_FEEDBACK_EMAIL ?? "";

export function mailtoLink(f: Feedback): string {
  const subject = `Patchwork ${f.type === "bug" ? "bug report" : f.type === "idea" ? "idea" : "feedback"}`;
  const device = f.includeDevice ? `\n\n---\n${Object.entries(deviceInfo()).map(([k, v]) => `${k}: ${v}`).join("\n")}` : "";
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(f.message + device)}`;
}
