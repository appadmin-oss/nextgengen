# NGG Platform — production setup

This walks you through a clean deploy from scratch. **~30 minutes** if you've
done it before, ~90 minutes the first time. Order matters — don't skip.

## Architecture in one diagram

```
[Phone / Browser]
      │  HTTPS, cookies
      ▼
┌──────────────────────┐    HMAC-signed JSON
│  Shared host (PHP)   │ ──────────────────────►  Google Apps Script
│  /api/*  /admin/*    │      over HTTPS              (Web App URL)
│  /index.html (SPA)   │ ◄──────────────────────         │
└──────────────────────┘     JSON response               │ reads/writes
                                                         ▼
                                                  ┌──────────────┐
                                                  │ Google Sheet │
                                                  │ NGG Platform │
                                                  └──────────────┘
```

- **Browser** only ever talks to the PHP layer (same origin, signed cookies).
- **PHP proxy** is the only thing with the Apps Script URL + shared secret.
- **Apps Script** is the only thing with the spreadsheet ID.
- **The Sheet** is the database. Admin can also touch rows by hand if they
  ever need to — the system reads live.

## Prerequisites

- Domain pointing at your PHP host (Namecheap, BlueHost, A2, etc.).
- PHP 8.1+ with cURL + OpenSSL extensions (default on every shared host).
- Apache with `mod_rewrite` + `mod_headers` (default on cPanel hosts).
- A Google account (Workspace ideal — 1500 mail/day; personal works at 100/day).

## Step 1 — Google Sheet + Apps Script

Follow `apps-script/README.md` in full. By the end you have:
- A spreadsheet ID
- A deployed Web App URL
- A `SHARED_SECRET` set in Script Properties
- 15 tabs with correct headers
- (Optional) demo members seeded

## Step 2 — PHP backend

1. Upload the entire repo to `public_html/` on your host (or a subfolder you'll
   map a domain to).
2. Copy `api/config.example.php` to `api/config.php`. Open it and fill in:
   - `apps_script_url` — the URL from Apps Script step 8
   - `shared_secret` — same value as the SHARED_SECRET in Script Properties
   - `cookie_secret` — a **different** random hex string (`openssl rand -hex 64`)
   - `app_origin` — your final HTTPS URL
3. Verify file permissions:
   - `api/` → 755
   - `api/config.php` → 600 (read by web user only)
   - `api/_cache/` → 755 (writable by web user)
4. Verify the deny rule is working — visit
   `https://yourdomain.com/api/config.php` in a browser. You should get
   **403 Forbidden** or **404**. **NEVER** see PHP source or your config.
5. Smoke test the public endpoints:
   ```
   curl https://yourdomain.com/api/public/stats.php
   ```
   You should see JSON with stats.

## Step 3 — Verify the auth flow

1. Open `https://yourdomain.com/`.
2. Click **Sign in**.
3. Enter the email or memberId of a seeded test member.
4. Check the inbox — you should see a magic-link email + 6-digit OTP within
   ~5 seconds.
5. Click the link OR paste the OTP into the form. You should land on the
   dashboard with the member's name.
6. Log out, sign in as `admin@example.com` (the seeded super_admin). You'll
   be sent to a TOTP setup page. Scan the QR with Google Authenticator /
   1Password / Authy and enter a code. Then `/admin` opens.

## Step 4 — Set up scheduled triggers

Already done if you ran `Triggers_install` in the Apps Script editor. Verify
in Apps Script → Triggers (clock icon left rail) — you should see:
- `Trigger_hourly` — once an hour
- `Trigger_dailyMaintenance` — once a day at 02:00

## Step 5 — Anchor missions content

Until the Anchor book PDF is loaded, the AnchorMissions sheet is empty and
members will see "No missions yet." Add rows manually or use the admin UI
once Phase 3 is deployed.

## Step 6 — First real users

1. Open the Google Sheet → `Members` tab.
2. Add real rows (or use Admin UI → Members → New).
3. Tell each member their `memberId` (or just their email — both work for
   sign-in).
4. They sign in at `https://yourdomain.com/` with that ID.

## Operations playbook

### Rotating SHARED_SECRET
1. Generate new: `openssl rand -hex 64`
2. Update Apps Script Script Properties → save
3. Update `api/config.php` → save
4. No deploy needed; both sides pick it up on next request.

### Rolling back Apps Script
- Deploy → Manage deployments → ✏️ Edit → Version dropdown → pick previous
  version → Save. The URL stays the same.

### Reading the audit log
- `https://yourdomain.com/api/admin/audit.php?limit=200` (signed-in admin
  cookie required), or open the `AuditLog` tab directly.

### When email volume gets high
- Switch the Google account to Workspace (1500/day), or
- Plug an SMTP provider (Mailgun/Postmark) directly into `Util.gs` —
  search for `MailApp.sendEmail`, replace with a `UrlFetchApp.fetch` to
  the provider.

### Backup
- Google Sheets has version history (File → Version history). Snapshots
  are kept indefinitely for free.
- Weekly: File → Download → `.xlsx` to your laptop for cold backup.

## Things that intentionally aren't here

- **Real-time updates** — we poll. The dashboard refreshes every 30s. If you
  ever need true real-time, swap `setInterval` for a Server-Sent Events
  endpoint that streams from Apps Script's `LockService`.
- **File uploads** — proof submissions are URLs, not direct uploads. Members
  paste a Drive / Cloudinary link. To accept direct uploads, add a Cloudinary
  unsigned upload preset and call it from the frontend; store the returned URL.
- **SMS OTP** — phone column exists in the schema, but only email OTP is
  wired. Add Twilio later via `Util.gs`.

## Health checks for monitoring

- `GET /api/public/stats.php` should return 200 in <500ms.
- `GET <apps_script_url>` (no `?op=`) returns `{"ok":true,"service":"ngg-apps-script"}`.
- Watch for 5xx in your host's access log — these are the only things that
  should page anyone.
