# SchoolQ: progress

Last updated: 2026-10-19. Current version **1.16.0** (committed and pushed; includes 1.15.2). 1.15.1 is pushed to GitHub `main`. License Generator **1.2.0**.

## Done (recent)
| Version | What |
|---|---|
| 1.5.46 → 1.6.0 | Bug fixes + e2e. New license signing key (1.5.49). Staff "Test Connection" fix. LAN server discovery, self-healing Staff startup, port-conflict handling |
| 1.7.0 → 1.10.0 | Offline recorded voice: clip system, Voice Engine on the server, Voice Recordings page, 📢 announcements, any of 17 voices, separate voices for calls and announcements, priority queue, smart media pause, call banner over video, engine pause/resume |
| 1.11.0 | Listen & fix: hear every clip of a voice, flag it, redo it, compare old vs new take |
| 1.12.0 | Licensing: offline machine-bound license keys, seat limits for Staff, Admin → License tab, License Generator app |
| 1.13.0 | Per-school Voice Recordings password (set in the License Generator). Voices/engine **Backup & move** (`.schoolq-voices`, `.schoolq-engine`). A Settings scroll-jump fix |
| 1.13.1 | A changed voice password takes effect at once. License Generator 1.1.0, with password history and a Show button |
| 1.13.2 | Neutral installer: new installs start as "My School" (seed, fallbacks, setup screen, package description). Handover checklist in `docs/SELLER-GUIDE.md`. Existing installs keep their name |
| 1.14.0 | License security. **Grace per key** (generator field, 0–60 days, default 0; fixed 7 days removed). **Trusted clock** (`electron/trustedClock.js`): setting the PC date back doesn't extend a license; 3 sealed copies (clock.dat, HKCU registry in the installed app only, `app_state` table via migration 008) + newest ticket + key issue day; "PC date is wrong" notice + `CLOCK_SET_BACK` audit entry; a newer key resets it. **Clone guard** (`src/backend/licenseGuard.js`): same license on two servers on one network → the later one blocks itself. **Electron fuses** (asar integrity, no run-as-node). **Clean install**: only the admin user (no example departments/services/announcement) |

| 1.15.0 | **Voices export carries the school setup**: call wording, departments + services, announcements, voice choices (`src/backend/schoolSetup.js`, in `pack.json`). Import shows tick boxes and only adds (departments matched by EN/AR name; taken codes get a number; services by name; announcements by text). Kiosk/Reception "No departments yet" hints |
| 1.15.1 | **Voice text cleanup** (`speakable()` in `voicegen.py`): symbols like `|` / `*` become a pause, "8 - 3" becomes "8 to 3" / "إلى", English digits become English words (VoiceTut's normalizer read all digits as Arabic). Existing clips recorded before this must be redone |
| 1.15.2 | **Default password must be changed.** Signing in with `admin123` marks the login token; the server then refuses every request except "who am I" and "change password" (403 `must_change_password`), and the app shows a "Choose a new password" screen that can't be skipped. `admin123` can't be chosen as the new password. Changing it returns a fresh normal token. Kiosk and display screens don't sign in, so they aren't affected. The Home → 🔑 Password window now asks for 8+ characters, the same as the server (it allowed 6) |
| 1.16.0 | **Fresh Start** tab (Vyra only: shown when the license has a voice password, the tools are unlocked and the user is super_admin). `POST /api/voice/wipe` asks for the voice password again + `WIPE`; `src/backend/wipe.js` backs up the DB and moves the voice folder to `backups/before-wipe/`, empties all school tables (keeps `app_state` + `migrations`), re-seeds one admin (`admin123`) with a **new user_id** so old logins fail. Seed moved to `src/backend/database/seed.js`. **Delete phrase entirely** (❌ in "Your phrases" and in Listen & fix): removes it from every voice, its flags and the queue. **"🎙 Not recorded"** label + info toast in Announcements when the announcement voice has no recording (recorded mode only) |
| tooling | Playwright 1.64.1 (`@playwright/test` dev dependency), browsers in `E:\ms-playwright` (user env `PLAYWRIGHT_BROWSERS_PATH`, 718 MB) |

Tests at 1.15.1: 90 backend under Node + 11 under Electron (`devices.test.js`, `schoolSetup.test.js`) + 8 frontend; voices export→import e2e with Playwright 17/17 (scratch script); `speakable()` 10/10.

Tests at 1.14.0: 95 backend (run `devices.test.js` under Electron, see SchoolQ-CLAUDE.md) + 8 frontend + generator harness 10/10. Live-tested on test servers: set-back clock blocks an expired license and writes the audit entry; clone guard blocks the second server and unblocks ~2 min after the first stops; the built 1.14.0 Server app runs with fuses, and a copy with one changed byte refuses to start.

Tests at 1.15.2: 95 backend under Node (5 new for the password rule) + 11 under Electron + 8 frontend; browser test on a fresh test server 8/8 (forced screen, 403 until changed, survives reload, `admin123` refused, home opens after, new token works, old password rejected).

Tests at 1.16.0: 104 backend under Node (9 new: `voiceRoutes.test.js`, 2 engine tests) + 13 under Electron (`devices`, `schoolSetup`, new `wipe.test.js`) + 9 frontend; frontend build OK; browser test on a clean test server (port 3951, test license with a voice password, this PC only, 3-day expiry) 21/21: fresh install = 1 user and empty tables, tab hidden until unlocked and for admin role, ❌ in both lists, "Not recorded" label/toast (gone once recorded, none in online mode), wrong password refused, wipe → login → `admin123` → forced new password, backups present.

## In progress
- 1.15.2 + 1.16.0 are committed and pushed, but **installers are not built** yet (`npm run dist:server`, `npm run dist:staff`). 1.15.1 installers are in `dist\`; `dist-generator\SchoolQ License Generator Setup 1.2.0.exe`.
- `config/settings.json` (unused sample departments) was deleted in 1.16.0. 🗑 "delete recording only" now also refreshes Listen & fix.

## Next
- **User:** install License Generator 1.2.0 over the old one (history is kept).
- **User:** decide when to update Farabi's live server (its license is perpetual v1, so expiry/grace don't affect it). From 1.15.2, anyone there still signing in with `admin123` will be asked for a new password on their next sign-in, so tell the school first.
- **Later version: AM/PM pacing**, saved in `docs/later/voice-pacing-am-pm.patch` (not in the code or the 1.15.1 installers). Words read letter by letter (AM, PM, SMS, ID) get more speaking time so the clip isn't rushed; other texts keep their speed. Tested by ear: "School hours: 8 AM - 3 PM…" 2.8 s → 3.5 s, user approved; keep `SPELLED_LETTER = 2.5`. Apply with `git apply docs/later/voice-pacing-am-pm.patch`, then bump the version.
- **User:** after updating, re-record the announcements and phrases that contain numbers or symbols (Voice Recordings → Listen & fix → redo), since old clips were made with the old text handling.
- Not verified by ear: the 1.15.1 voice text fix (text checked 10/10; a test clip couldn't be made: the 4 GB GPU ran out of memory twice).
- Not run-tested yet: the installed Staff 1.14.0 app and the installed Generator 1.2.0 (both built fine; the generator's code was tested from source).

## Known issues / reminders
- **Live admin account still uses the default password.** Change it before handing to a school (1.15.2+ forces it on the next sign-in).- **Two untracked files the user didn't ask to commit:** `2026-10-15-170512-this-session-...txt` (a saved transcript) and `docs/SELLER-GUIDETXT.txt` (an old copy). Keep or delete them.
- **Version bump:** after every change, bump all 4 version files (see SchoolQ-CLAUDE.md).
