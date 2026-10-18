# SchoolQ — CLAUDE.md

Project-level instructions for Claude Code. These override global defaults for this repo.

## Read first, every session
1. `SchoolQ-PROGRESS.md`: what's done, what's in progress, what's next.
2. Shared lessons this project uses (loaded automatically):
@E:/Claude\ Knowledge/lessons/electron-packaging.md
@E:/Claude\ Knowledge/lessons/sqlite.md
@E:/Claude\ Knowledge/lessons/voice-tts-video.md
3. Other topics: see the lessons index in `E:\Claude Knowledge\GLOBAL-RULES.md`.

---

## Project Overview

SchoolQ is a queue management desktop app for Al-Noor International School.
Built with Electron (server + staff builds), Node.js/Express backend, SQLite (better-sqlite3), React 19 + Vite frontend, Tailwind, Zustand, Socket.io, and JWT auth.

**Two build targets:**
- **SchoolQ Server** — full build: backend + frontend + config. Runs the local server and serves the UI.
- **SchoolQ Staff** — frontend-only build. Connects to the server over the network.

---

## Version Management — MANDATORY

After every set of changes, bump the version in all four files before reporting done. Do not wait to be asked.

| File | Field |
|---|---|
| `package.json` | `"version"` |
| `src/frontend/package.json` | `"version"` |
| `config/eb-server.json` | `extraMetadata.version` |
| `config/eb-staff.json` | `extraMetadata.version` |

Use semver: patch (`x.x.N`) for fixes, minor (`x.N.0`) for new features.

---

## Session End Workflow

When the user says anything like "let's continue tomorrow", "calling it a day", "that's enough for today":
1. `git add` all changed files (by name, not `-A`)
2. Commit with a summary of what changed in this session
3. `git push`
4. Confirm it's done

Do this automatically — do not wait for a separate git instruction.

---

## Build Commands

```powershell
# Frontend build (required before any dist)
cd src/frontend && npm run build

# Full default build (uses package.json "build" config)
npm run dist

# Server-only installer
npm run dist:server

# Staff-only installer
npm run dist:staff

# Dev mode (backend + frontend hot-reload)
npm run dev

# Run tests
npm test
```

Builds output to `dist/`. Both `dist:server` and `dist:staff` use custom configs in `config/`.

---

## Architecture

```
electron/
  main.js              # Electron entry — generates per-install JWT secret, starts backend
src/
  backend/
    server.js          # Express app — rate limiters, routes, errorHandler
    database/
      db.js            # Opens SQLite, sets WAL + foreign_keys, runs migrations
      schema.sql       # Table + index definitions
      migrations/
        runner.js      # Tracked migration runner (migrations table)
    middleware/
      auth.js          # JWT verify + is_active DB check on every request
      validate.js      # express-validator rules + checkValidation()
      errorHandler.js  # Centralised error handler (last middleware)
    routes/            # admin.js, tickets.js, queue.js, etc.
    socket/
      handlers.js      # Socket.io — JWT middleware, userId→socketId map, forceLogout()
    tests/             # Jest tests — must mock DB (see Testing section)
  frontend/
    src/
      store/
        useToastStore.js  # Zustand toast store + toast.error/success/info helpers
      components/
        Toast.jsx         # Fixed-position toast overlay
      lib/
        useSocket.js      # Socket hook — sends JWT in auth, handles force_logout event
config/
  eb-server.json       # electron-builder config for server build
  eb-staff.json        # electron-builder config for staff build
  build-server.json    # Runtime mode marker (bundled as build-mode.json)
  build-client.json    # Runtime mode marker (bundled as build-mode.json)
scripts/
  generate-changelog.js  # Generates SchoolQ-Changelog.pdf via pdfkit
```

---

## Key Invariants — Never Break These

**JWT secret**: Generated once per install via `crypto.randomBytes(64)`, stored in `userData/jwt-secret.txt`, set as `process.env.JWT_SECRET` in `electron/main.js` before the backend loads. Never ship `.env` with the installer — it's excluded from `eb-server.json`.

**Auth middleware** (`src/backend/middleware/auth.js`): Every authenticated request checks `is_active` in the DB after JWT verify. This catches deactivated users even if they still hold a valid token.

**Force logout**: When a user is deactivated via `PUT /admin/users/:id`, `socketHandlers.forceLogout(userId)` is called immediately. It emits `force_logout` to all that user's open sockets. The frontend's `useSocket.js` listens for this and clears localStorage + redirects to `/login`.

**Socket auth**: `socket/handlers.js` verifies the JWT on `io.use()` middleware at connect time. Public display sockets (monitor) connect without a token and are allowed through as unauthenticated.

**Migrations**: All schema changes go through `src/backend/database/migrations/runner.js`. Never use bare `ALTER TABLE` with try/catch in `db.js` — the migration runner tracks applied migrations in a `migrations` table and is idempotent.

**Rate limiting**: `mutationLimiter` (60 req/min) applies to `/api/tickets`, `/api/queue`, `/api/admin`. General `apiLimiter` (100 req/15min) applies to all `/api` routes. Both configured in `server.js`.

**Input validation**: All POST/PUT routes use `rules.*` from `validate.js` + `checkValidation` middleware. Returns HTTP 422 with the first validation error message.

---

## Testing

Tests live in `src/backend/tests/`. Run with `npm test`.

