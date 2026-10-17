# SchoolQ: progress

Last updated: 2026-10-17. Current version **1.13.2**.

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

Tests at 1.13.2: 74 backend (run `devices.test.js` under Electron, see SchoolQ-CLAUDE.md) + 8 frontend unit tests.

## In progress
- Nothing. The last session ended with everything committed and pushed.

## Next
- **User:** install `dist-generator\SchoolQ License Generator Setup 1.1.0.exe` over the old 1.0.0. The old one has no password field.
- No new feature requested yet.

## Known issues / reminders
- **Live admin account still uses the default password.** Change it before handing to a school.
- **New installs still use `admin` / `admin123`.** Nothing forces a change; the handover checklist says to change it at once.
- **Two untracked files the user didn't ask to commit:** `2026-10-15-170512-this-session-...txt` (a saved transcript) and `docs/SELLER-GUIDETXT.txt` (an old copy). Keep or delete them.
- **Version bump:** after every change, bump all 4 version files (see SchoolQ-CLAUDE.md).
