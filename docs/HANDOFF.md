# HANDOFF — NGG × Afrovanguard program of work

Working memory for the next agent. This file is duplicated in both repos
(`nextgengen/docs/HANDOFF.md` and `afrovanguard-site/docs/HANDOFF.md`).

---

## 0. Intent (what the user asked for)

Verbatim scope, plus one mid-stream addition:

1. **Audit and index the NGG website.**
2. **Find a way to sync it with Afrovanguard.**
3. **All Afrovanguard changes go to the `vigilant` branch.**
4. **Add a default super admin** with access to all admins and managers — "I need
   to be able to login."
5. **Improve the admin and managers UI and logic.**
6. **Upgrade the Anchor Journal** (design comps were provided as a zip).
7. (Added later) **"Do the separate super admin for NGG"** — NGG needs its own
   super admin, distinct from Afrovanguard.

The user's email (the intended super-admin identity): `mamcareer@afrovanguard.org.ng`.

### Repos & branches — IMPORTANT
- **Afrovanguard** (`appadmin-oss/afrovanguard-site`): develop on
  **`claude/vigilant-knuth-kuhk7c`** — this is the "vigilant" branch the user
  meant. Do NOT use the audit-sync branch for Afrovanguard.
- **NGG** (`appadmin-oss/nextgengen`): develop on
  **`claude/ngg-afrovanguard-audit-sync-becs2k`**.
- **mam-academy**: in scope but untouched — nothing was required there.
- No PRs have been opened yet (user was asked; hasn't answered). Don't open PRs
  unless asked.

---

## 1. Status — DONE, verified, pushed

| # | Task | Where | Verified |
|---|------|-------|----------|
| 1 | NGG audit & index | `nextgengen/docs/NGG-AUDIT-INDEX.md` | n/a (doc) |
| 2 | Afrovanguard default super admin + login | `afrovanguard-site` (vigilant) | login → superadmin, wrong pw rejected, idempotent |
| 3 | Admin/manager UI + logic | AV Studio card + NGG lockout guards | guard unit-tested |
| 4 | Anchor Journal upgrade (phases 2–4) | `nextgengen/journal/*` | `node build.js` clean |
| 5 | NGG ↔ Afrovanguard sync | both repos | end-to-end over HTTP |
| 6 | Separate NGG super admin | `nextgengen` | login → super_admin, idempotent |

### Task 2 — Afrovanguard super admin (vigilant branch)
- `lib/SuperAdmin.php` — idempotent, fingerprint-guarded `ensure()` sets BOTH
  `admin_users(email→superadmin)` AND `lms_users(role=admin, active, verified,
  password)`. Config: `AV_SUPERADMIN_EMAIL` / `_NAME` / `_PASSWORD`.
- Hooked into `login/index.php` and `admin/api.php` (login/session actions only).
- `db/seed_admin.php` CLI prints/reveals credentials. `admin/api.php` action
  `superadmin_reveal` + `admins_list` extras. Studio UI: `admin/index.php`
  `#adSuperCard` + `admin/app.js` `renderSuperCard()`.
- `.env.example` documents the block.

### Task 6 — NGG super admin (audit-sync branch)
- `api/_lib/superadmin.php` — `ensure_super_admin()` creates/promotes a
  `members` row `role=super_admin` with a password; config `super_admin`
  {email,name,password} in `api/config.php`.
- Hooked into `api/auth/{login,request,verify}.php`. CLI `api/tools/seed-admin.php`.
- NGG admins still pass a one-time TOTP setup on first Control Room visit (by
  design — do not weaken).

### Task 3 — admin logic
- AV: `admin/app.js` shows the default super admin + one-time password reveal.
- NGG: `api/_lib/domain/admin.php` `admin_members_upsert()` now blocks demoting/
  suspending the **last** active super_admin and **self**-demotion/suspension
  (`last_super_admin`, `cannot_demote_self`, `cannot_suspend_self`).

### Task 5 — sync (NGG mirrors Afrovanguard's approved mentor pool)
- **AV side:** `integrations/api.php` action `mentors.directory` + new
  `mentors:read` scope in `lib/AppTokens.php`.
- **NGG side:** `api/tools/sync-afrovanguard.php` (CLI/cron) upserts into
  `mentors` (`source='afrovanguard'`, keyed on `ref`); config `afrovanguard`
  {api_base, api_token}. Docs: `nextgengen/docs/afrovanguard-sync.md`.

### Task 4 — Anchor Journal (all in `nextgengen/journal/app.jsx` + `app.css`)
- Reflect editor v2 (School/Home/Peer structured logs + Coach entry card).
- Coach chat screen (`Coach`) → `NGGApi.member.coach`.
- Focus tool (`Focus`) + 4-tab nav (Journey·Focus·Growth·You).
- Notepad (`Notepad`) + Goals (`Goals`) + Quick Tools grid on Home.
- New `member_state` keys loaded on boot: `focusTasks:<day>`, `notes`, `goals`.

---

## 2. How to log in (tell the user)

**Afrovanguard:** email `mamcareer@afrovanguard.org.ng`. Set
`AV_SUPERADMIN_PASSWORD` in env for a known password, OR run
`php db/seed_admin.php` on the server to reveal an auto-generated one. Sign in at
`/login`. If Google sign-in is configured, "Continue with Google" (org account)
also lands as superadmin. Break-glass `AV_ADMIN_TOKEN` at `/admin` always works.

**NGG:** set `super_admin.password` in `api/config.php` (or run
`php api/tools/seed-admin.php` to reveal a generated one), then sign in with the
email + password and complete the authenticator (TOTP) setup on first Control
Room visit.

---

## 3. Anchor Journal — ALL PHASES DELIVERED (this session)

Everything below is pushed to `claude/ngg-afrovanguard-audit-sync-becs2k`,
each increment verified with `node build.js` (+ `php api/tests/run.php`,
148/148, where the backend changed). Details in
`docs/anchor-journal-v2-gap-analysis.md` §G.

1. ✅ **Multi-step onboarding (Phase 1).** Welcome → Name → Why → Study time;
   persists to `member_state.prefs` (+ `onboardedAt` — completion follows the
   account); Replay intro re-enters pre-filled (one-shot session flag).
2. ✅ **Shop + economy (Phase 5) + XP reconciliation.** Client adopts the
   server's flat model (60 XP/reflection-day, 250/level — `momentum.php` was
   already canonical). `member_state.shop`: diamonds (5/day + 5/focus-session
   − spend), Streak Freeze (30💎, max 2, auto-consume, sync-gated), accent
   themes (20💎) swapping `--a/--a-ink/--a-rgb` app-wide, gold level-up
   overlay (per-device baseline in localStorage — no server-clobber race).
