// What kind of device Patchwork is running on, and whether it was opened from the home screen.

/** iPhone and iPad (iPadOS says it's a Mac, but one with a touch screen). */
export const isAppleMobile = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

/** Opened as an installed app (home screen) rather than in a browser tab. */
export const isInstalled = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
