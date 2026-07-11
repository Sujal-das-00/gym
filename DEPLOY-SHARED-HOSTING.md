# Deploying to shared hosting — gymbot.toolszila.com

This project is a **Node.js (Express) + MySQL** app. The admin panel, the member
check-in page, and the JSON API are all served by the same Node process, so they
run on one subdomain with no separate frontend build.

> ⚠️ **Requirement:** your shared hosting must support **Node.js apps**
> (cPanel "Setup Node.js App", powered by Phusion Passenger — the common case).
> A PHP-only plan cannot run this. If you're unsure, check cPanel for a
> **"Setup Node.js App"** icon. If it isn't there, see *"If Node.js isn't
> available"* at the bottom.
>
> Good news: the only dependencies are `express`, `mysql2`, and `qrcode` — all
> pure JavaScript, so there's nothing to compile on the server.

---

## 1. Create the MySQL database (cPanel → MySQL Databases)

1. Create a database, e.g. `cpuser_gym`.
2. Create a database user with a strong password.
3. **Add the user to the database** and grant **All Privileges**.
4. Note the final names — cPanel prefixes them with your account, e.g.
   `cpuser_gym`, `cpuser_gymuser`. You do **not** need to import any SQL:
   the app creates its tables automatically on first start
   (`backend/schema.sql` uses `CREATE TABLE IF NOT EXISTS`).

## 2. Point the subdomain at an app folder

1. cPanel → **Subdomains** → create `gymbot.toolszila.com` (if it doesn't exist).
2. Set its **Document Root** to something like
   `/home/CPANEL_USER/gymbot.toolszila.com`.

## 3. Upload the project

Upload everything **except** `node_modules/`, `.env`, and `.git/` into the
subdomain folder. The tree should contain `app.js`, `backend/`,
`admin-frontend/`, `checkin-frontend/`, `package.json`, `package-lock.json`.

Easiest options:
- **Git:** in cPanel → *Git Version Control*, clone your repo, or
- **Zip:** upload a zip via File Manager and Extract.

## 4. Create the environment file (`.env`)

Copy `deploy/env.production` to the project root as **`.env`** and fill in the
real database credentials from step 1:

```
APP_BASE_URL=https://gymbot.toolszila.com
DB_HOST=localhost
DB_PORT=3306
DB_USER=cpuser_gymuser
DB_PASSWORD=your-db-password
DB_NAME=cpuser_gym
REQUIRE_DB=true
```

- `APP_BASE_URL` is what makes the **check-in QR code** and shareable link point
  at `https://gymbot.toolszila.com` instead of an internal IP.
- Do **not** set `PORT` — the hosting platform assigns it automatically.

## 5. Create the Node.js app (cPanel → Setup Node.js App)

1. Click **Create Application**.
2. **Node.js version:** 18 or newer.
3. **Application mode:** Production.
4. **Application root:** the subdomain folder (e.g. `gymbot.toolszila.com`).
5. **Application URL:** `gymbot.toolszila.com`.
6. **Application startup file:** `app.js`.
7. Create the app, then click **Run NPM Install** (installs `express`,
   `mysql2`, `qrcode`).
8. Click **Restart**.

cPanel writes the required Passenger `.htaccess` into the subdomain root for you
— you normally don't touch it. `deploy/htaccess.reference` is included only for
hosts that need it written manually.

## 6. Verify

Open, in order:
- `https://gymbot.toolszila.com/`  → redirects to the admin panel
- `https://gymbot.toolszila.com/admin`   → admin loads
- `https://gymbot.toolszila.com/checkin` → check-in page loads
- The QR code in the admin panel should encode
  `https://gymbot.toolszila.com/checkin` (scan it with a phone to confirm).

If a page errors, open the app's **log** in *Setup Node.js App* (or
`stderr.log` in the app root). The most common cause is wrong DB credentials in
`.env` — with `REQUIRE_DB=true` the app refuses to start rather than losing data,
and the log line tells you exactly what failed.

---

## Uploads persistence

Member/logo images are written to `backend/uploads/` on the server's disk. They
survive restarts. **They do not survive a fresh redeploy that wipes the folder**,
so if you redeploy by replacing the whole directory, preserve `backend/uploads/`
(and `backend/data/`) or move to object storage later.

## Updating the app later

1. Upload the changed files (keep `.env`, `backend/uploads/`, `backend/data/`).
2. If dependencies changed, **Run NPM Install** again.
3. **Restart** the app in *Setup Node.js App*.

---

## ⚠️ Security: the admin panel has no login

Right now anyone who visits `https://gymbot.toolszila.com/admin` has full
control of your member and payment data — there is no authentication. Before
this is truly public you should add protection. Quickest options:

- **cPanel → Directory Privacy** password on the subdomain (coarse but instant), or
- App-level login / HTTP Basic auth on `/admin` and `/api` (cleaner).

I can add app-level auth for you — just ask.

---

## If Node.js isn't available on your plan

This app requires a Node.js runtime; it can't run on PHP-only hosting as-is.
Your options, cheapest effort first:

1. **Upgrade / switch** to a plan with "Setup Node.js App" (most cPanel hosts
   and providers like A2, Namecheap, Hostinger offer it).
2. **Host the Node app elsewhere** (Render, Railway, Fly.io, a small VPS) and
   just point `gymbot.toolszila.com` (a DNS record) at it. The code needs no
   changes — set `APP_BASE_URL` to the same domain.

Tell me which hosting you're on and I'll tailor the exact steps.
