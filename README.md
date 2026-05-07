# SchoolQ — Queue Management System

Al-Noor International School queue management system.

## Windows Installation

1. Download `SchoolQ Setup 1.0.0.exe` from the `dist/` folder
2. Run the installer (allow UAC prompt if shown)
3. Launch from the Desktop shortcut or Start Menu

## First-Time Setup

1. Login with the default admin credentials:
   - **Username:** `admin`
   - **Password:** `admin123`
2. **Immediately change the admin password** via Admin → Users → Edit
3. Go to **Admin → Users** and create staff accounts
4. Go to **Admin → Settings** and configure the school name and preferences
5. Go to **Admin → Departments** and configure departments

## Security Checklist (Before Going Live)

- [ ] **Change the default admin password** (`admin123` is publicly known)
- [ ] **Change `JWT_SECRET` in `.env`** — replace `school-queue-secret-2024-change-in-production` with a strong random string (e.g. run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
- [ ] Keep `.env` out of version control — it is already in `.gitignore`, do not commit it
- [ ] Back up the database regularly from `C:\Users\<username>\AppData\Roaming\SchoolQ\`

## Usage

| URL | Who uses it |
|-----|------------|
| `/` | Redirects to login |
| `/reception` | Reception staff — create tickets |
| `/queue` | Department staff — call/serve tickets |
| `/admin` | Admin — manage users, departments, settings |
| `/display` | Public TV screen — full-screen queue display |
| `/reports` | Admin — daily reports and exports |

## Accessing from Other Computers on the Same Network

1. On the server PC, run `ipconfig` in Command Prompt and note the IPv4 address (e.g. `192.168.1.10`)
2. On other PCs or tablets, open a browser and go to `http://192.168.1.10:3000`
3. Log in with staff credentials

The display monitor (`/display`) is public — no login required — suitable for a TV or kiosk.

## Building the Installer

```
# Install dependencies
npm install
cd src/frontend && npm install && cd ../..

# Build installer
npm run dist
```

Output: `dist/SchoolQ Setup 1.3.1.exe`

Requires: Node.js 18+, Windows build tools for native modules.

## Development

```
npm run dev          # Start backend + frontend dev servers concurrently
npm run electron:dev # Test inside Electron window (backend must be running)
```

## Database

The production database is stored in:
`C:\Users\<username>\AppData\Roaming\SchoolQ\school-queue.db`

This location is writable and survives app updates. Back it up regularly.

## Support

Email: asserhegazy@vyra-systems.com
