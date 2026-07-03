# NGG Platform — production setup

A clean deploy from scratch. **~20 minutes.** The whole backend now runs on the
shared host — there is no external service on the request path.

## Architecture in one diagram

```
[Phone / Browser]
      │  HTTPS, signed cookies
      ▼
┌───────────────────────────────────┐
│  Shared host (PHP 8.1+)           │
│  /index.html (static SPA bundle)  │
│  /api/*  → PHP routes → domain     │
│           layer → PDO             │
│  ┌─────────────────────────────┐  │
│  │ Database (source of truth)  │  │
│  │  SQLite (default) or MySQL  │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
        │  (optional, cron, one-way)
        ▼
   Google Sheets  ← read-only admin mirror
```

- The **database is the single source of truth**. SQLite by default (a file on
  the host, auto-migrating); MySQL/MariaDB for higher traffic.
- **No Google round-trip on any request.** The old Apps Script backend is gone;
  an optional cron pushes a read-only snapshot to a Sheet for admins who like a
  spreadsheet view (see `apps-script/README.md`). Skip it entirely if you don't.
- Email goes out via SMTP (recommended) or PHP `mail()`.
- Media uploads go **straight from the browser to Cloudinary**, authorized by a
  short-lived signature the PHP layer mints (the api_secret never ships to the
  client).

## Prerequisites

- PHP **8.1+** with `pdo_sqlite` (default) or `pdo_mysql`, plus `curl` +
  `openssl` (standard on every shared host).
- Apache with `mod_rewrite` + `mod_headers` (default on cPanel).
- Node 18+ **on your laptop** to build the frontend bundle (not needed on the host).

## Step 1 — Build the frontend

On your machine, from the repo root:

```bash
npm install      # one-time: fetches esbuild
npm run build    # → writes dist/ (minified bundle + copied static assets + api/)
```

`dist/` is a self-contained deploy target. It contains the compiled SPA, the CSS,
the `api/` tree, and everything the app references.

## Step 2 — Upload

Upload the **contents of `dist/`** to `public_html/` (or the subfolder your domain
maps to). `dist/` deliberately excludes `api/config.php` and the local SQLite file
— you create those on the host in the next step.

## Step 3 — Configure

1. Copy `api/config.example.php` to `api/config.php` (git-ignored). Fill in:
   - `cookie_secret` — `openssl rand -hex 64`.
   - `app_origin` — your final HTTPS URL (no trailing slash).
   - `db` — leave `dsn` empty for SQLite (simplest), or point it at MySQL.
   - `mail` — SMTP host/user/pass for reliable delivery (or leave blank to use
     PHP `mail()`).
   - `cloudinary` — cloud name + key + secret if you want direct uploads
     (leave `cloud_name` blank to disable; the UI falls back to pasting URLs).
2. Permissions:
   - `api/config.php` → `600` (web user reads it, nobody else).
   - `api/storage/` → writable by the web user (holds the SQLite DB + WAL).
   - `api/_cache/` → writable (public-read cache + rate-limit state).
3. Confirm the deny rules work — visit `https://yourdomain.com/api/config.php`.
   You must get **403/404**, never PHP source.

### SQLite vs MySQL

- **SQLite (default):** nothing to do. The schema auto-migrates on the first
  request; the DB lives at `api/storage/ngg.db`. Great for a single site.
- **MySQL/MariaDB:** create a database + user, set `db.dsn` (e.g.
  `mysql:host=localhost;dbname=ngg;charset=utf8mb4`) + username/password, then
  apply `db/schema-mysql.sql` once via phpMyAdmin or the CLI.

## Step 4 — Smoke test

```bash
curl https://yourdomain.com/api/public/stats.php     # → JSON stats (zeros on a fresh DB)
curl https://yourdomain.com/api/public/config.php    # → { uploads: {...} }
```

Then open `https://yourdomain.com/` and create your first admin:

```bash
php api/tools/create-admin.php "Ada Admin" admin@yourdomain.com   # from the host shell if available
```

(No shell? Insert a row into `members` with `role = super_admin` via phpMyAdmin,
or use the SQLite CLI on `api/storage/ngg.db`.)

## Step 5 — Sign-in flow

1. Click **Sign in**, enter the admin email.
2. Check the inbox for the magic link + 6-digit OTP (within a few seconds if
   SMTP is configured).
3. Click the link or paste the OTP → dashboard.
4. Admins are sent to TOTP setup on first `/admin` visit — scan the QR with any
   authenticator app, then enter a code to unlock the control room.

## Step 6 — Cron jobs

Add two cron entries (cPanel → Cron Jobs):

```
# Daily maintenance (publish scheduled posts, expire promos, GC auth, trim audit,
# and push the Sheets mirror if configured):
0 2 * * *   php /home/USER/public_html/api/tools/run-jobs.php >/dev/null 2>&1

# (Optional) refresh the Google Sheets mirror more often:
30 * * * *  php /home/USER/public_html/api/tools/export-sheets.php >/dev/null 2>&1
```

## Step 7 — Google Sheets mirror (optional)

Only if admins want a spreadsheet view. Follow `apps-script/README.md`: deploy the
tiny export sink, set `apps_script_url` + `shared_secret` in `api/config.php`, done.
Nothing reads from the Sheet — it's a one-way mirror.

## Operations

- **Backups:** copy `api/storage/ngg.db` (SQLite) or `mysqldump` (MySQL). Do it
  on a schedule; that file *is* your data now.
- **Uploads:** managed in the Cloudinary dashboard; the DB stores only URLs.
- **Rotate secrets:** change `cookie_secret` (logs everyone out) or
  `shared_secret` (update the Apps Script Script Property to match).
- **Tests:** `php api/tests/run.php` boots a throwaway SQLite DB and runs the
  full backend suite. Keep it green.

## What intentionally isn't here

- **Real-time updates** — the dashboard polls every 60s (visible tabs only).
- **Direct file storage on the host** — media lives in Cloudinary; the DB holds URLs.
- **SMS OTP** — a `phone` column exists; only email OTP is wired.
