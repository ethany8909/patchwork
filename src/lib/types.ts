/** Local calendar date, YYYY-MM-DD. */
export type ISODate = string;

export interface Entry {
  id: string;
  date: ISODate;
  /** Worst itch in the past 24 hours, 0-10. null = not recorded (e.g. only a treatment was ticked). */
  itch: number | null;
  /** How much itch disturbed last night's sleep: 0 none, 1 a little, 2 a lot, 3 couldn't sleep. */
  sleep: number | null;
  areas: string[];
  looks: string[];
  triggers: string[];
  /** Ids of treatments used that day. */
  treatments: string[];
  note: string;
  photoIds: string[];
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
}

export interface PhotoMeta {
  id: string;
  date: ISODate;
  area: string;
  width: number;
  height: number;
  createdAt: number;
  /** Mean brightness (0-255) when taken, so the next photo can be matched to this one. */
  light?: number;
  /** Set when the photo belongs to a dark-mark update rather than the progress gallery. */
  markId?: string;
  demo?: boolean;
}

/**
 * One weekly POEM (Patient-Oriented Eczema Measure) questionnaire.
 * Each answer is 0-4 (no days, 1-2, 3-4, 5-6, every day); the score is their sum, 0-28.
 */
export interface PoemRecord {
  id: string;
  date: ISODate;
  answers: number[];
  createdAt: number;
  demo?: boolean;
}

export type MarkKind = "darker" | "lighter";

/** How noticeable a mark is compared with the skin around it: 3 very, 2 noticeable, 1 faint, 0 faded. */
export interface MarkUpdate {
  date: ISODate;
  level: number;
  photoId: string | null;
}

/** A dark (or light) mark left behind after a flare, tracked as it fades. */
export interface DarkMark {
  id: string;
  area: string;
  kind: MarkKind;
  label: string;
  updates: MarkUpdate[];
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
}

export type TreatmentKind = "moisturizer" | "topical" | "oral" | "injection" | "light" | "other";

export interface Treatment {
  id: string;
  name: string;
  kind: TreatmentKind;
  /** Times of day as HH:MM. Empty = "as needed". */
  times: string[];
  remind: boolean;
  active: boolean;
  createdAt: number;
  demo?: boolean;
}

/** A product whose ingredient list was checked. Flags are worked out from `text` each time it's shown. */
export interface Product {
  id: string;
  name: string;
  /** The ingredient list, as read from the photo (and corrected) or typed. */
  text: string;
  createdAt: number;
  demo?: boolean;
}

/** The city used for skin weather (its map coordinates, not the user's own location). */
export interface WeatherPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface Question {
  id: string;
  text: string;
}

export interface TwoFactor {
  secret: string;
  lastCounter: number;
  recoveryHashes: string[];
  enabledAt: number;
}

export interface Settings {
  nickname: string;
  reminder: { enabled: boolean; time: string };
  autoLockMinutes: number;
  appointment: ISODate | null;
  questions: Question[];
  customTriggers: string[];
  twoFactor: TwoFactor | null;
  reportPhotoIds: string[];
  reportRangeDays: number;
  /** Add a note to the visit report that redness may understate activity on the patient's skin. */
  clinicianToneNote: boolean;
  /** City for skin weather, or null when the feature is off. */
  weatherPlace: WeatherPlace | null;
}

export const DEFAULT_SETTINGS: Settings = {
  nickname: "",
  reminder: { enabled: false, time: "20:00" },
  autoLockMinutes: 5,
  appointment: null,
  questions: [],
  customTriggers: [],
  twoFactor: null,
  reportPhotoIds: [],
  reportRangeDays: 30,
  clinicianToneNote: false,
  weatherPlace: null,
};

export type RecordType = "entry" | "treatment" | "photo" | "settings" | "poem" | "mark" | "product";
