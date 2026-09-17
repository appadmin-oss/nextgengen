# NextGenGen (NGG) — Codebase Audit & Index

_Product:_ **Next Generation Genius** (an Afrovanguard programme) — a 12-week
growth programme for African teenagers. Two front-ends (a marketing/portal SPA
and the Anchor Journal PWA) over one PHP + SQLite/MySQL backend.
_Last re-indexed:_ 2026-08-06 · _Scope:_ full repository (~666 tracked files) ·
_Schema:_ `schema_version` **83**.

> Companion docs: `afrovanguard-sync.md` (NGG ↔ Afrovanguard),
> `anchor-journal-v2-gap-analysis.md` (Journal roadmap), `SETUP.md`, `SCHEMAS.md`,
> `OPERATIONAL-AUDIT.md`, `PRODUCT-DESIGN-AUDIT.md`,
> `NGGC-2040-BRIEF-AUDIT-2026-09.md` (the 2040 formation brief, clause by
> clause, against the code — and the three gaps that remain open).

## 1. Tech stack & build
- **React 18, no framework, no dev bundler.** JSX is compiled in-browser by
  Babel-standalone (`vendor/babel.min.js`); each `.jsx` is a
  `<script type="text/babel">` classic script attaching globals to `window`.
  React is vendored (`vendor/react*.production.min.js`).
- **Entry:** `index.html` loads scripts in order; app root `app.jsx` → `App()`,
  mounted in `<ErrorBoundary><AuthProvider><App/>` (`app.jsx:368`).
- **Routing is path-based** (not hash): `pageFromPath()` / `pathForPage()` /
  `PAGE_IDS` in `app.jsx` (now **34 pages**). Admin at **`/nextadmin`** (aliases
  `/hq`, `/admin`); `/login`,`/signin` → home + modal; `/q/*`,`/s/*` → summer
  profile; `/cert/*` → certificate; `/status` → `/s-status` (301). Deep links via
  `.htaccess` SPA fallback.
- **Prod build:** `build.js` (esbuild) — per-file JSX transform + concat in
  `ORDER` (18 files), minify → fingerprinted `dist/app.<hash>.min.js`; strips
  Babel from HTML; `validateOrderAgainstIndex()` fails on drift (verified: ORDER
  == `index.html` tags); builds the **Journal PWA as a 2nd target**
  (`buildJournal()`). Now also does **per-file content-hash fingerprinting**
  (ships hashed + plain copies, sweeps stale fingerprinted files) and writes
  `dist/build-manifest.json`; the `buildId` is hashed over **all
  client-cacheable assets** (not just the JS bundle) and stamped into both
  service-worker `CACHE_VERSION`s.
- **Serve:** Apache. `.htaccess` does SPA fallback + CSP (still allows
  `unsafe-inline/eval` for Babel — see §9 finding 1) + security headers.
  `api-client.js` exposes `window.NGGApi`, `credentials:'include'`, echoes
  `ngg_csrf` → `X-NGG-CSRF` on writes.

## 2. Site map / routes
`PAGE_IDS` (`app.jsx:10`) now lists **34 pages**. Public SPA (component / file):
- `home` HomePage `page-home.jsx` · `summer` SummerPage & `club` ClubPage
  `page-club.jsx` · `anchor` AnchorPage `page-anchor.jsx` (live via
  `member.anchor`) · `dashboard` DashboardPage `page-dashboard.jsx` · `book`
  BookPage `page-book.jsx` · `media`/`parents`/`volunteers`/`mentors`/`join`
  `page-other.jsx` · `blog` BlogPage `page-blog.jsx` · `contact` ·
  `summerprofile` (`/q`,`/s`).
- **New pages since last index:** `centres`/`community`/`volunteer` (registration)
  /`mentor` (portal)/`gate`/`apply`/`review`/`verify`/`reshoot`/`cards`/
  `designer`/`certificate`/`legal`/`journal-entry`. `centres`→`page-centres.jsx`,
  `designer`→`page-designer.jsx`; the rest are spread across `page-other.jsx`,
  `page-club.jsx` (community/arcade/journal-entry), and `page-home.jsx`.
- **Public status boards** (PII-free, aggregates only): `s-status` StatusPage
  (attendance) & `v-status` VolunteerStatusPage (volunteer needs vs filled),
  both `page-home.jsx`.
- **Admin** `AdminPage` `page-admin.jsx` · **`summer-admin`** SummerAdminPortal ·
  **`club-admin`** ClubAdminPortal (both `page-admin.jsx`) · **`circle`**
  CirclePortal `page-other.jsx` (guardian read-only portal).
