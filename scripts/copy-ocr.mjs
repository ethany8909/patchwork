// Copies the on-device label reader (tesseract.js) into public/ocr/, so the app serves
// it itself instead of loading it from a CDN. Runs automatically before `npm run dev`
// and `npm run build`. public/ocr/ is generated, so it isn't committed.
//
//   public/ocr/worker.min.js        the Web Worker that runs OCR
//   public/ocr/core/*.wasm.js       the OCR engine (the browser loads just one, for its CPU)
//   public/ocr/lang/eng.traineddata.gz   English text model (LSTM, "best_int")

import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = (...p) => path.join(root, "node_modules", ...p);
const out = (...p) => path.join(root, "public", "ocr", ...p);

const files = [
  [nm("tesseract.js", "dist", "worker.min.js"), out("worker.min.js")],
  ...["relaxedsimd-lstm", "simd-lstm", "lstm"].map((v) => [nm("tesseract.js-core", `tesseract-core-${v}.wasm.js`), out("core", `tesseract-core-${v}.wasm.js`)]),
  [nm("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"), out("lang", "eng.traineddata.gz")],
];

let copied = 0;
for (const [from, to] of files) {
  const src = await stat(from);
  const dst = await stat(to).catch(() => null);
  if (dst && dst.size === src.size && dst.mtimeMs >= src.mtimeMs) continue; // already up to date
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  copied++;
}
console.log(`OCR files ready in public/ocr (${copied} updated)`);
