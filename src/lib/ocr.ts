// Reads the text of an ingredient label from a photo, entirely on this device.
//
// Uses tesseract.js (open-source OCR compiled to WebAssembly). Its files are served from
// this app's own /ocr/ folder (copied there by scripts/copy-ocr.mjs), so nothing is
// fetched from other sites and the photo never leaves the phone. The photo isn't saved;
// only text the user chooses to keep is stored, encrypted, with their journal.

import type { Worker } from "tesseract.js";
import { decodeImage, sizeOf } from "./image";

export interface OcrProgress {
  stage: "loading" | "reading";
  /** 0-1 */
  progress: number;
}

let workerPromise: Promise<Worker> | null = null;
let listener: ((p: OcrProgress) => void) | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      return createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        workerBlobURL: false, // a blob: worker would be blocked by the Content Security Policy
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          listener?.({ stage: m.status === "recognizing text" ? "reading" : "loading", progress: m.progress });
        },
      });
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

/** Free the reader's memory once it hasn't been used for a minute. */
function scheduleShutdown() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const w = workerPromise;
    workerPromise = null;
    void w?.then((x) => x.terminate()).catch(() => {});
  }, 60_000);
}

/**
 * Grayscale, stretch the contrast, and size the photo so small print is big enough to
 * read (long side 1600-2400 px).
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const src = await decodeImage(file);
  const [w, h] = sizeOf(src);
  const long = Math.max(w, h);
  const scale = Math.min(2400 / long, Math.max(1, 1600 / long));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src instanceof ImageBitmap) src.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const luma = new Uint8ClampedArray(px.length / 4);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    luma[j] = y;
    hist[luma[j]]++;
  }
  // Stretch so the darkest 1% become black and the brightest 1% white.
  const cut = luma.length * 0.01;
  let lo = 0;
  for (let n = 0; lo < 255 && n + hist[lo] < cut; lo++) n += hist[lo];
  let hi = 255;
  for (let n = 0; hi > 0 && n + hist[hi] < cut; hi--) n += hist[hi];
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((luma[j] - lo) * 255) / range;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function readLabel(file: Blob, onProgress: (p: OcrProgress) => void): Promise<string> {
  clearTimeout(idleTimer);
  listener = onProgress;
  try {
    onProgress({ stage: "loading", progress: 0 });
    const [canvas, worker] = await Promise.all([prepare(file), getWorker()]);
    const { data } = await worker.recognize(canvas);
    return data.text.trim();
  } finally {
    listener = null;
    scheduleShutdown();
  }
}
