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
     PHP `mail()`). For inbox placement: put `from_email` on a domain you
     control, align it with the SMTP mailbox, and add **SPF + DKIM + DMARC**
     DNS records for that domain — without them mail is spam-filtered even when
     the send succeeds. Verify with **Control Room → Settings → Email delivery**,
     which reports the mode, resolved sender, SMTP target, and SPF/alignment
     warnings. (Messages already ship with `Date`, a domain-scoped `Message-ID`,
     and a `text/plain` part alongside the HTML.)

     **Gmail SMTP:** `host: smtp.gmail.com`, `port: 587`, `secure: tls`,
     `user`/`pass` = your Gmail address and a **16-character App Password**
     (Google Account → Security → 2-Step Verification → App passwords — your
     normal password will not work). Set `from_email` to the **same Gmail
     address** — Gmail rewrites any other `From` to the signed-in account
     unless it's a verified "Send mail as" alias (Workspace). Gmail signs with
     its own SPF/DKIM, so no DNS setup is needed; consumer Gmail caps at
     ~500 messages/day.
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

### No SSH / no cron host

Some shared hosts give you no shell and no scheduler. The app is built to run
without either:

- **Schema migrations** apply automatically on the first request after a deploy
  (`db_migrate` runs against the target version) — no CLI step.
- **The first admin sign-in** self-provisions the super-admin, so you never need
  a shell to bootstrap access.
- **All transactional email is synchronous** — registration confirmations,
  volunteer IDs, milestone certificates, and the **check-in state emails**
  (a nudge, or an award-focused note when the person is doing well) are sent
  in-request at the moment they're triggered. Nothing here waits on `run-jobs`.
- **Built-in web-cron** — a normal request, at most once per interval, drains
  the integration bus (Google Chat / webhooks / Sheets rows and the wellbeing
  escalation), sends the parent-verification re-nudge + stalled-registration
  alerts, and runs the daily maintenance below — all **after** the response is
  flushed, so it never adds latency. This means the cron jobs in `Step 6` are
  **optional**: everything they do (scheduled-post publishing, promo expiry,
  auth/audit GC, integration delivery, reminders) also happens through web-cron.
  Tune or disable it via the `webcron` block in `api/config.php`.

Only two things still benefit from a real cron: the **full Google Sheets
snapshot** (`export-sheets.php`, a heavy periodic mirror — incremental Sheets
rows still flow through the bus without it) and the **Afrovanguard mentor pull**
(`sync-afrovanguard.php`). If you have cron, set `webcron.enabled => false` to
avoid doing the shared work twice; if you don't, only those two optional mirrors
are affected.

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

## Scheduled jobs (desk password rotation, reminders, maintenance)

**You probably do not need to do anything.** The app carries a web-cron: ordinary
traffic triggers throttled background work after the response has been flushed
(`api/_lib/webcron.php`). It drains the integration outbox every 60s, sends
verification reminders every 15 min, and runs daily maintenance — including
**rolling any desk password that has reached its rotation interval** — hourly.
That covers shared hosting with no SSH and no cron.

A real cron is better if you have one, because it runs on a quiet site too:

```
0 2 * * * php /home/USER/public_html/api/tools/run-jobs.php >/dev/null 2>&1
```

Both paths are safe to run together. A gate is only rolled once its interval has
elapsed, and rotating stamps `passSetAt`, so whichever runs second finds nothing
due. If you wire the host cron you can switch the web-cron off in `config.php`:

```php
'webcron' => ['enabled' => false],
```

Note the one thing neither path can do: a gate set to rotate but with **no
notification address** is never rolled unattended — it is reported as due and
badged in Admin → Gate links for someone to rotate by hand. Rotating a desk
nobody can be told about would lock out a field team mid-session.