- `OWN_CHROME_PAGES` (`app.jsx:58`) render without topnav/footer; `noindexPages`
  (`app.jsx:228`) keep personal/operational surfaces + certificates out of the
  index.
- Separate app: **`journal/`** PWA (own shell / `app.jsx` / `sw.js`).

## 3. Admin & manager system
**Roles / capabilities** — single source, `util.php` `admin_role_caps()`
(`util.php:295`):
- `super_admin` → `content, people, inbox, settings, rbac, summer, club, audit, journal`
- `admin` → `content, people, inbox`
- `editor` → `content`
- `summer_admin` → `summer` only · `club_admin` → `club` only
- **`audit`** (Monitoring & Evaluation, new) → `audit` only
- member → `[]`

**Per-member capability augmentation** (new): a `capsExtra` JSON column grants
extra caps to an individual account via `member_effective_caps()`
(`util.php:352`); the `journal` cap is assigned per-person and never inherited
from a role. **Centre-scoped admins** (new): a `centreScope` JSON column plus
`admin_centre_names_in_scope()` / `admin_centre_allowed()` (`util.php:326`) limit
an admin to named centres.

Helpers: `role_has_cap()`, `is_admin_role()`. **3-layer server enforcement:**
route `require_admin()` / `require_super_admin()` (`session.php`); domain
`admin_gate()` / `admin_cap_gate()` (`domain/admin.php`); a role-set guard (only
`rbac`/super_admin may change a member's `role`, validated against a whitelist).

Client **Control Room** (`page-admin.jsx`): gate order = loading → not-admin →
coordinator-redirect-to-portal → `AdminTotpGate` (if `!adminOk`) → console.
`ADMIN_SECTIONS` (`page-admin.jsx:45`) is now **32 sections** across People /
Content / Inbox / System, each gated by `SECTION_CAP` — including the new **Dues
& fees** (`fees`, cap `people`), **Attendance duty** (`attendance`, cap `summer`),
**Analytics / M&E** (cap `audit`), volunteers, centres, photos, policy, staff,
comment moderation, status-page editor, and integrations. Portals (`PortalGate`
→ `PortalLogin` → cap-lock → TOTP); super_admin can jump across portals.

> Improvement opportunities: `require_super_admin()` exists but is **still
> unused** (zero callers — RBAC ops rely on `admin_cap_gate(...,'rbac')`); no
> cross-tier / last-super-admin / self-demotion guard at the route layer. A
> default super admin is provisioned (`api/_lib/superadmin.php`).

## 4. Auth & sessions
Stateless **signed cookies** (`session.php`):
`b64url(json) . b64url(HMAC-SHA256(payload, cookie_secret))`, payload
`{mid, role, type, status, iat, exp, adminOk}`; verified with `hash_equals` + exp.
- **Password** sign-in `api/auth/login.php` → `auth_login()` (opt-in passwords,
  uniform failure, rehash-on-login); student login `api/auth/student-login.php`.
- **Magic-link + OTP** `request.php` / `verify.php` → `auth_request()` /
  `auth_verify()` (`auth_sessions`, 15-min, single-use, 5 tries).
- **Password reset** `reset-request.php` / `reset-confirm.php` (new).
- **Admin TOTP 2FA** `admin-2fa.php` re-issues the session with `adminOk=true`;
  `auth_totp_setup()` / `auth_totp_verify()`.
- **CSRF** double-submit (`ngg_csrf`), `csrf_require()` in bootstrap. The exempt
  list (`csrf.php:33`) has grown: login/request/verify/newsletter plus
  `reset-request`/`reset-confirm`, all `hooks/*` (HMAC-verified),
  `public/apply`, `public/selfreg`, `public/upload-headshot-sign`,
  `public/upload-fallback` — each pre-session, HMAC, or anonymous-intake (see §9
  finding 6).

**Users live in the `members` table** (`role`, `passwordHash`, `totpSecret`,
6-digit `anchorCode`, `capsExtra`, `centreScope`) — no separate users/roles
table. Admin bootstrap: `api/tools/create-admin.php` (named admin) and
`api/tools/seed-admin.php` + `api/_lib/superadmin.php` (default super admin).

## 5. Data model (`db/schema-mysql.sql`, `schema_version` 83)
`members` (account + `role` + `passwordHash` + `totpSecret` + `anchorCode` +
new `capsExtra` / `centreScope` / `mouAt` / `mouBy` / `duesRemindOff` /
`duesRemindedAt`) · `mentors` (+ `source`, `program`, `skills`,
`afrovanguardRef`) · `mentor_assignments` · `sessions` · `anchor_missions` ·
`member_progress` · `member_stats` (xp/level/streak) · `events` / `event_rsvps` ·
`posts` · `notifications` (`*` = broadcast; + `audience`) · **`journal`**
(reflections; mood/body/week/isPrivate) · `auth_sessions` · `audit_log` ·
`settings` (holds `anchor_content`) · `newsletter` · `assignments` /
`assignment_submissions` · `applications` · **`member_state`** (per-member KV,
backs the Journal tools) · `contact_messages` ·
Summer: `summer_cohorts` / `qr_codes` / `summer_students` / `attendance` ·
Circle: `circle_links` / `circle_confirmations` / `circle_remarks` ·
**New:** **`member_ledger`** (the fee ledger — see §7), **`centres`** (centre
directory + capacity/scoping), **`ops_events`** (ops/diagnostics feed).
(SQLite is auto-migrated at runtime and not checked in; only the MySQL schema
lives under `db/`. Cross-ref `docs/SCHEMAS.md`, which still needs
`member_ledger` added.)

## 6. API surface
Route files `api/{auth,member,admin,public,hooks,tools}/*.php` → `gs_call($op)` →
`backend_dispatch()` op registry (`_lib/backend.php`) → `_lib/domain/*.php`
(**39 domain files**). Routes inject `requesterId`/`memberId` from the verified
session. **~188 PHP files** total.
- **auth:** login / student-login / request / verify / me / logout /
  set-password / reset-request / reset-confirm / admin-2fa / admin-totp-setup.
- **member** (session-gated): dashboard / profile / journal / anchor /
  assignments / mission / notifications / state / momentum / coach / circle /
  rsvp / upload-sign · new: **fees** / engage / teaching / arcade / community /
  security / program-journal / account / confirm-email.
- **admin** (`require_admin` + cap): overview / members / mentors / mentorship /
  sessions / missions / events / posts / promotions / broadcast / anchor / audit
  / member-detail / assign-mentor / applications / newsletter / contact /
  settings / summer* / club* · new: **fees** / **attendance** / **volunteers** /
  behaviour / comments / community / photos / policy / registration / staff /
  status-pages / ops.
- **public** (cached): stats / events / posts / session / anchor-content /
  mentors / summer-profile / newsletter / apply / contact / config / circle ·
  new: centre(s) / cert / **donate** + **donate-callback** / engagement / gate +
  gate-unlock / instructor / journal-entry / leaderboard / review / selfreg /
  volunteer + volunteer-status / unsubscribe / upload-fallback /
  upload-headshot-sign / reshoot / site / health.
- **hooks** (HMAC): `attendance.php`, `paystack.php`.
- **Cron / tools:** `export-sheets.php`, `run-jobs.php`, `sync-afrovanguard.php`,
  `dispatch-events.php`, `registration-reminders.php`, `seed-admin.php`,
  `check-cloudinary.php`, `check-photos.php`, plus the **built-in web-cron**
  (`_lib/webcron.php`) which now also drains fee reminders and the uprate nudge.
- **Biggest domain files:** `registration.php` (~200KB), `summer.php` (~110KB),
  `volunteers.php` (~100KB), `community.php` (~66KB), `admin2.php` (~64KB),
  `fees.php` (~62KB), `insight-chat.php` (~61KB), `assessment.php` (~59KB),
  `policy.php` (~58KB).

## 7. Fees / dues ledger (`domain/fees.php`)
A member-**obligations ledger** — explicitly *not* a payment processor. Backend
`api/_lib/domain/fees.php`; routes `api/admin/fees.php`, `api/member/fees.php`;
17 ops registered in `_lib/backend.php` (`admin.fees.{settings.get/set, member,
payment, void, mou, remindOff, accrue, remind.preview, remind.run,
uprate.preview, uprate.apply, arrears, charge, waive, lookup}` + `member.fees`).
Front-end: `FeesPanel` in `page-admin.jsx` (admin section `fees`, cap `people`);
member read-only `DashboardObligations` in `page-dashboard.jsx` (`member.fees()`).

- **Storage:** table `member_ledger` (`entryId`, `memberId`, `kind`, `direction`,
  `amount`, `periodKey`, `sessionId`, `voidedAt/By/Reason`). The unique index
  **`idx_mledg_accrual (memberId, kind, periodKey)`** is the money-correctness
  backbone.
- **Three charges:** `membership` (one-off), `dues` (monthly), `training`
  (per programme session; default ₦75,000). Credits: `payment`, `writeoff`,
  `waiver`. Manual human entries: `fine`, `adjustment`.
- **Money/ownership rules (enforced):**
  - **Idempotent accrual** — `fees_post()` relies on the unique index and
    *swallows* the duplicate, so a double cron/press cannot double-charge a
    period.
  - **Uprating touches settings only, never posted charges** —
    `fees_uprate_apply()` rewrites the three amount fields and stamps
    `uprateLastAt`; it never writes `member_ledger`, is refused when not due
    (interval guard) so a second press can't raise twice, excludes `balanceCap`,
    rounds to nearest ₦10, and is capped at 50%/pass. Cron only *journals* a
    nudge (`fees_uprate_note()`), which cannot apply a raise.
  - **Bounds** — every settable amount clamped to `FEES_AMOUNT_MAX` (₦10M);
    batch sizes bounded; `FEES_DUE_MONTHS_MAX` (120) stops an old join date
    minting hundreds of charges.
  - **Training write-down = tenure, not payment** — `fees_tenure()` measures
    from `joinDate`/`createdAt`; `fees_balance()` computes `trainingEarned`
    straight-line and exposes `payable = outstanding − earned`. MOU completion
    (`admin_fees_mou`) writes off the remaining training charge and stamps
    `mouAt`.
  - **Corrections don't delete** — `void` (with reason) and `waive` (clamped to
    outstanding) preserve history; every op is audited under its own event.
  - **Reminders chase `payable`, not `outstanding`** — per-family opt-out
    (`duesRemindOff`), a 7-day floor, a min-balance gate, bounded sends,
    NGG-members-only.

