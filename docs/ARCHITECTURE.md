# How Patchwork works

A guide to the code: read this before changing anything, and before a judge asks you to explain it.

## The big picture

```
 ┌──────────────── Browser / installed app ────────────────┐        ┌──── Node server ────┐
 │  Screens (Preact)  ──►  state.ts  ──►  repo.ts           │        │ serves dist/        │
 │        ▲                  │  holds the data key          │  push  │ /api/push/*  ──► FCM│
 │        │ signals          ▼  in memory only              │◄───────│   / Mozilla / Apple │
 │   router.ts          crypto.ts (AES-GCM, PBKDF2)         │ subscribe (times only)       │
 │                           │                              │───────►│ /api/feedback       │
 │                           ▼                              │        └─────────────────────┘
 │                     db.ts  ──►  IndexedDB (ciphertext)   │
 │  sw.js: offline cache + shows push notifications         │
 └──────────────────────────────────────────────────────────┘
```

Health data never leaves the browser box. The server sees push subscription addresses and times of day. The only other connection: if the user picks a city for skin weather, the browser asks Open-Meteo for that city's forecast. Product labels are read inside the browser by tesseract.js, so label photos never leave the phone.

## Tech choices, and why

| Choice | Why |
|---|---|
| **Progressive Web App** | One codebase runs on iPhone, Android and computers; judges can open a URL; it installs to the home screen and works offline. |
| **Preact + TypeScript** | React's component model in 4 KB; TypeScript catches mistakes before they reach users. |
| **@preact/signals** | App-wide state without boilerplate: reading `entries.value` in a component re-renders it when entries change. |
| **WebCrypto** | The browser's built-in, audited crypto. We never implement AES or SHA ourselves, only protocols on top of them (TOTP, key wrapping). |
| **IndexedDB** | The browser's database; it can store binary photos. |
| **Hash routing** (`#/today`) | Works on any static host with no server configuration. |
| **Node `http` server, no framework** | Fewer dependencies means less attack surface, and every line is readable. |
| **Vitest** | Fast unit tests with the same syntax as Jest. |
| **tesseract.js** (OCR compiled to WebAssembly) | Reads ingredient labels on the device, so photos are never uploaded. Its files are copied into `public/ocr/` and served by the app itself, loaded only when someone checks a label. |
| **Open-Meteo** | Free weather API with no account or key, and humidity, dew point and UV in one request. |

## Where to start reading

1. [`src/lib/crypto.ts`](../src/lib/crypto.ts): the security core, about 120 lines.
2. [`src/lib/vault.ts`](../src/lib/vault.ts): create, unlock, lockout, change passcode.
3. [`src/state.ts`](../src/state.ts): every action the UI can take (save an entry, add a photo, lock…).
4. [`src/app.tsx`](../src/app.tsx): which screen shows when, plus auto-lock and reminders.
5. [`src/screens/CheckIn.tsx`](../src/screens/CheckIn.tsx): a complete feature from UI to encrypted storage.
6. [`src/lib/insights.ts`](../src/lib/insights.ts): the statistics behind "possible triggers".

## File by file

