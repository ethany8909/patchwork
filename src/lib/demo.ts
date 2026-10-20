// Sample data so judges, testers, and first-time users can see charts, patterns,
// and a full visit report without logging for weeks. Everything is flagged
// `demo: true` and can be removed in one tap. Sample photos are drawn, not real.

import { addDays, today, uid } from "./date";
import { mulberry32 } from "./insights";
import { processPhoto } from "./image";
import type { DarkMark, Entry, PhotoMeta, PoemRecord, Product, Settings, Treatment } from "./types";
import { SUGGESTED_QUESTIONS } from "../data/options";

const DAYS = 45;

/** POEM answer for a number of days in the week: 0, 1-2, 3-4, 5-6, 7. */
export function poemBucket(days: number): number {
  if (days <= 0) return 0;
  if (days <= 2) return 1;
  if (days <= 4) return 2;
  if (days <= 6) return 3;
  return 4;
}

/** A sample POEM consistent with the sample daily check-ins of the week before `date`. */
function poemFromEntries(entries: Entry[], date: string): number[] {
  const week = entries.filter((e) => e.date > addDays(date, -7) && e.date <= date);
  const days = (pred: (e: Entry) => boolean) => poemBucket(week.filter(pred).length);
  return [
    days((e) => (e.itch ?? 0) >= 2),
    days((e) => (e.sleep ?? 0) > 0),
    days((e) => e.looks.includes("cracks") && (e.itch ?? 0) >= 8),
    days((e) => e.looks.includes("oozing")),
    days((e) => e.looks.includes("cracks")),
    days((e) => e.looks.includes("flaky")),
    days((e) => e.looks.includes("dry") || e.looks.includes("rough")),
  ];
}

