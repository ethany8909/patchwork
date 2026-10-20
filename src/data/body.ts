// Body map regions. Left and right sides share one id ("hands" = either hand),
// because what matters to a dermatologist is the pattern, not the side.
//
// Inner elbows / behind the knees are classic eczema sites; outer elbows / front
// of the knees are classic psoriasis sites, so the map keeps them separate.

export type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

export interface Region {
  id: string;
  shapes: Shape[];
}

const rect = (x: number, y: number, w: number, h: number, r = 8): Shape => ({ kind: "rect", x, y, w, h, r });
const ell = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: "ellipse", cx, cy, rx, ry });
/** Mirror a shape across the body's center line (x = 100). */
const pair = (s: Shape): Shape[] =>
  s.kind === "rect" ? [s, { ...s, x: 200 - s.x - s.w }] : [s, { ...s, cx: 200 - s.cx }];

const shared = {
  neck: [rect(89, 70, 22, 16, 5)],
  ears: pair(ell(73, 44, 5, 9)),
  upperArms: pair(rect(44, 92, 18, 68, 9)),
  forearms: pair(rect(40, 182, 18, 60, 9)),
  wrists: pair(rect(39, 244, 18, 10, 5)),
  hands: pair(ell(47, 272, 12, 17)),
  lowerLegs: pair(rect(73, 352, 22, 68, 10)),
  ankles: pair(rect(74, 422, 20, 10, 5)),
  feet: pair(ell(83, 442, 14, 8)),
};

export const FRONT: Region[] = [
  { id: "face", shapes: [ell(100, 42, 25, 30)] },
  { id: "ears", shapes: shared.ears },
  { id: "neck", shapes: shared.neck },
  { id: "chest", shapes: [rect(66, 88, 68, 62, 14)] },
  { id: "abdomen", shapes: [rect(68, 152, 64, 58, 10)] },
  { id: "groin", shapes: [rect(80, 212, 40, 24, 10)] },
  { id: "upper-arms", shapes: shared.upperArms },
  { id: "inner-elbows", shapes: pair(ell(51, 171, 9, 8)) },
  { id: "forearms", shapes: shared.forearms },
  { id: "wrists", shapes: shared.wrists },
  { id: "hands", shapes: shared.hands },
  { id: "thighs", shapes: pair(rect(70, 238, 28, 90, 12)) },
  { id: "knees", shapes: pair(ell(84, 339, 13, 11)) },
  { id: "lower-legs", shapes: shared.lowerLegs },
  { id: "ankles", shapes: shared.ankles },
  { id: "feet", shapes: shared.feet },
];

export const BACK: Region[] = [
  { id: "scalp", shapes: [ell(100, 42, 25, 30)] },
  { id: "ears", shapes: shared.ears },
  { id: "neck", shapes: shared.neck },
  { id: "upper-back", shapes: [rect(66, 88, 68, 62, 14)] },
  { id: "lower-back", shapes: [rect(68, 152, 64, 54, 10)] },
  { id: "buttocks", shapes: [rect(70, 208, 60, 38, 14)] },
  { id: "upper-arms", shapes: shared.upperArms },
  { id: "outer-elbows", shapes: pair(ell(51, 171, 9, 8)) },
  { id: "forearms", shapes: shared.forearms },
  { id: "wrists", shapes: shared.wrists },
  { id: "hands", shapes: shared.hands },
  { id: "thighs", shapes: pair(rect(70, 248, 28, 80, 12)) },
  { id: "behind-knees", shapes: pair(ell(84, 339, 13, 11)) },
  { id: "lower-legs", shapes: shared.lowerLegs },
  { id: "ankles", shapes: shared.ankles },
  { id: "feet", shapes: shared.feet },
];

/** Areas that aren't practical to tap on a small outline. */
export const EXTRA_AREAS = ["nails", "armpits", "eyelids"];

export const AREA_LABELS: Record<string, string> = {
  face: "Face",
  scalp: "Scalp",
  ears: "Ears",
  eyelids: "Eyelids",
  neck: "Neck",
  chest: "Chest",
  abdomen: "Stomach",
  groin: "Groin",
  armpits: "Armpits",
  "upper-back": "Upper back",
  "lower-back": "Lower back",
  buttocks: "Buttocks",
  "upper-arms": "Upper arms",
  "inner-elbows": "Inner elbows",
  "outer-elbows": "Outer elbows",
  forearms: "Forearms",
  wrists: "Wrists",
  hands: "Hands",
  nails: "Nails",
  thighs: "Thighs",
  knees: "Front of knees",
  "behind-knees": "Behind knees",
  "lower-legs": "Lower legs",
  ankles: "Ankles",
  feet: "Feet",
};

export const areaLabel = (id: string) => AREA_LABELS[id] ?? id;
