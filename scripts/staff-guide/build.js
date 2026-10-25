// Builds the staff guide PDFs from content.js using Playwright's Chromium (handles Arabic shaping + RTL).
//   node scripts/staff-guide/build.js
// Output: docs/staff-guide/pdf/en/*.pdf and docs/staff-guide/pdf/ar/*.pdf
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { ui, sheets } = require('./content');

const ROOT = path.join(__dirname, '../../docs/staff-guide');
const IMG = path.join(ROOT, 'img');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function html(sheet, lang) {
  const t = sheet[lang];
  const rtl = lang === 'ar';
  const u = ui[lang];
  const steps = t.steps.map(([text, img], i) => `
    <li><div class="n">${i + 1}</div><div class="b"><p>${md(text)}</p>
    ${img ? `<img src="file:///${path.join(IMG, img).replace(/\\/g, '/')}">` : ''}</div></li>`).join('');
  const tips = t.tips.map((x) => `<li>${md(x)}</li>`).join('');
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 16mm 15mm 18mm; }
    * { box-sizing: border-box; }
    body { font-family: ${rtl ? "'Segoe UI', Tahoma, Arial" : "'Segoe UI', Arial"}, sans-serif; color: #1a2142; font-size: 12.5pt; line-height: 1.55; margin: 0; }
    header { background: #1a2142; color: #fff; padding: 14px 18px; border-radius: 8px; margin-bottom: 14px; }
    header small { color: #5eead4; font-size: 10pt; }
    h1 { margin: 2px 0 0; font-size: 22pt; }
    .intro { font-size: 13pt; margin: 0 0 14px; }
    h2 { font-size: 14pt; color: #0f766e; margin: 14px 0 8px; }
    ol { list-style: none; padding: 0; margin: 0; }
    li { break-inside: avoid; }
    ol > li { display: flex; gap: 12px; margin-bottom: 12px; }
    .n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: #0f766e; color: #fff; text-align: center; line-height: 28px; font-weight: 700; }
    .b { flex: 1; } .b p { margin: 2px 0 6px; }
    img { max-width: 100%; max-height: 90mm; object-fit: contain; object-position: ${rtl ? 'right' : 'left'} top; border: 1px solid #d7dbe6; border-radius: 6px; }
    .tips { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 6px 16px; break-inside: avoid; margin-top: 14px; }
    .tips ul { margin: 4px 0; padding-${rtl ? 'right' : 'left'}: 20px; } .tips li { margin: 4px 0; }
    b { color: #0b3b66; }
  </style></head><body>
    <header><small>${u.footer}</small><h1>${esc(t.title)}</h1></header>
    <p class="intro">${md(t.intro)}</p>
    <h2>${u.steps}</h2><ol>${steps}</ol>
    <div class="tips"><h2 style="margin-top:4px">${u.tips}</h2><ul>${tips}</ul></div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const lang of ['en', 'ar']) {
    const dir = path.join(ROOT, 'pdf', lang);
    fs.mkdirSync(dir, { recursive: true });
    for (const s of sheets) {
      const file = path.join(ROOT, `.tmp-${lang}-${s.id}.html`); // file:// so local images load
      fs.writeFileSync(file, html(s, lang));
      await page.goto('file:///' + file.replace(/\\/g, '/'));
      await page.pdf({
        path: path.join(dir, `${s.id}-${lang}.pdf`), format: 'A4', printBackground: true,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
        margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
      });
      fs.unlinkSync(file);
      console.log('✓', lang, s.id);
    }
  }
  await browser.close();
})();