3. ✅ **You → Your Circle (Phases 6–7).** Real invite code + Copy/rotate,
   LINKED/PENDING from `circle_links`, per-link revoke, and circle remarks
   surfacing in Weekly Review ("From your circle").
4. ✅ **Portal cohort strip (Phase 8 remainder).** New `circle.cohort` op
   (device token list → read-only summaries + at-risk flags); /circle
   remembers pairings, chip-switches students, "+ Add", graceful fall-over
   on revocation. (The role→code→verify→consent→dashboard flow shipped in
   an earlier session.)
5. ✅ **Phase 9 core** — printable report was already live; remark→Review
   wiring landed with (3). ✅ **Phase 10** fonts (earlier session).
   ✅ "Sound & haptics" toggle (A10).

6. ✅ **Runtime smoke.** `tests/journal-smoke.js` (Playwright + Chromium +
   real PHP backend on a throwaway SQLite DB): OTP sign-in → onboarding →
   Journey → Shop → Growth → You (live circle code) → Focus → anchor a
   reflection. PASS, zero uncaught page errors. Setup in the file header.

Nothing from the Anchor design comps remains open.

---

## 3b. Platform build wave (post-blueprint) — DONE, verified, pushed

All on `claude/ngg-afrovanguard-audit-sync-becs2k`; suite now 182/182 +
browser E2E. UX blueprint (locked v2): https://claude.ai/code/artifact/6744d694-868b-4f14-b547-7c2edcc52aaf

