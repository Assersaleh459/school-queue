// Staff guide screenshots: fills a TEST server with sample data, then photographs each screen.
// Never point this at a live school server — it changes the admin password and adds data.
//
//   1. Start a test server on its own empty database (see docs/staff-guide/README.md)
//   2. node scripts/staff-guide/screenshots.js        (GUIDE_BASE defaults to http://localhost:3971)
//
// Output: docs/staff-guide/img/*.png
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.GUIDE_BASE || 'http://localhost:3971';
const OUT = path.join(__dirname, '../../docs/staff-guide/img');
const PASS = 'GuideSample2026';

async function api(method, url, body, token) {
  const res = await fetch(BASE + '/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const login = (username, password = PASS) => api('POST', '/auth/login', { username, password });

async function seed() {
  let admin = await login('admin', 'admin123').catch(() => null);
  if (!admin) throw new Error('Expected a fresh test server (admin / admin123). Start one on an empty database.');
  admin = await api('PUT', '/auth/change-password', { current_password: 'admin123', new_password: PASS }, admin.token);
  const t = admin.token;

  await api('PUT', '/admin/settings', { school_name: 'Sample School', voice_mode: 'online', max_wait_alert_minutes: '15' }, t);

  const depts = [
    { name: 'Admissions', name_ar: 'القبول', code: 'ADM', color_code: '#0f766e', room_number: '101',
      services: [['New registration', 10], ['Documents', 5]] },
    { name: 'Accounts', name_ar: 'الحسابات', code: 'ACC', color_code: '#b45309', room_number: '102',
      services: [['Fee payment', 5], ['Payment plan', 10]] },
    { name: 'Student Affairs', name_ar: 'شؤون الطلاب', code: 'STU', color_code: '#6d28d9', room_number: '103',
      services: [['Certificates', 5], ['Transfer request', 10]] },
  ];
  const ids = {};
  for (const [i, d] of depts.entries()) {
    const { department_id } = await api('POST', '/admin/departments', { ...d, display_order: i + 1, is_active: true }, t);
    ids[d.code] = { id: department_id, services: [] };
    for (const [name, minutes] of d.services) {
      const { category_id } = await api('POST', `/admin/departments/${department_id}/categories`, { name, estimated_time_minutes: minutes, is_active: true }, t);
      ids[d.code].services.push(category_id);
    }
  }

  await api('POST', '/admin/users', { username: 'reception1', password: PASS, full_name: 'Sara Ahmed', role: 'staff', is_active: true, allowed_pages: ['reception'] }, t);
  await api('POST', '/admin/users', { username: 'admissions1', password: PASS, full_name: 'Omar Khaled', role: 'staff', department_id: ids.ADM.id, is_active: true }, t);
  await api('POST', '/admin/users', { username: 'supervisor', password: PASS, full_name: 'Hana Mahmoud', role: 'admin', is_active: true }, t);

  const tickets = [
    ['ADM', 0, 'Ahmed Hassan', 'Youssef Ahmed', 'urgent', 'Registration for grade 4'],
    ['ADM', 1, 'Mona Ali', 'Laila Samir', 'regular', 'Birth certificate copy'],
    ['ADM', 0, 'Khaled Nabil', 'Adam Khaled', 'elderly', ''],
    ['ADM', 1, 'Rania Fathy', 'Malak Tarek', 'regular', ''],
    ['ADM', 0, 'Tamer Said', 'Ali Tamer', 'regular', ''],
    ['ACC', 0, 'Nour Ibrahim', 'Jana Waleed', 'regular', 'Second term fees'],
    ['ACC', 1, 'Hassan Mostafa', 'Omar Hassan', 'vip', ''],
    ['ACC', 0, 'Dina Adel', 'Farida Karim', 'regular', ''],
    ['STU', 0, 'Mahmoud Reda', 'Ziad Mahmoud', 'regular', 'Certificate for embassy'],
    ['STU', 1, 'Salma Gamal', 'Hamza Ehab', 'regular', ''],
  ];
  for (const [code, s, parent_name, student_name, priority, purpose] of tickets) {
    await api('POST', '/tickets', { department_id: ids[code].id, category_id: ids[code].services[s], parent_name, student_name, priority, purpose }, t);
  }

  const staff = await login('admissions1');
  const called = await api('POST', `/queue/departments/${ids.ADM.id}/call-next`, { staff_id: staff.user.user_id }, staff.token);
  await api('PUT', `/queue/tickets/${called.ticket.ticket_id}/recall`, {}, staff.token);
  await api('POST', `/queue/departments/${ids.ACC.id}/call-next`, { staff_id: admin.user?.user_id || 1 }, t);

  await api('POST', '/announcements', { message_text: 'Please have your documents ready when your number is called.', message_text_ar: 'يرجى تجهيز المستندات عند النداء على رقمك.', speak_language: 'both', display_order: 1, is_active: true }, t);
  await api('POST', '/announcements', { message_text: 'The school office closes at 2 PM on Thursdays.', message_text_ar: 'يغلق مكتب المدرسة الساعة ٢ ظهراً يوم الخميس.', speak_language: 'both', display_order: 2, is_active: true, repeat_count: 3, repeat_gap_minutes: 5 }, t);

  return {
    reception: await login('reception1'),
    staff,
    supervisor: await login('supervisor'),
  };
}

// A browser page already signed in as `session` (no extra logins: the server limits them)
async function pageFor(browser, session, viewport = { width: 1366, height: 768 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-US' });
  if (session) {
    await ctx.addInitScript(([token, user]) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', user);
    }, [session.token, JSON.stringify(session.user)]);
  }
  return ctx.newPage();
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 1200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !!opts.full });
  console.log('  ✓', name);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Seeding sample data on', BASE);
  const s = await seed();
  const browser = await chromium.launch();

  // Signing in + Home
  let p = await pageFor(browser, null);
  await p.goto(BASE + '/login');
  await p.fill('input[type=text]', 'reception1');
  await p.fill('input[type=password]', 'password');
  await shot(p, 'login');

  p = await pageFor(browser, s.supervisor);
  await p.goto(BASE + '/home');
  await shot(p, 'home', { full: true });
  await p.click('text=🔑 Password');
  await shot(p, 'home-password', { wait: 500 });

  // Reception
  p = await pageFor(browser, s.reception);
  await p.goto(BASE + '/reception');
  await p.waitForTimeout(800);
  await p.selectOption('select >> nth=0', { label: 'Admissions' });
  await p.waitForTimeout(800);
  await p.selectOption('select >> nth=1', { label: 'Documents (5 min)' });
  const inputs = p.locator('main input[type=text]');
  await inputs.nth(0).fill('Walid Fouad');
  await inputs.nth(1).fill('Salma Walid');
  await inputs.nth(2).fill('S-2214');
  await p.fill('input[type=tel]', '0100 123 4567');
  await p.fill('textarea', 'Copy of school report');
  await shot(p, 'reception-form', { full: true });
  await p.click('text=CREATE & PRINT TICKET');
  await shot(p, 'reception-ticket', { full: true });

  // My Queue (Queue Dashboard)
  p = await pageFor(browser, s.staff);
  await p.goto(BASE + '/queue');
  await shot(p, 'queue', { full: true, wait: 2000 });
  await p.click('button:has-text("TRANSFER")');
  await p.selectOption('select', { label: 'Accounts' });
  await p.fill('input[placeholder="e.g. Wrong department"]', 'Needs to pay fees first');
  await shot(p, 'queue-transfer', { wait: 400 });

  // All Queues, Queue Control, Announcements, Reports
  p = await pageFor(browser, s.supervisor);
  await p.goto(BASE + '/all-queues');
  await shot(p, 'all-queues', { full: true, wait: 2000 });
  await p.click('button:has-text("Transfer") >> nth=1');
  await shot(p, 'all-queues-transfer', { wait: 400 });

  await p.goto(BASE + '/queue-control');
  await shot(p, 'queue-control', { full: true, wait: 2000 });

  await p.goto(BASE + '/announcements');
  await shot(p, 'announcements', { wait: 1500 });
  await p.locator('button:has-text("Announce")').nth(1).click();
  await shot(p, 'announcements-repeating', { wait: 1500 });

  await p.goto(BASE + '/reports');
  await p.click('button:has-text("Generate Report")');
  await shot(p, 'reports', { full: true, wait: 2500 });
  await p.click('button:has-text("Ticket Log")');
  await p.click('button:text-is("Generate")');
  await shot(p, 'reports-ticket-log', { wait: 2500 });

  // Kiosk (no sign-in) — stops before a ticket is made, so nothing prints
  p = await pageFor(browser, null);
  await p.goto(BASE + '/kiosk');
  await shot(p, 'kiosk-welcome');
  await p.click('text=Get a Ticket');
  await p.fill('input[placeholder="Enter your full name"]', 'Walid Fouad');
  await p.fill('input[placeholder="Enter student\'s name"]', 'Salma Walid');
  await shot(p, 'kiosk-details', { wait: 400 });
  await p.click('text=Next →');
  await shot(p, 'kiosk-department', { wait: 600 });
  await p.click('button:has-text("Admissions")');
  await shot(p, 'kiosk-service', { wait: 800 });

  // TV display
  p = await pageFor(browser, null, { width: 1920, height: 1080 });
  await p.goto(BASE + '/display');
  await shot(p, 'display', { wait: 3000 });

  await browser.close();
  console.log('Done →', OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
