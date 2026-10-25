// Builds the one-page "System requirements" sheet (English + Arabic) for schools.
// Run: node scripts/requirements-sheet.js   → docs/requirements/SchoolQ-Requirements-en.pdf / -ar.pdf
// Rows are [what, minimum, recommended]. Only the Voice Engine's 8 GB free-disk check is enforced by the
// installer; the other figures are planning guidance, not tested limits.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'requirements');

const T = {
  en: {
    title: 'SchoolQ: System Requirements',
    sub: 'Minimum: SchoolQ runs. Recommended: smooth every-day use.',
    head: ['', 'Minimum', 'Recommended'],
    sections: [
      { h: 'SchoolQ Server (the main computer)', rows: [
        ['Windows', '64-bit Windows 10', '64-bit Windows 10 or 11, fully updated'],
        ['Processor', '2 cores', '4 cores'],
        ['Memory (RAM)', '4 GB', '8 GB'],
        ['Disk space', '2 GB free', '20 GB free, SSD (for backups and voice clips)'],
        ['Network', 'Wired LAN, fixed IP address', 'Wired gigabit LAN, fixed IP address'],
        ['Power', 'Stays on in school hours', 'Stays on in school hours, with a UPS (battery backup)'],
      ]},
      { h: 'SchoolQ Staff (reception, desks, kiosk, TV)', rows: [
        ['Windows', '64-bit Windows 10', '64-bit Windows 10 or 11'],
        ['Processor and RAM', '2 cores, 4 GB', '4 cores, 8 GB'],
        ['Disk space', '1 GB free', '2 GB free, SSD'],
        ['Network', 'Same network as the Server', 'Wired LAN to the same network'],
        ['TV display', 'Screen with speakers; desktop app', 'Full HD screen with good speakers; desktop app'],
        ['Kiosk', 'Ticket printer', 'Thermal ticket printer and a touchscreen'],
      ]},
      { h: 'Voice Engine (optional, to record voices)', rows: [
        ['Disk space', '10 GB free (setup stops below 8 GB)', '20 GB free, SSD'],
        ['Memory (RAM)', '8 GB', '16 GB'],
        ['Graphics card', 'None: the processor is used, several minutes per phrase', 'NVIDIA with 8 GB video memory or more: about 1 minute per phrase'],
        ['Internet', 'Once, about 5 GB download', 'Once, about 5 GB download'],
      ]},
    ],
    tip: 'Tip: make the voices once on a strong computer, then move them to the school Server with Backup & move. The school Server then needs no Voice Engine and no graphics card.',
  },
  ar: {
    title: 'SchoolQ: متطلبات التشغيل',
    sub: 'الحد الأدنى: يعمل SchoolQ. الموصى به: استخدام يومي سلس.',
    head: ['', 'الحد الأدنى', 'الموصى به'],
    sections: [
      { h: 'SchoolQ Server (الجهاز الرئيسي)', rows: [
        ['ويندوز', 'Windows 10 (64 بت)', 'Windows 10 أو 11 (64 بت) بآخر التحديثات'],
        ['المعالج', 'نواتان', '4 أنوية'],
        ['الذاكرة (RAM)', '4 جيجابايت', '8 جيجابايت'],
        ['مساحة القرص', '2 جيجابايت فارغة', '20 جيجابايت فارغة على قرص SSD (للنسخ الاحتياطية والتسجيلات الصوتية)'],
        ['الشبكة', 'شبكة LAN بكابل وعنوان IP ثابت', 'شبكة LAN بكابل بسرعة جيجابت وعنوان IP ثابت'],
        ['الكهرباء', 'يبقى يعمل خلال ساعات الدوام', 'يبقى يعمل خلال ساعات الدوام مع UPS (بطارية احتياطية)'],
      ]},
      { h: 'SchoolQ Staff (الاستقبال والمكاتب والكشك والشاشة)', rows: [
        ['ويندوز', 'Windows 10 (64 بت)', 'Windows 10 أو 11 (64 بت)'],
        ['المعالج والذاكرة', 'نواتان، 4 جيجابايت', '4 أنوية، 8 جيجابايت'],
        ['مساحة القرص', '1 جيجابايت فارغة', '2 جيجابايت فارغة على قرص SSD'],
        ['الشبكة', 'نفس شبكة الخادم', 'اتصال بكابل بنفس الشبكة'],
        ['شاشة العرض', 'شاشة مع سماعات، وتطبيق سطح المكتب', 'شاشة Full HD مع سماعات جيدة، وتطبيق سطح المكتب'],
        ['الكشك', 'طابعة تذاكر', 'طابعة تذاكر حرارية وشاشة لمس'],
      ]},
      { h: 'Voice Engine (اختياري، لتسجيل الأصوات)', rows: [
        ['مساحة القرص', '10 جيجابايت فارغة (يتوقف التثبيت إذا قلّت عن 8)', '20 جيجابايت فارغة على قرص SSD'],
        ['الذاكرة (RAM)', '8 جيجابايت', '16 جيجابايت'],
        ['كرت الشاشة', 'لا يلزم: يُستخدم المعالج، ويحتاج عدة دقائق لكل جملة', 'كرت NVIDIA بذاكرة 8 جيجابايت أو أكثر: حوالي دقيقة لكل جملة'],
        ['الإنترنت', 'مرة واحدة، تحميل حوالي 5 جيجابايت', 'مرة واحدة، تحميل حوالي 5 جيجابايت'],
      ]},
    ],
    tip: 'نصيحة: أنشئ الأصوات مرة واحدة على جهاز قوي، ثم انقلها إلى خادم المدرسة بخاصية Backup & move. عندها لا يحتاج خادم المدرسة إلى Voice Engine ولا إلى كرت شاشة.',
  },
};

function html(lang) {
  const t = T[lang];
  const rtl = lang === 'ar';
  const head = `<tr>${t.head.map((c) => `<th class="h">${c}</th>`).join('')}</tr>`;
  const body = t.sections.map((s) => `<h2>${s.h}</h2><table>${head}${s.rows.map(([a, b, c]) => `<tr><th>${a}</th><td>${b}</td><td>${c}</td></tr>`).join('')}</table>`).join('');
  const align = rtl ? 'right' : 'left';
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm 15mm; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1a2142; font-size: 10.5pt; line-height: 1.4; margin: 0; }
    h1 { margin: 0; font-size: 22pt; color: #19224A; } .sub { color: #5b6480; margin: 2px 0 8px; }
    h2 { font-size: 13pt; margin: 11px 0 4px; color: #19224A; border-bottom: 2px solid #19b3a6; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 4px 8px; border: 1px solid #d7dbe6; vertical-align: top; text-align: ${align}; }
    th { width: 22%; background: #f1f4f9; } td { width: 39%; }
    th.h { background: #19224A; color: #fff; }
    .tip { margin-top: 12px; padding: 8px 12px; background: #e8f7f5; border-${align}: 4px solid #19b3a6; }
  </style></head><body><h1>${t.title}</h1><div class="sub">${t.sub}</div>${body}<div class="tip">${t.tip}</div></body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const lang of ['en', 'ar']) {
    const page = await browser.newPage();
    await page.setContent(html(lang));
    await page.pdf({ path: path.join(OUT, `SchoolQ-Requirements-${lang}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.close();
  }
  await browser.close();
  console.log('Built', OUT);
})();