## 8. Anchor Journal (`journal/`)
Installable PWA (`noindex`, self-hosted fonts + Phosphor icons, TWA-ready
`deploy/twa-manifest.json` + `.well-known/assetlinks.json`). Shares the SSO
cookie (boots via `NGGApi.auth.me()`, gated by `SignInGate`). Persistence:
localStorage cache + write queue syncing `member.journalCreate`; cross-device
via `member_state` keys (`prefs`, `systems:<date>`, `selfscore:<monday>`, …).
`journal/app.jsx` has grown to ~2,058 LOC / 140KB.

> **Status lists below are from the prior audit and are likely stale after the
> PWA's growth — re-verify against `docs/anchor-journal-v2-gap-analysis.md`
> before relying on them.** Backends `member.momentum` (behavioural-nudge) and
> `member.coach` (AI coach — Groq/Gemini + graceful fallback) and the full
> Anchor Circle (`domain/circle.php`, `members.anchorCode`, signed portal token)
> exist. **Note:** two XP models — `journal/app.jsx` (cumulative
> 250/750/1500/3000) vs `momentum.php` (flat 250/level) — reconcile before
> reusing either figure.

## 9. Config / deploy
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
storage, and cache dirs (7 per-dir `.htaccess` present).

## 10. Audit findings (current code, by severity)

