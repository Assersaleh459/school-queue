// Renders PDF pages to PNG for checking (uses pdf.js from a CDN inside Playwright; nothing to install).
//   node scripts/staff-guide/preview.js <file.pdf> <outDir>
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

(async () => {
  const [pdf, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const b64 = fs.readFileSync(pdf).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 1130 } });
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
  const pages = await page.evaluate(async (b64) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await pdfjsLib.getDocument({ data: atob(b64) }).promise;
    document.body.innerHTML = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 1.3 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height; c.style.display = 'block'; c.id = 'p' + i;
      document.body.appendChild(c);
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
    return doc.numPages;
  }, b64);
  for (let i = 1; i <= pages; i++) await page.locator('#p' + i).screenshot({ path: path.join(outDir, `page${i}.png`) });
  console.log('pages:', pages);
  await browser.close();
})();
