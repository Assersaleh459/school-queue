# SchoolQ — Seller / Licensing Guide

How to issue licenses and sell SchoolQ to multiple schools. **Internal — do not ship this file to customers.**

---

## The model

- You ship **one identical installer** (`SchoolQ Server Setup x.y.z.exe`) to every school.
- Each school gets a **unique license key** that you mint with the generator tool.
- The **Server build** requires activation on first launch; the **Staff build** does not (it just connects to the licensed server).
- Licenses are **perpetual** and verified **fully offline** (no activation server).

Only the **public** key ships inside the app (to verify keys). The **private** key — which mints keys — never leaves your machine.

---

## One-time setup (already done)

The signing keypair lives in `.keys/` (gitignored, never shipped):

- `.keys/license-private.pem` — **your master key. Guard it.**
- `.keys/license-public.pem` — the public half (also embedded in `electron/license.js`).

> ⚠️ **Back up `.keys/license-private.pem`** to a USB drive and/or password manager now.
> If you lose it you cannot mint new keys, and every existing customer would need re-keying with a new app build.
> If it leaks, anyone can mint free licenses — treat it like a password.

---

## Issuing a license for a new customer

```bash
# Perpetual (normal sale)
node tools/generate-license.js "Green Valley International School"

# Subscription (optional — key stops working after the date)
node tools/generate-license.js "Green Valley School" --expires 2027-01-01
```

It prints a **LICENSE KEY** (a long base64 string). Send that key to the customer. That's it.

Each key is unique, encodes the school's name, and is signed — impossible to forge.

---

## What the customer does

1. Installs `SchoolQ Server Setup.exe` on their server PC.
2. First launch shows the **Activation** screen.
3. They paste the key → **Activate** → the app restarts and runs.
4. Staff PCs install the **Staff** build and just point at the server IP — no key needed.

Activation binds the key to that server's machine ID, so a copied/cloned install won't run elsewhere.

---

## Notes & limits

- **One key = one school.** A school can't use another school's key (their name is baked in and it's bound to their machine on activation).
- **Offline limitation:** since there's no activation server, a customer who *shares their key string* could activate it on more than one machine. For "one server per school" this is rarely an issue. To hard-stop this, add **online activation** later.
- **Re-activation:** if a customer replaces their server PC, they re-run the app and re-paste the same key on the new machine.
- **Revoking a subscription:** issue keys with `--expires`; the app refuses them after that date.

---

## Quick reference

| Task | Command |
|---|---|
| Mint perpetual key | `node tools/generate-license.js "School Name"` |
| Mint subscription key | `node tools/generate-license.js "School Name" --expires YYYY-MM-DD` |
| Build installers | `npm run dist:server` and `npm run dist:staff` |
| Where customer key is stored | `%APPDATA%\SchoolQ\license.json` (on their PC) |