**HIGH**
1. **CSP still permits `unsafe-inline` + `unsafe-eval` in production**
   (`.htaccess:97`, shipped identically in `dist/`). **[2026-08-10 — verified NOT
   a quick fix.]** The prod bundle strips Babel and the app/api-client/data code
   use no `eval`/`Function`, but `unsafe-eval` still cannot simply be dropped:
   several shipped vendor libs call `new Function` — `filerobot-image-editor`,
   `tui-image-editor`, `tui-color-picker` (the ID Designer's image editor), plus
   `docx`/`jszip` (exports). This is an SPA (every route serves the same
   `index.html` and the editor lazy-loads), so a per-route CSP via `.htaccess`
   can't scope the allowance to the designer only. `unsafe-inline` likewise backs
   2 inline boot scripts in `index.html`. Real remediation (larger, deliberate):
   sandbox the image editor in an iframe with its own CSP (or replace the
   `Function`-using libs), add nonces/hashes for the inline boot scripts, then
   drop both allowances from the `dist/` `.htaccess` only (dev keeps them for
   in-browser Babel). Until then, stored-content XSS risk stands — mitigate by
   escaping/sanitising posts/community/journal render paths.
2. ~~**`page-other.jsx` (~500KB) contains non-UTF8 / binary bytes**~~ **[RESOLVED
   2026-08-10.]** The single stray byte was a raw NUL (U+0000) embedded in the
   `NO_CENTRE` filter sentinel string literal. Replaced the raw byte with an
   explicit U+0000 escape: same runtime value (still a NUL-prefixed, non-colliding
   client-only sentinel — never sent to the backend), but the source is now clean
   UTF-8 and greppable. The compiled `dist/` bundle is byte-for-byte unchanged and
   the build + build-integrity tests pass.

**MEDIUM**
3. **Giant single-file globals** — `page-admin.jsx` (~694KB / 10,440 LOC),
   `page-other.jsx` (~500KB, 11+ unrelated top-level pages), `page-home.jsx`
   (~217KB), `page-analytics.jsx` (~200KB); backend `domain/registration.php`
   (~200KB). No module boundaries; the worst maintainability risk in the repo.
4. ~~**All fee ops gate on the `people` cap only**~~ **[cap separation RESOLVED
   2026-08-10.]** All 16 fee ops now gate on a dedicated **`fees`** capability
   (`admin_cap_gate($p,'fees')`), grantable per-person via `capsExtra` like
   `journal`; `super_admin` holds it by role, and a plain `admin` no longer does.
   A one-time, driver-agnostic data seed (`fees_cap_v1` in `db_run_seeds` — no
   schema bump needed, `capsExtra` already exists) backfills `fees` to every
   pre-split non-super_admin account that already held `people`, so no current fee
   admin is locked out on deploy. Client: the "Dues & fees" section, the caps
   editor (`ALL_CAPS`), and console visibility now key on `fees`; the grantable-
   caps whitelist (`admin.php`) includes it. Tests added (deny people-only / grant
   opens / super_admin by role / backfill). — _Still open (separate concern):_ a
   human `fees_charge` can push an account past `balanceCap` by design (surfaced
   as `overCap`, not refused), bounded only by the per-amount ₦10M cap, not a
   per-account ceiling.
5. **`fees_balance()` recomputes by scanning a member's whole ledger on every
   read**; `admin_fees_arrears` loads the entire non-void ledger into PHP —
   O(rows) on arrears/lookup screens (a scaling, not correctness, concern).
6. **CSRF exempt surface has grown** (`csrf.php:33`). Each exemption is reasoned,
   but `public/upload-fallback` and `public/upload-headshot-sign` widen the
   unauthenticated-write surface; both are IP-rate-limited only.
7. **Test harness is a single ~923KB file** (`api/tests/run.php`) — the prior
   "427 tests / migration 31" figures are no longer verifiable from it and are
   stale (schema is now 83).

**Sound (verified, keep as-is)**
- Fee money-correctness (idempotent accrual, settings-only uprating,
  payable-vs-outstanding, non-destructive corrections) is well-implemented.
- `validateOrderAgainstIndex()` drift guard works — ORDER matches `index.html`.

## Appendix — Feature-gap remediation (2026-07)

A five-agent feature-gap audit produced a prioritised inventory; all items were
implemented (see git history on `product-design-audit-r89fjb`).
Highlights:

- **No-cron cliff → built-in web-cron** (`api/_lib/webcron.php`): drains the
  integration bus, sends parent-verification reminders + stalled alerts, drains
  fee reminders + the uprate nudge, and runs daily GC/promo-expiry
  opportunistically after each response. The Step-6 cron jobs are optional.
- **Orphaned modules wired**: Integrations admin (+manual dispatch), Behaviour/
  wellbeing monitor, session management ("Me → Security"), broadcast history.
- **Safeguarding**: duty rotation excludes unscreened volunteers.
- **Broadcast** route no longer drops `audience`/`email`; in-app audience
  targeting via a `notifications.audience` column.
- **Account lifecycle**: 2FA backup codes + super-admin 2FA/password reset;
  verified self-service email change; staff-invite email; GDPR export +
  account deletion/anonymisation.
- **Program**: student completion certificates + revocation; attendance
  check-out; guardian absence alerts; centre capacity + waitlist; bulk CSV
  import; member + volunteer-duty leaderboards.
- **Learning**: assignment return-for-revision; event RSVP capacity + staff
  attendance marking; anchor missions self-seed a 12-week starter set.
- **Growth/ops**: newsletter compose/send + one-click unsubscribe; homepage
  promo reader + banner; applicant status lookup; peer reactions + moderated
  comments; donations (Paystack, config-gated) + ledger; per-member RBAC
  capability editor; super-admin impersonation; full-CSV exports; dashboard
  analytics tiles; media player embeds; SEO/PWA fixes.

_Since that audit, the flagship additions have been the **fees/dues ledger**
(§7), the **M&E analytics workspace** (`page-analytics.jsx` + `domain/analytics*`,
`insight*` — surfaced by the new `audit` role), the **volunteer register &
attendance-duty** system (`domain/volunteers.php`, public
`VolunteerStatusPage`), the **centres directory**, and the **ID designer**
(`page-designer.jsx`). Schema advanced to **83**._