**Critical**: `better-sqlite3` is compiled for Electron's ABI (145), not system Node's ABI (137). Any test file that imports a route or module that requires `db.js` will crash at import time unless the DB is mocked.

Always mock the DB in tests:
```js
jest.mock('../database/db', () => ({
  prepare: jest.fn(() => ({ get: jest.fn(), run: jest.fn(), all: jest.fn() })),
  transaction: (fn) => (...args) => fn(...args),
}));
```

`validate.test.js` tests middleware rules directly — no DB mock needed (no DB import path).

Jest config: `testEnvironment: node`, `testMatch: **/tests/**/*.test.js`. Note: Jest 30 uses `--testPathPatterns` (plural), not `--testPathPattern`.

---

## Known Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `NODE_MODULE_VERSION 145 vs 137` crash in tests | better-sqlite3 ABI mismatch | Mock `../database/db` with `jest.mock()` |
| `db.transaction is not a function` in test | Mock DB missing transaction | Add `transaction: (fn) => (...args) => fn(...args)` to mock |
| `--testPathPattern` deprecated warning | Jest 30 renamed flag | Use `--testPathPatterns` (plural) |
| `$env:` variables fail in Bash tool | PowerShell-only syntax | Use the PowerShell tool, not Bash |
| Edit tool "file not read" error | Edit requires prior Read | Always Read a file before editing it |
| `audio.play()` resolves too early | Resolves on playback START | Use the `ended` event for audio sequencing |
| `.env` bundled in installer | Old build config | `.env` is excluded from `eb-server.json` — keep it that way |
| `package.json` squashed onto one line after `npm install` | npm can't detect the indent from the first line `{"name": ...` | Restore the layout from git and re-apply only the real changes |
| `schoolSetup.test.js` (and `devices.test.js`) crash under `npm test` | They use the real better-sqlite3 (Electron ABI) | Run them with `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe node_modules/jest/bin/jest.js <file>` |

---

## Frontend Patterns

**Toast notifications**: Import `toast` from `useToastStore` and call `toast.error()`, `toast.success()`, `toast.info()`. Do not use `alert()` anywhere in the frontend.

**Loading skeletons**: Pages with async data fetches should show a skeleton (animated gray bars) while `loading === true`, then render the real content. See `QueueDashboard.jsx` for the pattern.

**Socket**: `useSocket` sends the JWT via `auth: { token }` in the handshake. `useMonitorSocket` is public (no auth). Both are in `src/frontend/src/lib/useSocket.js`.

---

## What Not to Do

- Do not add `.env` back to any build config files.
- Do not use bare `ALTER TABLE` with try/catch in `db.js` — use the migration runner.
- Do not call `alert()` in the frontend — use `toast.*`.
- Do not skip mocking the DB in tests that import backend routes.
- Do not amend published commits — create a new commit if something was missed.
- Do not push to remote without being asked (except end-of-session sync).
- Do not bump only some version files — all four must be updated together.

---

## Added 2026-10-17 (from sessions 12–17 Oct, v1.5.46 → v1.13.1)

**Product:** sold by Vyra Systems to schools. The live install on this PC is licensed to Farabi Language School. Repo: `github.com/Assersaleh459/school-queue` (main).

**Stack details:** Electron 41, Express, better-sqlite3 (Electron ABI 145), React 19 + Vite, Socket.io, JWT, Jest 30, and `node --test` for the frontend.
- Run real Electron from VS Code with `env -u ELECTRON_RUN_AS_NODE`, because VS Code sets that variable.
- Backend tests that need the real DB: `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe`.

**Licensing (1.12.0+):**
- Offline Ed25519 license keys, bound to a machine ID and stored in `%APPDATA%\SchoolQ\license.json`.
- The **private key** is `.keys/license-private.pem`, with a backup in `key-backup/`. Both are gitignored. **Never commit, ship or print them.**
- **License Generator** (`dist-generator\SchoolQ License Generator Setup <ver>.exe`) is for the seller's PC only. It sets the seat count and the per-school Voice Recordings password.
- **Generator history** holds readable passwords, so never commit it.

**Offline voice (1.7.0+):**
- The voice engine add-on is at `C:\ProgramData\SchoolQ\VoiceEngine` (uv Python 3.10 + torch, about 8.5 GB).
- Voices are in `%APPDATA%\SchoolQ\voice\<Voice>\`, each with `manifest.json` plus clips. "Sarah" numbers ship in `src/frontend/public/voice/`.
- Code: `src/backend/voice-engine/` (engine.js, worker.py, voicegen.py, install-engine.ps1, which must stay ASCII-only) and `src/backend/routes/voice.js`.
- Calls and announcements can use two different voices. The Voice Recordings tab is hidden behind the per-school password, reached from Settings → "Voice tools (Vyra Systems)".
- **Don't kill the live server's voice worker** while it's preparing a voice; use test ports for test servers.

**Other facts:**
- **Staff app:** finds the server by LAN discovery and handles port conflicts (1.6.0).
- **SQLite timestamps** are UTC without "Z"; append `'Z'` before parsing.
- **Ticket sequence** = the maximum issued today.
- **Testing:** don't auto-play audio on the user's PC during tests.
- **Auto-push hook:** `.git/hooks/post-commit` was removed on purpose. Don't recreate it.
