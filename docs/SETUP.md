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
- Media uploads go **straight from the browser to Cloudinary** when it is
  configured, authorized by a short-lived signature the PHP layer mints (the
  api_secret never ships to the client). **Cloudinary is optional.** With no
  keys set, a headshot travels inside the form submission and the server holds
  the bytes itself under `api/storage/photos` — see *Photos without Cloudinary*
  below. Photographs work on a fresh install with no accounts to open.

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
- **MySQL/MariaDB:** create an empty database + user and set `db.dsn` (e.g.
  `mysql:host=localhost;dbname=ngg;charset=utf8mb4`) plus `username` /
  `password`. That is all — the app applies `db/schema-mysql.sql` itself on the
  next request and brings the schema up to date on every deploy.

  **Do not pipe the mirror through the CLI** (`mysql ngg < db/schema-mysql.sql`).
  It fails part-way with `ERROR 1060 Duplicate column name 'passSetAt'`, and
  that is expected: the mirror deliberately repeats `ALTER TABLE … ADD COLUMN`
  for post-baseline columns so it can be *replayed* over an existing schema.
  `db_apply_mysql_schema()` runs it statement by statement and swallows exactly
  those already-applied errors; the CLI stops at the first one. If you want to
  confirm it applied, check `schema_meta`:

  ```sql
  SELECT * FROM schema_meta;              -- mysql_schema_status should be 'ok'
  SELECT MAX(version) FROM schema_version;-- should equal NGG_SCHEMA_TARGET
  ```

  To run the backend suite against MySQL rather than SQLite (worth doing before
  a release — MySQL runs in `STRICT_ALL_TABLES`, so it rejects writes SQLite
  silently tolerates):

  ```bash
  NGG_TEST_DSN='mysql:host=127.0.0.1;dbname=ngg_test;charset=utf8mb4' \
  NGG_TEST_DB_USER=ngg NGG_TEST_DB_PASS=nggpass php api/tests/run.php
  ```

  It drops every table in that database first, so point it at a throwaway one.

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

### The member dashboard

`/dashboard` is the overview — one scroll of cards. Three self-service sections
have their own addresses, so a member can be sent straight to one:

