# Apps Script — deploy guide

This folder contains all Google Apps Script source for the NGG platform. It's
the backend: Sheets I/O, auth, email, audit, scheduled jobs.

## Files

| File          | What it does                                     |
|---------------|--------------------------------------------------|
| `Code.gs`     | HTTP entry, dispatch table, HMAC verification    |
| `Util.gs`     | Sheet I/O cache, IDs, rate limiting, mail        |
| `Auth.gs`     | Magic link + OTP + TOTP for admins               |
| `Sessions.gs` | TONI/MEDI/SUMMER/DOMI calendar                   |
| `Members.gs`  | Dashboard, profile updates, notifications        |
| `Anchor.gs`   | Missions, submissions, journal, stats recompute  |
| `Events.gs`   | Events, RSVPs, posts, public reads               |
| `Admin.gs`    | Admin endpoints (role-gated)                     |
| `Triggers.gs` | Time-driven maintenance + one-time setup helpers |

## One-time setup (≈10 minutes)

1. **Create the Google Sheet**
   - File → New → Spreadsheet. Name it `NGG Platform`.
   - Copy its ID from the URL — it's the long string between `/d/` and `/edit`.
2. **Open the Apps Script editor**
   - From the Sheet: Extensions → Apps Script.
   - Delete the default `Code.gs` stub.
3. **Paste in every `.gs` file from this folder**, keeping the filenames:
   - `Code.gs`, `Util.gs`, `Auth.gs`, `Sessions.gs`, `Members.gs`,
     `Anchor.gs`, `Events.gs`, `Admin.gs`, `Triggers.gs`.
4. **Set Script Properties** (gear icon → Project Settings → Script Properties):
   - `SHARED_SECRET` — generate with `openssl rand -hex 64`. Keep it secret.
   - `SPREADSHEET_ID` — the ID from step 1.
   - `MAIL_FROM_NAME` — `Next Generation Genius`
   - `MAIL_FROM_REPLY_TO` — `hello@yourdomain.com`
   - `APP_ORIGIN` — `https://yourdomain.com` (no trailing slash)
5. **Create the sheet tabs** — in the Apps Script editor, select function
   `Setup_createAllSheets` from the dropdown and click ▶ Run. Authorize when
   prompted. This creates every required tab with the right headers.
6. **Optional: seed demo data** — run `Setup_seedDemo` to get 6 test members.
   Edit the email addresses inside `Triggers.gs` first so you receive the
   magic links during testing.
7. **Install triggers** — run `Triggers_install`. This sets up hourly + daily
   maintenance jobs.
8. **Deploy as Web App**
   - Click **Deploy → New deployment**.
   - Type: **Web app**.
   - Description: `NGG Backend v1`.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy** and copy the Web App URL (looks like
     `https://script.google.com/macros/s/AKfycb…/exec`).
9. **Plug it into PHP** — paste the URL and the same SHARED_SECRET into
   `api/config.php` on your shared host. See `docs/SETUP.md` for that side.

## Re-deploying after code changes

After editing any `.gs` file:
- Apps Script automatically saves on Cmd/Ctrl+S.
- Click **Deploy → Manage deployments → ✏️ (Edit)** on your live deployment.
- Change the Version dropdown to **New version**, save.
- The URL stays the same — PHP doesn't need to be updated.

If you change Script Properties after deploy, no re-deploy is needed —
property reads are live.

## Security notes

- The Web App URL must NEVER be hit directly from a browser. The PHP proxy
  signs every call with HMAC. Without the right `sig`, the script returns
  401.
- The `Setup_*` and `Triggers_install` functions are entry-point safe — they
  run only when you invoke them from the editor, not via HTTP.
- Rotate `SHARED_SECRET` quarterly. To rotate: generate a new secret,
  update both Script Properties and `api/config.php`, then redeploy
  (just save — URL stays).

## Quotas to know

- `MailApp.sendEmail` — 100/day on free Google Workspace, 1500/day on paid.
- `UrlFetch` / response size — 50MB max. We stream small JSON, no issue.
- Script runtime — 6 minutes per invocation. Every endpoint here finishes
  in <2s on healthy spreadsheets.
- If you exceed 5000 members the cache strategy needs a revisit (move from
  full-sheet reads to range-targeted reads).
