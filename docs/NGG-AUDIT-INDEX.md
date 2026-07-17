# NextGenGen (NGG) — Codebase Audit & Index

Product: **Next Generation Genius** (an Afrovanguard programme) — a 12-week
growth programme for African teenagers. Two front-ends (a marketing/portal SPA
and the Anchor Journal PWA) over one PHP + SQLite/MySQL backend.

> Companion docs: `afrovanguard-sync.md` (NGG ↔ Afrovanguard),
> `anchor-journal-v2-gap-analysis.md` (Journal roadmap), `SETUP.md`, `SCHEMAS.md`.

## 1. Tech stack & build
- **React 18, no framework, no dev bundler.** JSX is compiled in-browser by
  Babel-standalone (`vendor/babel.min.js`); each `.jsx` is a
  `<script type="text/babel">` classic script attaching globals to `window`.
  React is vendored (`vendor/react*.production.min.js`).
- **Entry:** `index.html` loads scripts in order; app root `app.jsx` → `App()`,
  mounted in `<ErrorBoundary><AuthProvider><App/>`.
- **Routing is path-based** (not hash): `pageFromPath()` / `pathForPage()` /
  `PAGE_IDS` in `app.jsx`. Admin at **`/nextadmin`** (aliases `/hq`, `/admin`);
  `/login`,`/signin` → home + modal; `/q/*`,`/s/*` → summer profile. Deep links
  via `.htaccess` SPA fallback.
- **Prod build:** `build.js` (esbuild) — per-file JSX transform + concat in
  `ORDER`, minify → `dist/app.min.js`; strips Babel from HTML;
  `validateOrderAgainstIndex()` fails on drift; builds the **Journal PWA as a
  2nd target** (`buildJournal()`); stamps a content-hash `buildId` into both
  service-worker `CACHE_VERSION`s.
- **Serve:** Apache. `.htaccess` does SPA fallback + CSP (allows
  `unsafe-inline/eval` for Babel) + security headers. `api-client.js` exposes
  `window.NGGApi`, `credentials:'include'`, echoes `ngg_csrf` → `X-NGG-CSRF`
  on writes.

## 2. Site map / routes
Public SPA (component / file):
- `home` HomePage `page-home.jsx` · `summer` SummerPage & `club` ClubPage
  `page-club.jsx` · `anchor` AnchorPage `page-anchor.jsx` (live via
  `member.anchor`) · `profile` ProfilePage `page-club.jsx` · `dashboard`
  DashboardPage `page-dashboard.jsx` · `book` BookPage `page-book.jsx` ·
  `media`/`parents`/`volunteers`/`mentors`/`join` `page-other.jsx` · `blog`
  BlogPage `page-blog.jsx` · `contact` · `summerprofile` (`/q`,`/s`).
- **Public status boards** (PII-free, aggregates only): `s-status` StatusPage
  (attendance) & `v-status` VolunteerStatusPage (volunteer needs vs filled),
  both `page-home.jsx`. Legacy `/status` → `/s-status` (SPA alias in
  `pageFromPath` + `.htaccess` 301).
- **Admin** `AdminPage` `page-admin.jsx` · **`summer-admin`** SummerAdminPortal ·
  **`club-admin`** ClubAdminPortal (both in `page-admin.jsx`) · **`circle`**
  CirclePortal `page-other.jsx` (guardian read-only portal).
- Separate app: **`journal/`** PWA (own shell / `app.jsx` / `sw.js`).

## 3. Admin & manager system
**Roles / capabilities** — single source, `util.php` `admin_role_caps()`:
- `super_admin` → `content, people, inbox, settings, rbac, summer, club`
- `admin` → `content, people, inbox`
- `editor` → `content`
- `summer_admin` → `summer` only · `club_admin` → `club` only · member → `[]`