### `src/lib/`: logic, no UI
| File | What it does |
|---|---|
| `bytes.ts` | Base64/base32 encoding, random bytes, constant-time compare, SHA-256 |
| `crypto.ts` | PBKDF2 key derivation, key wrapping, AES-GCM `seal`/`open` for JSON and bytes, passcode rules |
| `totp.ts` | HOTP/TOTP (RFC 4226/6238), `otpauth://` URIs, recovery codes |
| `db.ts` | Tiny promise wrapper over IndexedDB (`meta`, `records`, `blobs` stores) |
| `vault.ts` | Creates the journal, unlocks it, counts failed attempts, re-keys on passcode change |
| `repo.ts` | Encrypts/decrypts typed records and photos; encrypted backup export/import |
| `types.ts` | Data shapes: `Entry`, `PhotoMeta`, `Treatment`, `PoemRecord`, `DarkMark`, `Settings` |
| `insights.ts` | Summary stats and the permutation test for trigger patterns |
| `poem.ts` | POEM questions, scoring (0–28), severity bands, weekly due date, trend and "meaningful change" (3.4 points) |
| `marks.ts` | Dark-mark rating scale (0–3, against the surrounding skin) and the fading summary |
| `weather.ts` | Skin weather: Open-Meteo requests, the indoor-humidity estimate (Magnus formula), very dry / hot / cold / high-UV flags, skin tips, and weather patterns |
| `ingredients.ts` | Finds flagged ingredients in a label's text, tolerating OCR mistakes (edit distance) while matching whole words only |
| `ocr.ts` | Prepares a label photo (grayscale, contrast, size) and reads it with tesseract.js in a Web Worker |
| `photoQuality.ts` | Lighting check: dim (judged on the brightest pixels too, so dark skin isn't flagged), glare, backlight, and difference from the user's own last photo |
| `device.ts` | Detects iPhone/iPad and whether Patchwork was opened from the home screen |
| `notify.ts` | Notification permission, Web Push subscription (renewed if the server's keys change), in-app fallback reminders |
| `image.ts` | Resizes photos and strips metadata by redrawing on a canvas |
| `demo.ts` | Generates 45 days of labeled sample data and drawn sample photos |
| `feedback.ts` | Sends bug reports/ideas, with an email fallback |
| `date.ts` | Local-date helpers (a 11:50 PM check-in counts for today, not UTC tomorrow) |

### `src/screens/`
`Welcome` (onboarding + restore) · `Unlock` (passcode, two-step, forgot) · `Today` · `CheckIn` (5-step flow) · `Poem` (weekly questionnaire + result) · `Timeline` (charts, patterns, heat map, history) · `Photos` (gallery, camera, compare) · `Marks` (dark-mark list, new mark, detail, re-rating) · `Weather` (city search, today, 7 days) · `Products` (label check, saved products) · `Visit` (report builder + printable report) · `Learn` · `Settings` (reminders, treatments, security, 2FA setup, backup, feedback, about)

### `src/components/`
`BodyMap` (tappable SVG, front/back) · `ItchChart` (bar chart with hover/keyboard tooltip and table view) · `PoemChart` (weekly scores with band lines and a table view) · `Photo` (decrypt-on-demand image, before/after slider, camera with ghost overlay, photo tips, post-capture review) · `ToneGuide` (code-drawn skin-tone illustration) · `QRCode` · `Logo` · `Icon` · `ui` (buttons, chips, sheets, toggles…)

### Other
- `src/sw.template.js`: service worker. `vite.config.ts` turns it into `dist/sw.js` with the list of built files to cache.
- `server/index.mjs`: static files with security headers and gzip, push subscription API, reminder scheduler (every 20 s, per time zone), feedback.
- `scripts/make-icons.mjs`: draws the app icons as PNGs with no image library.
- `scripts/copy-ocr.mjs`: copies the label reader (worker, WebAssembly engine, English model) from `node_modules` into `public/ocr/`. It runs automatically before `npm run dev` and `npm run build`.
- `src/data/ingredients.ts` and `src/data/sources.ts`: the flagged ingredient groups (National Eczema Association's Ecz-clusion List and other sourced culprits) and every source they cite.

## Walkthrough: what happens when you save a check-in

1. `CheckIn.tsx` keeps a draft `Entry` in component state as you tap through the steps.
2. "Save" calls `saveEntry(draft)` in `state.ts`.
3. `repo.saveRecord` runs `JSON.stringify` on the entry and encrypts it with the in-memory data key (AES-256-GCM, fresh random IV, record ID bound as additional data).
4. `db.put` writes `{ id, type: "entry", iv, ct }` to IndexedDB.
5. `state.ts` updates the `journal` signal, so Today, Timeline and the report re-render automatically.

## Walkthrough: "possible triggers"

For each trigger (e.g. *sweat*): split logged days into days with and without it, compare average itch, then shuffle the with/without labels 2,000 times to see how often chance alone makes a gap that big. That fraction is the p-value. It's computed for the same day and the next day, and because we keep the better of the two, the p-value is doubled (Bonferroni correction). "Clear pattern" = p < 0.05, at least 5 days with the trigger, and at least a 1-point difference. Nothing is shown before 14 logged days. These rules come straight from our research: small samples made a real skin-tone gap look like zero.

## Walkthrough: skin weather

1. The user picks a city (`Weather.tsx` → Open-Meteo's city search). Its coordinates are saved in the encrypted settings.
2. `refreshWeather()` in `state.ts` asks Open-Meteo for about two months of past days and the next week: high, low, humidity, dew point, UV. Results are cached for an hour.
3. `weather.ts` estimates indoor humidity by warming the outdoor dew point to 21 °C. A day is **very dry** if indoors or outdoors is under 30%, **hot** at 30 °C (86 °F) or more, and **cold** at 5 °C (41 °F) or less.
4. Tips come from those flags (`skinTips`).
5. `weatherPatterns` turns each day's weather into triggers ("weather-dry"…) and runs the same permutation test as logged triggers. Only days with weather data take part, so missing days never count as "not dry".

## Walkthrough: product check

1. The user photographs a label. `ocr.ts` grayscales it, stretches the contrast, and resizes it so small print is readable.
2. tesseract.js (in a Web Worker, files served from `/ocr/`) reads it on the device in a few seconds. The photo is never stored.
3. The text appears in an editable box, and `checkLabel()` in `ingredients.ts` runs on every edit:
   - it removes claims like "fragrance-free";
   - it splits the text into words, rejoining words broken across lines;
   - it looks for each ingredient name as whole words, so "triethanolamine" is never "ethanol";
   - it allows one or two wrong letters in long names, but never in numbers, so "quaternium-18" is not "quaternium-15".
4. Results are grouped with the reason and source for each. A saved product stores only its name and the text, encrypted, and appears on the visit report.

## Testing

`npm test` runs 110 tests in `tests/`:
- `poem.test.ts`: the seven questions, 0–28 scoring, every score in exactly one published band, weekly due date, trend, meaningful-change wording
- `marks.test.ts`: fading in steps, two-week update reminders, worsening marks flagged
- `photoQuality.test.ts`: a well-lit photo of deep brown skin is *not* called dim; real underexposure, glare and backlight are; comparison is against the user's own last photo
- `crypto.test.ts`: round-trips, tamper detection, wrong passcode, non-extractable keys, Unicode passcodes
- `totp.test.ts`: official RFC vectors, clock drift, replay blocking, recovery codes
- `vault.test.ts`: lockout timing, passcode change, encrypted storage, backup restore onto a "new phone"
- `insights.test.ts`: detects real same-day and next-day triggers, doesn't invent patterns from noise
- `server.test.ts`: time-zone scheduling, push encryption (decrypted as a phone would), headers, gzip, path traversal, rate limits, admin-only feedback
- `notify.test.ts`: a push subscription made with old server keys is detected, so the app subscribes again
- `weather.test.ts`: the indoor-humidity math, dry/hot/cold/UV thresholds, tips, parsing Open-Meteo (including days with no data), finding a real dry-day pattern and not inventing one from noise
- `ingredients.test.ts`: flags a typical scented body wash correctly; doesn't confuse look-alikes (laureth vs lauryl sulfate, citric acid, triethanolamine, cetyl alcohol, quaternium-18); ignores "fragrance-free" claims; survives misread letters and split words

## Adding a feature (example: a new trigger)

Add `{ id: "screen-time", label: "Late-night screen time" }` to `TRIGGERS` in `src/data/options.ts`. That's all: it appears in the check-in, the pattern analysis picks it up, and the report labels it.
