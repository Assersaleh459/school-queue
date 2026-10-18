// Wording for the license's expiry state (Admin → Overview / License, the red bar).

export const fmtDate = (ymd) => (ymd
  ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '');

const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

// Tone + wording for a license status (from GET /api/license or /api/license/status)
export function licenseMessage(lic) {
  if (!lic?.licensed) return { tone: 'muted', title: 'Unlicensed (development)', text: 'No license is installed on this server.' };
  const left = lic.daysLeft;
  switch (lic.status) {
    case 'warning':
      return { tone: 'amber', title: `License expires in ${days(left)}`, text: `Valid until ${fmtDate(lic.expires)}. Contact Vyra Systems to renew.` };
    case 'critical':
      return {
        tone: 'red',
        title: left === 0 ? 'License expires today' : `License expires in ${days(left)}`,
        text: `Valid until ${fmtDate(lic.expires)}. ${lic.grace ? `After that, ${days(lic.grace)} of grace` : 'SchoolQ stops working the day after'} — contact Vyra Systems to renew.`,
      };
    case 'grace':
      return {
        tone: 'red',
        title: `License expired on ${fmtDate(lic.expires)}`,
        text: `SchoolQ will stop working on ${fmtDate(lic.graceUntil)}. Contact Vyra Systems to renew.`,
      };
    case 'expired':
      return { tone: 'red', title: 'License expired', text: 'Enter a new license key to continue.' };
    default:
      return {
        tone: 'ok',
        title: `Licensed to ${lic.school}`,
        text: lic.expires ? `Valid until ${fmtDate(lic.expires)}` : 'Perpetual license',
      };
  }
}
