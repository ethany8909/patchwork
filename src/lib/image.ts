// Photo processing. Re-drawing every photo onto a canvas and re-encoding it does
// two jobs: it shrinks the file, and it throws away all EXIF metadata, including
// the GPS coordinates phones embed in photos.

import { fromBase64 } from "./bytes";
import { assessLighting, type LightingReport } from "./photoQuality";

const FULL_MAX = 1600;
const THUMB_MAX = 360;

export interface ProcessedPhoto {
  full: Uint8Array<ArrayBuffer>;
  thumb: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  lighting: LightingReport | null;
}

/** Sample the photo at 64 px wide and check its lighting (see photoQuality.ts). */
function measureLighting(src: Drawable, previousMean?: number): LightingReport | null {
  try {
    const [sw, sh] = sizeOf(src);
    const w = 64;
    const h = Math.max(1, Math.round((sh / sw) * w));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h);
    return assessLighting(ctx.getImageData(0, 0, w, h).data, previousMean);
  } catch {
    return null; // lighting advice is a nicety; never block saving a photo on it
  }
}

export type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export function sizeOf(src: Drawable): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

async function encode(src: Drawable, max: number, quality: number): Promise<{ bytes: Uint8Array<ArrayBuffer>; w: number; h: number }> {
  const [sw, sh] = sizeOf(src);
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(src, 0, 0, w, h);
  return { bytes: await toJpeg(canvas, quality), w, h };
}

/**
 * canvas.toBlob runs during browser idle time, which some browsers postpone
 * indefinitely in background tabs. If it hasn't finished in 2 seconds, fall back to
 * the synchronous toDataURL so saving a photo can never hang.
 */
async function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array<ArrayBuffer>> {
  const viaBlob = new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), 2000));
  const blob = await Promise.race([viaBlob, timeout]);
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
  if (!b64) throw new Error("Could not encode photo");
  return fromBase64(b64);
}

/** Decode a photo file, applying its rotation so it isn't sideways. */
export async function decodeImage(file: Blob): Promise<Drawable> {
  if ("createImageBitmap" in window) {
    try {
      // Applies the EXIF rotation, so photos aren't sideways after metadata is stripped.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall back to <img> below (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processPhoto(source: Blob | HTMLCanvasElement | HTMLVideoElement, previousMean?: number): Promise<ProcessedPhoto> {
  const drawable = source instanceof Blob ? await decodeImage(source) : source;
  const lighting = measureLighting(drawable, previousMean);
  const full = await encode(drawable, FULL_MAX, 0.85);
  const thumb = await encode(drawable, THUMB_MAX, 0.75);
  if (drawable instanceof ImageBitmap) drawable.close();
  return { full: full.bytes, thumb: thumb.bytes, width: full.w, height: full.h, lighting };
}
