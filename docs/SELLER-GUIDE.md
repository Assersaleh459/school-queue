# SchoolQ — Seller / Licensing Guide

How to issue licenses and sell SchoolQ to multiple schools. **Internal — do not ship this file, or the License Generator, to customers.**

---

## The model

- You ship **one identical installer** (`SchoolQ Server Setup x.y.z.exe`) to every school.
- Each school gets a **license key made for its server PC** (its Machine ID). The key sets:
  - **Staff devices**: how many PCs with the Staff app, or browsers, may be signed in at the same time. The server PC, the TV display and the kiosk are always free.
  - **Type**: perpetual, or a subscription with an expiry date.
- Keys are signed and checked **fully offline**. Every field is signed (school, devices, expiry, Machine ID), so a key can't be edited.
- Only the **public** key ships inside the app. The **private** key, which makes keys, never leaves your machine.

---

## The signing key (already set up)

`.keys/license-private.pem` is **your master key**. It is gitignored, never shipped, and backed up in `key-backup/`.

> ⚠️ Keep a copy on a USB stick and/or in a password manager.
> - If you **lose** it, you can't make keys any more, and every school would need a new app build.
> - If it **leaks**, anyone can make free licenses. Treat it like a password.

---

## Issuing a license: the License Generator app

Build it once with `npm run dist:generator`, then install `dist-generator\SchoolQ License Generator Setup 1.0.0.exe` **on your own PC only**.

1. **First run:** select `license-private.pem`. The app remembers where the file is, but it never copies the key, so the app is harmless if someone else gets it. If the key is on a USB stick, plug the stick in when you make licenses.
2. **Ask the school for its Machine ID.** It is shown on the activation screen of SchoolQ Server (with a Copy button) and under Admin → License.
3. **Fill in the form:**
   - school name
   - Machine ID
   - Staff devices (or Unlimited)
   - Perpetual, or Subscription with an expiry date (+1 month / +6 months / +1 year buttons)
   - notes, such as the invoice number
4. **Generate**, then **Copy key** or **Save as .txt** and send it to the school.

**History** lists every license you made. You can search it, export it to CSV (it opens in Excel with Arabic names intact), and use **Renew**, which fills the form again with the expiry one year after the old one.

It's stored in `%APPDATA%\SchoolQ License Generator\history.json`; back that file up too.

### Command line (same keys, no history)

```bash
node tools/generate-license.js "Green Valley School" --machine <MachineID> --devices 5
node tools/generate-license.js "Green Valley School" --machine <MachineID> --devices 5 --expires 2027-09-01
```

---

## What the school does

1. Installs `SchoolQ Server Setup.exe` on its server PC. The first launch shows the **Activation** screen with the **Machine ID**.
2. Sends you the Machine ID, pastes the key you send back, and presses **Activate**. The app restarts and runs.
3. Installs the **Staff** build on staff PCs. It finds the server on the network; no key is needed.

**Renewing or upgrading** (more devices, new expiry): a super admin pastes the new key in **Admin → License → Renew or upgrade**. It works immediately, with no restart.

---

## Staff devices

- A device **uses a slot** while it is in use, and for 15 minutes after its last activity.
  - Each Staff PC counts as one device, recognised by its Machine ID.
  - Each browser counts as one device.
- When all slots are in use, signing in on another device is refused with *"Device limit reached (5 of 5)…"*.
- **Admin → License** lists the devices, with last user, last seen and status. **Free slot** signs a device out immediately.

---

## Expiry (subscriptions)

| When | What the school sees |
|---|---|
| More than 30 days left | Quiet "Valid until …" on Admin → Overview |
| 30 days or less | **Amber** card on Admin → Overview: "License expires in N days" |
| 7 days or less | **Red** pulsing card |
| Expired, first 7 days (grace) | Everything still works. A **red bar on every staff screen**: "SchoolQ will stop working on …". The TV display and kiosk stay clean. |
| After the grace period | SchoolQ stops: every screen shows **"SchoolQ license has expired"** with the Machine ID and a box for a new key. No login is needed to enter it. |

---

## Voice Recordings password

To stop a school from changing voices, type a **Voice Recordings password** in the generator form when you make its license.

- The key carries only a scrambled (hashed) version, and it is signed, so the school can't remove or change it.
- At that school, the **Voice Recordings** tab is hidden. To open it, use **Settings → "Voice tools (Vyra Systems)"** (at the bottom of the page) and enter the password. It stays unlocked for that window until **Lock again**, closing SchoolQ, or 12 hours.
- Five wrong tries in a row block unlocking for 5 minutes.
- The TV display, recorded calls and "Announce on display" keep working while the page is locked.
- Your generator history keeps the readable password (hidden until you press **Show**).
- **To change a school's password:** in the generator's History, press **Renew** on that school. Type the new password (or clear it to remove the lock), **Generate**, and send the key. The school pastes it in **Admin → License → Renew or upgrade**. From that moment:
  - the old password stops working;
  - anyone who had unlocked the page is locked out again.
- The generator shows its version in the header. The password field needs **License Generator 1.1.0** or later; if you don't see it, install the new generator over the old one (your history is kept).

---

## Moving voices and the voice engine to a new school

Voice Recordings → **Backup & move**:

- **Export voices**: tick the voices to export. You get a small `.schoolq-voices` file (a few MB per voice).
- **Import voices**: choose that file at the new school, then tick which voices to bring in. A voice with the same name there is replaced; all other voices are kept.
- **Export engine / Import engine** (only on the server PC itself):
  - The voice engine becomes one `.schoolq-engine` file of about **8 GB**.
  - Import it on a new server instead of downloading.
  - Use an external disk, or a USB stick formatted **exFAT or NTFS**: FAT32 can't hold files over 4 GB.
  - An engine exported from a PC with an NVIDIA card also works on PCs without one (slower).

The fastest setup for a new school:
1. Install SchoolQ Server.
2. Activate it.
3. **Import engine**.
4. **Import voices**.
5. Choose the voices for calls and announcements.

---

## Notes

- **One key = one server PC.** A key made for another Machine ID is refused ("This license is for another PC").
- **New server PC:** the school sends you the new Machine ID, and you issue a new key (use **Renew** in the History).
- **Licenses from before 1.12.0** (the old format) keep working as perpetual, with unlimited devices and no PC lock. To put a device limit on an existing customer, issue them a new key.
- The school's license is stored in `%APPDATA%\SchoolQ\license.json` on their server PC.

---

## Quick reference

| Task | How |
|---|---|
| Make a license | License Generator app (or `node tools/generate-license.js …`) |
| Build the generator | `npm run dist:generator` → `dist-generator\` |
| Build school installers | `npm run dist:server` and `npm run dist:staff` |
| School renews / upgrades | Admin → License → Renew or upgrade |
