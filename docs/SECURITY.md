# Security and privacy design

Patchwork holds some of the most personal data a teenager has: photos of their skin, sleep, stress, what medicines they use. The design rule is simple: **that data never leaves the device unencrypted, and never leaves the device at all unless the user exports a backup.**

## Threat model

| Threat | Protection |
|---|---|
| Someone picks up an unlocked phone later | Auto-lock after 1/5/15 min idle or in the background; decrypted data and photo URLs are dropped from memory |
| Someone copies the browser's storage (lost phone, shared computer, malware reading files) | Everything is AES-256-GCM ciphertext; the key needs the passcode |
| Offline passcode guessing on copied data | PBKDF2-SHA-256 with 600,000 iterations and a random 16-byte salt make each guess slow |
| Online guessing in the app | Exponential lockout after 4 free tries (30 s, 60 s, 120 s … up to 15 min), persisted across reloads |
| Someone who knows the passcode (a sibling looked over a shoulder) | Optional two-step verification with an authenticator app on another device |
| Replaying an observed authenticator code | The last-used TOTP counter is stored; codes at or before it are refused |
| Swapping or tampering with stored ciphertext | AES-GCM authentication; each record's ID and type are bound as additional authenticated data |
| Photo location leaks | Photos are re-encoded through a canvas, which drops all EXIF data including GPS |
| Lock-screen leaks from reminders | Notification text is generic; the push payload only carries `{ "kind": "checkin" }` |
| The server being breached | The server holds no health data: only push addresses, time zones and reminder times |
| Malicious scripts (XSS, supply chain) | Strict CSP: `script-src 'self' 'wasm-unsafe-eval'` (WebAssembly for the on-device label reader, but no `eval`), no inline scripts, and `connect-src` limited to this site plus Open-Meteo's two weather endpoints. Third-party code is all self-hosted, there's no `innerHTML`, and there are 5 runtime dependencies. |
| Label photos revealing what someone uses | Read on the device by tesseract.js; never uploaded, never saved. Only the text the user chooses to keep is stored, encrypted. |
| Weather lookups revealing location | Off until the user picks a city. Only that city's map coordinates, or the typed search, go to Open-Meteo (which, like any website, also sees the device's IP address). The city is stored encrypted. |
| Cross-site requests to the server | Origin check on every POST, JSON-only bodies with a 16 KB limit, per-IP rate limits |

## What leaves the device

- **Nothing from the journal**, ever, unless the user exports an encrypted backup.
- **Reminders (optional):** push subscription address, time zone and reminder times go to the Patchwork server.
- **Skin weather (optional):** the chosen city's coordinates go to Open-Meteo.
- **Feedback (optional):** the message, an optional contact, and optional device info go to the Patchwork server.

## Key hierarchy

```
passcode ──PBKDF2-SHA-256, 600k iterations, random salt──▶ KEK (key-encryption key, never stored)
                                                               │ AES-GCM wrap
random 256-bit DEK (data-encryption key) ◀─────────────────────┘
   │
   ├─ AES-256-GCM, fresh 96-bit IV, AAD = "entry:<id>"         ▶ each check-in
   ├─ AES-256-GCM, fresh 96-bit IV, AAD = "photo-full:<id>"    ▶ each photo
   └─ …settings, treatments, photo metadata
```

- The DEK is random, so changing the passcode only re-wraps one key; nothing else is re-encrypted.
- In normal use the DEK is imported as **non-extractable**: JavaScript can use it but cannot read its bytes.
- A wrong passcode is detected when unwrapping fails AES-GCM authentication, so no password hash or "check value" is stored.
- Passcodes are Unicode-normalized (NFKC), so the same passcode typed on different keyboards derives the same key.

Code: [`src/lib/crypto.ts`](../src/lib/crypto.ts), [`src/lib/vault.ts`](../src/lib/vault.ts), [`src/lib/repo.ts`](../src/lib/repo.ts).

## Two-step verification

RFC 6238 TOTP (HMAC-SHA-1, 6 digits, 30-second steps, ±1 step of clock drift) implemented directly on WebCrypto in [`src/lib/totp.ts`](../src/lib/totp.ts). It is tested against the official RFC 4226 and RFC 6238 test vectors. During development, a code computed by a separate implementation (Node's `crypto`) was accepted by the app.

Recovery codes: 8 codes × 40 bits, from an alphabet without look-alike characters. Only SHA-256 hashes are stored, compared in constant time, and each code works once. Wrong codes count toward the same lockout as wrong passcodes, and the counter resets only after *both* factors pass, so guessing codes can't be repeated for free.

## What is stored in plaintext

Stored without encryption: the wrapped key and its KDF parameters, the failed-attempt counter, the reminder schedule (times of day only), each record's random ID and its type (`entry`, `photo`, …). Someone with the device's storage could therefore count records by type. They cannot read dates, contents or photos.

## Honest limitations

- **Two-step verification is an app-level lock, not a second encryption key.** Someone who has the passcode *and* copies the raw storage could decrypt it without the authenticator. It protects against casual access by someone who knows the passcode, not against a forensic attacker. (A future version could use the WebAuthn PRF extension to make a device passkey part of the key.)
- **A forgotten passcode means lost data.** This is intentional, and the user must acknowledge it during setup. Encrypted backups are the mitigation.
- **Browser storage can be cleared** by the user or the OS under storage pressure. The app encourages backups.
- **The lockout counter lives on the device**, so an attacker who copies storage can skip it. PBKDF2's cost is what protects copied data.
- **The web server's TLS and hosting** are the deployer's responsibility. Use HTTPS; the server sends HSTS when behind an HTTPS proxy.

## Verifying it yourself

- `npm test` runs 91 tests, including checks that ciphertext never contains plaintext, that a tampered or relocated ciphertext is rejected, that the everyday key can't be exported, and that the server stores no health fields.
- In the browser, open DevTools → Application → IndexedDB → `patchwork`: every record is `{ id, type, iv, ct }`.