| | |
|---|---|
| `/dashboard/account` | The statement: every line with a running total, and "Ask my parent" (the parent pays, or confirms a payment, from /family) |
| `/dashboard/records` | Attendance, the rate (withheld if no term calendar is set), certificates |
| `/dashboard/requests` | Appeals, leave, replacement ID — and what the desk replied (payment claims come from the parent's family account) |

What a member raises lands in **Control Room → People → Member requests**.
Approving a payment claim posts it through the ordinary ledger path, so money
still enters an account by exactly one route — a claim is evidence for a
decision, never an entry in itself. Declining requires a reason, because the
member reads it.

Members cannot download their ID card. It is shown on the dashboard and issued
by the desk; the printed run comes out of the Control Room.

### Importing an existing roster

If the members you want are still in the Google Sheet, bring them across before
anything else — a fresh database with no roster makes every other screen look
broken.

```bash
node tools/ngg-import/extract.js ~/NGG_Members.xlsx   # on a laptop: workbook → roster file
```

Then load it in **Control Room → Members → Import roster** — no shell needed.
Choose the file, read what it says it would do, then press Import. With a shell
you can do the same from `php api/tools/seed-members.php` (`--apply` to write).

Nothing is written until you ask for it, re-running is safe, and the roster file
holds children's personal data — delete your copy afterwards. Full detail,
including where each column lands and what the importer refuses to guess at, is
in **[ROSTER-IMPORT.md](ROSTER-IMPORT.md)**.

### Request body size

One endpoint carries an image inside its JSON: `api/public/selfreg.php`, the
public sign-up form. It has no session, so it cannot use the signed direct
upload every other surface uses, and the headshot travels inline.

The form resamples the photo to 1000px before sending, so a typical submission
is 100–200KB and no configuration is needed. If you nonetheless see a **413**
on that endpoint, the limit in front of PHP is tighter than ~1MB. In order of
likelihood:

| Where | Setting | Suggested |
|---|---|---|
| nginx | `client_max_body_size` | `4m` |
| Apache | `LimitRequestBody` | `4194304` |
| PHP | `post_max_size` | `8M` (the default) |

Raising a limit is the fallback, not the fix — a 413 here more likely means the
client-side resampler failed to load, so check that `/vendor/image-tools.js`
is being served and is not blocked by a CSP or a stale cache.

**A 406 is a different animal.** `406 Not Acceptable` on a POST is not something
this application ever sends — grep for it. It is mod_security, which is on by
default on cPanel, refusing the request before PHP is reached; a rejection is
answered as 406 there. On this host, measured, the trigger is the **number of
values in a JSON body**, not its size — 322KB in 161 values goes through where
55KB in 3201 values does not — and **any multipart file part is refused
outright**. So a bulk write posts its payload as one string value; the roster
import used to post an array of 136 objects and hit exactly this. See
[ROSTER-IMPORT.md](ROSTER-IMPORT.md#how-the-file-reaches-the-server--and-the-406)
for the measurements and how to reproduce them with `curl`.

### Paystack (joining invoices and donations)

Set `'paystack' => ['secret' => 'sk_live_…']` in `api/config.php`, and in the
Paystack dashboard point the webhook at `https://<your-site>/api/hooks/paystack.php`.
Joining invoices use references starting `NGGM-`; the webhook and the family's
return to `/pay/<token>` both settle an invoice only from Paystack's own verify
answer (success, NGN, the invoice's exact amount, tagged with that invoice).
Without the secret, families see the bank details and pay offline.

Offline-payment evidence is stored in `api/storage/payment-evidence/`, which
the storage `.htaccess` keeps off the web. Back it up with the database.

### An image 404s from photo.php

A `/api/public/photo.php?p=…` that answers **404** means a record points at
bytes that are no longer on disk. The endpoint answers a bad id and a missing
file identically on purpose — distinguishing them would make it an oracle for
which photographs exist — so the count is reported where it can be acted on
instead: **Control Room → Ops → Photo storage → "Images on record"**, which says
how many references are broken and which table they are in.

One cause has been fixed rather than documented: the garbage sweep that deletes
unreferenced originals consulted a hand-written list of six columns, and the
store had since grown more users than that — the ID designer's uploads
(`design_assets.url`, and a card template's `schemaJson`), a mission proof
(`member_progress.proofUrl`), and others. Each was deleted seven days after it
was stored, from under a record still showing it. The sweep now asks the schema
for every text column instead, so a column added later is covered on the day it
is added.

**The bytes cannot be recovered.** Send those members a retake link — Admin →
Registrations → the child → Photo. Cards and rosters print without a headshot in
the meantime, and the print preflight counts who is missing one.

The other way to lose them is a deploy: `api/storage/photos` holds the only copy
of every locally-stored image, and an FTP sync set to mirror-and-delete will
remove it because it is not in the repository. Exclude `api/storage` from
deployment, and back it up with the database.

**Better: keep the photos outside the deploy.** Set `'photo_dir'` in
`api/config.php` to a folder outside the web root (for example
`/home/youruser/ngg-photos`), writable by PHP. New photos are stored there, and
a deploy can then replace `api/` without touching them. Photos already in
`api/storage/photos` are still found, and are moved across as they are read.

A third way they were lost has been fixed: the sweep recognised a photo's
address only when it was written out literally, so a photo referenced from
inside JSON (where the slashes are escaped, `\/api\/public\/photo.php`) or
inside a percent-encoded link was deleted a week after upload. Every encoding
is recognised now, and a scan that cannot be completed deletes nothing.

### Lesson files: keep them out of the deploy

Every file an instructor attaches to a lesson — a diagram, a picture, a GIF, a
recording, a worksheet — is stored on the server, and the lesson only points at
it. They used to live in `api/storage/curriculum`, **inside** the folder a
deploy replaces: deleting the old folder before uploading the new build took
every one of them, while the lessons kept pointing at files that were gone.

- Set `'curriculum_dir'` in `api/config.php` to a folder outside the web root
  (for example `/home/youruser/ngg-data/curriculum`). Left empty, the app uses
  `ngg-data/curriculum` beside the web root when the host allows it.
- Files still in `api/storage/curriculum` are found and moved across as they
  are read, so nothing needs copying by hand.
- With **File storage** (below) configured, every upload is also copied to the
  bucket, and a file missing from disk is fetched back from it.
- **Control Room → Learning → Course health** shows *lesson files missing* per
  course, and lists the lessons, so anything already lost can be uploaded
  again. A file that is gone cannot be recovered by the app: restore
  `api/storage/curriculum` from your host's backup if you have one.

When updating, upload the new build **over** the old one; never delete
`api/storage` or `api/data`.

### File storage: any S3-compatible bucket

Once a bucket is configured, every new upload goes to it (the browser PUTs the
file straight to the bucket with a 15-minute presigned URL; the secret never
leaves PHP). Cloudinary, if set, keeps serving what it already holds. Enter the
values in **Control Room → Settings → API keys → File storage**, or in
`api/config.php` under `storage` (see `api/config.example.php`), then press
**Test**.

The **File storage** row opens a connection guide: pick the provider and it
shows that provider's numbered steps, the endpoint / region / public-address
shapes to type, a button that copies the CORS rule for *this* site (built from
`app_origin`), and a **Connect** button whose form is pre-labelled for it. The
catalogue is `STORAGE_PROVIDERS` in `api/_lib/domain/service-keys.php`: Cloudflare
R2, Backblaze B2, Amazon S3, Wasabi, DigitalOcean Spaces, Supabase Storage,
IDrive e2, and any other S3-compatible service. All of them use the same upload
code (SigV4 presigned PUT); a new provider is a row in that list, never new
upload code. The R2 and B2 steps are below; the guide on screen has the rest.

**Cloudflare R2 (recommended: 10 GB free, no download charges)**

1. Cloudflare dashboard → **R2** → *Create bucket* (e.g. `ngg-media`).
2. Bucket → **Settings → Public access** → allow the **r2.dev subdomain** (or
   connect a custom domain). Copy that address: it is the *Public address*,
   e.g. `https://pub-1a2b3c.r2.dev`.
3. R2 → **Manage API tokens** → *Create API token* with **Object Read & Write**
   on this bucket. Copy the *Access Key ID* and *Secret Access Key*.
4. *Endpoint*: `https://<account id>.r2.cloudflarestorage.com` (shown on the R2
   overview). *Region*: `auto`.
5. Bucket → **Settings → CORS policy** → paste:

```json
[
  {
    "AllowedOrigins": ["https://your-ngg-site.example"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Backblaze B2**

1. B2 → *Create a Bucket*, **Files in Bucket are: Public**.
2. *Application Keys* → *Add a New Application Key* for this bucket, **Read and
   Write**. The *keyID* is the access key, the *applicationKey* the secret.
3. *Endpoint*: the bucket's S3 endpoint with `https://`, e.g.
   `https://s3.us-west-004.backblazeb2.com`. *Region*: the middle part,
   `us-west-004`.
4. *Public address*: `https://f004.backblazeb2.com/file/<bucket>` (the
   "Friendly URL" of any file, up to the bucket name).
5. CORS: B2's web console cannot allow PUT, so set the rule with the B2 CLI:

```bash
b2 bucket update --cors-rules '[{"corsRuleName":"ngg","allowedOrigins":["https://your-ngg-site.example"],
  "allowedOperations":["s3_put","s3_get","s3_head"],"allowedHeaders":["content-type"],
  "exposeHeaders":["ETag"],"maxAgeSeconds":3600}]' <bucket> allPublic
```

**Content-Security-Policy.** `.htaccess` already allows
`*.r2.cloudflarestorage.com`, `*.r2.dev`, `*.backblazeb2.com`, `*.amazonaws.com`,
`*.wasabisys.com`, `*.digitaloceanspaces.com` and `*.supabase.co`. IDrive e2
(its hosts carry a region number), any other provider, and a bucket on a
**custom domain** must be added to `connect-src` and `frame-src` there by hand,
or uploads (and photos on printed cards) fail with a CSP error in the console.

**Stored in the bucket, optimised once by Cloudinary, served from the bucket.**
Cloudinary bills every byte it serves on every view; R2 serves for nothing. So
with both set, Cloudinary is asked for each photo's display sizes **once** (by
fetch, reading the photo from the bucket), and the small WebP copies are stored
back in the bucket beside it as `<photo>__<size>.webp`. Pages then load those
straight from the bucket (`nggImg`, photos.js); no page view reaches Cloudinary.
A photo whose sizes are not made yet is shown as it is. Cloudinary is otherwise
used only to frame a photo when an ID card is printed, and to edit one (the
finished edit is saved back into the bucket).

In the Cloudinary console, **Settings → Security**: make sure **Fetched URL** is
not under *Restricted image types*, and set **Allowed fetch domains** to your
bucket's public host (e.g. `pub-1a2b3c.r2.dev`) and this site's host, and nothing
else, so nobody can spend your credits fetching other sites through your cloud.

Photos still kept on this server (the "held" ones in Diagnostics) move into the
bucket from **Settings → Diagnostics → Photo storage → Move held photos to the
bucket**, and by themselves once an hour. **Optimise photos** makes the sizes
now; otherwise it carries on by itself every ten minutes. Moving keeps the file
on this server and leaves a missing file alone.

What the server enforces: the object key is chosen by the server (folder, date,
random id), so nobody can overwrite another file; the content type comes from an
allow-list by extension (no HTML, SVG or scripts); and the signature covers the
exact byte length and type, so a signed URL cannot carry a different file.

### Photos without Cloudinary

Cloudinary needs three keys, and until they are set there is nowhere to upload
to. Headshots do not wait for that: the browser sends the image inside the form
submission and the server stores the bytes under `api/storage/photos`, serving
them from `api/public/photo.php`. Every surface that takes a headshot works this
way when no cloud is configured — the public sign-up form, the staff desk, the
guardian retake link, the admin photo studio.

**If photos aren't appearing, run this first:**

```bash
php api/tools/check-photos.php
```

It reports where images go, whether that directory is writable, whether a real
write-and-read-back round trip works on this host, how many images are held, and
how many recent sign-ups have one. Exit code 0 means healthy; anything else names
the fault and the fix. The same information is on **Admin → Diagnostics → Photo
storage**, which is the better place to look if you have no shell.

What you should know about it:

- **`api/storage/` must be writable by the web user.** It already has to be for
  SQLite; on MySQL it is easy to miss, and it is *the* usual cause of "photos
  don't display" — a registration succeeds and the review desk shows an empty
  frame. `chmod 775 api/storage api/storage/photos` (755 when PHP runs as the
  directory's owner, which is usual on cPanel). If the directory cannot be
  written the app falls back to the cache directory so photographs are not lost,
  and Diagnostics reports that as **degraded** rather than healthy.
- **Back it up with the database.** The rows point at these files. A dump of one
  without the other loses every photograph.
- **The URLs are unguessable, not private.** The id is an HMAC of the file's own
  bytes under `cookie_secret`, so it cannot be enumerated or derived from a copy
  of the image — the URL is the capability, the same posture as a Cloudinary
  delivery URL. Rotating `cookie_secret` changes future ids only; files already
  stored keep working because the id is on the row.
- **Abandoned originals are swept.** A rejected application or a replaced photo
  leaves a file nothing points at; maintenance deletes those once they are a week
  old (`photo_store_sweep`), and does nothing at all if it cannot read what is
  referenced.
- **Configuring Cloudinary later needs no migration.** New photos upload to it
  and get the AI/edit pipeline; existing local ones keep serving from disk.

Setting `cloudinary` is still worth doing for a real deployment — it brings the
CDN, the face-aware crop and the identity-safe enhancement pass, and it keeps
image bytes out of your database backups.

### WhatsApp through Kapso (optional)

With Kapso set, every text the site sends goes on WhatsApp first and by SMS when WhatsApp cannot deliver it,
and parents' WhatsApp replies arrive in the Control Room inbox (`api/_lib/domain/kapso.php`). Sign-in codes
always stay on SMS. Set it in the Control Room (Settings → API keys → WhatsApp (Kapso)), no file editing:

1. **Connect the number in Kapso** (app.kapso.ai) and copy its **Phone number ID** and a project **API key**.
2. **Create one template** in Kapso: category *Utility*, name `ngg_message` (or your own, typed into
   "Template name"), language `en`, body `Next Generation Genius: {{1}}`. Wait for Meta to approve it.
   WhatsApp only lets a business start a conversation with an approved template, so until it is approved
   every message falls back to SMS.
3. **Add a webhook** in Kapso pointing at `https://<your site>/api/hooks/kapso.php`, for the message
   received, sent, delivered and failed events. Copy its **secret key** into "Webhook secret". Deliveries
   are checked against it (HMAC-SHA256 of the raw body); without it the endpoint refuses everything.
4. Press **Test** on the Kapso card: it reads the number's details from Kapso and sends nothing.

How it behaves:

- A message is the template with the text as its one parameter, made one line (WhatsApp refuses
  newlines in a parameter). If Kapso refuses it, the same text goes by SMS straight away.
- If WhatsApp accepts it but later reports it **failed** (for example the number is not on WhatsApp),
  the webhook sends the same words by SMS, once.
- A parent's WhatsApp message becomes an inbox **Message** (purpose WhatsApp), named from the family
  record when the number matches a guardian or member. Further messages within a week join the same
  thread. Replying from the inbox answers on WhatsApp: plain text within 24 hours of their last message,
  the template after that.

### AI providers and the analyst panel

Eleven providers are supported and every one is optional. Keys can be entered
in Control Room → System → Service keys or in `api/config.php`. Anything you
leave blank is skipped, and **each acts as a fallback for the others** — one
exhausted key costs speed, not capability. With none set, every AI feature
degrades to deterministic behaviour and says so; nothing invents an answer.

| Provider | Config key | Free tier | Worth knowing |
|---|---|---|---|
| **Groq** | `ai.groq_api_key` | yes | Fast, generous, the sensible first key |
| **Google Gemini** | `ai.gemini_api_key` | yes | Leave the model blank and the best one the key can use is asked of Google |
| **Cerebras** | `ai.cerebras_api_key` | yes | The fastest of these by a distance |
| **Mistral** | `ai.mistral_api_key` | yes | European, good at the smaller sizes |
| **Together AI** | `ai.together_api_key` | yes | Free Llama 70B, useful where a bigger model matters |
| **GitHub Models** | `ai.github_api_key` | yes | A GitHub personal access token is the key |
| **Anthropic** | `ai.anthropic_api_key` | no | The capable tier; required for marking open answers |
| **OpenAI** | `ai.openai_api_key` | no | Default `gpt-4.1-mini`; reasoning models such as `o4-mini` work too |
| **DeepSeek** | `ai.deepseek_api_key` | no | Inexpensive |
| **OpenRouter** | `ai.openrouter_api_key` | some | One credential reaches hundreds of models from every major lab, so trying a different one is a config line rather than a deploy |
| **Self-hosted / other** | `ai.custom_base_url` | — | Anything speaking the OpenAI chat-completions shape: llama.cpp, Ollama, a university endpoint. No key needed |

Six of the eleven have a free tier that does not expire into a card, which is
what a programme running on shared hosting actually needs. **Set two or three
of those** rather than one: the fallback chain is what keeps a feature working
on the afternoon one provider is rate-limiting.

**Analytics → Level 7 · Analyst panel** is the one feature that uses several
models at once. Four lenses (mechanism, action, scepticism, equity) read the same
figures, and a fifth pass keeps only what two or more reached *independently*.
Point each lens at a **different provider** in `ai.profiles` — four lenses on one
model is one opinion four times, and their agreeing then tells you nothing. The
screen reports how many distinct providers actually answered and warns when the
answer is one.

Two things to know before switching it on:

- **It spends money.** A run is five completions. It is never computed with the
  page: a coordinator asks for it, and the result is cached against a fingerprint
  of the numbers it was drawn from, so an unchanged week costs nothing however
  often it is opened. To pre-warm it from the background cron, set
  `insight_prewarm = 1` and `insight_prewarm_as = <an admin memberId>` in
  settings; it is off by default because spending a programme's API budget should
  be a decision, not a side effect of upgrading.
- **Nothing identifying leaves the server.** The panel receives counts, rates and
  confidence intervals only — no name, id, handle, contact, note or date of
  birth. A second, independent pass inspects the encoded payload and **fails the
  whole run** rather than send something that looks like a person, and the
  per-child growth score is excluded outright. See
  `api/_lib/domain/insight.php`. If you see "Refused to send" on that screen,
  that gate has fired and it is a bug to report, not a retry.

**Analytics → Level 7b · Ask the analysts** is the same panel, asked your own
question. It adds two profiles: `insight_router`, which only decides which lenses
a question needs and should be the cheapest model you have; and `insight_answer`,
which composes the reply and is the one place worth a capable model — it has to
hold a disagreement between two analysts without tidying it away, and that is
exactly what a small model does.

- **A turn is two to five completions**, budgeted at 30 questions per admin per
  hour. Nothing is pre-warmed and nothing is cached: a question is asked once and
  the answer is stored, so re-reading a thread costs nothing.
- **Every figure in an answer is checked against the evidence** and anything not
  found is marked on the answer itself. Honest rounding passes; a precise quote
  that does not match does not. If you see "some figures in this answer are not in
  the evidence", the model did arithmetic rather than reading — check it against
  the tables above before acting on it.
- **Your question goes through the same privacy gate as the figures.** Type a
  child's name and the turn is refused outright, before anything is sent. That is
  deliberate: stripping it quietly would teach nobody anything.
- Threads are stored per admin and readable only by the admin who opened them.

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

### An external scheduler — do this; it is what keeps the site fast

Without one, background work rides real page traffic: after a visitor's page
has gone, that request spends up to 8 seconds on due jobs, and on shared
hosting it holds one of a handful of PHP workers while it does. With one, the
work happens on the clock, and for five minutes after each call visitors'
pages do no background work at all.

**Best: the CACENTRE gate.** Its Cloudflare Worker calls NGG every minute once
it has the secret `NGG_CRON_URL` (the address below, key included) — see the
gate's `UPDATING.md`. No cPanel cron needed.

Otherwise anything that can fetch a URL — cPanel Cron Jobs, an uptime pinger:

```
* * * * *  wget -q -O /dev/null "https://YOURDOMAIN/api/public/cron.php?key=THE_KEY"
```

Every minute is right: the jobs are throttled to their own intervals, and a run
answers within 50 seconds (under Cloudflare's 100). Slow runs are on the ops
screen as "Slow background run", with what took the time.

Set `$CONFIG['cron_key']` to a long random string (`openssl rand -hex 24`) to
switch it on. Leave it empty and the endpoint answers **404** — off, and telling
a scanner nothing. Add `&job=accrue|reminders|deliver|maint` to run one job.

Both paths share the same lock and the same idempotent jobs, so you can leave
web-cron on while you set the schedule up and switch it off afterwards. The key
travels in a URL and so reaches access logs and the cron listing: rotate it like
a password. It grants running maintenance that was going to run anyway.

### No SSH / no cron host

Some shared hosts give you no shell and no scheduler. The app is built to run
without either:

- **Schema migrations** apply automatically on the first request after a deploy
  (`db_migrate` runs against the target version) — no CLI step.

  One rule on **MySQL**, verified against MariaDB 10.11 in August 2026:
  `db_apply_mysql_schema()` replays `db/schema-mysql.sql` but executes only
  `CREATE` / `ALTER` / `INSERT`. A migration that has to touch existing **rows**
  is read from that file and skipped, while the same migration does run on
  SQLite through the ladder. Row-touching migrations therefore live in
  `NGG_MYSQL_ROW_FIXUPS` in `api/_lib/db.php`, which the replay runs once per
  deploy; each statement is guarded so later runs match nothing, and one that
  does change rows logs its count. `php api/tests/run.php` fails if a new one is
  added to the .sql file instead.

  **Seven backfills had been dead that way** and apply on the first deploy after
  this: the `summer_students` `firstName` / `lastName` split, its `sex = gender`
  copy, `qr_codes.expiresAt`, `notifiedAt` on `community_posts` and
  `community_comments`, and `members.level`. Six were merely skipped; the
  `qr_codes` one was also **wrong** — it passed an ISO-8601 string
  (`2026-08-27T08:56:44Z`) straight to `DATE_ADD`, which MySQL cannot parse and,
  under `STRICT_ALL_TABLES`, raises error 1292. It would have thrown on its
  first row had it ever run. It now takes the date part first and skips a
  timestamp it cannot read.

  One of them changes behaviour rather than filling a blank. `qr_codes.expiresAt`
  gives every assigned card an expiry 90 days after it was issued, so a card
  issued more than 90 days ago becomes **expired**, and `summer_scan_checkin()`
  refuses it with `id_expired`. That is migration 62 doing what it always said,
  but on a host where it never ran it lands as a change. Count the blast radius
  before deploying:

  ```sql
  SELECT COUNT(*) FROM qr_codes
   WHERE expiresAt = '' AND status = 'assigned'
     AND DATE_ADD(SUBSTR(COALESCE(NULLIF(assignedAt,''), createdAt), 1, 10), INTERVAL 90 DAY) < CURDATE();
  ```

  The 90 days is hard-coded, matching the SQLite ladder — a backfill has to
  land both engines in the same state, so it does not read the configurable
  `idcard.validityDays` (that governs newly *issued* cards and would not change
  what this writes). If the count is uncomfortable, give those rows a date
  before you deploy: the fixup only fills a **blank** `expiresAt`, so anything
  already dated is left alone.

  ```sql
  UPDATE qr_codes SET expiresAt = '2027-06-30'
   WHERE expiresAt = '' AND status = 'assigned';
  ```

  **MySQL 8 (not MariaDB) refused 17 statements of the mirror until 20 November
  2026** — a bare `rank` column (reserved since 8.0.2) and TEXT columns with a
  literal DEFAULT (error 1101). On such a host `courage_marks`,
  `member_promotions`, `admin_approvals`, `contact_replies`,
  `membership_invoices`, `photo_framing`, `vol_tiers` and `mentor_match_offers`
  were never created, `mentors.rank` never added, and `schema_meta` reads
  `mysql_schema_status = partial`. Nothing to run by hand: the corrected mirror
  has a new hash, so the first request after the deploy replays it and creates
  what is missing (every statement is idempotent), and the status turns `ok`.
  A host that imports the file by hand re-imports the whole file. MariaDB hosts
  already had these tables and are unaffected.

- **The first admin sign-in** self-provisions the super-admin, so you never need
  a shell to bootstrap access.
- **All transactional email is synchronous** — registration confirmations,
  volunteer IDs, milestone certificates, and the **check-in state emails**
  (a nudge, or an award-focused note when the person is doing well) are sent
  in-request at the moment they're triggered. Nothing here waits on `run-jobs`.
- **Fee accrual** rides web-cron too (daily), so charges keep up without a
  shell. It is a no-op while dues are switched off.
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
- **Uploads:** managed in the Cloudinary dashboard when configured; the DB
  stores only URLs. Locally-held headshots live in `api/storage/photos` and
  belong in the same backup as the database — the DB rows point at them, so
  a backup of one without the other loses every photograph.
- **Rotate secrets:** change `cookie_secret` (logs everyone out) or
  `shared_secret` (update the Apps Script Script Property to match).
- **Tests:** `php api/tests/run.php` boots a throwaway SQLite DB and runs the
  full backend suite. Keep it green.

## What intentionally isn't here

- **Real-time updates** — the dashboard polls every 60s (visible tabs only).
- **Direct file storage on the host for general media** — posts, proofs and
  submissions need Cloudinary; the DB holds URLs. Headshots are the exception
  (see below), because an ID card with no photograph is not an ID card.
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

## The bundled curriculum

NGG's own courses ship with the code, in `api/_lib/seeds/curriculum-*.json`,
and seed themselves into live, published lessons on the first request after a
deploy. Each file is imported once, nothing already in `curriculum_units` is
touched, and a lesson somebody else put at the same week and position stays
theirs.

That is right for NGG and wrong for anyone running this codebase for a
different programme, or for a deployment that imports its own curriculum and
does not want several hundred lessons arriving unasked. Decline them:

```php
'seed_bundled_curriculum' => false,
```

Absent, they seed. Already-seeded lessons are not removed by setting it — it
stops the next file from loading, it does not undo the last one.

Note the one thing neither path can do: a gate set to rotate but with **no
notification address** is never rolled unattended — it is reported as due and
badged in Admin → Gate links for someone to rotate by hand. Rotating a desk
nobody can be told about would lock out a field team mid-session.
