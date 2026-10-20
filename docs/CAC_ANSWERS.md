# Congressional App Challenge: written answers

Drafts for the three 400-word boxes. **Before you paste them:**

1. Replace every **[bracketed]** part. Delete any brackets you don't use.
2. Read each answer out loud and change anything that doesn't sound like you. Judges can tell, and they may ask you about it.
3. In answer 3, keep only the problems **you personally worked through**, and keep the AI-use sentence. The rules require AI use to be disclosed, and the app was largely built with an AI assistant.
4. Check that EczemaWise is really shutting down, and when, before mentioning it.

Word counts (body text only) are under each heading.

---

## 1. Please briefly describe what your app does

*About 380 words*

Patchwork is an all-in-one eczema app built to work on every skin tone. Most ways of tracking eczema lean on redness, but on brown and Black skin a flare often looks darker, purple or gray instead of red, so it is easy to underestimate. Patchwork measures eczema without asking "how red is it?" and turns a few seconds a day into a one-page report for a dermatologist.

- **Daily check-in (about a minute).** Worst itch from 0 to 10, sleep, a tap-to-select body map, and how the skin feels: dry, flaky, thick, cracked, oozing. Color is judged against the person's own normal skin nearby (darker, purple or gray, ashy, lighter), never against a picture of someone else.
- **Weekly POEM score.** The Patient-Oriented Eczema Measure is seven research-validated questions about the past week, scored from 0 to 28 with published severity bands. None of the questions asks about redness, so the score means the same thing on any skin tone. Patchwork charts it week by week.
- **Dark-mark tracker.** Flares often leave dark or light marks that last for months, especially on darker skin, and patients care about them a lot. Users rate each mark against the skin around it every two weeks, with photos lined up to the last one, and watch it fade.
- **Photo coaching.** Tips before every photo, an automatic lighting check afterwards, and the new photo shown next to the user's own previous photo of the same spot.
- **Skin weather.** Patchwork turns the local forecast into skin advice for dry air, heat, cold and sun, and tests whether those days line up with the user's flares.
- **Product label check.** Photograph an ingredient list: Patchwork reads it on the phone and flags common irritants from the National Eczema Association's list, with sources.
- **Patterns and a visit report.** A statistics test flags triggers such as sweat or stress only when the pattern is unlikely to be chance. The report puts the POEM trend, itch chart, marks, photos and the patient's questions on one printable page, with an optional note telling the doctor that redness may understate their eczema.

Patchwork deliberately does not diagnose. Our own research showed why: an AI we built performed at chance on darker skin.

---

## 2. What inspired you to create this app?

*About 245 words, leaving about 150 for your personal paragraph*

Patchwork started as a research project. My brother and I built an artificial-intelligence model to tell eczema from psoriasis in photos, trained on 1,125 images from 645 patients. On our own data it looked fair: no gap between skin tones.

Then we tested it on an outside dataset. On lighter skin it scored 0.71 on a standard accuracy measure. On the darkest skin types it scored 0.50, no better than a coin flip. Our internal testing had completely hidden that. A second outside dataset gave a different skin-tone result again, which taught us how easily a tool can look fair while failing the people who most need it.

The deeper problem wasn't our model. It was what everyone measures. Most eczema pictures and severity scales are built around redness, and on darker skin eczema often isn't red. It can look dark brown, purple or gray, and it can leave dark marks that last for months. Dermatologists are scarce and appointments are short, so patients with darker skin are more likely to have a flare underestimated, or to have the marks that bother them most never come up.

So instead of building another app that guesses a diagnosis, we built one that measures eczema in ways that work on every skin tone:
- a validated weekly score with no redness questions
- comparisons with the person's own skin
- a tracker for the dark marks other apps ignore

Then it hands the whole story to a doctor.

[Add 2–4 sentences about your own connection: who in your life has eczema, or what you saw while doing this research, and why it matters to you. This is often the part judges remember.]

[Optional, only if confirmed: "We also learned that EczemaWise, the National Eczema Association's tracking app, is shutting down, leaving families looking for a replacement."]

---

## 3. What technical difficulties did you face programming your app?

*About 340 words. Keep only what you worked on yourselves.*

**Measuring without redness, without breaking a validated score.** POEM is validated as a weekly questionnaire with exact wording. We considered calculating it automatically from daily check-ins, but a score built that way isn't the validated measure. So we kept POEM exactly as published, as a weekly questionnaire, and redesigned the daily check-in to ask how the skin compares with the person's own normal skin.

**A lighting check that doesn't repeat the bias we studied.** Our first idea flagged a photo as too dark when its average brightness was low. That would have called almost every photo of deep brown skin "too dark", the same skin-tone bias our research found in AI. We changed the test so a photo only counts as dim when its brightest parts are also dark. We wrote automated tests using simulated deep-brown skin to prove a well-lit photo passes. We also compare each photo with the user's own last photo, not with a "standard" skin color.

**Honest statistics on tiny samples.** One person's journal might have a few weeks of data, so random noise easily looks like a pattern. We used a permutation test, which shuffles the data thousands of times to see how often chance produces a gap that big. We correct for testing two time windows, and we show nothing until 14 days are logged.

**Photos across many phones.** Some browsers postpone image encoding indefinitely in the background, which made saving a photo hang. We added a timeout with a fallback. We also had to rotate photos correctly while removing hidden location data, and support phones where the live camera isn't available.

**Keeping health data safe without accounts.** Everything is encrypted on the device with a key derived from the user's passcode, and the app auto-locks.

**Testing it all.** There are 110 automated tests covering POEM scoring, mark tracking, the lighting check, encryption and the reminder server.

We used an AI coding assistant (Claude) to write much of the code. Our AI-use disclosure describes exactly what it did and what we built, tested and decided ourselves. [Name the specific parts you built or changed yourselves.]
