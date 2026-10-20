import type { TreatmentKind } from "../lib/types";

export interface Option {
  id: string;
  label: string;
  hint?: string;
  /** Selecting this should prompt the user to read the "Get care now" guidance. */
  warn?: boolean;
}

// "How does it feel?" Texture and symptoms that read the same on every skin tone.
// These come first because color is the hardest sign to judge on darker skin
// (our research model failed exactly there).
export const FEELS: Option[] = [
  { id: "dry", label: "Dry or rough" },
  { id: "flaky", label: "Flaky or scaly", hint: "Flakes that can look white, silvery or gray." },
  { id: "rough", label: "Thick or leathery", hint: "Thickened skin with deeper lines, often from long-term scratching." },
  { id: "raised", label: "Raised patches", hint: "Patches you can feel above the skin, often with sharp edges." },
  { id: "bumps", label: "Small bumps", hint: "Tiny raised spots, sometimes around hair follicles." },
  { id: "cracks", label: "Cracked or bleeding" },
  { id: "oozing", label: "Oozing or weeping", hint: "Clear fluid leaking from the skin." },
];

// "Compared with your own normal skin nearby, it looks…" Color is judged against the
// person's own unaffected skin, never against a picture of someone else's.
export const CHANGES: Option[] = [
  { id: "darker", label: "Darker than my usual skin", hint: "On brown and Black skin, active eczema often looks dark brown rather than red." },
  { id: "purple", label: "Purple, violet or gray", hint: "Common on medium to dark skin, where inflammation shows as violet or gray tones." },
  { id: "ashy", label: "Ashy or whitish", hint: "A gray-white, dull look, often with dryness." },
  { id: "lighter", label: "Lighter than my usual skin" },
  { id: "pink", label: "Pink or red", hint: "Most typical on lighter skin." },
  { id: "no-change", label: "Same color as usual" },
];

// Signs that should prompt the "Get care now" guidance.
export const WARNINGS: Option[] = [
  { id: "crusting", label: "Crusts or pus-filled spots", warn: true },
  { id: "blisters", label: "Blisters or punched-out sores", warn: true },
  { id: "hot", label: "Painful, swollen or hot", warn: true },
];

/** Everything recorded in an entry's `looks` list. */
export const LOOKS: Option[] = [...FEELS, ...CHANGES, ...WARNINGS];

// Labels for ids saved by earlier versions of Patchwork.
const LEGACY_LOOKS: Record<string, string> = {
  color: "Color change",
  scale: "Scaly",
  marks: "Dark or light marks left behind",
};

export const TRIGGERS: Option[] = [
  { id: "sweat", label: "Sweat or heat" },
  { id: "cold-dry", label: "Cold or dry air" },
  { id: "stress", label: "Stress" },
  { id: "poor-sleep", label: "Poor sleep" },
  { id: "new-product", label: "New soap, lotion or detergent" },
  { id: "fragrance", label: "Fragrance" },
  { id: "fabric", label: "Wool or scratchy fabric" },
  { id: "swimming", label: "Swimming or chlorine" },
  { id: "dust-pets", label: "Dust or pets" },
  { id: "pollen", label: "Pollen" },
  { id: "illness", label: "Cold, flu or infection" },
  { id: "injury", label: "Cut, scrape or sunburn" },
  { id: "hormones", label: "Period or hormones" },
  { id: "skipped", label: "Skipped my treatment" },
  { id: "food", label: "A food (add a note)" },
];

export const SLEEP_OPTIONS = [
  { value: 0, label: "Slept fine" },
  { value: 1, label: "Woke up a little" },
  { value: 2, label: "Woke up a lot" },
  { value: 3, label: "Barely slept" },
];

export const TREATMENT_KINDS: { id: TreatmentKind; label: string }[] = [
  { id: "moisturizer", label: "Moisturizer" },
  { id: "topical", label: "Prescription cream or ointment" },
  { id: "oral", label: "Pill" },
  { id: "injection", label: "Injection" },
  { id: "light", label: "Light therapy" },
  { id: "other", label: "Other" },
];

export const SUGGESTED_QUESTIONS = [
  "Is this eczema, psoriasis, or something else?",
  "How long should I use each treatment, and how much?",
  "What should I do the next time it flares?",
  "Do any of my patterns look like real triggers?",
  "Could my joint pain or nail changes be related?",
  "What should I do about the marks it leaves on my skin?",
];

const labelMap = (opts: Option[]) => Object.fromEntries(opts.map((o) => [o.id, o.label]));
const LOOK_LABELS = labelMap(LOOKS);
const TRIGGER_LABELS = labelMap(TRIGGERS);

export const lookLabel = (id: string) => LOOK_LABELS[id] ?? LEGACY_LOOKS[id] ?? id;
/** Custom triggers are stored by their own text. */
export const triggerLabel = (id: string) => TRIGGER_LABELS[id] ?? id;
