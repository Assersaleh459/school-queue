# Staff guide PDFs

10 sheets × 2 languages (English, Arabic right-to-left) in `pdf/en/` and `pdf/ar/`. Everyday screens only (no Admin Panel).

## Rebuild
1. **Screenshots** (only if the app's screens changed). Start a TEST server on a NEW empty folder (the script expects `admin` / `admin123`):
   `ELECTRON_RUN_AS_NODE=1 NODE_ENV=production PORT=3971 DB_PATH=<empty folder>/queue.db JWT_SECRET=<random> ./node_modules/electron/dist/electron.exe src/backend/server.js`
   then `node scripts/staff-guide/screenshots.js`. Stop the server afterwards. Never use a live school server.
2. **Text:** edit `scripts/staff-guide/content.js` (English and Arabic side by side). Button names stay in English because the app is English-only.
3. **PDFs:** `node scripts/staff-guide/build.js` (Playwright Chromium; handles Arabic).
4. **Check pages as images:** `node scripts/staff-guide/preview.js <file.pdf> <outDir>` (loads pdf.js from a CDN).