| Piece | Where | Verified |
|---|---|---|
| Identity gateway (one door, staff invisible) + device sessions/revoke + lockout + Argon2id + headers | auth.gateway, api/member/security.php, session.php, migration 10 | tests + live HTTP + smoke |
| AI key profiles (coach/behaviour/analysis/moderation, Gemini+Groq, fallback chains) | api/_lib/ai.php | tests (offline resolution) |
| Integration bus (outbox→GChat/signed webhooks/Apps Script Sheets; retries+log) + SMS (Termii→Twilio) | api/_lib/bus.php, sms.php, admin/integrations.php, tools/dispatch-events.php, docs/integrations.md, migration 11 | tests (mocked HTTP) |
| Registration stack (versioned form builder, gate links, parent verify + consents ledger, QR bind on verify, reminders) | api/_lib/domain/registration.php, admin/registration.php, public/gate.php, public/verify.php, tools/registration-reminders.php, migration 12 | tests + browser E2E |
| Inbound attendance webhook + published spec | api/hooks/attendance.php, docs/attendance-webhook.md | tests |
| Volunteer registration (public /volunteer; Volunteer → admin\|mentor\|instructor, instructors pick courses from the live form's catalogue; phone normalized + REQUIRED for instructors; volunteer.applied bus event; volunteer_applications_open toggle) | migration 15, events.php public_apply+public_volunteer_context, public/volunteer.php, VolunteerRegisterPage in page-other.jsx, VolunteersPage rewired | tests + browser E2E |
| Volunteer lifecycle (admin review desk api/admin/volunteers.php list/approve/decline; approve mints VOL-YY-serial + binds VOLQR check-in token + digital ID at /q/<token> + email/SMS delivery via volunteer_sms_notify setting + volunteer.approved bus event; scanner + public profile accept volunteer tokens; decline emails courteously) | migration 16 (volunteers), domain/volunteers.php, summer.php checkin/profile extended, admin/volunteers.php | tests (14 checks) + browser E2E full lifecycle |
| Public API CORS (allow-listed sister origins on /api/public/*, config key cors_origins) + apply.php CSRF-exempt (anonymous intake) — enables the STS headless volunteer embed | bootstrap.php, csrf.php | probe |
| Summer ID v3: front line = bold CATEGORY • Course (name form courses "Arts • Tye & Dye"); back lockup Okun Alimọsho \| Lagos Child \| STS (okun slot self-hides until assets/idcard/logo-okun.png lands) | page-other.jsx CardFront/CardBack | browser E2E |
| Volunteer ledger + certificates (migration 17): attendance → hours (volunteer_session_hours, default 4); milestone days [5,10,25,50] auto-mint verifiable certs at /cert/<id> (printable), emailed + volunteer.milestone bus event; digital ID shows sessions/hours/certs | volunteers.php ledger+cert, summer.php checkin hook, CertificatePage in page-other.jsx | tests + browser E2E |
| Safeguarding (migration 17): volunteers.safeguarding pending\|cleared; admin toggle; GateCheckin surfaces ⚠ for unscreened youth-facing volunteers + 🏅 on milestone; digital-ID + roster badge | volunteers.php admin_volunteer_safeguard, GateCheckin | tests + browser E2E |
| Instructor roster view (public, token + registered-email gate): first names + today-present only; on the digital ID | volunteers.php public_instructor_roster, InstructorRoster in page-other.jsx, api/public/instructor.php | tests + browser E2E |
| Public status page FULL management: admin controls both boards (/s-status, /v-status) via one `status_pages` setting — publish toggle, editorial copy (title/tagline/transparency/CTA), per-section visibility, per-KPI-tile visibility, hero accent colour, trend window (7/14/30), which centres appear (allowlist; empty=all), and an announcement banner (text+tone). Type-aware merge/validate (`status_pages_merge`); public ops render copy + apply centre filter + trend window + short-circuit to "offline" when unpublished. Admin surface (Content → Status pages) has grouped controls, reset-to-defaults, discard, and a LIVE in-admin preview (real board via `previewConfig` override) | admin2.php status_pages_defaults/merge/config + admin_status_pages_get(+defaults+centreOptions)/set, volunteers.php public_volunteer_status filter, page-home.jsx StatusPage/VolunteerStatusPage (sections/kpis/accent/banner/previewConfig), page-admin.jsx AdminStatusPages, api/admin/status-pages.php | tests (11 checks; 532 total) + screenshots |
| V3 Champion (migration 38 schema): mentor weekly Verbal·Vocal·Visual rating (1-5 each, one row per student per ISO week, upserted; `member.mentor.v3.rate` + MentorV3Sheet in the portal, roster carries current-period V3); `v3_leaderboard` + `admin.champions.board`/`admin.champions.mint` (non-monetary awards, idempotent per period, cap `people`); analytics workspace Recognition shows the live V3 leaderboard + gated mint button (`rankings.v3`, `canMint`) | mentor.php, analytics.php, backend.php, member/mentor.php, admin/analytics.php, page-other.jsx MentorPortal/MentorV3Sheet, page-analytics.jsx | tests (9 checks; 521 total) + screenshots |
| Volunteer status board + form overhaul (migration 40): required `centre` + `faculty` (mentor/instructor) on intake, faculty catalogue Form-Builder-driven (`volunteer_faculty_options`); `volunteer_needs` ledger (per centre×role×faculty) + admin CRUD (`admin.volunteers.needs.*`, Needs tab in AdminVolunteers); public PII-free `/v-status` board (`public.volunteer.status`, VolunteerStatusPage) with per-centre click-through by-role/faculty/course; `/status`→`/s-status` rename (SPA alias + .htaccess 301) | events.php (apply+context+faculty/centre options), volunteers.php (needs+status), registration.php (faculty field), page-home.jsx VolunteerStatusPage, page-other.jsx VolunteerRegisterPage, page-admin.jsx VolunteerNeedsEditor, app.jsx routing | tests (§5 QA gates, 512 total) + screenshots |
| Session slots at approval: capacity-aware upcoming events listed in the approval email | volunteers.php volunteer_upcoming_sessions | tests |
| Admin Volunteers desk (People → Volunteers): review queue (approve issues ID+QR / decline), roster tab with search + safeguarding toggle + CSV export; overview attention cards (pending + unscreened) | page-admin.jsx AdminVolunteers | browser E2E |
| Legal & data protection (/legal, NDPA/NDPR): Privacy, Terms, Safeguarding, Parental Consent, Cookies, Data Rights — anchored side-nav, ?doc= deep links, footer wired | page-other.jsx LegalPage | browser E2E |
| Registration management (Summer portal tabs): visual form BUILDER for the live reg form (reorder/add 10 field types/required/sensitive/locked/options/min-max/help + preview + publish → new version), gate-link create/copy/revoke, pending parent-verification queue + resend, ID-cards deep link. Surfaces the previously-orphaned admin.registration.* | page-admin.jsx SummerFormBuilder/SummerGates/SummerPending | browser E2E |
| Camera-first PhotoCapture (shared): camera → capture → Cloudinary (c_thumb,g_face,e_improve); upload + paste-link secondary; re-take/remove. Wired into admin enrol + member/mentor editors (was file/URL only) | components.jsx PhotoCapture | browser E2E (fake camera) |
| Website management (/nextadmin → Site content, settings cap): edit homepage hero (eyebrow/headline/emphasis/subhead/CTAs) + footer tagline w/ live preview; site_content setting merged over defaults, public.siteContent reader, useSiteContent hook drives Hero + Footer; blank field restores default. Volunteer toggles (intake open, SMS notify, session hours) added to Settings | admin2.php site_content*, page-admin.jsx AdminSite, page-home.jsx Hero | tests + browser E2E |
| Multi-form builder (main-panel Forms section, content cap): form_registry (summer-reg/volunteer/contact) + formId-scoped get/list/publish; form_validate_fields takes per-form locked set (fixed a bug enforcing summer fields on every form); each public form editable via the visual builder, locked cores protected, per-form versioning | registration.php form_registry/form_defaults_for/admin_forms_list, page-admin.jsx AdminForms + generalized SummerFormBuilder(formId) | tests (243) + browser E2E |
| QR full lifecycle (main-panel QR codes section + summer portal): mint, status tiles (blank/assigned/void), status filter, search, per-card Reassign (frees both sides) + Void (retire lost card, detach student); backend admin.summer.qr.void/reassign + counts | summer.php qr_void/qr_reassign, page-admin.jsx SummerQR + AdminQRCodes | tests + browser E2E |
| Registration as a first-class main-panel page (People → Registration, summer cap): Gate links / Pending sign-ups / Centres sub-tabs (SummerCentres added); QR codes also promoted to its own People nav item | page-admin.jsx AdminRegistration/AdminQRCodes/SummerCentres | browser E2E |
| Camera-first on ALL public forms: PhotoCapture (camera→capture→Cloudinary, upload+paste-link fallbacks) now on the public application (/join) and the public volunteer form details step; volunteer photo flows appl→approve→volunteer record→digital ID | page-other.jsx JoinPage + VolunteerRegisterPage, api/public/apply.php | browser E2E (fake camera) |
| Behaviour monitor (AI classify + rules fallback, wellbeing flags → bus) | api/_lib/domain/behaviour.php, migration 13 | tests |
| Gate desk UI (/gate?g=…) + parent page (/verify?t=…) | page-other.jsx (GatePage, ParentVerifyPage), app.jsx routes | Playwright E2E 12/12 |
| Audit (M&E) role — read-only by construction | util.php admin_role_caps, audit tail | tests green |
| Dues reminders, dispatched (rides the existing 15-min `reminders` cron, guarded so a fault cannot take registration reminders with it). `fees_reminder_candidates()` holds every bound in one place so no caller can skip them: chases **`payable`, not `outstanding`** — a member mid-service carries a training charge being written off, and chasing it demands money already forgiven; per-family `duesRemindOff`; `remindMinBalance`; and `remindEveryDays` floored at 7, so the cron's cadence is never the reminder's. Returns NAMED exclusion counts (off/optedOut/nothingPayable/underMinimum/tooSoon/noEmail) because "sent 4 of 60" is not checkable and "why wasn't I told" is the question asked. `duesRemindedAt` stamped on every ATTEMPT, not only on success — otherwise a broken mailer re-sends on every tick forever. Copy is deliberately plain: figure, what it is for, and an invitation to reply; no deadline, no consequence — a threatening note to a struggling family produces a child who stops coming, not a payment. `admin.fees.remind.preview` shows who and why-not before the un-recallable send | fees.php fees_reminder_candidates/fees_reminder_send/fees_reminders_run + 2 ops, webcron.php web_cron_reminders, api-client.js | tests (9 PHP, mutation-verified) |
| Member obligations — dues & fees (migration 83, People → Dues & fees, `people` cap). Admin-defined membership fee, monthly dues, and training fee (default ₦75,000 **per session**, a default not a policy). One append-only `member_ledger` — no `balance` column, because "how did it get to that?" is the only question a money screen is ever asked; corrections VOID with a reason and stay visible. `UNIQUE(memberId, kind, periodKey)` makes accrual idempotent, which is the point: it runs from a cron AND a button, so it *will* run twice. **The training fee is not really a bill** — charged so nobody is surprised by it, then written down a month at a time across the service half, fully written off when the MOU is accomplished (`members.mouAt`/`mouBy`, recorded as a fact rather than inferred from a zero balance). 3 years = 18 months training + 18 service, both settable. `payable` (what to ask for) is reported beside `outstanding` (what is charged) so they cannot be confused; arrears rank by payable. Microcopy under the training fee is deliberately quiet, states the CONDITION not a refund promise, and is browser-asserted as rendered — not a heading, not bold, no larger than its label. Bounds by design: per-member `balanceCap` stops accrual (enforced, not just shown), reminder cadence floored at 7 days with a per-family off-switch. Nothing compounds. **Ledger only — no gateway**, and money never reaches a child's public record or gates a check-in (grep-asserted against summer.php/gate.php) | migration 83 + mysql mirror, fees.php (new domain), api/admin/fees.php, backend.php 9 ops, api-client.js `admin.fees.*`, page-admin.jsx AdminFees | tests (16 PHP + 8 browser, mutation-verified) |
| Volunteer attendance: retention + real policy standing. `volunteer_attendance_analysis()` gains a `retention` block — FOUR states summing to the headcount (`coming`/`stopped`/`never`/`new`), per centre AND per role, `stoppedPct` over `settled` (= people − new) so recruiting cannot make retention look worse. `new` is the state volunteers need and children don't: a cohort starts together, volunteers trickle in all term. Row carries `retention` so panel and register agree. Two defects fixed: `scenarios['flagged']` was hardcoded 0 under a comment claiming volunteers carry no policy standing — `policy_states_for($ids,'volunteer')` has always taken a type and the settings define a volunteer redline/absence limit/lateness cap of 4, so a volunteer two lates from suspension looked identical to one in good standing; and `never` meant `present===0` regardless of join date, so every volunteer approved that week sat on the phone-call list. Rows now carry `state`/`absences`/`lateCap`; new `new` chip (volunteer-only). `/v-status` gets a "Still turning up" KPI and a "Who is still with us" panel that names a centre where NOBODY comes — which has no rate at all, so the rate table shows it as an empty row | volunteers.php volunteer_attendance_analysis + admin_volunteer_attendance, page-admin.jsx ATT_SCENARIOS + chip filter, page-home.jsx VolunteerStatusPage (`.vret-*`) | tests (5 PHP + 5 browser, mutation-verified) |
| Roster filters COMBINE (People → Registration / Summer → Students): seven server-side facets — `centre`, `track`, `schoolType`, `status`, `consent`, `id`, `sex` — plus search, ANDed. The bug was not a missing picker: search and school type went to the server while the situation filter ran on the DRAWN PAGE, so combining them narrowed two different populations at two different moments and the second only saw whichever rows came back first. One pass over the scanned rows now, above the serialiser (which costs a consents read per child) and above the page cap. `ROSTER_ENUM_FACETS` splits the fixed vocabularies (lower-cased) from free text (centre/track, verbatim) — lower-casing a centre name but not the row is a filter that silently matches nothing. **Facet counts are computed with the OTHER facets applied**, so "Public (12)" means twelve given what else is selected; counting over the whole cohort is the faceted-search trap (option reads 42, returns 0). A facet never narrows its own options, or there is no way back. `applied` echoed so the screen shows what is in force; matched-of-total names each active facet; one Clear-N-filters button. Route loops ROSTER_FACETS rather than listing them | summer.php ROSTER_FACETS/roster_facet_value/roster_facet_want/roster_consent_states + admin_summer_students_list, api/admin/summer.php, page-admin.jsx SummerRoster | tests (8 PHP + 12 browser, mutation-verified) |
| Roster filter by school type (People → Registration / Summer → Students): server-side `schoolType` on `admin.summer.students.list`, applied over the scanned rows ABOVE the page cap (a filter below the cap filters the page — same bug the attendance register had). `school_type_key()` normalises what the data actually holds ("govt", "LGEA", "State" → public) so a split does not omit pre-dropdown and imported rows; `other` kept apart from `unknown`, and "not recorded" is a filterable state rather than a hidden remainder. Picker states the whole split on its options (counts computed pre-filter); roster line says matched-of-total and warns when truncated. `limit` is caller-settable and clamped (same shape as the register), which is what makes the cap ordering testable. Row carries `schoolTypeKey` beside the raw `schoolType`; CSV exports both | summer.php school_type_key/summer_row_school_type/school_type_filter_key + admin_summer_students_list, api/admin/summer.php students route, api-client.js summer.students(q, cohortId, opts), page-admin.jsx SummerRoster | tests (10 PHP + 10 browser, mutation-verified) |
| ui-smoke: an interaction failure is an assertion, not a crash — `step(label, fn)` beside `ok()`. A bare `await page.fill/.click` that missed its target rejected out of the single async IIFE and took every LATER block with it: one broken selector on the review desk reported 409/531 assertions and looked like one problem. The review-desk block now bails by early return with the un-drivable control named | tests/ui-smoke.js | verified by breaking a selector: 409 passed before, 519 after |
| Retention on every surface that reports a rate — ONE definition. `attendance_retention($onlyCentres)` (summer.php, beside `ATT_STOPPED_RUN`) is the single implementation of "came then stopped"; the admin register, `insight_attrition_counts()`, the public `/s-status` board and the analytics workspace all call it, so the same nine children are the same nine everywhere. Board gets a `retention` block + per-centre `stopped/stillComing/neverCame/stoppedPct`, honouring the page's centre allow-list; StatusPage gets a "Who is still coming" section, a KPI tile and a summary sentence. Workspace gets `research.retention`, a Stopped column, a first-priority attention card, and retention in the CSV + PDF. Window is the TERM, never the filter's range — a fortnight would call everyone who missed it a leaver. Returns `[]` (rendered as absent, never 0%) where there is no calendar or the term is younger than the run | summer.php attendance_retention, insight.php insight_attrition_counts (delegates), admin2.php public_status, analytics.php analytics_workspace, page-home.jsx StatusPage, page-analytics.jsx anAttention/an-centres/exportPdf | tests (5 PHP + 12 browser, all mutation-verified) |

## 3c. REMAINING UI (backends all exist — wire, don't invent)

1. **Member dashboard shell** (dark blue #16223E + gold #FFCE54 + Tilt from
   motion.jsx): tabs Home · Growth · Me; journal = launcher REDIRECT (never a
   tab); W10 first-run (member.security has hasPassword/sessions; setPassword
   exists); Me → Security = NGGApi.member.security/securityRevoke*.
2. **Admin Today screen** (mobile-first W7): stat tiles from
   admin.registrations.list (pendingCount), admin.behaviour.list (openFlags),
   admin.summer.attendance; "Needs you" rows; gate-link manager
   (admin.registration.gates/gateCreate/gateRevoke); integrations screen
   (admin.integrations.*, test-fire + log); behaviour screen (admin.behaviour.*).
3. **Form builder UI** (W5) — admin.registration.form/publishForm; builder is
   super_admin-gated server-side already.
4. **Audit/M&E workspace** (W8 §6) — audit tail op is open to the 'audit'
   role; KPIs derivable from admin.summer.attendance + behaviour trend;
   indicators/report-builder = new (small) ops.
5. **ID card render + QR scan-by-camera** — waiting on the user's ID design;
   QR decode needs a vendored lib (jsQR); tokens already bind at verification
   and check in via typed code today.
6. **Legal pages** (NDPR set, §blueprint) — static content page + footer links.
7. ✅ Desktop journal rail shell shipped; ⌘K in journal still open.
8. **Admin edits the website (next wave, user-requested).** The Control Room
   already edits posts/missions/events/anchor-content/settings/promotions —
   but the public BlogPage renders STATIC photos.js BLOG_POSTS, not the
   admin's posts API. To make admin posts live on the site: map API posts
   {postId, slug, title, excerpt, body, coverUrl, category, publishAt} into
   the blog card shape {id, title, category, excerpt, cover, date, read,
   author:{name, portrait}}; BlogArticle needs a body renderer (static posts
   have none) — render post.body as paragraphs; merge API-first with static
   fallback; deep links (?post=slug) + the dynamic sitemap
   (api/public/sitemap.php) are ALREADY wired for this. Next: expose homepage
   hero copy/stats via admin.settings keys with public bootstrap, and a
   'Site copy' tab in the Control Room.

Gotchas for the wave: new JSX pages were appended to page-other.jsx (no new
ORDER entry needed); /gate + /verify are chrome-less routes in app.jsx; the
verify POST is CSRF-exempt (token IS the proof); test with throwaway config —
NEVER commit api/config.php; camera Permissions-Policy is camera=(self) in
.htaccess now.

---

## 4. Advice / gotchas for the next agent

- **NGG build is in-browser Babel; prod build needs esbuild.** `node build.js`
  requires `npm install esbuild --no-save` first (not vendored). It transpiles
  BOTH targets (main SPA + journal PWA), validates the `ORDER` array against
  `index.html`, and fails on drift. ALWAYS run it after editing `.jsx` — it's the
  only compile check. It does NOT catch runtime React errors — for those run
  `tests/journal-smoke.js` (Playwright; setup in its header).
- **Never commit** `nextgengen/api/config.php`, `afrovanguard-site/config.php`,
  `dist/`, or `node_modules/` (all git-ignored). Tests used throwaway SQLite DBs
  under the scratchpad + temporary config files that were cleaned up.
- **Journal entry body is line-based.** The Reflect editor joins labelled lines
  (`School: …`, `Home: …`, `Peer: …`, `Did well by …`, etc.); `parseEntry()`
  (top of `journal/app.jsx`) is the inverse. Keep each field on ONE line (no
  internal `\n`) or the parser breaks. The v2 structured logs fold into these
  single lines on purpose.
- **`member_state` persistence:** `setState(key, value)` in the journal is
  optimistic + fire-and-forget to `NGGApi.member.stateSet`. To have a key survive
  a reload, add it to the `stateGet([...])` boot fetch (~line 242 of
  `journal/app.jsx`).
- **Afrovanguard org-email → Google** only fires when Google is actually
  configured (`av_require_google_for_org`, `login/auth.js` `isOrgEmail`). So the
  seeded password super admin works out of the box; when Google IS configured,
  use Google instead. Don't "fix" this — it's intended.
- **Both super admins are idempotent + fingerprint-guarded** — safe to re-run.
  Changing the configured password re-applies automatically (fingerprint keyed
  on email|password). A blank password generates one, stored once for a single
  reveal (CLI `--reveal` or Studio button), then cleared.
- **Afrovanguard is a mature, well-built PHP app** ("the Studio"): superadmin >
  admin > editor (`admin_users`), member RBAC via `LmsAuth`
  (learner<member<mentor<coordinator<admin), OTP/password/Google sign-in,
  mentorship engine, webhooks, inbound integrations API + App Tokens. Reuse this
  infra rather than building parallel systems (the sync did — extend the same
  pattern for any new cross-site flow: scoped App Token in, webhook/cron out).
- **Verification commands** (throwaway DB; clean up after):
  - AV: `AV_DB_PATH=/tmp/…/x.sqlite php db/seed_admin.php`
  - NGG: create a temp `api/config.php` (sqlite_path → scratch), then
    `php api/tools/seed-admin.php`; delete config.php after.
  - Sync e2e: serve AV via `php -S 127.0.0.1:8199 -t afrovanguard-site` with
    `AV_DB_PATH` set + a seeded approved mentor + `mentors:read` token, point
    NGG's `afrovanguard.api_token` at it, run `sync-afrovanguard.php --dry-run`.
- **Commit trailers**: a `Claude-Session:` line only. Do NOT add a
  `Co-Authored-By` line, a model identifier, or any external email to
  commits or PRs.
- **Don't touch mam-academy** unless asked.

---

## 5. Key file map (quick jump)

**Afrovanguard (vigilant):** `lib/SuperAdmin.php` · `db/seed_admin.php` ·
`admin/api.php` (superadmin_reveal, admins_list) · `admin/app.js`
(renderSuperCard) · `admin/index.php` (#adSuperCard) · `integrations/api.php`
(mentors.directory) · `lib/AppTokens.php` (mentors:read) · `.env.example`.

**NGG (audit-sync):** `api/_lib/superadmin.php` · `api/tools/seed-admin.php` ·
`api/tools/sync-afrovanguard.php` · `api/_lib/domain/admin.php` (lockout guards)
· `api/auth/{login,request,verify}.php` · `api/config.example.php` ·
`journal/app.jsx` + `journal/app.css` · `docs/NGG-AUDIT-INDEX.md` ·
`docs/afrovanguard-sync.md` · `docs/anchor-journal-v2-gap-analysis.md`.
