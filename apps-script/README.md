# Apps Script — Google Sheets mirror (optional)

> **The NGG backend now runs on PHP + a database on the shared host — that is
> the source of truth.** This Apps Script is optional. It exists only so admins
> keep a familiar read-only spreadsheet view of key tables. Nothing in the app
> reads from the Sheet.

If you don't want a Sheets mirror, leave `apps_script_url` empty in
`api/config.php` and skip this entirely.

## What it does

`api/tools/export-sheets.php` (run on a cron) reads snapshots of the main
tables from the database and POSTs them here, HMAC-signed. This script replaces
each named tab with the fresh snapshot. It is write-only from the app's side.

## Setup (≈5 minutes)

1. Create a Google Sheet named e.g. `NGG Mirror`. Copy its ID from the URL
   (the long string between `/d/` and `/edit`).
2. Extensions → Apps Script. Delete the default stub, paste in `Code.gs` from
   this folder.
3. Project Settings → Script Properties, add:
   - `SPREADSHEET_ID` — the ID from step 1.
   - `SHARED_SECRET` — must **exactly match** `shared_secret` in
     `api/config.php` (`openssl rand -hex 64`).
4. Deploy → New deployment → Web app → Execute as **Me**, Access **Anyone**.
   Copy the `/exec` URL.
5. Put that URL in `api/config.php` → `apps_script_url`.
6. Test: `php api/tools/export-sheets.php` from the host (or wait for the cron).
   You should see the tabs populate.

## Security

The Web App URL must never be called by a browser. Only the PHP exporter calls
it, signing every request with HMAC-SHA256 over the body. Without the right
`sig` the script returns `bad_signature`. Rotate `SHARED_SECRET` by updating
both Script Properties and `api/config.php` — no redeploy needed.