/** A drawn (not real) close-up of a healed patch that is darker than the skin around it. */
function drawMarkPhoto(level: number, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 675;
  const g = c.getContext("2d")!;
  const rand = mulberry32(seed);
  g.fillStyle = "#8a5c43";
  g.fillRect(0, 0, 900, 675);
  g.strokeStyle = "rgba(60,35,25,0.15)";
  for (let i = 0; i < 60; i++) {
    const y = rand() * 675;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(300, y + (rand() - 0.5) * 50, 600, y + (rand() - 0.5) * 50, 900, y);
    g.stroke();
  }
  const patch = g.createRadialGradient(450, 340, 20, 450, 340, 190);
  patch.addColorStop(0, `rgba(55,32,24,${0.18 + level * 0.17})`);
  patch.addColorStop(1, "rgba(55,32,24,0)");
  g.fillStyle = patch;
  g.beginPath();
  g.ellipse(450, 340, 230, 170, 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(24, 24, 250, 54);
  g.fillStyle = "#fff";
  g.font = "600 28px system-ui, sans-serif";
  g.fillText("SAMPLE PHOTO", 44, 62);
  return c;
}

function drawSamplePhoto(severity: number, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 675;
  const g = c.getContext("2d")!;
  const rand = mulberry32(seed);
  // skin background with gentle shading
  const bg = g.createLinearGradient(0, 0, 900, 675);
  bg.addColorStop(0, "#9a6a4f");
  bg.addColorStop(1, "#7d5540");
  g.fillStyle = bg;
  g.fillRect(0, 0, 900, 675);
  // skin-line texture
  g.strokeStyle = "rgba(60,35,25,0.18)";
  g.lineWidth = 1.2;
  for (let i = 0; i < 70; i++) {
    const y = rand() * 675;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(300, y + (rand() - 0.5) * 60, 600, y + (rand() - 0.5) * 60, 900, y + (rand() - 0.5) * 40);
    g.stroke();
  }
  // the patch: darker, grayer and larger when severity is higher
  const r = 110 + severity * 22;
  const patch = g.createRadialGradient(450, 340, 10, 450, 340, r);
  patch.addColorStop(0, `rgba(70,45,52,${0.35 + severity * 0.05})`);
  patch.addColorStop(0.7, `rgba(95,70,72,${0.2 + severity * 0.03})`);
  patch.addColorStop(1, "rgba(95,70,72,0)");
  g.fillStyle = patch;
  g.beginPath();
  g.ellipse(450, 340, r * 1.3, r, -0.2, 0, Math.PI * 2);
  g.fill();
  // scale flecks
  g.fillStyle = "rgba(210,205,200,0.55)";
  for (let i = 0; i < severity * 40; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r * 0.9;
    g.fillRect(450 + Math.cos(a) * d * 1.3, 340 + Math.sin(a) * d, 2 + rand() * 4, 1 + rand() * 2);
  }
  // label so a sample can never be mistaken for a real photo
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(24, 24, 250, 54);
  g.fillStyle = "#fff";
  g.font = "600 28px system-ui, sans-serif";
  g.fillText("SAMPLE PHOTO", 44, 62);
  return c;
}

export async function buildSampleData(): Promise<{
  entries: Entry[];
  treatments: Treatment[];
  photos: { meta: PhotoMeta; full: Uint8Array<ArrayBuffer>; thumb: Uint8Array<ArrayBuffer> }[];
  poems: PoemRecord[];
  marks: DarkMark[];
  products: Product[];
  settings: Partial<Settings>;
}> {
  const rand = mulberry32(2026);
  const now = Date.now();
  const start = addDays(today(), -DAYS);

  const moisturizer: Treatment = {
    id: uid(), name: "Fragrance-free moisturizer", kind: "moisturizer", times: ["08:00", "21:00"],
    remind: false, active: true, createdAt: now - 3, demo: true,
  };
  const ointment: Treatment = {
    id: uid(), name: "Prescription ointment", kind: "topical", times: ["21:00"],
    remind: false, active: true, createdAt: now - 2, demo: true,
  };

  const entries: Entry[] = [];
  let stressedYesterday = false;
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i);
    const logged = rand() < 0.86;
    const sweat = rand() < 0.3;
    const stress = i >= 30 && i <= 34 ? rand() < 0.8 : rand() < 0.1;
    const newProduct = i === 17;
    const flare = i >= 18 && i <= 26 ? Math.round(4 * Math.sin(((i - 17) / 10) * Math.PI)) : 0;
    let itch = 2 + rand() * 1.6 + (sweat ? 2.2 : 0) + (stressedYesterday ? 2 : 0) + flare;
    itch = Math.max(0, Math.min(10, Math.round(itch)));
    stressedYesterday = stress;
    if (!logged) continue;

    const triggers = [
      ...(sweat ? ["sweat"] : []),
      ...(stress ? ["stress"] : []),
      ...(newProduct ? ["new-product"] : []),
      ...(rand() < 0.15 ? ["cold-dry"] : []),
    ];
    const areas = [
      "inner-elbows",
      ...(rand() < 0.6 || flare > 1 ? ["behind-knees"] : []),
      ...(flare > 2 ? ["neck"] : []),
      ...(rand() < 0.3 ? ["hands"] : []),
    ];
    const looks = [
      "dry",
      ...(rand() < 0.5 ? ["rough"] : []),
      ...(itch >= 4 && rand() < 0.7 ? ["flaky"] : []),
      ...(itch >= 5 ? ["darker"] : []),
      ...(itch >= 7 ? ["purple"] : []),
      ...(itch >= 8 ? ["oozing"] : []),
      ...(itch >= 6 && rand() < 0.5 ? ["cracks"] : []),
    ];
    const tr = [
      ...(rand() < 0.8 ? [moisturizer.id] : []),
      ...(flare > 0 || itch >= 7 ? [ointment.id] : []),
    ];
    const notes: Record<number, string> = {
      9: "Two soccer practices back to back, really sweaty.",
      17: "Switched to a new laundry detergent.",
      21: "Worst it's been in months. Scratched in my sleep.",
      31: "Exam week.",
    };
    entries.push({
      id: uid(), date, itch, sleep: itch >= 8 ? 3 : itch >= 7 ? 2 : itch >= 5 ? 1 : 0,
      areas, looks, triggers, treatments: tr, note: notes[i] ?? "", photoIds: [],
      createdAt: now, updatedAt: now, demo: true,
    });
  }

  const photos = [];
  for (const [i, severity] of [[4, 2], [21, 8], [27, 5], [DAYS - 1, 2]] as const) {
    const processed = await processPhoto(drawSamplePhoto(severity, i + 1));
    photos.push({
      meta: {
        id: uid(), date: addDays(start, i), area: "inner-elbows",
        width: processed.width, height: processed.height, light: processed.lighting?.mean, createdAt: now + i, demo: true,
      },
      full: processed.full,
      thumb: processed.thumb,
    });
  }

  // Weekly POEM scores, derived from the sample check-ins so the two agree.
  const poems: PoemRecord[] = [6, 13, 20, 27, 34, 41].map((i) => {
    const date = addDays(start, i);
    return { id: uid(), date, answers: poemFromEntries(entries, date), createdAt: now + i, demo: true };
  });

  // Two marks left by the mid-sample flare: one fading, one due for a new rating.
  const elbowId = uid();
  const elbowUpdates = [[28, 3], [35, 3], [42, 2]] as const;
  const elbowPhotos: string[] = [];
  for (const [i, level] of [[28, 3], [42, 2]] as const) {
    const processed = await processPhoto(drawMarkPhoto(level, 100 + i));
    const id = uid();
    elbowPhotos.push(id);
    photos.push({
      meta: {
        id, date: addDays(start, i), area: "inner-elbows", width: processed.width, height: processed.height,
        light: processed.lighting?.mean, markId: elbowId, createdAt: now + 100 + i, demo: true,
      },
      full: processed.full,
      thumb: processed.thumb,
    });
  }
  const marks: DarkMark[] = [
    {
      id: elbowId, area: "inner-elbows", kind: "darker", label: "Right inner elbow", resolved: false,
      updates: elbowUpdates.map(([i, level]) => ({
        date: addDays(start, i), level,
        photoId: i === 28 ? elbowPhotos[0] : i === 42 ? elbowPhotos[1] : null,
      })),
      createdAt: now + 200, updatedAt: now + 200, demo: true,
    },
    {
      id: uid(), area: "neck", kind: "lighter", label: "", resolved: false,
      updates: [{ date: addDays(start, 24), level: 2, photoId: null }, { date: addDays(start, 27), level: 1, photoId: null }],
      createdAt: now + 201, updatedAt: now + 201, demo: true,
    },
  ];

  // Two checked labels: a typical scented body wash, and a plain fragrance-free cream.
  const products: Product[] = [
    {
      id: uid(), name: "Sample: scented body wash", createdAt: now - 1000, demo: true,
      text: "Ingredients: Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance (Parfum), Glycerin, Citric Acid, Methylisothiazolinone, Methylchloroisothiazolinone, Limonene, Linalool, CI 42090.",
    },
    {
      id: uid(), name: "Sample: fragrance-free cream", createdAt: now - 2000, demo: true,
      text: "Ingredients: Water, Petrolatum, Glycerin, Cetearyl Alcohol, Ceramide NP, Dimethicone, Methylparaben, Propylparaben, Phenoxyethanol, Citric Acid.",
    },
  ];

  return {
    entries,
    treatments: [moisturizer, ointment],
    photos,
    poems,
    marks,
    products,
    settings: {
      appointment: addDays(today(), 5),
      questions: SUGGESTED_QUESTIONS.slice(0, 3).map((text) => ({ id: uid(), text })),
      reportPhotoIds: [photos[1].meta.id, photos[3].meta.id],
      clinicianToneNote: true,
    },
  };
}