Helpers: `role_has_cap()`, `is_admin_role()`. **3-layer server enforcement:**
route `require_admin()` / `require_super_admin()` (`session.php`); domain
`admin_gate()` / `admin_cap_gate()` (`domain/admin.php`); a role-set guard (only
`rbac`/super_admin may change a member's `role`, validated against a whitelist).

Client **Control Room** (`page-admin.jsx`): gate order = loading → not-admin →
coordinator-redirect-to-portal → `AdminTotpGate` (if `!adminOk`) → console.
Sections keyed by `SECTION_CAP`: Members / Applications / Mentorship / Mentors;
Content (Sessions / Missions / Anchor content / Assignments+grade / Events /
Posts / Broadcast); Inbox (Newsletter / Messages); Audit; Settings. Portals
(`PortalGate` → `PortalLogin` → cap-lock → TOTP); super_admin can jump across
portals.

> Improvement opportunities: `require_super_admin()` exists but is unused; no
> cross-tier / last-super-admin / self-demotion guards; the only role UI is the
> member editor's `hasCap("rbac")` block; role chip maps omit the coordinator
> roles. A default super admin is now provisioned (`api/_lib/superadmin.php`).

## 4. Auth & sessions
Stateless **signed cookies** (`session.php`):
`b64url(json) . b64url(HMAC-SHA256(payload, cookie_secret))`, payload
`{mid, role, type, status, iat, exp, adminOk}`; verified with `hash_equals` + exp.
- **Password** sign-in `api/auth/login.php` → `auth_login()` (opt-in passwords,
  uniform failure, rehash-on-login).
- **Magic-link + OTP** `request.php` / `verify.php` → `auth_request()` /
  `auth_verify()` (`auth_sessions`, 15-min, single-use, 5 tries).
- **Admin TOTP 2FA** `admin-2fa.php` re-issues the session with `adminOk=true`;
  `auth_totp_setup()` / `auth_totp_verify()`.
- **CSRF** double-submit (`ngg_csrf`), `csrf_require()` in bootstrap; exempts
  login/request/verify/newsletter.

**Users live in the `members` table** (`role`, `passwordHash`, `totpSecret`,
6-digit `anchorCode`) — no separate users/roles table. Admin bootstrap:
`api/tools/create-admin.php` (named admin) and now
`api/tools/seed-admin.php` + `api/_lib/superadmin.php` (default super admin).

## 5. Data model (`db/schema-mysql.sql`)
`members` (account + role + passwordHash + totpSecret + anchorCode) · `mentors`
(+ `source`, `program`, `skills`, `afrovanguardRef`) · `mentor_assignments` ·
`sessions` · `anchor_missions` · `member_progress` · `member_stats`
(xp/level/streak) · `events` / `event_rsvps` · `posts` · `notifications`
(`*` = broadcast) · **`journal`** (reflections; mood/body/week/isPrivate) ·
`auth_sessions` · `audit_log` · `settings` (holds `anchor_content`) ·
`newsletter` · `assignments` / `assignment_submissions` · `applications` ·
**`member_state`** (per-member KV, backs the Journal tools) · `contact_messages` ·
Summer: `summer_cohorts` / `qr_codes` / `summer_students` / `attendance` ·
Circle: `circle_links` / `circle_confirmations` / `circle_remarks`.

## 6. API surface
Route files `api/{auth,member,admin,public}/*.php` → `gs_call($op)` →
`backend_dispatch()` op registry (`_lib/backend.php`) → `_lib/domain/*.php`.
Routes inject `requesterId`/`memberId` from the verified session.
- **auth:** login / request / verify / me / logout / set-password / admin-2fa /
  admin-totp-setup.
- **public** (cached): stats / events / posts / session / anchor-content /
  mentors / summer-profile / newsletter / apply / contact / config / circle.
- **member** (session-gated): dashboard / profile / journal / anchor /
  assignments / mission / notifications / state / momentum / coach / circle /
  rsvp / upload-sign.
- **admin** (`require_admin` + cap): overview / members / mentors / mentorship /
  sessions / missions / events / posts / promotions / broadcast / anchor /
  audit / member-detail / assign-mentor / applications / newsletter / contact /
  settings / summer* / club*.
- Cron: `api/tools/export-sheets.php`, `run-jobs.php`, and now
  `sync-afrovanguard.php`.

## 7. Anchor Journal (`journal/`)
Installable PWA (`noindex`, self-hosted fonts + Phosphor icons, TWA-ready
`deploy/twa-manifest.json` + `.well-known/assetlinks.json`). Shares the SSO
cookie (boots via `NGGApi.auth.me()`, gated by `SignInGate`). Persistence:
localStorage cache + write queue syncing `member.journalCreate`; cross-device
via `member_state` keys (`prefs`, `systems:<date>`, `selfscore:<monday>`, …).
- **Built:** systems, timeline, calendar, growth, library, week-detail, peer
  modeling, weekly review, The Charge, offline support.
- **Partial:** onboarding (1 screen vs the design's 4), home (no Quick Tools
  grid), reflect editor (missing school/home Yes-No, phone-use, peer-notice,
  Coach entry), You (Circle hardcoded, no invite code), 3-tab nav (no Focus).
- **Backends ready but not yet wired into the PWA:** `member.momentum`
  (behavioural-nudge engine), `member.coach` (AI coach — Groq/Gemini + graceful
  fallback), full Anchor Circle (`domain/circle.php`, `members.anchorCode`,
  signed portal token).
- Roadmap: `docs/anchor-journal-v2-gap-analysis.md` (11 phases). **Note:** two
  unreconciled XP models — `journal/app.jsx` (cumulative 250/750/1500/3000) vs
  `momentum.php` (flat 250/level).

## 8. Config / deploy
`api/config.example.php` → `api/config.php` (git-ignored): `db` (empty dsn =
bundled SQLite auto-migrate, or MySQL + `db/schema-mysql.sql`), `mail`, `ai`
(opt-in Groq/Gemini), `super_admin` (default super admin), `shared_secret`
(Sheets HMAC), `cookie_secret` (session + circle HMAC — must differ),
`session_ttl` (7d), cookie flags, `app_origin`, `afrovanguard` (cross-links +
sync token), `rate_limits`, `cloudinary` (signed uploads), `debug`.
Deploy = drop `dist/` on the host root (`docs/SETUP.md`; the DB is the single
source of truth). `apps-script/Code.gs` is an **optional, off-path** read-only
Google Sheets mirror (receives HMAC-signed `mirror.push`; nothing reads back).
`.htaccess` handles SPA fallback + CSP; `api/*/.htaccess` protect the backend,
storage, and cache dirs.

## Feature-gap remediation (2026-07)

A five-agent feature-gap audit produced a prioritised inventory; all items were
implemented. Highlights (see git history on `claude/product-design-audit-r89fjb`):

- **No-cron cliff → built-in web-cron** (`api/_lib/webcron.php`): drains the
  integration bus, sends parent-verification reminders + stalled alerts, and
  runs daily GC/promo-expiry opportunistically after each response. The Step-6
  cron jobs are now optional.
- **Orphaned modules wired**: Integrations admin (+manual dispatch), Behaviour/
  wellbeing monitor, session management ("Me → Security"), broadcast history.
- **Safeguarding**: duty rotation now excludes unscreened volunteers.
- **Broadcast** route no longer drops `audience`/`email`; in-app audience
  targeting via a `notifications.audience` column.
- **Account lifecycle**: 2FA backup codes + super-admin 2FA/password reset;
  verified self-service email change; staff-invite email; GDPR export +
  account deletion/anonymisation.
- **Program**: student completion certificates + revocation (both cert kinds);
  attendance check-out; guardian absence alerts; centre capacity + waitlist;
  bulk CSV student import; member + volunteer-duty leaderboards.
- **Learning**: assignment return-for-revision; event RSVP capacity + staff
  attendance marking; anchor missions self-seed a 12-week starter set.
- **Growth/ops**: newsletter compose/send + one-click unsubscribe; homepage
  promo reader + banner; applicant status lookup; peer reactions + moderated
  comments; donations (Paystack, config-gated) + ledger; per-member RBAC
  capability editor; super-admin impersonation; full-CSV exports; dashboard
  analytics tiles; media player embeds; SEO/PWA icon + metadata fixes.

Backend test suite grew from 333 → **427** passing; SMTP e2e + kiosk-offline
E2E green throughout. Schema advanced to **migration 31**.
