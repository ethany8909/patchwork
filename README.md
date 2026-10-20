# Patchwork

**A one-stop eczema app built for every skin tone. It tracks flares without asking "how red is it?", translates the weather into skin advice, checks product labels for common irritants, follows the dark marks flares leave behind, and turns it all into a one-page report for your dermatologist.**

Patchwork is an installable web app (PWA) that runs on iPhone, Android, tablets and computers from one codebase. Everything a user logs is encrypted on their own device. No account, no ads, no tracking.

---

## Why it exists

Eczema and psoriasis are common and look alike. Even expert dermatopathologists reading the *same biopsies* agree on eczema vs. psoriasis only "fairly" often (Fleiss' κ = 0.31, falling to 0.08 on ambiguous cases). Dermatologists are scarce (2.66 per 100,000 people worldwide, 0.37 in low-income countries), appointments are short, and a flare that was bad for two weeks often looks calm on appointment day.

**We started by building an AI to diagnose it from photos.** Tested on a new group of patients, it did no better than a coin flip on darker skin (AUROC 0.50) while scoring 0.71 on lighter skin. Our own internal checks had shown no gap at all. A previous Congressional App Challenge winner already built a photo-diagnosis app. We deliberately didn't: an app that confidently labels a rash would be wrong most often for the people already underserved.

So Patchwork does the part a phone can do reliably. It keeps an accurate, private record of what happens between visits and hands it to someone qualified to read it.

## Who it's for

Teens and families managing eczema or psoriasis, especially people facing long waits for a dermatologist and people with brown and Black skin, whose flares are more often missed because most medical images show light skin.

## What it does

| | |
|---|---|
| **Check in, fast, without redness** | Worst itch (0–10), sleep, a tap-to-select body map, how the skin *feels*, how it looks **compared with the person's own normal skin** (darker, purple or gray, ashy, lighter), possible triggers, treatments used, optional photo and note. There's also a one-tap "just log itch" option. |
| **Weekly POEM score** | The Patient-Oriented Eczema Measure: seven validated questions about the past week, scored 0–28 with published severity bands. None of the questions asks about redness, so the score means the same thing on every skin tone. Trend chart on the Timeline and on the visit report. |
| **Dark-mark tracker** | Flares often leave darker (or lighter) patches on brown and Black skin that take months to fade. Users rate each mark against the skin around it every two weeks, with photos lined up to the last one, and watch it fade. The report shows each mark's start and latest rating. |
| **Photo coaching** | Tips before every shot (daylight, no flash, tap to expose on the skin, include normal skin), an automatic lighting check after it, and the new photo shown next to the user's *own* last photo of that area. It compares you with you, never with a "standard" skin color. GPS and other metadata are stripped. |
| **Skin weather** | Pick a city and Patchwork shows today's high and low, UV, and humidity outside and indoors. Indoors is estimated by warming the outdoor dew point to room temperature, because heated winter air gets very dry. It turns that into tips, such as "very dry air: moisturize after bathing", and a 7-day outlook. On the Timeline it runs the same permutation test on very dry, hot and cold days, so a user can see whether weather lines up with their flares. Weather data comes from Open-Meteo; only the city's coordinates are sent. |
| **Product check** | Photograph an ingredient list. The label is read **on the phone** (tesseract.js running in WebAssembly, served by the app itself), so the photo is never uploaded or saved. Patchwork flags ingredients on the National Eczema Association's Ecz-clusion List (fragrance, methylisothiazolinone, formaldehyde releasers and more) and other common culprits (sodium lauryl sulfate, cocamidopropyl betaine, lanolin and more). Each flag says why it matters and links its source. It copes with misread letters and words split across lines, and won't mistake look-alikes such as sodium laureth sulfate or cetyl alcohol. Saved products appear on the visit report. |
| **Skin-tone education** | How eczema can look on four skin tones, as hand-coded illustrations (no copied photos) plus sourced descriptions; articles on POEM and on dark marks. |
| **A note for the doctor** | An optional line at the top of the report: redness may understate how active the patient's eczema is, so consider itch, thickening, dryness and marks. |
| **Trigger patterns, honestly** | A permutation test compares itch on days with and without each trigger, same day and next day. It shows nothing until 14 days are logged, always shows sample sizes, and labels results "clear" or "possible", never "proven". |
| **Visit report** | One printable page: stats, POEM trend, itch chart, affected areas, how it looked, treatment use, possible triggers (including weather), dark marks, checked products with flagged ingredients, notes, chosen photos and the patient's questions. Print it or save it as a PDF. |
| **Learn** | Short, sourced articles: when to get care now, how eczema looks on different skin tones, the POEM score, dark marks, weather and your skin, reading ingredient labels, taking useful photos, making the most of a short visit, and why the app doesn't diagnose. The "Get care now" guide works even while the journal is locked. |

## How it meets each pillar

**1. Clear purpose and value.** It solves a specific, real problem: patients arrive at short, hard-to-get appointments without an accurate record, and most eczema tools measure severity by redness, which is hard to see on brown and Black skin. It also answers the everyday questions people with eczema have ("Is today's weather going to bother my skin?", "Is this lotion likely to irritate it?") in the same private app. What sets it apart is that every measurement works without redness (POEM, comparison with the person's own skin, dark-mark tracking), plus the research-backed decision *not* to diagnose. Onboarding is built for teens (under a minute) and the report is built for clinicians (readable in two).

**2. Great design (UI/UX).**
- One task per screen. A check-in is five short steps, and each one can be skipped.
- Onboarding takes under a minute. Only the passcode step needs typing. Sample data lets anyone see the charts and report immediately.
- Accessible by design: 44px touch targets, WCAG AA contrast in light and dark themes, full keyboard and screen-reader support (focus moves to each screen's heading, the chart has arrow-key navigation and a table view), and reduced-motion support.

**3. High performance.**
- About 78 KB of gzipped JavaScript (the server gzips it), no web framework beyond Preact (4 KB). DOMContentLoaded in about 30 ms locally.
- The label reader (about 7 MB) loads only when someone checks a label, then is cached for offline use. A clear label reads in about 3 seconds.
- A service worker precaches the app so it opens instantly and works offline.
- It works across screen sizes (phone, tablet, desktop) and platforms (iOS, Android, Windows, macOS) and can be installed to the home screen.
- 110 automated tests cover encryption, two-step verification, storage, statistics, POEM scoring, dark-mark tracking, the photo lighting check, skin weather (including the indoor-humidity math and weather patterns), the ingredient checker (including misread labels and look-alike ingredients), reminders and the server.

**4. Robust security.**
- **Encryption at rest:** every record and photo is encrypted with AES-256-GCM. The key is derived from the passcode using PBKDF2-SHA-256 with 600,000 iterations (OWASP 2023). The passcode is never stored.
- **Multi-factor login:** optional two-step verification with any authenticator app (RFC 6238 TOTP), with replay protection and 8 one-time recovery codes.
- **Brute-force protection:** wrong passcodes and wrong codes trigger an exponential lockout (30 s, doubling, up to 15 minutes).
- **Auto-lock** after 1, 5 or 15 minutes of inactivity, which wipes decrypted data from memory.
- **Hardened delivery:** a strict Content Security Policy (no third-party or inline scripts; the only outside connections allowed are Open-Meteo's weather and city search), security headers, same-origin checks, rate limits, input validation, and path-traversal protection on the server.
- **Private by design:** label photos are read on the device and never uploaded or saved; skin weather sends only the chosen city's coordinates.

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and limits.

**5. Engagement and support.**
- **Push notifications:** daily check-in and per-treatment reminders delivered by Web Push, even when the app is closed. The text is generic ("Time for a quick check-in"), so nothing private shows on a lock screen. The server only knows reminder times.
- **Gentle nudges:** a countdown to the next appointment, contextual tips, and encouragement without guilt-inducing streaks.
- **Feedback:** an in-app form for bugs and ideas, with optional device info (never journal data). It goes to the server, with an email fallback.

---

## Run it

Requires Node.js 22.12 or newer.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Then open http://localhost:8787. The server serves the app, handles reminders, and collects feedback. On first run it creates development push keys in `server/data/`.

For live-reload development, run `npm start` in one terminal and `npm run dev` in another (Vite forwards `/api` to the server).

```bash
npm test
```

### Try it on a phone

Push notifications and the camera need HTTPS (localhost is exempt). The easiest path is to deploy (below) and open the URL on the phone. On iPhone, tap **Share → Add to Home Screen**; iOS only allows web push for installed apps (iOS 16.4+).

## Deploy

Browsers only allow Patchwork's encryption, camera and notifications on secure (`https://`) pages, so put it on a host and use that address on phones. Any host that runs Node.js 22.12 or newer works; `.node-version` pins Node 24. These steps use [Render](https://render.com):

1. Put the `patchwork` folder in its own GitHub repository (see "Setting up git" in [docs/CAC_SUBMISSION.md](docs/CAC_SUBMISSION.md)). `.gitignore` already keeps out `server/data/`, which holds local keys and must never be committed.
2. On your computer, make the push keys once:

   ```bash
   npm run vapid
   ```

   It prints three lines. Keep them private, change the email in `VAPID_SUBJECT` to one you read, and reuse the same keys for every deploy.
3. In Render, choose **New → Web Service**, connect the repository, and set:

   | Setting | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm ci --include=dev && npm run build` |
   | Start command | `npm start` |
   | Health check path | `/api/health` |
   | Environment variables | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (from step 2) and `ADMIN_TOKEN` (any long random string) |

4. Deploy, then open the `https://…onrender.com` address on your phone. On iPhone, tap **Share → Add to Home Screen** *before* creating a journal, and always open Patchwork from the home-screen icon: iOS keeps the home-screen app's data separate from Safari's, and only the installed app can receive reminders.

To update the live app, push to GitHub: Render rebuilds automatically, and phones get the new version the next time they open Patchwork.

**Free or paid instance.** At the time of writing, Render's free instances sleep after about 15 minutes without visitors: the next visit waits up to about a minute while the server wakes, and no reminders go out while it sleeps. A free instance's disk is also wiped when it restarts. Nothing breaks, because each phone re-registers its reminders the next time Patchwork is opened, but reminders aren't dependable. For judging, use an always-on paid instance, and add a persistent disk with `DATA_DIR` set to its mount path (for example `/var/data`) so reminder subscriptions survive restarts. Check Render's pricing page for current plans.

**Reading feedback.** Replace the token and address with yours:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-APP.onrender.com/api/feedback
```

**Without the server.** The built `dist/` folder also works on a static host that serves it at the root of a domain (Netlify, Cloudflare Pages). Reminders then only appear while the app is open, and feedback falls back to email: set `VITE_FEEDBACK_EMAIL` when you build.

## Project layout

```
src/
  lib/         crypto, TOTP, IndexedDB, vault, repository, insights, POEM, marks, weather,
               ingredient checker, on-device label reader (OCR), notifications, images
  screens/     Welcome, Unlock, Today, CheckIn, Poem, Timeline, Photos, Marks, Weather, Products,
               Visit, Learn, Settings
  components/  body map, itch chart, POEM chart, camera, photo compare, tone guide, QR code, shared UI
  data/        body regions, descriptors, triggers, ingredient groups, sources, education content
  sw.template.js   service worker (offline + push)
public/ocr/    label-reader files, copied from node_modules before every dev/build (not committed)
server/        Node server: static files, Web Push reminders, feedback
tests/         Vitest suites (110 tests)
scripts/       icon generator, label-reader copy step
docs/          ARCHITECTURE.md, SECURITY.md, CAC_SUBMISSION.md
```

## Open-source software

Preact and @preact/signals (MIT), qrcode-generator (MIT), tesseract.js with its engine and English model (Apache-2.0), and web-push (MPL-2.0) at runtime. Vite, TypeScript, Vitest and fake-indexeddb for building and testing. Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). Icons and illustrations are original.

## Not a medical device

Patchwork doesn't diagnose or recommend treatment. Educational content is general information paraphrased from the cited sources.

## AI use

Built with AI assistance (Anthropic's Claude). See [docs/CAC_SUBMISSION.md](docs/CAC_SUBMISSION.md) for the disclosure.
