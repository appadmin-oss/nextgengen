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
  **`vigilant-knuth-kuhk7c`** — this is the "vigilant" branch the user
  meant. Do NOT use the audit-sync branch for Afrovanguard.
- **NGG** (`appadmin-oss/nextgengen`): develop on
  **`ngg-afrovanguard-audit-sync-becs2k`**.
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

Everything below is pushed to `ngg-afrovanguard-audit-sync-becs2k`,
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

All on `ngg-afrovanguard-audit-sync-becs2k`; suite now 182/182 +
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
| Dues reminders, dispatched + a Reminders tab (People → Dues & fees). Preview-before-send: the screen answers who and how many BEFORE the button, because sixty messages to sixty guardians cannot be recalled; the confirm names the count and says nobody will be chased again for `everyDays`. Names a reason for every family NOT included, so "it will send 2 of 60" is checkable. States that the SPACING decides rather than the cron's tick, and that a training fee being written off is not money owed — said where somebody about to press Send will read it. Rides the existing 15-min `reminders` cron, guarded so a fault cannot take registration reminders with it). `fees_reminder_candidates()` holds every bound in one place so no caller can skip them: chases **`payable`, not `outstanding`** — a member mid-service carries a training charge being written off, and chasing it demands money already forgiven; per-family `duesRemindOff`; `remindMinBalance`; and `remindEveryDays` floored at 7, so the cron's cadence is never the reminder's. Returns NAMED exclusion counts (off/optedOut/nothingPayable/underMinimum/tooSoon/noEmail) because "sent 4 of 60" is not checkable and "why wasn't I told" is the question asked. `duesRemindedAt` stamped on every ATTEMPT, not only on success — otherwise a broken mailer re-sends on every tick forever. Copy is deliberately plain: figure, what it is for, and an invitation to reply; no deadline, no consequence — a threatening note to a struggling family produces a child who stops coming, not a payment. `admin.fees.remind.preview` shows who and why-not before the un-recallable send | fees.php fees_reminder_candidates/fees_reminder_send/fees_reminders_run + 2 ops, webcron.php web_cron_reminders, api-client.js | tests (9 PHP, mutation-verified) |
| An overdue amounts review is announced, and every fee number has one owner. `fees_uprate_note()` journals an overdue uprate as an ops `warn` from the reminder cron — an uprate only visible on the tab where it is set is one nobody performs, because nothing tells you to look. It **cannot apply anything** (a nudge that could raise prices from a cron is the automatic uprate the design refuses) and is spaced by `FEES_UPRATE_NOTE_DAYS`, since the cron ticks every 15 minutes and an unbounded nudge is a to-do item filling the fault log; `uprateNotedAt` is carried by the settings save, never cleared from a form. On screen it is a dot on the Amounts tab (`aria-hidden` — a `title` there would be read out as part of the tab's name) plus a worded nudge beside the tabs that opens the tab. **Nothing hardcoded**: every bound fees.php enforces is named at the top of the file and published by `fees_bounds()` with the settings, so the form's input maxima, the numbers its microcopy states, the list of what an uprate moves and its rounding step, and the batch size each press asks for all come from the server — a floor written `max(7,…)` in PHP and `|| 7` in React agrees until one of them changes, and then an admin is told one minimum and given another. The naira sign is written once per side (`fees_money_text()` with a currency map; one module-scope `naira` in the client, the duplicate in AdminDonations removed) | fees.php bounds block + fees_bounds/fees_money_text/fees_days_between/fees_uprate_note, webcron.php, page-admin.jsx AdminFees | tests (8 PHP + 4 browser, mutation-verified — incl. source-grep guards against re-hardcoding) |
| **A member can see their own account** (dashboard right rail, `member.fees` → `member_fees_account()`, read-only). The gap it closes: we charge members and email their guardian a figure every fortnight, and the member could see none of it — including the training fee being written off as they SERVE, the one number they earn and the most encouraging in the subsystem. Read-only by construction: the member namespace has exactly one fees op and it is a read, the route has no POST branch, and a test walks the registry to prove it. NGG-only and silent when fees are off — a summer student is a child on a short programme whose money is their guardian's business. Withholds `createdBy`/`voidedBy`/`method`/`reference`: which member of staff keyed a row and which bank reference cleared it are ours, the amount is theirs. **The tone is the design**: leads with what service has earned off, no deadline, no consequence, never an alarm colour (asserted as RENDERED, not as intent), history folded away until asked, and a person to speak to. Agreement with the desk is a test — a member told a different figure from the coordinator they are about to phone is worse than not being told | fees.php member_fees_account, api/member/fees.php, backend.php, api-client.js, page-dashboard.jsx DashboardObligations + styles-app.css | tests (5 PHP + 8 browser, mutation-verified incl. the colour and the copy) |
| Fines, adjustments and waivers can be POSTED (People → Dues & fees → an account). `fine`, `adjustment` and `waiver` were declared valid kinds from day one and nothing could create any of them — the reminder email even rendered a "Fines" line that was unreachable, and the only way to forgive a hard month was to VOID a real charge, rewriting history to be kind. A fine carries a reason from a fixed vocabulary (`FEES_FINE_REASONS`; `other` requires a written note, so the escape hatch is not also the silent one) because a fine is the charge a family disputes and "late three times in August" is answerable where "misconduct" is not. Never idempotent — two fines in a month are two events, so the accrual's period-key guard must not swallow the second. A **waiver keeps the charge** and records the decision, clamped to what is outstanding so overshooting cannot mint a credit; free-text reason, because a dropdown would flatten the only part worth reading later. Only the manual kinds are postable this way: the machine's `dues`/`training`/`membership` stay the machine's. `balanceCap` is surfaced, not enforced, for a human-issued fine — the cap stops the unattended monthly accrual, not the coordinator standing in front of a family, and the response says `overCap` so the decision is made with the consequence visible | fees.php FEES_MANUAL_CHARGE_KINDS/FEES_FINE_REASONS/admin_fees_charge/admin_fees_waive, route, api-client.js, page-admin.jsx FeeEntryForm | tests (7 PHP + 5 browser, mutation-verified) |
| Find any account, not only a debtor (`admin.fees.lookup`, search box above the arrears list). Arrears returns `payable > 0` and was the ONLY door into an account, so "has Ada paid?" was unanswerable for anybody who had — a ledger you can only enter through the debtors' list cannot be checked. Two letters minimum; shows payable, charged and received; says "nothing owed" in words rather than as a bare ₦0, because the answer to that question is a sentence | fees.php admin_fees_lookup + FEES_LOOKUP_MAX, route view, api-client.js, page-admin.jsx | tests (1 PHP + 2 browser) |
| One fee entry form, replacing a `window.prompt` (`FeeEntryForm`) — and `FeeModal`, because **both fee dialogs were written against a `<Modal>` that does not exist in this bundle**, so opening an account from the fees screen threw `Modal is not defined` and blanked the whole pane. Nothing caught it because no test had ever clicked "Open →"; the browser test added here does, and Escape/focus-trap now come from the same `useAdminDrawer` every other admin panel uses. The form carries method and reference for a payment (a bank transfer's reference — the thing you reconcile against — could not be entered at all before), the reason vocabulary for a fine, the required written reason for a waiver and an adjustment, and states what is outstanding beside the amount box so a waiver is typed against a figure rather than from memory. Void now explains, in the dialog, that voiding says a charge should never have existed and offers waiving instead | page-admin.jsx FeeModal/FeeEntryForm/ENTRY_ERROR | tests (browser, mutation-verified) |
| The ledger is in the data export, and erasure has a stated position on it. `member_export()` returned journal, devices, reflections and nothing about money — the one part of the record with a financial consequence. `member_erase()` now **keeps the figures and scrubs the words**: amounts, kinds and dates survive because what a programme charged and received is its own account of itself, while `note`/`reference`/`voidReason` are cleared because that is where a name ends up ("Ada's mother paid cash", a reference typed with family details). Wrapped so an erasure can never fail because of the ledger, and journalled if the scrub does not run. Export omits `createdBy`/`voidedBy` — another person's identity | members.php member_export/member_erase | tests (2 PHP, mutation-verified) |
| Badges have one catalogue, and notifications have a history. `MEMBER_BADGES` in util.php now owns both the award threshold and the human label, and `member_badges_for()` drives the award test from it — the six slugs were hardcoded as `if` statements and the dashboard could only render a COUNT because the words for them existed on neither side. The six original thresholds are pinned by test, since the refactor claimed to preserve behaviour exactly. The dashboard is handed `badgeLabels` rather than inventing them (grep-asserted: no `half-k-club` in the component). Activity card gained an "Everything" toggle — `member.notifications` has always returned the last fifty including read ones, and nothing asked for them, so a member who tapped a notice to clear it could never find it again | util.php MEMBER_BADGES/member_badges_for/member_badge_labels, members.php, page-dashboard.jsx | tests (2 PHP, mutation-verified) |
| Inflation uprating of the amounts (People → Dues & fees → Amounts). A fixed naira figure loses value every year it is left alone, so `upratePct` raises the membership fee, monthly dues and training fee on an interval (`uprateEveryMonths`, default 12). **Settings only — a charge already posted never moves**: the ledger stores the amount on the row, so a family quoted ₦1,000 for August owes ₦1,000 for August however often the price is revised, and the load-bearing test drives an accrual, raises the prices, and re-reads the balance to prove it. PROPOSED, never automatic: `fees_uprate_preview()` computes and the screen shows every figure old→new; the apply is a separate audited human act, refused as `not_due` inside the interval so a second press cannot double-raise, and `uprateLastAt` is written only by the apply — never settable from the form, because a clearable stamp is a way to raise prices twice in a year. Rounded to the nearest ₦10 (₦1,171.05 is arithmetic, not a price) and the percentage capped at 50, above which it is a repricing decision that wants a human typing the figure. **`balanceCap` is excluded by design** — the debt ceiling is a protection, not a price, and inflating it yearly would quietly undo what it exists for. Off by default (`upratePct` 0). Fines are not included (they live in Policy) and the screen says so, because an admin who assumes they rose will under-set them for a year | fees.php fees_uprate_preview/fees_uprate_apply + 2 ops, api/admin/fees.php, api-client.js, page-admin.jsx AdminFees | tests (10 PHP + 7 browser, mutation-verified) |
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


---

## Quote of the week (2026-09-26)

Home-page section cycling Hausa riddles, Igbo proverbs and Yoruba proverbs one
per week, editable in Control Room → Content → Quote of the week.

- **Rotation is derived, not stored** (`wisdom_pick`, anchor Monday
  2026-09-21 Lagos). Languages alternate in fixed order; each walks its own
  `position` list, so adding to one language never shifts another's sequence.
  Empty languages are skipped.
- **Seeded in PHP, once**, behind the `wisdom.seeded` setting — not in the
  migration, because the sayings contain `;` and `db_split_sql` cuts on it.
- **Audio is a stored clip**, never a per-visitor provider call: staff
  voice-over (upload or in-browser recording) or a Spitch TTS rendering made
  on demand. Served by `api/public/wisdom-audio.php` with byte ranges (Safari).
  The browser's own speech voice is used only if it has one for the language.
- Migration 118 (`wisdom_sayings`). Files: `api/_lib/domain/wisdom.php`,
  `api/{public,admin}/wisdom.php`, `api/public/wisdom-audio.php`,
  `QuoteOfWeek` (page-home.jsx), `AdminWisdom` (page-admin.jsx).

### Quote of the week — voice, second pass (2026-09-26)

- Rotation unchanged (it already interleaved one per language); the admin strip
  now numbers each turn ("Hausa #1, Igbo #1…") so the order is legible, and a
  test pins "never the same language two weeks running".
- Two clips per saying: native + English translation (Nigerian-English voice),
  played in sequence with a pause. Migration 119 adds `audioFileEn`, `voiceEn`,
  `ttsTriedAt`.
- Voicing is automatic with a key: on save, via "Voice everything missing", and
  a visitor backstop for this week's saying guarded by `ttsTriedAt` (claim-first
  lock + one-hour backoff) so a burst of visitors is one provider call.
- `wisdom_tts_script` cleans punctuation and tone-marks unmarked Yorùbá through
  Spitch `/v1/diacritics` before synthesis.
- Voice cloning through Spitch `/v1/voices` with recorded consent (audit log).
  Defaults per language live in the `wisdom.voiceDefaults` setting; cloned
  voices in `wisdom.customVoices`.
- All Spitch traffic goes through `wisdom_spitch()`; tests swap the transport
  with `$GLOBALS['__wisdom_http']`.

### Quote of the week — generate once, listen back (2026-09-26)

- `wisdom_tts_clips` (migration 120) records every clip ever generated, keyed by
  sha256(language|voice|speed|script). `wisdom_tts_clip()` answers from it
  before calling Spitch, and `wisdom_audio_release()` never deletes a file it
  lists — so the same audio is never paid for twice, whatever staff press.
- The visitor backstop runs once per saying, ever (`ttsTriedAt` non-empty ⇒
  never again, success or failure). The hourly retry is gone.
- Listen-back: each new clip goes to Spitch `/v1/transcriptions` in its own
  language; `wisdom_match_score()` (character edit distance on tone-stripped,
  lower-cased letters) scores it. With no voice named, up to four native
  voices are tried until one scores ≥ 0.85; the best is kept and its score is
  shown to staff.
- Our `/v1/diacritics` call was removed: Spitch's OpenAPI states `/v1/speech`
  diacritizes Yorùbá itself. `spokenText` lets staff give a fully marked
  reading for Igbo/Hausa without changing the displayed saying.
- Speed back to 1.0 (0.9 read as slowed, not fluent).

### Quote of the week — full seed (2026-09-26)

Seed v2: 4 Hausa riddles, 4 Igbo, 4 Yorùbá proverbs, with the programme's
revised wording. `wisdom.seeded.version` gates it; a v1 deployment is upgraded
in place — untouched rows take the new wording (compared against
`wisdom_seed_rows_v1()`), edited rows are left alone, deleted v1 rows stay
deleted, new sayings are appended. Hausa riddle 3's answer is seeded as
"Tsintsiya" (broom): the supplied "Tsutsa ko Tsintsiya" reads "worm or broom".

## Member IDs: database uniqueness and the import's loose ends (schema 122)

- `member_display_ids` (primary key = upper-cased printed ID) is the
  guarantee that one ID is one record. Every minting or typing writer claims
  first (`member_id_claim`, `member_mint_and_claim`): desk upsert
  (`display_id_taken`), import, application convert, Club promotion. It is a
  claims table rather than a unique index because a unique index fails the
  migration — and the site's boot — on a database that already has a
  duplicate; the backfill claimed each ID for its earliest record and the rest
  are reported by `admin.members.idDuplicates` (Members → Duplicates → Member
  IDs). Claims are never released; the merge policy MOVEs them to the survivor.
- Registration-form children with no roster row travel as `applicants` in the
  extract and are filed as `applications` (`importKey`, idempotent). Not
  members until somebody converts them. The convert no longer matches an
  applicant with no email to an existing member with no email.
- The import report carries `idList` (issued / normalized / matched) for the
  drawer's CSV write-back, reads the intake year from the ID for a row with
  none (`member_id_year`; declared formats may carry `yearAt`), and names a
  probable typo (`member_id_suggest`).

## One check-in for everyone (2026-10)

There was no check-in for NGG members inside NGG. Every desk (gate link, Summer
kiosk, profile "Mark present") wrote through `summer_checkin()`, and that only
resolved Summer/volunteer `qr_codes`, so a member's scan was always
`qr_unassigned`. Members got attendance only through the CACENTRE gate's
webhook. `domain/checkin.php` adds `checkin_member_resolve()`, which takes a
MEMQR card, a printed card by NGG's formats, a typed displayId or memberId, a
`/q/` URL or the old `?m=` link. `summer_checkin`/`summer_checkout` fall back
to it when `qr_codes` misses. The member path writes the same `attendance`
table, applies the member policy (gate refusal, punctuality on member days,
`policy_on_checkin`), and requires `club` unless the call comes through a gate
link. The Card Studio's member card was also handing a URL to an `<img>`, so its
QR printed blank; it now renders a data URL. The member QR payload leads with
the secure MEMQR code.

## Summer School has a duration (2026-10)

Editions had optional dates and nothing read them, so a season ran for ever:
cards expired on a ninety-day timer unrelated to it, the desk took check-ins
in November, and nothing closed an edition. Now there is invariant 7: a live
edition needs dates, at most 183 days apart. The participant check-in refuses
outside them. Cards issued for an edition (participants, edition volunteers)
expire on its end date. `run-jobs.php` closes elapsed editions. The NGV
promotion card is deliberately not season-bound.

## The gate link is a check-in desk (2026-10)

`/gate?g=…` was two tabs, Register and Check-in. It now opens straight onto
check-in, because a volunteer at the door does one job and families sign up
on the public link (`/apply?g=…`). The admin calls the kind a **Check-in desk**.

What changed in the redesign:
- The result is drawn over the camera, where the operator is already looking.
- Typed entry is always on screen, with format examples, instead of hiding
  behind "Camera not working?".
- The header shows a session count (repeats counted apart) and a live clock.
- Two columns appear once the desk itself is 760px wide (container query).
- A "do not admit" takes focus on its OK button.
- Every style is a `gate-*` / `qrs-*` class on one token set in `styles.css`.
  Emoji icons are now drawn SVGs, and every ink clears 5.4:1.

`GateRegister` is left in place, unmounted, with its test bench. The server's
`gate_register` still accepts a desk link; nothing calls it now.

The same pass fixed ten `font: <weight> <size> inherit` declarations in
`styles-app.css`. Browsers reject that shorthand outright, so those elements
had silently lost their weight and size. Both stylesheets now pass
csstree-validator clean.

## Check-in desks out of Summer School; broadened admin roles; approvals; year-round volunteers

- New capability `checkin` (the door): check-in desk links, passwords, duty rota. Control Room → Check-in → Check-in desks / Duty rota. Summer School keeps its sign-up links (public sign-up, review desk) and gains the **Registration desk** kind (`/enrol?g=`), the old staffed registration form; a check-in desk no longer registers anyone, and a registration desk checks nobody in.
- `admin` += `club`, `summer`, `checkin`; `summer_admin` += `checkin`; `club_admin` += `people`, `checkin`.
- Approval queue (migration 123, `admin_approvals`): a club admin's sensitive actions are queued and run as them on a second admin's approval. Control Room → People → Approvals. Super-admin-only acts (erase member, reset password/2FA) stay refused, not queued — an approval would run them as the requester, who still cannot.
- Volunteers: `volunteers.programme` / `applications.programme` = `summer | ngg | both` (the mentors' vocabulary). Club volunteers' cards run on the year-round validity clock; Summer-only cards still end with the season. The /volunteer form asks the programme first and was rebuilt on `.volf-*` classes with a progress rail.
- Centres have a **Summer venue** of their own (migration 124: `summerAddress/Area/Lat/Lng`); one centre, two places. Promoting a Summer participant into the Club suggests the nearest Club centre to their Summer venue (`club_promote_suggestion`), and the promote op takes `centre`.
- **Curriculum** (migration 125, `domain/curriculum.php`, new `curriculum` capability in super_admin/admin/club_admin): NGG Club lessons by course/week, materials (links or files in `storage/curriculum`, served only to a session), MCQ/short/task checks, CSV import that is checked first and applied against the digest it was checked with, an AI draft that saves nothing, AI marking of written answers when configured (pending for the instructor otherwise), progress per member. Member dashboard → Curriculum; Mentor Portal → Curriculum for NGG instructors/mentors; Control Room → Content → Curriculum. E2E: `tests/curriculum-ui.test.js`.
- An NGG instructor's mentor-portal lane now follows `volunteers.programme` rather than assuming Summer. A centre Ops volunteer still covers both programmes at their centre (the documented "whole centre" rule).
- The Members section's sub-tab now travels through `useAdminTab`, so `__adminSection('members', 'roster')` lands on the roster (it was local state and always opened the dashboard — `admin-bulk.test.js` had been failing on it).
- **Bulk fines** (`admin.fees.fineImport`, cap `fees`, Dues & fees → Upload fines): a CSV of fines matched to NGG members by printed ID/member number (`checkin_member_resolve`), else email (+ name), else name — ambiguous matches refused with candidates; dry run + digest; ledger key derived from member/reason/amount/date/note so a re-upload posts nothing twice; one audit event per run (`fees.fine.import`). E2E: `tests/fines-upload.test.js`.
- **Curriculum document**: `member.curriculum.document` + `api/member/curriculum-doc.php` (print-ready HTML → browser PDF, `?format=doc` Word). Look lives in `api/_lib/templates/curriculum-document.{php,css}` for the design pass.
- **Closing time**: `attendance.closeByType` {member, student, volunteer}; `attendance_checkout_refusal()` refuses `too_early` in `summer_checkout`, `checkin_member_checkout` and the CACENTRE hook's `out` (answered, not stored). Admin-only `earlyReason` override, audited `attendance.early_checkout`. Gate desk gained a Check in / Sign out mode (offline queue carries `dir`), the kiosk Arrivals / Sign-outs. Checkout now honours `scannedAt`.
- **NGG member sign-in/out mail**: `checkin_member_email()` to the member and `parentEmail`, from the desk, kiosk and CACENTRE hook; gated by `checkin_state_emails`.
- **Stricter NGG member policy**: `policy.member.{lateFine (₦500, per late from the first; sanction tier 400000+n → ledger), tardyIsLate (no grace band; policy_punctuality sets redline), checkoutRequired (member sweep logs no_checkout + absence from policy_member_checkout_since)}`. Summer ladder unchanged.
- **Curriculum deadlines** (`curriculum` setting; `curriculum_due_run()` in the 15-minute reminders job): due = member term start (max of `startDate`, joinDate) + week × 7; one reminder mail per member per `remindEveryDays` period (nudge_log key `curriculum-due:<period>`); fine once per lesson (`curr-overdue:<unitId>` ledger key) after `fineAfterDays`. `admin.curriculum.schedule` (fine changes need `fees`). Report carries `overdue` board; member list carries `dueDate`/`overdueDays`.
- **Instructor materials with approval** (migration 126): `staff.curriculum.material` / `staff.curriculum.file` (NGG staff, their courses only; pending unless the submitter holds `curriculum`); `admin.curriculum.submissions` / `admin.curriculum.review` (approve/reject with a required note, per-row verdicts, one audit event, submitter told in-app and by mail). `curriculum_load` and `curriculum_write` touch approved materials only, so the editor never swallows a pending submission. The store's file types widened (epub, zip, sb3, py, ino, md, rtf, ods, gif, wav, ogg, webm, mov).
- **One quote of the week**: `weekly_quote()` (wisdom.php) is the single answer — the live saying for the week, else the Anchor quote at the same week index. `public.wisdom.week` carries it as `quote`; the Journal's card reads it (cached, with a same-week offline fallback) instead of its old daily `QUOTES[day % n]`. `qotw_mail_run()` mails active NGG members once per week (nudge_log `qotw:<monday>`), opt-out via signed link (`member_state` key `mail.qotwOff`), off with setting `qotw_mail`.
- Pre-existing, not from this change: `tests/wisdom-ui.test.js` fails 2 of 29 on the base commit too ("the schedule numbers each language's turn", "each clip shows its pronunciation check").
- **Companion** (migration 127, `domain/companion.php`): weekly per-member assessment — metrics over 28 days (attendance/late/no sign-out/absent, curriculum done/overdue/avg score, conduct state/fines), rating by rules with reasons (`companion_rate`), note by AI (`ai_classify` 'coach', numbers + first name only) or rules; `companion_weekly_run` in the reminders job (5/tick with AI, 40 without), mailed to member + parent once; `member.companion`, `admin.companion.board` (scoped), `admin.companion.assess`. Reflection Coach gets the week's focus as context, and `member.coach` is now rate-limited (20 / 10 min).
- **Training fee by the week**: `trainingBasis` = `week` — one charge per Monday–Sunday week holding a programme day (`fees_training_weeks()`, keys `<sessionId>:W<monday>`), off the same calendar as `day`; a week already charged by the day is skipped.
- **AI marking by type, capable models only**: `CURR_CHECK_KINDS` += essay, reflection, project, code; `curriculum_ai_mark()` uses `CURR_MARKING_GUIDE[kind]` on the `marking` profile, which `ai_profile_candidates()` filters through `ai_model_is_capable()` (token match against haiku/flash/mini/lite/…, and <30B). Confidence < 0.6 → left for the instructor; `coach_is_crisis()` text → held with `flag: safeguarding` (audited `curriculum.safeguarding`) and shown to the instructor.
- **Programme days fixed**: the calendars used to borrow the ACTIVE TERM's dates from `sessions` — Summer ran every autumn weekday (DOMI), and the member calendar froze to one term so every Saturday after it read "not a programme day". Now: Summer window = the edition (`programme_edition_window()`, blank → re-derived; a window equal to a non-summer term is treated as the old copy); member calendar = every term (`sessionWindows`; a one-term window is treated as the old copy). Per-person calendars: `member_calendar_for()` (centre `meetDays` parsed by `centre_meet_weekdays()`), `participant_calendar_for()` (group `meetDays`), `policy_is_day_for()` — used by both sweeps, the desk, the CACENTRE hook (now on local date), the companion, member attendance rate (only programme-day scans) and day/week training fees (session window × calendar weekdays). First sweep starts at yesterday. Policy screen: preview gated on server `enabled`; each Save saves its own calendar. The long-standing "attendance roster carries a present count + rate" failure was this bug and now passes.
- **Approval notifications**: `staff_with_cap()` + `notify_people()` (util.php; in-app + email). Wired into `approval_intercept` (approvers), `admin_approvals_decide` (requester, via `approval_tell_requester`), `staff_curriculum_material` (curriculum editors), `member_request_create` (scoped `people` staff), `admin_request_decide` (member, now by email too). The Control Room opens `/nextadmin?s=<section>&t=<tab>` links once and cleans the URL.
- **Lesson editor and in-lesson viewers**: `LessonTextEditor` (page-admin.jsx) — toolbar over a textarea writing a small markdown-lite (`##`/`###`, `**b**`, `*i*`, `` `code` ``, fences, `-`/`1.` lists, `>` callout, `---`, `[t](url)`, `![cap](url)`, a bare YouTube/Vimeo line = embed), image upload through the curriculum uploader, Ctrl+B/I/K, preview. `CurriculumText` (components.jsx) renders it as React elements only — no `dangerouslySetInnerHTML`; links and images must match `CUR_SAFE_URL` (https, or our own curriculum-file URL) or they stay text. `curriculum_text_html()` mirrors it for the document, escaping first. `CurriculumMaterials` opens pdf/image/audio/video/YouTube/Vimeo inline (`curMaterialViewer`). CSP: frame-src gained `player.vimeo.com`, and `media-src 'self' https: blob:` was added so uploaded audio/video plays.
- **Family accounts** (migration 128, `domain/family.php`, `page-family.jsx`, `/family`): a parent's own principal — own table, own cookie `<cookie_name>_family` signed with a separate key derivation (`family|secret`), so it is never a member session and copying it into the member cookie fails the HMAC; `require_family()` checks status + `sessionEpoch` on every request. Sign-in by emailed code (`auth_sessions.purpose = 'family_login'`, five tries per code claimed with a relative `attempts + 1` UPDATE, plus a per-address lock), link `?fsignin=` (not `?signin=`, which `auth.jsx` consumes on every page). A ward links at once by Anchor code + name (`circle_match`, the circle guess guard), or is ASKED for through a record whose `parentEmail` is the guardian's address and approved in Control Room → People → Families (`admin.families.decide`: per-row verdicts, scope per row, reason required to refuse/revoke, one audit event per run). The ward is notified and sees the link on their Circle screen. Ward dashboard reuses `member_records`, `member_compliance`, `member_fees_account`, `curriculum_for_member` and the stored companion row — read-only. Notices are `member_requests` with `raisedBy`; decisions email the guardian. Mail hooks: `checkin_member_email` (family opt-ins sent regardless of the programme switch), `policy_issue` fine alert, `family_weekly_run` in the reminders job. api-client exempts `/family/` 401s from the member session-expired event. Fixed on the way: `member_request_create` read `$m['centre']` without selecting it, so request notifications were never centre-scoped. Tests: PHP block "family:", `tests/family-ui.test.js` (24).
- **Training-fee watch for the desk**: `fees_training_watch()` (fees.php) is the one schedule builder — ledger charges (dated by session start, or the day/week in the key), `due` (happened, not yet accrued — from `fees_training_days/weeks`), `upcoming` (sessions, or the member's meeting days/weeks off `member_calendar_for` to the end of the training half; capped list, true count). `member_fees_account` (as `training` + the old-shape `schedule`) and `admin_fees_member` (`training`) both return it; `TrainingFeeWatch` (components.jsx) draws it with `audience` member|staff, on the member panel and the Control Room account drawer. Fixed on the way: the member schedule listed `sessions` whatever the basis, so a day/week rate showed rows unrelated to the charges. New `admin.fees.training` + Dues & fees → Training fees tab: every NGG member with a training fee, built from three queries regardless of roster size (`fees_balance` / `fees_tenure` take pre-fetched ledger rows and a compliance map; the PHP test counts queries), allow-listed filter/sort, centre-scoped.
- **Bundled courses** (`api/_lib/seeds/curriculum-*.json`, `admin.curriculum.seed`, Import tab → "Courses that come with the platform"): a seed is a file the import screen loads into the ordinary dry-run → digest → apply flow, because the host has no shell to run a seeder. First: Practical Coding — Full Stack Web Developer 2026 (72 lessons, 116 checks), rebuilt from the coordinators' freeCodeCamp sheet (`NGG_Course_2026.csv`): sessions not weeks (3 per week), undated (due dates come from the curriculum schedule's term start), Git + early GitHub Pages, box model and mobile-first before layout, one positioning lesson, ≤65 steps per lesson, a required back end, buffers, phase projects, a capstone. PHP test loads it through the real importer (72 create, 0 refused; second run 72 unchanged).

## Timetable, the quote lock, and the Media Lab course (2026-10)

- **Timetable** (migration 129 `timetable_slots`, `domain/timetable.php`): `tt_clashes()` is the one clash rule — room, instructor (across centres), course+level, centre meeting day, centre hours (parsed from `meetTime` by `tt_centre_window`); back-to-back is not a clash. `admin.timetable.list|save|remove` (read: any of club/people/curriculum/checkin; write: club; centre-scoped per row; save refuses with `error: clash` and the list), `member.timetable`, `public.timetable` (cached, topic `timetable`, also purged by `centres`; no instructor names). One renderer, `TimetableView` (components.jsx), on the Control Room (People → Timetable, `ADMIN_SECTIONS` id `timetable`), the member dashboard (`/dashboard/timetable`), the family ward card and the public `/timetable` (`ROUTES` id `timetable`, centre in the URL). Container query, not a media query, turns rows into labelled cards; print CSS prints only `.tt-print`. Centre delete counts timetable classes in `uses`. Tests: `timetable:` block in run.php, `tests/timetable-ui.test.js` (`test:timetable`).
- **Quote of the week turns at the end of Sunday and is locked once shown.** Turnover was already 00:00 Monday WAT (`WISDOM_ANCHOR` is a Monday), but `wisdom_pick()` recomputes from the live list, so an edit mid-week changed the saying already shown — read by people as "it changes on Wednesdays". `wisdom_week_row()` pins a started week's wisdomId in setting `wisdom_week_pins` (re-picks only if the pinned saying is no longer live); the home page, the Journal, the Monday mail and the admin strip's "this week" all read it. `tests/wisdom-ui.test.js` assumed this week's saying was Hausa (true one week in three); it now asserts the numbering rule and puts the weak score on a Hausa saying explicitly.
- **Media Lab seed** (`api/_lib/seeds/curriculum-media-lab-2026.json`, readable copy `docs/curriculum/media-lab-2026.csv`): the programme team's concept document turned into 48 lessons (24 weeks × learn/create), a check on every lesson, a team project each month marked on its 30/20/20/15/15 rubric, and reflections. The document had no weekly lessons, no assessments and no consent rules for photographing children; those are added (week 1, before the portrait lesson in week 10), with the Canva/CapCut 13+ age rule. Filed under its own course "Media Lab", outside the catalogue: a seed file may declare `allowNewCourse`, `admin.curriculum.seed` returns it, and the import screen ticks the option visibly. Once imported the course is timetable-able (`curriculum_courses()` includes courses with units).

## NGG and Summer School keep separate course and centre lists; a fines sheet uploads as typed (2026-10)

- **The clash.** One academy catalogue and one centres table, neither carrying a programme marker, were read by both programmes. The catalogue was editable only with `summer`, so a Summer coordinator removing a course took it off the Club's timetable (`tt_courses` → `curriculum_courses` → `academy_courses`) and curriculum. Every centre list offered every centre to both. The join form hard-coded Egbeda/Ayobo, used an eight-item `TRACKS` list unrelated to either programme's courses (while `members.track` is what the curriculum and timetable read as a member's course), and shared one localStorage draft between programmes.
- **Courses:** `club_catalogue()` (curriculum.php, setting `club_catalogue`) is the Club's own list — materialised once from the academy catalogue, then edited under Curriculum → Courses (`admin.club.catalogue.get|set`, write cap `curriculum`). `curriculum_courses()`, the timetable and community course channels read it. The volunteer form accepts either programme's courses (`volunteer_courses_by_faculty`). `AcademyCatalogue` takes `source="summer"|"club"` — one editor, two lists.
- **Centres:** migration 130 `centres.programmes` (`ngg,summer` default). `centre_serves()` / `centres_for_programme()` / `centre_names_for_programme()`. Filtered: Summer form hydration and gate submission, selfreg queue, Summer roster, public Summer page and centre pages (Summer); admin + public timetable (NGG; `admin.timetable.save` refuses `centre_not_ngg`). `public.apply` refuses `centre_not_offered` for an existing centre that does not run the programme and canonicalises the track to the programme's spelling. Centre form: "Programmes at this centre".
- **Join form:** `public.programme` (cached; topics `catalogue`, `centres`) returns one programme's faculties and centres; the form's centre select and its course step ("Pick a starting course", grouped by faculty, `aria-pressed`) come from it, with loading and retry states. Drafts are `ngg.join.draft.anchor|summer`; the old shared key migrates once into the open form. A link or draft naming another programme's course or centre is cleared.
- **Cards:** `card_display_id` mints from the highest serial, not a count; `ST` (the fallback prefix) and all-digit codes are refused as centre codes (`code_reserved`).
- **N+1s removed on the way:** `public_centres_list` and `public_summer_page` counted enrolments (and read groups) per centre; now grouped queries.
- **Timetable instructors:** Club volunteers first; Summer-only ones are labelled rather than hidden, because every pre-choice volunteer defaults to `summer`.
- **Fines upload:** `.xlsx` read in the browser (`readXlsxRows`, JSZip via `loadVendor('jszip')`) and CSV delimiter sniffing (`curriculumParseCsv`), shared with the curriculum import (`readSheetFile`). Headings "Fine"/"Outstanding fine" map to amount; a reason typed once fills rows without one (sent with the rows, so it is in the digest). Server: `fees_fine_name_key()` matches names as a bag of words (any order, punctuation stripped) through `fees_fine_name_index()` — one query per sheet — with `matchedBy: name_any`; near misses (Levenshtein) are offered as candidates and refused; `Null`/empty/0 amounts are `skipped`, counted apart from refused.
- Tests: `separation:` and new `bulk fines:` cases in run.php; `tests/programme-separation.test.js` (`test:programmes`); the xlsx case in `tests/fines-upload.test.js`.

## /timetable is a public timetable maker (2026-10)

- The operator's intent: the public timetable is a tool for designing your OWN calendar on a professional template and downloading it — not a centre's read-only week. `TimetablePage` moved to the new `page-timetable.jsx` (in `ORDER` and `index.html` after `page-centres.jsx`); `ROUTES` keeps the id, retitled "Timetable maker"; the nav's *The room* menu links it.
- **One poster**: `TmPoster` is the preview (scaled by `TmStage`, which measures its own width with a ResizeObserver), the PNG and the PDF (the same component rendered at full print size off screen in `.tm-export-host`, drawn by html2canvas — `loadVendor('html2canvas')`, newly registered — and placed by jsPDF at full bleed) and Print (the PNG in a print window with an `@page` rule). Poster size follows the paper's ratio (A4 / US Letter, landscape / portrait) at 1600px on the long side.
- **Templates are data** (`TM_TEMPLATES`): colours reach `.tmp` as custom properties; layout and type are `.tmp-*` / `.tmp--<id>` rules in styles.css. No color-mix, backdrop-filter or repeating gradients, because html2canvas cannot draw them (shades come from `tmShade`, hour lines are elements). Eight hue families in the same order in every palette, so a class keeps its named colour across templates; block ink from `inkOn`, and the test measures every block at ≥ 4.5:1.
- **No drag**: classes are a form (`TmEntryForm`; Escape cancels and returns focus to "Add a class"); overlaps are laid out in lanes (`tmLayoutDay`) and named in the list (`tmOverlaps`); the frame widens to fit every class (`tmFrame`). The poster is `role="img"` with a summary; the class list is its equivalent in words. Tabs and every control are ≥ 44px (the responsive suite caught 40px tabs).
- **State is the visitor's**: localStorage (`ngg.timetable.maker.v1`, guarded) and a share link whose fragment (`#t=`, base64url JSON) carries the timetable — the server never sees it; everything read back goes through `tmClean`. A centre's official week (`public.timetable`) is a starting point (`?centre=` opens the *Start from* tab on it); starting from it fits the days and hours to that centre.
- **.ics**: one weekly `RRULE` VEVENT per class-day, `TZID=Africa/Lagos` with a VTIMEZONE (WAT, no DST), optional UNTIL, RFC 5545 escaping and folding.
- Tests: `tests/timetable-ui.test.js` (public half rewritten: import, form, Escape, overlap, templates, real PNG/PDF/.ics downloads, reload, phone and desktop layout, block contrast); template screenshots in `tests/screens/timetable/template-*.png`.

## Roles, tasks and access per administrative level (2026-10)

- **One role registry**: `ADMIN_ROLES` + `ADMIN_CAPS` in util.php (label, summary, caps, `scoped`, `queued`, `tier`); `admin_role_caps()`, `staff_role_names()`, the staff filter, the invite mail's label and the approval queue (`admin_role_queued`) all derive from it. The screen's `ROLE_CAPS`/`ROLE_OPTS` copies are gone (they had no Auditor, so nobody could be made one); it reads `admin.roles` (`useAdminRoles`, `adminRoleOptions`, `adminRoleLabel`). A run.php test fails if a typed copy comes back.
- **Centre lead** role (`club`, `people`, `checkin`; `scoped`, `queued`): with no centreScope `admin_gate` refuses `scope_required` — an empty scope must never mean "every centre" for somebody who runs one.
- **No granting upward**: `admin_may_manage()` — role changes, 2FA and password resets need `rbac` (effective caps, so a capsExtra grant counts) and never reach a tier above the requester's; only a super admin touches a super admin. The Members row actions now show exactly to who can use them.
- **Writes gated by one capability**: posts/events/missions/sessions/assignments/grading/broadcast moved from any staff to `content` (an auditor could publish). Behaviour and conduct writes are gated by the SUBJECT's real type (`behaviour_subject_gate`, `policy_subject_gate`: member/volunteer → `people`, participant → `summer`), never by the browser's `personType`, which a Summer coordinator could previously set to "student" for an NGG member. Reads take either; the conduct board shows each desk only its own people. Sections may declare `cap: [a, b]` (any) via `adminCapOk`.
- **Scope holes closed**: centres list/upsert/delete (a scoped admin edits only their centres and adds none), fees member ops + lookup + arrears (`fees_scope_gate`), volunteers list/update/delete/approve, mentor assignment, gates list/create (`admin_centre_ids_in_scope`), behaviour list. `admin_centres_list` lost four queries per centre.
- The audit trail's "staff only" filter now covers every staff role.
- Tests: `access:` block in run.php (15 checks). (The forms harnesses reading bootstrap's domain list landed separately in a3ecac1.)


## Status board and the member record (2026-10)

- **Status board** (`status` section, cap any of `people`/`club`/`rbac`/`audit`): `admin.status.board` → `admin_status_board()` in `domain/status.php`. Parts are per capability (`parts` lists what was sent): members and centres need `people` or `club`; mentors, instructors and centre leads `people` (built on `admin_staff_performance`, 60 days); staff `rbac` or `audit`; money totals only with `fees`. Every figure is centre-scoped on the way in. Grouped queries throughout; a run.php check asserts thirty more members cost no more queries. Active / quiet / dormant are 14 / 30 days (`STATUS_ACTIVE_DAYS`, `STATUS_QUIET_DAYS`); the attention list is capped at `STATUS_ATTENTION_MAX` (80) and reports the true total.
- **Member record**: `admin.members.record` → `admin_member_record()` in `domain/member-record.php` (needs `people` plus the member in scope). Attendance (60 days), conduct (where `policy_subject_gate` allows), fees (`fees` only), curriculum, companion, family and guardian, mentorship, classes in one read. A part the reader may not see is ABSENT from the payload, and the drawer's tabs (`MemberRecordPanel`, `MEMBER_RECORD_TABS`) say "not part of your access" rather than showing it empty.
- **Pending-tab fix**: `useAdminTab`'s subscriber took ANY pending tab, and subscribers fire before the target section mounts — so the section on screen swallowed a jump meant for the next one (Status board → `members/roster` landed on Members' Dashboard), and a section with no validator switched itself to a tab it does not have. An open section now takes a pending tab only if it is one of its own; mounting still always consumes. The three callers without a validator (Status, Curriculum, Volunteers) declare their tabs.
- Tests: `status:` and `record:` checks in run.php; `tests/status-board.test.js` (`test:status`, in `test:all`) drives the board as a super admin and as a centre lead, the jump into the roster, and the drawer tabs.

## 2026-10-06 · ID Card Studio rebuilt at /club/id-cards

The old Card Studio (`/cards`, `CardStudio` in page-other.jsx) was removed in
one deletions-only commit and rebuilt from empty files in
`src/modules/idcards/` to the design handoff (ID_CARD_STUDIO.md). `/cards`
forwards to the new address. What did not exist before and does now:
sheet layout on card stock with the grid maths held to the millimetre, cut
marks, mirrored backs for long- and short-edge duplex, skip used slots, a new
sheet per centre or kind, the all-sheets overview, five print scenarios,
uploaded card images with dpi and fit checks and front/back auto-pairing,
batch printing, a packing list, an alignment test, the after-print check that
marks jammed cards failed on their run and requeues them, a reprint queue
(migration 132, `id_reprints`), a one-person photo ask (`id_photo_asks`; it
emails a participant's guardian and says honestly when there is nobody to
email), the print log with a run drawer, and look up by printed ID. The card
renderers were kept and are drawn in the slots unchanged.

## 2026-10-06 · ID Card Studio, round 2: designs, the member back, photo requests

- **Option 1, the industry-standard shape** (as card-printing suites do it):
  each card type prints from an **assigned, published, versioned** template
  with its paired back, falls back to the standard card when none is
  assigned, and logs the version on every run. Migration 133 adds
  `id_designs (kind, templateId, setBy, setAt)`; `admin.ids.design.set`
  refuses drafts (`not_published`), backs (`is_back`) and another kind's
  design (`wrong_kind`). The studio draws an assigned design through
  `dsnRaster`, cached per template, version, side and person, and the print
  waits (`idsTplSettled`) for the last card to finish drawing.
- **The member card has a back**: `NggcMemberCardBack`, a new module file,
  the standard back for members. Before this it printed blank.
- **Photo requests reach the person and the admins**: `admin.ids.photo.ask`
  takes a list (max 200), refuses per row (`has_photo`, `asked_recently`
  unless `force`, `out_of_scope`, …), notifies the member and guardians, a
  participant's guardian or a volunteer, sends one digest per press to the
  centre's staff (never the requester), and records the channels that went
  (`id_photo_asks.channels`, migration 133). The toast reads the server's
  per-row verdicts.
- **IDs minted before printing**: `admin.ids.mint` gives a member with no
  printed ID their number (never reissued) before the print window opens.
- **The sheet follows the cards' size** instead of refusing anything not
  CR80 portrait; a mixed-size sheet is a red check with a one-click fix.

## Quote of the week — the share card (design_handoff_quote_card v2)

**Share** on the home page's quote of the week opens a sheet that makes the
saying an image: feed 1080×1350, story 1080×1920, wide 1200×630, in the six
palettes of the handoff, downloaded or shared as a PNG (`ngg-quote-w{week}-{kind}.png`,
1×; 2× on request). The plain text is still one press away.

- **The saying as written is the quote** (Hausa, Igbo or Yorùbá); "by" is the
  language and kind ("Igbo proverb"); the source is "Quote of the week · Igbo".
  The handoff's card has no slot for the English, and its rules forbid adding
  copy — the shared post's text carries the translation.
- **One renderer**: the export serialises the card the browser already laid out
  into an SVG `<foreignObject>` with its stylesheet and fonts inlined
  (`qcRenderPng`). html2canvas does not reproduce `box-decoration-break: clone`
  or balanced wrapping, which the design depends on.
- **Fonts are self-hosted** in `assets/fonts/qcard/` and load only when the sheet
  opens. Bricolage (variable, opsz) has no ƙ ɗ ɓ ƴ: eight glyphs from Noto Sans
  800 (1.4 KB, "QC Hooks") are the fallback for exactly those. Bricolage also
  had no mark anchor for the combining grave, so ẹ̀/ọ̀ drew the grave beside the
  letter: the three Bricolage files were patched to give the grave the acute's
  anchor (same outline centre). ṣ is written s + U+0323, which it draws.
- **Card sizes are classes, never inline**: styles.css rewrites inline
  `font-size: 84px` (and friends) on phones by attribute selector.
- **Not done**: the handoff asks for the wide card as `og:image` "where a quote
  page exists". There is no quote page, and the host has no server-side
  renderer, so link previews keep the site icon.
- Test: `tests/qow-card.test.js` (in `test:all`) — sizes, the reference renders
  within ±2 px, 220 characters fit, wrapping highlight, the languages, the sheet,
  and a phone.

## 2026-10-07 · NGG members' join dates: shown, editable, imported

The roster's **Joined** column showed `createdAt` — for an imported roster, the
day of the import for everybody — and the join date could not be set by hand or
reliably by import.

- **Shown.** The roster column, the member sheet and the CSV export show
  `joinDate`, falling back to `createdAt` only when there is none
  (`crMemJoined`). The column sorts on the same (`sort=joined`,
  `COALESCE(NULLIF(joinDate,''), createdAt)`). "Joined in 30 days / 12 months"
  and the month-by-month chart count that too, not the day a record was made.
- **Editable.** Add/Edit member has a **Date joined** field.
- **Imported.** The extractor read only Excel serials from one exact header
  (`date_joined`), so a column typed as text, or re-headed "Date Joined",
  arrived blank. `excelDate()` (tools/ngg-import/members.js) and
  `member_date()` (domain/member-id.php) now read the same shapes: ISO, serial,
  day-first, month names, month-year, a bare year. Month-first is never guessed.
  The importer stores ISO and reports — never stores — a value it cannot read;
  the desk refuses one (`joinDate_invalid`). `dob` gets the same treatment.
- No migration: every stored join date came through the extractor, which only
  ever wrote ISO or blank. Re-running the import fills the blanks (fill-blanks
  is unchanged; `overwrite` replaces a date the desk set).
- Tests: `api/tests/run.php` ("join dates: …"), `tests/roster-import.test.js`,
  `tests/control-members-curriculum.test.js` (column, form, save).

## Control Room v2 — every tab works; the rest mount their v1 panels

All 51 tabs in `CR_PAGES` have a definition. Rebuilt as blocks: Home, Inbox,
the member Roster, Settings (all five), Money (all three), Check-in, Summer
School, Events and Tournaments, Analytics' M&E overview, Status board, Staff
and Behaviour, and Curriculum's lesson list and import. The other 23 mount
the panel that served them in v1 — `page-admin.jsx`, restored WITHOUT its
shell (no second section registry: `CR_PAGES` is the one) — through
`crPanel()` in `cr-ui.jsx`. `members/quality` opens v1's member desk on Data
quality, which also carries v1's member dashboard, import, export and bulk
bar. Curriculum's "Lesson editor and reports" opens v1's curriculum desk at
`/control/learning/curriculum/desk`. A tab rebuilt as blocks stops mounting
its panel; the panel can then be deleted from `page-admin.jsx`.

`adminJump()` (used by the panels and by page-portals.jsx, which called it
while it did not exist) hands the section to the v2 shell.

ID Card Studio: the features the 6c45071 rebuild dropped from the old Card
Studio are restored (checklist at the top of `ids-app.jsx`, F1–F8). The run
drawer's people list has its own class (`.ids-runpeople`), and Look up says
"Nobody on your lists has the ID …" when no record holds it, rather than
claiming a card was never issued to an ID that belongs to nobody.

## ID Card Studio — restored features verified end to end (2026-10-08)

Every feature restored from the old Card Studio (F1–F8) was driven in a real
browser against the lab backend. Four defects found and fixed on the way:

- **Paste a list of IDs** searched only the queue, so a person who already had
  a card came back "not found". It now names them ("already have a card") and
  offers **Queue N reprints**, the existing route back onto a sheet. IDs on
  record but hidden by the Kind/Centre filter are named as hidden. The report
  quotes what was typed, not its normalised form.
- **Resend ID** said "Nobody on file" whenever nothing went, even with an
  email on file and mail down. `admin_id_resend` now returns `onFile`, and the
  studio says which it was. PHP test added.
- **A card that couldn't be drawn** kept its slot (correct) but then printed as
  an error box on card stock and was logged as issued. Print now refuses and
  names it; export leaves it out of the file and the log (`data-ids-failed`).
- Export's failure line read "1 card … are NOT in the file"; it now agrees
  with its count and names the cards.

## ID Card Studio — print is a PDF; the card renderer is snapDOM; faces print; Cloudinary in bulk (2026-10-08)

**Blank sheets.** A site-wide print rule from the timetable
(`@media print { body * { visibility: hidden } }`, keyed to a `.tt-print`
class nothing uses) hid everything on every printed page — the ID Card
Studio's print window copied the site's stylesheets, so its sheets printed
blank, and so did the timetable's own print frame. The rule is now scoped to
`body:has(.tt-print)`. Every earlier print check read the print window's DOM,
never what a printer sees.

**Print no longer uses the browser.** Print builds the studio's sheet as a
PDF (`CardExport.buildSheetPDF`, `idsSheetPages` in ids-print.jsx): each slot
at its millimetre position, backs mirrored for the flip (short edge also turns
the art 180°), cut marks, a packing list with tick boxes, a proof watermark,
a footer saying "print at Actual size (100%)". The alignment test is a PDF
too. The log calls these runs "Sheet PDF".

**The renderer.** html2canvas (used by the export) re-implements CSS and got
the cards' text wrong — letter-spaced capitals squashed ("VOLUNTEER"), pills
overflowing, "VOL-LAB-1" losing its hyphens. Measured, not guessed: every
card type, front and back, rendered at 300 dpi and pixel-diffed against
Chromium's own screenshot of the same element.

| renderer | pixels off | ms / face (warm) |
|---|---|---|
| **snapDOM 3.3.0** | **0.0%** | **16–39** |
| hand-written foreignObject (tried, dropped) | 0.02–0.07% | 96–135 |
| modern-screenshot 4.7.0 | 1.3–2.3% | 136–541 |
| html-to-image 1.11.13 | 1.7–3.8% | 419–1050 |
| html2canvas-pro 2.5.2 | 4.8–6.0% | 193–827 |
| html2canvas 1.4.1 (was in use) | 4.7–6.2% | 269–845 |
| dom-to-svg 0.12.2 (vector) | 4.2–13% | 78–164 |

snapDOM is vendored (`vendor/snapdom.js`, pinned in vendor-build.js and
VERSIONS.json, MIT). `CardExport.renderFaceFast` uses it and falls back to
html2canvas for a face only if snapDOM throws.

**Speed.** Faces are drawn once, at print dpi with 3 mm bleed, cached by what
they show (record content, design + version, size, dpi), and drawn in the
background while the sheet is being arranged (`drawFaces`, the hidden farm,
12 at a time, three in flight). Print, the print-shop export and batches reuse
them. 27 cards double-sided: Print → PDF in 0.2 s once prepared; 7.2 s from an
empty cache (the old pipeline: ~1–2 s a face). The print-shop export went from
3.7–6 s to 1.7–2.4 s for the same file.

**Faces missing on member cards.** The member card drew a photo only when the
URL began http(s). Photos stored on this site are saved site-relative
(`/api/public/photo.php?p=…`, deliberately), so every one printed as an empty
panel. `nggPhotoSrc()` (components.jsx) is now the one test, used by the
member card (both renderers), the Control Room roster, the dashboard, the
programme volunteer list and the data-quality "photo missing" check (which was
flagging people WITH photos).

**Cloudinary.** Edits used to refuse any photo not already on Cloudinary
(`not_editable`), which on a deployment that stores photos locally was every
photo. `cloudinary_adopt()` uploads such a photo once (signed, server side),
then edits it. One implementation, `photo_edit_subject()`, behind both
`admin.photo.edit` and the new `admin.photo.edit.bulk` (cap
`PHOTO_EDIT_BULK_MAX` 200, validated before any write, scope per row,
`unchanged` reported, background removal refused up front when credits are
out, one audit event `photo.edited.bulk`). Members are now a photo subject
throughout (`photo_apply_to_subject`, `photo_ingest`), so an edited member
photo reaches their card. The studio's *Improve photos* sends 8 at a time.

Known and left alone: `node vendor-build.js --check` reports every vendored
file as mismatched because it compares a 16-character hash prefix with the
full hash in VERSIONS.json. Pre-existing; `tests/build.test.js` does the real
comparison and passes.

## ID Card Studio: printing on the live site, sizes, sheets, card photos

Reported: every print and export failed ("Nothing could be exported … couldn't
be drawn") for a record and an uploaded image alike, with `photo.php` 404 and
`ERR_HTTP2_PROTOCOL_ERROR` on `/api/admin/registration.php` in the console.

- **Root cause of the failed prints:** `/vendor/*.js` keeps its name across
  deploys and is cached for 7 days (and the service worker fetches through
  that cache). A browser that had the studio open the week before 79bf2bf
  held the old `card-export.js`, which has no `renderFaceFast` / `imageFace`;
  every face threw and was reported as "couldn't be drawn". `loadVendor` now
  versions vendor URLs by build id (`nggVendorUrl`, also used by
  card-export.js's own loader), and a library declares `ok(global)`: a copy
  that loads without what callers need is fetched once more past the cache.
  `tests/ids-print.test.js` serves the old file for the unversioned URL; with
  the check removed the print never produces a file.
- **CSP:** `connect-src` now allows res.cloudinary.com and the Google Fonts
  hosts. snapDOM inlines photos and fonts with `fetch()`; under the old policy
  a Cloudinary photo printed as an empty box, silently.
- **QR warm-up:** sent every token's PNG on every visit, 60 a request
  (~240 KB). Now `probe: true` asks which tokens are missing and only those
  are sent, 8 a request.
- **Sizes:** `idsSections` (ids-core) gives each card size its own sheets and
  grid. The "Card size" setting is the uploads' size; the old "the sheet
  mixes sizes" red check is gone.
- **Draw failures** carry a reason (`idsFaceWhy`), shown in a dialog with
  Try again / Take them off. Copies of one upload are drawn once (they shared a
  farm key; duplicate React keys can misalign the farm's nodes), and the farm
  is unmounted inside its lock.
- **Card photos** (`card-photo.jsx`, `tests/card-photo.test.js`): whole photo,
  padded with `b_auto:predominant_gradient`; cropped to head and shoulders
  only when Cloudinary's `fl_getinfo` landmarks show the photo holds more.
  Machine framing (c_thumb/c_fill face crops) in a stored URL is dropped;
  a person's edits (colour, background removal, an editor zoom) are kept.
  `cardFacePhoto` is removed. Prints wait on `cardPhotosSettled()`.
- **Missing photo files** (photo.php 404) can't be recovered from here; the
  studio probes each photo on the sheet and blocks the print with a one-press
  fix rather than printing an empty photo box.

## NGG divisions, joining fees, offline payments, member scans

- **Divisions.** `club_catalogue()` used to SEED the NGG course list by copying
  Summer School's academy catalogue, which is why the two programmes looked
  like one. It is now seeded once (`CLUB_DIVISIONS_SEED`) with the four NGG
  divisions; per-division icon, card label and family-facing blurb live in
  `club_division_meta`; the list held before the seed is kept in
  `club_catalogue_before_seed`. Edited in Learning → Divisions & courses
  (`cr-tab-learning.jsx`), which replaces the Club portal's course editor as
  the Control Room surface (the old `curriculum/courses` deep link had no tab
  and the programme-separation test timed out on it). A course may sit in one
  division only. Applications carry the division in `applications.faculty`;
  acceptance writes the division's card label to `members.disciplines`.
- **Joining invoices** (`domain/membership-pay.php`, migration 135). Accepting
  an NGG applicant creates one invoice (membership fee + the first month's
  commitment fee pro-rated by meeting days left, `membership_prorate`) and
  emails a `/pay/<token>` link. The SAME pro-rating now prices the first month
  in `fees_accrue_member`, so ledger and invoice agree; already-posted charges
  are never re-priced. Settlement (`membership_settle`) is the only place an
  invoice becomes paid — Paystack verify or a verified offline payment — and
  is idempotent (the ledger credit is keyed `minv:<invoiceId>`).
- **Offline payments** are claims until a different `fees` holder verifies
  them by re-typing the statement's reference and amount. Evidence SHA-256 and
  the normalised reference are each usable once; evidence lives in
  `api/storage/payment-evidence/` and is hash-checked before it is shown.
- **Member scans.** `card_row_member` now ensures a secure MEMQR code before a
  card is drawn, so new cards never fall back to `/?m=<memberId>`. Old cards
  resolve: `/?m=` rewrites to `/q/`, and an unknown `/q/` token that is a
  member id or printed number opens a limited page (initials, no photo).
  Members get their own page (`MemberCardView`), not the Summer layout.
- Fee-test fixtures that joined mid-month were moved to the 1st (the subject
  was ledger mechanics), and the first-month figure is tested on its own.



## 2026-10-09 — Settings split by purpose; outside services' keys on screen

- Settings → General was one form of forty fields. It is now General,
  Attendance and Card branding (one form definition, `crSyGenForm(d, part)`),
  plus **API keys**.
- `domain/service-keys.php`: one registry (`SERVICE_KEYS`) of the services
  whose keys may be entered on screen — Gemini, Groq, Anthropic, OpenRouter,
  Cloudinary, Paystack, SMTP, Resend, Termii, Twilio, Spitch — and the config
  paths each may set. Stored values (secrets sealed with AES-256-GCM) are laid
  over `$CONFIG` once per request in bootstrap (`service_keys_apply`), so no
  consumer changed. A value set here wins; removing it falls back to the file.
- Paystack secret changes, once one is in use, need a second person (Fees +
  Settings) who pastes the same key; Fees holders are emailed.
- Gemini (`ai.php` `gemini_*`): Google limited the 2.5 models to accounts that
  already used them (Sept 2026), so a new project's key got 404. The model is
  now asked of the key's own `models.list` (cached a day), a 404 re-asks, and
  requests are shaped per family (3.x thinkingLevel, no temperature; 2.5
  thinkingBudget). Keys go in `x-goog-api-key`; "AQ." keys are accepted.
- Lost photo files: Diagnostics can search the hosting account for missing
  stored photos and restore them from a backup, matched by file name (a keyed
  fingerprint of the bytes). `photo_dir` keeps photos outside the website
  folder; the build no longer ships cache, logs or storage contents.


## 2026-10-09 — NGG centres split from Summer School's; nearest-centre promotion; past editions

- `domain/centres-ngg.php` `centres_split_seed_once()` (run once from
  `db_run_seeds`; no-op on an empty database): a centre both programmes shared
  under an NGG default name (Egbeda, Ayobo) becomes Summer School's record
  "<Name> (Summer School)" — keeps its code, its Summer venue and groups, its
  participants and Summer applications move by name — and is retired; NGG gets
  "Egbeda"/"Ayobo" with the Club's address, map point, contacts and page; other
  Summer-only centres are retired; member spellings are tidied onto the exact
  names. Recorded in the audit as `centres.split_seed`.
- Centres are still referenced by NAME across ~28 tables. The split moved only
  the Summer-side references (summer_students, Summer applications). A rename
  through the directory still does not cascade; see the ETL note in this
  session's report before renaming a centre that is in use.
- Promotion: `admin_club_promote` requires an NGG centre (no more hard-coded
  'Egbeda'); with none chosen it takes the nearest, measured from the
  participant's home address (formData), else their Summer venue, else its
  area; `centre_required` when nothing can be measured and there is a choice.
  `admin.club.promote.options` feeds the Control Room's promotion form.
- Geocoding (`geo_geocode`, `geo_geocode_smart`): Google when `maps.google_key`
  is set (Settings → API keys → Google Maps), else Nominatim; Lagos-bounded
  when Lagos is assumed, answers outside the bounds dropped; addresses tried
  as written, without the house number, by landmark, by street, by area;
  cached 30 days (misses 1 day); `maps.offline` turns lookups off. Distance
  Matrix reorders the closest four by driving minutes when Google is set.
- Summer centres retire when an edition closes (`summer_centres_retire_unused`,
  from the nightly close, a manual close, and now web-cron); activating an
  edition revives the Summer venues its groups use.
- `domain/summer-history.php` `admin_summer_history_import`: a past edition's
  register, dry run then digest-bound import; loose headers; day-first dates
  and Excel serials; duplicates by name + guardian phone/email; centres matched
  to Summer records, unknown ones created retired. Control Room → Summer School
  → Past editions.

## 2026-10-22 — NGG's centres follow CACENTRE's locations

- CACENTRE's locations list is the one list of places. CACENTRE publishes it to
  its gate (`PUT /v1/admin/locations`); the gate offers it to NGG at
  `api/hooks/gate.php` `{op:"locations", version, tz, locations}`, signed with
  `hooks.attendance_secret`, and retries every five minutes until NGG answers
  `{ok:true}` for that version.
- `domain/cac-locations.php` `cac_locations_sync`: validated whole, one
  transaction, one audit event (`centre.cacentre_sync`). A location is linked to
  a centre by its id (`centres.cacLocationId`, migration 137), first by id,
  then by exact name or a former name (`aliases`). New → created with
  `cac_centre_code()` (never `ST`, never all digits). Renamed → the centre and
  every table in `CAC_CENTRE_NAMED_BY` follow (a row that would collide with a
  one-per-day unique key keeps the old name, counted as `kept`). Removed →
  retired. The calendar is kept in `cacCalendar` for reading only.
- `admin_centres_upsert` refuses a new centre once the list has arrived, and a
  linked centre's name or status; `admin_centres_delete` refuses a linked
  centre (`managed_by_cacentre`). Code, colour, page and the rest are still NGG's.
- `hooks_attendance` stores the check-in's location in `attendance.centre`
  (migration 137), by the location id when NGG has it.
- Lateness is NGG's: `gate_person_punctuality()` adds `punctuality`
  `{resumption, grace_minutes}` (or null: attendance off, member policy off, or
  not their programme day) to every person the gate resolves, and the gate
  grades the scan by it instead of the desk's location hours.
- Tests: `api/tests/run.php` "cacentre:" block; CACENTRE's
  `tests/integration/gate-e2e.php` drives a rename from CACENTRE through the
  real gate into NGG and the portal.

## 2026-10-29 — Make.com: the processes that wait on a person

- `domain/make.php`, one signed door `api/hooks/make.php`
  (`hooks.make_secret`, same HMAC as the attendance hook; empty = 404), op
  `hooks.make`, `action`: `absence.reason`, `safeguarding.ack`,
  `safeguarding.status`, `registration.status`, `editions`, `impact`, `jobs`.
- Out: `private.attendance.absences` (hourly after the sweep, one per centre
  per day; built only when a destination names it; each absence asked once —
  `absence_asks.infractionId` unique; no number → `no_contact`),
  `private.registration.stalled` (guardian number + the same verify link),
  `safeguarding.flag` (every `behaviour.flagged` now goes through
  `behaviour_flag_emit()`, which also records `safeguarding_flags` and emits
  the nameless twin), `edition.milestone` (`edition_milestones`, once each,
  an overtaken one skipped).
- A guardian's reason sits beside the absence (`absence_reasons_attach`, the
  conduct screens show it); it never voids it. Acknowledgements show in the
  Behaviour drawer; a log marked reviewed counts as acknowledged.
- Migration 138. Tests: `api/tests/run.php` "make:" block;
  `tests/make-hook.test.js` (signature, staleness, actions over real HTTP).
- Why: shared hosting cannot keep time on a quiet weekend, hear a reply, or
  wait days for a person. Make does those; every rule stays here.
- Set up on screen, not in config.php: Settings → Integrations → Make.com
  (`admin.make.secret|cron|connect|off`, through `/admin/integrations.php`).
  NGG makes both keys (`mk_…`, `ck_…`), returns each once and stores them
  sealed in `settings.make_link`; `make_secret()` and `cron_key_effective()`
  read them first and config.php second, so `api/hooks/make.php` and
  `api/public/cron.php` need no file edit. Connect accepts only a
  `hook.*.make.com` address and keeps one destination subscribed to
  `MAKE_EVENTS`. Tests: "make ui:" in run.php, `tests/make-ui.test.js` in a
  browser, `tests/make-hook.test.js` against a key made on screen.

## 2026-10-09 — Mentorship: Anchor Pods (handoff v5 + NGGC Commitment Policy)

- Migration 137 (`domain/mentorship-pods.php`): `mentor_matches` (phase +
  status, never deleted after a choice), `mentor_match_offers`, `mentor_tasks`
  (cadence), `mentor_nudges` (rules R1–R8 + P1, unique key per firing),
  `mentor_interventions`, `mentor_relationship_checks`, `mentor_observations`,
  `mentor_academy`, `mentor_policy`, `mentor_obligations`, `mentor_checkins`,
  `safeguarding_cases` / `safeguarding_notes`, `mentee_profiles`; mentors gain
  `leavingAt`, `cimcAt`, `anthemAt`; `mentor_reviews.trend`.
- One pairing: choosing a mentor writes the `mentor_assignments` row older
  screens read; finishing a closure ends it.
- Approval offers two cleared mentors; a single-mentor approval is refused
  (`need_two_mentors`). Pod data needs screening + the 13 Academy modules
  (`seeds/mentor-academy.json`, graded server-side) + the current policy
  version. `ms_pod_open` 403s a mentee outside the mentor's pod.
- R5 is enforced in `mentor_goal_save` (`goals_locked_connect`); R4 fires from
  `mentor_goal_status`. Rules run from the web-cron job `mentorship` (6h).
- New capability `safeguarding`, super admin only by default, like `fees`.
- Control Room page `mentorship` (tabs `ms-*`; the old `mentorship` Pairings tab
  keeps its id). `/mentor` renders `MentorHome`: the pod portal
  (`src/modules/mentor/mt-portal.jsx`, `.mt-*`) for an NGG mentor record, the
  class roster otherwise or at `?view=class`.
- Tests: 49 PHP checks (one per rule), `tests/mentorship.test.js` end to end.

## Mentor Portal v14, the Summer School view, photos that replace, the ID card reprint audit

- **Mentor Portal v14** (`src/modules/mentor/mp-*.jsx`, `.mp-*`, domain
  `mentor-portal.php`) replaces the v5 pod portal (`mt-portal.jsx` is gone).
  - Five roles from `auth/me().mentorRole`. Every flag and urgency is the server's.
  - The URL is `/mentor/<screen>/<id>/<tab>`.
  - Summer School mentors get the same shell (`mp-summer.jsx`); `?view=class`
    keeps the class roster.
  - Migrations 137–139.
  - A mentor sees no child's record until their safeguarding check is
    recorded. Admins can record the Academy as done in person
    (`admin.ms.mentor.mark` `what=academy`). Staff are never sent through it.
  - Nobody marks their own screening or Academy.
- **Background jobs** (`mentor-automations.php`): 25 jobs at their own Lagos
  times, from the web-cron tick (`mpa_tick`). Each reconciles its nudges, so a
  re-run changes nothing. Admin controls live at `/api/admin/mentor-automations.php`.
- **Safeguarding**: portal concerns go into `safeguarding_cases` (SG-
  references), the officer's queue. Migration 139 removed the copies 138
  made into `community_safeguarding`.
- **A replaced photo replaces** (`photo_set_subject` / `photo_supersede`).
  - The old file is deleted at once unless another live record uses it, or
    it is the live version's source.
  - Earlier pipeline versions are marked superseded and keep no image link.
  - The audit trail quoting a URL no longer keeps a file alive.
- **ID card reprints** (migration 140): each `card_issues` row snapshots the
  photo, name, ID and QR it printed (`faceSig`).
  - `admin.ids.state` returns `stale` per person: photo, name, id, qr or design.
    Everything except design puts them back in the queue.
  - Recording a run closes the reprint requests it satisfied, in one
    transaction. A client `token` makes a replayed log idempotent.
  - A reprint whose cause is `lost` or `never_received` gets a new secure QR,
    once per request. A QR reissue queues a reprint.
  - The mint claims IDs with `member_mint_and_claim` and a conditional write.
  - Every print, reprint and mark op checks centre scope per row against the
    record. Summer School staff can log participant runs.
  - Proofs never make a real first card a "reprint".

## 2026-10-10 — The Club application (v2026.10) and /policies

- `/join` now opens the seven-step Club application (`page-apply.jsx`,
  `ClubApplyPage`) unless `program=summer`, which keeps the four-step form
  (`JoinFormPage`). Breakpoints follow the form's own width (ResizeObserver).
  Draft key `ngg-apply`. `/policies` is a route of its own; the form opens
  the same document (`ClubPolicies`) as a drawer or bottom sheet.
- `public.apply` with a `details` object: `club_apply_details()` validates
  and normalises every answer the old Google Form asked, stored as JSON in
  `applications.details` (migration 141). `club_apply_consents()` requires
  participation, medical, data, comms, media and site_visibility; trips is
  optional. Rows go to `consents` under `APP:<ref>` with `policyVersion`, and
  are copied to the member on convert.
- **Owner decision (2026-10-10):** photos, the website feature and family
  updates are conditions of NGG Club membership. This is enforced for the
  Club application only. `CONSENT_TYPES` (Summer School parent verification)
  was deliberately NOT changed: there `media` and `site_visibility` stay
  "must answer, may decline". Changing it would refuse a child's Summer place
  for declining photo consent, which needs its own decision.
- 18 and over on the Club form → `age_ngv`, and the form links to NGV
  registration on Afrovanguard (`afrovanguard.ngv_url`, served as
  `config.afrovanguard.ngvUrl`).
- Dedupe for the Club form is email + date of birth: an undecided application
  is updated (`updated: true`, same ref); the 24-hour guard is also email +
  dob, so siblings on one email are not collapsed.
- Not done: importing the 116 rows of `Form responses 1.csv` (the CSV was
  not supplied), and serving the school list from the server (it is a
  client list of about 60 schools for now). No pre-send "applied before"
  check: answering it would tell anyone with an email and a birth date
  whether that child applied.

## 2026-10-11 — Schools, maps, applied-before, staff view

- **Schools** (migration 142, `schools`): the Club form's school picker
  searches GRID3 Nigeria's open education-facilities data (HDX, CC BY 4.0) —
  12,089 primary and secondary schools in Lagos and Ogun with LGA and ward —
  plus 47 local schools from the form design that GRID3 lacks. Shipped as
  `api/_lib/seeds/schools-lagos-ogun.json.gz`, loaded once by
  `schools_seed_once()` (first search, or the nightly job); bump
  `SCHOOLS_SEED_VERSION` to reload. A school a family typed is added
  (`school_learn`) when their child is accepted. Overpass (live OSM) was
  tried and timed out repeatedly, so the list is not fetched live.
- **Maps**: with no Google key, driving time and road km come from the free
  OSRM router (`maps.osrm_url`); every centre is routed, not the four nearest
  by straight line. Nominatim takes the first answer inside the area meant.
  Ogun towns are not given ", Lagos".
- `public.apply.check` (rate limited) answers {seen, open} on email + dob;
  the form warns while it is being filled in.
- Control Room applications show every Club form answer; the export has the
  Google Form's columns plus the new ones.

## 2026-10-11 — MySQL columns, the member record drive, the join date

- **MySQL "Unknown column 'duesRemindOff'"**: 44 columns were declared only
  inside the mirror's CREATE TABLE, so databases created before them never
  got them. Every SQLite ALTER now has a MySQL ALTER (same type as the
  CREATE), plus the anchorCode unique index; a PHP check keeps it so.
  Verified on MariaDB.
- **Record drive** (domain/profile-drive.php, migration 143
  `members.profileJson`): setting `profile_drive` {phase off|collect|required,
  deadline, fields, types}. `profile_gate_intercept` in backend_dispatch
  refuses member ops with `record_incomplete` once a collect deadline passes
  (wrapped so a failure lets the request through). `profile_required_check`
  in admin_members_upsert applies only to ACTIVE members and never to a save
  that makes them non-active. Ops: member.profile.status/complete,
  admin.profile.drive(.set), admin.profile.remind, admin.member.joindate.
- **Join date**: refused by the general member edit (`joindate_locked`);
  corrected only by admin.member.joindate (reason, not future, not before
  2018, in the printed ID's intake year); imports never overwrite one.
- Pre-existing failures noted, not changed: tests/summer-editions.test.js and
  tests/family-ui.test.js still drive the v1 Control Room (removed 10-08).

## 2026-10-11 — Portals v2: the Member Portal, school results and the growth plan

The handoff `ngg_portals_handoff_v2` reorganised the Member, Mentor and Instructor
portals into five areas each. Built for real, not copied from the prototype:

- **One shell** (`src/modules/portal/portal-shell.jsx`): sidebar ≥ 760px, bottom
  tab bar below, area tab strip, ⌘K palette (it takes the shortcut from the
  site palette while a portal is on screen). The URL is the state:
  `/member/{area}/{tab}`. `/dashboard` and its old sub-paths forward.
- **Member Portal** (`member-portal.jsx`): Today is one server read
  (`member.today`): standing, account, To do in server order (safeguarding →
  deadlines → replies → preparation), a one-tap weekly mood, this week, where
  you stand. Mentor has a real chat (`chat:<memberId>` in `mentor_messages`,
  answered from the mentor's existing inbox; crisis phrases go to the
  safeguarding officer and show the member who to call). The profile is
  read-only: `member.update` refuses name, school and guardian fields
  (`managed_by_ngg`); "Ask for a change" raises a `details` request.
- **School results** (`domain/school-results.php`, migration 144): upload (Cloudinary
  or this server's photo store), a vision read the member checks (each
  correction logged), a plan for at most three subjects with a required
  "when and where", mentor approval before any family hears, weekly ticks
  and adherence, instructor follow-up (note, seen, remind once a day), and a
  Sunday/Monday/Saturday job. Adults with member accounts are never in the loop.
- **Club class** (`domain/club-class.php`, migration 145): the instructor's
  Saturday — roll (never writes an absence), plan, hinge, exit ticket, log —
  and `instructor.today`. Server and tests done; the instructor screens are next.
- Skill level-ups need a line of evidence (`evidence_required`).

## Re-applied on top of the parallel session's work (2026-10-12)

The other session landed the NGG divisions with their editor, `photo_dir` and
lost-photo recovery, explicit photo geometry and the bundled coding course while
this session's work was uncommitted. What was already there was dropped from
this change (the Club catalogue seed, its test fixture); what was not is below.

- **Permissions on paper.** The roster import records every `CONSENT_TYPES`
  permission as granted, method "Paper form", for each member it touches (dry
  run counts them); an explicit decline on file is kept and counted.
  `admin.members.paperConsents` backfills imported members (the import's note
  stamp or an import-issued card): count first, centre-scoped, capped 2000,
  one audit event. Control Room → Members → "Grant paper permissions".
- **Photos the sweep deleted from under their records.** The reference scan
  matched only the literal `/api/public/photo.php?p=`; inside JSON (escaped
  slashes, json_encode's default) or a percent-encoded link a live photo read
  as unreferenced and was deleted a week later. Every encoding is recognised,
  and a pattern error fails closed (the scan answers "I don't know").
- **Photos survive an update without anybody configuring anything.** With no
  `photo_dir`, the store is `ngg-data/photos` beside the web root when the host
  lets PHP create it (`photo_safe_home`, chosen once, remembered); otherwise
  the old default and the Diagnostics warning. `photo_store_secure` copies
  photos out of the website folder (never moves or deletes), 500 a night in
  webcron before the sweep, or on demand ("Copy them now"). "Download all
  photos" is one .zip of every stored image (`admin.photos.backup`).
  `photo_store_inside_site()` now asks the one helper, `photo_inside_site()`.
- **Card renders.** `CardExport.renderFace` (the member card's own downloads
  and batch) renders with snapDOM first; html2canvas, the fallback, squashed
  letter-spaced text. The fallback is handed `object-fit` images pre-cropped at
  their box's shape with the CSS filter baked in, and waits for the new pixels
  to decode (html2canvas draws `currentSrc`).
- **Divisions everywhere.** `nggc_divisions()` and formation.jsx (the About page,
  the member dashboard) carry the same courses as the seeded catalogue
  (`CLUB_DIVISIONS_DEFAULT`) and each division's "For children interested in…"
  line; Chess stays as the compulsory board (§6).

## 2026-10-13 — The Member and Mentor portals of 10-09…10-11 withdrawn

The programme found the new Member Portal (`/member/{area}/{tab}`, a grey
five-area shell) and the v14 Mentor Portal (`/mentor/*`, mp-*) ugly and no
more capable than the screens they replaced, which had more on them (missions,
tally, account, ID card; stars, V3, conversations, goals, courage). Both
originals are back: `/dashboard` is `DashboardPage`, `/mentor` is `MentorPortal`.

Kept, because they work and something depends on them:
- **School results** (`domain/school-results.php`) is a dashboard section,
  `/dashboard/results`, drawing `MbrResults` in the dashboard's palette
  (`.dash-results` sets the `--pt-*` tokens). The mentor's half, which the
  withdrawn portal never drew, is the Mentor Portal's **School results** tab
  (`MentorPlans` / `MentorPlan`: approve, or send back with a required note).
  The "sent their results" email links to `/mentor?tab=results`.
- **Report a concern** is in the Mentor Portal's header (`MentorConcernSheet`
  → `member.mentor.concern.create` → `safeguarding_cases`), so the route to the
  safeguarding officer is not lost with the v14 form.
- `member.update` still refuses name, school and guardian fields
  (`managed_by_ngg`); Edit profile shows school and phone read-only with "Ask
  for a change" → Requests (`details`). It had been failing every save since
  10-11 because it still sent `phone` and `school`.
- Every server op, table, job and the Control Room's Mentorship workspace.

`/member/*` addresses forward to the matching dashboard section (app.jsx).
Removed: `portal-shell.jsx`, `member-portal.jsx`, `mp-*.jsx`, the `.mp-*` CSS,
`tests/member-portal.test.js`. New: `tests/dashboard-results.test.js` (26,
`npm run test:dashresults`); `tests/mentorship.test.js` drives the restored
portal (roster, School results tab, Report a concern).

## 2026-10-13 — OpenAI as a provider; print from a prompt in the ID Card Studio

- **OpenAI** joins `AI_PROVIDERS` (ai.php): `ai.openai_api_key` / `ai.openai_model`
  (default `gpt-4.1-mini`), on the Service keys screen, usable in any profile and
  as a fallback like the others. Chat Completions with `max_completion_tokens`;
  reasoning models (`o*`, `gpt-5*`) get no temperature. `ai_http_post` has a test
  seam (`$GLOBALS['__ai_http']`) so the request shape is pinned in run.php.
- **Print from a prompt** (`src/modules/idcards/ids-ask.jsx`, `admin.ids.plan` in
  `domain/id-studio.php`). The server reads the request into a plan through the
  `studio` AI profile when a key is set, and always with `ids_plan_rules`; the
  model's fields win one by one, the IDs the rules saw are kept, and everything
  is cleaned against allow-lists (kinds the operator may print, their centres,
  fixed sides/paper/dpi/order). The op reads and writes nothing but an audit
  line; the studio applies the plan to the lists it already shows
  (`idsPlanSelect`, pure), sets its own controls, and shows the count before the
  one Print press, which refuses if the sheet changed. Undo restores the sheet.
  Rate limit `ids.plan` 30 per 10 minutes.
- Tests: run.php (rules, AI merge and cleaning, scope, OpenAI request shape),
  `tests/ids-ask.test.js` (19, `npm run test:idsask`).

## 2026-10-13 — Print from a prompt, round 2: a conversation, not a form

- **Follow-ups refine the plan on screen.** The studio sends the current plan
  with the request (`current`, cleaned on the server like anything from the
  browser). `ids_plan_is_refinement` decides: a request that names who (kind,
  new/reprint, a list of IDs) starts again; anything else adjusts
  (`ids_plan_refine`). The model is shown the current plan and returns the
  whole updated one with `refine`.
- **`also` and `exclude`**: people added on top of a filtered selection and
  people left out ("except", "not", "remove"), each from its own clause, so
  "except 026-002" never puts 026-002 on the sheet. Leaving out wins over an
  earlier add.
- **Near spellings**: centres (`ids_plan_typo_room`: none under 5 letters, one
  under 8, two above, a unique best only) and names (`idsNameMatch`). Number
  words ("the first ten"), months ("in October", last year's when it is
  still to come), "since Monday", "since 3 October".
- **On screen**: each understood part is a chip whose × re-applies the plan
  without it (no second reading); "Updated"; the settings outlined are only
  those that differ from before the plan; the last sheet's empty slots can be
  filled from the cards still waiting (none when each centre starts its own
  sheet); recent requests (localStorage, this browser), ↑ to recall, "/" to
  focus. A fresh request that finds nobody leaves the sheet alone; a
  follow-up always re-applies.
- Tests: run.php +16; `tests/ids-ask.test.js` 32.

## 2026-10-16 — Mentor Portal functional pass: what was fixed, what was left

From the functional review of the mentor engine, with v14 withdrawn (10-13).

**Live paths (the restored MentorPortal and admin pairing):**
- `mentoring_open` refuses unscreened mentors (`not_screened`); stars/V3 are
  unchanged. `mentor_attention` shows concern text only to leads/staff, the
  author and the child's own mentor.
- One concern path: `mp_concern_file()` (mentor-portal.php) is called by Report
  a concern and by a meeting marked as a concern (once per note).
  `member_mp_concern` now needs `mentor_gate` + the child in scope.
- `admin_assign_mentor` ends active pairings in every session and keeps
  `mentor_matches` in step (`admin_assign_mentor_sync_match`). Migration 146
  (+ the `mentor_assignments.one_active` MySQL row fixup) ends existing
  duplicates.
- McGoals used open/done/dropped; goals are draft/active/achieved/paused, so
  Done/Drop never appeared. Fixed, with an explicit agreement step; the
  `open` bypass of the agreement rule is gone. Stalled clock runs from creation.
- MentorPortal's reload no longer unmounts an open record (tab reset).

**Jobs:** quiet-hour pushes are held (`mentor_automation.held`) and released
at 8am; child pushes go once per nudge (`mpa_is_new`); scorecardLock follows
`scorecardLockDay`; noGoalAfterWeek3 / relLowTwice / goalReviewDate keys fixed;
lead nudges with no lead are logged + `ops_record`, not filed to nobody;
concernEscalate runs first in a tick. `MPA_NEEDS_PORTAL` pauses (locked or not)
the jobs whose output only v14 showed; `mentor_automation.portalLive` restores
them.

**Family:** `mp_family_channels()` — there was no `updates` preference, so
guardian accounts were never mailed and opt-outs were bypassed via parentEmail.
A guardian with every notification off now gets nothing; a failed send returns
`not_delivered` and logs no contact. Double-escaped intros fixed.

**API-only (v14 ops):** reply-thread ownership, register/review dates within
14 days, the three-rating review merges answers and keeps `concern`, the
Academy answer key no longer sent, last-Saturday week (Wed–Fri bug), session
check-in progress validated first, admin-mentors get `coord`.

**Left, deliberately:** a mentor's record access is still centre/department
(the legacy model), not caseload — a product decision. The roster's UTC
"today" agrees with the live star path; only the withdrawn portal used Lagos.
The family reply inbox: replies still go to the shared reply-to (the footer
now says so); nothing creates a `Family reply`. `missedSaturdays` Monday edge
and the week fallback in `member_mp_week` (both in paused/v14 code).

## 2026-10-16 — The sign-in pop-up, on the Control Room v2 design system

- **One job per screen** (`SignInModal`, auth.jsx): one field or the code, one
  button, at most one quiet link ("I have a code", "Forgot?" beside the
  password label, "Email me a code instead", "Resend code"). "Change" on the
  identity chip replaces "Start over". "Keep me signed in" (on by default, as
  before) shows only on the password screen. Errors sit under their field.
- **The code is six boxes** (`SignInCode`): typing moves on, Backspace moves
  back, a paste or the phone's one-time-code autofill fills all six, and the
  sixth digit signs in. The first box carries `autocomplete="one-time-code"`.
- **Tokens**: the `--cr-*` block is now declared for `.cr-app, .signin-scrim,
  .portal-login-card` (one source); the layout props stay on `.cr-app`.
- **Geist is self-hosted for real**: `@font-face` for Geist 400/500/600 and
  Geist Mono 500 from `assets/fonts/qcard`. The Control Room's `--cr-font`
  named Geist but nothing outside the ID studio loaded it, so it had been
  rendering in the system sans.
- **Bug fixed, server**: an emailed sign-in code typed by someone who signed in
  with their EMAIL was refused (`bad_member_id`, "Something went wrong"),
  because verify accepted only a Member ID. `auth_resolve_member_id` resolves
  an email for `auth.verify` and `auth.resetConfirm`; an email with no account
  reads "invalid", exactly like a wrong code (no account enumeration).
- The site-wide "one focus ring for one field" rule now skips `.signin-form`,
  `.signin-pw` and the portal gate's form, which it was boxing whole.

## 2026-10-16 — The sign-in door, hardened against bots (one answer for everyone)

Asked for an honest "no account found". Researched before shipping it: OWASP
(WSTG identity testing, Authentication Cheat Sheet) asks for one response
whether or not the account exists, and for a children's programme "this email
is a member" is a safeguarding fact. So the door still answers unknown,
suspended and real accounts identically, and what changed is the cost of asking:

- `auth_find_member()` counts misses per address (`attempt_guard` scope
  `auth.miss`): the 8th unknown identifier pauses that address for 30 minutes,
  and while paused every lookup, real or not, gets `too_many_misses` (429),
  so the pause is not itself an oracle. A hit never clears the count.
- At most 5 codes of one purpose are emailed to one person an hour
  (`AUTH_CODES_PER_HOUR`); past that the answer is unchanged and nothing is sent.
- New hourly buckets `auth.gateway.hour` (120) and `auth.request.hour` (30).
- A honeypot field (`hp`, `.signin-trap`) on gateway / request / reset /
  login; filled → `request_failed`, audited `bot.trap`.

The on-screen wording for "we sent a code" (neutral "if there's an account…")
and an inbox notice to an address with no account are proposed, not built,
pending the owner's decision.

## 2026-10-16 — Sign-in: honest to people, worthless to bots

Follows the entry above. The owner's call: a browser that has signed in here
before is safer, so it gets the plain answer; anyone else gets a neutral
screen and the truth goes to the inbox.

- **Known device.** `session_issue()` (a real sign-in, not impersonation) sets
  a second cookie, `<cookie_name>_dev`: a random device id, HMAC-signed under
  its own label (`device_trust_sign()`), 180 days, kept on sign-out on
  purpose. It names no member and grants nothing but a franker error.
  `device_trust_id()` reads it. The gateway, the code request and the reset request
  answer such a browser with `no_account`, up to `AUTH_HONEST_PER_DAY` (5) a
  day per device, after which it gets the neutral screen like anyone else.
- **Everyone else.** Real and unknown accounts look the same: "If there’s an
  NGG account for this email, we’ve emailed it a 6-digit code" (or "If this is
  your Member ID…"). An unknown EMAIL gets one short "there’s no NGG account
  for this email" note, at most one a day per address
  (`auth_notify_no_account()`, attempt_guard `auth.nobody`). A Member ID has
  no inbox and gets nothing.
- `masked` is now the address the person TYPED (empty for a Member ID), never
  the account's own: the old fake `a•@b.co` for an unknown ID was a tell.
- The gateway no longer spends a network miss when it answers neutrally (it
  sends nothing); `auth.request` / reset count every miss.
- Tests: `api/tests/run.php`, under "A browser that has signed in here before".
  Two `ui-smoke` failures about mentoring goals fail with this change stashed
  too, so they predate it.

## 2026-10-16 — ID Card Studio v4 (the Claude Design handoff)

The v4 handoff (`design_handoff_id_card_studio`, "ID Card Studio v4") applied to
the studio we already had, which held most of its behaviour:

- **Header**: back link, tabs, a Settings / Assistant switch, and **Print N**,
  the one solid button, stating the count. "Design: …" left the header; the
  Designs section's summary and the confirm name it.
- **Assistant** is a chat pane (`IdsAssistant`, ids-ask.jsx) replacing the
  prompt bar: a transcript where earlier plans stay, marked superseded, and one
  is live. Ask mode suggests and waits for Apply; Act mode applies.
  - "Ran …" lines say what a plan did.
  - `@` tags a person by printed ID; `?` lists shortcuts; `/`, ↑ and Escape
    (clear, then close) work as before. The site's command palette no longer
    takes "/" inside the studio.
  - Questions about the sheet ("why can't I print yet?") are answered from the
    studio's own checks (`idsAskAnswer`), not by a model.
  - The reply's Print opens the same confirm as the header's: the assistant
    never prints.
- **Source**:
  - search + funnel (kind, centre and range behind it; a dot when set; it opens
    itself when something narrows the list);
  - a proportional status bar over New / Reprints / Blocked, where pressing the
    one that is on shows everyone;
  - "Add all N".
  - Range is Name / ID / Joined / List: alphabetical and inclusive, partial ends
    work, and swapped ends are swapped back (`idsRangeEnds`, `idsInAlphaRange`).
    Digits on both ends still mean the serial. The list sorts by the range key.
  - Asked people show "Photo requested … · waiting for approval" and a grey
    **✓ Asked** chip, which still asks again. The phone queue shows it too.
- **Sheet**:
  - the job is a select in the toolbar; changing it toasts what changed, with
    Undo;
  - **new sheet per centre/kind pads only a group that fills a sheet**
    (`idsLayout`), so 7 cards from 3 centres take 1 sheet, not 3;
  - the gap banner follows from that.
- **Settings**: checks first ("Ready to print" leads), then Layout (open),
  Printing (backs, cut marks, quality, alignment test, export) and Designs,
  each a card with a summary line.
- **Narrow screens**: 760–1023px is two columns, with the side panel as a
  drawer that Escape closes. The grids follow v4: 320/1fr/300 (assistant 380);
  264/1fr/272 (340); 300 (260 below 860) + drawer.
- The confirm reads "1 sheet", not "All 1 sheets".

Not taken from the handoff, on purpose:
- **The "Classic v4" card drawing.** Cards keep their real renderers (one
  renderer per card, CLAUDE.md §7) and their own sizes and ID formats
  (`026-014` members, `EG-26-001` Summer). The handoff's single `EG-26-0412`
  card for everyone would fork the card and the ID scheme.
- **The assistant amber `#b07a00`.** It is 3.7:1 on white, so `--ids-ai` is
  `#8a5f00` (5.7:1).

Tests: `ids-ask.test.js` rewritten for the pane (44); `ids-studio` (59) and
`ids-print` (16) were moved to the v4 controls; `ids-core` gained the packing
and range rules (51).
## 2026-10-16 · Mentor Portal v15 and the Saturday Formation Schedule

`/mentor` is the v15 design for NGG mentors (compiled by `tools/dc-compile.js`, driven by
`src/modules/mentor15/mp15-app.jsx` on the existing mentor ops); the class portal stays for
instructors, Summer mentors and its own tabs. The Saturday Formation Schedule is a table
(migration 148, `domain/saturday-formation.php`), read per audience by `public.formation` and
edited by `admin.formation.save`; the web-cron sends its block reminders and three family
emails once each. Progress log: `docs/PORTALS-HANDOFF.md`.

## 2026-10-16 — The studio's assistant, much more capable

The assistant pane (ids-ask.jsx) did one thing: read a request into a
selection. It now does five, and none of them prints.

- **Commands on the sheet as it is.** The planner (`ids_plan_rules`, and the
  AI's instructions) reads `margin`, `gap` (clamped 3–30 / 0–20 mm), `skip`
  (used slots on sheet 1), `breakBy` and `packing`, and one act, `do`:
  `clear` | `fill` | `askPhotos` (`IDS_PLAN_DO`; anything else is dropped, so
  "print" and "mark printed" can never come back as acts).
  - A request with no "who" in it ("make it A3", "margin 5mm") changes the
    sheet without reselecting anybody (`runCmd`), with Undo.
  - An act stands on its own rather than refining the plan on screen.
  - `askPhotos` opens the same confirm as the button, count first; nothing is
    sent until it is confirmed.
- **Answers from the studio's own data, never a model** (`idsAskAnswer`):
  - what it can do;
  - one person's status, by name or printed ID (on the sheet, waiting for a
    photo and whether asked, waiting for a reprint, waiting for a first card,
    has a card and when);
  - who is blocked, who is on the sheet;
  - card stock, counts by centre, and why you can or can't print.
  
  A question is answered before anything is sent to the planner.
- **Next steps after every reply**, from the sheet: fill the gaps, front and
  back, make it a proof, ask for photos, why can't I print.
- **Starters from the real queue**: the centre with most new cards, the
  reprints waiting, who is waiting for a photo.
- **Voice input** where the browser has speech recognition. The words land in
  the composer, to be read and sent like typing.

Tests: `run.php` +11 (the new plan fields, clamping, acts, refusal of unknown
acts); `ids-ask.test.js` 44 → 58 (answers, settings-only commands with Undo,
fill, ask-for-photos through the confirm, clear with Undo, and a request to
print that does not print).

## 2026-10-16 — The assistant acts on what it finds

Follows the entry above.
- **A person's answer comes with what can be done for them**
  (`askPerson`, computed when drawn, so it follows them): Put on / Take off
  the sheet, Ask (again) for a photo, Add a photo, Queue a reprint.
- **Near spellings find people** ("Jumoke Cardd"), matched like the planner
  (`idsNameMatch`) and said as "Closest match".
- **It explains the studio's terms** (`IDS_ASK_FAQ`), but only for a question
  that asks what something is or means, so "make it a proof" stays a
  request. Covered: reprint vs new, blocked, proof, packing list, long/short
  edge, cut marks, dpi, used slots, new sheet per centre, blank division,
  lost cards and QR, uploads, ID numbers, designs.
- **"… then fill the gaps"**: a selection with `do: fill` puts the cards on,
  then fills the last sheet on the sheet it made (`actAfter`).
- **The transcript survives a refresh** (sessionStorage, this tab, last 40).
  It comes back as a record: no live plan and no Undo.

Tests: `run.php` +1; `ids-ask.test.js` 58 → 68.

## 2026-10-16 — The assistant: reprint reasons, print history, undo in words

- **Reprint reasons.**
  - The planner reads `cause` (`IDS_PLAN_CAUSES`) only when the request says
    it: "she lost it" / stolen / missing → `lost`; "never received" →
    `never_received`; damaged / broken / faded → `damaged`; a corrected name →
    `name`. "New cards" never carries one, and an unknown value is dropped.
  - A carded person's "Reprint them" now queues with that cause, so a lost
    card's reprint gets its new QR and the old card stops at the gate.
    Without a cause it is still `asked`.
  - The cause shows as a chip ("lost: new QR") with its ×.
- **Print history** (`idsAskHistory`), read from `cardRuns`, the same op as
  the Print log:
  - "what did we print last?";
  - "… today / yesterday / this week" (proofs not counted);
  - "which cards didn't print?".
  
  Each answer carries the runs it names, and a button opens that run's
  drawer. The rows travel with the answer, so the button still works after a
  refresh.
- **Undo in words**: "undo", "undo that", "go back", "put it back" do what the
  newest Undo does. When there is nothing of the assistant's to undo, it says
  so, and points to the toast's own Undo for changes made by hand.
- **"Who hasn't been asked for a photo?"** lists only the people with no
  photo who weren't asked in the last 3 days.

Tests: `run.php` +3; `ids-ask.test.js` 68 → 75.


## 2026-10-16 · Mentor register detail, class tools inside the portal, Instructor Portal v6

- The Saturday register only had taps; the detail waited for Monday's review and was
  usually lost by then. Each row now has **Add detail** (migration 150,
  `mentor_register.note`), saved with the register and carried into the review and the
  timeline. A register write without `note` leaves it alone, so a value tap cannot erase it.
- "Stars & results" used to leave the NGG mentor portal for `/mentor/class`. It is now a
  screen of the portal, the same `MentorPortal` component embedded (`embedded` prop); the
  stand-alone page stays for people with class tools and no v15 portal.
- `.m15-app main` lost `container-type: inline-size`: layout containment made `<main>` the
  containing block of every `position: fixed` sheet inside it.
- Instructor Portal v6 shipped at `/instructor`.


## 2026-10-17 · Team sign-in fixed; two-step sign-in for every portal

**Why instructors, volunteers and mentors could not sign in.** Four separate faults:

- The main door's identifier pattern only took an email or `XXX-2025-0042`. A card
  number (`VOL-INS-26-001`, `026-014`) was refused before any lookup. The pattern is now
  `auth_identifier_ok()`, used by gateway, request and verify.
- Email-code sign-in looked only in `members`, and volunteers live in `volunteers`.
  `auth_find_member()` now falls back to `auth_find_volunteer()`, by card number or by an
  email that only one active volunteer uses. The code is keyed by the volunteerId, and a
  verified code issues the same card-holder session the ID card does.
- A mentor with only a `mentors` row had no identity at all. After the emailed code
  proves the address, `auth_staff_principal()` gives them a volunteers row bound to the
  mentor row. A lookup never creates anything.
- The card door matched `volunteerId` case-sensitively, and a record without a phone
  could never pass it. Matching is case-blind now. A record without a phone answers
  `no_phone_use_email`, and the door offers the emailed code.

**Two-step sign-in** (`domain/mfa.php`, `src/modules/auth/mfa.jsx`):

- **A step per kind of person:**
  - members get a private question;
  - the team gets an authenticator app or an emailed code;
  - guardians get a family PIN;
  - staff keep the console TOTP and are not re-asked.
- **Storage:** `member_state` keys `mfa`, `mfa.pend`, `mfa.code`, `mfa.bypass`, `mfa.req`
  and `mfa.nudged`. No migration. The public `member.state.get/set` refuses every `mfa*`
  key.
- **The session flag:** a sign-in still owing the step carries `mfaP` in the signed
  cookie (main and family). `require_session()` and `require_family()` answer
  `mfa_required` everywhere except the routes that call `session_allow_mfa_pending()`:
  `auth/mfa.php` and `family/me.php`. `auth/me.php` reads the cookie itself and reports
  `mfaPending`. Passing the step re-signs the same cookie (`session_mfa_clear()`) with the
  same sid and expiry.
- **The client:** while the step is owed, AuthProvider exposes no member. No screen loads
  data only to be refused, and MfaHost shows the step. It also shows the alert for anyone
  without a step.
- **The desk:** Members › Sign-in security (`cr-tab-security.jsx`, `admin.mfa.*`). It has
  a policy per kind (`settings`) and per-person actions (`people`): let in for 10
  minutes, reset, require, back to the policy, remind. The let-in is one person at a
  time. Every run is one audit event.
- **Refusals:** own account, staff and out-of-scope rows are refused per row.

Tests: `run.php` +71 sign-in and MFA checks; new `tests/mfa.test.js` (`test:mfa`, in
`test:all`).

## 2026-10-17 — Pay the balance online; mentor portal hardening

- **Paystack for dues and fees.** The ledger never took money; only the joining
  invoice used Paystack. A *balance invoice* (`membership_invoices.purpose =
  'balance'`, migration 151) is made by `membership_balance_invoice()` for the
  ledger's `payable`, paid on the existing `/pay/<token>` page, verified by the
  existing `membership_paystack_verify()`, and settled by `membership_settle()`,
  which posts only the payment for a balance invoice. Ops `member.fees.pay`
  (POST `api/member/fees.php` action `pay`) and `family.fees.pay`
  (`api/family/pay.php`). UI: `PayBalanceButton` (components.jsx) on the member
  account card and the family portal. Not covered: conduct-ledger fines
  (`sanctions`). The member-fees read-only guard now allows exactly these two
  ops and proves the pay op writes nothing to the ledger.
- **Mentor gate fails closed.** Screening per lane carried in `mentor_gate`
  (`screened`); unscreened → no reach, but concerns still fileable; volunteer
  lanes need cleared safeguarding; email binds only an unlinked mentor row.
- **Attention** is centre-wide for leads/coordinators only; instructors are not
  staff. **Peer mentors** (minors) see no family, journal, check-in or adult note.
- **Safeguarding reports**: mentor gate required, subject in reach, 10 per
  reporter per 24h across both paths (`SG_REPORTS_PER_DAY`).
- **Family messages**: 2 per child per day (`MP_FAMILY_PER_DAY`).
- **Rate limits**: `rate_limit_check_actor()` keys on the person; floors for
  every `mentor.*` bucket.
- Pre-existing: `tests/family-ui.test.js` fails one check (a selector timeout)
  on the branch without these changes.


## 2026-10-17 (later) — the rest of the mentor security list

- Register and weekly review: a Saturday, today or within 14 days (`mp_saturday_ok`, `not_a_saturday`).
- Academy quiz: 3 attempts per module per 24h across both portals (`mentor_academy_attempts`, migration 152).
- The week view no longer writes; `mpa_tick` closes stale Saturday follow-ups (`MP_FOLLOWUP_STALE_DAYS`).
- Relationship check asks the child at most once in 28 days; a week's review belongs to its author (leads/coords may correct, audited).
- `mp_urgent_alert()`: crisis chats and "Need help" check-ins reach the officer by email/SMS/app, else the centre's leads and an ops error. Inactive members cannot chat, but a crisis from them still alerts.
- Retreat booking reports real failures; CSRF docblock corrected.
- Production CSP (dist only) by hash, no unsafe-inline/eval — `tests/prod-csp.test.js`. No source map and no `api/tests` in dist.
- Instructors/volunteer mentors with safeguarding pending: admitted with no reach; they see their courses in Curriculum, and the class screen says why it is empty.
- Pre-existing, not fixed: `tests/mentor-v15.test.js` fails its Saturday register step ("Assignment in" click times out) on 10bee246 too; `tests/family-ui.test.js` fails one selector timeout.

## 2026-10-17 — family notifications always on

The owner's rule: every guardian notification is compulsory. `family_notify_prefs()`
returns `FAMILY_NOTIFY_DEFAULT` (all true) regardless of the stored
`guardian_wards.notify`, which is now unread; `family.ward.notify` writes nothing and
answers `required: true`. The family portal shows each email as *On* with no switch.

## 2026-10-17 — Cloudinary storage: watched, protected, slimmer

The plan neared its limit and nothing said so: `cloudinary_refresh_usage` was
called only by tests, and the health line read "Operational" at 99%.
`domain/media-storage.php` now reads `/usage` every 6h from web-cron
(`media_usage_refresh`), keeps the parts in setting `media.usage`, sets a level
(warn 70 / high 85 / critical 95, or HTTP 420), alerts once per level rise
(intake inbox + every `settings` holder, ops event), stops AI edits from high,
and at critical refuses to sign uploads (`media_storage_full`), hides both
cloud paths from `/api/public/config.php` and stops `cloudinary_adopt`, so
photos land in the local store. Every image upload now carries a signed
incoming transformation (`media_incoming_transformation`), and the client
prefers the signed path over the unsigned preset. Diagnostics shows the
breakdown; `admin.media.purgeDerived` deletes derived copies (keep_original).
Not done: re-compressing originals already stored, and finding orphaned
originals no record points at — both need care, because deleting a photo on a
printed card's record is unrecoverable.

## 2026-10-17 — the family portal in the portals' design language

No family design was in the handoff, so `/family` was rebuilt on its shared
tokens (ink on white, gold only accent, Geist, 16px panels, 232px sidebar,
phone tab bar) as one closed `--fx-*` set on `.fam` in styles.css. The one long
page became five screens from one registry (`FAMILY_VIEWS`): Today (needs +
shortcuts + four tiles + check-in + Saturday), Attendance & conduct, Fees,
Lessons & timetable, Messages; plus Emails & connection. State in the URL
(`?child=&view=`). Same API, no new ops. family-ui.test.js drives the new
navigation (28/28). Also fixed: the new inbox shows "From their family account"
on the row; mentor-v15.test.js no longer toggles a child Away on Saturdays.


## 2026-10-17 · Saturday evaluation; Mentor Portal v15 audit fixes

- **What a mentor records.** After each Saturday, every child in the pod is evaluated on
  eight criteria from the formation day:
  - punctuality, assignment, participation, respect;
  - teamwork, courage, initiative, reflection.

  Each is on the member's own growth scale (Not yet · Emerging · Demonstrated · Strong),
  with a strength the mentor saw and one next step.
- **Storage.** The evaluation rides on the week's review row (`mentor_reviews.evalJson`,
  **migration 153**). The worktree first used 151; origin had already taken 151 and 152.
- **Pre-filled from the register.** On time, Assignment in, the values seen, and the
  detail note. Pre-filled answers are labelled "From the register".
- **Validation.** The whole evaluation is checked before anything is written. An old
  three-rating payload still saves and keeps any existing evaluation.
- **What the member sees.** Member Portal v9 shows the evaluations on Growth (all, newest
  first) and Saturday (the latest), through `member.saturday.evals`. That op never returns
  the ratings, the staff note or a concern flag.
- **The family's 2:00 summary** carries the strength and the next step.
- **Onboarding and reminders.** The mentor portal now mounts `GuideTour "mentor"` and
  `DutyPopup "mentor"`; the duty button opens This week, or Saturday for the register.
  The Summer School mentor portal mounts `GuideTour "summer"`.
- **Audit fixes.** Ten defects fixed across the pod, lead and coordinator views: empty
  states, the column drift, the coordinator's centre picker, and the Academy tab for
  coordinators with no mentor record.

### Mentor Portal v15: Class area redesigned, nothing embedded

The old dark MentorPortal that v15 used to embed as "Me → Stars & results" is gone from v15.
It is replaced by `src/modules/mentor15/mp15-class.jsx`, in v15's own design (`.m15c*`
classes in styles-app.css). A new nav area, **Class**, has three screens:

- **Stars**: the roster for "My mentees" or the whole centre, with search, select-all
  (indeterminate) and a bulk bar. The star, presence, note and bulk drawers close on
  Escape and return focus.
- **School results**: approve or send back, with a note.
- **Curriculum**: marking and lessons.

It uses only existing endpoints (starGive, v3Rate, bulkAward, remarks, mentorPlans/Approve/Return,
curriculumStaff/Mark), so there are no new ops. URL: /mentor/class[?tab=results|curriculum];
the old /mentor?tab= links forward.

Other changes:

- "Me" is renamed **My role**.
- The Saturday Formation schedule now renders after the page's work (`slotEnd`), not above the title.
- The compiled view's hard-coded sample ID "NGG-M-0142" is now `{{ meId }}` (mp15-subs.json, recompiled).
- The register legend explains values vs duties.

mentor-v15.test.js: 31/31.

### 2026-10-17 · More second-step options per kind; backup codes

- **Methods per kind.** `MFA_METHODS` is what each kind MAY choose (members: question,
  pin, app, email; team: app, email, pin; guardians: pin, app, question). The setting
  `mfa_methods` narrows it per kind (`mfa_methods_for()`). The desk edits it next to the
  policy. It is refused when empty (`no_method`) or when it names a method the kind cannot
  have (`bad_method`).
- **Backup codes.** Every set-up or change issues `MFA_BACKUP_N` (8) one-time codes,
  `XXXX-XXXX`, hashed in `member_state` `mfa.backup` and returned once. `mfa_verify`
  accepts one when the step itself fails, and spends it. `mfa.backup.new` (needs the
  current step) replaces the set. Reset and turn-off clear it.
- **Email for members** needs an email on the record (`no_email_on_file`).

Tests: `run.php` +13; `mfa.test.js` 32 → 37.



## 2026-10-17 — Three-year adaptive curriculum, the music programme, assignments desk

- **Curriculum by mastery** (`domain/curriculum.php`): a lesson's level carries
  its programme year (`curriculum_level_year`). `curriculum_adapt()` is pure
  (it takes units, the placement year and progress) and places each member
  per course: start at Year 1 or the staff placement
  (`member_state` `staff.curriculum.year`, op `staff.curriculum.year`).
  Finishing 80% of a year opens the next; leftovers become `catchup`; only the
  placed year falls due (`curriculum_stage_due`). The due sweep now uses the
  member page's resolver and year, not a bare track match, so a MUSIC member
  is reminded about Piano lessons. `member_state_set` refuses `staff.*` keys.
- **Seed `music-piano-guitar-2026`**: 144 lessons, Piano and Guitar,
  Years 1–3. Multiple-choice answers are option **indexes**, because the
  validator reads a bare digit as an index ("3 beats" → option 3).
- **Import**: the screen honours a JSON file's own `allowNewCourse`, and a
  refused row now carries its course and week.
- **Assignments desk** (`src/modules/learn/assign-desk.jsx`): one component
  for the Control Room and the instructor portal, replacing
  `AdminAssignments` and its editor and graders in page-admin.jsx. New op
  `staff.assignments.draft` lifts a lesson's weekly assignment, objectives
  and rubric (AI optional). `assignment_can_mark` lets an instructor mark an
  every-centre assignment for their course, per hand-in within their centre.
  An admin's course list includes courses that have published lessons but
  are not in the catalogue.
- **Member v9**: assignment state from the server (`mp9AsgState`),
  resubmission after a return, and the proof type respected.

Tests: `run.php` +17; new `tests/assign-desk.test.js` (22).
- **Curriculum export** (`admin.curriculum.document`, `api/admin/curriculum-doc.php`):
  staff edition with answers and rubrics; member edition (and the member's
  own `curriculum-doc.php`) passes through `curriculum_strip_assignments`,
  which drops the "…assignment/homework" section and task/project/essay
  checks.
- **Seed `business-tool-first-2026`**: the Business Division's 72 Saturdays (six
  modules of 12; Modules 1–2 Year 1, 3–4 Year 2, 5–6 Year 3), each a
  120-minute lesson in the 20/60/25/15 Saturday standard, with an "AI, used
  well" strand. Practical Coding and Media Lab gain the same strand and
  support/stretch work; their levels are unchanged, so re-import updates them.
- **Resolver fix**: a course that only *contains* the word (TECH → "Tech
  Product Design") is a weak hit and no longer suppresses the division
  mapping, so TECH members get Coding again (member-v9 caught it).
- **Hand-in kinds** (migration 155): `ASG_PROOFS` text | file | photo | recording |
  link | checklist | either | any; `assignments.steps` (success criteria the
  member ticks, enforced as `steps_incomplete`); submissions carry `linkUrl`
  (named by `assignment_link_kind`), `filesJson` (≤ `ASG_FILES_MAX` 5; `fileUrl`
  stays the first, for older readers) and `stepsJson`. `assignment_infer_from_unit`
  suggests the kind and lifts the lesson's "Success criteria" as steps.
  Upload kind `assignment` is now media-aware like `post` (a PDF stays a PDF,
  audio and video are stored as video); `mediaKindOf` treats audio as video.
- **AsdHandIn** (assign-desk.jsx): the member's hand-in panel, opened from
  member v9 via `slotEnd`. Camera capture, MediaRecorder audio and video,
  link recognition, the steps to tick, upload progress. It replaces the
  generated sheet for assignments.
- **NGG Learning Path** (`curriculum_path`): Y·T·W codes on unit payloads, the
  member list, the Control Room lesson list (Term filter, Path sort), desk
  lesson labels and the PDF export groups.
- **textbee** (`sms_send_textbee`, service key `textbee`): SMS from the
  programme's own Android phone via textbee.dev — `POST /api/v1/gateway/send-sms`,
  `x-api-key`, `{recipients, message, deviceId?, simSubscriptionId?}`; a 200 is
  queued, not delivered. First for +234, after Twilio for others; any refusal
  falls through.
- **AI in the curriculum**: the editor's AI writes a whole lesson in the
  Saturday standard when given only a title (notes are never rewritten);
  members get a **Study helper** on Learn (`member.curriculum.ask`, profile
  `coach`, `CURR_TUTOR_PER_DAY` 20, counted under `ai.tutor.<date>`, a key
  `member_state_set` refuses). It is shown the lesson without its assignment,
  and distress is answered with people, not the lesson.
- **Volunteer sign-in** (migration 156): emails saved with spaces or capitals,
  a status saved as "Active", and one person on two active volunteer records
  (a Summer card carried into NGG) each made the email door answer "no
  account". Lookups now compare `lower(trim())` on both sides; duplicates
  resolve to the NGG / instructor / newest record; 156 cleans stored emails
  (MySQL via `NGG_MYSQL_ROW_FIXUPS`). `auth_clean_identifier` (and the client's
  `authTidyId`) remove invisible characters, en dashes, spaces in IDs and a
  trailing full stop; the sign-in field offers one-tap fixes for common email
  domain slips (`AuthIdHint`).

## 2026-10-17 — Face check at the desk; storage on R2 / B2; security pass

- **Face check** (`src/modules/gate/face-check.jsx`, `gate.face.log` in
  `domain/registration.php`): off by default (`face_check_enabled`). After a
  scan the desk compares the front camera with the record photo, in the
  browser, with @vladmandic/human 3.3.6 (`vendor/human`, MIT): blazeface +
  faceres (float16, kept unquantised: uint8 made different people score 0.66)
  + antispoof + liveness (both uint8). No face mesh. 12 MB → 9.1 MB. Only the
  verdict, scores and the desk's decision reach the server (audit
  `gate.face`). The scan window is 7 s but continues to 30 s while a face is
  in view and fewer than four frames have been read: on a slow device
  (3.5 s a frame under software GL) ending on the clock alone said "no face"
  while it was looking at one. Too few frames can never be a match.
  `tests/face-check.test.js` feeds the fake camera from a still (ffmpeg at
  test time; nothing large is committed).
- **File storage** (`api/_lib/object-store.php`): any S3-compatible bucket,
  R2 recommended. When `storage` is fully set, both upload signers return a
  SigV4 presigned PUT (content-type and content-length signed, 15 minutes,
  server-chosen key, extension allow-list) and `uploadFile` PUTs straight to
  the bucket. Cloudinary keeps what it holds; `media_uploads_allowed` no longer
  decides when a bucket is in use. The bucket's public host joins the photo
  allowlists (`photo_intake_url`, `ai_fetch_image`, `results_file_ok`,
  `intake_photo_accept`, `photo_frame_basis` kind `store`); photo replace
  deletes the old object. SigV4 is pinned to AWS's two published examples;
  `tests/storage-upload.test.js` runs a stand-in HTTPS bucket that verifies
  every signature with its own implementation.
- **Security**: `member_state_set` refuses mixed-case private prefixes (and
  `NGG_MYSQL_ROW_FIXUPS` drops any already stored); mentor/volunteer centre
  scope fails closed (no centre = `[]`, not "all"); assignment submissions
  list is refused out of scope; hand-in file URLs must be https or our own
  file route; the study helper's allowance is taken before the AI call and
  refunded on failure, plus a per-member rate limit; an inbox shared by two
  different people never resolves to either (they are told to use the card
  number).
- **Not fixed, recorded**: the sign-in gateway still reveals which method an
  address uses (password vs code); Cloudinary signatures do not pin
  `allowed_formats`; logout accepts GET. `node vendor-build.js --check` was
  already failing on every file before this work (it compares a 16-character
  prefix with a full hash).

## 2026-10-17 (later) — the three audit leftovers; a free SMS route

- **Sign-in gateway**: an unknown browser gets `['password','code']` (and
  `uniform`) for every identifier; only a known device (`device_trust_id`,
  inside `AUTH_HONEST_PER_DAY`) is told the real methods. `auth_login` answers
  `invalid_login` for an account with no password (was `no_password`), and
  `auth_request` for a password-only staff account answers like any request
  (was `use_password`) and mails that inbox once a day
  (`auth_notify_use_password`). The code-verify path still refuses staff.
- **Cloudinary signatures** now sign `allowed_formats` (one list with the
  bucket: `store_formats()`; Cloudinary also takes HEIC/HEIF/AVIF for images)
  and a per-uploader folder `store_owner_segment()` — `u` + 16 hex of an HMAC
  of the member id under `cookie_secret`, never the id. Bucket keys carry the
  same segment.
- **Logout** is POST only (`require_method`), so it passes CSRF; an
  `<img src=/api/auth/logout.php>` no longer signs anybody out.
- **SMS Gateway for Android** (`sms_send_smsgate`, service key `smsgate`):
  free, Apache-2.0, the public Cloud Server is free with no fixed cap. POST
  `https://api.sms-gate.app/3rdparty/v1/messages`, basic auth,
  `{textMessage:{text}, phoneNumbers, deviceId?, simNumber?}`; an id and a
  state other than Failed is a send. First for +234, before textbee. It still
  spends the SIM's airtime — no SMS route is free of carrier charges.

## 2026-10-17 (later still) — Telegram as the free text channel

- `api/_lib/telegram.php`, migration 157 (`telegram_links`: E.164 phone →
  chat). `sms_send()` tries Telegram first for a connected number and falls
  through to the SMS providers on any failure; a 403 / chat-not-found unlinks
  at once. Linking is by **phone**, so every existing caller (guardian checks,
  volunteer IDs, mentor alerts, sign-in codes) uses it with no change.
- A person links by sharing their own contact: `contact.user_id` must equal
  `from.id`, so a forwarded contact is refused. Private chats only.
- Webhook `api/hooks/telegram.php`: `X-Telegram-Bot-Api-Secret-Token` must
  equal `telegram_webhook_secret()` (HMAC of the bot token under
  `cookie_secret`), set by the key's **Test** (`telegram_setup`: getMe +
  setWebhook). Always 200 to Telegram so a bad update is not retried.
- `sms_enabled()` is true with only a bot configured; an unconnected number
  then fails honestly (`sms_failed` in the audit), as callers already expect.
- Client: `TelegramConnect` (components.jsx) in the family portal's *Emails &
  connection*, and the public `/telegram` route (ROUTES) with a QR.
- `tests/telegram.test.js`, and PHP tests for the linking, routing, fallback,
  unlink-on-block and setup.

## 2026-10-17 — community media: same quality, fewer bytes

- `vendor/image-tools.js`: `encodeBest` (WebP when smaller than JPEG at the
  same quality; Safari's canvas returns PNG for WebP, so the blob TYPE is
  checked) and `stripJpegMeta` (lossless: drops EXIF unless it carries a
  rotation, XMP, IPTC, COM, APPn other than JFIF/ICC/Adobe; scan data copied
  whole). `SHRINK.post`/`proof` take `webp: true`; headshots stay JPEG.
- Migration 158 `media_objects` + `domain/media-objects.php`: every bucket
  upload recorded at signing; `member/upload-done.php` makes the server
  stream the object back and hash it (`media_obj_hash_url`), and only a match
  is reusable — the browser's hash alone would let one person poison a common
  file. `upload-sign.php` answers `provider: existing` for a verified hash +
  size whose extension the kind may store. Nightly `media_obj_sweep` deletes
  week-old objects `photo_store_live_refs` finds nowhere (skipping
  audit_log, photo_assets, media_objects); unknown keeps.
- `storage.ca_file` for a self-hosted store with a private CA (also what the
  e2e uses). Diagnostics shows *Files in the bucket*.

## 2026-10-17 — Study tools at /study

- `src/modules/tools/tools-core.jsx` (parser, registry `STT_TOOLS`, shell,
  overview, flashcards) and `tools-more.jsx` (focus, typing, calculator,
  graphs, dictionary); both in `build.js` ORDER and `index.html`. Route
  `study` in ROUTES — NOT `/tools`, because the repository root has a real
  `tools/` folder and a root deploy (and `php -S` in every test) serves the
  folder instead of the SPA.
- The calculator never evals: tokens → shunting-yard → a fixed operator and
  function table (`sttCompile`/`sttRun`), with implied multiplication,
  degrees/radians, `ans`, and a sentence for every error.
- Server: migration 159 (`study_decks`, `study_cards`, `study_sessions`),
  `domain/study-tools.php`, `api/member/tools.php` (one route, allow-listed
  views and actions). SM-2 in `study_schedule` (pure, tested). Every op is
  the session's own; another member's deck is `not_found`. A deck from a
  lesson reuses the study helper's allowance (`ai.tutor.<day>`), taken first
  and refunded on failure, and never sees the lesson's assignment.
- The three tables are in `member_merge_policy` (MOVE) — the merge test
  refuses any new memberId table that is not.
- Dictionary: dictionaryapi.dev (free, no key); `.htaccess` connect-src
  lists it. `tests/study-tools.test.js` stubs it.

## 2026-10-17 — Study tools: course labs, the study helper, and similar tools merged

- Nine tabs became five (`STT_TOOLS`, each with `subs`): Today (focus + the
  week), Revise (flashcards, quiz, notes), Maths (calculator, graphs, number
  bases), Words (dictionary, typing), Course labs. `STT_ALIASES` forwards the
  old `/study/<tool>` addresses; `/study/<tab>/<sub>` is the address, and
  app.jsx's `inStudySubtree` stops the router rewriting it back to `/study`
  (it did, on a deep link).
- Hand-offs between merged tools: `sttGo(tool, sub, data)` + `sttTakeHandoff`
  (a sum with x → its graph); a dictionary word → the "My words" deck
  (`sttAddToMyWords`, no duplicates); missed quiz questions → a deck.
- `tools-labs.jsx`: one lab per division (`STT_LABS`), the member's division
  first (`study_lessons` now returns `division`). The code playground runs in
  `assets/sandbox/code-sandbox.html` — its own CSP via `.htaccess` `<Files>`
  (inline scripts, `default-src 'none'`, `sandbox allow-scripts`), framed with
  `sandbox="allow-scripts"`; messages are believed only from that frame's
  window. An srcdoc/blob frame would inherit the production CSP and block the
  member's scripts.
- `study_quiz_ai` (ai_classify JSON; a question without 4 distinct options and
  one in-range answer is dropped; fewer than 3 is a refusal and a refund) and
  `study_notes_ai` (distress → people to talk to, nothing spent), both on
  `study_ai_take` / `study_ai_refund`. `study_log` accepts `quiz`.

## 2026-10-18 — Portals for younger members, phone tabs, two crashes, assignments, text-message codes

- **Simple view** (`mp9-app.jsx` `viewMode()`/`simple()`/`setView()`, state key
  `mp9.view`): on by default below `MP9_SIMPLE_UNDER` (13), switchable in
  Profile (`viewSwitch()`, rendered in `slotEnd` so it never pushes the tabs
  down). `mp9SimpleAreas()` names the five areas plainly; `MP9_SIMPLE_TILES`
  are the big buttons on Today (`simpleTiles()`, in the hand-written slot —
  `mp9-view.jsx` is generated and untouched).
- **dc-compile loop variables** are emitted as `l_<name>`. A design loop
  `as="h"` shadowed the view's `h` (createElement) and crashed instructor
  Teach and Analytics, the member's results history and the mentor's family
  history ("h is not a function"). All three views regenerated; the CSS is
  byte-identical. `instructor-v6.test.js` opens both screens and asserts no
  view has an unprefixed loop.
- **Phone tabs**: `<main>` is a container in all three portals; under 600px
  an area's tab row wraps as pills (`[aria-current="true"]` filled) instead of
  scrolling sideways. The member's mentor tablist goes two by two; the study
  tools' tab row wraps.
- **Instructor portal**: the assignment desk sits in the 960px column; skill
  distribution bars count out of the whole class (unmarked in grey); Analytics
  says why attendance is empty before any roll is closed.
- **Assignments not showing**: `assignment_matches_member` and
  `assignment_audience` compared status and centre exactly, so an imported
  "Active", a blank status or a centre in another case saw none (lessons,
  matched loosely, still showed). Both are case- and space-insensitive now.
- **Text-message sign-in codes** (`mfa.php`): `sms` in `MFA_METHODS` for every
  kind, offered only while `sms_enabled()`; enrolment holds the number in
  `mfa.pend` until a texted code proves it, stored as `rec.to`; the challenge
  texts that number via `sms_send()` (Telegram first). A failed send deletes
  the waiting code. `mfa_mask_phone()` for display. Client: `mfa.jsx`
  (phone field, "Text me a code").

## 2026-10-18 — Member portal: energy, and nothing left outside the column

- **Today's banner** (`mp9-more.jsx` `hero()`, in the new `{{ todaySlot }}` of
  `member-portal-v9.dc.html`, under the greeting): level, XP to the next level
  (momentum: 250 XP a level), streak, and the ONE next step from the To do list
  with its button; "All caught up" with the momentum nudge otherwise.
- **One colour per area** (`MP9_AREA_OF`, `MP9_ACCENT`; `markArea()` writes
  `data-area` / `data-view` on the portal frame): the area's tab underline, its
  phone pill, the bottom-bar item and the sidebar icon take it. Each passes 4.5:1.
- **Hand-written panels sit in the design's column** (`.m9x-end`, and the
  Today slot inside the column): Study helper, evaluations and the view switch
  used to render full-bleed outside it.
- **Scorecard rows had no names**: `MP_SKILLS` arrives as `[name, hint]`
  pairs; the controller read only strings and objects. The rows also get their
  three-column grid (`li.cols`).
- Saturday no longer shows the day twice (the formation block repeated the plan).
- Today puts the account summary last (CSS `order`); the simple view hides it.

## 2026-10-18 — Member portal colour, made calmer and rule-based

The first pass (a three-colour gradient banner, solid area fills) read as
rough. The colour now follows rules a change can be checked against:
- **60-30-10**: neutral surfaces carry the page; the area's tint marks where you
  are (`--m9-tint`, `--m9-line`); the ONE solid colour is the next action (the
  banner's Start, NGG amber `#f5b026` with dark text, 10.4:1).
- **Selected is a state**: a selected phone tab gets the tint and the area's
  ink, not a fill.
- **Area hues never reuse status hues**: Grow is teal `#0f766e`, so green
  still means done; Today is a deepened NGG amber `#a15c07`. Every text pairing
  is 4.5:1 or better (checked, listed in the commit).
- **Never colour alone** (WCAG 1.4.1): states keep their icon and label.
- **Age**: the simple view's tints are slightly stronger; teenagers get the calm
  ones (NN/g found teens prefer clean layouts and dislike loud graphics).

## 2026-10-19 — Lessons set their own homework

The curriculum's assignments reached members only if staff re-typed each
lesson's "This week's assignment" on the desk; members saw the lesson (its
member copy strips the assignment, by design) and an empty Assignments list.
- `assignment_auto_issue()` (assignments.php): when a lesson's week of the term
  begins (`assignment_term_week`, from `curriculum.startDate`), a published lesson
  with that section is issued once (`createdBy = 'curriculum'`), due on
  `curriculum_due_date`, built by `assignment_draft_from_unit()` — the same
  lifting the desk's "Draft from the lesson" uses (one implementation). Skips a
  lesson that already has an assignment, and one whose week is over. Runs on the
  webcron (`assign_auto`, 6-hourly) and at most hourly from a page view
  (`assignment_auto_tick`, a JSON stamp — settings are JSON objects; a bare
  number reads back as null, which is also why the switch is `{on: bool}`).
- **Year matching**: an assignment with a `unitId` reaches only members placed
  in that lesson's year (`assignment_unit_year`, `assignment_member_year`); the
  audience loads every placement in one query (`assignment_placed_years`).
- `staff.assignments.auto` (admin, Control Room only) switches it; the desk's
  `AsdAutoBar` shows it, rows carry `fromLesson` ("Set by the lesson").
- Tests: PHP (off, issue, due date + steps, skips, once, year both ways, told,
  who may switch) and assign-desk (the bar, off/on issues, the chip, the member).

## 2026-10-19 — Course coverage and course outlines

Thirty-odd catalogue courses, four with lessons: a member on Robotics or Acting
opened Learn to nothing, and no screen said which courses those were.
- `admin.curriculum.coverage` (curriculum.php): per catalogue course (and any
  course lessons are filed under): published / draft counts, years, weeks,
  lessons that set homework, and members who take it — counted with
  `curriculum_member_courses`, the member page's own matching, in one pass;
  centre-scoped; members with no published lesson counted. Gaps with members first.
- `admin.curriculum.plan`: a term's outline for one course (`CURR_PLAN_ARC`, the
  NGG term shape, stretched to 4–24 weeks; AI titles when configured), each in
  the next free position of its week. Rows go through `admin_curriculum_import`
  as drafts (allowNewCourse), so the check, digest and audit are the import's.
- Control Room: KPI row, a gap note with its action, the Courses table, and
  "Build a course outline" (`crCurOutline`).
- Coding and Media Lab lessons have no "This week's assignment" section; their
  homework is each lesson's own check (task, code, project), handed in in the
  lesson and marked in Marking — by design, so auto-issue leaves them alone.

## 2026-10-19 — Bottom navigation off screen on phones

The three portals' frames were `height: 100vh` (generated classes). On Android
Chrome and iOS Safari 100vh is the height with the address bar hidden, so while
it shows, the frame's bottom — the bottom navigation — sat under the screen
edge. Overridden in styles-app.css to `100dvh` (100vh kept as the fallback);
the boot and hub screens likewise. The member and instructor bottom bars also
pad for `env(safe-area-inset-bottom)` (the viewport is `viewport-fit=cover`), as
the mentor's already did. member-v9 asserts the bar is on screen, the page does
not scroll past it, and the frame rule uses dvh.

## 2026-10-19 — Club portal v3, Community v3, announcements, storage, Academies

One session, from a design handoff (Club staff portal v3 and the Community) and
the requests that followed it. Schema 160 → 164.

**Club portal v3** (`/club-admin`, `domain/club-portal.php`, `src/modules/club3/`).
The design compiled with `tools/dc-compile.js` (`cp3-view.jsx`, `sd3-view.jsx`,
generated — never edit) and driven by `Cp3Portal`; ops `admin.clubp.*`, gate
`club`, NGG centres only, scope per row. Migration 160 splits the centre lead
(`centres.summerLeadVolunteerId`); 161 adds `club_announcements`,
`club_checkin_state`, `conduct_rules`. `fees_post` honours a rule's on/off and
its per-term cap (the last fine is cut to fit). The old `ClubManager`,
`ClubPromote`, `ClubRoster` are gone; admin-bulk drives v3. The weekly brief
has a deterministic fallback, so it never depends on AI.

**Community v3** (`/community`, `domain/community-v3.php`, `src/modules/community3/`).
Compiled from `docs/design/portals/community-v3.dc.html` (holes for real media,
the PDF page, the arcade, the 2FA gate, journal, offline). Post kinds
question/work/announcement/homework, the safety rules shared by client and
server (`cm3_safety_rules`) with students' posts held and staff exempt, video
chapters/captions/resume (`community_video_progress`, migration 162), code with
live preview, moderation extras (edit & approve, message author, escalate →
safeguarding case), median review time, safeguarding gated on the
`safeguarding` cap. The classic app stays at `?classic=1`; community-page tests
it there. dc-compile now keeps `@keyframes` and maps `onInput` to `onChange`.

**Announcements** (follow-up request). App reaches guardians in their family
account (`guardian_notices`, migration 163; "From the Club" on /family, badged
on Today; one per guardian per announcement). Telegram is a channel and carries
the whole message; a phone reached there is not also texted. Defaults are App +
Email (+ Telegram when a bot is set). An SMS longer than two texts needs a
short version that keeps every number/day/month/link/email (`cp_ann_facts`):
AI writes one, it is checked, retried once naming what was lost, and refused
rather than trusted; without a faithful version SMS is dropped for email and
Telegram and the screen says so. Never truncated. Channels that reach nobody
are refused at submit and approve.

**File storage** is no longer "R2 or B2": `STORAGE_PROVIDERS` (service-keys.php)
lists R2, B2, S3, Wasabi, Spaces, Supabase, IDrive e2 and any S3-compatible
service, each with steps, address shapes and this site's CORS rule (the b2 CLI
command for B2, whose console cannot allow PUT); the keys screen shows the
guide and a per-provider Connect form; the CSP allows the new hosts.

**The Academies' "Start here"** (`domain/academy.php`). Both staff Academies
open with six portal guides (`orientation: true`) naming the right tool for each
job. Until they are passed the portal opens on the Academy only and
`academy_intercept` (at backend_dispatch's seam, after the approval and profile
gates) refuses the portal's writes with `orientation_required`; Report a concern
is never gated. Orientation is not clearance (still 13 required modules), so no
mentor was un-cleared. Staff and by-hand clearance are exempt. Instructors have
an Academy of their own now (`seeds/instructor-academy.json`, `academy_passes` /
`academy_attempts`, migration 164, `instructor.academy[.result]`, `Ip6Academy`),
and an instructor whose check isn't recorded yet is sent to the v6 portal (the
Academy and Curriculum) instead of the old one. The PHP suite's fixtures run
with `$GLOBALS['__academy_gate_off']`; its Academy block turns the gate on.

Known and not fixed: `tests/responsive-staff` reads `ADMIN_SECTIONS`, which no
longer exists, and so checks "Control Room (0 sections)".

## 2026-10-20 — responsive-staff measures the Control Room again

`tests/responsive-staff.test.js` read `ADMIN_SECTIONS` out of page-admin.jsx and
mounted `AdminPage`; both left when the Control Room moved to
`src/modules/control/`, so it swept "0 sections" and passed. It now reads the
live `CR_PAGES` registry from the built bundle (fewer than 30 tabs is a
failure, not a pass), mounts `ControlRoomPage` and drives
`__adminSection(page, tab)` through all 71 tabs, and also sweeps the v15 mentor
portal, the v6 instructor portal and the family account. Findings are grouped
by control as well as by page.

What it found, fixed under `@media (pointer: coarse)` only (mouse sizes
unchanged): the Control Room's buttons, page and sub-tabs, top-bar controls,
nav items, icon buttons and avatar, the assignment desk's buttons and tabs, and
the family account's links, buttons and brand mark were 30–40px tall on touch
screens; all now clear 44px.

family-ui waited a bare 40s after page loads in dev mode; the Babel boot now
takes longer than that, so every load waits on `waitForBoot` (CLAUDE.md §1).

## 2026-10-21 — Academy gate, messages, titles, the Saturday plan, the ID assistant, the curriculum map, growth

**Academy gate.** A mentor or instructor whose whole Academy (the "Start here"
guides plus the required modules for their portals) is not complete can open
every screen; a banner on each says nothing saves, and the server refuses the
portal's writes (`ACADEMY_GATED_MENTOR_OPS`, `academy_intercept`). Report a
concern always works. Renewals that lapse put the banner back.

**Messages.** Each child is one conversation (`chat:<id>`) in the mentor's
Messages with the whole thread, whoever wrote first; *New message* starts one.
`mp_can_message`: the caseload, and for a lead (or coordinator) any active NGG
member at the centres they lead — never a colleague (a mentor row) or another
centre. `member.mentor.message.search` finds them by name.

**Titles.** Children and families see adults as title + surname
(`staff_public_name[s]` in util.php; `honorific` on members, mentors and
volunteers, migration 165; blank is "Coach"). Applied to the child's chat and
"my mentor", today, evaluations, courage marks, results notes and plans,
timetable (member and family), community authors/comments/files/homework/
typing, the family's Saturday summary, announcement notices, and the
mentor-assigned notifications. Set in Control Room (mentor and volunteer
editors) or by the person (the Academy's *How children see you*,
`member.staff.title`). Staff screens keep full names. Client fields that never
showed a name were fixed on the way (`markedByName`, `author.name`, comment
`name`, timetable `instructor`).

**The Saturday plan.** `Mp15Agenda` replaces the static list: the window is the
formation schedule's breakout block (`mp_breakout_window`), huddle first and
close last (server-normalised), five-minute timing, rename/describe, own
activities, reorder, reset, one-to-ones picked on the screen (max 6) with a
time each, autosave said out loud, and the share to the lead carries the
running order. `member_mp_saturday_plan` validates the whole plan first.

**The ID Card Studio assistant** (from a real conversation that went wrong):
names in the request are read by the rules too (two words or more); a named
person kept off by the plan's filter is named with the reason and a one-tap
"put them on too" (`kindOf`), never "not found"; "X should be NGG" picks one
record (`kindOf`) instead of filtering everyone; "exclude summer" is
`notKinds`, not "Summer only"; a name nobody has suggests the closest; the
count says why it is short of the names. Acts can be several (`acts`), and
include `improvePhotos` (the Improve dialog preset, e.g. plain background)
and `adjustPhoto` (the framing tool); photo requests are scoped to the plan,
not everyone waiting. "Gemini?"/"use Claude"/"which AI?"/"use the rules" are
answered locally and sent as `provider`; `ai_run` takes a preference and a
time budget (22s) so a slow provider falls back to the rules instead of the
browser timing out (the likely cause of the old "check your connection").
📎 uploads photos, matched by file name (ID or name), saved through
`admin.photo.replace` with a verdict each. An unreadable request no longer
re-applies the plan on screen. Unit test: `tests/ids-ask-select.test.js`.

**Curriculum map.** `StaffCurriculumMap` (components.jsx) is the one staff
view in the mentor class tools, the classic panel and the instructor portal
(which had a hard-coded "of 12 students"): course → year → term → week, the
week the Club is on, due dates, average score and who is behind
(`staff_curriculum` returns `weekNow`, `due`, `stats.behind[Names]`,
`avgScore`).

**Growth.** `mp_growth($id, 'mentor'|'family')`: twelve Saturdays against the
ones the centre met, the Leadership Index by month with the skills that moved,
evaluations and the criteria that moved, courage, goal, lessons, school, and
plain sentences with the conversation each suggests. Mentor: the profile's
Growth tab and the Pod growth table (`member_mp_growth_pod`, grouped queries).
Family: a Growth screen (`family_ward.growth`, no wellbeing data).

## 2026-10-21 — Security: `_mint.php` removed (a super-admin session for anyone)

`_mint.php` was a dev helper at the repo root. A GET to it read `api/config.php`,
took the first `super_admin` row and printed `session_issue($row, true)` — a
signed cookie with `adminOk = true`: no password, no TOTP. `build.js` never
copied it into `dist/`, but a deploy made by uploading the repo root (or a zip
of it) put it on the web.

- Deleted. Nothing referenced it.
- The root `.htaccess` now refuses any `.php` at the document root
  (`RewriteRule ^[^/]+\.php$ - [F,L]`), placed before the real-file pass that
  would otherwise serve it — the same rule `api/.htaccess` already had for
  `/api/`. Relative, so it holds in a subfolder too.
- `api/tools/check-cloudinary.php` was the one tool without a CLI guard; it
  has one now.
- PHP suite, "no back door": the only root PHP is `_router.php`; the root
  deny exists and precedes the real-file pass; `session_issue(` is called only
  under `api/auth`, `api/admin` and `api/_lib`; every `api/tools` script
  refuses a web request. Proven red with the file restored (2 failures naming
  `_mint.php`), green without (4925/0).

**On any host that ever had the repo root uploaded:** delete `_mint.php` from
the server, rotate `cookie_secret` in `api/config.php` (every session signs
out — that is the point: a minted cookie stays valid until it expires), and
search the access logs for `_mint.php`.

## 2026-10-21 — Request history: a decided request can be found again

The owner got `member.request.raised` webhooks for three ₦18,000 claims and
could not find them in `/control`. Reproduced on a throwaway database: the
claims do show in Inbox → Member requests while open — but the Inbox lists
**open** requests only, and nothing else in `/control` showed a request once it
was approved, declined or withdrawn. The REQ- id in an alert led nowhere.

- `admin_requests_list` (domain/member-self.php): `status` = open (default —
  the Inbox is unchanged) | a decided status | `all`; `q` over request id,
  member id, name, display id, subject and payment reference (LIKE wildcards
  escaped with `!`, which MySQL accepts in a literal where `\` is not);
  `memberId`; `sort` allow-listed (newest | oldest | decided | amount, unknown
  → newest); `offset` + `pageSize` (≤ 100) with the true `total`;
  `decidedByName` and `ledgerEntryId` per row, one lookup per page.
- **Centre scope was missing** from both the list and the decision: a scoped
  admin saw, counted and could decide every centre's requests. Both are
  scoped now, in the query and per row (`out_of_scope`).
- `/control`: **Members → Request history** (`request-log`, cap `people`) — a
  server table with search, Status / Kind / Sort filters and a drawer (what
  they wrote, the reply, who decided, the ledger entry, the receipt). The URL
  tail is the search, so `/control/members/request-log/REQ-…` opens on one.
  ⌘K: a `REQ-` id lists matching requests under "Requests". The member record
  has a **Requests** part. The Inbox search matches a request id.
- Tests: 11 in the PHP suite next to the desk tests (history, id/reference
  search, literal wildcards, member filter, paging total, sort fallback,
  scope for list and decide); `tests/request-history.test.js` (19, in
  `test:all` and `npm run test:reqhist`) drives it in Chromium: raise through
  the member route, decide through the admin route, then find each one by id,
  reference, filter, deep link, ⌘K, the member record and the Inbox search.

## 2026-10-21 — Projects and activities (rebuilt; the first build was lost)

The previous session wrote this and lost it uncommitted when its container
was reclaimed; only `projects.php` survived, pasted into the next session.
Rebuilt from that paste, and finished:

- **Migration 166** (`projects`, `project_people`), mirrored to MySQL;
  `NGG_SCHEMA_TARGET` 166. `domain/projects.php` in the bootstrap list.
- Ops `member.mentor.projects` / `.project.save` / `.project.mark` (mentor
  portal `?view=projects`, actions `projectSave` / `projectMark`), and
  `member.projects` / `member.project.mark` (`api/member/projects.php`; the
  memberId is the session's). Save and mark are in
  `ACADEMY_GATED_MENTOR_OPS`.
- Fixed from the paste: a coordinator's mentors are the centres they cover
  (`mp_team_rows` with no `centres` returned every mentor in the programme);
  no child reaches an unscreened lead (`mp_screened`); a child's alert never
  falls back to an adult's full name; the child's To do points at
  `/member/community` (a real route; `/member/projects` was not); the member
  view takes the suite's `today` as `mp_today()` does.
- **My role**: the commitment row is `mp_projects_month()` — "None assigned",
  "1 of 2 done · next finishes 20 Oct", or a warning with "N past the finish
  date" and an *Open projects* button (the portal's design shows a button on
  rows that need attention only).
- **Mentor portal**: *My role → Projects* (`Mp15Projects`, `.mpj-*` in
  styles-app.css): set / edit / finish / cancel, groups, a searchable picker
  (mentees first), per-person part select for the setter, mark-my-part for a
  mentor on it.
- **Member portal**: *Community* opens with "Your projects" (the design file
  `member-portal-v9.dc.html`, recompiled with tools/dc-compile.js;
  `assignedVals()` in mp9-more.jsx): group, countdown and time-gone bar,
  groupmates by first name and adults by title, mark my part done with a
  note, an honest error with retry. Today lists a project finishing within a
  week (`member_project_todos` in `member_today`).
- Tests: PHP suite +26 (countdown, reach per role, all-or-nothing refusals,
  groups, what a child is shown, marking rules, the commitment row, Today,
  editing keeps finished parts, closing, the Academy gate, one audit per
  save); `tests/projects.test.js` (24, in `test:all`, `npm run test:projects`)
  drives lead → child → mentor → lead in Chromium.

## 2026-10-21 — AI: automatic routing, and a monthly limit on paid models

The owner: no provider choice for the operator; free models do the bulk, paid
ones (Claude, OpenAI) only the hard thinking, and only under a spend limit set
in Settings.

- `ai_profile_chain()` is the configured chain (profile → fallback → flat
  block, the old `ai_profile_candidates` body); `ai_profile_candidates()` is
  that chain through `ai_route()`. Every caller and the status table get the
  routed answer. Jobs: `AI_BRAIN_PROFILES` (marking, insight_answer/synth and
  the four lenses) are hard thinking; everything else is everyday. Tiers:
  anthropic/openai paid, OpenRouter paid unless the model ends `:free`,
  Groq/Gemini free.
- Everyday → free only (paid only with `ai_routing.paidEveryday` and the limit
  open, when no free model exists). Hard thinking → paid first, then free;
  paid dropped once the month's spend reaches the limit. Unset/0 limit = paid
  off — **a deployment that relied on a Claude key for marking needs a limit
  set in Settings → API keys → AI spending.**
- `ai_run()` prices each paid call before making it (input estimated at four
  characters a token, output at the call's full allowance) and skips it if it
  could cross the limit (logged as `ai_limit_reached`, cost 0). Every call is
  logged to `ai_usage` (migration 167) with real token counts where the
  provider returns them (Anthropic usage, OpenAI-shaped usage, Gemini
  usageMetadata; OpenRouter is asked for `usage.include` and its reported cost
  is used). `$GLOBALS['__ai_call_mock']` is the per-candidate test seam.
- Prices: `AI_PRICES` (USD/MTok by longest model prefix; Claude from the
  current model table), unknown paid models priced high on purpose
  (`AI_PRICE_UNKNOWN_PAID`), overrides in Settings.
- Claude requests fixed for current models (Opus/Sonnet 4.6+, every 5.x):
  no `temperature` (they 400 on it), an `output_config.effort` by job
  (high for hard thinking, low otherwise), `max_tokens` at least 4096 so
  always-on thinking cannot starve the text, `stop_reason: refusal` is a
  failure so the chain moves on. Default Claude model `claude-opus-5-5`.
- The `prefer` argument (the ID assistant's "use Gemini") still reorders
  within what the job may use and cannot add a paid model; the assistant no
  longer advertises choosing an AI, and says "Read by the AI".
- Settings → API keys: *AI spending* (`CrSyAiSpend`, `admin.ai.routing.set`,
  limit ≤ `AI_LIMIT_MAX_USD` 2000, audited) and a *Kind of work* column.
- Tests: PHP suite +20 routing checks (and the old provider tests read the
  unrouted chain; marking/assignment tests set a limit; study-helper tests
  carry a free key); `tests/ai-spend-ui.test.js` (11) in `test:all`.

## 2026-10-21 — Clearing dues a member does not owe (imported members)

Imported NGG members carried years of membership and dues from an old join
date — money paid before this system existed. A waiver alone did not hold:
the next accrual recharged nothing it already had, but nothing told it those
periods were settled, and the screen offered no exact figure to waive.

- `members.feesSettledThrough` (migration 168). `fees_accrue_member` skips any
  membership period due, and any dues month, on or before it.
- `fees_settle_through($member, $date, $reason, $by)` — the one
  implementation: allocates payments/waivers to the oldest real charges first
  (`fees_unpaid_through`), waives exactly what is still unpaid on membership
  and dues up to the date (fines and training untouched), with periodKey
  `settle:<date>` so it cannot clear twice; moves the date forward only;
  audits `fees.settle` on the member. `unchanged` when nothing to do.
- `admin.fees.settle` (one member, `fees` cap, scope gate) and the member
  desk's bulk op action `feesSettled` (`fees` cap, payload validated once by
  `fees_settle_validate`, delegates per row, per-row `cleared`, run total,
  one `admin.members.bulk` event). Control Room: Roster bulk "Clear dues they
  don't own" and the record's Fees part.
- Tests: PHP suite +12; `tests/fees-settle-ui.test.js` (8) in `test:all`.

## Member portal P0s from the audit: password, sign-out, feedback, mentor reach (2026-10-22)

- **Messaging a mentor said "you don't have one"** for mentors whose `mentors`
  row has no `memberId` (volunteer-only or email-only). `mp_mentor_principal()`
  resolves the mentor's sign-in (memberId, else volunteerId, else a unique
  member or volunteer by email); `mp_chat_mentor()` uses it. A message is
  always stored; the push goes only to a principal, and a mentor with none is
  recorded as `ops_record('warn', 'mentor.no_signin')` for staff to fix. The
  wellbeing alert job uses the same resolver.
- **Password.** The profile sheet sent `current: ""`, so every member who had a
  password was refused. It now asks for the current password when the
  security read says `hasPassword` (the sheet loads it itself), and offers
  "Forgot it? Email me a code": `auth.resetRequest` + `auth.resetConfirm`
  keyed by the record's memberId, inside the portal.
- **Sign out.** None of the member, mentor or instructor portals had one.
  `nggPortalSignOut(fn)` (auth.jsx) calls the app's `auth.signOut` passed in as
  `onSignOut` (it clears shared-machine drafts), else the bare logout. Sidebar
  icon in all three; the member portal's phone header gained an initials
  button to **More** (the phone tab bar had no route there at all); mentor and
  instructor More screens carry it; the palette has "Sign out". The mentor
  sidebar's hard-coded `NGG-M-0142` is now the mentor's own id.
- **Feedback** is request kind `feedback` (`member_feedback_create`, migration
  169: `topic`, `centre`, `passedAt`). Own cap (`MEMBER_FEEDBACK_OPEN_MAX` 6),
  so ideas no longer fill the `help` cap; minimum 6 characters, matched on the
  client. Anonymous = `memberId ''` + centre, from a signed-in session (so the
  per-member rate limit holds), never the public contact form (which needed
  an email and failed with `missing_field:email`). Desk answers via
  `admin_feedback_answer`: `thank` (closes, notifies unless anonymous) or
  `pass` (centre leads of that centre, stays open, `already_passed`,
  `no_centre_lead`); approve/decline is refused (`bad_answer`). The list
  scopes anonymous rows by their own centre. "Makes me uncomfortable" left the
  idea chips for a link to Help.
- **mp9Err** never shows a raw code: a server sentence (detail with spaces)
  wins, then the known-code map, else "That didn't work. Try again."
- Tests: PHP +16 (5014); `tests/portal-account.test.js` (22) in `test:all`.

## Follow-up: "no mentor" with a mentor, password reach, experience feedback (2026-10-22)

- **"You don't have a mentor" for children who have one.** The message box
  sent through `this._chatSend`, a closure built while rendering the Mentor
  screen that captured `mentorInfo().has` at that moment. Rendered before
  chat/mine/today had loaded, or used from a screen that did not re-render it,
  it refused with the stale "no mentor". Replaced by one method,
  `Mp9Portal.sendToMentor()`, used by every send (message box, opportunity
  "ask", Leadership Index focus); the server decides. Server side,
  `mp_chat_mentor()` was an inner JOIN on `mentors` while `member.mentor.mine`
  and the record are LEFT JOINs: now a LEFT JOIN too, resolving the pairing's
  id as the mentor's own member/volunteer account when the mentors row is gone.
- **Password "has to log out".** The form was at the bottom of the long Edit
  profile sheet, reachable only by searching, so people used Forgot password
  at sign-in. It is now its own sheet (`k: "password"`), opened from Me →
  Sign-in and password, Edit profile and the palette; it closes on success and
  the session stays.
- **Feedback covers experience.** Topics `experience` (1–5 rating,
  `MEMBER_FEEDBACK_RATINGS`, migration 170 `rating`; words optional) and `app`
  join idea/change/love. A 1–2 rating is titled to the desk as somebody to
  talk to. Inbox shows "How it's going".
- Tests: PHP 5018/0; `tests/portal-account.test.js` 26/0.

## Messages, profile, one journal, voice and read-aloud (2026-10-22)

- **Messages.** Quick replies fill the input; "I need help" opens Help;
  `pollChat()` refetches `member.chat` every `MP9_CHAT_POLL_MS` (30s) while the
  Mentor screen is visible and on `visibilitychange`/focus; own messages show
  Sent/Seen from `read`; replies to check-ins/journal entries carry a label;
  timestamps at #5f5f66; 44px chips; a counter near the 1200 limit; honest
  quiet-hours and safeguarding copy (the "AI checks them" line was not true
  with AI off).
- **Profile.** Me lists the whole record (`member_today.profile` gained
  level, gender, bio, intakeYear). The dead School/Class inputs in Edit
  profile (no handler) became read-only text with "Ask for a change".
- **One journal.** `journal_mine_save` takes `new` (always a fresh row, never
  the day's upsert — the app writes several a day; without it the portal's
  quick line would have been overwritten). The Anchor Journal app now writes
  through it (`journalWrite`), with a share switch, numeric mood (`MOOD_NUM`,
  `moodKey` for display) and voice media; a first share notifies the mentor.
  `anchor_journal_list` returns visibility, title, media and the mentor's
  replies (one grouped query; quiet-hours replies held back). `member.chat`
  carries `entryId` for journal replies. Portal Journal screen: prompt, same-tab
  Write (`/journal/?write=1` opens the writer), entries with replies.
  `member_dashboard` read the mentor only from the current session's pairing,
  so the journal hid sharing from matched members; it now uses the active
  pairing and adds `displayName` (Coach Eke).
- **Voice notes.** Migration 171 `mentor_messages.mediaJson`; chat send
  accepts one audio clip (`media`), its body "Voice note (m:ss)" when there are
  no words; mentor inbox and member chat return `media` (`mp_media`). Recorder
  at 24 kbps Opus. `journal_media_clean` allows audio and own-site paths, and
  `journal_mine`'s voice count read `kind` instead of `type`.
- **Read aloud** (`Mp9Portal.speak`, en-NG voice when present): mentor
  messages, journal prompt, lesson; journal app prompt and entries. The lesson
  body was a 140px box of 12px grey monospace; it is now 16px readable text.
- **Sidebar.** "Your apps" group: Anchor Journal, Community (same tab).
- Tests: PHP 5024/0; portal-account 45/0; member-v9 simple-view check now
  expects five tiles (My journal added).

## Getting started, supporting mentors (2026-10-22)

- **Getting started** (`startSteps`/`startCard` in mp9-more.jsx): photo,
  hello to the mentor, first reflection, this week's check-in, a linked
  guardian — each derived from loaded data (dash, chat, jm, today, circle);
  gone when all done; hideable (`mp9.startHidden`, added to MP9_STATE_KEYS).
  The all-caught-up hero offers the next step instead of "Practise something".
  Help gained "Take the tour again" and "Show Getting started".
- **Supporting mentors** (`domain/mentor-supports.php`, migration 172
  `mentor_supports`, op `admin.mentor.support`, route
  `api/admin/mentor-support.php`). Deliberately a separate table: the 47 reads
  of `mentor_assignments` all mean "the mentor", so the primary stays there
  untouched and a supporter can never be read as it. `MS_SUPPORT_MAX` 2; needs a
  primary; never the primary; never a peer-rank mentor; focus required; end
  date ≤ a year, effective at read time. Supporters: `mp_can_message` allows
  the child; the inbox includes the child's `chat:` thread (kind says "you
  support them with …"); `mp_caseload_ids` unchanged, so no wellbeing, scores
  or family. `admin_assign_mentor` ends a support link for the new primary.
  Member chat payload `supporting`; Control Room record lists, adds and ends.
  The design follows the audit's research (MENTOR Elements of Effective
  Practice; Raposa et al. 2019; second-adult messaging).
- Tests: PHP 5038/0 (+14 supports); portal-account 49/0.

## Accessibility pass (2026-10-22)

- `tests/a11y.test.js` runs axe-core (dev dependency only, pinned 4.10.3) for
  WCAG 2.1 A/AA on 18 screens: the member portal (wide, phone, simple view,
  feedback and password sheets), the Anchor Journal (home, writer), the mentor
  portal and the instructor portal. It fails on any violation at any impact,
  fails a screen that never drew, and proves itself by catching a planted
  image with no alt. Result: 0 violations.
- What axe does not measure was swept by hand: no icon-only button without a
  label in the three portal designs; 42 buttons under 40px (search, nav,
  steppers, Undo, Retry, chips) raised to 44px, and three CSS controls
  (`.m15x-err button`, `.m15x-back`, `.mpj-chip button`). Earlier in the day:
  the lesson text (12px grey monospace in a 140px box → 16px readable),
  timestamps 3.26:1 → #5f5f66, quick replies 36 → 44px, audio players with
  real controls, every new control labelled with aria-pressed where it toggles.

## Cloudinary credits, phase 1 (2026-10-22)

From the research in this session (Cloudinary bills each derived copy; the
chain in an edited URL re-runs inside every copy built on it):

- `photo_materialise($url)`: a Cloudinary URL with a transformation chain is
  uploaded once (Cloudinary fetches the edited image) and replaced by the plain
  result. Called from `photo_apply_to_subject` (review approve, pipeline
  auto-approve, single and bulk edits). Failure keeps the edit URL and records
  `ops: photo.materialise`. Setting `photo_materialise = 0` switches it off.
  `cloudinary_upload_signed()` is the one signed upload (adopt uses it).
- Assets: the asset's `editedUrl` is pointed at the plain image BEFORE the
  record changes, so `photo_supersede` keeps the original upload (it never
  deletes what a live asset uses); a record edited with no asset gets one
  (`photo_asset_record`) holding the original and the chain. `photo_edit_subject`
  uses the latest asset only while it IS the record's photo, and treats the
  same transforms as `unchanged` (a re-run no longer re-edits and re-uploads).
- `admin.photos.materialise` (settings cap; dryRun counts) converts records
  still showing a chain, 50 a press; Control Room → System → "Store edited
  photos…". `admin_media_purge_derived` refuses with `chained_photos` while any
  record shows `e_background_removal` (`force` only from code).
- `card-photo.jsx`: card art `f_jpg` instead of `f_auto` (one derivative per
  size). `page-club.jsx cmOpt`: widths snapped to 128/320/640/1280, appended
  after any chain, videos delivered as exactly `CM_VIDEO_TF` = upload-sign's
  eager string (pinned by a PHP test).
- Not done, on purpose: headshot SHA-256 de-duplication (public route; would
  reveal whether a photo exists). Phase 2 (in-browser MODNet cut-out with a
  quality gate, Cloudinary only as the operator's paid fallback) is next.
- Tests: PHP 5048/0 (+9 credits); card-photo 45/0.

## Messages as a messaging screen; tab rows scroll (2026-10-22)

- "It feels small": the chat was a card at the bottom of a long page under
  the mentor card. The chat tab is now `.m9c` (styles-app.css): a full-height
  conversation (`--m9c-h`, measured by `Mp9Portal.chatFit` from its top to the
  bottom bar) with its own scrolling log (`role=log`), day separators
  (`mp9DayLabel`), runs grouped by sender within 10 minutes (initials and time
  once), bubble corners by position, a growing textarea composer, and a 300px
  side panel. The column widens to 1180px on that tab (`colW`). The side panel
  is a flex child so the container query can drop it below 820px of its own
  width (a query cannot restyle its own container's grid — that broke the
  first attempt on phones). Narrow: one-line next session, short safety line.
- Tab rows scroll horizontally instead of wrapping (owner's request): the
  member Mentor/Companion tablists and mentor-portal Saturday tablist become
  `.tabscroll` flex rows; the area pills in all three portals and
  `.admin-anchor-tabs/.wis-tabs/.mr-tabs/.asd-tabs` go nowrap + overflow-x.
  `mp9MarkRow` sets `data-more` for an edge fade while more is off-screen; the
  selected tab is scrolled into view. The earlier 2×2 mentor-tab rule is gone.

### Messages on a phone: less clutter (stopped mid-batch at the user's request)

- The next-session strip is now one quiet row (a button that opens Sessions): "Next session · in 1d 19h" over the date, with a "Prepare ›" link. The solid black Prepare button went: Send is the only solid action on the screen.
- Quick replies only show while there is something to answer: the last message is not the child's own, nothing is typed, and no voice note is being made. A quick reply now focuses the composer again (it targeted an `<input>` the textarea replaced).
- On phones the chat header is smaller (40px avatar, 17px name), and the footnote is one line: "Checked for safety. Something wrong? Tell us".
- `tests/a11y.test.js`: the phone Mentor check waits for the composer, not a "Messages" heading phones don't draw.
- **Left open:** the a11y run was stopped before it finished. The last full run reported `aria-prohibited-attr` ×1 on Member · Community. The node is not yet identified.
- The known `instructor-v6` "Curriculum … week 3" failure is pre-existing.

### Community: the post box follows you down; one navigation on a phone

- **Post box.** The full box stays where it was, at the top of the feed. When it scrolls out of view, a slim pill slides up at the bottom: avatar, prompt and a pencil button. On a phone it sits just above the tab bar. Pressing it opens the same full composer.
  - Driven by `Cm3App.watchPrompt`, a capture-phase scroll listener that measures against the scroller's own top edge. An IntersectionObserver missed a jump straight past the box.
  - While hidden, the pill is `aria-hidden` and `tabIndex -1`.
  - The phone's floating New post button hides while the pill shows, so there is one, not two.
- **Double navigation on phones.** A signed-in phone showed the site header *and* the Community's own header, each with a menu. Below 760px, `body[data-page="community"]:has(.cm3-app)` now hides the site `.topnav` and `.footer`.
  - The Community menu gains "My NGG" and "NGG website" links (`.cm3-out`), so the way out is kept.
  - The signed-out public page keeps the site chrome. Desktop never showed the site header here.
- `tests/community-v3.test.js` adds checks for both, on desktop and phone (49/0).

### Cloudinary multi-account failover (handoff item)

- **Keys.** The backup's keys are `cloudinary.backup.{cloud_name,api_key,api_secret}`, entered in Settings → API keys (`SERVICE_KEYS['cloudinary_backup']`, with its own key test).
- **Which account is live.** That is the setting `cloudinary_active` (`primary` | `backup`). `cloudinary_account_apply()` (media-storage.php) lays the live account's three keys over `$CONFIG['cloudinary']`, so every caller reaches the right account unchanged.
  - The main account's own config is kept in `$GLOBALS['CLOUDINARY_PRIMARY']`.
  - `service_keys_apply()` undoes the swap before re-laying the keys and redoes it after.
- **Switching.**
  - `media_usage_refresh` switches to the backup once the main account reaches `high`.
  - While on the backup, it probes the main account (`cloudinary_with_account`) and switches back once that is below `high`.
  - `cloudinary_upload_signed` fails over immediately on HTTP 420/429 or a limit/quota/credit refusal, and retries once on the backup.
  - Each switch sends one email, one ops record and one audit event (`media.storage.switch`).
- **Editing old photos.** `cloudinary_adopt` copies a photo still on the spent main account into the backup before editing it there.
- **Tests.** 13 checks in `api/tests/run.php`. `__cld_upload_http` is a new test seam for the upload's HTTP exchange.
- **No duplicate copies.** A photo copied off the spent account is uploaded under a fixed name (`copy_<md5 of its base URL>`, `overwrite=false`), so editing it again returns the copy already there instead of storing a second one. The main account's original stays, so existing links keep working, and it costs nothing new there.
- **Upload preset.** The main account's unsigned upload preset is never carried to the backup, because it doesn't exist there. The backup can name its own (`cloudinary.backup.unsigned_preset`, optional). Without one, application-form photos go to the site's own store while the backup is in use.

## No !important; Cloudinary accounts that actually fail over; tours per device; Community links and documents; a sharper studio assistant (2026-10-22)

This closes `HANDOFF-NEXT-AGENT.md` (deleted with this entry). Its items 3–6
were done earlier the same day; this records 1, 2, 4 finished, and what the
owner reported while it ran.

### No `!important` anywhere
- `tests/no-important.test.js` (in `test:all`, `npm run test:noimportant`) fails the build on any `!important` in source CSS, JSX, HTML or the journal. `dc-compile` strips it from generated CSS.
- Where one was holding a rule up, the rule now wins by specificity (`:not(#_):not(#_)`), never by `!important`.
- The value-keyed phone layer (`[style*="font-size: 56px"]` and the like) is gone. Inline values read a responsive variable instead: `var(--rs-…, desktop value)`, with phone and tablet values set in `styles.css`. Reduced motion is `--motion` (0 or 1) multiplying inline durations.
- **Reviewed against the old build, page by page and width by width.** The only lasting differences are places where the page now gets what its own markup asks for and the old blanket rules overrode. Every `.display` element at phone width was forced to 42.9px, including a member's name in a list. Sections with an inline `padding-top` now honour it. Print differs on purpose. Two apparent changes (`/join`'s faded dot, the `/centres` button) were the diff tool pairing the wrong elements; measured directly, they are unchanged.

### Cloudinary: several accounts, and the backup is really used
- **Accounts.** Accounts are one ordered list (`media_accounts()`): the main account, then the backup from Settings → API keys, then any added in Control Room → System → image storage. Added accounts' secrets are sealed (`ai_ui_seal`). Uploads go to the first account below `high`, else the first below `critical`.
- **The fault the owner reported ("not using the backup's credits").** Most uploads go from the browser straight to Cloudinary, so when the main plan refused one, the server never heard. It kept signing for the main account until the 6-hourly reading, which never comes on a host whose web-cron does not fire.
  - Now `uploadFile` (api-client.js) treats a refusal that reads as a spent plan (420/429, or words about limits) differently. It asks for a fresh signature carrying what Cloudinary said, and retries that one upload once if the server signs for another cloud.
  - `media_upload_refused()` never takes the browser's word for it. It re-reads the account and, if that is not conclusive, makes a one-pixel signed upload with its own keys (deleted when it lands). It fails over only on a confirmed refusal, and checks at most once per account every 2 minutes (`MEDIA_REFUSAL_GAP`).
  - `media_before_sign()` takes an overdue usage reading when an upload is signed. Both signers use it (member and public headshot).
- **Tests.** `tests/media-failover.test.js` uses real PHP and Chromium, with Cloudinary's endpoints intercepted. It checks the backup's signature against the backup's own secret. 13 PHP checks cover the refusal path.
- **Merge note.** The merge with the other session (`007be5b`) dropped the tour's CSS block (`.ngt-spot`, `.ngt-shot`, the lit scrim, `.is-kid`), which is why the spotlight drew nowhere. It is restored. `bootstrap.php`'s second `media_activate()` was a duplicate of the one at the end of `service_keys_apply()`, and staying removed is correct.

### Tours per device (`src/modules/guide/guide.jsx`)
- **Device.** `guideDevice()` gives the kind (phone, tablet or desktop), the OS and whether NGG is installed. Steps carry `only`, `spot`, `shot` and `dev`.
- **What gets shown.** A first visit gets the full tour. Someone who has done it, arriving on a new kind of device, gets the short "New here on a computer" tour of what differs; `onboard.<portal>.devices` records which kinds they have seen. Children's tours read bigger (`tour.kid`).
- **The spotlight.** `GuideSpot` rings the real control and follows it every animation frame, re-rendering only when it moves. A ring measured once was left where the control had been while the page settled.
- **Screenshots.** `tools/guide-shots.js` takes the shots from the real portals at phone and computer size into `assets/guide/`, listed in `shots.json`. A step shows its screenshot when its control is not on the current screen. Re-run it after a portal's layout changes; it takes about a minute a shot, because the dev page compiles in the browser.
- **One dialog at a time.** The duty reminder used the same button classes and stacked under a tour opened from Help, swallowing its clicks. The tour now announces itself (`ngg:tour`), and the reminder waits behind it.

### Community
- **Link cards.** A post's link attachment was a `div` with no handler, so it did nothing when tapped ("the community post link does not work"). It is a real `<a target=_blank rel=noopener>` now, http(s) only (`cm3SafeUrl`).
- **Documents.**
  - The viewer used to fetch the stored URL from the browser. Cloudinary refuses PDF delivery on restricted accounts, and a bucket sends no CORS headers, so the viewer showed "This document can't be shown here".
  - `community.doc` + `api/member/community-doc.php` now serve the file from this origin, under the same visibility rule as `community.media`. The file is fetched only from our storage: a signed Cloudinary download on one of our accounts, or the bucket's signed GET. Any other URL is refused as `not_ours` and never fetched; the stored URL is member-supplied.
  - The error state has a working Download button.
- **The stray blue circle on cards.** It was the cursor follower (a gold ring under `mix-blend-mode: difference`), which is removed.

### The ID Card Studio assistant: "needs upgrade"
- **How the gaps were found.** A probe of realistic requests through the rules (which always run, and are all there is when no AI answers) found ten misreadings. All are fixed in the rules, the AI's instructions and `idsPlanSelect`.
- **New plan fields:**
  - `centres`: several centres at once.
  - `numPrefix`: "026-001 to 026-040" is that year's block, not two people.
  - `latest`: "the last 20 who joined".
  - `hasPhoto`: "without a photo", "only the ones with photos".
- **Phrasings now read:**
  - "except those already printed" and "who still needs a card" mean the people still waiting.
  - "Volunteers and members together" means both lists; "one sheet per centre" breaks sheets by centre; "print the backs too" turns backs on.
  - "Ada Okafor's" is Ada Okafor; "at Yaba" is Yaba Hub; a two-word centre is never read as a person.
- **Not done.** The studio's "everyday" AI tier still starts with Groq's 8B model. Moving it to a stronger, paid model would spend money, so it is left for the owner to decide (Settings → AI routing).

### Re-runs, and what they found (2026-10-23)
- **Instructor curriculum.** The "known pre-existing" `instructor-v6` curriculum failure was a real defect. The design hard-coded "of 12 students finished" next to a *percentage*, so every lesson read "0 of 12" whatever the class. The controller now gives `doneLine` from the lesson's own audience.
- **Family portal on a phone.** Emails & connection (email settings, Telegram, unlinking) was reachable only from the sidebar, which phones hide; it is in the account menu now. The test's sign-in seed used the UTC date while the app's day is Lagos's, so it failed between 23:00 and midnight UTC.
- **Mentor portal.** Its two `window.confirm()` calls are `dialog.confirm`, and the Club directory's count uses `fmtNum`. Both were caught by `build.test.js`.
- **Test files.** `control-room.test.js` did not run at all: a duplicate `const` in the accounts check added this batch. That is fixed.
- **`a11y.test.js`** needs `axe-core`, which is declared in `package.json` but was missing from this container's `node_modules`; run `npm install`. The `aria-prohibited-attr` left open above no longer appears.
- **Results, each run on its own:**

  | Suite | Result |
  |---|---|
  | PHP | 5124/0 |
  | build | 31/0 |
  | no-important | pass |
  | guide | 18/0 |
  | media-failover | 11/0 |
  | community-v3 | 56/0 |
  | ids-ask | 78/0 |
  | ids-ask-select | 33/0 |
  | control-room | 43/0 |
  | instructor-v6 | 25/0 |
  | family-ui | 34/0 |
  | curriculum-ui | 35/0 |
  | member-v9 | 37/0 |
  | mentor-v15 | 66/0 |
  | ui-smoke | 661/0 |
  | a11y | 19/0 |
  | ids-core | 51/0 |
  | cr-core | 74/0 |
  | timetable-core | 62/0 |
  | route-registry | 60/0 |
- **Follow-up ("it still uses the default account's credits").**
  - Why it happened: the switch only fired at `high` (85%), and only at the six-hourly check.
  - It now fires at `warn` (70%), and failback happens under 70%.
  - A passing backup key test runs `media_usage_refresh(true)` at once.
  - New op `admin.media.account` (`backup` | `primary` | `auto`, settings cap) sets `cloudinary_pin`. A pin overrides both the monitor and the upload-refusal failover until it is cleared.
  - Diagnostics → Image storage shows the account in use and the switch button.
  - Still unavoidable: bandwidth for photos already delivered from the main account.

### Merge: the other session's several-accounts Cloudinary, plus 70% and a manual choice

- **What was merged.** The other session replaced the single backup with `media_accounts()`: up to 8 accounts in order, browser-upload refusals reported back and confirmed by the server, a per-account check, and move up/down, pause and remove. That is the base now; my single-backup code is gone.
- **Ported onto it:**
  - `media_pick_id()` hands over from `warn` (70%), then `high`, then `critical`.
  - `cloudinary_pin` names an account chosen in the account drawer ("Use for new uploads now" / "Back to automatic", op `admin.media.account`, settings cap). It is honoured until that account is full.
  - A passing backup key test reads usage at once.
- **Tests:** 10 more checks in `api/tests/run.php`.
- **Follow-up ("the main account was over 200% and it still didn't work").** Two causes.
  1. `media_usage_refresh_one` kept the last reading whenever `/usage` itself was refused. A stopped account answers 401/403/400 with "disabled"/"limit", so the last reading — possibly *ok* — was kept and uploads stayed on it. Such a refusal (matched by `media_refusal_is_quota`) is now `critical`.
  2. Photos already on the spent account kept spending it on every view. New op `admin.photos.relocate` (settings cap; dryRun; 40 a press; fixed `moved_<md5>` name with overwrite off, so no duplicates) copies record photos off accounts at `warn` or above to the live account. It updates `photo_assets` first, then the record, as materialise does. Wired to Diagnostics → Image storage → **Move photos…**.
  - Tests: 9 more PHP checks and 1 Control Room check.
- **Follow-up ("copy only the ones I need, when I need them").** The bulk **Move photos…** press was removed, because it would fill the new account with photos nobody uses.
  - `admin.photos.relocate` now takes `subjects` ([{type, id}], at most `PHOTO_RELOCATE_MAX` 60) and refuses an empty list.
  - It is gated per subject type by `crun_gate_for` (the permission that prints that card) and scoped per row by centre.
  - It copies only those on an account at `warn` or above, and returns `moved` [{type, id, url}].
  - The ID Card Studio calls it in `onConfirmPrint` (`movePhotos`), before photos are measured and drawn, and repoints the records it holds.
  - Editing already copies on demand (`cloudinary_adopt`).
  - The Diagnostics note now explains the behaviour; it has no button.
- **Pre-existing:** `tests/ids-studio.test.js` fails at the photo request's "Ask 2" confirm, on the code before this change as well.

## Community: functionality audit fixes

An audit of the Community found eighteen faults. Fixed:

- **Catch me up:** it lists the member's real unread posts, and each one opens. It uses AI text only when the AI call succeeds.
- **Moderation:** the author is told when their post or reply is hidden or removed (`community_moderation_told`).
- **Replies:**
  - A reply to a held post is refused unless the replier is its author or an admin.
  - Deleting the marked answer clears `answerId`.
  - Each reply has Report and Delete.
  - Hidden replies are filtered out.
  - A failed load shows an error with a retry.
- **Moderation queue:** the queue shows the media and the reports. Cases can be taken, have their severity changed, and be closed with a note.
- **Feed:**
  - A post opened from a link sits beside the feed (`opened`).
  - The feed has its own page counter and a sequence guard.
  - A new post enters only the lists it belongs in (`feedTakes`).
  - Counts and new posts refresh every 60s while the tab is visible.
  - Unsaving from Saved removes the card.
- **Homework:**
  - Notes and links are per task, and a link is added through `dialog.prompt`.
  - `seen` is on board rows, and `homeworkSeen` is sent once per task.
  - Each child gets one in-app notice from `community_post_on_published`. It is in-app only, so a class is not mailed inside a Send.
  - Late tasks say Hand in, and the opened task sorts first.
  - The board has loading and error states; a failure is never shown as "All handed in".
  - Homework is never set in Commons.
- **Search:**
  - The server answers in channels too; before, it filtered the drawn page.
  - It matches the body or the author name.
  - "Everywhere" is scoped to `cm3_my_channels`.
  - An `author` (cm3 key) filter backs "See their posts", which used to search the first name as text.
- **People tab:** reads `community.channelMembers`, which now returns `key`.
- **Typing:**
  - It pings the channel being written in: the composer's or the thread's.
  - A late answer for a channel already left is dropped.
  - A child is shown as "Ada N.".
- **Other:**
  - The offline banner no longer promises an auto-post.
  - `loadFiles` is no longer called twice.
  - Photos have alt text.
- **Tests:** 11 PHP checks added.

### PLANNED, not built: MikroTik Wi-Fi accounts, filtering and activity (agreed design, 2026-10-23)

**Facts given.** RouterOS 7+. Each centre has its own router. Hotspot sign-in today, but the best option may be chosen.

**Approach.**
- A hotspot sign-in page, backed by the router's own **User Manager** (the RADIUS server built into RouterOS 7). That gives profiles and validity dates, and allows a WPA2-Enterprise staff SSID later.
- Members sign in once with **member ID + a 6-digit Wi-Fi PIN**, and the device is remembered for 30 days (MAC cookie).
- WPA2-Enterprise is not used for members: Android's certificate prompts defeat children.
- The **router pulls from NGG**: shared hosting can neither run RADIUS nor reach a router behind NAT.

**Access is derived, never stored** (`wifi_access_for($member)`, the only place the table lives). The profile names are fixed so the router script and NGG always agree:

| Record | Access | Profile |
|---|---|---|
| active NGG member | on | `ngg-member` |
| staff, mentor, instructor | on | `ngg-staff` |
| Dormant Track | limited | `ngg-limited` |
| suspended, withdrawn, deactivated, deleted | off | removed, and its session kicked |
| Summer participant | on within their edition's dates | `ngg-summer` |
| fees owing | limited | `ngg-limited`, off by default |
| visitor | day pass | `ngg-guest` |

The table is editable in the Control Room, with these as the defaults.

**NGG side.**
- **Migration 174:**
  - `wifi_accounts`: memberId, username (the printed ID, e.g. `026-014` or `EG-26-001`), PIN sealed, pinSetAt, override with who and why;
  - `wifi_routers`: id, centre, label, key hash, lastSeenAt, osVersion, lastError, lastVersion;
  - `wifi_feed_version`;
  - `wifi_filters`: per centre and profile — mode, categories, schedule, own lists;
  - `wifi_activity_daily`: memberId, date, domain, visits, blocked, first and last seen;
  - `wifi_sessions_daily`: memberId, date, minutes, data in and out.
- **Domain:** new `domain/wifi.php`, listed in bootstrap.
  - Accounts are created at admission, import and staff creation, plus a nightly catch-up.
  - Every status, type, edition-date or role change bumps the feed version.
- **Ops:**
  - `wifi.feed`: called by the router with a per-router key, and returns only that router's centre. A plain `username;pin;profile;action` format (works on every RouterOS 7), changes since the router's last version, and a full list daily.
  - `wifi.usage`: router posts lookups and session totals.
  - `member.wifi.get` / `.reset`: PIN resets limited to 3 a day.
  - `admin.wifi.member`: people cap, centre-scoped.
  - `admin.wifi.guest`.
  - `admin.wifi.routers` / `.save` / `.rotate` / `.remove` / `.script`: settings cap.
  - `admin.wifi.filters` / `.save` / `.test`: settings cap.
  - `admin.wifi.activity`: new cap **`wifi_activity`**, granted per person and never bundled (like `fees`/`journal`), centre-scoped, **every view audited**.
- **Screens:**
  - member portal Me → Wi-Fi: username, PIN, New PIN, one-tap **Connect** (posts to the hotspot login), and why access is limited or off;
  - Control Room Settings → Wi-Fi: routers and their health, copy setup script, rotate key, the access table, filters, Test a domain, and an alert after an hour without a fetch;
  - People → member: a Wi-Fi row and **Wi-Fi activity**.

**Router side.** A per-router setup script, generated by the Control Room and safe to paste again, sets up:
- User Manager with the five profiles;
- the hotspot through User Manager: MAC-cookie 30 days, one device per member (two for staff), an NGG-branded login page;
- a scheduler every 5 minutes that fetches the feed over HTTPS (certificate checked, CA installed by the script), applies the add/set/remove lines, removes the hotspot session on removal, and stores the version;
- **on a failed fetch it keeps the current users** (fail-safe; the Control Room alerts).

**Filtering** (on the router, by DNS; no outside service):
- **Modes per centre and profile:** Off (staff), Block list (member default), Allow list.
- **Categories via `/ip dns adlist`** (7.15+): adult, gambling, malware/phishing and VPN/proxy are on and locked for under-18s. Social media, games and video are optional.
- **Own lists:** always block and always allow, matching sub-domains.
- **Allow-list packs**, each including its dependency domains: NGG, Learning, Coding, YouTube Restricted.
- **Schedules:** e.g. allow list during the Saturday session.
- **Closing the ways round it:** DNS forced to the router, DoH/DoT and known VPNs blocked, SafeSearch and YouTube Restricted enforced.
- NGG-managed entries carry the comment `ngg`, so a sync replaces only those.
- Filter config rides the same feed and its version.

**Activity.**
- What can be seen: HTTPS shows **domain names only** — no pages, searches or messages.
- The router sends DNS log lines every minute, matching device IP to hotspot user at send time. It keeps a bigger in-memory log, up to an hour when NGG is unreachable, dropping the oldest after that.
- NGG stores **daily summaries only** (no raw lookups) and drops noise domains.
- Repeated hits on flagged categories send one daily digest to the centre's safeguarding lead, through the existing safeguarding route.
- **Being open about it:** a notice on the login page and the Wi-Fi card, the admission consent, and `docs/POLICY.md`.
- **Retention:** 90 days of daily detail, then monthly totals with no domain names (NDPA 2023).

**Order of work.**
1. Tables, access rules, feed, PINs and PHP tests (the table, router key auth, centre scope, deltas, kick on suspend, Summer dates).
2. Script generator and filtering, piloted on one real router (RouterOS cannot be run in CI).
3. Portal and Control Room screens, browser tests and the guide.
4. Activity reports and alerts.
5. Roll out; then optionally day passes, the staff WPA2-Enterprise SSID and online counts.

**Known limits.**
- Mobile data and phone hotspots bypass it.
- Allow-list mode breaks sites until their dependency domains are added; the packs and Test a domain are the remedy.
- Changes take up to 5 minutes; a "sync now" button is optional.
- iOS "Rotating" private addresses defeat remember-me; the login page explains this.
- PINs sit readable on the router; they are separate from site passwords and centre-scoped.

**Open decisions (owner):**
- Wi-Fi hours per profile.
- Whether fees owing limits access.
- The pilot centre.
- Member default mode (block list recommended).
- Which optional categories to block.
- Retention (90 days proposed).
- Who holds `wifi_activity` (e.g. each centre's safeguarding lead).

### PLANNED, not built: Cloudinary as a processor, not a host (proposed 2026-10-23)

**Why the multi-account failover keeps failing.**
- Most credits are spent on **delivery**: bandwidth, plus a transformation for each new size, for every photo already on `res.cloudinary.com/<main>`. Switching which account takes uploads never touches that.
- The switching state relies on usage reads (a 6-hourly web-cron that may not fire) and on swapping keys in the global config.

**Proposal.**
1. Serve every photo from own storage: an R2 bucket via `object-store.php`, or the site's disk.
2. Use Cloudinary only for an edit: send, fetch the result once, store it plus fixed sizes made with PHP GD (128/320/640 and one print size), and repoint the record.
3. Accounts are tried in order per edit, moving to the next on a quota refusal. Remove the active-account swap, the 70% switch, the pin, `admin.photos.relocate` and the `copy_`/`moved_` names.
4. Existing photos move **on first real view**: photo URLs go through a server route that pulls the original once (no transformation), stores it and repoints the record. Only viewed photos move, each once, nothing in bulk.
5. Browser uploads go to own storage, not Cloudinary.

**Trade-offs.**
- It needs a bucket or host disk, and hosting carries the viewing traffic.
- Cloudinary's automatic format conversion is lost unless GD also writes WebP.

**Owner decisions pending:**
- Bucket or disk.
- Whether to delete from Cloudinary after a photo has moved (frees storage, but breaks old shared links).

## Search across the site; ID Card Studio keeps its work and keeps up

- **Search:** `sql_text_search($q, $cols, $phoneCols)` in `util.php` turns a search box into SQL.
  - Every word must appear in at least one column.
  - `%` and `_` are literal (`ESCAPE '!'`).
  - A phone-shaped query matches the last nine digits with punctuation stripped.
  - It backs the member, Club, Summer and registration rosters, the self-registration queue, the fees lookup, the MFA desk, and the curriculum list.
  - Each of those now searches `displayId`, the printed number.
- **Fees lookup:** the centre scope moved into the SQL. It used to filter the capped page, so a centre lead could be told nobody matched.
- **Schools:** prefix matches are chosen before the 400-row cap.
- **Client searches** use the same word-by-word rule: the command palette, the enhanced select, the application form's pickers, the public Summer page, and the Control Room's client tables.
- **The visible bug:** `crTable` swapped the whole table, search box included, for a skeleton on the keystroke after a search with no results. Focus fell to the page.
  - Only the first load shows the skeleton now (`loaded`).
  - A later failure keeps the toolbar and shows `.cr-tfail` with a retry.
- **Races:** the member list and the Summer roster use sequence guards. The Summer roster has an error state; it used to show an empty roster on an outage.
- **Command palette:** says "Searching members…" until the member lookup answers.
- **Club portal member picker:** files results under the trimmed query.
- **Test change:** "names in another order" is now found by the roster itself, so `admin.members.suggest` no longer offers it as "did you mean". That test now pins the roster.
- **ID Card Studio:**
  - The workspace (settings, filters, sheet queue, uploads) is kept in IndexedDB (`ngg-ids`/`ws`) and restored with a notice.
  - Records reload quietly: on focus or visibility (15s gap), every 60s while visible, and 1.5s after an `ngg:changed` or `storage` `ngg.changed` event.
  - `api-client.js` `announceChange()` raises those events after any successful write to `/admin/`, a member's profile, photo or account, or `/public/reshoot`. It throttles them to one every 2s.
  - It never refreshes during a print job.
  - A card printed elsewhere since it was put on the sheet raises a check with *Take off*.

- **Photo requests:** `ids_photo_send_one` records `mail_failed` when an address was on file and every mail to it failed.
  - The ask result carries `mailFailed`.
  - `idsAskSummary` says "The email couldn't be sent" and reserves "all sent" for when everything went. It used to report a failed send as "no email or guardian on file".
  - Covered by `ids-studio.test.js`, since its test host has no mail, and by one PHP check on the `__mail_fail` seam.
- **Test changes:** `ids-ask.test.js` pins that a refresh restores the sheet, and that undo returns to the count before the plan. It used to assume a refresh emptied the sheet.

## Courses are chosen, not guessed

- **Fault:** a member's course was a free-text `track`. `curriculum_member_courses` read it by words, and `nggc_division_for_track` mapped instruments to "arts", which then expanded to the whole division. So "Piano" gave Catering, Adire, Acting and Crafts; "Design" spread across two divisions; and a typo gave nothing.
- **Migration 174:**
  - `members.courses` holds a JSON list of catalogue names.
  - `photo_change_requests` is added for the photo request flow.
- **Server:**
  - `member_courses_clean` canonicalises names to the catalogue and refuses unknown ones by name (`unknown_course`), up to `MEMBER_COURSES_MAX` (8). `admin_members_upsert` keeps `track` equal to the first course.
  - A bulk `courses` action has modes `add`, `replace` and `remove`, and reports unchanged rows.
  - `nggc_division_course_list` gives the picker the live catalogue, with Chess, as `courseList` and `allCourses` on `admin.divisions.overview`.
- **Matching:**
  - Chosen courses win.
  - Without them, `member_courses_from_text` maps exact names, then `MEMBER_COURSE_WORDS` synonyms (one course each), then "music" to the music courses, then `MEMBER_DIVISION_WORDS` (TECH, MEDIA…) to that division. Anything else gives nothing.
  - A placed division with no matching words gives that division.
  - Chess is always added.
- **Rows read:** `courses` is now selected wherever the matcher runs (`curriculum_member_row` did not select it).
- **Instructor class lists and overdue-by-course:** use `member_course_sql`, an exact JSON-quoted match or, with nothing chosen, the old track. So a member's second course reaches them.
- **Coverage counts:** a member on two courses is counted in both.
- **Assignments:** one set for a division word reaches members who take any of its courses.
- **Conversion:** `member_courses_backfill_once` (hourly cron, and the roster's new `missing=courses` filter) converts precise tracks only.
- **Application conversion and Club portal enrol:** write the chosen courses.
- **Control Room:**
  - A Courses multi-chip field filtered by division. `crFieldOpts` takes `optsFor(values)`.
  - A **Set courses** bulk action.
  - A **No courses chosen** filter.

## Instructors reach their whole class; marking tells the child

- **`results_class`** (the instructor's class, behind roll, groups, analytics and school results) matched `track IN (courses)`: exact, case-sensitive, and the first course only. It now uses `member_course_sql`.
- **Scope checks:** `mentor_scope_ok` and `results_staff_can` use `member_takes_any`. It checks the chosen courses or the track, ignoring case, and reads `courses` if the row lacks it.
- **`staff_curriculum_mark`:**
  - The course check ignores case.
  - When the last pending answer is marked, the child gets one `curriculum` notification with the lesson, the percentage and the instructor's feedback.
- **The portal** reloads `curr` after a mark, so the Today, Marking and Analytics counts follow.
- **Analytics lesson rows** read `{{ u.doneOf }}` (completed/audience) and the average score. The design had a hard-coded "/12" after a percentage, and "avg" showed completed/started.
- **Tests:** `instructor-v6.test.js` checks a second-course member in the class, the analytics ratio, marking through the screen, the feedback on record and the child's notice (31 checks).
- **assign-desk.test.js** hung in its first two runs on this code: the member page reload did not mount within 180s.
  - The next five runs passed 30/0, and the previous commit passed 3 of 3.
  - It could not be reproduced afterwards. Nothing in the changed client code loops, and the server log of a passing run shows no stalled request.
  - If it recurs, capture the PHP server log (`stdio` to a file) and look for an "Accepted" with no response line.

## Photo changes are asked for, not made (2026-10-24)

- **Before:** a member's "Change photo" wrote the new photo straight onto their record, and so onto their next ID card. Nobody checked it.
- **Now:** `member_update` no longer takes `photoUrl`. A different photo becomes a `photo_change_requests` row (migration 174), holding the new photo and the old one.
  - The same photo, re-sent by a form that posts every field, is not a change.
  - Ops: `member.photo.change`, `.mine` and `.withdraw` (route `api/member/photo-change.php`); `admin.photo.changes` and `admin.photo.change.decide` (route `api/admin/photos.php`, `?view=changes` and `action: change_decide`).
- **Approving** goes through `admin_photo_replace`, so there is one replacement path, not two. **Declining** needs a note. The member is notified either way, and there is one audit event per decision.
  - Scope is checked per row (`out_of_scope`). A second pending ask marks the first `replaced`.
- **Member portal:** the profile sheet has a "Your photo" block: the photo now, the photo chosen (with a preview and a reason), the ask waiting (with Withdraw), and the last decline with its reason.
  - The classic dashboard's profile modal tells the member that the photo went to the desk.
- **Control Room:** Inbox → Photos lists photo changes beside the review queue, showing the current photo next to the requested one.
- **Unchanged:** the guardian reshoot (`reshoot_submit`) is still applied directly, because staff asked for it.
- **Tests:** 20 checks in `run.php` ("photo ask"); two older checks were updated, since a member can no longer set their own photo. `member-v9.test.js` covers the child sending an ask and an admin approving it in the Inbox.

## A Tech member still had a Media course (2026-10-24)

- **Community:** `cm3_my_channels` counted EVERY course channel as a member's when their raw track matched no channel name exactly.
  - So a member whose track was "Tech" was in Media's channels too.
  - Fix: it now reads `curriculum_member_courses`, so "Tech" means the Technology courses. With no match, a member is in the shared channels only; they can still open any channel.
- **Timetable:** `tt_for_centre` marks every course the member takes, not the old track.
  - `member_timetable` returns `courses` and the `division` of those courses, so a stale `members.division` placement no longer names Media.
  - The member portal used a regex on the first word of the track to mark "your" slots; it now uses the server's list.
- **Profile and card:** the member's profile shows their resolved courses. The member card's division comes from the first non-Chess course.
- **Tests:** "tech member" checks in `run.php` (Media channels and course resolution).

## Community threads read as a chat (server, migration 175)

- Migration 175 adds `community_comments.replyTo` and the table `community_comment_reactions` (one reaction per person per reply; added to the merge policy).
- `community.comment` takes a `replyTo` (on the same post, visible to the replier, else `quote_not_found`).
- `community.comments` returns each reply's `quote` (resolved from the thread's own rows, "removed" when the viewer can't see it), its `reactions` and `myReaction`, all in one grouped read.
- `community.comment.react` toggles a reaction like a post's. The person whose reply was quoted is notified.
- **Client (cm3-app.jsx, community-v3.dc.html):**
  - Bubbles: your own on the right; one run per author within 10 minutes.
  - Day lines (`cm3Day`), and a "new replies" line from a per-browser seen count (`cm3.seen` in localStorage).
  - Quote bar in the composer; tap a quote to jump to the original (`thJump`, a brief highlight).
  - Reaction picker per reply; swipe right to reply and long-press to react on touch (`thPointer`), each with a button too.
  - The open thread is polled every 8s on a visible tab (`loadComments(pid, true)`); a "N new" jump button appears when scrolled up.
  - Enter sends on wide screens. Escape closes the picker, then the quote, then the thread.
- **Tests:** `community-v3.test.js` 62/0, which adds the day line, the right-hand own reply, quote and Enter, the quote shown, and a reaction.

## Instructors: assess one child; a mentor who also teaches is an instructor at /instructor (2026-10-24)

- **The `/instructor/ngg` fault:** `mentor_gate` found a `mentors` row before the instructor volunteer record. A person holding both was a "mentor" to every instructor op (`forbidden_role`), and `/instructor` fell back to the old Mentor Portal.
  - `mentor_gate` now takes `as: 'instructor'`, from the op or from the `X-NGG-As` header. `NGGApi.setPortalAs('instructor')` is set while the Instructor Portal is mounted.
  - It only chooses among records the person already holds: the volunteer row linked by `volunteerId`, then by `memberId`, then by email.
  - `results_instructor_gate` and the routes in `teaching.php` pass it.
- **Second-course children:** `instructor_skills_mark` refused any child whose single track was not the course letter for letter (`not_their_course`). It now uses `member_takes_any`.
  - `remark_subject` reads `courses`, so the scope check sees every course.
  - `instructor_student` shows the course being taught (the `course` param, else the instructor's course the child takes), not the child's first track.
  - `results_member` selects `courses`, `disciplines` and `division`.
- **Assess tab** on the instructor's student page (`ip6-app.jsx` and the design): mark every skill on four levels, with evidence for a move up, in one save; a typed note (`member.remark.add`); and the child's waiting answers, linked to Marking.
- **Member check-in to the mentor:** it now says which week it is, what each promise was, whether it was kept, and why not. It used to read "FRENCH: kept it".
- **Tests:** `instructor-v6.test.js` 36/0. The main instructor now also holds a mentor record, and the suite assesses a second-course child (skills, the evidence rule, a note).

## Plans: 85% floor, realistic steps, a mentor who can act; a child's lessons for their adults (2026-10-24)

- **Targets:** `results_target_for` gives 85, or the next band (90, 95, 100) at least 5 points above the current score. `results_target_floor` refuses anything under 85 (`target_too_low`, with `min`) in `results_items_clean` and in the mentor's edits. It replaced `current + 8`, which made a child on 0 aim for 8.
- **Realistic:** `results_sessions_for` sets 3, 4 or 5 sessions a week by the size of the gap. `results_plan_items` returns `midterm` (halfway). A score of 0 is flagged.
- **When they study:** the member's plan editor picks days, time and place (`mp9PlanWhen`; constants `MP9_PLAN_*`) and stores one readable line that parses back into the picks. Free text produced "When I am at school and in school when I have free period".
- **Mentor:**
  - `member.mentor.plan.approve` takes `items` (target, sessionsPerWeek, what). They are validated whole before any write, logged, counted (`changed`) and named in the child's notice.
  - New `member.mentor.plan.cheer` writes to the child on a live plan. It is Academy-gated like the other mentor writes.
  - `mp15-class.jsx` has the steppers, "Approve with my changes", and the write box.
- **Mentor roster:** a mentor's pairings are read across sessions when the current session has none. Reading only this session's made a paired mentor see the whole centre.
- **Curriculum state:** `curriculum_child_state($m, $course)` lists every lesson with its state, score and stage, plus totals. It is shown on the instructor's Work tab (`instructor_student` returns `curriculum`) and on the mentor's mentee page (`member.mentor.child.lessons`, behind the same gate as the record).
- **Mentor editor** (`AdminMentorEditor`):
  - `rank` (mentor, lead, peer; anything else is `bad_rank`) and `department` are now editable through `admin_mentors_upsert`; a rank change is in the audit detail.
  - `useAdminDrawer` registers its focus and key effect once, with `closeRef`. The old `[close]` dependency re-ran it on every parent render and refocused the first field. That is fixed for every drawer.
- **Results:**
  - `member_results_confirm` refuses a report where every score is 0 (`scores_all_zero`).
  - The instructor's results card shows an average of 0 as "Scores not read", and scores as "—".
- **Feedback kind:** `member_request_public` and the answer op treat any row with a feedback topic as feedback. Rows saved under another kind by an older build showed Approve and Decline.
- **Instructor portal, no fallback:** `/instructor` no longer drops anyone into the old Mentor Portal. A signed-in person who is not an instructor sees a status screen that says so, with what to do and links to their own portal and dashboard.
  - Course and centre problems (`not_your_centre`, `not_your_course`) keep an instructor in their portal, with a plain message about which part of their record is missing.
  - Only signing in still goes through the older portal's sign-in doors.
- **Email:** the footer never prints the example config's placeholder address ("hello@yourdomain.com"); it falls back to next@afrovanguard.org.ng. The button's "→" stays on the button's line.
- **Known failing suite:** `dashboard-results.test.js` times out waiting for `.dash-results` at `/member/grow/results`. The member portal now serves that address. This was not re-baselined on the previous commit, for lack of time.

## Placement, the course checklist, proof review and report reading (2026-10-24)

- **Placement:**
  - `staff.curriculum.placement` lists the class with each child's current year and `curriculum_suggest_year` (intake year, then one up or back by lesson completion).
  - `staff.curriculum.place` saves up to 200 at once through `staff_curriculum_year`, with per-row verdicts and one audit event.
  - The UI is `Ip6Place`, from the Students screen.
- **Checklist:**
  - `staff.curriculum.confirm` (`unitIds`, `done`) marks lessons completed with `markedBy = confirmed:<staff>`, or takes back only such ticks. It is scoped to the instructor's centres and courses.
  - `curriculum_child_state` returns `confirmed`. The UI is `Ip6Checklist`, from the child's Assess tab.
- **Control Room:** `.cr-app button { color: inherit }` outranked `.btn-primary`, giving navy text on navy buttons. It now applies only to `button:not(.btn)`.
  - Mission proofs: a `proofUrl` that is not http(s) is the child's text, shown as text.
- **`results_ocr`:**
  - The prompt describes the CA, exam, total and grade columns, conversion when a card is not out of 100, the check against CA + exam and the grade, and easily confused digits.
  - It runs with thinking on low and 3000 output tokens. A weak read (a third or more of rows without a score or under 0.6 confidence) gets one more careful pass, and the more confident read is kept.
- **Tests:** instructor 39/0 (checklist, placement); PHP 5247/0.

## Portal time, backup AI keys, volunteer landing, report evaluation, logo home (2026-10-24)

- **Portal time (migration 176, `portal_time`):**
  - The SPA (`api-client.js`, end of file) beats `/api/member/beat.php` once a minute, and only while the page is on a portal path (dashboard, member, profile, mentor, instructor, community, family), visible, and touched in the last two minutes.
  - `portal_time_beat` trusts nothing:
    - at most 75 seconds a beat;
    - a beat within 40 seconds of the person's last one is dropped, so two tabs do not double the time;
    - 12 hours per portal per day.
  - A signed-out page backs off for five minutes.
  - `admin.engagement.portal` (cap `audit`, centre-scoped) returns totals (reach, total, average and median per active member, days active, not seen), a daily series, time by portal, time of day, by centre, and per member. It does one grouped read; everything after it is arithmetic.
  - UI: Analytics → Engagement → **Portal time** (`PortalTimePanel`, `.pt-*`), with search and CSV. The merge policy moves `portal_time` with `MOVE_UNIQUE` on day and portal.
- **Backup AI keys:**
  - `ai_ui_keys` adds slots `pool1`, `pool2` and `pool3` (Gemini) and `groq`. Every profile tries the pool, rotated per minute.
  - Groq comes last, and never for photos, framing or report-card reading.
  - Settings → AI keys has six slots, each with its own test.
- **Volunteer landing:** `member_dashboard` for a signed-in volunteer with no member row returns `volunteer`. `/dashboard` shows `VolunteerHome` (their portals, their ID, Community) instead of "Something went wrong". `DashboardError` says "off-line" only when the browser is offline.
- **Report evaluation:**
  - The prompt is grounded in the numbers: targets, moves, and three specific sentences.
  - The fallback summary names the strongest and lowest subjects with percentages, and the focus subjects (now → target).
- **Logo goes home:** the logo in the member, mentor, instructor, Club and Community portals links to `/` (the website).
- **Tests:** PHP 5260/0.

### Open tasks, as of this entry (owner's list)

1. **Volunteer dashboard:** time on the portal, analytics, essentials. Asked for; not started. `portal_time` already records volunteers who sign in to the portals; the panel needs a volunteer view.
2. **Tutor inside the Companion:** Socratic, on the backup keys.
3. **Call room:** parked by the owner. The draft domain is outside the repo.
4. **Lessons:** improve the feature, and the curriculum ordering UX in admin.
5. **Member portal:** helpful to children and structured on every device. Also the Messages UX.
6. **Instructor portal:** managing, assessing and monitoring (ongoing).
7. **Projects:** verify end to end.
8. **Companion everywhere:** parent voice; no synchronous AI on page load.
9. **PDFs that do not display.**
10. **WhatsApp-style Community:** the remaining parts; and audit every Community fault.
11. **SMS codes as a second sign-in step**, when SMS is configured.
12. **Cloudinary failover** across several accounts (in progress); device-aware guides with screenshots.
13. **Re-baseline `dashboard-results.test.js`:** it waits for `.dash-results` at `/member/grow/results`, which the v9 portal now serves.
14. **Browser re-runs** (instructor-v6, family-ui, ids-ask, curriculum-ui); audit the commits since 4bd4af1.
15. **"People get locked out":** confirm whether the owner means the 15-minute sign-in lock (`too_many_attempts`) as well as being stuck inside a portal, which the logo link fixes.

## School results are the mentor's; instructor courses; a channel per course (2026-10-24)

- **School results leave the instructor portal** (owner's decision). This reverses the earlier "instructors see school results".
  - The tab, its nav item and its load are gone from `ip6-app.jsx`. A bookmarked `results` screen opens Today.
  - On the server, `results_reader_gate` refuses an instructor `results_are_for_mentors` on `instructor.results` and every `instructor.result*` op. Staff still pass.
  - The functions stay. The PHP suite exercises them behind `$GLOBALS['__results_instructors']`.
  - The instructor's To do no longer carries `results-attn`.
  - The mentor portal keeps results.
- **Results list:** for a staff reader, `instructor_results` lists the whole class. A child who joined after the term ended is `not_due` (counted in the class, not as missing; `kpis.owed`). Before, a new September class read "0 of 0".
- **Instructor courses are assigned properly:**
  - `admin_volunteer_update` saves an NGG volunteer's courses in the catalogue's spelling (`curriculum_course_canonical`). A name that is not a course is refused (`unknown_course`, with the nearest course and the list in `detail`), and the volunteer editor shows it on the Courses field.
  - A member promoted to staff starts with their own courses (`volunteer_promote_courses`), or the ones named. Before, they started with none, and the instructor portal opened on an empty class.
  - Summer School keeps its own tracks.
- **Every course gets a channel automatically:** `community_ensure_channels` now syncs on every load against `curriculum_courses()` (the catalogue plus any course that has lessons). It used to seed only an empty table, so a course added later never got a channel. A channel staff archived stays archived.
- **Tests:** PHP 5268/0; instructor 39/0.

## Instructor curriculum: a course's lessons include its parts (2026-10-24)

- **Course families:**
  - `staff_curriculum` reads each of the instructor's courses as a family (`curriculum_course_family`): "Musical Instruments" includes lessons filed under Piano, Guitar and the other instruments.
  - Each lesson carries `family` (`curriculum_course_parent`), and `StaffCurriculumMap` groups by it. A lesson's audience counts members by its parent course too.
  - Before, the match was by exact name, so a Musical Instruments instructor saw "0 lessons".
- **Honest notes in the curriculum view:**
  - A course with no lessons says so, and names who writes them.
  - A term with no start date names where an admin sets it.
- **Class time:** with no slot on the timetable, the header says "No class time on the timetable yet", not "Sat Saturday".
- **Tests:** PHP 5270/0; instructor 39/0.

## A course's own lessons win; instructors write lessons per course (2026-10-24)

- **Precedence:** `curriculum_course_family` returns only the course itself when it has published lessons of its own. Lessons filed under related names ("Piano", or "Drama" for Acting, "Programming" for Coding) are a fallback for a course with none, never mixed in. The matching is the general `MEMBER_COURSE_WORDS` map, not only music.
- **Writing per course:**
  - `staff.curriculum.lesson` (POST `/member/curriculum.php` `action=lesson`) lets an instructor write a lesson for one of their own courses (`not_your_course` otherwise), at the week asked for and the next free position.
  - It is a draft for a curriculum lead to publish, or published at once when the instructor holds `curriculum`.
  - The UI is `StaffLessonForm`, in the curriculum view of both portals.
- **Tests:** PHP 5273/0; instructor 40/0 (writes a lesson from the portal).

## One person instructor and mentor; Academy waived by hand (2026-10-24)

- **Both roles:**
  - The volunteer drawer (`VolunteerRoles`) has "A mentor as well". It uses the existing `admin.mentor.promote` / `demote` and leaves the volunteer's role (instructor) unchanged.
  - When the volunteer is also a member, `admin_mentor_promote` copies their `memberId` onto the mentor row, so the gate finds the same person both ways.
  - The volunteer roster carries `mentorId`, from one grouped read.
- **Academy waiver (migration 177):**
  - `volunteers.academyClearedAt` / `academyClearedBy`. `admin.volunteers.academy` (cap `people`, scoped, never one's own record, audited) sets or clears it.
  - `academy_instructor_cleared` exempts the instructor in the orientation gate and in `instructor.academy`, matching their member id, volunteer id or email.
  - Mentors already had this, as "Completed in person" in the Pairings workspace.
- **Tests:** PHP 5278/0.

## Member "My course": division name, honest lesson states (2026-10-24)

- **Division name:** `member_timetable` resolves the division from the record's `division` or the track when no course is chosen, and returns its name. The card read "tech · Tech" (a raw id beside the track). With no course chosen, it says so: "No course chosen yet: ask your centre".
- **Lesson states:** the curriculum list draws a padlock only on a lesson that has not opened yet ("Opens week N"). A past week not started is "To catch up"; the current one is "Not started". Before, every unstarted lesson looked locked.
- **Tests:** PHP 5278/0; member 42/0; instructor 40/0; mentor 66/0.

### For the next agent: the timetable UX needs work (owner, 2026-10-24)

Members find the timetable hard to use. Reported, not yet redesigned:
- the member's timetable view (member portal → Timetable, `mp9-more.jsx` `ttDays` / `division`);
- the public timetable maker (`?centre=` slug, `tt_for_centre`).

Start from how a child reads "where am I, when, with whom" on a phone. One clear "my class this Saturday" before the full grid. Their own course is highlighted, never mixed into every course's rows. Test it with members, not only in the suite.

## The track decides the division; interests stay inside it (2026-10-24)

- **The fault:** a Tech member was shown Media Lab lessons. `curriculum_member_courses` added the card's disciplines word by word, so "Tech, Media" brought the whole Media division.
- **The rule now:** with no chosen courses, the track gives the division. Disciplines add only courses inside that division (plus Chess). A child who really takes two divisions gets both by having courses chosen on their record (`members.courses`).
- This reverses the old promise "two faculties on the card bring both divisions"; its tests now pin the new rule.
- The rule reaches every consumer: lessons, Community channels, timetable, instructor class lists.
- **Tests:** PHP 5279/0.

### Proposed: courses as a stored fact, not inferred (awaiting the owner's two decisions)

Root cause of the course faults (Tech child with a media course, "tech · Tech", "0 lessons" for Musical Instruments, a tech child in the media channel): a child's courses are INFERRED on every read, from free text (track, card disciplines, division, word maps), separately in lessons, channels, timetable and instructor lists. The change above is one more patch on that; the fix is structural:
1. `members.courses` is the one source; every consumer reads it through one function, with no inference at read time. A child with none sees "ask your centre" and is flagged to staff.
2. A Control Room "Course placement" screen runs today's inference ONCE to propose each child's courses; staff confirm or correct them per centre, ambiguous cases first.
3. New members choose catalogue courses at application and approval; the division follows from the course.
4. One catalogue: lessons, instructors, slots and channels all use catalogue names. Aliases are canonicalised at input and import, never at read time.
5. One cross-consumer test: lessons, channels, timetable and instructor lists all show the same stored courses.

Open decisions for the owner:
- Do Media Lab and Practical Coding join the catalogue (Media, Technology), or do their lessons move under existing courses?
- Until confirmed, do children see their proposed courses marked unconfirmed (recommended), or nothing?

## The Control Room on a phone: old panels rebuilt, not reskinned (2026-10-25)

The owner's reading: "the control room is not phone first — just build a mobile version." The new
Control Room (`src/modules/control/`) already had a phone tree (app bar, page pills, tab bar, blocks
that draw as lists). What was not mobile was everything mounted through `CrPanelMount`: twenty-five
`page-admin.jsx` panels drawing their desktop layout inside the phone shell, in the old UI's look.

- **Rebuilt as blocks (mobile by construction):** Centres, Families, Accounts (People); Companion
  check-ins (Mentors & volunteers); Announcements and Newsletter (Announcements). Same ops, same
  guards and refusals, same words. Centres' map and Summer-venue editors are real widgets and stay as a
  `custom` block on their own sub-page (`/control/members/centres/<id>/map`).
- **Still mounted (next):** Data quality, ID cards, Sign-in security, Anchor,
  Timetable, Curriculum, Mentors, Pairings, Volunteers, Threads, Site, Status pages, Forms,
  Promotions, Quote of the week, Summer. Until each is rebuilt, `.cr-app .cr-panel` in styles-app.css
  draws the old classes with the new components' exact values, and on a phone long panel intros fold
  to three lines (`crFoldHints`, cr-ui.jsx).
- **Shell and blocks fixed on the way:** the drawer dropped `list` sections on a phone (now one
  renderer, `crDrawerSec`, with optional per-row actions); KPI columns follow the count (no holes); the
  phone KPI panel is one joined box at half the height; the secondary-actions row could be crushed by a
  tall page (`flex-shrink: 0`); `.cr-app :where(button…)` stops the colour reset beating
  `.cr-btn.is-primary` and the selected page tab (ink on ink, 1.00:1).
- **A server fault found on the way:** `admin_broadcast` knew two centres by name, and stamped any other
  audience '' — which the feed reads as everyone, while email went to every active member. One resolver
  now (`admin_broadcast_audience`): everyone, a programme, or a real centre; anything else is refused.
- **Server tables in a native tab:** build the `server` object in `load`, never in `blocks()` — a table
  refetches when `server` changes identity, so one made per render never leaves its skeleton.
- **Second pass, same day:** Sessions, Missions (Learning) and Posts (Content) rebuilt as blocks.
  Sessions keeps the year in the address (`/control/learning/sessions/2027`); changing year fetches
  and sets the tab's data, because `useCrLoad` memoises `load` with the first render's ctx and so
  sees a deep-linked year but never one picked afterwards. Missions' "return for another pass" asked
  for feedback through `window.prompt`, which a phone draws as a system dialog with no room to write;
  it is a form now. Posts opens each post from the server (`admin.posts.get`) before editing, so the
  editor holds the stored body rather than a list row's excerpt.

## Nothing on the site is invented: members say it themselves (2026-10-26)

The home page carried four testimonials attributed to named people — a
fifteen-year-old from Egbeda, a parent, a mentor of four years. Nobody said
any of them. They were written to show what the section would look like and
they shipped to a live site about real children. Six "media items" were the
same, one of them claiming 12.4k views.

Both are gone (`data.js` keeps the empty constants and the reason). What
replaces the first is the real thing: **at the end of every session a member
is asked, in one line, what today gave them** (`domain/testimonials.php`,
migration 180, `DashSessionSay` on the lesson page). Over a term that is a
record of what the programme did for somebody, in their own words, written the
day it happened rather than reconstructed for a funder eighteen months later.

The rules ARE the feature, and each one is a test in `api/tests/run.php`:

1. **Private until a person decides otherwise.** Nothing a child writes
   reaches the public site because they wrote it.
2. **The child chooses how they are signed**, and the quietest option is the
   default: initials and age, first name and age, or not named. A full name is
   not on the list. The byline is **derived on every read**, never stored, so
   a change of mind actually changes it.
3. **Publishing asks the consent ledger** — `consent_may_publish()`, the same
   gate that decides whether a child may be named anywhere else on the public
   site. Not a second consent flag of this feature's own, which is how the
   community showcase once ended up with no gate at all. Read live, so
   withdrawing the consent takes the words down on the next request.
4. **It is never required.** Skipping is a press; nothing depends on it.
5. **The member can take it back**, published or not, by clearing the box.
   Consent that cannot be withdrawn was not consent.

Publishing is a **`content`** act, not a curriculum one: the Club coordinator
who runs the lessons can read the queue and cannot put anything on the site.
The queue is **Inbox → Testimonials**, a source in `cr-tab-inbox.jsx` — and
where there is no consent it draws **no Publish button at all** rather than one
that refuses (CLAUDE.md §11).

Three repo guards caught this work on the way in, which is what they are for:
a cache topic that named an op the shipped `config.example.php` did not cache;
a new table with a `memberId` that had not said what a member-merge does to it;
and a new table carrying a centre name that was not in `CENTRE_NAME_TABLES`.
A fourth was found by the suite rather than a guard: the first cut invented a
`members.visibilityConsent` column, which exists on `applications` and
`volunteers` and has never existed on `members`.

## Family Portal v3 (2026-10-26)

The handoff `design_handoff_family_portal_v3` (README, SCREENS, UX_SPEC,
API_DATA) built on live data. `/family` is now `src/modules/family3/`: the
design compiled (`fp3-view.jsx` from `docs/design/portals/family-portal-v3.dc.html`),
an adapter from the real reads (`fp3-data.jsx`) and the design's logic ported
onto them (`fp3-app.jsx`). `page-family.jsx` is a one-line wrapper; the v2
screens are gone. `fp3-subs.json` is the reviewable list of every change made
to the design's markup.

- **Server** (`domain/family-portal.php`, migration 180): `family.ward` gains
  the Leadership Index (the mentor's, never the child's self-score), school
  results per term with the plan only once a mentor approved it, collectors,
  consents, the mentor's free times, a booked meeting, and `fees3` — the Fees
  page worked out on the server (the client adds no money up). New ops:
  `family.inbox`, `family.report.sign`, `family.plan.sign` (a `plan_acks` row
  the mentor sees), `family.results.remind` (once a day), `family.results.upload`
  (a photo through the family's own piece store, `api/family/upload-chunk.php`),
  `family.events` / `family.rsvp` (`guardian_rsvps`, the family's own row),
  `family.mentor.book` (`mentor_slots`; the claim is the UPDATE). Request kinds
  `askmentor`, `familydetails`, `collect`. `family.profile` now answers 403
  `read_only`. Jobs: the monthly report and the event / meeting reminders in
  `webcron.php`.
- **Found on the way:** `family.ward`'s appealable charges filtered the ledger
  on `direction = 'debit'`, which nothing writes, so a parent was never offered
  a charge to appeal. It reads `'charge'` and leaves the training place out.
- **Deviations from the handoff, deliberately:** the phone's top is one bar
  (child switcher, a bell for what needs you, the account) instead of a logo row
  plus a switcher card, and the page header no longer repeats the child; the
  sub-tabs stay pinned while a section scrolls; the active bottom tab is an ink
  icon and label with a short gold rule, not a gold blob; Today's account card
  is a status chip, one full-width Pay, the facts as a list and the statement as
  its last row; the report upload takes a photo, not a PDF (this host's family
  path stores images), and has no `capture` so a parent can pick the photo the
  school sent on WhatsApp; a day with no class says "No class today" rather
  than "Not in yet"; every control in the page is 44px on a touch screen.
- **Collectors in the Control Room:** a member's drawer shows *Who can collect*
  and *Who can collect…* edits the list (one per line), through
  `admin.member.collectors` — `people`, centre-scoped.
- **Still to build:** the mentor portal's "times
  families can book" (`member.mentor.slots` / `slotAdd` / `slotRemove` exist).
  Until mentors publish times, a family's *Book a meeting* says there are none
  and offers *Ask a question*.

- **Correction, same day (owner):** an absence needs a reason, from a parent as
  from a member. The family sheet asks *Why {child} will be away* and refuses an
  empty one; the server no longer fills in "No reason given". The handoff's
  "reason (optional)" is overruled.

## Absences: a count, a fine, a review, and academic leave (2026-10-26)

The owner's rules, built on the policy engine rather than beside it:

- **The count is the engine's.** The allowance is the member band's
  `absenceLimit` (two) and "used" is `policy_state`'s absences plus programme
  days still ahead on open or approved leave (`member_excuses`, member-self.php).
  A leave request past the limit is refused (`excuse_limit`) with what is left;
  the family app and the member portal show "N of 2".
- **An unasked absence is fined**, once per day, at the new member-band setting
  `absenceFine` (₦1,000 default, Settings → Policy). `member_absence_cover()`
  decides: an OPEN request holds the fine until the desk decides; approved
  excuses it; declined or withdrawn fines it. `admin_request_decide` re-runs
  `policy_apply` so a decision takes effect at once.
- **Academic leave** (`academic` request kind, ≤ 70 days, reason required,
  optional school letter): approved, the sweep skips its days, absences already
  logged on them are voided, and they never count towards the limit.
- An absence always needs a reason (the handoff's "optional" is overruled).

## Supervision notes: the last fixed row on My role (2026-10-26)

The owner's screenshot of *My role* ("Support NGGC projects and activities ·
None assigned") was answered by the projects work (76c641ab). The same list had
one more row that read fixed text: *Feedback received professionally* always
said "Up to date", and `mentor_supervision.feedback` / `feedbackAt` were read
but nothing ever wrote them.

- `member.mentor.supervision.record` (mentor-portal.php, action
  `supervisionRecord`): a lead or coordinator, for a mentor in `mp_team_rows`,
  writes the feedback (10+ characters) and up to five agreed points
  (`MP_SUPERVISION_AGREED_MAX`). It closes the open booking — `onDate` becomes
  the day it was written if that is earlier than booked — or records a
  supervision held without one. The mentor is notified; Academy-gated like the
  portal's other saves.
- `member_mp_role`: the coming supervision is one not yet written up; "agreed
  last time" includes one written up today.
- `member_mp_team`: `booked` now means an open booking (any date, not yet
  written up), with `bookedOn` and `notesAt`; the Mentors row's button is
  *Book supervision* or *Write up supervision* (`Mp15SupNotes`).
- The `feedback` commitment row is derived: "No supervision written up yet",
  or "Last supervision notes {date}", amber after 120 days.
- Tests: PHP "supervision notes: …" (7 checks); mentor-v15 books, writes up and
  reads it back through the screen.


## 2026-10-26 — Summer v3 server, the undo window, and notifications a member can act on

- **Summer School Portal v3, server** (`domain/summer-portal.php`): one read per
  screen (`admin.summer.portal` with `view` boot | today | people | register |
  child | graduates), the palette's search (`admin.summer.search`, name, printed
  ID or last 4+ card digits, six at most) and per-staff recent children
  (`admin.summer.recent`). Every count is taken from one roster derivation per
  request, so "9 stopped" on Today and the list behind it are the same nine.
  Centre scope is applied on the way in.
- **The undo window is real** (`domain/pending.php`, migration 182). Move to NGG
  (one or many), the joining invoices and the bulk guardian alert accept
  `defer` and return a `pendingId`; nothing is created or sent until the row
  commits — the client when its countdown ends, any portal read, or the webcron
  tick, each claiming the row so it commits once, re-run as the requester so the
  gate is asked again. `admin.pending.cancel` inside the window leaves nothing
  done. Joining invoices for many graduates are one op
  (`admin.summer.graduates.invoice`, ≤200) rather than the handoff's client
  loop, so the whole press has one undo.
- `members.fromSummerId` links a promoted member to the participant they were
  (it was only in a free-text note); Into NGG reads stages from it.
- **Member notifications** (migration 184): per-person read and dismissed marks
  in `notification_state` — reading a broadcast used to write `readAt` on the
  shared row, i.e. read it for everybody; a broadcast's own `readAt` is now
  ignored. `groupKey` keeps one live item for a running thing (Saturday's
  timetable sent one alert per block, which is what filled the panel in the
  report). Every item carries an `action` (label + page), from `actionLabel` or
  the kind. The panel (`Mp9Notifications`) replaced the compiled one: groups,
  actions, read/unread, dismiss with undo, loading and error-with-retry,
  Escape returns focus to the bell. Its rows used to shrink below their text in
  the flex column and overlap.
- **Fonts and scrollbars in every compiled portal**: buttons and fields inherit
  the portal font (a `<button>` takes the system face by default), at zero
  specificity so a designed face still wins; one thin scrollbar, no steppers.
- **/family was unstyled on any non-touch screen.** An `@media (pointer: coarse) {`
  block for the lesson-quiz editor lost its closing `}` during the Family Portal
  v3 edit, and a browser does not reject that: every rule after it in
  styles-app.css — the whole Family Portal, and everything added since — was
  read as nested inside the touch-only query. Phones looked right; laptops got
  a near-bare page. Fixed, and `build.js` now refuses a stylesheet whose braces
  do not balance (`validateCssBraces`), naming the line the open block starts on.
## Two questions, two rhythms — and a font that was two fonts (2026-10-26)

**The testimonial was being asked after every lesson.** That was wrong, and the
owner said so: a session here is the twelve-week block (TONI, MEDI, SUMMER,
DOMI), not a Saturday. A child asked for something quotable twenty-four times
a term answers twice, and what comes back is a diary.

It is two features now.

- **How did today go** (`domain/lesson-feedback.php`, migration 181) — after
  every LESSON. Three taps: *I could do it · I could follow but I'd need help ·
  I could not follow*. Words optional, asked second, and only of the child who
  struggled. **Never published, by anybody** — there is no op in that file that
  could, and a test asserts there never is one. Seen by the instructor for
  their own courses and centre, and by admins holding `curriculum` or `club`.
- **What did this term give you** (`domain/testimonials.php`) — after every
  SESSION, in its last three weeks and for two months after it ends
  (`testi_session_ask`). Consent, byline and withdrawal are unchanged.

The feedback has to pay for itself or it is worse than nothing: it costs the
child a tap and buys them nothing. So `lfb_board()` does not hand back rows to
read — it answers the question an instructor actually has, **which lessons are
not landing**, worst first, with the words from the children who were lost
attached to the lesson they were lost in. A "needed help" counts as half a
miss, because a class that could only follow with help was not taught either.
Control Room → Learning → **How lessons land**.

### The font was two fonts

`styles-app.css` declared Geist as seven static faces (400/500/600) while
`assets/fonts/fonts.css` declared it as one variable file covering 100–900.
The member portal sets every heading at **700** — a weight the statics did not
have — so headings resolved to the variable file and the body text beside them
to the static cut. **One screen, two physical fonts.** Before the variable file
was added, 700 was a faux-bold of the static 600: fake, but consistent, which
is why this appeared as a regression.

One source now. Measured after: every weight 400–800 comes from
`geist-variable.woff2`, one request instead of five, and Latin Extended
actually renders where it previously fell back to the system face.

### Read aloud, and the study helper

Both were reported as bad, and both were bad for findable reasons.

- **Read aloud** called `getVoices()` synchronously — empty on the first call
  in Chrome and on Android, so the first press got no voice at all. It read
  the raw Markdown ("hash hash warm dash up"). It stopped after ~15 seconds
  (Chrome kills a long utterance) and truncated at 3,000 characters. It now
  waits for `voiceschanged`, speaks `mp9Speakable()` output — headings as
  sentences, links as their words, code announced rather than recited — in
  sentence-sized chunks with a `resume()` heartbeat.
- **The study helper** sent only the latest question. There was no thread, and
  the previous answer was wiped on each press, so "I still don't get it" was a
  cold start — which is the one thing being stuck is never like. It carries
  the conversation now (`CURR_TUTOR_TURNS`), and is given the member's
  programme year and **what they actually got wrong on that lesson's review**
  (`curriculum_ask_gaps`, never the model answer), so it can teach the gap
  instead of re-explaining the part they already had.

## The curriculum stops being a modal; the division becomes the enrolment (2026-10-26)

The owner, on the member portal: *"The LMS is not really what I want it to be.
It is currently just a modal. The structure of the member portal is also not
good."* And: *"The use of the course in division feature is not available yet?"*

Both were fair, and both had findable causes.

### It really was a modal

`openLesson()` called `openSheet({ k: "lesson" })` — the SAME overlay the
portal uses for *Edit profile* and *Gate pass*. The whole of a Saturday's
teaching was paginated inside a sheet (`lPart`: read → materials → check) on
top of a dashboard tab. No address, nothing to bookmark or send to a mentor,
and the browser's Back closed it instead of going back.

**`/learn` is its own app now** (`page-learn.jsx`), the way the Anchor Journal
and the Study tools are:

    /learn                  This week — what to do now
    /learn/courses          My courses
    /learn/course/<slug>    One course, week by week
    /learn/lesson/<unitId>  A lesson, FULL SCREEN
    /learn/review           How the review works
    /learn/helper           The study helper

Every one is real: `app.jsx` gained `inLearnSubtree` so a deep lesson address
is not rewritten back to `/learn` on mount, which is precisely what made a
lesson unbookmarkable. `tests/learn-app.test.js` pins the thing that changed —
that it is a PLACE: cold-loading `/learn/lesson/<id>` opens that lesson, Back
goes back, and signed out the address is kept so signing in lands on it.

**There is still only one lesson renderer.** The portal's `openLesson()` now
hands over to `/learn/lesson/<id>` rather than drawing its own; the app reuses
`CurriculumText`, `CurriculumMaterials`, `CurCheckField`, `DashOpeningReview`
and `DashLessonFeedback` rather than forking them (CLAUDE.md §11). What is new
is the place, not the parts.

**A container cannot be styled by its own container query.** `.lrn-app` carried
both `container-type: inline-size` and the responsive grid, so at desktop width
the grid stayed in its phone shape while the rail took its desktop one — and
the two overlapped, swallowing every click. The container is `.lrn-app`; the
grid is `.lrn-shell` inside it.

### The division as the enrolment

There was no such feature — only a last-resort FALLBACK, and a bad one: a
member with no courses on record was handed *every* course in their division,
which is why one screen showed Automation, Coding, Cybersecurity and Practical
Coding side by side at week 8. That is a wall, not a curriculum.

`courseSource` on the curriculum schedule now names which half runs:

- **`member`** (default) — unchanged.
- **`division`** — the member takes their division's OWN shared curriculum,
  the spine every course inside it shares
  (`curriculum-divisions-2026.json`, already in the box), and nothing from the
  strands. Club-wide lessons and Chess still reach everyone; a member with no
  division gets those and never somebody else's curriculum.

**The spine ships for Year 1 only**, so turning the mode on would strand every
Year 2 and 3 member. That is a number on a screen now, not something a child
discovers: `admin_curriculum_divisions()` reports every division against every
year and counts exactly how many members each gap would strand.

### School inside Learn: the half of the growth plan that was never built

A coordinator agreed a growth plan with a member after every report card —
subjects, where they are, where they are going, and *three sessions a week* —
and then nothing in the product let them do a session. `plan_checkins` counted
practice the programme had no way of providing. The plan was a promise with no
second half.

`/learn/plan` is that half, and it is deliberately **not a new plan**: it reads
`growth_plan_items` as they already are. A subject gives five questions; the
marking shows the working, not a tick; and one marking closes three loops at
once — the plan's own weekly counter via `member_results_tick()`, a flashcard
in `School · <subject>` for everything missed (the SM-2 schedule that already
existed), and the next level. Five levels, 80% up, under 40% down, eight drills
a day.

Questions come from a past-questions bank first (`study_bank`, optional), then
the AI layer, and **with neither it refuses in words** and points at their
flashcards. A child is never handed a blank paper, and never a question the
screen cannot explain the working for.

The bank could not be verified from this container — the network is closed to
it — so it is strictly optional, bounded (6s, 256KB, no redirects) and can only
ever fail *silently into AI*. Nothing claims it works until a deployment points
it at a real endpoint.

**`e.message` is the raw code; `e.data.message` is the sentence.** `api-client`
builds its error as `new Error(data.error)`, so the server's human wording
lands on `err.data.message` and `err.message` is `no_questions`. Reading the
wrong one put that literal string in front of a child. The idiom in this
codebase is `(e.data && e.data.message) || fallback`.

### Six more free AI providers, one branch

Cerebras, Mistral, Together, GitHub Models, DeepSeek and a self-hosted
`custom` endpoint all speak the OpenAI chat-completions shape, so the
groq-only branch in `ai.php` became **one** generic branch over `AI_OAI_COMPAT`
rather than one branch each. Six of the eleven providers now have a free tier
that does not expire into a card — which, on shared hosting with no budget, is
the difference between a feature and a disabled feature. They all join the same
fallback chain, so two or three keys is the configuration that survives an
afternoon of rate limits.

### A lesson is not a sheet any more, and the suites say so

`member-v9.test.js` drove `[role="dialog"] button:has-text("I've done")` —
the lesson sheet that was removed when the lesson became a place. It pins the
**handoff** now (the portal opens `/learn/lesson/<id>`), and the answering is
owned by `tests/learn-app.test.js`, which already covers it end to end. One
behaviour, one suite.

`curriculum-ui.test.js` and `responsive-staff.test.js` were never broken by
that change: those runs had collided on `api/config.php`, which every node E2E
suite writes and refuses to start beside. **They cannot be run concurrently** —
run one at a time they are 66/0 and 4/0, and always were.

## Summer School portal v3 on live data (27 Oct 2026)

`/summer-admin` now mounts `Ss3Portal` (`src/modules/summer3/ss3-app.jsx`), the
v3 design compiled (`ss3-view.jsx`, sample copy rebound by `ss3-subs.json`) and
driven by `domain/summer-portal.php`. The older `AdminSummer` workspace is
unchanged and still lives in the Control Room, where the season's settings,
links and imports are administered.

What changed, and why:

- **Only screens with a backend are offered.** Timetable, Demo Day, pickup,
  volunteers, incidents and messages are in the design but have no data here
  yet; they are left out of the nav, palette and shortcuts rather than drawn on
  the design's sample data. Incidents and messages are the next piece of work.
- **"Right now" on Today is the door rules**, not a day plan: doors, grace,
  the programme day and sign-out, read from `attendance_settings()` and sent
  as `rules` at boot (`ss3_rules()`), so the portal's 09:00 is the 09:00 the
  check-in op grades lateness against.
- **New reads:** `part=consent` (per-type answers and who is missing a required
  one), `part=cards` (stock by batch, confirmed children with no card, one card
  looked up by code, centre-scoped), `part=desk` (latest scans, scans by
  centre). **New op:** `admin.summer.desk` takes a code, printed ID or name and
  runs the one `summer_checkin`/`summer_checkout` on the child's card — the
  card's token never reaches the browser.
- **The bulk absence alert was not centre-scoped**, and counted children whose
  registration was not confirmed. A scoped coordinator pressing "alert all"
  emailed every centre's guardians while the button showed their own count. It
  is scoped now, and a single child's alert refuses `out_of_scope`.
- **Undo is the server's.** Moving children into NGG, sending joining invoices
  and the bulk alert are parked by `pending.php` for 8 seconds; Undo cancels
  them there, and a closed tab does not lose or double them.
- Copy the design promised and this portal cannot keep was rebound: the
  desk's "hold the card up to the camera… works offline" (it has neither),
  "Blank cards at each desk" (cards have no desk; stock is per batch), and
  "₦0" when fees are off (it read as joining being free).

`tests/summer-portal-v3.test.js` (`npm run test:ss3`, in `test:all`) drives it
end to end; `api/tests/run.php` holds the new reads, the desk op and the scoped
alert.

## Summer School portal v3: incidents and messages (27 Oct 2026)

`domain/summer-incidents.php` (new, in the bootstrap list) backs the two
screens the portal had left out. The tables are migration 182's; no migration.

- **A Safeguarding incident is a safeguarding case**, filed through
  `sg_case_open()` — extracted from `sg_report()` so a mentor's report, a
  child's own and a Summer School incident open a case the same way, with the
  same officer routing, email and daily cap. The incident row keeps only the
  case number: no child, no details, so the portal, the child's drawer and the
  incident list cannot show what only the lead may read. Tell and close are
  refused (`lead_decides`), and it never counts as "guardian not told".
- **Told means a message left.** `incident.tell` sends email and/or SMS, never
  the staff note, and stamps `toldAt` only if one went; otherwise it returns
  `not_delivered` with the number to call.
- **Messages** come from one server-side template list (`SS3_MSG_TEMPLATES`);
  a template whose placeholder cannot be filled truthfully is not offered (the
  pickup time needs a sign-out time; Demo Day was dropped — there is no Demo
  Day data). Audiences are `ss3_in_view()` over the scoped roster, so the
  count on the button is the count sent. A send is parked by `pending.php`,
  capped at `SS3_MSG_MAX` (500), recorded as one `summer_messages` row and one
  audit event with delivered / failed / no-contact.
- The incidents badge is now centre-scoped like every other badge.

## Shared emails, the Analyst's empty answers, projects for admins (2026-10-26)

Three things the owner reported.

**One email, several member accounts** (siblings on a parent's address). Sign-in
looked members up with `… OR lower(email) = ? LIMIT 1`, so the address always
opened the same child and the others never could; the editor refused a shared
email for that reason. Now (auth.php):
- `auth_email_accounts()` lists the accounts an email may open (not suspended,
  merged or deleted; never a password-only staff account). Two or more make the
  address *shared*.
- A code or link for a shared address is ONE challenge keyed by
  `auth_shared_key($email)` (`@shared:` + a hash), with the accounts in
  `auth_sessions.pickIds` (migration 183). Verifying it returns
  `{pick, pickToken}` instead of a session; `auth/pick.php` (`auth.pick`) opens
  the chosen account within `AUTH_PICK_MINUTES` (10), once, re-checking it is
  still on the address and not suspended.
- A password on a shared address is tried against each account
  (`auth_login_shared`): one match signs in, several offer a pick of those,
  none counts one failure against the address (`auth.pwshared`).
- A reset to a shared address sends one link per account (`auth_reset_shared`).
- The picker is in `api-client.js` (`authPickDialog`, under `auth.verify` and
  `auth.login`), so the site, the journal, the portals and the timetable all
  get it. CSS `.ngg-pick*` in styles.css and journal/app.css.
- Shared emails are allowed again in `admin_member_validate` and the member's
  own email change; the import notes them.
- Tests: PHP "shared email: …" (16); `tests/shared-email.test.js` (10, in
  test:all).

**The Analyst said "No answer came back"** for "send me an export of the
members grouped by their divisions". It reads aggregates only; every lens
returned no points, compose returned `''`, and the server called that success.
`insight_chat_ask` now always answers (the lenses' points when composing
failed, what it can read when nothing was found, or that the service did not
answer); `CrAsk` falls back to the claims too. A request for a member export
is recognised in the browser (`crAskExportIntent`) and done through
`admin.members.list` (People, centre-scoped, capped 5000), grouped by
division/centre/level/status/programme — names never reach the AI.

**Admins could not see or run projects.** `admin.projects`,
`admin.projects.people`, `admin.project.save`, `admin.project.mark` (People,
centre-scoped by the project's centre) and the tab **Mentorship › Projects**
(`ms-projects`, cr-tab-mentorship.jsx). The save is `project_write`, pulled out
of `member_mp_project_save`, so the portal and the Control Room share one set of
rules; only the reach differs (`admin_project_reach`). Tests: PHP "control room:
…" (7); tests/projects.test.js drives the tab.

## Projects: audited end to end, six defects fixed, the Control Room screen built (27 Oct 2026)

A read-through of `domain/projects.php` against every caller found the mentor
and child paths wired correctly, and these wrong. Each now has a test.

1. **There was no Control Room screen** when the audit ran. The other session
   built *Mentorship › Projects* (`ms-projects` in cr-tab-mentorship.jsx) at
   the same time; this session's duplicate was dropped at the merge, so there
   is one screen and one set of `NGGApi.admin.projects` wrappers.
2. **Every Control Room save would have failed** as `bad_status`:
   `api/admin/projects.php` cast a missing `status` to `''`, and the domain
   defaults only an absent one. The PHP tests called the op directly and never
   saw the route. It forwards only the keys sent now.
3. **A lead could not finish, cancel or edit a project once anyone on it had
   left their reach** (inactive, moved centre), because every person was
   re-checked against today's reach. Reach now decides who may be added, not
   who may stay; the mentor portal's Edit form lists such people so they can be
   taken off.
4. **An unscreened mentor could be grouped with children** and see their full
   names, contrary to the file's own rule. Refused now (`not_screened`, by
   name) on any project with children; a mentors-only project is allowed.
5. **My role could warn "past the finish date" for a finished project** for the
   rest of the month. Only an open project counts as overdue.
6. **A mentor could change their part on a closed project** (a child could
   not). Refused now, as for a child, unless they set it.
7. The Control Room's mark wiped a note when marking a part done without one;
   it keeps it now, as the mentor path did.

## 27 Oct 2026 — Learn: coming back, keeping, going deeper

Asked: improve /learn and enrich it, from good sources.

- **`learn_state`** (migration 188): one row per member per lesson — a private
  note, *saved for later*, and when it was last opened. Merge policy
  `MOVE_UNIQUE`. Every write is checked against the member's own lessons, so a
  note cannot be kept on (or a title learned of) a lesson that is not theirs.
- **The figures are derived, not stored** (`learn_stats`): a stored streak is
  a second copy of `curriculum_progress` that drifts from it. A week not yet
  over does not break the run.
- **Go deeper** (`member.learn.sources`): a Wikipedia summary chosen by title
  word overlap, never the first search hit (the first hit for a lesson title
  is often about something else), with CC BY-SA attribution as the licence
  requires; then a hand-checked list per course. Fetched server-side with the
  User-Agent Wikimedia's API policy asks for, cached a month, a miss cached a
  day so a rate limit is not hit again on every view. Every listed URL answered
  when added; Canva and Adobe were dropped because they refuse non-browser
  clients (403), which is also what a school proxy would see. The test seam is
  `$GLOBALS['__learn_http']`; the browser suite plants the cache file instead.
- A lesson with no questions can be **marked done** (`curriculum_submit` with
  no answers completes at 100%). Before this, it could never be finished.
- New: `/learn/notes`, search on *My courses*, Previous/Next, *Lesson N of M*.

### Wi-Fi gateways: built (2026-10-27) — replaces the plan above

The plan of 2026-10-23 ("PLANNED, not built: MikroTik Wi-Fi accounts…") was
built with these changes, each for a reason found while building it:

- **Not only MikroTik.** A centre's *gateway* has a platform: `mikrotik`,
  `radius` (a FreeRADIUS bridge on a Raspberry Pi for UniFi, Omada, pfSense,
  OPNsense…), `openwrt` (openNDS), or `generic` (JSON). `WIFI_PLATFORMS` in
  `domain/wifi.php` says what each can do; the screens and the diagnosis read it.
- **MikroTik uses the router's own hotspot users, not User Manager.** Verified
  against the RouterOS 7 manual: hotspot user profiles carry `rate-limit`,
  `shared-users`, `add-mac-cookie`/`mac-cookie-timeout`; removing somebody is
  `/ip hotspot active remove`, `cookie remove`, `user remove`. User Manager
  needs its own package, localhost RADIUS and accounting for the same result.
- **`/tool fetch` cuts a reply at 64,512 bytes without an error**, so the text
  feed pages (`WIFI_TEXT_PAGE_BYTES`) and every page ends `#end`; a script
  applies nothing until it has every page.
- **Hours are kept by NGG**: hotspot profiles have no time-of-day window, so
  people outside their profile's hours are left off the list (`wifi_in_hours`)
  and the next fetch signs them out; `next` is shortened to land on a boundary.
- **No feed version is "bumped".** Each fetch computes the centre's list and
  diffs it against what that gateway *confirmed* (`ackedJson`); the gateway
  confirms by sending the version back as `since`. Nothing else in the codebase
  had to learn about Wi-Fi to keep it right.
- **Activity logging was dropped** (plan stage 4, the `wifi_activity` cap and
  tables). NDPA 2023 s.31 needs guardian consent for processing a child's data
  on that basis and s.28 a privacy impact assessment; filtering does not need
  the record. Gateways report counts only (`wifi_gateway_stats`, hourly).
- **Capability `network`**, never bundled into Admin (like `fees`/`journal`).
  The person lookup is a read on any of people/summer/network; changing one
  person's Wi-Fi stays with whoever owns their record (people / summer).
- **The Club portal hosts the Control Room's Wi-Fi page in place** (`CrEmbed`
  in `cr-shell.jsx`): the same tabs and blocks, with its own drawer, form,
  confirm and toast layers. Not a second drawing; not a redirect.
- **Diagnosis** (`wifi_gateway_diagnose`): never connected, silent, wrong-key
  fetches (a warning while it still fetches), the gateway's own error put into
  words, RouterOS too old, slow line, more promised than the line can give (fair
  share from the measured line and the week's peak), CPU, memory, restarts.
- **Speed**: profiles carry `burst` and `priority` (MikroTik rate-limit). Lines
  are measured by staff devices (`/api/admin/wifi-speed.php`, timed in the
  browser by `NGGApi.admin.wifi.speedTest`) and by MikroTik gateways nightly or
  when asked (`/api/hooks/wifi-speed.php`, second-resolution: a guide).

Status: every platform but `generic` is **pilot first** — the scripts follow
the makers' manuals but cannot be run here. Pilot MikroTik at one centre. Still
open from the plan: the owner's decisions (hours, fees rule, pilot centre,
optional categories); day passes (`ngg-guest` exists as a profile only); a
branded hotspot login page. Migrations 189–190. Tests: the Wi-Fi block in
`api/tests/run.php`, `tests/wifi.test.js` (`npm run test:wifi`).

### PLANNED, not built: Wi-Fi at 2,000 centres, in regions (owner, 2026-10-27)

**The requirement.** NGG projects about **2,000 centres**, grouped in
**regions**. An NGG admin manages Wi-Fi **for their own centre(s)**, never
the whole network. What was built on 2026-10-27 assumes a handful of centres
seen by one systems person, so it does not meet this yet:

- the `network` gates in `domain/wifi.php` (overview, gateways, access table,
  speed tests) ignore `centreScope`. Only the person lookup and the speed-test
  save are scoped;
- `admin_wifi_overview` returns every gateway, every centre and the latest 40
  tests in one reply, and `wifi_health_context` reads every speed test from the
  last 30 days. At 2,000 centres that is a list problem (CLAUDE.md §6: filter
  above the page cap, page on the server);
- the access table and the profiles are one global setting. A region may need
  its own speeds (its lines differ), and a centre its own hours.

**Regions first (a centre-management change, not a Wi-Fi one).** There is no
region in the schema today. Plan:
- a `regions` table (id, name, code, status) and `centres.regionId`, managed in
  Members → Centres (People capability, like centres; CLAUDE.md §4 "ownership
  follows the data");
- staff scope gains regions: `centreScope` may name a region, and
  `admin_centre_names_in_scope()` expands it to its centres. That is the one
  place scope is resolved, so every scoped screen gets regions at once;
- a **regional lead** role (scoped, like `centre_lead`) whose scope is a region;
- the centre directory and every centre picker become server-side search with
  region and status facets and paging, not a 2,000-row select.

**Then Wi-Fi at scale.**
- **Scope every Wi-Fi op by centre**, on the way in and per row
  (`admin_centre_allowed`): a centre's admin holding `network` sees and acts on
  their centre's gateways only; a regional lead their region's; a super admin
  everything. Add/edit/rotate/remove refuse `out_of_scope`.
- **The Gateways tab becomes a server-side list**: search, facets (region,
  centre, platform, health), sort, paging and a true total, with
  `admin.wifi.gateways` replacing the all-in-one overview. The overview keeps
  only counts, by region (working / need a look / silent / not set up).
- **Health by region**: a region roll-up (how many centres working, the
  slowest lines, the busiest) and a drill-down to its centres. Silent gateways
  are counted, never listed in full, above the page cap.
- **Settings inherit**: network default → region → centre for the access
  table, speeds, burst, priority and hours. Store only overrides
  (`wifi_settings_overrides`: scopeType, scopeId, json), resolve in
  `wifi_settings($centre)`, and show where each value comes from. The feed
  already reads settings per gateway, so this is one change in one function.
- **Speed tests** read per centre, paged. `wifi_health_context` takes the page's
  gateway ids, never "everything from 30 days".
- **Bulk acts** through the admin action layer (CLAUDE.md §6): rotate keys for
  a region's gateways, ask for line tests, each capped, with the count read
  before the confirm and one audit event per run.
- **Load**: 2,000 gateways each fetching every 2–5 minutes is about 7–17
  requests a second on shared hosting. Before rollout: cache each centre's
  computed list for 60 s (keyed on the centre and the settings version), and
  measure a fetch's cost. If it is too much, serve the feed from a small
  separate host, or move the default poll to 5 minutes.
- **Alerts**: one digest per region lead when a gateway is silent for an hour,
  not one email per gateway.

**Order.** (1) regions and region scope, with tests; (2) Wi-Fi scope on every
op, with tests; (3) the server-side gateway list and the region roll-up;
(4) settings inheritance; (5) load caching, measured, before more than a pilot
region goes live.

## Focus rings on the public site (2026-10-27)

The owner reported a focus-ring problem. Measured with a keyboard walk of 16
public pages (761 Tab stops), 728 had one:
- **Contrast.** The ring was gold — `rgba(245,176,38,.5–.6)` in most rules,
  solid `--gold-500` in the safety net — which is 1.3–1.9:1 on cream and 1:1 on
  a gold button. A focus indicator needs 3:1 (WCAG 1.4.11).
- **Shape.** Two global rules (styles.css and an older duplicate in
  styles-app.css) set `border-radius: 6px` on whatever had focus, so pills,
  round buttons and cards changed shape when tabbed to.
- **Clipping.** Accordion rows inside `overflow: hidden` cards (Parents FAQ,
  About, Timetable start rows, Community tabs, Blog hero chips) lost the ring.
- **Containers.** The newsletter field and the Summer School search drew no
  ring of their own and their container's was faint.

Now there is one token, `--focus-ring` (styles.css `:root`): navy on light
surfaces, lime inside dark ones (`.dark-surface, .hero, .footer, .prefooter,
.page-hero-dark, .marquee, …`; a light `.card` inside a dark section goes back
to navy). Every public-site ring uses it; the global rules no longer touch
`border-radius` (outline follows the element's own corners). Navy sections
that were only an inline style now carry `className="dark-surface"` (home,
about/anchor, blog, club community hero, other pages). Clipped controls use an
inset ring (`outline-offset: -3px`). The public Community search had its chrome
— and `outline: none` — in an inline style; it is `.cm-pub-search` /
`.cm-pub-search-in` now, and the box takes the ring ("one ring for one field"). The sticky top bar no longer covers a focused
control: `html:has(.topnav) { scroll-padding-top: 96px }` (WCAG 2.4.11). The Design Studio, a dark room, re-points
the token to its gold.

`tests/focus-ring.test.js` (in test:all, `npm run test:focus`) walks the main
pages and fails on a stop with no ring, a ring under 3:1 against what is behind
it, a shape change, or a clipped or covered ring. A new dark section that
forgets `dark-surface` fails there as navy-on-navy.


### Wi-Fi at scale: built (2026-10-27) — the Wi-Fi half of the plan above

The owner's direction: build the Wi-Fi side now; **NGG-wide regions and
centre management stay planned** (the "Regions first" part of the plan above
is unchanged and still to do).

- **Scope (`wifi_scope`, `wifi_gate`).** Every Wi-Fi op is limited on the way
  in: a super admin sees every centre; a **Wi-Fi region lead** their regions'
  centres; anybody else holding `network` the centres in their `centreScope`,
  or — with none — **their own centre only**. The network's access table and
  default speeds, and the shaping of regions, are for somebody who sees every
  centre (`network_wide_only`).
- **Wi-Fi regions** (`domain/wifi-regions.php`, migration 191): `wifi_regions`,
  `wifi_region_centres` (one region per centre), `wifi_region_leads` (staff who
  hold `network`). A Wi-Fi grouping only — `centres` is untouched. **When
  NGG-wide regions are built, migrate these into them** (one region concept,
  CLAUDE.md §11) and keep `wifi_region_of()` as the one place that resolves it.
- **Speeds inherit** network → region → centre (`wifi_profile_overrides`, only
  overrides stored; `wifi_settings($centre)` resolves and says where each value
  came from). Each gateway's feed carries its centre's.
- **Lists at 2,000 centres**: `admin.wifi.gateways` and `admin.wifi.centres` are
  searched, faceted, sorted and paged on the server with true totals and
  "select every match" ids; health is derived per gateway over the whole scope
  before the page is cut.
- **Load**: a centre's computed list is kept 60 s (`WIFI_LIST_TTL`, config
  `wifi.list_ttl`), PINs sealed in the cache; a change made in Wi-Fi drops it
  at once, a record change elsewhere reaches it within the minute.
- **Analytics** (`admin.wifi.analytics`): every fetch is a heartbeat
  (`wifi_gateway_daily`, kept 400 days; hourly rows 14), so availability is
  measurable on every platform. People online per day (peak/average),
  availability, line speed, the week's busy hours, busiest/slowest/least
  available, health by region. Gateways never connected are counted apart.
- **The Club portal's Wi-Fi is its own** (`src/modules/club3/cp3-wifi.jsx`,
  `.cw-*` in the Club's design: Overview, Gateways, Regions, Speed tests, Who
  gets on, Setup in the sidebar). The embedded Control Room (`CrEmbed`) was
  removed: the owner found a Control Room inside the Club portal out of place.
  The Control Room keeps its own Wi-Fi page (now with Analytics and Regions).
  Both call the same ops; neither owns logic the other lacks.
- Still open: alerts (a digest per region lead when a gateway is silent), bulk
  acts per region (rotate keys, ask for line tests), the load measurement
  before more than one pilot region.

## Parents pay; children ask (2026-10-27)

The owner: parents should be able to pay in advance for membership and dues,
their dashboard felt empty, and a child should not record "I've made a payment"
but nudge a parent to pay or to confirm they paid — with one button, not two.

- **Paying ahead** is an invoice of a new purpose, `advance`
  (`membership_advance_invoice`). Settling posts only the payment: the charges
  arrive on their own dates through the accrual and meet the credit. Pre-posting
  the months was rejected: it would charge a fee at today's price for a month
  that may be priced differently, and a parent who paid "three months" would
  see three charges and no balance. `membership_advance_plan` walks the
  upcoming charges in date order and spends the credit on them, so "paid ahead
  to March" is what the accrual will do, renewal included. Quotes (1/3/6/12
  months) are priced by the server; the page sends only the number of months.
  A new advance or balance invoice voids the other's open one, so a family
  never holds two links for overlapping money.
- **A payment claim moved from the member to the parent.** The member route
  passes `fromMember` and `member_request_create` refuses `payment` with
  `ask_parent`; the family route accepts it (FAMILY_REQUEST_KINDS). This
  reverses "a parent cannot claim a payment" — the old reason (a verified
  receipt is the member's path) no longer holds once the member has no path.
  The desk's check is unchanged: a claim moves no money until approved.
- **Ask my parent** (`member_family_nudge`): one ask, to every active parent, a
  `guardian_notices` row (kind `nudge`, tied to the child) and an email; once a
  day by the notice's unique key. It is refused when nothing is owed.
- **The family Today** gained quick actions, Coming up and the child's
  lessons, below the compiled design (`mainSlotEnd`), and the child's ask in
  the to-do list. Fees gained Pay ahead and "Paid by transfer or at the desk?".
- The member app's two buttons were recompiled from the design
  (`member-portal-v9.dc.html`: `openAsk`); the compile was checked to be
  byte-identical before the edit.

## Wi-Fi: the three open items (2026-10-27)

- **Silent gateways** (`wifi_silent_digest`, web cron `wifi_silent`, every 15
  minutes): one digest per person, region leads first, then the staff whose
  Wi-Fi scope names the centre, then those who see every centre. Told once per
  silence (`silentAlertAt`, cleared by the next fetch).
- **Bulk acts** (`admin.wifi.gateways.bulk`, actions `test` | `rotate`, over a
  selection or a region): capped at `WIFI_BULK_MAX` 500, validated before any
  write, scope refused per row, `unchanged` for a test already asked, `expect`
  must equal the count, one audit event. A region needs the Wi-Fi regions
  capability or to be its lead. Rotated keys are returned once, as a list to
  copy. `admin.wifi.gateways.ids` gives "all N matching".
- **Load** (`wifi_load_record` from the feed route, `admin.wifi.load`): wall
  time from the request's start, bytes, peak memory and time buckets per hour.
  The projection is gateways ÷ poll × average time against a budget of a
  quarter of one worker (`WIFI_LOAD_BUDGET`); fewer than 100 fetches reads
  "not measured". This is the gate the plan named: a second region goes live
  only once it reads *Within budget*.
- Router scripts stay **pilot first** on real hardware; nothing here changes
  that.
- Also: the members search box drew a second focus ring on its input
  (`.cr-app :focus-visible`, 0,2,0, beat the exemption's 0,1,1). The exemption
  is `html:root …` now (0,2,2); `tests/control-room.test.js` checks one ring.

## Anchor Circle merged into the family account and the mentor portal (2026-10-28)

The owner: merge the two parent portals; the mentor part of Anchor Circle
goes to the mentors, and assigned mentors are connected automatically. Teachers
were first moved into the family account, then dropped on the owner's word:
the circle is a child's parents and their mentor.

- **One Anchor core** (`domain/circle.php`): `anchor_week`, `anchor_confirm`,
  `anchor_remark`, keyed by the adult's link. Three doors call it:
  `family.anchor*` for a parent's family link (`anchor_family_link`), and `member.mentor.anchor*` for a child in the
  mentor's caseload (`anchor_mentor_ctx` → `mp_caseload_ids`: active
  assignments, and a lead's team). No code for a mentor; the assignment is the
  connection, and ending it ends the connection.
- **What each adult sees**: the week and the conduct figure (any adult's
  confirmations count), but only their OWN confirmations and notes — another
  adult's words to the child are the child's. Days are this week up to today
  (the old portal took any date). Five notes per adult per child per week; the
  child is told each one came.
- **The old portal** (`/circle`, `api/public/circle.php`, the token ops) is
  retired: the ops answer `moved` with where to go, the route answers 410, and
  the page says where parents and mentors go now and forgets the
  browser's old tokens. `circle.lookup` stays internal: it is the code-and-name
  check every connection runs, and the tests that pin its guard still call it.
- The member's *Anchor Circle* card lists everyone connected (parents and
  mentors); its copy came from
  the design (`member-portal-v9.dc.html`), recompiled.

## Teachers dropped; the mentor reads the whole journal (2026-10-28)

The owner: "Drop teacher. … The mentors need to see the child's journal",
and, asked how far: "Nothing is private. Their reflections should be visible
too."

- **Teachers are gone** before they shipped: no `family_teacher_links` (taken
  out of migration 193, which now only marks the old `circle_links` moved),
  no `family.teach.*` ops, no *Students you teach*, no teacher home, no
  teacher card on /circle, no `member.circle.revoke` (it only ended teacher
  links). Old `circle_*` rows may still carry `role = 'teacher'`; they count
  and are never shown as a link.
- **`member.mentor.journal`** (`domain/mentor-portal.php`, view `journal`):
  every entry of one mentee, any visibility, 30 a page, gated on the caseload
  (`mp_caseload_ids`) and **refused to a peer mentor** (`peer_no_journal`) —
  the one rule kept, because a peer mentor is a minor and the existing
  safeguarding line already kept shared entries from them. One audit row per
  read. The mentor portal's mentee page has a *Journal* tab (not for peers).
- **Weekly reviews** are always saved to the journal in full, obstacles
  included; "share" now only decides whether the mentor is sent it.
- `private` now means "not sent", and the copy says so: "only you and your
  mentor" in the journal app, the member app, the Club journal and the family
  app's card (parents still do not see the journal).
- Tests: the PHP suite pins the mentor read (private entries included, newest
  first, paging, audit) and both refusals; `tests/mentor-v15.test.js` opens
  the tab.

## The timetable, for a child (2026-10-28)

Closes "For the next agent: the timetable UX needs work" (2026-10-24). A child
wrote to their mentor "I am having trouble doing my timetable"; the owner
found creating one confusing and said the kinds of week are "just presets:
they should be able to build freely".

- **Member portal → Timetable** leads with **Your class** (course, day, time,
  room, instructor) from the server's `mine`, then *Classes on <day>* with
  theirs marked **Yours** in words, then *The rest of Saturday* (the
  Formation day) on its own — it used to replace the course slots outright.
  The division card no longer lists a whole division's courses as "yours",
  and its icon follows the division (it was always a code icon).
- **Make my week** opens the maker at `/timetable/me?centre=<slug>`: the
  centre's classes are in, the child's own marked from `member_timetable`
  (not a guess from the track), once sign-in has settled.
- **The maker builds freely from the first second**: the add box and the
  days are always there. "What's your week like?" (six equal tiles) is gone;
  in its place an optional *Not sure where to start?* — your NGG classes,
  your school lessons, your study time, each one button and a tick — and the
  kinds of week as **Suggestions for:** chips that only change suggestions.
  The import dialog offers a member's own centre first.
- Tests: `tests/timetable-ui.test.js` was failing on `main` (it waited for the
  retired member table); it now pins the member screen, the maker opening
  with the classes in, and a first-time visitor typing a class with no preset.

## Mentor Messages restructured; Lessons gate (2026-10-28)

The owner: "Improve the messages features of the mentors. The UX is currently
terrible … the structure of the messages … is too messy."

- **Was:** one flat list from `member.mentor.messages` in which a child
  appeared once per chat, once per shared journal entry and once per
  check-in, each with its own kind label and reply thread, under up to six
  filter chips; a lead conversation showed only what reached you.
- **Now:** `Mp15Inbox` (`mp15-app.jsx`, rendered from `slotEnd`; the design's
  compiled list is switched off with `onMsg: false`) groups the same rows by
  PERSON (`mp15InboxPeople`): a child's chat, sent journal entries and
  check-ins are one time-ordered conversation, and one reply goes to
  `chat:<memberId>` (old replies on `journal:`/`checkin:` threads stay in the
  timeline). Groups: Needs a reply (the last word is not yours), Children,
  Families, Colleagues. Two panes by container query (`.m15m-wrap`), one on
  a phone. Opening a conversation marks all its parts read.
- **Server:** lead threads now carry both sides (`thread`), and a lead
  conversation you started with no answer yet is listed.
- **Lessons on the mentee page** used the older record gate (screening,
  centre, cohort): a mentor whose own record names another centre saw Growth
  open and "Couldn't load their lessons" under it. A child in the caseload is
  now enough, as for Growth (`mentor_child_lessons`).
- Tests: PHP pins the Lessons gate; `mentor-v15.test.js` pins one row per
  child, the merged timeline, the reply, and the phone layout (80/0).

## Wi-Fi data used per person, allowances, clearer setup guides (2026-10-28)

The owner: "Build the Wi-Fi usage tracking, staff and members only, with
limits", and "improve the clarity of your guide".

- **Migration 194**: `wifi_usage_daily` (bytes down/up per person, per local
  day, per centre, with centreId; in CENTRE_NAME_TABLES), `wifi_usage_sessions`
  (each gateway's last counters per session), `wifi_gateways.usageAt`.
- **In**: `POST /api/hooks/wifi-usage.php` (`wifi.usage`, gateway key in the
  headers, CSRF-exempt like every hook). Text lines `s;user;session;in;out` as
  the router counts them, or JSON from the person's side. NGG adds only the
  difference since a session's last report; a counter that goes down is a new
  session; a jump over 50 GB is a broken counter. What a session moved after
  its last report is lost (one poll interval). The MikroTik script posts its
  `/ip hotspot active` counters before each fetch, 100 sessions a request.
  RADIUS and OpenWrt don't report yet (`can.usage` false).
- **Allowances**: `dayMb` / `monthMb` on each profile (layered like speeds;
  the network forms edit them). `wifi_access_for` checks the profile a person
  would have when on; over it, the new `overLimit` case (default Limited; Off;
  On = watch only). Overrides still win. The centre list reads everybody's
  month in one grouped query (`wifi_usage_totals`, by id in chunks); crossing
  an allowance drops the centre's cached list so the next fetch applies it.
- **Who sees it**: `admin.wifi.usage` (network, Wi-Fi scope; Control Room and
  Club portal *Data used*) and the person's own `member.wifi.get` → `usage`.
  Not families. Privacy copy that said "never who is online" now says what is
  kept: amounts per person per day, never sites.
- **Guides**: `admin.wifi.gateway.setup` now returns `summary`, `time`,
  `before[]`, `steps[{h, text, cmd, script, tip}]`, `reports` and
  `trouble[[problem, fix]]`. Both screens render the script and commands
  inside their step; `check`/`diagnose` are gone.
- Tests: PHP +21 (`usage ·`), `tests/wifi.test.js` 48/0 (HTTP report, guide
  order, Data used in both portals with axe, the member's meter over an
  allowance). It now waits for boot after every navigation.

## MikroTik setup: one install line, not a pasted script (2026-10-28)

The owner ran the guide on a real router (RB951Ui, gateway CACENTRE-EGBEDAX)
and it failed in five places, all ours:

1. The script still said `PASTE-THE-KEY-HERE` (the guide had been opened
   without the key), so every fetch was refused: `fetch_failed`.
2. `failure: not allowed by device-mode` — RouterOS 7.17+ refuses schedules
   (and usually `/tool fetch`) until `/system device-mode update scheduler=yes
   fetch=yes` is confirmed with a button press or power cycle.
3. The WinBox terminal cut the long `source={…}` paste short (lines of empty
   `{{{...`), leaving a broken sync script.
4. `:local hs` does not survive to the next terminal line, so every
   `in-interface=$hs` was empty: `ambiguous value of interface`.
5. The guide asked anybody to paste 130 lines at all.

Now: `GET /api/hooks/wifi-setup.php` (`wifi.setup.script`, gateway id + key in
headers) returns the router's setup file with its key written in, and the
guide's step 4 is ONE line that fetches it and `/import`s it. The file stops
with the reason when there is no key (a key is 40 characters) or no hotspot;
schedules are added inside `on-error` with the device-mode advice; the
filtering block is one `:foreach` over every hotspot, so the interface is
known on every line. The guide: device-mode first (with the button press),
then version and clock, hotspot, the install line, the check, and a fix for
each message the owner saw. Both screens' main button copies the install line;
"Download the setup file" is there for a router that can't fetch.

## Wi-Fi: NGG sends its roster to CACENTRE (2026-10-28)

The owner moved the Wi-Fi's authority to CACENTRE ("CACENTRE controls it; the
super admins still have a say"). CACENTRE's side is in the cacentre-site repo
(`cac/docs/wifi.md`). This is NGG's side: `domain/wifi-cacentre.php`.

- **What goes.** Every NGG member and every staff, mentor or instructor
  account, plus participants of a live edition. Summer-type member rows are not
  sent; those people go as participants. Each person carries their id, kind
  (member | staff | participant), name, email, printed ID (their sign-in
  name), home site (the centre's card code, lower-case; staff have none, so
  they can sign in anywhere), NGG's verdict with WIFI_CASE_WORDS as the reason,
  and a participant's edition end date. Nothing else: no phone, birthday,
  guardian or money. A PHP check pins the field list.
- **The verdict is the existing access table.** It uses `wifi_access_for` and
  `_for_participant`, with this centre's settings, policy states, fees and the
  hand overrides, all read in batches. NGG's own usage is left out of it
  (`usage => null`), because CACENTRE counts allowances now and counting here
  too would charge the same megabytes twice.
- **Signed, pushed, every 15 minutes.** The token uses the directory push's
  v1 envelope with typ `wifi.roster` and its own key, `WIFI_SECRET_NGG`
  (environment variable or `config.wifi.cacentre_secret`). It is posted to
  `/api/wifi-roster.php?issuer=ngg`. The web-cron tick `wifi_cac` does nothing
  until a key is set. One push is `full` (anybody not sent is withdrawn), up
  to 5,000 people. A longer list goes in partial pushes, which withdraw
  nobody, and the screen says so. The cap is CACENTRE's: it now refuses an
  oversize full list rather than cutting it.
- **Screen.** A note on Control Room → Wi-Fi → Gateways shows the last push,
  any refusals, any home sites CACENTRE has no site for, and errors in words.
  A super admin has **Send now** (`admin.wifi.cacentre.push`; refused for a
  centre-scoped network holder, because the push speaks for every centre).
- **Proven end to end** against CACENTRE's real code on a throwaway MariaDB:
  the people land, and the router at the site gets exactly the right sign-in
  names. Suspending somebody at NGG and pushing gives `u;026-702;;;remove` at
  the router's next fetch. A deleted record is withdrawn. An unknown centre
  code is named back, and a wrong key is refused with `bad_signature`.
- **Not yet.** The member app's Me → Wi-Fi still shows NGG's own PIN. The
  next step is fetching the card from CACENTRE (`/api/wifi-card.php`,
  `wifi.card`) once the routers have moved, then NGG's feed answers "moved".

### Correction, same day: one connection, and PINs stay on the dashboards

The owner: "Use the existing connection between CACENTRE and the websites. Do
not recreate a new one", and "The members should still get their pins from
their dashboards. CACENTRE just controls and distributes."

- **The separate Wi-Fi key and envelope are gone, on both sides.**
  `WIFI_SECRET_NGG/_AVG`, `config.wifi.cacentre_*` and CACENTRE's
  `WifiEnvelope` are removed. The Wi-Fi rides the directory push's connection:
  `dirpush_secret()` / `dirpush_ready()` / `dirpush_base()` here, factored into
  `dirpush_sign($typ, …)` and `dirpush_post()`, which `dirpush_mint`/`_send`
  now call too. At CACENTRE, `DirectoryEnvelope` with
  `DIR_PUSH_SECRET_<APP>` gains the document types `wifi.roster` and
  `wifi.card` (and a size limit per type). `typ` keeps the three documents
  apart, so a roster is never a directory push, nor the reverse.
- **Me → Wi-Fi asks CACENTRE** (`wifi_cac_member_view`, op `wifi.card`
  show | newPin) once NGG is connected and no NGG gateway still serves where
  the member signs in (`wifi_cac_serves`: their centre, or any centre for
  staff, heard from within a day). The view has the same shape as
  `wifi_view()`, so the screen is unchanged. CACENTRE's card now carries
  `resetsLeft`, `pinSetAt` and `hasRouter`. When CACENTRE can't be reached,
  the screen says `cacentre_unreachable` with a retry, never NGG's stale PIN.
  No new PIN is given to somebody who is off (`wifi_off`).
- Proven again end to end on MariaDB over `DIR_PUSH_SECRET_NGG`: the member's
  dashboard shows 026-701 with a six-digit PIN from CACENTRE, *Get a new PIN*
  changes it there (3 left → 2), a suspended member gets no PIN and NGG's own
  reason, and a wrong key is `bad_signature`.
- The Control Room desk (*Why can't somebody get on?*) still shows NGG's say
  and NGG's PIN; it is NGG's side of the decision.


### The router's setup file answers with 200 (2026-10-28)

The owner pasted the install line with `PASTE-THE-KEY-HERE` still in it, and
RouterOS printed only `ERROR parsing http: 401 should contain www-authenticate
header`. `/tool fetch` saves nothing on a 401 without that header, so the
`:error "NGG Wi-Fi: …"` file we sent never reached the terminal. The hook now
answers a refused key with 200 and that file, which `/import` stops on, with the
reason. The key is still checked, and nothing but the error line is served. A
left-in placeholder gets its own sentence, saying where the real line is
(*Rotate the key* on the gateway). CACENTRE's `api/wifi-setup.php` has the same
fix.

## The framing tool previewed the wrong photo box for each ID (2026-10-28)

The owner: "The card sizing uses the wrong photo size for the wrong IDs". The
studio's *Frame photo* dialog kept its own list, `IDS_FRAME_SHAPES`, and it was
wrong for every card:

- "Member card" was a 0.82 portrait. The member card's photo is full bleed,
  54 × 37.8 mm (≈1.43, landscape).
- "Summer School" was 404 × 318, which is the volunteer card's box.
- "Round" was unlabeled, but it is the Summer School card's circle.

People framed photos against the wrong card. The shapes are now declared beside
each renderer:

- `NGGC_PHOTO_MM` in card-template.jsx, which the member card's `S` now reads;
- `VOL_CARD_PHOTO` and `CARD_FRONT_PHOTO` in page-other.jsx;
- `tplPhotoBox()` for a design's `{{photo}}` image.

`idsPhotoShape(kind, design)` / `idsFrameShapes()` read those, with the
person's own card (or its assigned design) first. tests/ids-photo-shape.test.js
pins both ends, and the studio's browser test opens the real dialog.

The Design Studio's "NGG member ID — front" preset (an inset 470 × 370 photo)
is left alone. It is a separate starting design, not the card the studio
prints.

## Moving NGG's routers to CACENTRE; refusals RouterOS can read; `signal` on MySQL (2026-10-28)

**The move.** Migration 195 adds `wifi_gateways.movedAt`.
`admin.wifi.gateway.moved {gatewayId, undo}` is refused until NGG is connected
(`cacentre_not_connected`). A moved router:
- is answered `#error;moved_to_cacentre` by the feed, never an empty list, which
  would sign everybody out of a router that hadn't really moved;
- gets one diagnosis line, *Runs from CACENTRE*;
- is left out of the silent digest and of the data-used "counting" list;
- no longer holds its centre on NGG's PINs (`wifi_cac_serves`), so members flip
  to CACENTRE's PIN at once.

Undo clears the acked state, so the next fetch is a full list. Once connected,
the Control Room's primary action is *Add a router at CACENTRE*, so there is one
place a router is set up. The router's sheet lists the three steps with the
centre's site code.

**Refusals.** RouterOS's `/tool fetch` keeps no body from a 4xx. The feed now
answers a MikroTik (by User-Agent) with 200 and its `#error;` line, and NGG's
and CACENTRE's scripts read that line and log it (`bad_key`,
`moved_to_cacentre`) instead of `incomplete` or `fetch_failed`. Other platforms
keep their status codes. CACENTRE has the same fix (`wifi_router_refusal()`).

**MySQL.** Running the suite on MySQL (MariaDB 10.11) for migration 195 found
that `lesson_feedback.signal` is a reserved word there. The table could not be
created and every read was a syntax error, on every MySQL deployment since
lesson feedback shipped. SQLite accepts the name unquoted, which is why the
SQLite suite never saw it. The fix:
- the mirror quotes the column;
- the two raw queries quote it;
- `db_insert`, `db_update` and `db_upsert` quote names on
  `DB_RESERVED_COLUMNS` through `db_ident()`, so every other statement is
  unchanged.

Result: MySQL suite 5860 passed, 0 failed.


## 2026-10-28 — Saturdays shown Present and Absent (CACENTRE check-outs)

A member's record listed some Saturdays twice: Present at 07:34, and Absent.
`member.checkoutRequired` makes the nightly sweep log a day with a sign-in and
no sign-out as `no_checkout` plus an "Incomplete day" absence. The CACENTRE
gate had check-outs to NGG switched off (`"checkouts": false` in its ISSUERS),
so every gate arrival on a programme day became an absence; weekdays are not
programme days, so only Saturdays showed it.

- `policy_checkout_landed()` voids that day's `no_checkout` and incomplete-day
  absence (only those; a never-came absence is untouched) and re-derives
  sanctions. Called from the gate hook's `out` path, the desk and the summer
  check-out.
- The hook keeps a re-sent departure's own `scannedAt` when it falls on the
  day it names, up to 45 days back (arrivals stay clamped to 24 h), and sends
  no sign-out email for a past day.
- `admin_member_record` shows one row a day (`kind: incomplete`, "No sign-out ·
  counted absent") and counts it once; `member_records` marks the day too.
- CACENTRE (branch `claude/gate-ngg-checkouts`): check-outs on, and the
  back-fill takes `days` up to 31. Deploy NGG first, then the gate, then press
  "…from the last 31 days".

Result: PHP suite 5855 passed (SQLite), 5870 (MySQL), UI smoke 661, 0 failed.

## Courses as a stored fact: placement and course health (2026-10-28)

The structural fix proposed on 2026-10-24, built. Owner's decisions:
- Children see their proposed courses marked "not confirmed yet" until staff confirm.
- Media Lab and Practical Coding stay as courses inside their divisions (no lesson moved).

### Data (migration 178, `members`)
- `coursesProposed`: the record's suggestion, for an unplaced member.
- `coursesReason`: why ({from, dropped}).
- `coursesFlag`:
  - `other_division`: the card names another division;
  - `whole_division`: a division word gave every course;
  - `no_match`: nothing names a course.
- `coursesInputs`: a hash of track, disciplines, division and the course list.
- `coursesConfirmedAt` / `coursesConfirmedBy`.
- `members.courses` stays THE placement. Courses chosen before this existed count as placed.

### One rule, every reader
- `curriculum_member_courses_infer()` is the only inference. It proposes only real courses (catalogue, division lists, unit courses, course channels), never a division's word. Interests stay inside the track's division; anything else is `dropped` and flagged.
- `members_courses_backfill()` stores a proposal whenever the inputs change. `db_write_gen()` (a counter every write moves) keeps it to one pass per change, never one per row.
- `member_course_sql()` and `member_takes_any()` read the STORED proposal, so SQL class lists agree with the PHP lesson and channel lists. `tests/course-placement.test.js` and the PHP suite pin "lessons and class lists agree".
- `curriculum_course_ctx_shared()` reuses one course context per request until a write, so per-child lookups in lists are not N+1.

### Ops (`domain/course-placement.php`, `api/admin/courses.php`)
- `admin.courses.placement`: lists by status (flagged/unplaced/none/placed/all), with counts, search and paging; `ids=1` gives select-all. Scoped; cap `people`.
- `admin.courses.set`: `confirm` / `set` / `add` / `remove`.
  - Validated before any write; catalogue spelling; cap 500.
  - Per-row verdicts: `out_of_scope`, `not_a_member`, `nothing_proposed`, `unchanged`.
  - One audit event per run.
- `admin.courses.health`: every course with children placed and proposed, instructors, published lessons (own, and under its parts), class times and channel. Gaps are named with what to do. It calls `community_ensure_channels()` first.

### Control Room (native blocks, not v1 panels)
- Members → **Courses** (`CR_TAB_DEFS.courses` in `cr-tab-members.jsx`): KPIs, a flagged note, and a server table with a "Show" filter and bulk Confirm / Add / Remove / Set (select all matching). The row drawer has Confirm, Change courses and Open their record.
- Learning → **Course health** (`cr-tab-learning.jsx`): KPIs, then every course, failing first. The drawer lists the gaps, with buttons to Curriculum, Volunteers, Timetable or Courses.
- The first build of these used v1 panels (`crPanel`); the owner flagged them as the old interface, and they were rebuilt as native tabs.
- `.cr-tbl td.cr-c-wrap`: the wrap class never applied, because `.cr-tbl td { white-space: nowrap }` outranked it. Every "wrap" column in the Control Room now wraps.

### Member portal
The course card says "· not confirmed yet" while a child is unplaced (`member_timetable.coursesConfirmed`).

### Also
- The id-studio tamper check could pick the token's own last character (about 1 run in 64); fixed.

### Tests
- PHP 5290/0.
- `course-placement.test.js` 7/0 (added to `test:all`, script `test:cplace`).

### The lesson sheet is gone, not just unreachable

`openLesson()` navigated to `/learn/lesson/<id>`, which left the member
portal's whole lesson sheet — markup, check questions, marking, part
tracking, read-aloud — sitting in the tree with nothing able to open it. Dead
is not harmless: it was a SECOND renderer for a lesson, and a second renderer
is what CLAUDE.md §11 forbids, because the two drift and what you see stops
being what the member gets. Removed from both halves — the `shLesson` block in
`member-portal-v9.dc.html` (recompiled to `mp9-view.jsx`) and the values in
`mp9-more.jsx`. `speak()`, `canSpeak()` and the PDF reader stay: the mentor
thread and the journal prompt use them.

**The sheet knew something the shared component did not.** A PDF on the image
cloud is not delivered to a browser, so its own address opens an error page;
the sheet fetched it through `api/member/lesson-file.php` instead, and the
Learn app, built on `CurriculumMaterials`, did not. That fix now lives in the
shared component where every surface gets it — but it is passed IN
(`fileUrl={curMemberFile}`), because the route is gated on a member session
and the same component draws an instructor's preview. The caller names its own
gate; neither surface has to know about the other's. "Open ↗" follows the same
address as the reader, or the one control meant to rescue an unreadable file
is the one that opens the error page.

**A pre-existing failure, reported rather than hidden:** `no-important.test.js`
was already red on this branch from `3a8e3d2` — `curriculum-ui.test.js`
injects `display: none !important` into the page it drives, to hide a toast
over a control it must click. That is the harness overriding the product for
one assertion, not the product shipping an override, so it is an ALLOW entry.
`npm run test:all` had been failing at that step before any of this work.

### Where a course leads: the provider registry

The curriculum named its routes out from the day it was written —
`curriculum-studio-trades` sends a learner to Trinity Drama and the NBTE
National Skills Qualification, practical coding to freeCodeCamp, tech
foundations to Cisco NetAcad and Google — and all of it lived in lesson prose
and material links. Two things were wrong at once: a child finished
twenty-four weeks and nothing told them there was a recognised certificate at
the end of it, and nobody could answer how many members hold one.

Three tables, because the domain has three things: the organisation
(`providers`), the thing it awards (`provider_awards`), and the person who
holds it (`member_credentials`). Merging any two loses something real — one
body awards many different things, and "Trinity Grade 1" is not "Trinity".

The rules, each with a test:

1. **One row per member per award.** Recording it again is a correction, not a
   second credential. Grade 1 and Grade 2 are different awards, so a ladder
   still works.
2. **`earned` requires the date it was awarded.** Every count is built on it;
   a credential without one is a claim, not a record.
3. **An award belongs to its body.** A credential naming an award that is not
   under that provider is refused, never quietly re-pointed.
4. **Retiring a body takes nothing away.** A certificate already earned is in
   somebody's hand — same rule as retiring a centre.
5. **A body in use is not deleted silently.** It reports `uses` and refuses
   with `provider_in_use` unless `retire` (checked FIRST) or `force`.
6. **Lapsed is derived, never stored.** An expiry is a date and a date passes
   without any job running. Computed on read it cannot go stale; written by a
   nightly job it can, and then the record lies.

**A member can only ever say "I'm going for this."** A result is the
programme's record of them, so `prv_credential_write($m, $in, $byStaff, ...)`
refuses any state but `aiming` from the member themselves, and refuses to let
them edit a row once their centre has recorded against it. One writer behind
both callers, so a credential cannot be recorded two different ways.

Two bugs worth naming, both mine, both caught by tests rather than review:

- **`in_array((string)($d['status'] ?? 'active'), …) ? (string)$d['status'] : 'active'`**
  reads the default in the test and the RAW value in the result, so an omitted
  status stored `''` — and a row with an empty status is invisible to every
  read in the file. `prv_status()` defaults it once.
- **`held` meant "has a row", not "holds it".** The moment a member pressed
  "I'm going for this" the award jumped out of `routes` into `held`, where no
  button is drawn — so their own control vanished under them. An aim and an
  exam entry are routes in progress; only `earned` and `lapsed` are held.

**A third centre guard exists that is easy to miss:** a table carrying a
`centre` NAME must also have a `centreId` column, because `db_insert` mirrors
one into the other — the insert fails on the missing column, and the failure
surfaces as every later assertion in the block going wrong at once.

### The starter registry, and why it is read from our own lessons

A registry that ships empty is a feature nobody turns on. But this data goes
in front of children — a certificate we tell a child to aim for had better
exist — so none of it is remembered or guessed. `prv_seed_data()` is read out
of `api/_lib/seeds/curriculum-*.json`: the bodies, the award names, which of
our courses lead to each, and whether it is free are all taken from material
links our own lessons already carry. A test checks the part that actually
matters, which is not "it inserted rows" but **every course the starter
registry names is a course we actually teach**, against the bundled
curriculum.

What it deliberately does not carry is fees, grade names and exam dates.
Those change yearly and by country, and a stale price in front of a family is
worse than none. Seeding is explicit (`admin.providers.seed`), never
automatic, and idempotent by name — a body already there keeps every edit the
programme made to it, and only missing awards are added.

### The Learn app boots in one request, not three

Lessons, the school plan and where-the-work-leads were three separate calls to
the same route file: three HTTP round trips, three PHP bootstraps and three
session verifications before a child on a phone sees a lesson. On shared
hosting over a mobile connection that is the slowest part of opening the app,
and none of it is work.

`member.learn.boot` returns all three. What it must not do is couple their
failures — school results and the registry each had their own silence on
purpose — so each part is caught and comes back `null` rather than taking the
lessons down with it. The lessons are the exception: if those fail there is
nothing to draw, which the caller already handles.

`tests/learn-app.test.js` counts the requests the screen makes for its own
data and fails if it is not exactly one, so this cannot quietly go back to
three the next time a panel needs something.

**`null` must mean something.** `LearnAwards` returned nothing both when a
course genuinely has no route and when the load failed — the silent empty that
hides an outage (CLAUDE.md §9). An empty registry comes back as a real answer
with empty lists, so `null` means only "failed", and that case now says so and
offers the retry. Quietly, at the bottom of a course page: nothing there
blocks the work.

## Learn: the week as a working screen, and the child's own timetable (2026-10-29)

The owner called /learn "child's play": a narrow column of cards, nothing about the week, no class times.
- **This week:**
  - A header with the Club week (`member.learn.boot` now returns `me.first`, `me.weekNow`, `me.termWeeks`), a greeting, and what to do first, or what is late.
  - Beside the lessons on a wide screen: **Your next class**, worked out from the child's own timetable slots (`lrnNextClass`: the next occurrence from now; "on now" while it runs), and **Your courses** with each one's standing.
- **Timetable** (`/learn/timetable`, rail item):
  - The next class, then the child's own classes by day (Saturday first).
  - "The whole centre" is one tap away, with theirs marked. Each case has an honest empty state.
- **One request:** the timetable rides in the boot (`timetable`, soft-failing like plan and awards), so the first screen is still one request.
- **Lesson questions:** the choices are cards (8px apart, not 60), and the chosen one is outlined.
- Styles stay on the Learn app's own tokens. The two-column week is a container query on the app.
- **Tests:** `learn-app.test.js` 46/0 (greeting, next class from the child's own course only, course standing, timetable mine/all); PHP 5917/0.

## Audit of the other sessions' work (2026-10-29)

Merged into this branch:
- **Our branch's 77 commits from other sessions:** Wi-Fi (CACENTRE gateways, regions, analytics), Summer School portal v3, support cases, projects, notifications, the shared-email sign-in, consent withdrawal, and the instrument-is-a-course catalogue with bundled lessons.
- **`claude/community-audit-1aqug7` (38):** the Learn rail fix, providers (where courses lead), the block lesson editor, exams, the boot request.

Migration renumbering:
- This branch's course placement is 196.
- community-audit's 183 (providers) is 197. Its 181–183 had meant different things from ours; its 181 and 182 were already here as 186 and 187.

Fixes made during the audit:
- The Wi-Fi hours test failed every night between 00:00 and 02:00, because its "an hour ago" window wrapped past midnight. It now picks a window that never wraps.
- The id-studio tamper check could pick the token's own last character (about 1 run in 64).

Not merged (owner's call):
- **`claude/vibrant-cray-3gmdum`** ("Centres follow CACENTRE's locations"): it makes CACENTRE the only list of centres, so centres can no longer be added, renamed or retired here. It is built on an old base (its migration is 137) and conflicts in 8 files, CLAUDE.md included.
- **`gate-lookup`** (588 commits): a separate line of work (Afrovanguard and CACENTRE sync, NGV promotion consent, reset-code hardening, suspension reaching open sessions). It shares no history with this branch in this clone. It needs a deliberate port, not a merge.

## The timetable maker: a child's own week (2026-10-29)

The owner, after the Learn rebuild: "I meant the timetablemaker." Looked at as
a child (Tobi, Coding at Egbeda) through *Make my week*:

- **Was:** every Egbeda class went into the child's week (Chess, Coding, Piano,
  Media Lab: "4 classes a week", Piano drawn as a clash with Coding), titled
  "Egbeda timetable"; every block stamped YOUR COURSE with a gold ring; one
  Saturday drawn as a single row filling the A4 sheet; the three-step guide
  stayed full height above the week; the phone's day strip had only Saturday,
  so there was no Monday to tap to add school; "Today · 0 on".
- **Now** (`tt-app.jsx`, `tt-layers.jsx`, `tt-views.jsx`, `tt-ui.jsx`,
  `tt-poster.jsx`):
  - `addCentre(slug, quiet, pick)` puts in a member's **marked** classes
    (`member_timetable` `mine`), or the keys ticked in the import dialog, or —
    for someone whose classes are unknown — all of them. `fetchCentre` is the
    one read; `ttSlotKey` (course|day|start) is a session's identity.
  - Import → **Which classes are yours?** (`.tt-pick`): every session at the
    centre, what is already in the week (else the member's own) ticked.
  - The centre note names the classes put in and how many more run there,
    with *Choose classes*. Title "<first name>’s week" for a member.
  - Official sync compares only the courses kept (and a member's own), so a
    class left out never appears as "changed 1 session".
  - "Your course" (pill, ring, poster tag) only where it distinguishes:
    `ttMarksMine` — some centre class in the week is not theirs.
  - Poster: days run down the page (`rows`) only from four days; fewer use
    the time-down grid, and a block the size of a door sign gets larger words.
  - The guide steps aside once the week has something: *Next steps*, done
    steps as one line, placed after the week (`TtStartSteps at="end"`).
  - Phone and list: the days to build on are Mon–Fri plus any weekend day in
    use (`ttEditFrame`); the poster still prints only the days in use.
- Tests: `timetable-maker.test.js` (member link: own classes only, the note,
  the title, no YOUR COURSE everywhere, no false change after reload, the
  picker's ticks, ticking Piano adds it); `timetable-ui.test.js` updated for
  *Next steps* and own-class-only.

**Follow-up, same day.** The owner: "Most timetables would be personal." So
nothing enters a week that nobody chose: `addCentre` without a pick, for
someone whose classes are not marked, throws `choose` and the page opens the
picker on that centre with **nothing ticked** (it used to bring the whole
centre in, titled "<centre> timetable"). The picker ticks only what is in the
week already or a member's own. A non-member's week keeps its own title.
`timetable-maker.test.js` pins the link: nothing ticked, the button disabled,
nothing stored, then only the ticked class goes in (74/0).

## Learn richer; fuller lessons; lesson files that vanished (2026-10-29)

The owner, in order: "Improve the /learn. Make it richer" — "The lesson content
is almost empty" — "Source from reputable sources and repos" — "All of the
diagrams and illustrations and gifs are no longer there".

- **/learn screens** (`page-learn.jsx`, `.lrn-*` in styles-app.css): an Up next
  card (`LearnUpNext`, the whole card is the link; `.lrn-pickup` when resuming),
  a ring (`LearnRing`) with streak / this week / time / still to do, a term map
  (`LearnTermMap`, one cell per week by `lrnWeekState`), "Coming up", Saved and
  latest note (`LearnKept`); course cards and a course hero from
  `lrnCourseFacts`; weeks as a path. Uses only what the boot already returns.
- **Fuller bundled lessons.** Practical Coding (72) and Media Lab (48) gained
  *Understand it*, *Key words* and *Read and watch* (links also added as
  materials). Text is original; links are to MDN, W3C WAI, web.dev, GitHub
  Docs, Node/Express/Mongoose/MongoDB, OWASP, NN/g, Interaction Design
  Foundation, UNICEF, Khan Academy, etc. **Every link was fetched and returned
  2xx**; sites that block automated checks (Canva, Adobe, Cambridge in Colour)
  were replaced rather than shipped unchecked. Wikipedia and GitHub are not
  reachable from the build sandbox. Still thin and next in line: divisions,
  instruments, music (piano/guitar text), studio trades, tech foundations,
  business.
- **Revised seeds reach existing sites.** `curriculum_seed_bundled_once()` now
  stores each file's revision (`curriculum_seed_revision`) and updates lessons
  still exactly as shipped (`source = seed`, `updatedBy = system`), keeping
  status and unchanged question ids. An instructor's saved lesson is never
  touched. Test seam `$GLOBALS['__curriculum_seed_files']`.
- **Diagrams in the bundled lessons.** All 144 piano/guitar lessons now carry
  lesson-blocks notation derived from their own text: ```steps (the timed
  headings), ```keys/```staff for the scales named (title first), ```chord for
  the chords used. Business lessons and four instrument lessons get ```steps.
  The generator skipped any body that already had a fence.
- **Why the pictures vanished.** Lesson uploads lived only in
  `api/storage/curriculum`, inside the deployed folder; a deploy that replaced
  the folder deleted them while the lessons (in the database) kept pointing at
  them. Same failure photos had. Now: `curriculum_dir` (or ngg-data/curriculum
  beside the web root), move-out on read, bucket mirror and fetch-back
  (`curriculum_file_bucket_key`), `admin.curriculum.files` +
  `curriculum_missing_files()`, a `missing_files` gap with the list in Course
  health, and `CurFigure` saying in words when a picture cannot load. Files
  already deleted can only come back from a host backup.
- Tests: PHP 5928/0 (seed refresh ×5, lesson files ×6); learn 46/0;
  curriculum-ui 66/0; lesson-blocks 47/0.

## 2026-10-29 — The remaining bundled courses made full

- Studio Trades (60), Instruments (60), Divisions (48), Business (72) and
  Piano/Guitar (144) now carry *Understand it*, *Key words* and *Read and
  watch*, like Coding, Media Lab and Tech Foundations before them — every
  bundled lesson (528) is covered. Piano/Guitar places the section after
  *Learn*, before the diagrams (`apply.py` takes an anchor heading).
- Sources only where a fetch returned 2xx with a real page title: Yamaha
  instrument guides, musictheory.net, teoria, Ableton Learning Music,
  MuseScore, IMSLP, Classic FM, BBC Bitesize (Drama, Music, D&T, Business),
  RSC, Nobel Prize, Theatrecrafts, HSE, WHO, FSA, NFPA, NIDCD, NAFDAC, V&A,
  Google Arts & Culture searches, Google Docs/Drive/Calendar Help, Trello,
  Airtable, Make Academy, draw.io, Strategyzer, Atlassian, NN/g, GOV.UK,
  WIPO, NDPC, CAC, SMEDAN. Blocked or soft-404 (not used): Canva, OpenAI,
  JustinGuitar, Fender, Make help pages behind Cloudflare, Investopedia,
  Britannica, Met Museum; Manager.io guide pages render no title, so only its
  home page is linked.
- The AI-word budget is unchanged: the only new mentions sit in lessons whose
  title is already about the tool (Business ChatGPT ×2, Music Production wk10,
  Tech Divisions wk8). Counts checked per file before and after.
- Tests: PHP 5928/0; build OK; no-important 651 files; learn 46/0.

## 29 Oct 2026 — The NGV hand-off lands on the form, filled in

The Club application's "18 and over — register for NGV" button opened
Afrovanguard's NGV landing page, whose every "Apply now" was a WhatsApp group
invite. It now opens NGV's application form (`afrovanguard.ngv_url`, default
`{org_url}/academy/ngv/register.php`) with the name, date of birth, email and
mobile typed here carried in the address (`apfNgvHref` in page-apply.jsx); the
form pre-fills and saves nothing until it is sent. The Afrovanguard side of the
same change (the form, accounts made at enrolment, a guardian's own consent) is
in that repo's `docs/HANDOFF.md`, 29 Oct 2026.

## 2026-10-29 — Learning materials: what to do with them, and only good ones

- **Migration 198**: `curriculum_materials.guide` — one line for the learner.
  Validated (`CURR_MATERIAL_GUIDE_MAX` 240), written, served by
  `curriculum_unit_public`, and part of both fingerprints, so a re-import of
  the same guide is "unchanged" and a revised seed guide refreshes a lesson
  still as shipped. Editor: a *What to do with it* box per material.
- **Learner view** (`CurriculumMaterials` → `CurMaterialFace`): title, guide,
  source host (`curMaterialSource`; "Lesson file" for ours) and an action verb
  (`CUR_MATERIAL_VERB`) in place of the kind's name. Dark staff variant styled.
- **Practice sites are `interactive`**: musictheory exercises, teoria, SQLBolt,
  regex101, freeCodeCamp learn, Ableton Learning Music/Synths, Chrome Music
  Lab, picoCTF, Teachable Machine, GitHub Skills, WebAIM contrast checker.
- **Seed clean-up** (scratchpad `matfix.py`, all 515 links fetched first):
  dropped the walled/dead/search-page links; repaired draw.io, Make and
  micro:bit links; a link with one title on 10+ lessons of a course is kept
  on the first lesson of each level only ("For the whole course:"); titles
  lost the "(Source)" suffix the host now shows; a floor of two materials per
  lesson, refilled from the course's own learning links (never exam or
  certificate pages) or a short verified list per course; a real metronome
  replaced the Google search. Totals: 2239 → 1624 materials, all guided.
- Tests: PHP 5937/0 (materials ×9, including "every shipped lesson has two
  guided materials and no walled link"); curriculum-ui 66/0; learn 46/0 (one
  unrepeated failure on the first run, clean on the rerun); build OK;
  no-important OK. Theatrecrafts.com timed out today though it loaded earlier;
  left in, worth rechecking.

## 2026-10-30 — gate-lookup merged into the volunteer-pay line

Two branches had built the same things twice. What the merge kept:

- **Programme of a volunteer**: one `volunteer_programme()` (summer | ngg | both,
  `VOL_PROGRAMMES`). An application's programme is its `programme` column;
  NGG's own door (`/join/volunteer`, program=anchor) sends none and gets `ngg`.
  Afrovanguard sees `ngg` and `both`. Promotion from Summer is the "Bring into
  NGG" panel; `admin.volunteers.programme` stays as an op and accepts all three.
- **Migration 202** is gate-lookup's 122 (`programmeAt`), renumbered on top of 201.
- **Revocations to Afrovanguard**: one `ngv_portal_revoke()`; the re-sync queues
  announcements AND revocations, then delivers within the 15s budget (shared
  hosting kills a long inline loop), holding minors without consent.
- **Reset codes**: only the newest code counts; a miss counts on the code, the
  reset lock and the account; an older (retired) code reads `expired`, not a miss;
  a locked account says `account_locked` first.
- **NGG volunteer activities** editor is a `CATALOGUE_SOURCES` entry
  (`ngg-volunteer`), not a second catalogue component.
## The portals on a phone, measured signed in on live data (2026-10-29)

The owner: "the portals are terrible on a mobile". Neither responsive suite could
have seen it — `responsive.test.js` is the public site, and
`responsive-staff.test.js` mounts each surface with no data (its header says so).

- **New suite, `tests/portals-phone.test.js`** (`npm run test:portalsphone`, in
  `test:all`). It seeds a small real programme (long names, a mentor and two
  mentees, an instructor's class, a week of lessons, a guardian with two
  children, a Summer edition), signs in as each person, and walks every
  destination each portal's own navigation offers — top tabs, the tabs inside
  them, and every row of a "More" page — at 360px and 390px: member, Learn,
  Community, mentor, instructor, family, Club and Summer School. It measures
  clipping and the touch floor (the shared probe), fields under 16px (iOS zooms
  into them), and content left under a fixed bottom bar. Destinations are
  discovered, never listed. `PP_SHOTS=dir` writes a screenshot of each.
- **First run: 211 destinations; ~700 controls under 44px, ~130 fields under
  16px.** The portals are compiled designs, so the floor is one rule for touch
  pointers (`@media (pointer: coarse)`, styles-app.css "Portals on a touch
  screen"), not 700 edits to generated classes. A mouse keeps the designs'
  density.
- **Club portal: nothing is "Computer only" any more.** Applications, Families,
  ID cards, Conduct & fines, Curriculum, Tournaments, Volunteers, Staff
  activity, Wi-Fi regions and setup were greyed out on a phone. The generic
  sections already had a phone list and detail sheet; what was missing was the
  page action (`phonePageAct`, now every section but Roster, drawn as a
  full-width button in the design) and Tournaments, which existed only in the
  desktop branch — the design now has its phone list, and the wizard and detail
  in the phone `<main>`. The "Greyed-out tools" note shows only if something is.
- **Compiler fault: only the FIRST `<main>` got the controller's slots**
  (`v.mainSlot` / `v.mainSlotEnd`). The Club design has two (desktop and
  phone), so on a phone there was no loading bar, no error-with-retry, and the
  Wi-Fi screens drew blank. Every `<main>` is slotted now.
- **Compiler fault: a lone `{{ value }}` lost the space before or after it**
  ("7students", "Members7"): the whole-text match trimmed it. The space is kept
  wherever there is a sibling for it to separate, emitted as its own child so
  an element value is never flattened into a string. All eight designs were
  recompiled; the stylesheet output is byte-identical and only spacing moved
  in the views.
- **Layout faults the probe cannot measure, seen in the screenshots and fixed:**
  the Club phone column squeezed its clipped cards (`overflow: hidden` gives a
  flex item a zero minimum), cutting the last "Needs you" rows — nothing in
  that column shrinks now; the embedded roster had no side gutter on a phone
  (`padX`); the mentor's Mentees row truncated the name to fit a status chip,
  and the Class row ran the name under the notes button — both put the name
  first and the chips/buttons under it; the member's Getting started steps and
  My course lessons squeezed their text beside a button or state, which now
  wrap underneath; the Wi-Fi workspace carried its desktop -50px margin into
  the phone column.
- **The Club's More page greeted every coordinator as "TA"** — the design's
  sample initials (Tunde Akin) were still in the markup beside the real name.
  `cp3-subs.json` now maps them to `{{ meIni }}`, from the signed-in person.
- **The sweep's own traps, fixed in the suite:** the site scrolls smoothly, so
  a scroll set from script had not moved when the next line measured (it
  reported Learn's Review as running under its bar); and a More row that opens
  a sheet ("Your access") is closed with Escape before the next row, or every
  later row is measured underneath it.
- **Community on a phone:** the quote carousel's position dot drew as a black
  pill a thumb tall (an 8px dot button given the 44px floor, filled to the
  full height); the button keeps the tall hit area and the dot is drawn inside
  it. The pencil button floated over the post box while the box was on screen,
  covering what a child was typing; it now shows only while the box is out of
  view (scrolled past, the slim dock takes over).
- **/support:** the safeguarding line's phone number and email failed the
  public touch floor (16px links) — they are links inside a sentence, which
  is now marked up as the paragraph it is (WCAG 2.5.8's inline exception).
- **Baseline, recorded before committing (same failures on the last commit,
  run in a clean worktree):** instructor-v6 "Today … the Saturday formation
  day" (time-of-day dependent: "Musing" is not on the Thursday-night Today);
  family-ui times out after "…and the /pay page names it as paying ahead"
  (line 309); community-v3 "a code post opens in the editor with its source".
  None is caused by this change; each is a fact for the next agent.

---

## 29 Oct 2026 — The training fee, fixed to what the programme quotes

The owner confirmed the fee is ₦300,000 for the three years (the ₦75,000 was
per session) and asked for the logic behind it fixed. An audit run against
this code with a throwaway database found eight faults; each is fixed and each
has a test in `api/tests/run.php` ("The training fee, as the programme quotes
it") that fails on the old code.

1. **No fixed total.** The per-session default came to ₦450,000 or ₦375,000
   by join date, and billed Summer School as a training session. New default
   basis `total`: one charge of ₦300,000. The untouched shipped pair
   (session, ₦75,000) is read as that total in `fees_settings()`; a rate an
   admin chose is kept. `session` skips `FEES_NON_TRAINING_SESSIONS` (SUMMER).
   Members already charged per session are topped up to the total, or held to
   it by a keyed `cap:training:*` write-off, which `fees_balance` subtracts
   from the charge rather than counting as earned.
2. **A basis switch kept the rate** (₦75,000 a session → a day, ₦5.25m).
   `fees_settings_save` refuses it without a new amount
   (`training_rate_required`); the settings screen says why.
3. **Half-length edits rewrote everyone.** Terms are frozen per member
   (`members.feeTerms`, `fees_freeze_terms` at first accrual,
   `fees_member_terms`). Uprates and edits are for later members.
4. **Leavers kept earning off by the calendar.** New `member_status_log`
   (migration 199), written by `db_update`/`db_insert` whenever a member row's
   status is written, so no screen can forget. Earned is now by **days served**
   (`fees_serving_days`): active, not suspended, not evicted.
5. **A leaver's balance was never payable.** `trainingOwed` (inactive or
   evicted, MOU not done, not graduated) is in `payable`, reminders and the
   statement.
6. **The notional fee counted against the ceiling** and stopped dues after
   ₦85,000. `atCap` reads real money only.
7. **A lifted suspension was credited back.** Suspension days, from every
   suspension that was in force, are never served.
8. **Members saw ₦75,000 as the fee and "you pay ₦0".** `member.fees` adds
   `trainingTotal`, `trainingBasis`, `trainingOwed`; the member portal shows
   the whole fee, "covered while you serve · owed only if you leave early", and
   the owed figure when there is one.

Also: the Training fees list includes inactive members who owe (filter
`owed`), with history and suspensions preloaded per chunk (no per-row reads);
`member_status_log` is `KEEP_SURVIVOR` in the merge policy.

**Figures that change on deploy:** every member's training charge moves to
their frozen terms at the next accrual run. On the default this means
₦300,000 each (with the write-off or top-up above), and an inactive member
with no MOU will show what they owe.
- **After merging the training-fee commit (8acc5ec7):** the PHP suite reads
  5955/2 — "fee: the balance ceiling counts real money — the ₦300,000 place
  does not stop the dues" and "portal: reading an entry marks it read". Both
  fail identically on 8acc5ec7 alone (checked in a clean worktree), so they
  belong to that work, not to the portals change; left for its session.

## Clearing dues retired; every active member's fines cleared once; a fines upload that reads registers (2026-10-30)

The owner, on Members → a record → Fees: "This should not be available to
anybody. Make it more secure. It would cause fraud. I want to be able to clear
the fines of all active members, after that the feature should be completely
locked away. I also need you to correct the fines upload, make it more
intelligent."

- **"Clear dues they don't owe" is retired on the server, for everybody.**
  `admin.fees.settle` answers `retired` (and audits the attempt as
  `fees.settle.refused`); the bulk action `feesSettled` is gone from
  `members_bulk_actions()` (so `unknown_action`); `fees_settle_through()` and
  its validator are deleted; the button, the bulk action and `NGGApi...settle`
  are gone. Dates already in `members.feesSettledThrough` are still honoured
  by the accrual and shown on the record — history is not rewritten.
- **`admin.fees.finesClearOnce`** (fees.php): `status` | `preview` | `run`.
  Super admin by ROLE (a granted `fees` cap is not enough), unscoped, a CURRENT
  TOTP code from their own `totpSecret` with the run, the phrase `CLEAR ALL
  FINES`, a reason of 10+ characters, and the preview's digest. It waives each
  active NGG member's unpaid fines (`fees_unpaid_of`, payments oldest-first —
  the same allocation the old settle used, now general over kinds) with one
  waiver keyed `fines-cleared:once`. The ONCE is a row in `fees_once_locks`
  (migration 200), primary key `fines_clear`, inserted FIRST in the same
  transaction as the waivers: a double press, a second tab or a replayed
  request fails on the key and writes nothing. Five wrong codes in fifteen
  minutes and it refuses even the right one (`too_many_attempts`; each miss is
  `fees.fines.clear_badcode` on the audit log, which is the counter). No op deletes from that table
  (a PHP test sweeps the domain files for it). Afterwards every `fees` holder
  sees the record (who, when, how many, how much, why). UI: Dues & arrears →
  Upload fines, top. E2E: `tests/fees-lockdown.test.js` (replaces
  `fees-settle-ui.test.js`; `npm run test:feeslock`).
- **The fines upload had a real fault:** `fees_post()` applies the Club's
  conduct rules to every fine (`conduct_rule_allow`), so a rule switched off
  posted nothing and a capped rule posted less — after a check that had
  promised the sheet's figure. The post then said "could not be posted" with
  no reason, or posted less than shown. The check now asks the rule
  (`fees_fine_rule_room`), counting earlier rows of the same file against the
  cap: `rule_off` / `cap_reached` refusals, or `capped` with `asked`.
- **The upload reads a register as kept** (cr-tab-money.jsx `crMoFineSheet`):
  heading row found in the first 20 rows by meaning (`crMoFineField`), every
  sheet of a workbook (`crCurXlsxGrids`, rows at their real row numbers), a
  column per kind of fine split into one fine each (Total then ignored), TOTAL
  lines and repeated headings skipped, the sheet's name as a centre hint, and a
  "How the file was read" note listing every column used and ignored. Each
  result row says where it came from ("Egbeda · row 4 · late"). CSV delimiter
  sniffed over the first ten lines, not the title line.
  Server: `#`/`naira`/`/-` amounts; written dates (`4th October, 2026`, `Oct 4
  2026`, `4/10/26`, Excel day numbers); a future date refused
  (`date_in_future`); a reason read from a sentence in the reason or the note
  (one kind only — "late and rude" stays written); a centre (column, sheet
  name or the request's `centre`) as a TIE-BREAKER only (`name+centre`); an ID
  written inside the name; `name_part` when every written word is one of a
  single member's (two words minimum). "Broke a window" stays a written reason:
  equipment means the things the programme lends.
- **Tests:** PHP — the settle retirement (3), the clearance (17), the upload
  (12); the old settle block removed. `tests/fines-upload.test.js` rewritten for
  the Control Room v2 screen (it still drove the old `.fine-imp` markup and
  could not have passed) on a two-sheet register: 14/0.
  `tests/fees-lockdown.test.js`: 12/0.

## 2026-10-30 — Conduct & fines rebuilt as one home for fines; volunteers thanked when a season closes; the certificates press answers

**Conduct & fines (Money).** The tab mounted the v1 `SummerPolicy` screen whole
(the old design), while fines lived in three places that did not know about
each other: the rules only in the Club portal, the upload under Dues &
arrears, the calendars/thresholds/board in that v1 screen. Rebuilt in the
Control Room's blocks as `src/modules/control/cr-tab-conduct.jsx` (in `ORDER`
and `index.html` after cr-tab-money), four views by URL tail, each offered
only to whoever holds what its ops gate on:
`""` Fines (`fees`) · `compliance` (`people|summer`) · `policy` (`summer`) ·
`calendar` (`summer`). Tab cap is now `["fees","people","summer"]`.
- **Fines**: kpis (this term's fines, rules on, the term, the clearance), the
  upload (an empty state with one action, a drop area as a convenience only),
  the check as ONE summary bar (file, to post / already / no fine / refused,
  Post, and "How the file was read" collapsed) instead of a stack of tinted
  notes, the row table, the rule cards, and the one-time clearance as a quiet
  row. The rules are a searchable, filterable TABLE (owner: "there's going to be
  a lot"), not cards. The upload and clearance code moved here from cr-tab-money.jsx
  (`crMo*` → `crCf*`); Dues & arrears lost its "Upload fines" view.
  `/control/money/fees/fines` forwards via the new `CR_SUB_ALIASES` in
  `crResolve` (cr-pages.jsx) — retire by aliasing.
- **Rules from the money side**: `admin.fees.fineRules` (one pass over the
  term's fines, not one query per rule) and `admin.fees.fineRuleSave`
  (`fees`; whole payload validated first; `cap_below_fine`, `kind_taken` —
  `conduct_rule_allow` reads the FIRST rule of a kind, so a second would govern
  nothing while looking live; `unchanged`; audited `fees.rule.save` with
  from/to). The Club portal's toggle still writes the same rows.
- **Standard amounts in the upload**: a tick or a count (≤ `FEES_FINE_COUNT_MAX`
  20) under a per-kind column whose heading has no money word, or a blank amount
  on a row that names its reason, posts `count × rule amount` (`standard`,
  `each` on the verdict; `no_standard_amount`, `bad_count`). A written 0 is
  always "no fine".
- **Compliance** record is a CR drawer (consequences with mark paid / served /
  clear, entries with Void-with-reason, manual ID-card logs, reinstate with a
  council-override form). **Policy** is one form block; ids are paths
  (`student.absenceLimit`) rebuilt by `crCfNest`. **Calendars** are two form
  blocks; the form block gained `c: "multi"` (weekdays) and `c: "dates"`
  (`CrDatesControl`), and `num` table cells gained an optional second line.
- **A real fault found by the screenshots**: `programme_settings_save` and
  `member_programme_settings_save` read a missing `enabled` as OFF, so a
  calendar save carrying only the changed weekday switched the whole calendar
  off. The save now always sends the switch with the patch; the suite asserts
  the calendar stays on.
- `SummerPolicy` / `PolicyPersonModal` deleted; the Summer workspace's
  "Programme & policy" panel is `SummerPolicyMoved`, linking to the three views.
  ui-smoke's policy block is retired, and every promise it held is now held by
  `tests/conduct-tab.test.js` (22/0, real server, `npm run test:conduct`, in
  `test:all`).

**Volunteers thanked when a season closes** (owner: "ALL volunteers should be
sent an appreciation"). Migration **201** `volunteer_thanks` (UNIQUE cohortId +
volunteerId; queued → sending → sent | failed (3 tries) | no_email). Both close
paths queue it — `summer_editions_close_elapsed` (nightly/web-cron) and
`admin_summer_edition_status` active→closed — and send `SUMMER_THANKS_INLINE`
at once; the web-cron (`vol_thanks`, every minute) and run-jobs send the rest.
Who: every non-archived Summer/Both volunteer, plus any volunteer who checked in
during the season's dates. The email is by name, with the sessions given that
season. Editions carry `thanks` counts; the season steps show "N of M thanked"
and who has no email. PHP: 9 checks.

**Issue certificates gave no sign of being pressed** (owner screenshot). It now
reads "Issuing…" while running, toasts the count (or that every child already
has one), and shows "N issued" from the editions list's new `certified` count,
so a reload tells the same story. The certificate's own design waits on the
design the owner is sending.

Tests: PHP 5996 passed / 2 failed (the two pre-existing failures from 8acc5ec7,
noted above); fines-upload 16/0 (enters through the old address); fees-lockdown
12/0; conduct-tab 22/0.

Also: `naira` stays a shared global in page-portals.jsx (page-admin.jsx's v1
fees screen uses it — removing it broke ui-smoke); `.cr-seg` buttons are 44px
on a coarse pointer. Final runs: ui-smoke 649/0, responsive-staff 4/0,
control-room 51/0, conduct-tab 22/0, routes 60/0, admin-bulk 44/0, build 31/0.

## 2026-10-30 (later) — Requests the desk can act on; the clearance is the whole account; the rules as a document

Owner reports, each with a screenshot: a payment claim whose Reference held the
family's whole story ("…I paid 10000 naira as transfer and 2000 naira cash to
Mrs Basirat Awolaja"); "Correct my details" drawers with nothing to act on and a
bare "The reply" heading; "add comments … a proper response"; "they cannot add
a receipt"; "the clearance is the whole account … imported fines or dues or
membership fees must not be affected"; "export all rules into a proper formal
document".

- **Payments by the way they came** — migration **202** adds
  `member_requests.parts` (and `comments`). A claim carries parts
  `{method transfer|cash|pos|other, amount, reference, receivedBy}`;
  `member_payment_parts()` validates them (a family must give a transfer's
  reference and who took cash). Approving with parts posts **one `fees_post`
  per part** with its own method and reference; `ledgerEntryId` holds the ids
  comma-separated. **A real bug the test found:** `fees_money("10,000")` reads
  the comma as a decimal point — ₦10,000 became ₦10; parts go through
  `fees_fine_amount()`. The drawer and the Inbox share one approval form
  (`crPayApproveForm`, cr-tab-members.jsx), filled in from an older claim's
  sentence by `crPayGuess` (amount + method + "to <name>", reference tokens).
- **Receipts**: the family's "I've paid" card takes a photo, uploaded through
  the school-report uploader to the site's own photo store (`proofUrl`).
- **Details read** — `member_details_read()` (member-self.php) finds field +
  value in free text (day-first dates, +234 phones, parent vs member by the
  words and by who raised it), flags a date of birth outside 5–25 and a value
  already on another record, and names fields given with no value.
  `admin.requests.applyDetails` changes the record through
  `admin_members_upsert` (every field rule still holds) and approves with a
  reply listing what changed. The list attaches `reading` with ONE query for the
  page's members.
- **Comments and replies** — `admin.requests.comment` keeps a message on the
  request and tells the member and the raising parent through the new
  `member_request_tell()` (the decision uses it too, so both reach the same
  people in the same words); the member and family portals show the messages
  above the decision. Every outcome starts from a drafted reply
  (`crReqDraftApprove`); a decline picks a reason per kind (`CR_REQ_DECLINE`).
  The Inbox's note can now open pre-filled (`note.dflt`). Drawer sections with
  nothing in them now say so (`empty`) instead of drawing a bare heading.
- **The clearance is the whole account** — `fees_clear_unpaid_of()` clears the
  unpaid fines, dues and membership this system charged; `fees_entry_imported()`
  (a `bulkfine:`/`import:` key, or an import method/author) is never cleared, and
  payments are counted against the system's own charges first so an import is
  never treated as paid. Training is untouched. Phrase now `CLEAR ALL ACCOUNTS`;
  the lock key and the waiver key are unchanged, so it is still ONE run.
- **The rules as a PDF** — `crCfRulesPdf` (cr-tab-conduct.jsx), jsPDF in the
  browser, from the same data the screen applies: fine rules, the ladders,
  members' rules, ID cards and reinstatement, programme days, fairness and
  appeals; reference and page numbers on every page. Money is "NGN 5,000"
  because the standard PDF fonts have no naira sign. Two layout faults found by
  rendering it (paragraphs measured at the previous heading's size; headings
  overprinting): fixed.

Tests: PHP — details (9), payment parts (3), clearance updated to the whole
account (imported fine stays owed; a payment never pays an import). New
`tests/requests-desk.test.js` (15/0, `npm run test:reqdesk`, in `test:all`)
seeded with the two reported requests as written. `fees-lockdown` 12/0 on the new
rule; `conduct-tab` 23/0 with the PDF download.

## 2026-10-30 (evening) — Push notifications; the staff hear about new Inbox items; every Inbox item actionable

**Asked:** "Enable push notifications so people do not have to always go to their
portal to see messages. Make it intelligent." · "The admin should also get notified
via email and push for new inboxes." · "I need ALL the inbox messages to be
actionable and smarter."

**Push (domain/push.php, migration 203).** Standard Web Push, done with PHP's own
OpenSSL because the host has no Node and no shell: VAPID ES256 (RFC 8292) and
aes128gcm payload encryption (RFC 8291). The server's key pair is made on first
use and kept SEALED in settings (`ai_ui_seal`); `push.vapid_*` in config pins one
for multi-server deployments. Subscribers are `m:<memberId>` (members and staff) or
`g:<guardianId>` (family accounts); one browser endpoint is one person, so a shared
tablet follows whoever signed in last.

Attached at the two roads every alert already takes, so no caller has to remember
it: `push_notification()` (the bell, 60 call sites) and `family_mail()` (every email
to a parent). `push => false` keeps one off the phone.

The intelligence is server-side and is rows in `push_queue`, not timers:
quiet hours (default 21:00–07:00 Lagos, held and summarised), a short fixed urgent
list that is never held or muted (safeguarding, security, check-in/out, duty),
"already looking" (the portal reports presence while visible; nothing buzzes for
what is on screen, per surface), burst collapse (after 3 in 10 minutes, the rest
arrive as one), tag collapse (same thing again replaces), mutable topics, and dead
subscriptions pruned (404/410, or 8 failures). Sending happens after the response
(`fastcgi_finish_request`) or on the web-cron tick (`push`, 60s; `push_gc` daily).
Endpoints are allow-listed to the real push services — a subscription is a URL the
client chose, and without the list it is SSRF.

Client: `NggPushCard`, `NggPushNudge`, `nggPushBoot` in components.jsx — mounted in
the member's Notifications panel, the family account (Account card; the ask on
Today), and the Control Room (Account → Notifications; the ask at the top of the
Inbox). The card says plainly when a device cannot be reached and the one thing
that fixes it (iPhone needs the Home Screen; a blocked site needs site settings).
`nggPushBoot` re-registers a subscription the browser rotated; the service worker
cannot post to the API itself (CSRF), which is why the page does it.

**Staff alerts (`staff_inbox_alert`).** Contact messages and applications used to
email ONE shared intake address; comments, testimonials and photos told nobody;
requests, feedback, approvals and family links emailed every eligible person once
per item. All nine now go through one function: a counting bell item per Inbox view
("4 new member requests"), a push with the same tag, and an email throttled to one
per half hour per view, none while the person is in the Control Room, and an
opt-out. Recipients are the Inbox tab's own capability plus centre scope; the
person who caused it is excluded. `selfreg_submit` holds the photo alert while it
runs — a public sign-up link must not cause mail before a human has looked (the
existing test caught this).

**Inbox.** Messages and applications now know who the address is (one batched
`inbox_known_by_email`), messages start with a drafted reply chosen from what they
asked (fees, signing in, card, times, applying, mentoring, partnership — and it does
not tell a parent to apply for a child already a member), urgent wording floats an
item and says why, applications can **Ask for something** (emailed, kept in
`applications.messages`, item stays, status → reviewing), Waitlist/Reject now TELL
the family in drafted words, comments and testimonials flag contact details (a
phone number on a children's site), reshoot notes start from what the photo check
found, and each item has "Open their record". Two new action kinds in the pane:
`go` (navigate, never resolves the item) and `keep` (acts, item stays).

Tests: `tests/push-crypto.test.js` (17/0) opens PHP's output with an independent
RFC 8291 reader in Node WebCrypto and verifies the VAPID signature — broken twice on
purpose (nonce label, DER signature) and it failed both times.
`tests/push-e2e.test.js` (24) drives all three portals with a faked PushManager
whose keys the test holds, catches what the server would have POSTed
(`push.test_sink`) and decrypts it, and delivers a push into the real service worker
over CDP. `tests/inbox-actions.test.js` drives the Inbox. PHP suite: 51 new push /
staff-inbox / inbox checks; quiet hours and the email throttle were disabled on
purpose and the suite named both.

## 2026-10-30 (late) — Merged the parallel branch; push checked device by device

**Merge.** `claude/vibrant-cray-3gmdum` (volunteer pay, CACENTRE centres and
sessions, Make.com, the NGG volunteer door, Afrovanguard feeds) merged in. Both
branches had numbered migrations from 199: this one's 199–203 kept (already shipped
in zips), the parallel 199–202 renumbered 204–207 in SQLite and MySQL, with a
step-back in `db_migrate` for a database that ran the parallel ladder (has
`volunteer_pay`/`absence_asks`, no `push_subscriptions` → re-run from 199). Checked
both directions reach 207. `api/tests/run.php` was rebuilt block by block against the
common ancestor — the textual merge had doubled 121 test blocks. The parallel
"Settled up to a date" test stays out: that bulk action is retired here as a fraud
path. Two of its rule breaks fixed on the way in (a `!important`, a native
`confirm()` in Wi-Fi).

**Push on every device.** Asked: "Ensure the push notification is compatible on all
devices." What each platform needed: older Safari answers the permission prompt by
callback (`nggPushAsk` takes both); Safari and older Firefox hide a subscription's
key, which the rotation check read as "changed" and would have re-subscribed on
every visit — unknown now means unchanged; keys are read off the subscription where
`toJSON` omits them; Brave's disabled push service, in-app browsers (WhatsApp,
Instagram, Facebook), iPhone on Chrome, iOS below 16.4 and Safari 15 each get their
own instruction instead of "unsupported"; Android gets a monochrome badge
(`assets/icons/badge-96.png`) instead of a white square; urgent alerts vibrate;
`*.google.com` push endpoints are allowed. `tests/push-devices.test.js` (32) runs
the detection over real user agents with each device's real capabilities; two
breaks planted, both caught.

## 2026-10-30 — volunteer pay: bank details, fines off pay, the Summer bug

- **Only NGG volunteers earn** (`volpay_serves_ngg()`: programme `ngg` or
  `both`). The accrual used to decide a day for every volunteer and read a row
  with no programme as NGG; `volunteer_programme()` reads it as Summer, and so
  now does pay. Afrovanguard's lookup had the same bug (`programme IS NULL OR
  programme != 'summer'`) and showed Summer volunteers an NGG pay card.
- **Fines come off a payout, down to ₦0**, owner's decision: "ALL fines from
  volunteers, afrovanguard members, ngvs". NGG's own first (member_ledger,
  method `volunteer_pay`), then Afrovanguard's over its `integrations/ngg-fines.php`
  door (purpose `fines.`), two requests a run whatever its size. Afrovanguard
  unreachable ⇒ its fines stay owed there. A void puts both back, Afrovanguard
  first, and is refused if it cannot. `volunteer_payouts` keeps gross, fineNgg,
  fineAv and the bank line (migration 203).
- **Bank details** on `volunteers` (migration 203), set by the volunteer (app or
  Afrovanguard) or the fees desk; every change told to the volunteer. A missing
  account is warned about at payout, not refused: refusing would have stopped
  every payout on the day this shipped.
- **Notifications** via `volpay_notify()`: in the app when they are a member,
  email when asked or when there is no app. Excluded days are app-only, one item
  per period (`groupKey`), never an email a day.


## 2026-10-30 — CACENTRE check-ins not recognised: everybody Dormant

**What happened.** The CACENTRE gate's attendance punches name a member by their
secure card code (MEMQR-…), their printed number (`026-014`) or their id in
whatever case the desk had. `hooks_attendance` matched only the internal
`NGG-…` id, answered every other punch `unknown` and dropped it. The nightly
check then found no check-in for anybody at those centres and logged an absence
per person per day: warnings, the Dormant Track at the limit, and the ₦1,000
member absence fine, day after day.

**Fixed, in four places.**
- `hooks_attendance_person()` resolves every way the gate names somebody: a
  MEMQR token (in `token` or in `ref`), `format`+`value`, SUMQR / `qr_codes`,
  a volunteer token, a participant/volunteer/member id in any case, a printed
  `displayId`, a `member_cards.code`, following merges. A punch that still
  names nobody goes to `attendance_unmatched` (migration 209), never the floor.
- A punch for a day already checked calls `policy_checkin_landed()`: the
  check's absence that day is voided and the person re-lifted. And
  `policy_checkout_landed()` now RE-LIFTS (it called `policy_apply`, which
  only ever issues — a late sign-out never lifted the Dormant Track it caused).
- **The outage brake** (`policy_outage_hold`, setting `outageBrake`, on by
  default): a centre with ≥3 expected and 0 present, or a day with ≥10
  expected and <10% present, is held in `attendance_held_days` (migration 209)
  for a person to decide (`closed` | `count`), instead of being swept. The
  PHP suite switches it off at its top, because the old absence fixtures are
  exactly whole centres with nobody checked in.
- **`policy_relift` was wrong about absence fines in both directions**: it
  skipped a pending fine, so voiding an absence left its ₦1,000 owed; and an
  absence fine's tier (500000+day) fell into the ID-card branch, so any relift
  could lift one that still held. It now reads the day from the tier and keeps
  the fine exactly while a live, uncovered absence exists that day.

**The repair** (`admin.policy.absence.repair`, Compliance → Repair absences):
preview then apply, reason required, ≤20,000 a run, one audit event. Only
`byId = 'system'` entries with one of the check's notes (`POLICY_SWEEP_NOTES`)
are candidates — a person's entry is never touched — and imported money
(`fees_entry_imported`: `bulkfine:`, `import:`, method `import`) is counted
and reported as untouched, never voided. Centre-scoped admins see and repair
their own centres (`outOfScope` counts the rest).

**Not recoverable from NGG's side:** punches answered `unknown` before this
were not stored. CACENTRE should re-send its check-ins for the failed period;
each lands through the late-arrival path and cleans up after itself.

Tests: PHP suite block "CACENTRE check-ins …" (29 checks; disabling the brake
fails five of them), `tests/attendance-repair.test.js` (21, in `test:all`).

## 2026-10-30 (later) — correction: it was the CHECK-OUTS, not the check-ins

The owner corrected the entry above: check-ins from CACENTRE worked; check-outs
did not. Both are true of the code, and the second is the cause of the mass
Dormant Track.

**Root cause, on the gate side.** The fix written on 2026-10-28 (cacentre-site
branch `claude/gate-ngg-checkouts`: `"checkouts": true` in NGG's `ISSUERS`
entry, and `POST /v1/admin/backfill-checkouts` up to 31 days) was **never merged
into cacentre-site `main`, and so never deployed**. The live gate still has
`"checkouts": false` (`gate/src/gate.ts` `destinations()` drops every NGG
departure). Every member came through the gate, signed in, and — with
`member.checkoutRequired` on — was logged "Signed in but never signed out" +
"Incomplete day — no sign-out" every programme day: a ₦1,000 absence fine each
day and the Dormant Track at the limit. Weekdays are not member programme days,
which is why it surfaced on Saturdays first (the 2026-10-28 entry).

**What the 30 Oct NGG work missed, now fixed.** The brake and the repair judged
"the feed failed" by counting CHECK-INS — and on these days everybody had
checked in. So the repair's default mode read every one of them as "Looks
real" and would have undone nothing.
- `policy_outage_hold(..., $cause)` + `policy_checkout_hold()`: a centre with
  ≥3 who signed in and 0 sign-outs (or a day with ≥10 in and <10% out) is held
  as `cause = 'checkout'` (migration **210**), in both sweeps; nobody there is
  logged incomplete. A centre where most signed out still has its real
  incomplete days counted.
- Deciding a sign-out hold `count` logs `no_checkout` + "Incomplete day…" under
  the decider's name; a later sign-out still voids it (`policy_checkout_landed`
  matches the note, not the author).
- The repair groups by what was missing (`cause`): a sign-out group is an
  outage when fewer than one in five of those who CAME have a sign-out. The
  preview shows check-ins and sign-outs per centre-day, and counts absences and
  missing-sign-out entries separately (it had called both "absences").

**To do, in this order:** deploy NGG; merge cacentre-site
`claude/gate-ngg-checkouts` into `main` and deploy the gate (Actions → gate →
Run workflow, plan *free*); press *Send NGG the check-outs it missed … last 31
days*; then Compliance → Repair absences for whatever is older than 31 days.

Tests: PHP block "the sign-out half" (11; disabling the departure brake fails
4, judging every group by check-ins fails 3); `attendance-repair.test.js` 22.

## 2026-10-30 (evening) — imported dues, the member rulebook, official notices

**Imported money.** The fines upload read a "Dues"/"Outstanding dues" heading
as the fine's AMOUNT (`/due/` in the amount pattern), so arrears were posted as
fines; with a Fines column beside it, `col("amount")` took the first and the
other was silently dropped (not even listed as ignored). Dues and membership
columns are now their own kinds (`kind` on the row; `import:dues:`/
`import:membership:` keys, method `import`). `fees_entry_imported()` read
`byId`/`by`, which a ledger row does not have — it reads `createdBy`. Fines →
*Brought over by upload* (`admin.fees.imported`, `admin.fees.importReclass`)
corrects a row's kind: void with reason + same amount, same `createdAt`, the
right kind; refuses anything not imported; ≤500; one audit event.

**The member rulebook** (`policy.member.rulebook = session`, the default; the
suite pins `ladder` at its top for the older tests). Tier ranges, so a relift
knows what each sanction is for: late-band fine 600000+day, late jumps
700000+day, absence jumps 800000+day, review 900000+day (kind `review`,
`proposed`), session suspension 30000000 + sessionStartDay×10 + n and its
re-entry fee 40000000 + the same. New sanction kinds `corrective` (amount =
how many; pending → done) and `review`. `policy_relift` reads those first
(`policy_rulebook_holds`) and the old `tier >= 500000` absence-fine branch is
now `< 600000` — it used to swallow every higher tier. A served session
suspension with its re-entry fee pending still blocks (`policy_state`,
`policy_states_for`, `policy_gate_checkin` → `policy_reentry_fee`);
`fees_post` of any credit calls `policy_reentry_sync`, which marks the fee paid
when `fees_entry_left()` (oldest-first, as `fees_unpaid_of`) says it is
covered. Permission cap in `member_excuses_session` and at approval in
`admin_request_decide`; > `formalAfterDays` is `formal_application`. Evidence
fine: `policy_evidence_fines_run`, from the member sweep (both exits), keyed
`asg-evidence:<assignmentId>`, only for assignments due on/after
`policy_evidence_since`; `conduct_rule_key` no longer sniffs the note when a
caller names its `rule`. Fresh start (`admin.policy.fresh_start`) runs the
real thing in a transaction and rolls back for the preview; it relifts with
`keepPaid` (revoking is not refunding). `policy_member_rule_lines()` feeds the
family portal's rules box, which had "After 09:10 it counts as late" typed in.

**Official notices** (`domain/notices.php`, migration 211). One formatter,
`notice_html()`, escapes first and then applies WhatsApp's marks; it serves
the page, the Control Room preview (the shared `NoticeDoc` component) and the
email. Publishing claims the row (`status = draft` → `published` in one
UPDATE) before sending, so a double press sends once. Reads/acks per reader
(`m:<id>`, `g:<gid>:<memberId>`); a guardian's acknowledgement counts for
each child it is for and signs the family-inbox item (`family_report_sign` on
a `notice` delegates to `family_notice`). Email from `notice_mail`, drained
40 a minute by the webcron. `/notice/<id>` and `/notice` are a non-addressable
route (`notice`); the Control Room keeps the open notice in the URL
(`/control/comms/broadcast/<id>`).

Tests: PHP suite 6398 passed, 2 failed (the two known pre-existing ones);
notices 17/17, conduct-rulebook 10/10, fines-upload 18/18, route-registry 60/60.

## 2026-10-30 — Notices are written on the page (a document editor)

The notice drawer (a long form with a raw WhatsApp textarea) was rejected as
"not user friendly", with Claude Docs as the model, and "some announcements
are not this long". `NoticeEditor` (cr-tab-comms.jsx) replaces it:

- The page IS the notice (`.nt-paper.nt-doc`, the drawing members read): the
  title inline, a contenteditable body, a formatting band above the page
  (Text / Heading, B, I, S, bullets, undo/redo), Sending choices in a rail
  (a sheet below 900px of the editor's OWN width — container queries).
- Short by default: a new notice is a title and a message. Letterhead and
  sign-off are optional parts added from the page, prefilled from the last
  notice (`lastLetterhead` on `admin.notices.list`). A notice with no
  letterhead is an announcement: no "SUBJECT:" on the page, in the email or
  in the WhatsApp copy (`notice_is_official` / `notice_title`); the minimum
  body is now 2 characters.
- Storage is unchanged: the editor serialises its DOM back to WhatsApp text
  (`ntSerialize`), so `notice_html` stays the one formatter. The test asserts
  the round trip keeps every section and list item of the STS notice.
- Paste: a whole notice on an empty page → `notices.parse` fills every part;
  rich HTML (Word, Google Docs) → serialised → `notices.preview` → inserted.
- Drafts autosave (1.2s, one save at a time so the first save's id is never
  raced); the address is `/broadcast/new` → `/broadcast/<id>/edit`; unsaved
  words register with the Control Room's unsaved-changes guard. A published
  notice opens in the same editor in correction mode (note required).
- `admin.notices.save` now returns `reachMembers`, which the publish confirm
  reads before asking.
- `tests/notices.test.js`: 36 checks — paste, round trip, toolbar state,
  autosave, preview, publish, correction, a one-line announcement, the phone
  sheet.

## 2026-10-30 — Notices: the gap pass

An audit of the notices feature end to end found, and this closes:

- **Families got no push.** Publish put the notice in the family inbox and
  never told the phone. `notice_family_push()` now dispatches `g:<id>` at
  publish and at remind.
- **"Families only" was readable by the child** — from their notice list and
  from `/notice/<id>`. `notice_for_member()` refuses it for non-staff;
  `notice_in_audience()` is the audience-only test the family side uses, and
  a members-only notice is no family's.
- **Remind ignored reach**: a families-only notice reminded the CHILDREN and
  never the parents. It now follows reach — the parent's inbox item returns
  unread with a push.
- **Silent last-write-wins.** The editor sends `baseUpdatedAt`; a save over a
  newer version is refused `stale` with theirs attached ("Load their version"
  / "Keep mine" = `force`). Also fixed: after one failed save, the client's
  save chain stayed rejected and every later save was skipped.
- **Acknowledgement after the fact.** A correction could switch needsAck on,
  which no family inbox had been asked to sign. Fixed once published, with
  audience, reach and email.
- **Autosave did a 5,000-row load** to count the audience; it is a grouped
  count now (`notice_reach_count`).
- New: **publish later** (migration 212 `scheduledAt`/`scheduledBy`,
  `admin.notices.schedule`, webcron `notice_sched` → `notice_schedule_run`,
  published through `notice_publish_run` — the button's own path — as the
  scheduler, and held if they lost `content`); **test email to yourself**
  (`admin.notices.test`, twice a minute, the audit log as the clock); **email
  delivery figures** on the readers op; **readers CSV**; **duplicate**.
- Editor: retry on reconnect (15s or the `online` event), a beforeunload
  guard, a confirm before leaving words that cannot be saved yet, a roving
  tabindex toolbar, a characters-left warning near the 40,000 limit, a
  warning and refusal for an empty audience, z-index 42 so Control Room forms
  and confirms layer above it.
- Tests: PHP +17 checks; `tests/notices.test.js` 45 checks.

## 2026-10-30 — The Saturday Formation Schedule moves an hour later (9:00–3:00)

Owner's request: "push the current NGG timetable (Saturday formation) forward
by an hour". The doors already opened at 09:00 (attendance settings) and the
rulebook's lateness bands start at 9:30, so the 8:00 formation start was the
one out of step.

- **The table is the timetable**, so the shift is applied to each site's own
  rows, as edited: migration 213 (`NGG_FORMATION_HOUR_LATER`, SQLite ladder)
  and `NGG_MYSQL_ROW_FIXUPS['saturday_formation.hour_later.*']` on MySQL —
  the mirror cannot carry an UPDATE (the replay drops it; the suite's
  "mysql mirror" check caught exactly that), and a fixup replays every
  deploy, so the shift is guarded by a marker setting
  (`migration.formation_hour_later`). A 23:xx block is not wrapped. The two
  staff lines that typed a clock ("staffed by 7:50", "closed by 2:15") move
  with it. Fresh installs seed at 09:00–15:00.
- **Times that were typed now read the schedule**: `sf_day_bounds()` gives
  the day's first start and last end; the families' plan / not-arrived /
  close emails, their subject and body times, `public.formation`'s `hours`,
  and the mentor register's "on time" (was a literal `08:00`) all use it.
  The family app's "Doors open at 09:00" / "Sign-out opens at 14:00" read
  `family_day_times()` (attendance settings + schedule). The mentor portal's
  breakout time and the Control Room's formation note are derived too.
- Static copy corrected: the inbox "Session times" template (said 10am–2pm),
  the guide, the member's mentor agreement, the club portal's default centre
  window (14:00 → 15:00).
- **Not changed, on purpose:** the attendance settings (doors, grace,
  sign-out) and the rulebook's lateness bands are admin-owned policy; the
  guide tells the operator to move a 14:00 sign-out to 15:00 if one is set.


## 2026-11-02 — Families hear about dues before they are owed (domain/dues-notices.php)

Owner's request: "improve the messaging and reminder systems for dues, pending
payments and so on — parents should have started seeing notices and reminders
for upcoming dues some time before."

What was there: one arrears reminder, **off by default** (`remindEnabled`),
emailed to `parentEmail` only, and only after money was owed. A guardian with
the family app but no email was skipped as "noEmail"; nothing was said before a
due date; an "I've paid" note was silent until decided.

- **New domain `dues-notices.php`** (bootstrap list, after `membership-pay`).
  `dues_notice_send($m, $kind, $refKey, $msg)` is the one delivery path:
  every active guardian link's family app (`family_notice_add`, kind
  `dues-<kind>`), guardians' emails + `parentEmail`, Telegram per phone, SMS
  once per family only if Telegram missed, and the member's own portal for
  upcoming notices. It **claims a `dues_notices` row first** (migration 216,
  UNIQUE memberId+kind+refKey) so the cron and the button cannot double-send;
  the row then records `channelsJson`, `reached`, `sent|unreachable`.
- **Before it falls due**: `dues_upcoming_for()` reads
  `membership_upcoming_charges()` (un-posted dues on the 1st, renewals on the
  join anniversary) inside `noticeDaysBefore` and spends paid-ahead credit in
  date order. `dues_upcoming_candidates()` groups by due day (refKey
  `YYYY-MM-DD:kind-key+kind-key`) and counts the skipped (optedOut, paidAhead,
  nothingDue, alreadyTold, noContact). `dues_notices_run()` runs from
  `web_cron_reminders()`, once a day (setting `dues_notices_state.doneOn`)
  unless the 400-row batch filled.
- **Arrears**: `fees_reminder_candidates` skips `noContact` (no app, email or
  phone) instead of `noEmail`; `fees_reminder_send` delivers through
  `dues_notice_send(..., 'arrears', today)`. Still off by default — that is
  policy, the advance notices are on.
- **Payment notes**: `member_request_create` → `dues_claim_ack()`;
  `admin_request_decide` → `dues_claim_decided()` (what is still to pay, or the
  next amount and date when nothing is owed). `dues_claims_staff_nudge()`
  tells `fees` staff in scope once a day when notes wait past `claimStaffHours`.
- **Settings** (FEES_DEFAULTS, bounded in `fees_settings_save`, bounds in
  `fees_bounds`): `noticeEnabled` true, `noticeDaysBefore` 7 (1–30),
  `noticeApp/Email/Telegram` true, `noticeSms` false, `claimStaffHours` 48 (12–168).
- **Control Room**: Money → Dues & arrears → Reminders now leads with the
  notices (`admin.fees.notices`, GET view `notices`: coming fortnight, sent
  history, open notes, last run; the told-lookup is one query, not per row) and
  **Send today's … now** (`admin.fees.notices.run`, scoped to the requester's
  centres). Amounts has the settings group. `dues_notices` is in the member
  merge policy (MOVE_UNIQUE).
- Tests: PHP block "Dues and payment notices" in `api/tests/run.php`;
  browser suite `tests/dues-notices-ui.test.js` (`test:duesnotices`, in
  `test:all`). The pre-existing failure "portal: reading an entry marks it
  read" fails on the untouched base too and is not from this change.


## 2026-11-03 — Family app money fixes; parents pay Paystack's charge

Owner's requests: "Continue. Fix other UX issues" and "The parents should pay
the paystack charges".

**UX, found by driving every Control Room tab (89, desk and phone — clean) and
the family app with a seeded family:**

- A dues notice in the family inbox was a dead end (only *Close*). Money
  notices (`dues-upcoming`, `dues-arrears`, `dues-claim_decided`) carry
  `act: 'money'` from `family_inbox()` and open **Fees for that child**
  ("See fees and pay"); they show a wallet icon. Notices are now stamped with
  the child's `memberId` (arrears filed with the alerts, `cat = 'alert'`).
- "This month's commitment fee" was said of October's fee in November. Ledger
  entries now carry `period` (the periodKey), so a single dues line shows its
  month and an older one is named; several show the span.
- **Next charge / Coming up** was "next month's fee" regardless of paid-ahead
  credit or renewals. `family_fees_view()` reads `dues_coming_charges()` —
  the same calculation the notices use (`dues_upcoming_for()` now wraps it).
  An empty list says why (paid ahead to …, or nothing in two months).
- The terms line promised "a reminder is emailed every N days" whatever the
  settings; `fp3TellTerms()` says how the family is told, from the live
  notice/reminder settings and channels.
- Notices use the family's word, "Commitment fee · December 2026", not "Dues".
- The family pay sheet's *Total* read the ledger balance, which is ₦0 for a
  joining invoice; it now reads the invoice total.

**Paystack's charge** (`paystack_family_charge()` in membership-pay.php):

- Grossed up on the amount Paystack charges: `gross = ceil(net / (1 − rate))`,
  plus the flat part only if that gross reaches the waiver threshold, capped.
  Settings in FEES_DEFAULTS: `payFeeOn` true, `payFeeBps` 150, `payFeeFlat` 100,
  `payFeeFlatUnder` 2500, `payFeeCap` 2000 (bounded: 5%, ₦1,000, ₦10,000).
- `public_membership_pay_init` initialises for `total + fee` and puts
  `processingFee` in the transaction metadata; `membership_paystack_verify`
  expects `(total + metadata fee) × 100` (a pre-change checkout has none, so
  it still verifies), records `membership_invoices.processingFee` (migration
  217) and settles the invoice **total** — the ledger never sees the charge.
- Shown before paying: `public_membership_invoice.onlineFee`,
  `family_fees_view.payFee` (fees for the joining invoice total when one is
  open), `member_fees_account.payFee`; the receipt lists *Paystack charge*.
- The family view's button label moved into the design source
  (`mo.payOnlineL` in family-portal-v3.dc.html), recompiled with dc-compile.
- Tests: PHP block "Parents pay Paystack's charge" (the money reaching NGG is
  checked across ₦500–₦500,000, the flat-charge line and the cap; init amount;
  a bare-dues payment refused; ledger, receipt, paid page).


## 2026-11-03 — Announcements reach the member portal and Community

Owner's request: "As part of the reminders, quick messages and announcements
should also display in member portals and community."

Found: quick messages, club announcements (app channel) and official notices
already reached the member's bell; none reached Community; the arrears
reminder never reached the member.

- `community_announce($authorId, $sourceRef, $title, $body, $centre, $link)`
  (community.php) posts a staff broadcast as a pinned `announce` post in the
  commons through `community_post_create()` (so the staff-only rule and the
  safeguarding screen apply), once per `community_posts.sourceRef`
  (`qm:<notifId>`, `ann:<annId>`, `notice:<noticeId>`; migration 218). The
  per-author spam throttle is skipped for this path only, via a request-scoped
  global. `community_announce_withdraw()` sets `removed`.
  `community_announce_fits()` keeps Summer-only and guardians-only messages out
  and names the centre for a one-centre message.
- Quick message: `admin_broadcast` takes `community` (the route passes it),
  returns `community: {posted, why}`. Notices: `notices.communityOn`
  (migration 218), set in the editor, posted on publish (with a /notice link),
  removed on withdraw. Club announcements: `community` in `CP_ANN_CHANNELS` and
  in `cp_ann_default_channels()`; `cp_ann_send` posts by the approver and counts
  it in `stats.community`.
- Member portal Today (`todayVals`, mp9-app.jsx) leads with up to three unread
  announcements/notices from the last 14 days; reading one marks it read.
- `dues_notice_send` takes `member => ['title','text']` for the member's own
  words; the upcoming notice and the arrears reminder (`fees_reminder_send`)
  both reach the member's portal. Money is never posted to Community.
- Tests: PHP block "Staff broadcasts reach Community and the member's portal";
  the club-portal default-channels check now expects Community.
- Also in this round: `window.__adminSection` is installed once in a layout
  effect (it was missing between first paint and the effect, and torn down per
  render); membership-pay and portal-account tests wait for what they assert.


## 3 Nov 2026 — Lates before the first band; one penalty per entry; fines owed read the account

Reported with a screenshot of Compliance → Frog jumps to do: "Arrived 09:21 …
(09:45 to before 10:00) — 3 frog jumps", "Arrived 09:01 …", and an absence row
"₦1,000 fine and 7 frog jumps" under a "How many" of 7.

- **Cause.** Two definitions of late. The ladder logged a member late from
  resumption + grace; the rulebook (30 Oct) is late from its first band. The
  rulebook re-reads every late on record, and `policy_band_for()` answered the
  FIRST band for any minute below it, so ladder-era lates were charged under a
  band their own arrival time contradicts. It now answers `before`, and
  `policy_apply_session()` issues nothing for it.
- **Repair.** `policy_prelate_repair()` — half-day repair's shape: per person in
  one transaction, bounded, `more` to continue; runs at the top of both nightly
  sweeps and on demand (`admin.policy.prelate.run`, Compliance → "Correct lates
  before the first band"). Voids each pre-band late (`POLICY_PRELATE_TAG`), logs
  the day tardy, `policy_relift` lifts the fine and owed jumps (a paid fine's
  charge is voided — the payment stands as credit). Done jumps stay done.
  Only under `rulebook = session`.
- **Wording.** `policy_session_reason()` is the one place a rulebook row's words
  come from: one penalty per row. The repair rewrites older rows and the fine's
  ledger note. The jumps list carries `for` (late/absence) and `date` from the
  tier; the column is named for the exercise, plus a For column.
- **Money.** `policy_reentry_sync` → `policy_fines_sync`: every pending policy
  fine the account covers is paid by the ledger (both ways; a voided payment
  makes it owed again; `admin_fees_void` re-syncs). Before, only the re-entry
  fee was read this way, so a fine paid online stayed "owed" on the conduct
  board and froze awards. `policy_states_for()` counted proposed fines as owed
  while `policy_state()` did not — aligned.
- Tests: PHP block "Arrivals before lateness begins are not lates" (19 checks,
  mutation-checked: removing the `before` branch fails two, re-entry-only sync
  fails two); `tests/conduct-rulebook.test.js` checks the column and wording.
- Baseline before this change: PHP 6501/1 failed (`portal: reading an entry
  marks it read`), UI smoke 648/1 failed (`…a named reason for every family NOT
  included`) — both pre-existing and unchanged.


## 3 Nov 2026 — Money screens read the account one way

Reported: "the UX for finance-related things is terrible". Walked every Money
view and the family's Fees page with a realistic ledger (part payments, a
waiver, policy fines, the training place) and fixed what the figures got wrong
before touching how they look:

- **The family breakdown named the wrong charges.** `family_fees_view` walked
  the charges newest-first until they added up to the payable; payments are
  applied oldest-first by due day everywhere else. `fees_charges_left()` is the
  one allocator now (the walk `fees_unpaid_of` does, per entry); the breakdown
  reads the ledger itself (the member's account view withholds `entryId`, held
  by the "withholds which member of staff" test) and carries `of` for a part-paid
  charge — the page says "₦3,000 already paid of ₦5,000" instead of showing a
  ₦2,000 membership.
- **Charged − Received ≠ Payable** on the staff account: `charged` held the
  ₦60,000 training place. The tiles read `realCharged` / `realCredited`, and the
  place has its own tile. The account search returns the real figures too.
- **A waiver was capped at `outstanding`** (training included), so waiving more
  than was owed stood as credit that paid the coming months. Capped at
  `payable`; the form says "payable now"; Waive is off when nothing is payable.
- Smaller: a part first month is "Monthly dues YYYY-MM (part month, from …)"
  like every other month (it was "Commitment fee YYYY-MM", the family-side word,
  in a staff ledger); a fine line no longer repeats its amount ("— ₦1,000
  absence fine." beside ₦1,000); the account no longer carries a second "Back to
  the list" button; a parent on file as "Mrs Chukwujeme" is greeted "Good
  evening, Mrs Chukwujeme", not "Good evening, Mrs".
- Tests: PHP block "Money read one way" (6 checks; restoring the newest-first
  walk and the `outstanding` cap fails two). Pre-existing and unchanged:
  `membership-pay.test.js` harness error (`window.__adminSection is not a
  function`) fails the same with and without this change.
- **The account is a statement** (follow-up the same day, after "this
  structure of analysing the funds is unprofessional and confusing"). The
  account was four tiles that did not reconcile, seven equal buttons and an
  amounts list with no balance. `fees_account_statement()` builds it on the
  server (on `admin.fees.member` as `account`): `summary` (charged by kind −
  received by kind = payable, with credit said as credit), `open` (each charge
  with something left, in the allocator's own due-day order, with `due`, `paid`
  and `left`) and `statement` (every entry with the running balance after it; a
  voided entry is listed and moves nothing; the training place is not in it
  unless it became owed on leaving). The screen: a summary with the
  reconciliation table (`.cr-stmt`, `.cr-recon`, container query, not a media
  query), "What is owed", "Statement", then the training place apart. Header
  actions are the four money actions; the MOU and reminders are settings in the
  summary. Checks: PHP "statement · …" (3), `dues-notices-ui.test.js` reads the
  reconciliation off the page.


## 2026-11-03 — Math Lab → The Mathematics Clinic: review, research and plan (nothing built)

Owner's request: review the Mathematics Clinic curriculum (JSON, 170
competencies), say how feasible it is, how it scales, how assessment is
structured and how real exam questions (SAT, WAEC, Ghana, Nigeria and more) can
be used; transform Math Lab into the Clinic (keep the name), put it on the study
page at its own address, and restructure it — "it is currently shit", "the
questions are also shit". Explicitly: research, plan in full detail, do not
build yet.

- `docs/MATH-LAB-PLAN.md` is the result: the curriculum measured (13 of 16
  fields per competency are boilerplate; 160 of 170 prerequisites point to
  themselves; no questions at all), the current Lab and all 91 of its question
  forms audited, three research streams (exam formats and copyright; learning
  science with effect sizes; competitors and maths tech), and the design.
- Owner decisions recorded in its §17: interface replaced completely; members
  only, free, Coursera-style courses; Math Lab Lite for non-members; members
  start at the lowest point and climb fast on performance and speed (§9.4a);
  pilot Stages 5–7; exam track and licences are the long run; AI drafting
  heavily guarded (§8.7); Claude and ChatGPT are the team.
- `HANDOFF-NEXT-AGENT.md` restored with the Math Lab as the next job.

## 2026-11-03 — Maths Lab: the deep functional preview (built)

Owner's request: "build a deep functional preview version of the new maths lab
… and send me a production zip". Name decided: **Maths Lab** (just that).
"Defend" decided: a smarter machine-marked method — built as "Spot the error"
items plus a confidence check on every question.

- `/study/lab` is a new tab of the study page (`STT_TOOLS` entry `lab`, flag
  `deep` so its sub-addresses survive); `/mathlab`, `/math-lab`, `/mathslab`,
  `/lab` forward there (`pageFromPath`). The Arcade's Math Lab card now opens it.
- Content: `domain/mathslab-map.php` (all 170 competencies, strands, courses;
  the drafted graph for Stages 5–7, a default chain elsewhere) and
  `domain/mathslab-gen.php` (Stages 1–7: 70 competencies, ~120 forms; seeded,
  answers and wrong options derived; worked solutions; KaTeX stems; diagrams;
  "Spot the error"; a safe expression evaluator for algebra answers — no eval).
  Stages 8–17 show as "in preparation".
- Engine `domain/mathslab.php`: members only (NGG), free. The climb from MC-001
  (6-question gates, all right and fast clears a stage as "known", momentum
  shortens gates, a partial gate ends the climb at the gaps), practice with
  instant feedback and a BKT-style probability, mastery checks (10 items, 85%),
  spaced reviews (10 days → secure → 45 days → long-term), stage bosses (80%),
  XP with a daily practice cap, streak with earned freezes, badges, courses with
  enrolment and a printable certificate with a verification code. Maths Lab
  Lite for everyone else: signed-token questions, marking and solutions, no
  record. Ops `mathslab.*`, `public.mathslab.*`; routes `api/member/mathslab.php`,
  `api/public/mathslab.php`; migration 219 (+ MySQL mirror); merge policy.
- Interface `src/modules/mathslab/mlb-app.jsx` (+ `styles.css` `.mlb-*`); KaTeX
  0.16.11 vendored under `vendor/katex/` (woff2 only) and registered in
  `vendor/VERSIONS.json`. `vendor-build.js --check` compared 16-character hashes
  with 64-character ones and failed every file — fixed; nothing ran it before.
- Verified: PHP suite 6560/0 (the Maths Lab block re-derives ~3,000 generated
  questions and walks the climb, practice, check, review and Lite); a browser
  smoke at 390 px as a member and as a guest, no page errors.
- Not yet (see docs/MATH-LAB-PLAN.md): Stages 8–17 content, the exam track,
  instructor/parent views, offline packs, question bank and AI pipeline,
  migrating old Math Lab progress. The old Arcade Math Lab code is still in
  page-club.jsx, unused by the entry card.


## 3 Nov 2026 — Money data-risk fixes (from the money research)

Nine faults found by reading the money code end to end; each fixed with a PHP
check that fails without it (mutation-checked).

1. **Summer accounts were charged** by the nightly run (membership, dues, the
   training place). `fees_accrue_member` refuses a non-NGG account.
2. **Months away were back-billed** on return. Dues months and membership years
   are charged only if the member was active on a day of them
   (`member_status_log`, `fees_active_between`).
3. **The ceiling was checked once** before a backlog posted. Now before every posting.
4. **Members past the first batch were never charged automatically**
   (`ORDER BY id LIMIT N`, no cursor). `fees_accrue_batch` carries a cursor
   (`fees_accrue_cursor`) and wraps.
5. **`fees_post` read any insert error as "already posted".** Only a duplicate
   key does (`fees_is_duplicate`); keys over 96 characters are shortened the
   same way on both databases; migration 220 widens MySQL `periodKey` (was 32)
   and indexes `member_ledger.createdAt`.
6. **A family's payment claim skipped the payment guards** (reused reference,
   own account, open joining invoice). `fees_payment_guard` serves both doors;
   a claim's parts post in one transaction.
7. **A void could split an invoice from its ledger.** Payments keyed `minv:`,
   charges posted by `invoice:` and deductions keyed `volpay:` are corrected at
   their source (`void_at_source`).
8. **Three owed totals.** The Members overview and Analytics read real money
   (training place out, owing only above zero); the member drawer shows the
   statement's figures; the first ageing band reads "up to 30 days overdue".
9. **Fines matched by wording** ("chocolate" counted as late) and a capped fine
   left its sanction owed with nothing charged. Policy fines name their rule;
   old rows match whole words; a refused or trimmed fine updates its sanction.
10. **Unapplied money** (paid against a replaced invoice, or a mismatched
    amount) lived only in the audit log. Migration 221 `unapplied_payments`,
    one row per reference, listed on Membership payments with Apply to account
    / Refunded / Dismiss (`admin.fees.unapplied.resolve`); the old audit rows
    are brought in once (`unapplied_backfill`). Merge policy: BLOCK.

## 4 Nov 2026 — Statements and reports read as statements

- **Member money screen** (`mp9-more.jsx`, design source
  `docs/design/portals/member-portal-v9.dc.html`, regenerated with
  `tools/dc-compile.js`). The training card printed a hardcoded "MOU done" for
  every member; `member_statement` now returns a `training` block (cost,
  covered, owed, mouDone/mouAt, left) and the card reads it. Ledger rows are
  `.m9x-led-*` classes with a container query: on a narrow panel the
  description leads and the figures sit labelled beneath it. Notes are shown
  in words (`mp9Plain`: months and days as dates, the fine amount not
  repeated, "Commitment fee" — the name families and receipts use). The
  last-eight view states the balance brought forward.
- **Family statement**: `family_fees_view` entries carry `balance` (real
  money after the entry; training and voids move nothing); each month closes
  on *Owed at month end*. The Fines card goes through `fp3Note`.
- **Period report**: `admin.fees.journal` returns `roll` from
  `fees_journal_roll()` — opening, charged, received, waived, otherCredit,
  closing, and `months` (≤ 24, each opening where the last closed). Not
  narrowed by kind/direction/state; narrowed by scope and member search.
  Drawn on Transactions as a statement for the period plus a month-by-month
  table with CSV.
- **Bug fixed on the way**: `/api/admin/fees.php` passes `limit` as `''`
  when the client sends none, and `max(1, (int)'')` made Transactions draw
  **one row a page**; the training list had the same floor. A blank or
  nonsense limit is now the default page. Test: "a limit the route passes as
  blank is the default page, not one row".
- PHP suite 6588 passed (all new tests mutation-checked). UI smoke 367/1 —
  the one failure (Math Lab `.ml-ladder` timeout) reproduces on the commit
  before this work.

## 4 Nov 2026 (later) — One breakdown of what is owed; Volunteer pay and Donations add up

- **`fees_owed_made()`** (fees.php) is the one answer to "what is the payable
  made of": open charges left (oldest-first allocation), dues grouped with
  months named and gaps said (`fees_month_spans`), fines with their reason
  (amount not repeated), and a `training_owed` line when a member left before
  the MOU. It returns `ok` = the lines sum to `payable`. Read by
  `family_fees_view` (the old browser grouping `fp3Lines` is gone),
  `member_statement` → `owed` (shown on the member's To pay card, design source
  regenerated), and Who owes' `made.training`. Before this, a member who left
  early had a payable larger than every breakdown of it.
- **Volunteer pay**: `admin.volpay.period` totals carry `paidOut`, `fineNgg`,
  `fineAv`, `payouts` and `settles` (earned = paid + fines kept/held + unpaid).
  The tab draws it as a settlement statement; the per-row column is renamed
  *NGG fines owed*.
- **Donations**: `admin_donations_list` counts raised, gifts, distinct donors,
  largest, average, pending and abandoned (> `DONATION_ABANDON_HOURS` = 48)
  over every row, plus `months` and `channels`; `export=1` returns every row
  to `DONATIONS_EXPORT_MAX` (named when hit). The screen counted three of its
  four tiles from the newest 500 rows.
- Still open: a Money overview tab (needs a registry entry in `cr-pages.jsx`).



## 2026-11-04 — Photos: stored in R2, optimised once, served from R2

Owner's plan: the bucket (R2) stores; Cloudinary optimises. Cloudinary bills every
byte it serves on every view and R2 serves free, so Cloudinary is used ONCE per
photo per size, never on a view. (A first cut delivered every view through
Cloudinary fetch; the owner pointed out the per-view cost and it was rebuilt.)

- `photo_variants_make` (domain/photos.php): each size in `PHOTO_VARIANTS` is
  fetched once from Cloudinary (`/image/fetch/f_webp,q_auto,<steps>/<bucket url>`)
  and stored as `<photo>__<size>.webp`; only when all are stored are the records
  repointed to `<photo>?nv=1` (`photo_repoint_urls`). `photo_variants_tick`
  every 10 min; Diagnostics → Optimise photos.
- `nggImg(url, size)` (photos.js): `?nv=1` → the stored size in the bucket; a
  Cloudinary-hosted photo → its size after any edit; else as is.
  `NGG_IMG_SIZES` = `PHOTO_VARIANTS`, held by a PHP test. 21 display sites and
  the Club's `cmOpt` go through it.
- Held own-store photos move into the bucket (`photo_store_to_bucket`), records
  repointed, local file kept, missing left alone; hourly and from Diagnostics.
- Edits: with a bucket, `cloudinary_adopt` edits bucket/own-store photos by
  fetch (no copy into Cloudinary storage); `photo_materialise` saves the
  finished edit into the bucket and makes its sizes.
- Card printing frames a bucket photo by fetch (`nggImgFetchParts`, needs
  site-config `img`), once per print.
- Not done: moving photos stored IN Cloudinary into the bucket (frees its
  storage and their per-view bandwidth). Same machinery; wants a dry run on
  production data first, since those URLs are on printed-card records.
## 2026-10-30 — the Saturday formation is editable, per centre and per Saturday

- **Versions of the day** (migration 204, `saturday_formation_blocks.scope`):
  `''` the main day, `centre:<centreId>`, `date:<Saturday>`,
  `date:<Saturday>@<centreId>`; `sf_day($date, $centreId)` resolves them in that
  order, most specific first, and is the one resolver every reader uses.
  Centres are keyed by id, so a CACENTRE rename leaves their day in place. The
  old `saturday_formation` table is copied once and left unread.
- **Saturdays off** (`saturday_formation_dates`): everywhere or at one centre,
  with a note families read. Nothing is sent; portals say so.
- **Times are the day's.** A save refuses an overlap unless it ripples; add,
  remove and move keep the day's end; `shift` moves the whole day. The hours,
  the parent plan/absent/close times and the reminders follow the version in
  force at the child's or mentor's centre that Saturday. Nothing is pinned to
  8:00 or 2:00 any more, except that no family email goes before 8:00.
- **What a block is for is its `kind`** (`checkin`, `mentor`, `classes`,
  `break`, `close`), not its key: the reminders and `mp_breakout_window()` read
  the kind (falling back to the seeded `musing`), so a renamed or re-keyed
  block keeps working.
- One route, one op per verb (`admin.formation.add/remove/move/shift/
  version.create/version.delete/day.set`), capability `content`, centre-scoped,
  one audit event each, `cache_invalidate('formation')`.
- The family email lost its inline `style` attributes.
- Tests: the formation section of `api/tests/run.php`;
  `tests/formation-editor.test.js` (in `test:all`, `npm run test:formation`).

## 2026-10-31 — application review fixes (NGG membership and volunteers)

From a read-through of both journeys; each item has a test in the
"Application review fixes" block of `api/tests/run.php`.

- **Siblings**: convert matched "already a member" on email alone, so the second
  child on a parent's email got no record. Now email + date of birth (or name).
- **Details required**: the Club's guardian/school/consent checks ran only when
  the request sent `details`; leaving it out skipped them. Now `details_required`.
- **Changing an application** needs a 6-digit code emailed to that address
  (`app_edit_code_check`, stored hashed in `details._edit`, stripped from the
  admin list).
- **Convert guards**: refuses a declined application, re-checks age 10–17,
  asks for a centre instead of defaulting to Egbeda (must be an active centre).
  `status=accepted` for a child is refused (`use_convert`).
- **Waitlist** stays in the inbox (`status` accepts a comma list); waitlist and
  reject tell the family by email and text (`app_tell_family`).
- **Centre scope** on applications list/status/convert/update/delete; volunteer
  list filtered in SQL above the caps; decline and safeguard scope-checked.
- **Volunteer safeguarding**: two referees + declaration on both forms
  (`volunteer_apply_safeguarding`); under 18 needs a guardian who agrees, and
  approval needs `guardianConfirmed` (recorded in `consents`,
  type `volunteer_guardian`). The instructor roster refuses until
  `safeguarding = 'cleared'`, and its per-child queries are now two grouped ones.
- **Programmes**: volunteer dedupe is per programme; approving a second-programme
  application widens the volunteer to `both`. NGG's volunteer door checks the
  centre runs the Club. Control Room has the `ngg_volunteer_applications_open` switch.
- **Copy and structure**: welcome email no longer says "cohort"/"Summer Students";
  admin alert says "NGG membership"; decline email is programme-aware; inline
  styles removed from these emails. `window.__nggProgram` removed (the URL is the
  state). Unmounted `AdminApplications` and `ApplicationEditor` deleted.
  `/join/volunteer` rebuilt with classes (`.nvj-*`, `.vsg-*`).
- **Not done**: bulk actions and a waitlist state on the volunteer review queue;
  the applications CSV still carries guardian phones in full (it is an admissions
  call sheet, now limited to the admin's own centres).

## 2026-10-31 — the registration checklist

- **One list per NGG member, two sources** (`domain/registration-checklist.php`,
  migration 205). Automatic items are one registry, `RCL_AUTO`, each with a
  verifier `rcl_verify_<key>()` that reads the record (guardian link, the five
  membership consents, photo, date of birth, school, emergency contact,
  courses, the joining invoice while fees are on, a non-proof printed card).
  They are computed on every read from grouped queries (`rcl_facts`), never
  stored, and evidence never ticks one. Admin items are `reg_checklist_items`
  (photo | document | none, presence, max age), retired not deleted.
- **Supervisors** are suggested by the server (`rcl_candidates`): staff with
  `people` covering the centre, NGG mentors there with screening recorded
  (`ms_clearance_bulk`), NGG volunteer mentors and instructors there with
  safeguarding cleared. "Physically available" is presence at that centre in
  the last six weeks: `attendance` rows attributed to a centre by the row's own
  `centreId`/`centre`, else the gate link its device names, else the person's
  home centre; the check-in desk rota (`attendance_duty`) and `timetable_slots`
  there. Ranked by Saturdays present, other days, rota, classes, being the
  member's mentor, and load (cap `RCL_SUPERVISOR_MAX` = 12). Somebody with no
  presence is listed only to pick with a typed reason (audited). A person is
  one principal: a volunteer or mentor with a member account is their memberId.
  `admin.regcheck.assign` re-derives all of this per row, per centre.
- **Verification** (`member.regcheck.submit`, `rcl_check_evidence`): assigned
  supervisor only; the file must be ours (`results_file_ok`), its extension
  and declared type must match the item's evidence, its size bounded (the
  size `media_objects` recorded wins), its date within `maxAgeDays`, and, for a
  presence item, the supervisor checked in at the member's centre that day.
  Every attempt is a `reg_checklist_submissions` row with a verdict and a
  reason in words. Staff reject reopens (`reg_checklist_state`).
- **Upload**: `evidence` is a media-aware kind in `upload-sign.php` (a PDF stays
  a PDF), and a volunteer's card session may sign that kind only, because a
  volunteer can be the supervisor.
- **Reminders** through the web-cron (`rcl_tick`, hourly): recount open
  checklists; each supervisor once an ISO week; each guardian once a week with
  only the family's items; claimed in `reg_checklist_sends` before sending, at
  most 60 sends a tick.
- **Screens**: Control Room → Members → Registration (tab id `reg-checklist`,
  because `registration` is the alias for the Summer desks), `cr-tab-registration.jsx`;
  My registrations in the Mentor Portal and the progress card for the member
  (Me) and family (Today), `mp15-registration.jsx`. `admin_application_convert`
  starts a new NGG member's checklist with one guarded call.
- Merge policy: `reg_checklists` keep the survivor's, state moves unique,
  submissions and sends move.
- Tests: the registration checklist section of `api/tests/run.php` (rolled back
  after it runs) and the convert check beside the convert test;
  `tests/registration-checklist.test.js` (in `test:all`, `npm run test:regcheck`).

## 2026-11-04 — NGG documents: invoice, receipt, acknowledgement, Math Lab certificate

From the handoff `design_handoff_ngg_documents`. `api/_lib/domain/documents.php`
owns all of it; migration 224 adds `doc_serials` and `documents`.

- **Numbers without gaps.** `doc_mint()` bumps a counter row in the same
  transaction as the record, so a rolled-back invoice takes its number with it.
  The invoice number IS `membership_invoices.invoiceId`, so the pay page, the
  emails, the narration and the paper carry one number. The receipt number is
  minted inside `membership_settle()`'s transaction. Old `NGG-INV-xxxxx`,
  `NGG-BAL-`, `NGG-ADV-` and `NGG-RCT-` numbers are kept, never renumbered.
- **Frozen receipts and certificates.** `documents.data` holds what they said,
  including the legal details filled in at issue. A detail blank then takes
  today's value, because a blank was never printed as a fact.
  An invoice is rendered fresh, with its status derived (due, overdue, paid,
  void).
- **No server PDF.** The host has no headless browser. The page is printed by
  the browser; fonts come from `/assets/fonts` (the CSP has no font host), and
  the icons and the QR are inline SVG. A page that runs past one sheet hides its
  print button and says so.
- **Verification.** `/verify/<number>?c=<check code>` (`.htaccess` →
  `api/public/doc-verify.php`). Numbers are sequential and so guessable; the
  code (an HMAC of the number) is the key. A wrong code and an unknown number get
  the same answer. Rate-limited (`doc.verify`).
- **Acknowledgement**, not a receipt, for a transfer the desk recorded and a
  second person has not checked. It carries the payment's own id, not a receipt
  number, so a refused transfer leaves no receipt number behind.
- **Certificates** on a member's first clear of a level; a later 90%+ issues a
  Distinction one and the old one verifies as superseded. The paper printed is
  the real one (Foundation, Standard or Stretch), not the handoff's two-way
  rule. Each level carries its `formula` in `mathlab_levels()`; blurbs 8 and 14
  were aligned with the handoff.
- Departures from the handoff: no `pay.ngg.ng/INV-#####` short link (an
  invoice number in a URL would let anyone enumerate families' invoices), so
  the pay QR and link are the private `/pay/<token>`; billing address prints
  only where the application recorded one.
- Tests: the documents block at the end of `api/tests/run.php`.
## 2026-11-04 — Notice editor: an overflow, and a pasted notice that never saved

Reproduced with the owner's own notice pasted into the editor, measured at 390px
and 1360px, in the editor, its preview, the member's /notice page and the
desk's notice page:

- The letterhead's remove button hung 6px outside the page (`right: -6px`)
  on a phone. It sits inside now, and the two letterhead lines keep clear of
  it on both sides.
- **A notice pasted whole onto a new page never saved by itself.** The paste
  fills the subject in the same event that reads the body, before React
  re-renders, so `changed()` saw no subject and left the state at `new`; the
  autosave only ran from `dirty`. It waited for the next keystroke — or lost
  the paste to a closed tab. The autosave now runs from `new` too once the
  notice is valid. `tests/notices.test.js` asserts it with nothing else
  touched (the earlier test changed a setting right after pasting, which is
  why it never saw this).
- Not a fault: `.cr-pchips` (every phone table's filter row) is a deliberate
  edge-to-edge scrolling strip; the page itself does not scroll sideways.

## 2026-11-04 — One Rules page; the Learn review made real

**Rules page** (Money → Conduct & fines → Rules, `admin.policy.rules`): the
rulebook's four rows and every written rule in one table — trigger,
consequence (fine and/or frog jumps), repeat escalation, cap, breaches.
Written rules gained frog jumps and "every Nth breach in a term → suspension
(+ re-entry fee) or review" (migration 225; `policy_apply_rules`, tiers
1e8–5e8 in `policy.php`). Breaches are recorded per person or in bulk
(`admin.policy.ruleBreach`, cap 100, per-row verdicts, one audit event), and
the rulebook's four are edited from the same page by `people`
(`admin.policy.rulebookSave`). *Announce the rules* drafts an "Our rules"
notice. Tests: the "One Rules page" block in `api/tests/run.php`,
`tests/rules-page.test.js`. `conduct-tab.test.js` now expects the Rules view
first, and a club admin to see Rules + Compliance.

**Learn audit — three faults that between them meant the week-later review
almost never happened and a lesson's score measured nothing:**

1. `curriculum_opening_review()` took the row before today's lesson in a list
   ordered *week, course, position*; for a member with two courses (or a
   Club-wide lesson that week) that row was another course's, and it returned
   null. It now walks back to the previous lesson **in the same course**.
2. A pass on the lesson page, with the lesson still on screen, counted as the
   review being done, so the page's own "have a go now" turned the review off.
   Recall is now an answer **≥ 2 days** after the lesson was opened
   (`curriculum_progress.reviewedAt`, migration 226; `curriculum_recalled()`
   also accepts a pre-226 completion that was already that late). Not offered
   in the same sitting.
3. The submit returned every right answer after the first try, beside
   "Submit again". It now returns `right` per question, and the answers only
   once passed or after `CURR_REVEAL_AFTER` (3) tries
   (`curriculum_attempt_review()`). `CurCheckField` reads either shape.

Not changed, worth knowing: the opening review still offers last week's
questions to a member who never opened last week's lesson (it was always so —
"you missed a session" is information too); and an instructor's mark on a
written answer days later does not stamp `reviewedAt` (only the member's own
submit does).

## 2026-11-04 — The Arcade's Math Lab door, and a smoke suite that had stopped halfway

`tests/ui-smoke.js` failed on "waiting for `.ml-ladder`". Not a slow page: on
3 Nov the old twenty-one-level ladder was replaced by the Maths Lab at
`/study/lab`, the Arcade band's button became a navigation there, and the
test went on waiting for the retired ladder. That wait sat outside `step`, so
its timeout THREW and every assertion after it in the file silently never
ran — the run read "367 passed, 1 failed" over a suite of 627.

- **The band** (`MathLabTeaser`, page-club.jsx) still read the RETIRED
  ladder's board and said "Twenty-one levels across six strands … Next up:
  Surds" on the way into a Lab that has neither. It now asks the new Lab
  (`mathslab.home`) and shows its next step, level and topics mastered; a
  Summer account (members_only) gets the door without figures. It is an
  `<a href="/study/lab">`, not a button that sets `location`.
- **Removed, unreachable since 3 Nov:** `MathLab`, `MathLevelCard`,
  `MathPaper`, `MathMarked`, `ML_TIERS`, the Arcade's `lab` state, the
  `NGGApi.member.mathlab` client namespace and ~100 `.ml-*` rules (only
  `.ml-teaser*` remains). The server ops in `mathlab.php` / `arcade.php`
  (`mathStart`, `mathSubmit`, the level certificates) are untouched: issued
  certificates must keep verifying, and the PHP suite still covers them.
- **Tests now cover the new Lab in a browser for the first time.**
  ui-smoke's Math Lab blocks hold the band (asks the new Lab, names its next
  step, never the retired ladder, links to /study/lab, copes with a Summer
  account, 4.5:1 on the community surface, fits 360px) and render the real
  `MathsLab` home on the same data. `mathlab-shot.js` photographs the band and
  the Lab's home and map, with the map read from `mathslab-map.php`.
  Fixture trap: the ui-smoke API stub is a Proxy, and a stub assigned through
  `NGGApi.member` before `member` has been stored on it is silently lost.
- **One more fault the abort had hidden:** the fees Reminders test expected
  "no guardian email"; the server deliberately became `noContact` ("no way to
  reach the family") in 19f44ec1 when reminders gained app and phone. The test
  was brought up to the contract.

## 2026-11-04 — Wi-Fi audit fixes (NGG and CACENTRE), and the 406

**The 406 on Control Room → Wi-Fi ("The last list didn't reach CACENTRE … answered 406").**
- CACENTRE's host (cPanel ModSecurity) refused the request before CACENTRE saw it. NGG already pages at 96 KiB, so either the host's limit is lower, or something in a row trips a firewall rule.
- The push stopped at the first refusal, so nothing went at all.
- `wifi_cac_push` now **halves a refused part and retries**. A person still refused when sent alone is set aside and **named** in the result's note (`firewalled`). Everybody else goes through. At most `WIFI_CAC_MAX_CALLS` (120) requests a push.
- If the named people are always the same, look at their name or email, or ask CACENTRE's host which rule fired.

**Withdrawals finally work for a roster in parts.**
- Every request carries `sync: {id, part, last}`. CACENTRE (cacentre-site `claude/finme-dues-training-fees-l54o5j` @ 27dc876) withdraws whoever an unbroken, complete set did not list.
- `last` is never sent when anybody was set aside, so an incomplete list withdraws nobody.
- The result's `synced` says whether CACENTRE confirmed it.
- Before this, NGG's ~1,200-person roster was always paged and **nobody was ever withdrawn**.

**Status is allow-listed.**
- `wifi_access_for` treats only `active`, blank and graduated records as members. Everything else is `blocked`: deleted (self-delete sets `deleted`), merged, inactive, suspended, pending, and anything an import brings.
- Before, only `suspended`/`inactive` were blocked, and a deleted or merged member kept Wi-Fi.

**Tests.** `api/tests/run.php` has 11 more checks (sync parts, the honest note, the 406 split, statuses). Suite: 6816/0.

**CACENTRE side (same audit; details in its `cac/docs/wifi.md`).**
- `#` refused in passwords; `#end` passwords replaced.
- Children are never put on a router at a site that does not filter, hubs included. **The CACENTRE hub was created with filtering off, so children lose Wi-Fi there until a manager turns its filtering on.**
- Routers report the filter they actually imported.
- One bad line no longer stops a router's sync.
- NGG rows need a verdict; junk dates are refused.
- Afrovanguard password tokens are spent.
- Names are made one line before they go into router scripts.
- Tests: full unit suite 6676/0; new MySQL integration test `wifiroster.php` 18/0.

**Left as designed, for the owner to decide.** A CACENTRE override can still turn on somebody NGG has off. That is CACENTRE's rule 2, documented as "on the record, with a reason".

**Deploy order.** Either side can go first: an old CACENTRE ignores `sync`, and the note says nobody was withdrawn. Withdrawals start once both are live. Routers set up before 27dc876 keep the old script until their one-line install is run again; the server-side guards protect them meanwhile.

## 2026-11-04 — One certificate system for the Maths Lab; better questions; Progress; fines beside frog jumps

- **Certificates.** The documents domain (`df531900`) issued certificates only
  for the retired ladder's levels, and the new Lab printed its own uncheckable
  page. Now: a **stage certificate** every ten topics (all mastered + the stage
  boss; `doc_mlb_stage_issue`, `NGG-MLS-`) and the full **course certificate**
  after every stage of a course (`doc_mlb_issue`, `NGG-MLC-`), both in the
  committed certificate design (`doc_render_certificate`, the level layout for
  a stage), in Family → Documents, on `/verify`. Issued by
  `mlb_issue_certificates()` at the end of every session (and on Lab home, for
  anyone who had already earned one); the Lab's own certificate box
  (`MlbCert`, `.mlb-cert`) is deleted — the Lab links the documents (Map,
  Courses, Progress, the result banner). The X-Frame-Options DENY on the API
  is why it links rather than frames.
- **Questions.** An audit of 40 seeds × every form found every spot-the-error
  form put the mistake on the same line (MC-022 line 1; MC-027, MC-049 line 2;
  MC-045 line 1). `mlb_error_of()` picks among genuine mistakes on different
  lines, later lines carrying the mistake forward. "What mistake did X make?"
  (MC-013) now has four outcomes including "nothing — it is right"; "which is
  equal to N" varies its form; one comparison in four is "="; profit/loss %
  is drawn from ten rates, not five. A test sweeps every form for a fixed
  error line or a constant typed answer; it was shown failing on the old
  generator on exactly MC-022/1, MC-027/2, MC-045/2, MC-049/1.
- **Features.** `mathslab.progress`: each stage's topics, boss and
  certificate; every certificate; the mistakes that keep coming back (wrong
  answers in the last 40 sessions, re-generated from their seeds and
  re-marked, with the misconception or hint as the reason, and "Practise it");
  the last 14 days with "sure but wrong". In practice, a wrong pick is marked
  (✕) as well as the right one.
- **Compliance wording.** The frog-jumps table said "not money; fines are under
  Policy fines owed", read as "fines are not monetary". It now says the jumps
  are on top of the fine, and each row shows *Fine for it* — the fine for the
  same incident (late band, absent day, rule breach, keyed by tier) and its
  status (`admin_policy_correctives`, one query per 500 people).

## 4 Nov 2026 — Maths Lab: all 170 topics, "Why it works", Explore it, the framework

- **Content complete.** Stages 8–17 (MC-071..170) are in
  `api/_lib/domain/mathslab-gen-upper.php`, at least four forms per topic,
  typed and choice, across procedure / application / reasoning. Prerequisite
  edges for 71–170 are in `MLB_EDGES`. A prerequisite in a LATER stage
  (055→091/094, 058→061, the plan's "sequencing problems") never blocks:
  `mlb_need_ahead()`. Without it, Stage 6 would be locked behind Stage 10 and
  the climb could never finish Stage 6.
- **Proofs** (`domain/mathslab-why.php`). The owner said "only necessary": the
  foundations (Stages 1–4) plus every topic resting on a provable result,
  91 in all. Each is [idea, claim, [[statement, reason]…]]. Statements and
  reasons are distinct within a proof, because `mlb_why_justify` uses the
  other reasons as its wrong options. `mlb_why_forms()` appends two forms per
  proof AFTER a topic's own forms, so stored sessions keep their form
  numbers.
- **New item kind `order`**: options shuffled (never shown already in
  order); the answer is the option indexes in order; marked by equality.
  `MlbOrder` uses move buttons, per the no-drag rule.
- **Bands**: `MLB_BANDS` in `mathslab-map.php` is the one table (map, Lite,
  Progress).
- **Root gaps**: `mlb_root_gaps()` traces a struggling topic (≥4 attempts,
  p < 0.6) down unmet, non-ahead prerequisites to the earliest ones whose own
  needs are met.
- **Diagrams**: `MlbDiagram` now draws `figure` (points, labelled sides,
  angle arcs, right-angle marks, circles; auto-fit) and `plot`.
  **Explore it**: `MLB_EXPLORE` maps topic → explorer, 15 explorers, all
  sliders (`MlbSlider`, a native range input).
- Tests: run.php pins the proofs (distinct, both forms mark right, order
  never pre-solved), the bands, root gaps and the ahead rule; each of these
  was checked to fail when broken. `tests/mathlab-shot.js` now photographs
  four Learn pages, the order exercise and a figure question, and drives a
  slider, the proof walk-through and the order buttons.

## 2026-11-04 (night) — Wi-Fi tested on a real RouterOS; the routers and Afrovanguard fixed

The owner reported the CACENTRE Wi-Fi and Afrovanguard's still not working.

**How it was tested.** RouterOS 7.19.4 (MikroTik CHR) ran under QEMU against a local CACENTRE on MariaDB, over HTTPS with a test CA. The setup was CACENTRE's real one-line install, followed by 1,500+ people, suspensions, withdrawals, password changes, a two-page full list and the filter.

**What only a real router showed (fixed in cacentre-site 6ed0144):**
- **Every scheduled sync failed at its end.** RouterOS logged "user's policy does not allow to edit this script". The state scripts were made during the install with full permissions, and the schedule runs with `read,write,test,ftp`. So a router updated once at install and never again.
- **The apply loop pinned the CPU at 100% for hours on a large list.** It looked each user up by name three times per line. It now reads the router's users once and writes only changes: 1,527 users in under 30s.
- **A dead sync froze the router until a reboot.** The busy flag now clears on error and expires after five skipped runs.
- **Every router must run its one-line install again** to get the fixed script.

**Afrovanguard (afrovanguard-site 01d8724).**
- Its roster went as one base64 token, so anything over about 640 members was a 406 at CACENTRE's host. Measured: 700 members = 140 KB, 1,500 = 302 KB.
- It now sends parts under one sync id, with the same split-on-406 as NGG's `wifi_cac_push`. CACENTRE's Afrovanguard endpoint reads `sync`.

**Deploy all three:**
- NGG (e32e3e66 and later)
- cacentre-site (6ed0144, the cPanel package from its release branch)
- afrovanguard-site (01d8724)

Then run each router's one-line install again.

## 4 Nov 2026 — Maths Lab: clean, structured redesign

Audit found: map stars stretched to ~60 px with topic names only in
tooltips; loose nav pills; single-column Home/Learn with Practise below the
fold; three button systems; flat cards with mixed paddings. Changed:

- One token set on `.mlb` (colour, radius, shadow) and the Lab owns its
  buttons (`.mlb .stt-btn`, `.mlb-go`), so it looks the same wherever it is
  mounted. Cards are a hairline, with no resting shadow; depth only on an
  open stage and the question card.
- Segmented tab bar (`.mlb-nav`); Map stays lit while on a topic page.
- Home: hero stat tiles, then content + side column (`.mlb-cols`) from
  860 px of the LAB's width (container query, not media).
- Map: band sections → stage cards (`.mlb-stage`, accordion,
  `aria-expanded`), each with progress, and a list of its ten topics BY
  NAME (`.mlb-topic`). The stage in progress opens itself. The constellation
  in the card is decorative (`MlbStars decorative`): the list is the one
  keyboard route.
- Learn: content column + a sticky side card (state, readiness, Practise,
  Mastery check, Builds on); on narrow screens the side card comes first, so
  Practise is above the fold.
- Player is a centred 760 px focus column.
- Framework card is compact: one sentence and a five-step band strip.

## 4 Nov 2026 (later) — Maths Lab in Duolingo's visual language (owner: "Duolingo is your no. 1 model … and Brilliant")

The "clean structured" pass above was rejected ("still terrible"). It is
replaced by a Duolingo-modelled UI; the structural parts (tokens, container
queries, one button system) stay.

- **Shell** (`.mlb-shell`): a sidebar of big uppercase tabs once the Lab is
  ≥ 980 px; a four-tab strip (icon over label) on a phone. `.mlb-main` is its
  own container, so Home/Learn/Map columns measure the column beside the
  sidebar, not the window.
- **Map = the path.** Per stage, a unit banner in its band colour, then ten
  round 3D lesson nodes on a zig-zag (`MLB_PATH_X`, a per-element `--dx`):
  done (check), the ONE current lesson (star, ring, bobbing START bubble),
  open, locked (grey). The stage boss is a trophy node at the end. A node
  opens a card (`.mlb-pop`) with the topic name and Start/Review; Escape or a
  click outside closes it and focus returns. A section divider per band.
  On wide screens a right rail holds the stats, *Up next* and a key.
- **Band colours** (`.is-foundations|junior|waec|further|beyond` → `--b`,
  `--b-edge`, `--b-ink`, `--b-soft`): the bright fill carries icons only;
  every surface with words uses `--b-ink` (≥ 4.5:1 with white). The primary
  button is `#2f7d00` for the same reason: Duolingo's `#58cc02` with white
  text is 2.1:1.
- **Chunky controls**: a 2 px hairline and a solid bottom edge that `:active`
  pushes down (buttons, options, keys, nodes).
- **Player**: a thick progress bar, large stem, tile options, a full-width
  CHECK, and green/red result sheets.
- **Learn**: the topic header is the stage's colour banner; the
  Brilliant-style content column has the interactive first.
- `tests/mathlab-shot.js` now waits for `.mlb-path`, loads Phosphor, and
  photographs the player (desktop and phone): 15 screens.

## 4 Nov 2026 (latest) — Maths Lab: Duolingo's structure, the Control Room's design

Owner: "Use my design style, not Duo's. The Control Room style." The
Duolingo-coloured block above (band colours, 3D bottom edges, uppercase
labels) is gone. What stays is the STRUCTURE: the path of lesson nodes with
one current lesson, the stage boss at the end, the node card, *Up next*, the
stats, the focused player, and the interactive-first Learn page.

- `.mlb` is added to the Control Room token declaration in `styles-app.css`
  (`.cr-app, .signin-scrim, …, .mlb`). The Lab's block in `styles.css`
  styles everything with `var(--cr-*)`: Geist, ink on white, 1 px hairlines,
  `--cr-r`/`--cr-r-lg` radii, `.cr-seg`-style tabs on a phone, `.cr-nav-item`
  rows in the sidebar, `.cr-kpis`-style 1 px-gapped stat tiles, dot pills,
  `.cr-btn` shapes (ink primary). Gold (`--cr-gold`) marks only what is live:
  the current lesson node, the Home continue button, the streak flame.
- No uppercase labels any more. The Duolingo labels' `text-transform` had
  broken two ui-smoke assertions that read `innerText`.
- Path nodes: done = ink with a check; now = gold with a soft ring and an ink
  *Start* tag; open = white hairline; locked = grey `--cr-s2`. The band classes
  stay on the markup but carry no colour.
- **Topic page = a lesson in steps** (owner: "the steps is not well structured.
  Duolingo is your model"): Explore → Why it works → Worked example →
  Practise, ONE screen at a time, with a step bar (`.mlb-stepbar`, each step a
  button), a sticky Back / Continue bar (`.mlb-lesson-foot`) and *Already know
  it? Skip to practice*. Steps a topic has no content for are left out.
  Practise (readiness, Practise, Mastery check, Builds on; or Lite's inline
  questions) is always last. Focus moves to the step's heading on every step.
- The phone Home button is back to ≥ 44 px (`.mlb-go` min-height 44); ui-smoke
  had measured 40.
- **No cutting corners, no guessing through** (owner: "Everyone must study.
  No cutting corners. No failing and failing and failing until you get the
  answer"). Migration **227**: `mlab_state.studiedAt` and `mlab_state.owed`.
  - **No skip.** *Skip to practice* and *Show the whole argument* are gone.
    A step is done only when worked: `MlbExplore` reports the first slider or
    button use, deferred with `setTimeout`, because updating the lesson
    inside the range's own input event snapped the slider back; `MlbWhy`
    reports when every line is shown; the example when every line is shown.
    Continue waits for that, and steps ahead are disabled.
  - **`mathslab.studied`** (`mlb_mark_studied`) is called on reaching
    Practise. `mlb_start` refuses practice and check with `not_studied` for a
    topic that is not studied and not already known.
  - **The check needs `state = ready`** on the server too (`not_ready`). The
    client used to be the only gate.
  - **A failed check** sets `owed = MLB_RETAKE_OWED` (5). Only an unaided
    right practice answer pays it down, the state cannot reach `ready` while
    anything is owed, and a retake is `practice_owed`.
  - **A lost boss** puts each topic it caught back to `practising` with
    `owed = 5`, so the boss is locked until they are mastered again.
  - `run.php` pins every rule. The owed rule was checked by switching it off
    (the suite then fails), and the test uses `mlb_set_state`, not an
    SQLite-only upsert, because the suite also runs on MySQL.
- **Map: only the focus stage is open** (owner). `MlbMap` derives
  `focusStage` (the stage holding the next lesson, else the first
  unfinished, else Stage 1) and renders a path for one stage only. Every
  other stage is a header button (`.mlb-unit-tog`, `aria-expanded`) with its
  progress. Opening one closes the rest; closing the open one leaves none
  open (`-1`). mathlab-shot asserts there is exactly one path and that it is
  the focus stage's, both on load and after opening another stage.
- **The Lab's ink is the site's navy** (owner: "Change the blacks to the
  site's navy"). One line after the Control Room token block in
  `styles-app.css`, `.mlb { --cr-ink: var(--navy-900); --cr-nav-on: #e7eaf3; }`,
  re-points the token every Lab ink surface reads. The Control Room keeps its
  black.

## 5 Nov 2026 — Maths Lab: the real thing, end to end (owner: "the site is not working … improve the UX")

Walked the PRODUCTION build against a real backend as a new member would.
`tests/mathlab-e2e.test.js` now does the same on every run, at desktop and
phone widths; it is in `test:all` and `npm run test:mathlab-e2e`. What it
found, all fixed:

- **The question player had no styling.** `MathsLab` returned `<MlbPlayer>`
  outside `<div class="mlb">`, so none of the Lab's tokens resolved: no
  borders on the options, and bare "Check", "Leave" and confidence buttons.
  The fixture shots never caught it, because they render components with
  stubs. The player is wrapped now, and the e2e asserts computed borders and
  a filled button inside `.mlb`.
- **The placement gate asked proof questions** ("why is line 1 true?") of a
  brand-new child. `mlb_pick_items(…, $skillOnly)` / `mlb_skill_form_count()`
  leave the two Why-it-works forms out of the climb, reviews and the boss.
  Practice and the mastery check keep them. Pinned in `run.php`.
- **Three levels of navigation and three "Maths Lab" headings.** Study tools'
  tabs, then the Lab's sidebar, a brand line and a hero eyebrow. The Lab's
  sections are now one segmented control at every width. Inside the Lab, the
  Study panel heading is kept for screen readers only (`.stt-panel:has(.mlb)
  > .stt-panel-h`), and the hero eyebrow is gone.
- **Results** show the score once (a ring), say what to do next, and list the
  missed questions first with their solutions open. Practice and review offer
  *Practise again*, which re-keys the player for a fresh session.
- **Back from practice** opens the topic on its Practise step when it has
  been studied, not step 1 again.
- **Keyboard**: 1–9 pick an answer and Enter checks it or moves on; the
  options are numbered to match. This is ignored while typing in a field,
  and Enter on a button is left to the button.
- **Phone**: the stat tiles and the map's stats are one row each; the
  player's title row keeps *Leave* on it; the number keypad lost the "/"
  key, which a whole-number answer never needs.
- **Home restructured** (owner: "Improve the structure"). The order is now:
  1. where you are: "You are in Stage N · title (band)", from `focus` on
     `mathslab.home`;
  2. **Up next**, one card with one button;
  3. **Your progress**: the three stats, the level bar, the current stage's
     topics known, *Open the map*;
  4. the rest: foundations to fix, courses, *How the climb works* as a
     fold-away, and badges (earned first, four shown, link to all).

  `mlb_next()` now also returns `kind`, `title` and `what` (one sentence a
  child understands), so the card shows the step and its title separately.
  The button is a short verb (*Start the gate*, *Continue*, *Take the
  check*), and ui-smoke reads the card plus the button rather than the old
  long button label.
- **Courses lock, and enrolling shows it worked** (owner: "the courses
  should display a proper lock instead of me clicking enrol and nothing
  happens").
  - `mlb_reached_stage()` is where the climb placed the learner, or one past
    the last stage whose every topic is known.
  - A course opens when its first stage is reached. Otherwise
    `mlb_course_lock()` gives `locked` and a `lockReason` naming the stage to
    finish and how far along it is ("Opens at Stage 5. Know all of Stage 4 …
    first — 3 of 10 so far"). `mlb_enrol` refuses `course_locked` and passes
    that reason through to the page.
  - Enrolling shows *Enrolling…*, then *Enrolled* and a line saying so.
    *Continue* goes to the course's next open topic (the course's `next`).
- **Map sections behave sensibly** (owner: "closing the map sections is not
  very smart").
  - Opening a stage closes the one that was open and scrolls the new one
    into view.
  - Closing a stage you went to look at brings your own (focus) stage back,
    in view; the map is never left with nothing open by accident. Closing
    your own stage folds it.
  - A stage you are visiting shows *Back to my stage (Stage N)*.
  - The e2e covers both, and `run.php` pins the lock and the refusal.

## 5 Nov 2026 — Registration audit: the NGG application, review and acceptance

Owner asked for an audit of the NGG registration process and every change made
to it (8fd21f5f, dd69a3be, c30083be, 9b59e618, 910fc0db, 9041e19c, 0c1d92e3,
a77261e9, 21745ef3, a0ddb750, 85fd94e1, 6b80dadd, e54aa58b and the merges).
Read end to end: `/join` (page-apply.jsx) → `api/public/apply.php` →
`public_apply` / `club_apply_details` / `club_apply_consents` / edit codes →
the Applications inbox (cr-tab-inbox.jsx) → `admin_application_convert` →
member, consents, card number, invoice, registration checklist.

**Baseline before any change**: PHP 6849/0. `club-apply.test.js` 11 passed,
2 failed (the run stopped at step 2). `membership-pay.test.js` 21 passed, 1
failed (stopped at the second admin). `registration-checklist.test.js` 15/0.
All three are in `test:all`, so `test:all` was red.

Faults found and fixed (each held by a check that fails on the old code):

- **"Use it" on the email suggestion never worked.** The suggestion hid while
  anything in the field had focus, and its own button is in the field, so
  pressing it unmounted it before the click landed. A family typing
  `@gmail` could not take the fix and could not continue. It now hides only
  while the input itself is being typed in.
- **The school picker chose the wrong school.** Typing "Egbeda Sen" and
  pressing Enter took *Anglican Senior Grammar School, Egbeda*, because the
  local list kept alphabetical order. Names that begin with what was typed
  now come first (as the server already ranked them), and the local schools
  near our centres stay offered beside the open-data answer.
- **Convert could make two members.** Two presses at once (or two tabs) both
  passed the "already a member?" check and each made a member, a printed ID
  and an invoice. The re-press check also depended on the date of birth and
  name still matching. Migration 228 adds `applications.convertedMemberId`.
  Convert claims the row by writing it, a new unique value, so the guarded
  update changes the row on MySQL as on SQLite. A re-press answers with that
  member. A failed insert releases the claim.
- **A converted child could be declined.** Setting a converted application
  to *rejected* or *waitlist* emailed and texted the family a refusal while
  the member stayed active. It is refused now (`already_member`).
- **Duplicate detection ignored the programme.** A Club application within
  24h of a Summer one for the same child came back with the Summer
  reference and was never filed. Summer applications were deduplicated on
  email alone, so two siblings from one parent's email in a day became one.
  Both now match email + date of birth + programme.
- **Application edits took any text** for `program` (which decides whether
  conversion makes an NGG member or a Summer account) and `dob` (the age
  check at conversion). Both are validated (`bad_program`, `bad_dob`).
- **Server refusals the form did not explain** (`course_not_in_division`,
  `bad_division`, `division_required`, `details_required`, `bad_dob`,
  `bad_sex`, `bad_email`, `phone_required`) now say what to fix and take the
  family to that step.

Tests that had rotted (product right, test stale):

- `club-apply`: sending the same child again now asks for the emailed code
  (21745ef3, deliberate). The test sets a known code, as the inbox would,
  proves a wrong one is refused, then updates.
- `membership-pay`: the second admin's page jumped before the jump hook was
  installed (now waits for it, as the first admin's already did). The
  receipt number is `NGG-RCP-` since the documents system, and the receipt
  says *Paid in full*.

Known and left as is (by design or out of scope):

- The edit code allows 5 tries per code. After that, sending again mints a
  new code and emails it, so the inbox owner hears about every round. The
  rate limits on `apply` bound it.
- `public.apply.check` answers seen or open for an email + date of birth.
  Rate limited, says nothing else. Accepted in 21745ef3.
- Deleting an application leaves its `APP:<ref>` consent rows. Kept: they
  are the record that agreement was given.

After: PHP 6856/0, club-apply 50/0, membership-pay 36/0,
registration-checklist 15/0.
## Wi-Fi routers at scale: one sync at a time, self-update (2026-11-05, CACENTRE acd6dc5)

Found by running CACENTRE's router setup on RouterOS 7.19.4 with 6,000 people.
All of it is on CACENTRE's side; NGG's push (sync parts, split-on-406) is
unchanged. Detail in CACENTRE `cac/docs/wifi.md` → "Scale and self-update".

- **RouterOS does not keep a scheduled script's global variables between
  runs.** The "sync still running" flag never held, so a new sync started every
  two minutes beside the last (fourteen at once, CPU 100%, none finished). The
  guard now reads the router's own job list; what the sync remembers lives in a
  small `cac-wifi-memo` script.
- **Routers update themselves.** Every list carries the script's fingerprint
  (`sv=`); a router on an older script re-installs the setup by itself after a
  good sync, once per version. The new script is added beside the old before
  the old is removed. Routers on a setup older than this need the one line run
  **once more**, and never again for a script change.
- **Fast when little changes:** a no-change sync at 6,000 went from ~2.8 min to
  3 s; two changes applied in 9 s. Passwords are readable to the sync
  (`sensitive`), so unchanged users and profiles are no longer rewritten.
- A router asking from a version not on record now gets every page of the full
  list (page 2 used to answer `start_again` for ever).

## 5 Nov 2026 — The desk's 10-minute let-in, rebuilt on Google Workspace's model

Owner: "The 10 minutes sign in allowance does not work… It's as though the
site has no idea it happened." Then: "Do it how Google does it securely", and
"The Google Workspace admins had the time window".

What Google gives its admins for a user who cannot pass their second step
(Admin console > Directory > Users > Security):

- **Login challenge > Turn off for 10 minutes.** Per user, fixed length,
  admin only. Google warns the account is weaker during the window.
- **2-Step Verification > Get backup verification codes.** The admin sends
  one code to the user, who signs in with their password and that code.

Faults found in ours (domain/mfa.php, auth/mfa.jsx, cr-tab-security.jsx):

1. **The waiting screen never noticed.** The desk's confirm promised "if they
   are on the question screen now, it opens", but nothing re-checked. The
   "I've been let in" button existed only for question and PIN steps, so a
   volunteer with a new phone (an app step) had no way through at all.
2. **Getting in did not let them fix anything.** Changing the step demanded
   the current one, which is the thing they had lost. The help centre's
   "let you in for ten minutes so you can set it up again" could not happen.
3. **The window let every sign-in through** for ten minutes, not the person
   at the desk. A status read cleared any waiting session too.
4. **Nobody was told.** The owner got no alert, unlike Google's.

Now:

- **Let in for 10 minutes** (`action: bypass`) lets ONE sign-in through. The
  window is claimed in one guarded write, so a second sign-in in the same
  minutes still owes the step. The step screen asks every 4 seconds while it
  is visible (`mfa.window`) and opens by itself. The length is fixed.
- **Give a one-time code** (`action: code`, new): 8 characters with no
  0/O/1/I, shown once to the member of staff, stored as a hash in
  `mfa.code1`, 10 minutes, single use, typed in the backup-code box.
- Either way in opens a **replace window**: a new step is set without the
  old one, then both grants close (`mfa_grants_close`). Audited as
  `mfa.change` with `letIn: true`.
- The owner is emailed and pushed when either is issued (`mfa_tell_letin`).
- Neither is offered to somebody with no second step (`not_enrolled`).
- State keys only (`member_state`), so no migration.

Tests: `run.php` grew to 6868 checks (from 6860 before this change), with 0
failures; the old window checks were rewritten to the one-sign-in rule.
`tests/mfa.test.js` no longer presses a button: it waits for the screen to
open by itself, checks the new-step dialog asks for nothing old, and checks
a second sign-in still owes the step and the desk code passes once. Result:
42 passed, 0 failed.

## 5 Nov 2026 — The let-in needs no password; Sign-in security rebuilt in the Control Room design

Owner: "They do not have to first enter a password", and "fix the UI of the
security tab. It is not in the updated control room design".

**No password.** The desk's *Let in for 10 minutes* now hands the member of
staff a one-time code and the ID to sign in with (`signInAs`: the printed ID
for a member, else the record id). On the sign-in screen, *I have a code from
staff* takes the ID and the code (`api/auth/desk.php` → `auth.desk` →
`auth_desk()` in domain/mfa.php) and signs them in with no password and
nothing owed.
- The code is the proof. A window with no code would let in anybody who
  typed their ID in those minutes.
- The code is made in person, for one account, lives 10 minutes, is stored
  hashed and is spent once (`mfa_grant_claim`, one guarded write).
- A wrong code counts against the account like a wrong second step (five,
  then 15 minutes), and an unknown ID gets the same answer as a wrong code.
- Staff accounts are refused: theirs is the console's authenticator.
- Using the code also spends the waiting-screen window: one let-in, one way
  in. It opens the replace window, so the next screen asks for a new second
  step without the old one.
- The let-in is offered to people with no second step too, since it is now a
  way in rather than a way past a step.
- The separate *Give a one-time code* action from earlier today is folded
  into this one. `action: code` still works on the server and does the same.

**The tab.** `cr-tab-security.jsx` was a v1 panel mounted with `crPanel`. It
is now Control Room v2 data (CONTRACT.md):
- KPIs per kind of person, and a note on the let-in;
- one server-paged table, with *Who* and *Second step* as facets and the
  search on the server;
- a drawer per person: *Let in for 10 minutes* (primary), *Reset*, *Require
  it* / *Back to the policy*, *Email a reminder*;
- the code shown once in its own drawer, with what to tell them;
- the bulk bar (reset, require, back to the policy, remind; capped at 200,
  per-row verdicts in the toast);
- the policy as a form block: per kind, the step and the ways they may
  choose as chips, held until *Save changes*.

The old `.mfa-desk*` rules are deleted. The row actions read the live ctx
through `crSecCtx`, as the members tab does: the table's rows are built in
`load`, whose ctx has no `setData`. That was a real fault, caught by the
browser test.

Tests: `run.php` 6873 passed, 0 failed (desk sign-in: wrong code, unknown ID,
right code, single use, window spent). `tests/mfa.test.js` 51 passed, 0
failed, covering:
- signing in through the real sign-in screen with an ID and code (a wrong one
  refused in words), then the new-step dialog;
- the desk drawn in v2 classes, with facets, drawer and policy save;
- the code shown from the drawer, then used to sign in.
## Wi-Fi: a centre is found by its place, not only its code (2026-11-05, CACENTRE 302fa31)

The Wi-Fi panel said "CACENTRE has no site for EGB (147), AYO (7)": NGG sent
its centre code, and CACENTRE's sites have their own codes (`egbeda`). Both
already share one list of places (CACENTRE's locations, which NGG's centres
follow), so each roster row now also names its place — `homeLocation` (the
linked `cacLocationId`) or `homeName` (`wifi_cac_places` / `wifi_cac_place`).
CACENTRE matches the code, then the location, then the name, and makes a
location's Wi-Fi site itself the first time. Only a place that is not one of
CACENTRE's locations is still "could not place", and the panel now says to add
the location there, not to type a code.

## 5 Nov 2026 — Maths Lab courses: understandable at a glance, and Duolingo's praise

Owner: "Improve the understandability of courses. Make it more effective.
You know the psychological effect Duolingo has? The praises and so on."

**Understandable.** Each course card now shows the path inside it
(`stageRows` from `mlb_course_view`). Every stage is listed by name, marked
done (all ten known and the boss beaten), on now, or ahead, with "N of 10
topics". An enrolled course says how close the next certificate is.
Enrolling says "You're in!" and names the first topic.

**Praise, on Duolingo's pattern but aimed at the work.**
- The headline varies (`MLB_PRAISE`, eight phrases picked by question
  index, so never the same twice running).
- A run of right answers shows a flame counter in the player bar and is
  called out at 3, 5 and 8.
- A right answer after a miss is greeted ("Back on track").
- A right answer with a hint says "next time, try it before the hint". A
  right guess says to remember why. A quick, sure answer says so.
- A wrong answer gets a lift (`MLB_NUDGE`) and the working, in gold, not red.
- The praise names effort and method, never ability, so children keep
  attempting the hard ones. Practice only: gates, checks and bosses are
  unchanged and still give nothing until the end.

**The end screen**:
- a headline by score (*Perfect!* … *You finished it. Keep going!*);
- tiles for XP, accuracy with a word, and the best run (shown from 2 in a
  row; the time on task otherwise);
- the stars lit, and a pointer to the missed questions below;
- confetti at 85% or more, skipped under `prefers-reduced-motion`.

All of it uses the Control Room tokens. No sound, no new colours.

Tests: `mathlab-e2e` 38 passed, 0 failed, 9 more checks than before:
- every course card lists its stages by name with progress;
- an enrolled course states the distance to the next certificate;
- each answer's headline is more than a bare verdict;
- the result has a headline and tiles with a word.

Also passing: PHP suite 6875/0, `mathlab-shot` 16 clean, contrast 21/0.

## 5 Nov 2026 — The let-in, from the user's side: four faults, and Google's email-alone window

Owner: "The security features are STILL not working. On the side of the User
it does not work … We cannot even get past the first!" Then: "For Google, the
allow for 10 mins works immediately after the email or ID … is inputed."

Reproduced from the user's side on the **production build**, with no
session, a shared family email, a printed card ID, a guardian and an
instructor. Faults found, in order of damage:

1. **The production build crashed ("Hold on.") for anyone with a second
   step.**
   - `MfaDialog` read `letIn` (added earlier today) above the line that
     declared it.
   - In development, in-browser Babel compiles `const` to `var`, so it was
     `undefined` and harmless. esbuild keeps `const`, so production threw a
     TDZ ReferenceError on every render of the dialog.
   - That is every step screen and every setup screen, for every member,
     instructor and guardian with a second step. The dev-mode `mfa.test.js`
     could not see it.
   - Fixed by declaring it first. The new production suite fails on it.
2. **A shared email resolved to nobody.**
   - `auth_resolve_member_id` turns an address shared by siblings into an
     `@shared:` key, so the desk code was refused as `invalid` for the
     commonest case.
   - Now `mfa_desk_candidates()` lists every account the identifier could be,
     and the grant, bound to one of them, picks it.
3. **The way out was missing where people get stuck.** *I have a code from
   staff* was on the first screen only. It is now also on the password and
   emailed-code screens.
4. **Guardians had no door.** Their code could not be typed anywhere. The
   family app now has *I have a code from staff* (`api/family/desk.php`). The
   desk drawer names the door (`door: family`).

**Google's window.** Inside the desk's 10 minutes, the email or ID alone
signs the person in, with no password, code or second step
(`auth_window_signin`, op `auth.window`):
- it runs at the first step: `auth/gateway.php`, and `family/request.php` for
  guardians;
- it lets in one sign-in, claimed in one guarded write, and spends the code
  made with it;
- if two accounts on one shared email are both open, it is refused as
  ambiguous;
- staff accounts and the suspended are refused;
- it is audited `login.success` with `via: desk_window`;
- the window is now opened for everybody let in, not only people with a
  second step: it is a way past the first step.

The weakness is the one Google accepts: anyone who types that email or ID
inside those minutes gets in. The guards are that it is one sign-in, ten
minutes, made by a person for one account at a time, and that the owner is
emailed. The desk copy says so.

New suite **`tests/desk-signin.test.js`**: production build, real backend,
no session, in `test:all` and `npm run test:desk`. 19 passed, 0 failed:
- the email alone signs in, then the setup dialog with no crash;
- the next sign-in on that email gets the password door;
- the code is spent with the window;
- after the window: stuck on the password screen, the link is there, a wrong
  code is refused in words, and the shared email plus the code works;
- a phone with the printed ID, spaces and all;
- an instructor's email alone;
- a guardian with the code, and a guardian's email alone.

PHP suite 6887 passed, 0 failed. `mfa.test.js` 51 passed, 0 failed.

## 5 Nov 2026 — A stage complete is celebrated, Duolingo style

Owner: "We need a celebration when each stage is complete. Duolingo style!"

A stage is complete when its certificate is issued: all ten topics known and
the boss beaten. The session that does it (`mlb_issue_certificates` returns
the new certificate in `finish`) now opens `MlbStageWin` over the result. It
shows:
- a medal with turning rays and confetti;
- "Stage N complete" and "You conquered <stage>!";
- a line that praises the persistence, not the person;
- tiles for topics known, boss beaten and the session's XP;
- the certificate card;
- one big button onward to the next stage, named (`next`, added to the stage
  certificate in `mlb_issue_certificates`).

A course completed in the same session follows with a trophy. It is a real
dialog (`aria-modal`, focus held and returned, Escape closes), in the
Control Room tokens, with motion only when the reader has not asked for less.

`mathlab-shot.js` renders it at desktop and phone width and checks the
dialog, the stage name, the certificate, the onward button, the focus, and
that Escape closes it onto the result: 18 screens clean. Maths Lab e2e 36
passed, 0 failed. PHP suite 6887 passed, 0 failed. Contrast 21 passed, 0
failed.

## 5 Nov 2026 — Certificates are findable after a stage

Owner: "most of the times, the users find it hard to find the certificate
after completing the stage."

Before, a certificate appeared in four places, none of them a place called
"certificates": a line in the session result, a badge on the map's stage
header, chips on a course card, and a list at the foot of Progress. Once the
celebration was closed, a child had nowhere obvious to go.

Now:
- **A Certificates tab** in the Lab (`MlbCerts`, route
  `/study/lab/certificates`). Each certificate is a card with *Open* and
  *Print*, newest first; "Next to earn" sits underneath.
  - `?print=1` on the document page opens the print dialog once it fits.
  - The certificates come from `mlb_cert_list()`, one list, now used by Home
    and Progress too, carrying `scope`.
- **A "new" marker.** A certificate not yet opened on this device puts a
  count on the tab and a banner first on the Lab's Home. Opening it, from
  the banner, the card or the celebration, clears both. It is kept in
  `localStorage` (`ngg.mlb.certsSeen`): a convenience, not a record.
- **The celebration** gains *All my certificates*.
- **On a phone** the five tabs show as icons, each keeping its name for
  screen readers.

Also fixed: the confetti's `--k` custom property had no fallback, which
`build.test.js` refuses. That failure arrived with the celebration commit,
and the build test had not been re-run after it.

Tests:
- `mathlab-shot.js`, 21 screens clean: the Home banner, the tab with its
  dot, the card with *Print*, and the dot cleared once opened.
- `run.php` 6889 passed, 0 failed: Home's certificate list (newest first,
  scoped) and the print hook.
- Maths Lab e2e 37 passed, 0 failed.
- `build.test` 31 passed, 0 failed.
- Contrast 21 passed, 0 failed.


## 5 Nov 2026 — Maths Lab: Stages 5–7 deepened; the Gods of Maths summit (Stages 18–20)

**Owner:** "Broaden the maths labs stage from stage 5. Go deeper and make them become Gods of Maths". Later in the same turn: "Make things tough, but easy".

### Stages 5–7 are deeper

**Problem.** Stages 5–7 (MC-041 … MC-070) had 1.7–2.4 kinds of question per topic. Seventeen topics had a single kind. Stages 8–17 have 5–6.

**Change.** `mathslab-gen-deep.php` adds 2–4 forms to every one of the thirty topics. Every topic now has at least four forms of its own and at least one with `dim` `'challenge'`. It also adds six proofs (`mlb_why_deep`): MC-041, 052, 055, 059, 066 and 068.

### Form numbers stay stable

A session stores `(topic, form, seed)`, so no form may change its number:

- the deeper forms are appended **after** the proof pair;
- the proof pair is therefore no longer always the last two forms;
- `mlb_why_at($comp)` says where the pair is;
- `mlb_skill_forms($comp)` (replacing `mlb_skill_form_count`) lists the non-proof forms that placement, review and the boss draw from.

The tests that found the proof pair at `count - 2` now use `mlb_why_at`.

### The Gods of Maths summit

`mathslab-gen-gods.php` adds Stages 18–20 at olympiad level:

- **18**: number theory.
- **19**: combinatorics.
- **20**: algebra, inequalities and geometry.

There are four forms per topic, and nineteen proofs (`mlb_why_gods`).

**Answers are derived by brute force where possible.** Divisors are listed, routes are walked and arrangements are enumerated, so a formula slip cannot reach a child as a "right" answer.

**Map.** `mathslab-map.php` adds:

- the stage table and strands;
- the sixth band, `gods`, with `summit: true`, which the map passes through so the client draws a crown;
- prerequisite edges into the school topics each olympiad topic grows from;
- the `gods-of-maths` course.

**Totals.** Home's total is now `count(mlb_competencies())`, not a typed 170.

### Client

- The question player shows a **Challenge** chip on challenge items.
- The framework card names the summit.

### Tests

- `run.php`: 6892 passed, 0 failed. Updated: 200 topics, Stages 1–20 covered by the bands, and proof forms found via `mlb_why_at`. New checks:
  - four or more forms and a challenge in every Stage 5–7 and Gods topic;
  - the proof pair kept its numbers;
  - placement and the boss can draw the new forms;
  - the band, course, edges and availability are correct.
- Generator sweep: 60 seeds over every Stage 5–7 and 18–20 form (31,380 items). Every key marks itself right, no option repeats, and no typed form gives everyone the same answer.
- Maths Lab e2e: 36 passed, 0 failed. The "number key picks an answer" check only runs when the first random question is multiple choice.
- `build.test`: 31 passed, 0 failed.
- Contrast: 21 passed, 0 failed.


## 5 Nov 2026 — Maths Lab map UI/UX

**Owner:** "Improve the map UI/UX".

**Faults seen in screenshots:**

- the path's circles carried no names;
- band headings were 12–13px grey text;
- 20 collapsed rows looked identical;
- locked stages did not say why.

**Changes in `MlbMap`:**

- `.mlb-node-lab` titles beside each node, placed on the side away from the zig-zag offset;
- `.mlb-bandh` band banners with known/total and a meter, from `bandTally` computed over the stages;
- `.mlb-bandnav` jump bar, which opens a band's first unfinished stage through the existing `openStage` and `scrollTo` mechanism;
- `.mlb-dots` per-topic dots on closed stages;
- `.mlb-unit-lock`, the "Opens when…" note.

**Test fixture fix.** `tests/mathlab-shot.js` built its fixture map from a hand-listed set of domain files and so showed Stages 18–20 as "being prepared". It now loads `mathslab-gen-deep.php` and `mathslab-gen-gods.php`.

**New checks:**

- every open node has a label;
- six band banners, with the summit crowned;
- dots on the closed stages;
- the summit jump opens Stage 18.

**Results:**

- Shots: 22 rendered clean.
- Maths Lab e2e: 37 passed, 0 failed.
- Contrast: 21 passed, 0 failed.
- `build.test`: 31 passed, 0 failed.


## 5 Nov 2026 — Maths Lab: the Daily Olympiad Problem

**Owner:** "Add more features to the maths lab"; "Make things tough, but easy".

### How it works

- `mlb_daily_pick($day)` chooses one (topic, form, seed) from the Stage 18–20 skill forms, by hashing the date alone. Every member therefore gets the same problem, and it cannot be chosen from the request.
- Answers are stored as an ordinary `mlab_sessions` row (`mode` 'daily', `ref` = the day, a sessionId derived from member and day), so no migration was needed. Progress's "mistakes that come back" reads it like any other session.

### Ops

- `mathslab.daily` (GET `?view=daily`) returns the problem. The answer and steps are included only once the problem is over.
- `mathslab.dailyAnswer` (POST action `daily`) takes one try: three tries in all, hint use recorded, and 50 or 25 XP for a solve. A solve also counts towards the Lab's day streak.
- `mlb_daily_streak` gives the run of days solved and the total.
- **Guard:** `mlb_session()` now excludes `mode = 'daily'`, so the daily row cannot be answered or finished through `mathslab.answer` or `mathslab.finish`, which would bypass its tries and reward. A test pins this.

### Client

- The `MlbDaily` view at `/study/lab/daily`.
- A gold crown card on Home.

### Generator fixes

Two olympiad forms could produce "no solutions" as the answer: MC-176 form 0 and MC-180 form 1. They now redraw until there is at least one solution. "None" is a trick answer, not an olympiad one.

### Tests

- `run.php`: 6893 passed, 0 failed. New: the same problem for two members; answer hidden until over; three tries, then `already_done`; 50 XP and a run of 1 on a first-try solve; Home's daily summary; the session ops refuse the daily row.
- Maths Lab e2e: 42 passed, 0 failed. New: the Home card, the free hint, and the solution and "tomorrow" message at the end, on desktop and phone.
- a11y: 19 passed, 0 failed.
- `build.test`: 31 passed, 0 failed.


## 5 Nov 2026 — Maths Lab: JAMB-style and SAT-style questions, and timed practice papers

**Owner:** sent JAMB Mathematics past papers (1983–2004) and a digital SAT practice test (#4) with scoring guides for #4 and #11, then: "Proceed. Adapt them all over".

**No copying.** Past papers are copyrighted, so no question is copied. `mathslab-gen-exam.php` holds original generators modelled on the KINDS of question those papers repeat.

**JAMB-style forms.** There are 40, each five-option (A–E) with every wrong option naming its slip. They cover:

- number bases;
- significant figures;
- simple interest;
- ratio sharing;
- index equations;
- log combinations;
- surds;
- difference of two squares, a² + b² with 2ab, and x + 1/x;
- completing the square;
- the factor theorem;
- quadratic minimum;
- partial fractions;
- f(x − a) substitution;
- inverse functions;
- binary operations;
- AP relations and the sum to infinity;
- linear–quadratic simultaneous equations;
- joint variation;
- polygon angles;
- sector area;
- rhombus diagonals;
- similar solids;
- hemisphere surface area;
- angle of elevation with the observer's height;
- the cosine rule with 60°;
- distance between points;
- pie-chart angles;
- the mean after adding a number;
- median plus mode;
- standard deviation and mean deviation;
- vowel probability;
- three-digit arrangements;
- the gradient of a curve;
- y from dy/dx;
- ∫(k/x + m cos x);
- the rate of change of a circle's area.

**SAT-style forms.** There are 15: four-option choice (A–D) or typed "grid-in". They cover:

- interpreting a linear model;
- percent change twice;
- a word system;
- an exponential model;
- a linear function from values;
- a circle's radius from its general equation;
- complementary trigonometry;
- the sum of a quadratic's roots;
- vertex form;
- a unit rate;
- an inequality word problem;
- an equation from words;
- similar right triangles;
- the original price after a coupon.

**Where they go.** The forms are appended to their topics AFTER the deep forms. `mlb_why_at` now subtracts both added sets. `mlb_public` passes `exam` and `letters`.

**Distinct options.** `mlb_jamb` and `mlb_sat` take more slips than they need and keep the first DISTINCT ones. The measured rate of short JAMB questions is at most 5%, and never fewer than four options. That sweep found and fixed three faults:

- a variation answer duplicated by a wrong option worded differently;
- a² + b² < 2ab, which is impossible for real numbers;
- two broken stems.

**Papers** (`MLB_PAPERS`, `mlb_exam_pool`, `mlb_exam_pick`, `mlb_exam_report`, `mlb_exams`):

| Paper | Questions | Time | Stages | Mix |
|---|---|---|---|---|
| JAMB | 40 | 40 min | 3–16 | all multiple choice, about two thirds exam-style, one topic per question, in syllabus order |
| SAT | 27 | 43 min | 3–12 plus selected topics | about 7 typed |

- **Modes and ops:** `mathslab.start` mode `exam` with `paper` (no map gate); `mathslab.exams` (GET `?view=exams`).
- **Time:** `mlb_answer` refuses an answer after minutes + `MLB_EXAM_GRACE` (`time_up`).
- **Finishing:** `mlb_finish` reports by strand, awards 2 XP per right answer, and changes no map state.
- **Scores:** JAMB is out of 100. SAT is an estimate on the 200–800 scale, labelled as such, because the College Board's conversion tables are per-form and not reproduced.

**Client:**

- the Exams tab (sixth) and `MlbExams`;
- the player's exam mode: a server-anchored countdown with auto hand-in, A–E letters (and A–E keys), "Leave it", "Hand in now", and no confidence chips;
- the result screen's report by area, with "Try another paper";
- a Home card.

**Tests:**

- `run.php`: 6896 passed, 0 failed. New: the exam form counts and option counts; paper composition for both papers; time-up refusal; score and areas; the map unchanged; history and best score; the SAT scaling bounds.
- Maths Lab e2e: 48 passed, 0 failed. New, desktop and phone: the Exams page, the clock and A–E letters, leaving a question, handing in, and the report by area.
- Shots: 22 rendered clean.
- Contrast: 21 passed, 0 failed.
- `build.test`: 31 passed, 0 failed.


## 5 Nov 2026 — Maths Lab: logarithms made findable, typeable and deeper; groundwork for more Labs

**Owner:** "I also realised there's no logarithm. Also, I need you to prepare we'll be adding more labs".

### Logarithms

Logs were there, in two Stage 7 topics, but:

- nothing let a learner find them by name;
- an answer could not contain a log;
- only exact powers were taught.

**Changes:**

- **Map search** (`mlbFindTopics`):
  - every typed word must match the start of a word in a topic title;
  - stage titles are used only when no topic title matches, otherwise "log" pulled in "…Mathematical Logic";
  - a small synonym table (logs/logarithm/ln → log, …).
- **Typing logs:**
  - `mlb_expr_eval` reads `log(` (base 10) and `ln(` before single letters, so they are not read as l·o·g;
  - a log of a non-positive number is unreadable, not a value;
  - the keypad has `log(` and `ln(`; the preview and the answer text render them.
- **New log forms** (`mathslab-gen-more.php`):
  - change of base;
  - standard-form logs (characteristic and mantissa, bar notation);
  - ln and e (three ways);
  - the curve through (1, 0);
  - making x the subject of y = k·bˣ (a typed log answer, any base accepted);
  - exponential equations;
  - log equations;
  - doubling and half-life;
  - combining laws;
  - d/dx ln(ax + b).
- **Log explorer:** `MlbExLog`, for MC-068, MC-069 and MC-155.

**Proof-pair positions.** `mlb_why_at` is now RECORDED while `mlb_forms` builds the lists (`mlb_why_at_map`), instead of being recomputed by subtracting each appended file. A future file of forms cannot move the proof pair, and the exam test that relied on that arithmetic now reads the stored position.

### Groundwork for more Labs

- **Registry:** `api/_lib/domain/labs.php` — `LABS`, the one registry. Maths is `MC`, `/study/lab`, live.
- **Helpers:** `LAB_COMP_RE` (`XX-NNN`), `lab_for_comp`, `lab_comp_ok`, and the `labs.list` op (public `?view=labs`).
- **Ids:** Maths ids come from `MLB_PREFIX`. The client's topic-route pattern accepts any registered prefix.
- **Guide:** `docs/LABS.md` covers:
  - registering a Lab;
  - the content files a Lab brings;
  - the generator rules the suite enforces;
  - the mechanical engine changes to make when the SECOND Lab's content exists. They are deliberately not made in advance: an abstraction with one user is a guess about the second.

### Tests

- `run.php`: 6898 passed, 0 failed. New:
  - **Logs:** read in any base, the wrong base refused, the new forms present, the proof pairs where they were.
  - **The Lab registry:** unique prefixes and paths, every Maths id resolving to the Maths Lab, malformed or unknown ids resolving to nothing, `labs.list`.
- Shots: 23. New: searching "log" finds exactly the three log topics.


## 5 Nov 2026 — Maths Lab path: stage header and Guidebook, mini review, chest, the way back

**Owner:** sent screenshots of Duolingo's path (a sticky unit header with a book icon, the unit Guidebook of "key phrases") and asked: "Improve the map feature. Please research. … Add a mini review feature after a long time of practice."

**Research.** Duolingo's blog and reviews describe the path as lessons interleaved with personalised practice placed by spaced repetition and the learner's own mistakes, a Guidebook per unit, chests along the way, and end-of-unit challenges. Sources:

- [blog.duolingo.com/new-duolingo-home-screen-design](https://blog.duolingo.com/new-duolingo-home-screen-design)
- [blog.duolingo.com/how-to-review-lessons-on-duolingo](https://blog.duolingo.com/how-to-review-lessons-on-duolingo)
- [blog.duolingo.com/spaced-repetition-for-learning](https://blog.duolingo.com/spaced-repetition-for-learning)

### Server (`domain/mathslab.php`)

- **`mathslab.guide`** (`?view=guide&stage=N`): ten topics, each with:
  - the key idea and claim from `mlb_why_of`, where the topic has a proof;
  - the hint as a tip;
  - a deterministic worked example (`mlb_item(id, 0, crc32('guide|id'))`).
- **`mathslab.start` mode `mini`** (optional `stage`):
  - `mlb_mini_pick` takes up to two topics from recent mistakes (last 30 sessions), then the practised topics with the oldest `updatedAt`;
  - finishing pushes a right known topic's next review out 21 days, sends a missed known topic to `review`, and pays 5 XP a right answer;
  - `mlb_mini_status` gives `ready` after `MLB_MINI_AFTER` (20) answers since the last mini review today. Home and the practice result carry it.
- **`mathslab.chest`:**
  - opens when `MLB_CHEST_AT` (5) stage topics are known, for `MLB_CHEST_XP` (25);
  - recorded as a session row (`mode` 'chest', `ref` = stage, sessionId derived from member and stage), so it opens once with no migration;
  - `mlb_session()` excludes `chest` and `daily` rows, so neither can be answered or finished as a session.
- **`mathslab.map` per stage:** `chest {opened, ready}` and `miniReady`.

### Client (`mlb-app.jsx`)

- `.mlb-pathhead`: a sticky header coloured by band. An IntersectionObserver tracks the unit in view, and the Guidebook button lives on the header.
- `MlbGuide` at `/study/lab/guide/N`.
- `MlbChestNode` after topic 5; the mini review node (`.is-practice`) before the boss.
- `.mlb-jump`: the floating way back to the "now" node, with its direction from an observer.
- The mini review offer on Home and on the practice result (`onMini` chains a new session).

### Tests

- `run.php`: 6901 passed, 0 failed. New: the Guidebook; the mini review's offer threshold, topic choice, state changes, XP and reset; the chest lock, once-only rule and session refusal.
- Maths Lab e2e: 56 passed, 0 failed. New, desktop and phone: the stage header, the chest and mini review on the path, and the Guidebook opening, showing ten topics with worked examples, and closing.


## 5 Nov 2026 — Maths Lab map: visual polish ("Improve UX. It looks rough")

- The separate sticky path header is gone. The open stage's own banner (`.mlb-unit.is-open .mlb-unit-h`) is now sticky and filled with its band's colour, and the Guidebook is a button inside it (`.mlb-guidebtn`). One header, not two stacked ones.
- Band colours are custom properties set once per band on `.mlb-unit` / `.mlb-bandh` (`--band`, `--band-dk`, `--band-ink`). Coins, the banner, dots, band icons and the Start bubble all read them. Gold's ink is dark (#2b1d00) so text on it keeps 4.5:1.
- Nodes are raised coins (a solid `box-shadow` underneath; `:active` presses them down). Chest and mini review take the same shape. The `<small>` sub-labels say when each opens.
- Band headers are plain dividers. `.mlb-upnext` is hidden in the rail on narrow layouts through a container query (min-width 760px), not a media query, because the Start coin on the path already says the same thing.
- All rules are scoped under `.mlb-map` and win on specificity: no `!important`. The dead `.mlb-pathhead*` CSS is deleted.
- `tests/mathlab-e2e.test.js` now asserts that the open banner is `position: sticky`, names its stage, and has a Guidebook button with an `aria-label`.
- Tests run: PHP suite 6901/0; maths lab e2e 56/0; shots 23 clean; build 31/0; contrast 21/0; no-important clean.

## 6 Nov 2026: The Labs engine, and the Physics Lab

**Requests:**
- Owner: "Alright then proceed first" (generalise the Lab engine before a second agent builds English).
- "We need real pro diagrams for physics, examples and visualizations interactive."
- "We need to make physics a breeze for everyone."
- "Do NOT mention these exam bodies since we'll not be copying their questions."
- "Research!"
- "Make sure diagrams are the standard and they understand how it works."
- Supplied: senior and university-entrance Physics past papers, and three olympiad problems.

### The engine is Lab-aware
- `LABS` (`domain/labs.php`) names each Lab's content functions. The engine reads content only through `lab_call()`.
- `backend_dispatch()` sets the Lab from the op's `lab` argument (default maths) and refuses an unknown one (`unknown_lab`).
- A topic resolves through its own prefix (`lab_for_comp`), so marking is right whatever the request says.
- A session records its Lab and is answered and scored in it.
- Maths functions were renamed to their content names (`mlb_maths_stage_table`, `mlb_maths_forms`, …). `mlb_stage_table()`, `mlb_forms()`, `mlb_bands()`, `mlb_edges()` and `mlb_courses()` are now Lab-aware readers.
- **Migration 229:**
  - `mlab_track` holds the climb, momentum and bosses, one row per member per Lab; the Maths rows are copied across. `mlab_profile`'s old climb columns stay in place, unread.
  - `mlab_sessions.lab` added.
  - XP and the streak stay shared.
  - Member merge moves `mlab_track`.
- **Certificates:**
  - Maths keeps its `mlb:` and `mlbs:` keys; other Labs use `mlb-<PREFIX>:` and `mlbs-<PREFIX>:`.
  - Documents carry `lab` and `labTitle`, so the title, `/verify` and the printed sheet name the Lab.
  - The formula pattern now uses a stride coprime to the list length. A stride of 5 over 40 formulas showed only 8.
- **Daily problem:** from the Lab's summit band. Maths keeps its old seeds, so today's problem did not change.
- **Papers:** per Lab (`content.papers`). `mlb_exam_pool`'s cache is keyed by Lab.
- **Marker:** a typed answer followed by a unit ("12 N", "2 × 10⁸ m/s") is read for items that declare `unit` (`mlb_strip_unit`). Digits are never stripped.
- **Client:**
  - `NGG_LABS` in `tools-core.jsx` gives one study tab per Lab at `/study/<seg>`.
  - `api-client.js` names the Lab from the address (`mlabLab()`).
  - `mlb-app.jsx` takes its title, daily-problem name, summit name, framework text and Exams tab from the Lab.
  - `tests/labs-client.test.js` holds the two halves of the registry together.

### The Physics Lab
- `physicslab-map.php` and `physicslab-gen.php`: nine stages, PH-001…PH-090, 6 bands, 6 courses, a timed paper (40 four-option questions in 40 minutes), and the Daily Physics Puzzle from the Olympiad stage.
  - Stages 7–8 close the gaps against what the past papers test most (by keyword count): resonance, a.c., photoelectric effect, semiconductors, heat transfer, fields.
  - Stage 9 follows the olympiad problems: guided multi-step questions on quantum wells, radiation balance, refrigeration cycles and magnetic braking.
- **`src/modules/mathslab/phy-visuals.jsx`** (loaded before `mlb-app.jsx`; in `build.js` ORDER and `index.html`):
  - `PhyDiagram`: 18 figure types in school conventions, each with "How to read this diagram" (symbol key and explanation).
  - 27 explorers, merged into the shared registries.
  - `PhyPredict`: every explorer opens with a prediction and gives a verdict after the learner tries it.
- **Research behind the design:**
  - PhET's implicit-scaffolding paper (Podolefsky et al., arXiv 1306.6544): guidance through affordances and constraints, minimal wording, colour linking, illuminating extremes.
  - Predict–observe–explain studies, including one in Nigerian classrooms.
  - Rosengrant, Van Heuvelen and Etkina on free-body diagrams.

### No exam body named
- Removed from every learner-facing string in both Labs: Maths paper titles and descriptions, band levels ("SSS · Senior Mathematics"), courses and Lab blurbs. Internal ids (`jamb`, `sat`) are unchanged.
- `api/tests/run.php` sweeps every Lab's questions (three draws of every form), maps, courses, papers and `labs.list`.
- The sweep was seen to fail on a planted "WAEC".

### Tests
- **PHP suite:** 6916 passed, 0 failed.
- **Maths Lab e2e:** 74 passed. It now includes Physics journeys on desktop and phone, the Exams page, and predict-before-explore.
- **`tests/physicslab-shot.js`** (new, in `test:all`): 29 screens, 18 figure types, 27 explorers, every figure with its guide.
- **`tests/labs-client.test.js`** (new, in `test:all`): 16 passed.
- Maths shots, build, contrast and no-important: clean.

### For the English Lab
`docs/LABS.md` is rewritten as the handover. It notes that free-writing marking needs a new item kind, added once to `mlb_mark()`, and that essay marking needs its own design.

## 6 Nov 2026: The Labs are findable; escape codes in children's screens

- **Owner:** "The SEO for the maths lab is still 100% terrible."
- **What a crawler used to get.** The SPA served every `/study/...` address the same empty shell: one title ("Study tools · NGG"), one description about flashcards, a canonical of `/study`, no maths in the HTML, and no Lab page in the sitemap.
- **The fix.** `.htaccess` sends `/study/<x>` to `api/public/lab-page.php`.
  - It serves the same `index.html` with that page's title, description, canonical, Open Graph, robots and JSON-LD.
  - JSON-LD types: Course for a Lab, a stage or a course; LearningResource for a topic; BreadcrumbList.
  - The page's readable content goes inside `#root`: the bands, the stages, a topic's idea and worked example as plain text (LaTeX converted, `lab_seo_text`), and internal links. React replaces it on start.
  - Anything that is not a Lab gets the shell back untouched, so the Lab registry stays the only list of Labs.
  - The work lives in `domain/lab-seo.php` (`lab_seo_page`, `lab_seo_shell`, `lab_seo_urls`).
- **In the app.** `app.jsx` no longer overwrites a Lab view's head. `mlbSeo()` sets the title, canonical and robots per view as the learner navigates; a topic's title is set once it loads. Member-only screens are noindex.
- **Sitemap.** It now lists every Lab, its courses, every stage guide and every topic: 327 addresses.
- **Escape codes.** JSX text written as `—` / `’` was rendering literally, for example in the Study helper's intro. Fixed in `assign-desk.jsx` (2 places) and `page-dashboard.jsx` (2 places). A repo-wide search finds none left.
- **Tests.** The PHP suite gained 3 checks:
  - unique titles, descriptions and canonicals, readable content with no raw LaTeX, and valid JSON-LD;
  - noindex on private screens and the untouched shell elsewhere;
  - the sitemap's count.
  - Result: 6919 passed, 0 failed.
- **Competitive analysis** (owner request): published as an artifact, "Maths Lab vs the Field".


## 6 Nov 2026 — member portal for children; explorer UX; Smartick in the comparison

- **Member portal navigation** (owner: "hard to navigate… not intuitive… too patchy", then "the navigation is also pretty confusing").
  - The full-view labels now use the plainer words: My week, Projects & ideas, Goals & scores, Badges, My requests, Ask NGG.
  - `MP9_APPS` is built from `NGG_LABS` (the duplicate "Learn" is gone). The Learn tab reads "Labs & tools ↗".
  - Area tabs wrap rather than scroll invisibly.
  - The Mentor side links that duplicated its tabs are removed, along with their dead `.m9c-side-link` CSS.
- **Today is consistent.**
  - `startCardShown()` decides who carries the open getting-started step: the card while it is visible; the banner and To do once it is hidden.
  - There is one streak source.
  - The term tile shows the week of the term, not the session's code.
  - The account section is wrapped in `todayAcc` (true only when money is owed). The design file was changed and `mp9-view.jsx` recompiled with `tools/dc-compile.js`.
  - Each assignment has a single `meta` line.
- **Explorers, shared layer** (`MlbExplore`, `PhyPredict`, `styles.css`).
  - The readout is ordered under the figure with CSS `order`; the DOM is unchanged and it is still a live region.
  - The spent prediction collapses to a guess line (`.is-made`, then `.is-ok` or `.is-no`).
  - Reset remounts the explorer by `key`.
  - The projectile is scaled per launch speed, with a metre scale and the previous throw shown faint.
- **Tests.**
  - `member-v9.test.js` gains checks for:
    - no account card when nothing is owed;
    - never "Nothing waiting" while steps are open;
    - an open step listed once;
    - the streak chip and tile agreeing;
    - the Labs in Your apps.
  - The `MP9_AUDIT` walk skips the app links and the ↗ tabs, because they leave the page.
  - `physicslab-shot.js` gains checks for:
    - the guess line;
    - no spent buttons left on screen;
    - the readout above the controls;
    - Reset restoring the controls (compared by control values, because several explorers run a clock).
- **Results.**
  - PHP 6919/0; member v9 57/0; maths lab e2e 73/0; maths shots 23; physics shots 29.
  - labs-client 16/0; no-important clean; contrast 21/0; build 31/0.
- **Comparison artifact**: Smartick added as a ninth product, after a comment on the artifact.


## 6 Nov 2026 (later) — "it should just say labs"; the study app's own navigation

- **Portal.**
  - Your apps carries one **Labs** entry (`/study/labs`), not one per Lab. Learn's "Labs & tools ↗" and the hero's "Practise in a Lab" go there too.
- **Study app** (`tools-core.jsx`). The tab row goes from seven tabs (Today, Revise, Maths, Words, Maths Lab, Physics Lab, Course labs) to four: **Today · Labs · Revise · Tools**.
  - **Labs** is a hub, `SttLabHub`, generated from `NGG_LABS`. Its second tab is **Course tools** (the old Course labs, `SttLabs`).
  - **Tools** merges Maths and Words.
  - Subject Labs are `hidden` entries with `parent: "labs"`: they keep their deep addresses, light the Labs tab, and show **All Labs**.
  - `STT_ALIASES` forwards `/study/maths[/graph|bases]` and `/study/words[/typing]` to `/study/tools/...`. `/study/labs` is now the hub.
- **Tests.**
  - `study-tools.test.js` 46/0. It adds checks for the four-tab row, the hub listing every Lab, the lit Labs tab with All Labs inside a Lab, and the three old addresses forwarding. A signed-out wait now waits past the loading state.
  - `mathlab-e2e` 73/0: the Physics Lab sits under the Labs tab.
  - `member-v9`: one "Labs" entry in Your apps.


## 6 Nov 2026 — The English Lab, the third Lab, built as a kit and modules

Owner: *"Can you build the engine. Make it modular. Research first."*

- **Research.**
  - The road follows the strands of the English Studies curriculum (vocabulary, structure, speech work, reading and comprehension, composition) from JSS to SS 3.
  - Writing is taught through sentence combining and other markable parts, because sentence combining has the strongest evidence for improving whole compositions.
  - Retrieval and spacing come from the shared engine.
- **Engine.** One new answer kind, `text`, added once to the shared marker (`mlb_text_norm`, `mlb_mark`, `mlb_answer_text`) as `docs/LABS.md` required. No second marker.
- **Modular content.**
  - `englishlab-kit.php`: the question builders.
  - `englishlab-map.php`: six stages of ten, five bands (summit: Writing Well), five courses, a 40-question timed paper.
  - Five content modules (words, grammar, sounds, reading, writing): 60 topics, 3 forms each, mostly tables of rows.
- **Registry.** `LABS['english']` (prefix `EN`, `/study/english`, daily + exams) and `NGG_LABS` in `tools-core.jsx`.
  - The answer box for `text` opens a text keyboard with autocorrect and spell-check off, so a phone cannot answer a spelling question for the learner.
- **Tests.**
  - `php api/tests/run.php`: 6928/0 (from 6919/0). Adds the English sweep and the `text`-marker, map, isolation, paper, daily and certificate checks. `labs.list` and the sitemap counts now include English.
  - `tests/labs-client.test.js`: 22/0. `tests/route-registry.test.js`: 60/0.
  - `tests/mathlab-e2e.test.js`: 92/0, with a new English journey at desktop and phone. The test also now finds this image's `chrome-linux64` Chromium as well as `chrome-linux`.
- **Not built.** Judged essays (needs a teacher queue or a rubric-checked AI step) and listening questions (need audio).


## 6 Nov 2026 — English Lab: more research, a better structure

Owner: *"Research more and improve the structure."*

- **Research.**
  - The senior English paper has four parts: essay; comprehension and summary; lexis and structure; oral English. Comprehension asks for the grammatical name and function of words and clauses. Summary is marked one point per sentence. Oral English covers vowels, consonants, clusters, stress and intonation. Composition covers formal, semi-formal and informal letters and the four essay types.
  - Learner-corpus grammar levels put mixed conditionals and modals of deduction last.
  - Morphology instruction helps vocabulary and spelling most when it is meaning-focused.
  - In the writing meta-analyses, summarising has one of the largest effects, and grammar taught in isolation does not improve writing.
- **Curriculum.** Two stages were appended (EN-061 … EN-080), so no topic id moved:
  - **Stage 7, Word Power:** roots, word families, collocations, confusables, one-word substitutes, four fields of vocabulary, and interpreting sentences.
  - **Stage 8, The Senior Paper:** grammatical names and functions, own-words comprehension, one-point-per-sentence summary, counting sounds and syllables, consonant clusters, the semi-formal letter, the four essay types, and mixed conditionals with modals of deduction.
  - The summit band, the Daily Word Challenge and the paper's range moved to Stage 8.
- **Code structure.**
  - `ENG_MODULES` is the one list of content modules, and a test checks it against the map.
  - `eng_passage()` is a shared passage bank.
  - Per-Lab copy (`find`, `pitch`) moved out of the shared screens into the registries. This also fixes the Physics map, whose search box suggested maths topics.
- **Tests.**
  - PHP suite: 6929/0. The sweep covers 80 topics, plus the module-registry check.
  - `labs-client`: 28/0 (adds the `pitch` agreement and `find`).
  - `route-registry`: 60/0.
  - `mathlab-e2e`: 91/0 on two consecutive runs. An earlier run drew a typed English question and showed the test itself typed in capitals on a capitals-sensitive item; the test now respects `case`.


## 6 Nov 2026 — English Lab: real teaching for grammar and speaking

Owner: *"I need real effective learning. Grammar … Speaking … Articulation … a bit of Duolingo features. Do not use a shitty voice please … free, dependable, professional and articulate."*

- **Research.**
  - Explicit rule instruction beats implicit learning by large margins across meta-analyses (d ≈ 0.8–1.0).
  - Metalinguistic feedback (naming the error) is the strongest feedback type. The Lab already names the slip behind every wrong option.
  - Perception training with many talkers (HVPT) improves perception and production (g ≈ 0.77).
  - Articulation is examined directly in oral English.
- **Grammar.** `eng_rules()` gives 27 topics a contrast-style rule (✓/✗ with reasons), read before practice, using the existing lesson step with the Lab's own words (`teach` in `NGG_LABS`).
- **Speaking and articulation.**
  - `eng_speak()` gives 11 topics *How to say it* (place, manner, voicing), *Hear the difference* (eight rounds, four voices, a streak, answers locked until played) and *Say it* (normal or slow model, record, word-by-word result).
  - Two articulation forms (voiceless dental fricative …) are appended to EN-023 and EN-024. Each wrong option changes one feature and names it.
- **Voice.** Kokoro (open weights, Apache-2.0), four British voices. 260 clips (2.9 MB) were recorded once by `tools/english-voices.py` and committed. Phonemes were checked against the British model; "record" (verb) is forced by phonemes. Spitch and the device voice are fallbacks only.
- **Fixed in passing.** `Permissions-Policy` denied the microphone everywhere, which had silently broken the portal's voice notes on the live site. It is now `microphone=(self)` in both places.
- **Tests.**
  - PHP: 6934/0. Adds checks that rules are contrasts, the speaking content is well-formed, the voice refuses text that is not the Lab's, word matching, "Say it" against a fake Spitch, and that every text has its recording.
  - `mathlab-e2e`: 99/0. The rule renders as a contrast and must be read; Hear and say runs eight rounds; the recorded clips load.
  - `labs-client`: 28/0. `route-registry`: 60/0. `study-tools`: 46/0.

## 7 Nov 2026 — English Lab: exam-trap drills and taught rules; Maths Lab: number bases at exam speed

**Owner:** "Improve the grammar rules. Follow the concept of the lab. Becoming Gods", with a concord / lexis / oral English / number-base training pack to adapt, and "What is the fastest way to solve number base problems in less than 50s".

- **The concept** is the Gods of Maths brief, "tough, but easy": the traps the senior paper really sets, every wrong option naming its slip, the rule taught first.
- **Rules** (`englishlab-teach.php`): EN-011 and EN-038 rewritten around the five concord patterns; new taught rules for EN-021, 022, 024–028 (vowels, diphthongs, ch, silent letters, stress, noun/verb stress, rhyme) and EN-050 (nearest/opposite).
- **Drills** (`englishlab-drill.php`, `eng_drill_forms()`): appended after every topic's own forms and the articulation forms, so no stored session changes question. Concord (EN-011, EN-038), lexis (EN-043 gap-fill, EN-050), oral English (EN-021, 022, 024–028).
- **The pack was corrected, not copied.** Collective nouns are not "always singular" (the jury ARE divided in THEIR opinion); British English says the h in herb and the l in salt; NA-tion and u-ni-VER-si-ty; con-TENT (satisfied) vs CON-tent; politics is the -ics exception; an item whose sentence did not decide its answer was given the clause that does.
- **Number bases** (`mathslab-gen-more.php`, MC-110): unknown base by plugging the options, a missing digit across two bases, binary multiplication by shift-and-add, binary to base ten with the zeros skipped. Every unknown is chosen first, so each question has exactly one answer (the pack's "31_x = 22_5" has none).
- **Voice:** the Nigerian YarnGPT voices were tried and dropped: a speech recogniser could not transcribe most clips correctly, and none spoke single words reliably. Recordings stay Kokoro British; bolder variants (natural pace, presence lift, compression, −14 LUFS) are prepared as samples, not yet applied.
- Tests (`api/tests/run.php`): drills sit after each topic's own forms; the concord traps are keyed right; the sound topics teach a rule first.

## 7 Nov 2026 — Bold voices, Nigerian voices, two interactive steps, and a faster site with Lite mode

**Owner:** "Add them all. Add the Nigerian voices if you can make them bolder and better. Add more interactive features", then "Optimize assets. It seems the site cannot run on low end devices … create a lite version".

**Voices.** Every British clip re-recorded bold (`tools/english-voices.py --redo`: natural pace, a 3 kHz presence lift, compression, −14 LUFS). Nigerian voices (YarnGPT2: Idera, Jude) come from `tools/english-voices-ng.py` and are OPTIONAL per text: a clip is kept only if Whisper transcribes it back exactly, with up to six tries; the British voices remain the ones every text must have. `ENG_NG_VOICES` in `englishlab-speech.php`. The README's WavTokenizer checkpoint is required — the newer "v2" one decodes this model's codes into garbled speech (measured).

**Interactive.** The rule lesson is a game in contrast mode: each ✓/✗ example is shown bare, judged Right or Wrong, then revealed with its reason, and the lesson ends with a score (`MlbWhy`). Hear and write (`EngWrite`): dictation of a recorded sentence, marked word by word. The listening rounds say which voice is speaking and use ONE voice for both words of a pair.

**Speed.**
- `page-portals.jsx` (316 KB) moved to the signed-in bundle. `naira`, `Field`, `CurCheckField`, `CUR_SHOWS_WORK`, `CurAttach` moved to `components.jsx` because public pages use them; `page-dashboard.jsx` stays public because Learn uses its lesson components.
- Stylesheets ship minified (esbuild): 378 → 264 KB gzipped.
- **Lite mode** (`data-lite` on `<html>`, set before first paint in `index.html`; `nggLiteAuto` / `nggLiteOn` in `components.jsx` — keep the two tests in step). On automatically at ≤ 2 GB of memory, ≤ 2 cores, Data Saver or 2G/3G, and switchable in Accessibility. It finishes animations instantly (never `none`, which strands fade-ins at opacity 0), and drops backdrop blur, fixed backgrounds and smooth scroll; `motion.jsx` skips its scroll effects. `tests/lite-mode.test.js` (`test:lite`, in `test:all`).

**Pre-existing failures seen, not caused here:** `ui-smoke.js` expects the Lab nav Home/Map/Courses/Progress but it has had Certificates since before this change; `a11y.test.js` flags `aria-label` on the footer's socials `div`.

## 7 Nov 2026 — Learn: the standardised session exam, smarter questions, mastery to God, Club certificates

**Owner:** "work on the learn … following the concept of the labs … assessments world-class professional grade. Not just multi-choice … AI-spoof it … create Gods … The instructors sees their progress", "turn on the per session exam by default. Upgrade the exam and make it standard", "A standard honourable exam", "a … per course-styled certificate for courses and promotions as the labs" (promotion = moving up a COURSE year, not the Summer → NGG promotion).

- **Engine:** `domain/learn-exam.php`; migration 230 (`curriculum_checks.whys`, `curriculum_sittings`). Session exam = last session's checks + up to `LX_SPACED` spaced items (wrong-before first); per-sitting order and option permutation (`perm`, server only); time limit from kinds; server deadline + `LX_GRACE`; resume; one official sitting (`lx_prev_unit` finds it before any blueprint, so a reload shows the result). Marks land on last session's lesson (`lx_sync_progress`, recall stamped).
- **One marker:** `curriculum_mark_answer()` in curriculum.php, used by the lesson page and every sitting. New kinds `order` (LIS partial credit, `curriculum_order_points`) and `evidence` (link in the `videoUrl` column, public as `linkUrl`). MCQ `whys` → `slip` on a wrong pick. An `order` question does not count as the lesson's non-choice question.
- **AI-resistance without a detector:** `LX_VIVA_MAX` follow-ups for everybody on their strongest AI-marked answers; a reply that does not hold up HOLDS the answer for an instructor (never a machine zero). Process signals only ever go up, are shown as things to ask about. Honour pledge recorded as `integrity.pledgedAt`.
- **Instructors:** `staff_exam_sittings` (item analysis: facility and most-chosen wrong option) and `staff_exam_mark`; scope from `curriculum_staff_members()`, now the ONE scope shared with `staff_curriculum`. UI: `Mp15CExams` in mp15-class.jsx.
- **Mastery / certificates:** `domain/learn-mastery.php` (tiers 1–6, Trial at `LX_TRIAL_PASS`, 7-day cooldown); `doc_club_issue` / `doc_render_club_certificate` in documents.php (style by course, then division — never a regex over the division name, which put Data Analysis under technology); certificate key hashes course+level (MySQL `sourceKey` is VARCHAR(160)). New signatory `clubHead`.
- **UI:** `src/modules/learn/lrn-exam.jsx` (`LrnExam`, `LxResult`, `LxViva`, `LrnMastery`); replaces `DashOpeningReview` in Learn and the dashboard. Editor: order steps, evidence link, a "why tempting" box per wrong option.
- **Content:** the 66 business filler questions replaced with real ones on each lesson's skill, each wrong option with its reason; `run.php` holds every bundled lesson to publication and to no filler.
- **Pre-existing failures seen, unchanged by this work (verified on 272dd097):** `lesson-editor.test.js` (8 lesson bodies drift on round trip); `control-members-curriculum.test.js` (a refused save's reason, and keeping the form).

## 7 Nov 2026 — Exam: Outstanding (95+), a locked paper, a candidate slip and re-marks; outside-exercise proof fixed

**Owner:** "Add a category for 95+. Improve the exam standard. Improve the exam env to prevent cheating", and "There's an issue with the assessment evidence feature".
- **Bands:** Outstanding 95+ (`LX_BAND_OUTSTANDING`), Distinction 85+, Merit 70+, Pass, Not yet.
- **Locked paper** (`lrn-exam.jsx`): full screen asked for on start (exits counted); questions cannot be selected, copied, cut or right-clicked (tries counted); pasting into exam answers is blocked and counted (except the proof link of an outside exercise); the candidate's name and exam number are watermarked across the paper; returning from another tab says leaving was recorded; closing the tab asks first. Server: a sitting keeps a HASH of each browser it was opened on (`integrity.devices`); new signals "tried to paste", "tried to copy a question", "left full screen", "opened on N devices", "re-mark requested" (`lx_signals`). None is a mark.
- **Standard paper:** candidate slip on the result (name, member number, exam number, paper, handed in), section scores (last session / earlier weeks / the whole course), and **Request a re-mark** (`member_exam_appeal`: once, within `LX_APPEAL_DAYS`, a reason required; an instructor marking the sitting resolves it).
- **Outside exercise (`evidence`) — the fault:** there was nowhere to put the proof. The answer was one box (so blocking paste in the exam would have blocked pasting a result link) and the upload button was only on practical/project/code questions. Now `LxEvidence` (one component, lesson page and exam) has a proof field (paste allowed, plus upload for a screenshot) and a typed account; stored as one answer, "Proof: …" then the account.

## 7 Nov 2026 — Data Appreciation and Desktop Publishing: courses every member takes; Media Lab's Club-wide lessons retired

**Owner:** "The medialab is for everyone right? Change it to Data Appreciation and Desktop publishing … standard modern courses … with screenshots, daigrams and presentations and appropriate learning guides and materials"; answered "Everyone; keep media".

- **Courses:** `CURR_CORE_COURSES` (curriculum.php) joins `curriculum_courses()` and is appended to every member's courses in both enrolment modes, like Chess. `curriculum_is_everyones()` is the one test for "a course everybody takes" — timetable "My course", the card's division, Club class courses and community course channels use it (or exclude the core list), so an unplaced member never reads as placed on Data Appreciation.
- **Content:** `api/_lib/seeds/curriculum-core-digital-2026.json`, 24 lessons, GENERATED by `tools/learn-core/build.py` from `lessons.py` (the lessons) and `media.py` (15 SVG diagrams, 4 worked-example pages); `node tools/learn-core/shots.js` renders the pages to PNG. Edit the sources, never the outputs. Each lesson: an inline picture, a slide deck (`assets/learn-media/core/decks/`), outside reading with a guide line, two routes, and non-recognition assessment (task/evidence/order/short/project, every MCQ with named slips). Week 1 carries a learning guide (`core/guides/`).
- **Shipped media:** `curriculum_media_url()` resolves `media:key` to `/assets/learn-media/key` when no media host is configured and the file ships; a lesson BODY's `](media:…)` is resolved at read time too. `CUR_SAFE_URL` (components.jsx) allows `/assets/learn-media/…`. Certificates: Data Appreciation → tech style, Desktop Publishing → media style.
- **Retiring a shipped lesson:** a seed row may carry `"status": "retired"`. The seeder retires an existing lesson only while it is still exactly as shipped, never creates a retired one, never deletes. The Media Lab file retires its six Club-wide rows this way.
- **Tests:** run.php — the core courses (catalogue, every member in both modes, kinds, media resolve, real importer, certificate style), retirement. Stale assertions updated where the rule changed on purpose: member course lists now end with the core courses; an `evidence` question carries its link in `videoUrl` (the "no video on a non-watch question" check now excludes it).

**Same day, revised:** Data Appreciation rebuilt as "the very basics to intermediate of what every computer user should [know]" (owner) — `tools/learn-core/lessons_da.py`; ten more diagrams and eight drawn work-screens (`media_more.py`: file manager, SUM and fill, sort/filter, share dialog; DTP document setup, editor, paragraph styles, print-PDF export). Drawn, not captured: no product's logo or trade dress, so they ship and do not go stale.

## 7 Nov 2026 — Formal family reports (month, session, Summer edition) with fines and dues; daily attendance email

**Owner:** "the parents should get a formal professional report at the end of each session and every month. Super profesh", "monthly parent reports — with fines and dues and so on", "email reports on every programme … on the attendance for the day".
- `domain/parent-reports.php` (in the bootstrap list). Migration 231: `parent_reports` (sealed per subject/kind/period) and `report_sends` (claimed per recipient before a mail goes).
- `preport_member_data` reads attendance (programme days, scans, `policy_unexcused_absences`), lessons/exams/certificates, sanctions, ledger entries in the period (training and write-offs excluded — their own account) and `fees_balance` as of the day. `preport_html` is ONE document for the email body and the printable page (`api/family/report.php?id=`), inline styles, tables with `scope`.
- `family_reports_run` now delegates to `preport_monthly_run` (same signable inbox notice and refId, so the old dedupe holds). Session and edition reports and `attendance_daily_run` ride `web_cron_reminders`.
- Ops: `family.report`, `admin.reports.member`.

## 7 Nov 2026 — Labs: "Remember it" picture sequences (Maths and English), instead of looping GIFs

**Owner:** "Start with the Math Lab and English Lab illustrations. Add fun to remember gifs", then "Ensure they are research-driven and -optimized, if not drop them".
- **GIFs dropped, on the evidence.** Decorative or "fun" motion costs learning (seductive details — Rey 2012; Mayer's coherence principle); a looping, self-running animation is transient and learner-uncontrolled (Mayer's segmenting principle; the transient-information effect), must be pausable (WCAG 2.2.2), and is heavy on the low-end phones Lite mode serves.
- **What replaced them:** a "Remember it" step before Practise. Three frames of the IDEA itself, stepped through by the learner, one caption each, at most one memory hook where the research supports one (ordered rules: BODMAS, SOH CAH TOA, PEEL; word roots by the keyword method), and it ends in retrieval — "cover it and say it" — which is what marks the step done.
- `tools/lab-remember/build.py` generates 36 cards (20 maths, 16 English), 108 SVG frames and `assets/lab-media/remember/remember.json` (card → topics; 75 maths and 42 English topics covered). Edit the generator, never the outputs. The index is fetched once; a frame only when shown.
- Client: `MlbRemember`, `useMlbRemember` in `mlb-app.jsx`; styles `.mlb-rem*` in styles.css. Tests: `mathlab-e2e.test.js` (pictures load with alt text; the step ends by covering them), `mathlab-shot.js` (the step reached on a phone by studying, no skipping; step list now includes "Remember it").

## 7 Nov 2026 — One course, not a wall: members no longer get several courses by guesswork

**Owner:** "Fix the issues with students getting multiple courses".
- **The faults, reproduced:** an unplaced member whose record named only a division ("Tech", "Media", "Music", or a `division` alone) was proposed EVERY course in it (7–8), so they took seven sets of lessons, deadlines and fines; interests on the card piled further courses on top of the track's; and `course_scope()` widened a broad course downwards, so a child placed on "Music" took all seven instrument strands. "Graphics Design" matched nothing.
- **The rule now** (`curriculum_member_courses_infer`): the track's course(s); else the FIRST interest, flagged `several` with `alternatives`; else, division only → no course, flagged `division_only`; a broad subject on the track sharpened by a strand in the interests ("Music" + "Piano" → Piano); an exact course name wins ("Music" is Music). A division never enters the course list (see `course_reach`): an unplaced member reaches the division's shared lessons through `curriculum_member_units_all()` + `curriculum_member_division_names()` (both the programme's name and the catalogue heading), and an assignment set for a division word reaches its members placed or not (`assignment_matches_member`). `course_scope('Music')` is `['Music']`; a strand still reaches up to its subject. Chess stays with anyone whose division is known. The member card falls back to the member's division.
- **Stored proposals recompute:** `members_courses_inputs()` hashes a rule version (`p2`), so every unplaced member is re-proposed on the next read.
- **Tests:** run.php fixtures that relied on "TECH means Coding" now place those members on Coding, as staff would; the inference tests assert the new promise (no wall; first-of-several; division-only reaches the spine; Music is Music, Piano reaches Music). `course-placement.test.js` walks a division-only child and a two-interest child through "Needs a look" and a confirm.

## 7 Nov 2026 — Monthly Progress Report redesign (handoff), real logo and colours; dues as PDFs

**Owner:** the `ngg-progress-report-handoff` package ("Implement this"), "We to also be able to export dues in PDF", "Add the real logo and use the real colors".
- **Design:** `assets/report/report.css` holds the handoff's tokens, components and print rules (A4 `@page`, repeated `thead`, rows never split, `print-color-adjust: exact`) with NGG's colours in place of the handoff's stand-ins (`--ngg-navy` #1C2A5E = styles.css logo navy, `--ngg-amber` #F5B026 logo gold, `--amber-ink` #7A5600 the AA-safe dark gold; every pair re-measured ≥ 6:1). Self-hosted Geist and Bricolage Grotesque (`assets/report/fonts/`, SIL OFL). The letterhead carries the real mark, `assets/report/logo.png`, cut from `assets/logo.png` to its disc (the source's soft shadow blurs at 48px).
- **Renderer:** `preport_html()` (domain/parent-reports.php) rebuilt on one table partial (`preport_table`) and one tag partial (`preport_tag`); `preport_document()` is the page shell. The print button is `assets/report/report.js` — not an inline handler, which the production CSP forbids — and waits for `document.fonts.ready`. Data v2 adds per-line ledger rows, the credit, register tags (excused absences via `member_absence_cover`) and the first name; v1 reports sealed earlier still render from their totals. The summary sentence is server-side (`preport_headline($r, true)` bolds the balance) and names the child rather than using a pronoun.
- **Email:** `preport_email_body()` — the sentence and figures inline, plus the button; the handoff scoped the carrier email out, and mail clients cannot load the fonts or layout. Summer School parents (no account) get `api/public/report.php?id=&k=`, `k` an HMAC of the report number under `cookie_secret` (`preport_sig`) — stateless, nothing stored.
- **Dues PDFs:** `domain/dues-print.php` — `admin.fees.register.doc` (reads `admin_fees_arrears()` itself, so the PDF cannot disagree with "Who owes"; scoped), `admin.fees.statement.doc` (fees, scoped), `member.fees.statement.doc`, `family.statement.doc`. Routes `api/admin/dues-print.php`, `api/member/statement.php`, `api/family/statement.php`. Buttons: Control Room money actions; the family Fees statement (via the design source `family-portal-v3.dc.html` + `tools/dc-compile.js`); the member Fees page. `admin_fees_arrears` rows now carry `displayId`.
- **Open questions from the handoff, answered by default:** balance row shown at ₦0 ("Nothing to pay"); conduct statuses map active/pending → warn, waived/voided → neutral, anything settled → "Resolved"; excused absences count as absent days in the rate (the rate is days present over programme days).

## 7 Nov 2026 — Request actions say what they do; Guide; welcome and tenure

- **Requests desk, actions in context.** A fine appeal offered "Approve / Decline",
  and "Approve" read as agreeing with the fine while it did the opposite (it
  upholds the appeal and lifts the fine). Each request kind now names its two
  outcomes (`CR_REQ_ACTS` in `cr-tab-members.jsx`): an appeal is "Uphold — lift
  the fine" / "Keep the fine", leave is "Excuse the absence" / "Refuse the
  leave", a question is "Answer and close". Upholding asks for the reason in the
  form, as the server already required (`need_reason`). The drawer now lists the
  member's **other open requests** with an Open button, because families
  appealing a fine usually point at a leave request still waiting — and warns
  that excusing the leave does not lift the fine on its own.
- **Guide.** The Learn study helper is now Guide, a Socratic companion: it
  climbs a ladder of hints (what did you try → a nudge question → the rule that
  applies → a worked example of a *different* problem) and never hands over the
  answer, never writes the assignment, and praises the strategy rather than the
  child. Prompt in `member_curriculum_ask` (curriculum.php).
- **Welcome and tenure.** `member_welcome()` (club-class.php) gives the member's
  Today a second line read from the record (programme day, streak, first
  fortnight, else an effort-praising line steady for the day) and how long they
  have been with NGG, and celebrates a birthday, one week, one month, 100 days,
  six months, 500/1,000 days and every anniversary for a week. A celebration is
  put away once and stays away (`mp9.celebrated.<key>` in member state).

## 7 Nov 2026 (later) — Inbox reading pane; Remember-it cards for every Lab topic

- **Inbox.**
  - The facts box no longer collapses beside a long message: it was a flex child of the scrolling pane.
  - A family account with no name is shown as "<child>'s family" followed by the address, not by the bare email.
  - Request items use the drawer's outcome labels and list the member's other open requests.
  - A request opens at its top, so the subject and facts are in view.
  - The notification nudge is a strip in the list, not a large card.
  - Rail labels never wrap: the rail becomes icons below a 1240px workspace.
  - A narrow pane restacks by its own width (a container query).
  - `tests/requests-desk.test.js` checks the pane at 1117, 1440 and 900px.
- **Remember it.** `tools/lab-remember/` now has sibling modules, each loaded through `add(B)`:
  - `maths_more.py`: 16 cards.
  - `english_more.py`: 22 cards.
  - `physics.py`: 32 cards.
  - Every competency is covered: maths 99, English 80 (EN-001…EN-080), physics 90 (PH-001…PH-090). In total, 106 cards and 318 frames.
  - The Lab shows the step for any mapped topic. `tests/mathlab-e2e.test.js` walks it in all three journeys.
### 7 November 2026 — English Lab: taught rules for all foundation topics

On `codex/english-lab-gods`, based on freshly fetched `4b8e9e08` from `claude/finme-dues-training-fees-l54o5j`: expanded taught-rule coverage from 35 to **80 topics**, preserving all **259 existing question forms**. Added 45 rules with explicit Right-or-wrong judgements and reasons; qualified overgeneralised grammar rules and clarified ambiguous examples. The English browser journey now completes the first topic’s new rule lesson. No Learn changes, migrations or existing audio edits.

Baseline: **6,963 backend / 28 client / 104 browser passes, zero failures**. This deliverable: **6,963 / 28 / 105 passes, zero failures**. Browser assertion totals can vary because the randomly selected practice format conditionally adds a typed-keyboard assertion. A scratch check confirmed every rule has 3–6 marked examples, both judgement types and reasons; all 777 captured historical question samples remained identical. No new forms yet, so the new-form 200-seed sweep has zero forms to exercise. Build/browser verification runs in a disposable copy to preserve tracked deployment outputs. The first browser rerun caught the old journey’s assumption that EN-001 had no taught rule; the journey now completes it rather than skipping the teaching gate.

Dictionary access is blocked by the environment allowlist; a saved configuration draft adds Cambridge and Oxford Learner’s Dictionary. No new IPA transcription was introduced. Existing phonetic material has not been independently reverified during this task. New practice, summit content and oral expansion follow in separate commits.

### 7 November 2026 — English Lab: production and reasoning for every foundation topic

Appended **87 forms** through `eng_drill_forms()`: 80 bounded production forms plus seven focused concord, tense, contextual vocabulary, inference, summary, paragraph-order and sound-counting forms. Total: **80 topics, 346 forms, 80 rules**; every topic has at least four forms and a typed or ordering form. The new material uses all five kit builders. Error-spotting rows can now supply a specific explanation for each correct part selected in error; historical rows retain their previous output exactly.

Validation: **6,963 backend / 28 client / 107 browser passes, zero failures**, against the 6,963 / 28 / 104 baseline. The scratch sweep generated **17,400 new-form instances** (200 seeds for each of 87 forms): no duplicate options, missing keys, empty hints, self-marking failures, answer leaks or fixed typed answers. All 777 captured historical samples remained identical. Examiner review checked bounded-answer instructions and context, including distinguishing missing evidence from a false claim. An intermediate browser run had one intermittent failure in the unchanged Maths phone gate; the complete rerun passed. No change to that Maths journey was made. A legacy English assertion was updated from five to six forms for EN-023.

The summit and additional recordings are still to follow. No existing recording was changed. No new IPA transcriptions were added; dictionary verification remains blocked pending the saved domain-access draft.

### 12 November 2026 — Audit: every node suite run, product defects fixed, stale suites brought up to the screens they test

The whole node suite list (140 entries) was run one suite at a time, because the e2e suites each write a throwaway `api/config.php` and cannot overlap. Each failure was traced to a product defect or to a suite that had fallen behind a screen.

**Product defects found by the run, and fixed:**

- **ID Card Studio print could make no PDF.** In `vendor/card-export.js`, `loadScript` resolved as soon as a `<script>` tag for the URL existed, even while it was still downloading. When two cards were drawn at once, or a stale copy of the file asked a moment earlier, the second caller read an undefined `window.jspdf`. The card failed with "reading 'jsPDF'", and "Nothing was printed". The fix keeps one shared promise per script and waits on a tag that is already there.
- **ID Card Studio: a one-frame "Sheet 3 of 2".** This showed after the last sheet was removed. The sheet index is now clamped in the same update.
- **Lite mode left inline motion running.** No stylesheet rule outranks an inline declaration without an important-flag, and those flags are not used. Five inline backdrop blurs and two bare inline transitions read Lite's switches now: `var(--lite-blur, blur(Npx))` and `calc(Ns * var(--motion, 1))`. `tests/lite-mode.test.js` scans the source so that a bare one cannot come back.
- **The lesson editor rewrote eight bundled lessons on open.** An indented sub-point (`  - `) went back out as a top-level `- `. Each list item now keeps its own indent and marker. 612 bodies round-trip unchanged.
- **Summer School "Apply for this" lost the course.** `/join?program=summer` forwards to the centre's live public sign-up link and now carries `centre` and `track` with it. `selfRegSeed()` takes each value only where the form asks for it and offers it, choosing the course's faculty too. It never overwrites the family's draft.
- **School results: the member's "Lower the target" went below 85%.** It went down to the child's current score, and the server then refused the plan with `target_too_low`. It now stops at `results_target_floor()`; the server sends `targetMin`. The mentor screen and v9 already held 85.
- **Palettes lost the first keys typed after opening.** The Summer School portal and the member portal v9 focused the search input on a 30 ms timer. It is now focused in the commit that opens the palette.
- **Control Room → Centres** says again that a centre's code is the printed ID prefix (on Summer School cards). Before, only the add and edit forms said it.
- **Mentor v15 class screens said "That didn't work. Try again." for a refusal that retrying cannot fix.** The worked example is `orientation_required` before the Academy is done. `mp15cErr` now falls back to the portal's own messages (`MP15_ERR`), then to the server's `detail`.
- **The family app had no way to use a code from staff.** The Control Room's instructions ("Open the NGG Family app (/family). Choose 'I have a code from staff'") point at a step the family v3 controller fully implements (`siDeskStep`, `siDeskGo`). The design never drew it, so no guardian could reach it. `family-portal-v3.dc.html` now has the link and the step (email, code, Sign in, "Email me a code instead"), recompiled.
- **Community v3 dropped the quote of the week.** It led the home feed on the first Community. A `qowEl` slot in `community-v3.dc.html` puts it back under the post box: on the home feed only, never on a filter, a search, a person's posts or a channel.
- **Timetable quick add had no keyboard focus ring.** The "one field, one box" rule in `styles-app.css` matched `.tt-qa-row`, a bordered input beside its own send button, by shape. It removed the input's ring and drew a halo on a row with no edge. The row is excluded now. focus-ring passes: 551 stops on 11 pages.

**Sign-in (owner, 12 Nov: "the sign in UX is quite terrible… no protections for cases where siblings share one mail… It does not work").** Driven in a browser with real fixtures: siblings on one address with and without passwords, the same password on two, a staff parent on a child's address, a suspended sibling, forgot-password, and the journal gate.

- **The emailed code was "invalid" every time for a child sharing an address with a staff parent, or with a suspended sibling entered first.** `auth_request` keys the code by `auth_email_accounts` (no suspended, no password-only staff), but `auth_resolve_member_id` looked it up on the OLDEST row on the address. Both now resolve the same way. Two `run.php` tests fail without the fix.
- **Forgot password on a shared address:** the email holds a button per child, not a code, and the screen now says so.
- **The card was restructured.**
  - Each step now has ONE primary button, then "or" and the other real way in as a full-width button ("No password? Email me a sign-in code"), then "Got a code from staff? Enter it" on its own line.
  - The first screen's two loose links are an "Already have a code?" pair: **From my email** and **From staff**.
  - Secondary links stack one per line; side by side they wrapped into each other.
  - On an unrecognised device the title is "Sign in", not "Welcome back".
- The Control Room's let-in instructions name the new labels.
- **Worked as built, and now confirmed in a browser:** the picker on a shared address by code and by link, a password opening its own account, the same password offering a choice, and the journal gate.

**Suites brought up to the screens they test (no product change):**

- **Bundle split.** Seven fixtures never loaded `app-more`, where the admin screens live: admin-table, community-engagement, members-dash/manage shots, responsive-staff, tournament-shot and promo-ui. Four of them also mounted into `#root`, alongside the app.
- **Control Room v6 markup.**
  - status-board was rewritten for Analytics → Status board: the "Status by area" radiogroup, the member record page's "Part of the record", and the centre lead's scoping and hidden money.
  - summer-editions: the retired `registration`/`qr` ids land in the Summer School portal; `#cr-main`.
  - programme-separation: the Centres "Runs" column.
- **v9 and v15 portals.** dashboard-results pins the classic dashboard (`?classic=1`), and its mentor half now drives the v15 School results screen, which had no browser test.
- **Copy and rules that moved on purpose.**
  - The journal writer's "My journal".
  - The Lab nav has Certificates.
  - The volunteer row button is "Photo & portal access".
  - The review desk's "Check <name>'s sign-up".
  - Announcements also default to Community.
  - Results targets start at 85.
  - The journal gate offers a password first.
- **Test races.** These now wait for the thing they read:
  - kiosk: the previous refusal was still on screen;
  - community code viewer: the source arrives after the heading;
  - club announcements: the list reloads after the toast;
  - club applications: Review must wait for the row reloaded after "Photo added";
  - focus-ring: measures a stop once the smooth scroll has come to rest, not mid-scroll under the sticky bar;
  - dashboard-results: the mentor fixture has a completed Academy;
  - instructor and portal-account: done earlier in this run.
- **Isolation.**
  - make-hook has its own cache dir, because the rate-limit buckets of earlier suites counted against it.
  - roster-import-transport's stand-in window takes the session heartbeat's listeners and timer.
  - formation-parity loads curriculum.php, where the division table it reads lives.
  - programme-separation reads the Club seed marker from source.
  - ids-print needs history back to `79bf2bf`; a shallow clone must deepen first.

Results:

- PHP suite: **7084 / 0**. That includes two new sign-in tests, each shown to fail without the fix.
- Every node suite that failed in the full pass has since passed on its own (each one starts its own server, so they run one at a time). Where a fix touched a shared screen, the neighbouring suites were re-run too:
  - ui-smoke 627/0
  - focus-ring 551 stops
  - status-board 17/0
  - summer-editions 36/0
  - dashboard-results 27/0
  - mentor-v15 81/0
  - control-room 59/0
  - club-portal-v3 53/0
  - community-v3 62/0
  - family-ui 52/0
  - desk-signin 19/0
  - mfa 51/0
  - shared-email 10/0
  - settings-keys 19/0
  - wisdom-ui 48/0
  - lite-mode 8/0
  - ids-print 16/0
  - card-export 42/0
- `vendor/VERSIONS.json` records card-export.js's new checksum (build.test 31/0).

### 12 November 2026 — A staff parent can reset their own password from a shared address

Owner: "Please work on it." The background: password sign-in on a shared address already chose the right account, because the password says whose. Reset did not. It chose accounts by the sign-in list (`auth_email_accounts`), which leaves out password-only staff because they are never sent a code. So a staff parent and one child counted as "just the child": the staff member asked to reset their password and was emailed the child's.

`auth_reset_request` now counts every live account on the address, staff included (`auth_reset_accounts`). With more than one, the email has a **Set {name}'s password** link for each, and the staff one is marked "staff account". `auth_reset_confirm` is unchanged: it sets that account's password, revokes its sessions and still asks for the second step. A staff member alone on an address resets exactly as before. The sign-in screen's copy names this case.

Two `run.php` tests (7086 / 0) fail without the change. They check the email, then that the staff link sets the staff password, signs them in with it, and leaves the child's untouched.

### 12 November 2026 — The Labs: focus stays with the learner, and five screen faults

Owner: "Fix the issues with the lab." Every Labs suite was already green: labs-client, study-tools, mathlab-e2e, and the Maths and Physics shots. So the Labs were walked in a browser on the production build at phone width, and every press was checked for where keyboard focus went.

**Focus fell to the page on almost every press.** In each case, the button that was pressed was disabled or removed a moment later:

- Check (disabled while marking);
- Next question (the same button, disabled on an empty question);
- See how you did;
- Practise;
- the last "Show the next line" in a worked example;
- the last "Right or wrong?" or "Next line" in Why it works;
- Hear the difference: its choices, Next and Finish, and the Play button, which disabled itself while playing;
- Check in Hear and write.

A keyboard or screen-reader learner was sent back to "Skip to content" after every question. Focus now moves to what comes next:

- after Check: Next question;
- on a new question: its heading;
- at the end: the result's heading;
- after the last line or judgement: the answer or the score;
- in the English rounds: Next, then the new round's Play button, then the score.

The Play button stays focusable while it plays (`aria-disabled`, and a second press is ignored).

`tests/labs-focus.test.js` (new; in `test:all`, and `npm run test:labsfocus`) walks a lesson and its practice in each Lab, an English rule lesson and a sound lesson, pressing what a child presses. It fails on any press that leaves focus on nothing, and pins where focus goes. Against the previous code it fails 11 of 12 checks; it now passes 14 / 0.

**Also fixed:**

- **A practice paper handed in early** said "You finished it. Keep going!" after 1 of 40 questions. It now says "Handed in after 1 of 40". Time running out is not counted as handing in early.
- **"Time on task"** reads seconds under a minute: two seconds no longer reads "1 min".
- **On a phone, the Lab's tabs were six bare icons.** Each now has its word under it (Home, Map, Courses, Certificates, Progress, Exams).
- **The map's stats strip cut the level to "Appre…".** On narrow screens the level gets the room the three numbers do not use.
- **"Hear the difference" showed 1 of 8 in the green "well done" box.** Under 6 it is the "keep going" box.
- **A marked answer box looked live.** It now looks settled, its text kept at full contrast, and the − and . keys are not drawn once they cannot act (the daily problem's "Over for today").

Checked and NOT faults: the start-up splash in the e2e screenshots is its 0.5 s fade caught mid-way, and the Explore step's Continue drawn over the sliders is an artefact of a full-page screenshot of a sticky bar. The daily problem shown (AAABBC, no two identical letters together) was brute-forced: 10, as the Lab says.

### 13 November 2026 — Labs stop repeating themselves; registration and onboarding audit

**Repetition (owner: "Fix the repetition issue").** The Labs prevented a repeat inside one session but not across sessions. A member starting an English topic again met, on average, 61% of the questions they had just seen (63% with identical wording). 35 English topics repeated six to eight of eight. Physics repeated 21% and Maths 11%.

- **Memory.** `mlb_recent_seen($mid)` in `domain/mathslab.php` reads the member's last `MLB_RECENT_SESSIONS` (8) sessions in this Lab from `mlab_sessions.items`. `mlb_pick_fresh()` tries three tiers in order: avoid those eight sessions, then the last `MLB_RECENT_NEAR` (2), then only this session. A session is never shortened to avoid a repeat. The check, practice, mix, quick, review, boss and mini modes use it. The climb walks a topic in order, so it does not. The timed paper (`mlb_exam_pick`) rerolls a recent paper signature, except on its last try.
- **Content.** `domain/englishlab-more.php` (new, in the bootstrap list after `englishlab-drill`) adds two forms to each of 21 English topics, merged last in `eng_forms()` so earlier form order is unchanged. Every English topic now has at least 24 distinct questions, and the validator reports 0 problems.
- **Measured after:** Maths 0%, Physics 0%, English 4%. No topic repeats six or more of eight, no session is short, and no session repeats inside itself. `run.php` holds the promise for three topics in three Labs, for a thin topic, and for per-member and per-Lab isolation. A mutation check confirmed these tests fail without the memory.

**Registration and onboarding audit (owner: "Audit the registration and onboarding process").** Driven end to end in a browser: Club application, staff acceptance, both emails read from the mail sink, the welcome link opened on a phone, a password set, and the dashboard reached.

- **The welcome link left the new member on the public home page** after they set a password. `confirmReset` in `auth.jsx` now goes to the dashboard when a reset token signs somebody in from `/`.
- **The welcome email** (`admin_application_convert`):
  - It gave the internal record id (`NGG-2026-…`), where the card and every later screen show the printed number (`026-…`). It now gives the printed number.
  - It promised "start details shortly", which never came as such. It now names the centre and start date, and lists what happens next: set a password, pay the joining invoice, and the NGG Family app at /family for parents.
  - It now goes first. The invoice follows it, because the welcome is what introduces the invoice.
- **The invoice email called itself "Welcome to NGG — one step left"** and said again that the place was confirmed, so the family got two welcomes. It is "Joining invoice for <child>" now.
- **Application answers were lost to staff.** The vision, interests, areas of influence, where they heard of NGG, and the second guardian have no column on `members`. They stayed on the accepted application, and nothing linked the member to it. `admin.members.record` now returns `application` from `applications.convertedMemberId` (read-only). The record shows it under Overview → *In their own words* and Family & mentor → *Second parent or guardian*.
- **Summer School ID email** said "Student ID". It now says "Participant number" (§5 vocabulary).
- **Checked and fine:**
  - The profile drive asks nothing a Club application already answered: `profile_missing` is empty.
  - The start card shows the photo as done.
  - "Link a parent" stays, by design: a parent's email alone never links a child.
- **Not changed, and why:** applying sends three emails (the inbox notice to staff, the programme address, the family's acknowledgement), each to a different reader. Acceptance sends two, and they are now distinct.
- **Results:** `php api/tests/run.php` 7097 passed, 0 failed. Node suites, run one at a time, all pass: club-apply, membership-pay (36), mfa, shared-email, desk-signin, status-board, labs-client, labs-focus, mathlab-e2e (113), study-tools, ui-smoke (627) and forms-selfreg-ui.

## 17 Nov 2026 — Maths Lab: the length tell (Labs audit round 9)

The third Lab after English (round 7) and Physics (round 8). 57 Maths forms let a guesser win by picking the
longest option; all rewritten (wrong-option text only, plus six deliberate right-answer rewordings), and the
"Why is line k true?" generator evens its option lengths deterministically. Details, numbers and the saved-session
check in `docs/LABS-AUDIT.md` round 9. PHP suite 7166 / 0 (baseline 7161 / 0; five new checks).

## 17 Nov 2026 — Branch audit: two branches brought in

Owner: "Check all recent branches." Every remote branch updated since late October was compared with this one.

- **`claude/magical-fermi-d97fqw`** (16 Nov), built on this branch, 6 commits not merged here: the standard exam
  in every Lab, pay ahead by the term, course/division matching fixes. **Merged** (only generated `dist/`
  conflicted; rebuilt). Its browser suites had never been run: `mathlab-e2e` failed 6 checks that pinned the old
  card count on the Exams pages; they now pin "the Lab's own papers plus the Standard exam, no other Lab's"
  (122 / 0). Its HANDOFF-NEXT-AGENT.md (the standard exam, in progress) is now this branch's.
- **`claude/stoic-hamilton-1f18hh`** (14 Nov) is a separate history frozen at 31 Oct — merging it would delete
  ~100,000 lines — with 8 commits on top: the assignments audit of 2 November. **Ported** as a patch: the daily
  due-tomorrow/overdue reminder, `assignment_notices` (re-publish tells only the untold), a lesson's homework
  issued once (`assignments.autoKey`), centre scope however typed, MySQL widths, the merge policy, the classic
  dashboard's hand-in panel. Its migrations 216/217 collided with this branch's, so they are **234 and 235**
  here (target 235; MySQL mirror and `NGG_MYSQL_ROW_FIXUPS` comment renumbered; the audit doc says 234/235).
- Older branches (vibrant-cray, community-audit, gate-lookup, codex/english-lab-gods, the August audits): their
  work is already here.

Results: PHP 7239 / 0 (+28 ported checks); assign-desk 34 / 0; mathlab-e2e 122 / 0; build.test 31 / 0;
labs-client 28 / 0.

## 17 Nov 2026 — Labs standard exam: blueprint, exam hall, report (handoff TODO 1–3)

Continuing the magical-fermi handoff.
- **1 · Blueprint and difficulty** (`3f102326`): `mlb_exam_quota` gives each strand its share (Maths: the
  syllabus's sections; elsewhere an even share), `MLB_EXAM_MIX` 20/45/35 by a topic's rank inside its
  strand, short cells made up from the harder side. Measured: Maths 24/42/34, Physics 16/48/36; English is
  80 questions on 80 topics, so its mix cannot be steered. No exam body publishes per-topic counts (searched);
  the weights are the syllabus's and the code says so.
- **2 · Exam hall** (`9cdd6b28`): `MlbExamHall` — navigator, flags, answers changed or cleared until
  hand-in, a hand-in that names unanswered/flagged, A–E / arrows / F. Server: exam-mode answers replace
  earlier ones and an empty answer clears; other modes stay one-shot; nothing marked is returned mid-paper.
- **3 · Report** (`63e5f88e`): `mlb_exam_insights` — what to study (weak areas' missed topics as lesson
  links), pace, last paper, predicted grade (standard exam, last three, called an estimate).
- **Still open:** TODO 4, the licence-gated slot for real past questions (stays off until a licence is
  recorded). Not started.
- Results: PHP 7251/0; mathlab-e2e 135/0 (desktop and phone); labs-focus 14/0 (its copied exam block
  was still pinning the pre-merge card count, now re-pinned).

Also: `docs/CODEX-TEST-BRIEF.md` — standing instructions for a Codex session that runs and broadens the
suites continuously on `codex/continuous-tests` and logs product defects in `docs/TEST-DEFECTS.md`
instead of fixing them.

## 17 Nov 2026 — The NGG shop: the pages (branch `claude/ngg-shop-pages`)

Owner, 17 Nov 2026: "Create a shop for NGG. To sell souvenirs and mercs". The server came in `d0f498fa`
(domain/shop.php, migration 237); this branch adds the pages and changes the server only where noted.
- **`/shop`** (`page-shop.jsx`, ROUTES `shop`, indexable): catalogue, category filter in the URL, cart kept in
  localStorage, checkout, and the server's quote (items, delivery, Paystack's charge, total) shown before Pay.
  Hands off only to `checkout.paystack.com` (`nggPaystackUrlOk`).
- **`/shop/order/<token>`** (ROUTES `shop-order`, noindex, not addressable; `pageFromPath` and `spa.php` both
  know it): the return page. It has the server confirm the payment with Paystack, and shows the order number
  and what happens next.
- **Control Room → Shop** (`cr-tab-shop.jsx`, one entry in `CR_PAGES`, People group): Orders (`fees`),
  Products (`content`), Settings (`fees`). The bulk steps use the v2 table bulk, not `runAdminAction`: the
  latter answers through the v1 toast and dialog, which the v2 shell does not draw. Each order still gets its
  own verdict from the server, and a partial run is reported as partial.
- Server changes, each with a check: checkout terms carry `maxLines`/`maxQty`; admin ops carry `bounds`/`max`
  (`SHOP_STOCK_MAX` and `SHOP_DELIVERY_FEE_MAX` are now named constants); the buyer email's lines table has no
  inline style; spa.php serves an order link as its own noindex page.
- `tests/shop.test.js` (in `test:all`) mocks Paystack through the existing `$GLOBALS['__paystack_mock']` seam,
  loaded with `php -d auto_prepend_file`.
- **dist/ was not rebuilt here.** esbuild was not installed in the environment. Run `node build.js` and commit
  dist/ before deploying.

## 17 Nov 2026 — Shop upgrade researched, then stopped for a handoff

The owner asked for a massive upgrade of the shop management in NGG and in Africa GATES, with research.
Africa GATES was attached to this session and its latest branch (`claude/ai-assistance-judges-features-1ka4oz`)
cloned. Two pieces of work were completed:
- **Research:** shop management for a small volunteer team — inventory ledger, fulfilment, Paystack
  refunds, POS, reports, Nigeria-specific points, and a "do not build" list.
- **Audit:** of the Africa GATES shop.

The owner then said: "Create a handoff for a new agent to continue. Stop!" No upgrade code was written in
either repository. The Africa GATES worker was stopped before it committed anything, and its branch was
never pushed.

Everything needed to continue is in two places:
- `docs/SHOP-MANAGEMENT-PLAN.md`: the research, NGG's build order, the Africa GATES audit and build order,
  and the environment notes.
- `HANDOFF-NEXT-AGENT.md`: every open thread, including online membership (the owner's new pricing:
  no yearly fee, $10 with a mentor, $5 a course with an instructor) and the Labs exam licence slot.

## 18 Nov 2026 — Outstanding balances as images, PDF and CSV

The owner asked to download fines and dues "like this" (three phone screenshots of an "Outstanding balances"
sheet), as images, PDF and CSV.
- **Money → Dues & arrears → Download balances** (`crMoBalances` in `cr-tab-money.jsx`): a form picks the format
  (Images, PDF, CSV) and, with more than one centre owing, a centre. It fetches the whole arrears list
  (`admin.fees.arrears`, limit 1000), not the drawn page.
- One drawing, `crBalDraw`, on a canvas in the self-hosted Geist (its latin-ext file carries ₦), feeds both the
  PNG parts (2×) and the PDF (jsPDF, A4, 3×), so the posted image and the printed page cannot differ. Fifteen
  rows a part, largest payable first; "Days" is `daysOverdue`; Dues = payable − fines, split in the CSV.
- `tests/balances-export.test.js` (`npm run test:balances`, in `test:all`): 32 members owing over two centres;
  checks the three PNGs, the three-page A4 PDF, the CSV rows and sums, the centre filter, and that a centre
  name is drawn whole (it failed with the first, too-narrow column, and the check was proven against it).

## 2026-11-18 — Shop management upgrade (NGG)

Owner, 17 Nov: *"Upgrade the shop massively … for better and effective management. Research!"* Built from
`docs/SHOP-MANAGEMENT-PLAN.md` §2, all ten items. Server: `api/_lib/domain/shop-manage.php` (new, in the bootstrap
list) and `shop.php`; migration **238**; Control Room: `cr-tab-shop.jsx` (eight tabs: Today, Orders, Sell, Stock,
Products, Codes, Reports, Settings); public: `page-shop.jsx`.

- **Stock ledger** (`shop_stock_moves`): every count change is a reason-coded row with who and when; the count is the
  running result (tests assert sum of rows = count). The product form writes `correction`/`received`; hand
  adjustments; stock-take validated whole. Counts may go below nought (table sales are never stalled); the public
  shop clamps to nought (`shop_stock` vs `shop_stock_raw`). Column names avoid MySQL reserved words
  (`variant`, `byId`, `openingFloat`).
- **Low stock**: `lowStock` per product (-1 = the shop default), panel, daily digest (webcron job `shop`).
- **Refunds** (`shop_refunds`): Paystack `POST /refund` in kobo; pending until Paystack's own `GET /refund/:id` says
  processed/failed — from the signed `refund.*` webhook (`api/hooks/paystack.php`), "Check now", or the hourly
  sweep. The body of a webhook is never trusted alone (as with charges). "Paid outside" refunds are processed at
  once. Cap = what was charged (goods + delivery + the buyer-borne fee); suggestion = goods + delivery. Restock at
  refund time. `refundState`: '' | due | pending | partial | full. Cancelling a paid order can refund in one step.
- **Pickup code**: six digits at payment for collections; `Collected` needs it or a reason (override on the
  timeline). Bulk "Mark completed" became "Mark delivered" (collections are refused per row, by design).
- **Unpaid orders**: expire after `expireHours` (24) as `cancelKind = 'expired'`; one reminder after 2 h; pay later
  from the order link (`public.shop.order.pay`, a fresh `NGGS-` reference each time — an older checkout still pays,
  matched by metadata orderId). A payment arriving for an *expired* order revives it; a *staff*-cancelled one stays
  cancelled and the money goes to unapplied_payments.
- **Table sales** (`channel = 'pos'`, `payMethod` cash/transfer/pos) and **cash sessions** (`shop_cash_sessions`;
  in `CENTRE_NAME_TABLES` and `CAC_CENTRE_NAMED_BY`). Cash needs an open session; closing keeps the difference and
  needs a reason when not zero.
- **Reports**: today's numbers; gross / buyer-borne fees / Paystack's fees **as reported** (`gatewayFee`, from
  verify `fees`) / refunds / net; by product and size, method, channel, day; sell-through; stock value; CSV.
- **Codes** (`shop_codes`) and **pre-orders** (`preorderUntil`). Order **timeline** (`shop_order_events`) replaces
  appending to `note`; old notes still show. **Exchanges** split a line at the price charged. The orders list is
  paged on the server with a date range and channel filter.
- Buyer-facing label "Paystack's charge — not an NGG fee" renamed **"Payment processing fee — Charged by our payment
  provider"** (shop, membership invoice page, receipt; provider-neutral, as more providers are coming), at the owner's request.

Tests: PHP suite 7330/0 (baseline 7283) — 47 new `shop ledger/low stock/codes/pickup/refunds/unpaid/pre-order/
table/exchange/order/lists/report/export/wiring` checks; `tests/shop.test.js` extended to refunds, the till,
sessions, stock-take, codes and reports. HawkScan not run (no `HAWK_API_KEY` here).

Not built (the plan's "do not build" list, and items outside §2): delivery zones, member price, bundles, VAT line.
Unconfirmed with Paystack: whether bank-transfer/USSD payments refund automatically — a failed refund says so and
staff pay it back another way.

## 18 Nov 2026 — Photo quality gate; the Membership Agreement signed online

Owner: "NGG registration and onboarding is flawed. Research. We do not take low quality images!", then "Go,
build the photo gate … photos are also served by S3-compatible storage … add this MoU … parents must read and
do a very short not-frustrating quiz … refine the MoU, make it standard and professional … merge it with the
consent features … a copy would always be emailed … whatever clashes between the MoU and website, let the
website win."

- **Photo gate** (`domain/photo-quality.php`, `photoQa*` in components.jsx; `docs/PHOTO_QUALITY.md`). The apply
  form used to warn about blur, measured on a 90 × 120 thumbnail, and enlarged a 320 px photo to 600 × 800. Now
  every problem is a refusal, measured at full size, in the browser and again on the server wherever the photo
  lives (inline, local store, S3-compatible bucket, Cloudinary). The PHP suite turns the gate off as a fixture
  for the suites that post placeholder photos, and proves it in its own section. `tests/_photo.js` draws a
  portrait-like test photo for the browser suites.
- **Membership Agreement** (`domain/mou.php`, migration 239, `page-mou.jsx` in the signed-in bundle, Members →
  Agreements in `cr-tab-registration.jsx`). The paper MoU rewritten in plain English (13 clauses; obvious
  errors corrected; "Talent management" appeared twice and is once). Money is read from the fee settings and
  frozen (`termsJson`); early termination follows the website's training-place write-down, with the handbook's
  three months' notice and ₦30,000 inconvenience fee. The handbook's "₦300,000 per remaining year, inflation
  adjusted" is NOT used: the website's training figure and basis win (owner's rule). Signatures are PNG data URLs
  on the row; links are stored as hashes. `tests/mou-sign.test.js` (19 checks) and 25 PHP checks.
- Migration numbering: a parallel session's shop management took 238 on the same branch; the MoU is 239.

## 18 Nov 2026 — Receipts drawn on the server (PDF and PNG)

Owner: "Make receipts downloadable as PDF and image with server drawing instead of browser."
- `domain/receipt-draw.php`: ONE GD drawing of the frozen receipt (doc_data / doc_org_for — the same data as
  doc_render_receipt) at 2× A4. The PNG is that drawing cropped to the receipt; the PDF is the same drawing on an
  A4 page, written by a ~40-line PDF 1.4 writer (catalog, page, DCTDecode image, UTF-16 metadata, xref). No
  library, no headless browser.
- Font: Inter (OFL, the site's body font), in `api/_lib/fonts` (blocked from the web by api/.htaccess). The
  vendored Liberation Sans had neither ₦ nor ẹ/ọ/ṣ. Text is NFC-normalised; a tone mark with no precomposed letter
  (ọ̀) is placed over its letter, because GD does not shape text.
- Routes: `document.php?t=…&as=pdf|png` and `receipt.php?t=…&as=pdf|png` (the email link). Buttons on the receipt
  page, the payment page, the receipt email and Money → Membership payments.
- Tests: 7 PHP checks; `tests/receipt-download.test.js` (7, through the routes).

## 18 Nov 2026 — Low-end performance: three bundles, slim public CSS, lazy libraries

Owner: "fix the NGG site constantly lagging … must work perfectly on low-end devices … too heavy … Research! How
does Canva do? How do games do it?" Research and the numbers are in `docs/PERFORMANCE.md`.
- A third bundle, `app-study` (Labs, tools, timetable, Learn, chess engine, lesson blocks): build.js STUDY,
  app.jsx NGG_STUDY_ROUTES + nggNeedStudy; the signed-in bundle loads it too. bundle-split.test.js extended.
- `tools/css-split.js`: public pages get the rules their sources use; the full styles-app.css is swapped in by
  nggMoreCss() with the signed-in bundle. Phosphor CSS trimmed to the icons named in source.
- TanStack Table and jsQR load on demand; the 1080 px logo is now 512 px (9.5 KB), `logo-1080.png` kept for print;
  the service worker precaches the slim sheet; Lite mode adds content-visibility on sections.
- Home page on an emulated low-end phone: 24.4 s → 16.4 s ready, 4.87 → 3.0 MB.

## 2026-11-18 — Dead code removed, and kept out

Owner: "Remove everything that is irrelevant", then "Please create a test for that".

- `tools/dead-code.js` reads every shipped file's top-level declarations with the vendored Babel parser
  and flags any name that appears nowhere else in the product (code, PHP, HTML, CSS, tests; docs do not
  count). It also flags self-hosted font files that nothing names. `node tools/dead-code.js --prune`
  removes what it finds, re-parsing each file before writing.
- Removed: ~1,000 lines of retired Control Room panels in `page-admin.jsx` (AdminPhotos, AdminRequests,
  AdminStaff, AdminApprovals, AdminBehaviour, AdminAttendanceDuty, AdminContact, AdminStatus,
  AdminComments, AdminNewsletter, AdminEvents, CheckinDesks and their helpers), 22 smaller orphans in
  other files, and 7 unused report fonts.
- `tests/dead-code.test.js` (`npm run test:deadcode`, in `test:all`) fails the build when dead code or an
  orphan font comes back.
- Kept on purpose, because only a test still uses them: AdminAssessment, AdminTournaments,
  idsCardsInRange, idsStock. Removing them means deleting their tests too, so that is the owner's call.

## 2026-11-18 — NGG entry steps, the resumption day, follow-ups, the paper MoU

Owner's paper card *NGG ENTRY STEPS* became the registration checklist's structure (docs/ENTRY-STEPS.md):

- Items are grouped by step (`RCL_STEPS`: orientation, payment, documents, online, ID card). Migration 240 adds
  `reg_checklist_items.step` and three default items: Orientation attended, File handed in, Latest school report card.
- New automatic item **School timetable on the site** (member_timetables, lessons on ≥3 weekdays).
- **Resumption = completion.** `reg_checklists.resumedOn` is written the day the last item is done, once; the family,
  member and supervisor are told. Not the day the member was accepted.
- **Follow-ups.** Family reminders on day 1/3/7 then weekly, phrased as what to bring and where; a follow-up log
  (`reg_checklist_followups`) with a required next date; supervisor told when one falls due; centre staff told when a
  registration stalls 14 days. List filter *Needs a follow-up*.
- **The MoU is printed, signed in ink and brought to the centre.** `admin.mou.paper` records the checked copy and a
  readable photograph of the signed page (≥1600 × 1000, read from the file); countersign is refused until then
  (`paper_first`); the checklist item needs both. A paper-only family is supported (`signedVia = 'paper'`).
  `NGGApi.uploadDocumentPhoto` keeps the photo at 2000px even without a cloud (the headshot fallback is 1000px).

## 2026-11-19 — Personal timetable first ("My week"); the agreement as a standard document

- Owner: "The timetable is also pretty complicated for kids … Personal timetable first!" New guided flow
  `src/modules/timetable/tt-myweek.jsx` (STUDY bundle): school as one block, the child's own things by tapping,
  their NGG sessions pre-ticked, a day-by-day check with overlaps in words. It writes the maker's own document
  (member_timetables) and replaces only what it made (ids `mw…`) and the NGG sessions. `TimetableMakerPage` routes:
  ?easy=1 → My week; ?full=1, links and a browser copy → the maker; a signed-in member with nothing saved → My week.
  The first-visit check is read on the first render (the router rewrites /timetable/me before the maker mounts).
  Tests: tests/timetable-myweek.test.js (`npm run test:myweek`, in test:all).
- The registration item became **Personal timetable on the site**: school on ≥3 weekdays AND one thing of the
  child's own (study/activity, not an NGG session) — `rcl_timetable_own`.
- The Membership Agreement prints as a standard agreement (assets/report/mou.css; `mou_execution_html`).
- Known, not caused here: six PHP checks (rulebook ×4, labs quick check, maths lab mini review) fail when the suite
  runs after midnight Lagos time (UTC 23:00–24:00); they fail on the committed code too.

## 2026-11-19 — WhatsApp replies that act (registration)

Owner: "Make + Kapso for WhatsApp onboarding … people could also respond … instead of relying on humans". Built on
the existing Kapso integration (domain/kapso.php), not through Make: the site already decides who to remind and when.
- `kapso_send_buttons`: interactive reply buttons in the 24-hour window; outside it the optional `reply_template`
  (quick replies carrying `rcl:<memberId>:sat|next|help`), else the plain template with "Reply 1, 2 or 3".
- `rcl_wa_remind` sends each family reminder stage on WhatsApp too (claimed once per stage per number).
- `rcl_wa_inbound` (called by `kapso_receive` before the inbox): dates → follow-up + next date; help → staff + helper;
  photo → kept via `photo_store_put` and recorded as a `family_sent` submission; STOP/START → `whatsapp_optout`
  (migration 241). A button for a child is honoured only from a number that child's reminder went to.
- Tests: PHP "whatsapp ·" (13), each core rule proven to fail when removed.

## 2026-11-19 — Homework that gets done: the marking prompt, returned work stays open, families see it

Merged afv/brave-faraday-pdlh7o (it already carried this branch's 2 November audit as patch 92668895; every conflict
took its version). Then three changes, migration **242** (`assignment_submissions.resubmitBy`, `.markMinutes`,
index on status):
- **Marking prompt.** `assignment_marking_queue($g)` — submitted hand-ins the marker may open, checked exactly as
  `staff_assignment_submission_gate` does (can-mark + member centre in reach), one query. `instructor_today` adds
  the `handins` row ("N hand-ins to mark — oldest X days"; danger at `ASG_MARK_URGENT_DAYS` = 7), so the duty
  pop-up and the daily email carry it; `duty_tell_handins_lead` nudges the centre's lead mentor once per oldest
  hand-in. Time-to-mark: `markMinutes` written on grade and return; `admin_assignment_time_to_mark()` on the
  overview (median, p90 hours, 90 days). The ip6 duty button opens Assignments.
- **Returned is open.** `assignment_sub_open()` is the one definition; `sub_ids_for()` excludes returned (the
  first-publish notice passes `$withReturned`). Return takes `resubmitBy` (default `ASG_RESUBMIT_DAYS` = 3,
  refused if past). member_today lists it ("Revise and hand in again"), `assignment_due_reminders` reminds it under
  `rs_soon:`/`rs_over:` + date (assignment_notices.kind is VARCHAR(16)). `assign_due` is hourly now (claims make it
  idempotent; needed so a family message held by quiet hours goes at 07:00, not 24 hours later).
- **Families.** `family_homework()` inside `family_ward()` (so only through the guardian's own active link):
  due this week or still owed, state, mark and feedback once marked, never the answer. `assignment_tell_family()`
  at the overdue stage: claim `family` per assignment per child; guardians taking alerts get inbox + email,
  `rcl_wa_phones()` via `sms_send` (WhatsApp first, SMS fallback); parentEmail only when no guardian took it;
  never between 21:00 and 07:00 Lagos (no claim taken). The duties email's week-old copy to parentEmail skips
  homework already sent this way.
- Deliberately unchanged: the evidence fine (`policy_evidence_fines_run`) still counts a returned hand-in as
  evidence uploaded — fining a child for work a marker sent back is a policy question, not a counting one.
- Tests: PHP "homework 7/8/9" (29 checks); reach scoping, returned-is-open (sub_ids_for and Today), guardian
  scoping, once-only and quiet hours each mutated and seen to fail.

## 2026-11-19 — Instalment plans (schema 242, `domain/fee-plans.php`)

Owner's brief: a parent sets up a plan in the family app (Fees → Set up a
payment plan: 2–6 instalments, weekly / every two weeks / monthly, exact dates
and amounts shown, terms read, name typed, box ticked); staff can set one up
for a parent who agreed by phone, in person or in writing and must say which;
**the plan must be approved**; the admin sets the longest time frame.

- **Pending until approved.** Both doors write a `pending` plan through one
  writer (`fee_plan_create`); `admin.fees.plan.decide` (cap `fees`,
  compare-and-set) approves or declines with a reason, and the family is told
  in their notices. A staff-created plan waits for approval too.
- **The server works out the schedule** (`fee_plan_schedule`): equal parts,
  the odd naira on the LAST instalment, monthly keeps the day of the month
  clamped to the month's end. `planMaxDays` (fees settings, 14–365, default
  120, Control Room → Money → Amounts → Instalment plans) is enforced on the
  server, first instalment to last, whoever sets the plan up.
- **What counts**: every live `payment` credit after the plan was set up,
  oldest instalment first. There is no plan-specific payment — the desk records
  money exactly as before. The plan's total is what was owed the day it was set
  up; new dues during it are charged as normal and are not part of it. A plan
  completes on its own when the payments reach the total (on read, no cron).
- `fee_plans` is `BLOCK` in the merge policy (money).
- Surfaces: family app Fees → "Payment plan" card (`Fp3Plan`); Control Room →
  Money → Who owes ("Payment plans" table) and each account ("Payment plan",
  with "Set up a plan"). Tests: the "plans:" group in `api/tests/run.php`.
- Not done: reminders still run during a plan as before, and a missed
  instalment does not end a plan by itself — staff end it with a reason.
- **Fair for everyone (owner, 19 Nov):** instalments are equal to the naira —
  the odd naira go one each to the last instalments, so none differs by more
  than ₦1 — and a plan approved after its first date is re-dated from the
  approval day, so nobody is overdue before NGG says yes. No interest or
  charge for paying by plan; the terms say so.
## 19 Nov 2026 — Parents pay the balance in instalments, with follow-ups

The owner asked whether parents can pay their fines and dues in instalments. They could pay, but only the
whole balance. Online they had no way to pay part of it; only the desk could record a part payment.

**What was built**
- **A part invoice.** `membership_part_invoice()` in `domain/membership-pay.php` makes a
  `membership_invoices` row with purpose `part`, for an amount the family chooses: from `MPAY_PART_MIN`
  (₦1,000) up to the whole payable.
  - It reuses everything a balance invoice uses: the /pay page, the Paystack check (exact amount, currency
    and invoice), `membership_settle` (which posts only the payment, noted *Part payment*), the numbered
    receipt, and a bank-transfer claim checked by the desk.
  - Only one payment is asked for at a time. A part, a full balance or a pay-ahead invoice replaces the
    open one.
  - A balance under twice the minimum is not split (`part_not_allowed`).
  - The amount is validated on the server: below the minimum, above the balance, or not a whole number
    is refused, with a sentence saying why.
- **Unlike a balance invoice, a part invoice does not go stale when the balance rises.** It was never a
  quote of the whole. If the balance falls below the instalment's amount, checkout voids it
  (`part_exceeds_balance`, with today's figure), so nobody can overpay through it.
- **Ops.** `family.fees.pay` and `member.fees.pay` take an optional `amount`. `api/family/pay.php` passes
  it and now returns the refusal's detail. `family_fees_view` sends `partMin` (0 means pay in full).
- **Family app.** *Fees → Pay* asks **All of it, ₦N** or **Part of it**. *Part of it* shows an amount
  field and lines for owed today, this instalment and left after it. The design source
  (`family-portal-v3.dc.html`) has the new block and was recompiled with `tools/dc-compile.js`.
  The /pay page has an instalment title, a note and its own void message.
- **Follow-ups.**
  - The receipt says what is still owed and that it can be paid in more instalments.
  - The balance reminder (`fees_reminder_candidates`) skips a family that paid an instalment within the
    reminder interval, so the follow-up runs from their payment. The skip is named `paidRecently`, and
    the Control Room's preview lists it.
  - Every reminder now says the family can choose *Part of it*.

**Not built, on purpose: choosing which charge to pay.** The owner asked whether a family could pick what
to pay: dues, fines and so on. Payments are one pooled credit that pays off charges oldest first
(`fees_charges_left`). Every statement, report, clearance and conduct read is built on that. Ear-marking
money for fines would change the accounting for all of them, and an instalment labelled "fines" that the
allocator spent on older dues would mislead the family. The sheet shows what is owed, line by line, and
the family chooses how much.

**Verification**
- `php -l` passes on every changed PHP file, and `node build.js` builds.
- `api/tests/run.php` has a new block, *Paying the balance in instalments*, with 14 checks.
- **Not run in this session:** a plugin added mid-session refuses any shell command that names a file
  holding the organisation's contact address, which includes `api/tests/run.php` and most browser
  suites. The PHP suite and the browser suites must be run before release.

## 19 Nov 2026 (later) — CI; instalment plans with tracking; instructor management

**CI (`.github/workflows/checks.yml`).** The owner has no shell, and this session's container refuses to
run `api/tests/run.php` (see above). GitHub Actions now runs on every push:
- the build, `build.test.js` and `no-important.test.js`;
- the PHP suite, on SQLite (it writes its own config; no secrets needed);
- Chromium, then the route registry suite.

The PHP step prints only failures and totals, because the runner has no mail transport and stderr is noise.
`package-lock.json` is ignored, so it uses `npm install`. Adding more browser suites is a matter of adding steps.

**Instalment plans (owner: "a proper tracking and accountability feature for the installments").**
`domain/payment-plans.php` and migration 238 add three tables:
- `payment_plans`: the agreement. Who agreed, when, the terms version, the source (family or staff),
  and `startPaid`, the payments on the account when it began.
- `payment_plan_items`: the dated instalments.
- `payment_plan_events`: the accountability log. Created, reminded, missed, paid, broken, completed,
  cancelled, note.

How it behaves:
- **Progress is never stored.** It is `min(total − payments since the start, payable today)`, laid over
  the instalments in order, so a desk payment or a waiver moves a plan exactly as an online payment does.
- **Health** is on track, behind, broken (more than `PLAN_GRACE_DAYS` = 14 days late), completed or
  cancelled.
- **Reminders.** `plan_reminders_run` runs from `dues_notices_run` (new notice kinds `plan_due`,
  `plan_late`, `plan_broken`, `plan_ended`). A kept plan excuses the family from the arrears reminder
  (`onPlan`).
- **Ops.**
  - Family: `family.payplan.quote|create|pay` through `api/family/account.php`. The name avoids the
    existing `family.plan.sign`, which is the school-results plan.
  - Staff: `admin.payplans.list|get|for|create|cancel|note` (`fees`, centre-scoped), at
    `api/admin/payplans.php`.
- **Screens.**
  - Control Room: Money → Instalment plans.
  - Family app: the plan card, the offer, and the set-up sheet. These are in `family-portal-v3.dc.html`,
    recompiled.
- **Paying an instalment.** "Pay this instalment" makes a `part` invoice tagged `plan:<id>`, exempt from
  the ₦1,000 minimum because the amount is the agreed one.
- **Merge policy:** both tables are BLOCK.
- **The member route stays as it was:** a member-side op never carries an amount
  (the existing READ-ONLY test).

**Instructor management (owner: "ent-grade people and Instructor management").**
`domain/instructor-admin.php` and migration 239 build on the existing data:
- **Volunteer rows** gain leave (from, until, reason), offboarding (when, by whom, why), the safeguarding
  check date and expiry, and a review date.
- **`people_notes`** is a person's record (`subjectType` `volunteer` for now; it is built to take other
  kinds of person).
- **The roster** is read in a fixed number of grouped queries: volunteers, timetable slots
  (`instructorId` = volunteerId), filed sessions (`club_class_sessions.instructorId` = the member
  account), and Academy passes (`instr_academy_done`, which applies the renewal rule).
- **Issues are derived:** safeguarding pending, expired or expiring; Academy; no account; no classes; not
  filing; review overdue.
- **Ops.** `admin.instructors.list|get|update|leave|offboard|reinstate|note` (`people`, scoped by the
  volunteer's centre), at `api/admin/instructors.php`.
- **Screen:** Mentors & volunteers → Instructors.
- **Offboarding** archives the volunteer (every portal gate reads status `active`) and clears their
  timetable slots for cover, in one transaction.
- **A course still taught on the timetable cannot be removed.**
- **The progress cell** in `cr-blocks.jsx` takes an optional `tone`, so an on-time plan at 25% is not
  drawn as low (CONTRACT.md).

**Not built, said so:**
- Paying a chosen charge (dues or fines) separately. The ledger is one pool, oldest charges first.
- Management of staff and mentors beyond what exists. `people_notes` and the screen pattern are ready
  for them, but only instructors use them today.

**Verification**
- Browser probes, driven in this container with real cookies and a real PHP server:
  - plans: 16 checks, covering a parent setting a plan up, a desk payment moving it, and staff listing,
    opening, noting and ending it;
  - instructors: 10 checks, covering the figures, the filters, the drawer, leave with cover named, a
    note, and offboarding with the class handed back.
  - No page errors in either.
- PHP checks for both are in `run.php` and run in CI.

## 2026-11-19 — one plan system: payment-plans, with approval and the fairness rules

Two sessions built instalment plans the same afternoon (`domain/payment-plans.php`
from the finme session, `domain/fee-plans.php` from this one). Merged into ONE:
finme's (reminders, grace, the event record, paying an instalment online) is
kept, and `fee-plans.php` and its table are gone (its migration number 242 now
belongs to the assignments change). The owner's rules were moved into it:

- **Every plan waits for approval** (`status = 'pending'`, health `pending`):
  nothing is payable, late or reminded on it until `admin.payplans.decide`
  (cap `fees`, compare-and-set) approves it; a decline needs a sentence the
  family reads (`plan_approved` / `plan_declined` notices). Staff-made plans
  wait too. Control Room → Money → Instalment plans → "Waiting for approval".
- **Approved after its first date, a plan is re-dated** from the approval day
  — same amounts, same gaps — so nobody is late before NGG says yes.
- **The longest plan is the admin's** `planMaxDays` (fees settings, 14–365,
  default 183), Money → Amounts → Instalment plans; enforced on the server.
- **Fair to the naira:** no instalment differs from another by more than ₦1;
  the odd naira go one each to the first instalments.
- **No interest, no charge** for paying by plan — stated in the terms
  (version `2026-11b`).

Migrations after the three-way merge: 240–241 (registration steps, WhatsApp),
242 (assignments), 243 (payment plans), 244 (instructor management). A
database that ran the finme branch on its own has its plans tables already
(243 creates IF NOT EXISTS) but 244's `ALTER TABLE volunteers` will refuse a
duplicate column there — none is known to have been deployed.

## 19 Nov 2026 (latest) — Paying a chosen charge

The owner asked for this "only if you think it is cool". It is, for one concrete reason:
- A suspended child is let back in when the re-entry fine is marked paid, and unpaid fines freeze awards.
  `policy_fines_sync` decides "paid" from the ledger, which paid the oldest charges first.
- So a family paying exactly the re-entry fee while older dues were outstanding saw the money go to the old
  dues, and the child stayed out. The only fixes were a waiver, or clearing the whole balance.

**How it works.**
- **Migration 240.** `member_ledger.appliesTo` is a JSON list of the charge entryIds a credit names.
- **`fees_allocate()`** in `fees.php` is now THE allocator. It covers the named charges first (up to what
  each owes), then pours what is left, and every unnamed credit, oldest first.
- **Every reader uses it:** `fees_charges_left`, `fees_unpaid_of`, `fees_entry_left` (and so
  `policy_fines_sync`), and `fees_clear_unpaid_of`. They had four copies of the oldest-first loop, and
  now have one.
- **Totals cannot change.** The same money meets the same charges, so payable, outstanding, reports and
  statements' totals are identical. A test pins this.
- **`fees_post`** keeps only names that are this member's live charges. A foreign or unknown id is dropped
  and that money goes to the pool.

**Surfaces.**
- **Staff.** `admin.fees.payment` takes `appliesTo`. The Record a payment form has *What it pays
  (optional)*.
- **Families.** `family.fees.pay` takes `charges`, and `membership_charges_invoice` makes a `part` invoice
  with one line per charge (periodKey `charge:<entryId>`).
  - `membership_settle` posts the payment with `appliesTo` read from those lines.
  - Checkout withdraws the link (`charges_changed`) when a named charge now owes less than its line.
- **The family payload** carries `open` (charge by charge, from `fees_account_statement`). Each fine
  carries its sanction `id`, so "Pay this fine" finds its charge (`sanction-<id>`).
- **Family app.** The Pay sheet has a third mode, *Choose what to pay*, with tickable charges. Each unpaid
  fine has **Pay this fine**. The design source was recompiled.

**Verified.**
- `run.php`: *Paying a chosen charge*, 12 checks, run in CI.
- Browser probe: 8 checks. A parent pays a ₦2,000 re-entry fine ahead of ₦4,000 older dues; the fine is
  paid on the ledger and the conduct record; ₦4,000 is still owed; no page errors.
- The plans probe was re-run after the allocator change: 16/16.

## 21 Nov 2026 — Payments that went through and did not show

**Reported:** "Some payments do not reflect that they went through."

**Causes found, all three fixed.**
1. *The pay page offered Pay again for a payment still settling.* Back from Paystack before it reported
   `success` (transfer, USSD, a slow bank), `membership_paystack_verify` returned the open invoice and the
   page drew "Total to pay" and the Pay button. It also dropped `?reference=` from the address, so "refresh
   in a minute" asked nobody. Now `public.membership.pay.verify` returns `paystackStatus`
   (`paystack_settle_word`: paid | settling | failed). The page waits, re-asks every 10 s for 5 minutes, and
   keeps the reference until it settles. Only "I didn't finish paying" returns to the Pay button. The shop
   order page does the same.
2. *Nothing asked again when nobody came back.* Settlement depended on the browser or the webhook.
   `paystack_sweep()` (web-cron job `paystack`, every 10 min) re-verifies unsettled checkouts from 2 minutes
   to 48 hours old: every invoice checkout (from the `membership.paystack.init` audit rows, so an earlier
   tab counts), pending shop orders and pending donations. It runs through the same verify functions,
   newest first, at most 40 Paystack calls a run, with one audit event per run.
3. *An exact amount test.* Paystack's "pass charges to customer" adds its fee on top, and `!==` refused every
   such payment. `paystack_amount_ok()` accepts at most what Paystack can add (1.5% + ₦100, capped at
   ₦2,000). Anything else is still a mismatch for a person. The owner asked whether overpayment opens room
   for errors: open-ended "at least" would; this ceiling does not.

4. *A payment that did not go through left no trace.* The owner asked about these next. A Paystack
   `failed`/`reversed` answer is now audited once per checkout (`membership.paystack.failed`, with
   `gateway_response`). The staff invoice list shows the latest one on the open invoice, in one grouped
   query. The family's wording no longer claims "nothing was taken": a bank may debit and reverse.

5. *Smarter on a failure* (owner: "make it smarter"). `paystack_fail_kind()` sorts Paystack's
   `gateway_response` into funds | declined | card | technical | other. `paystack_fail_advice()` turns
   the kind into the family's next steps (a smaller amount or a transfer for funds; another card/USSD for
   a decline; check details; just retry). It names a route only where it exists. `paystack_rescue_failed()`
   (from the sweep) sends ONE email per invoice, at least 30 minutes after a failure, while the invoice is
   still open with no transfer waiting. It is claimed in the audit whether or not the mail went, so a
   broken mailer cannot send one a run. The staff row shows the kind and whether the family was emailed.

6. *Guards* (owner: "we need guards to avoid errors"). `paystack_http` keeps its last answer in
   `$GLOBALS['__paystack_last']`, and `paystack_answer_kind()` reads it as answered | unanswered |
   bad_key. The sweep stops after `PAYSTACK_SWEEP_BREAKER` (3) unanswered calls in a row, with an audit
   once an hour. On a refused key it stops at the first call and `paystack_key_alarm()` emails fees
   holders once per `PAYSTACK_KEY_ALERT_HOURS` (24). One run is held to `PAYSTACK_SWEEP_BUDGET` (20 s),
   shared with the follow-up emails, which are capped at `PAYSTACK_RESCUE_MAX` (20). No follow-up is sent
   during an outage, over a checkout started in the last half hour (retried on a later run), for an
   `advance` invoice, or to a member who has left. Settling twice was already prevented by the
   ledger's unique `(memberId, kind, periodKey)` and the conditional updates on shop orders and donations.

**Verified.** `run.php`: 32 new checks (settling, failed and its kinds, follow-up email, overpaid, sweep,
guards), run in CI. `node build.js` is clean.



## 2026-11-20 — The MySQL mirror applies on MySQL 8, and the PHP suite runs to the end there

`npm run test:mysql` stopped with a fatal at run.php ~706: applied to a fresh MySQL 8.0.46 database,
`db/schema-mysql.sql` failed 17 statements (MariaDB, where the mirror was last verified, accepts all of them).
- **Bare `rank`** (reserved since MySQL 8.0.2): `vol_tiers` CREATE and its seed INSERT, `ALTER TABLE mentors ADD
  COLUMN rank`, `idx_mentors_centre_rank`, `mentor_match_offers` CREATE and its `uq_moffer`. Backtick-quoted, never
  renamed. Code: `DB_RESERVED_COLUMNS` gains `rank` (db_insert/db_update quote it — mentor creation was a 1064 on
  MySQL 8), and four hand-written queries quote it (instructor.php staff list, mentoring_leads, mentor.php list,
  volunteer tiers); three test queries too.
- **TEXT/MEDIUMTEXT with a literal DEFAULT** (1101), which failed the whole CREATE: `courage_marks.evidence`,
  `member_promotions.evidence`, `admin_approvals.args`, `contact_replies.body`, `membership_invoices.items`,
  `photo_framing.geomJson`/`adjustJson`. Now `TEXT NULL` (the mirror's existing form); every writer supplies the
  value and every reader casts. The other 1146s were ALTERs/indexes on those absent tables. SQLite unchanged.
- Existing MySQL 8 deployments need nothing run by hand: the new hash makes the next request replay the mirror
  (docs/SETUP.md). Ladder untouched; NGG_SCHEMA_TARGET stays 242.
- Guards (run.php): the mirror has no unquoted MySQL 8 reserved word as a column / index / INSERT column and no
  TEXT/BLOB literal DEFAULT (the reserved list copied from INFORMATION_SCHEMA.KEYWORDS); no hand-written query in
  api/ names a DB_RESERVED_COLUMNS word bare. Both seen failing on the unfixed tree and self-tested on planted text.
- With the schema in, the suite ran on and found, each fixed: a fresh MySQL install ran the one-time centres
  split (the seeded NGG Online row counted as "data") and created Egbeda/Ayobo NGG-only — the online centre is no
  longer counted; `UPDATE mentor_tasks … WHERE id = (SELECT … FROM mentor_tasks …)` is error 1093 on MySQL
  (`ms_task_close_earliest`, two sites); `policy_relift` judged a re-entry fee before its suspension when InnoDB
  returned rows by index, so voiding an absence left the ₦5,000 fee owed (suspensions now first); `sort()` on an
  unset session in the half-day pairing crashed the fresh-start preview (both drivers). Test-only: formation 213
  runs the MySQL fixups on MySQL, the ledger index check reads information_schema, a fixture wrote a 26-character
  division name where every writer stores the id.
- Still flaky, not fixed: "…and appears under recently finished" (12 games completed in one second, `ORDER BY
  updatedAt LIMIT 10`, random matchId tie order on MySQL), and clock-dependent checks (homework 9, walk, maths lab
  mini review, rulebook, punctuality) that fail on clean HEAD too depending on the hour.

## 21 Nov 2026 — Other sessions' work merged; NGG Online phases 2, 3, 5 and 6

**Merged** `afv/brave-faraday-pdlh7o` and `claude/stoic-hamilton-1f18hh` into this branch. They hold shop
management, the Membership Agreement, entry steps, homework, instalment approval and the MySQL 8 fixes.
- `community-audit-1aqug7` was not merged: it is an older form of the Wi-Fi work already here.
- `vibrant-cray-3gmdum` was not merged: it is a change followed by its own revert.

**Migrations.** Both lines used 238–240.
- This ladder keeps brave-faraday's 238–244.
- The finme line's appliesTo is renumbered to **245**.
- **246** replays 238–244 for a database built from a finme zip. Such a database stands at 240 and would
  otherwise never get the shop, agreement or entry-step tables. Every replayed statement tolerates being
  already applied.
- **247** adds `online_session_joins`.

**NGG Online** (docs/ONLINE-MEMBERS-PLAN.md, "Built"):
- `domain/online.php`: the offer, the session window and Join (attendance), pairing through
  `admin_assign_mentor`, the staff overview, and the settings.
- Money in `fees.php`: `fees_member_monthly`, `fees_online_course_items`, an online branch in
  `fees_accrue_member`, the joining invoice, and `membership_upcoming_charges` (pay-ahead and notices).
- `dues_charge_label` no longer calls a course a "Membership renewal".
- Screens:
  - the join form's *How will you take part?*;
  - the mentor form's *Where will you mentor?*;
  - the portal's Saturday screen card (`Mp9Online`);
  - Members → Online (`cr-tab-members.jsx`);
  - the NGG Online group in Money → Amounts.
- Defaults the owner has not confirmed: the $10 is monthly and the $5 is per course per month.

**Verified.** `run.php`: 25 checks under *Online membership, phases 2–6*, run in CI. `node build.js` is
clean.

## 2026-11-24 — Accepted, then confirmed; a nearer centre offered; the helper chosen by itself

Owner: families were getting the welcome and the agreement "before they are even accepted"; the child "has to be
accepted before the fee is paid"; "when a centre is no longer accepting, they can suggest a new closer one"; the
helper "should be the child's mentor", automated; and the entry steps in the order a family does them.

- **Accept** (was *Accept & create member*) sends ONE email (`ngg_accepted_send`): accepted, with the agreement to
  sign and the joining fee to pay. No welcome, no separate agreement email, no separate invoice email.
- **Confirmed** by itself when every step that applies is done (`ngg_confirm_if_ready`): agreement signed
  (`clientSignedAt`; not for online members), joining invoice paid (not while fees are off). Called from
  `public_mou_sign`, `admin_mou_paper` (a paper-only signing), `membership_settle` (before the receipt, which says
  "one step left" when unsigned) and at acceptance. Then `ngg_welcome_send` and a push. Once, by a conditional
  UPDATE. Migration 245: `reg_checklists.confirmWait` (1 only for children accepted this way, so no row is
  rewritten and nothing needs a MySQL data fixup) and `confirmedAt`. The MoU page returns `place` (`mou_place_public`)
  and shows *Step 2 of 2: pay* with the pay link.
- **Offer another centre**: `admin.application.centre_options` (active NGG centres in scope with room, nearest first
  by `geo_distance_m`; Summer-only and full centres left out) and `admin.application.offer_centre` (email with ONE
  link; token stored hashed in `applications.offerTokenHash`, migration 245 (248 after the merge)). The family's page,
  `api/public/centre-offer.php`, is two buttons in a POST form (no script) so a mail scanner that follows the link
  answers nothing; CSRF-exempt because the token is the proof. "Yes" runs `app_convert` as the staff member who
  offered (their rights read live through `admin_cap_gate`); "Wait" → waitlist. Held 14 days (`APP_OFFER_DAYS`);
  answered once. `admin_application_convert` is now the gate plus `app_convert`.
- **The helper** (`rcl_auto_helpers`): the child's mentor wins (`assignedBy = 'auto-mentor'`); else the top present
  candidate with room (`'auto'`); a helper staff chose (any other `assignedBy`) stays. The list's `supervisorWhy`
  (mentor / seen / staff) says which — a candidate whose ROLE is mentor is not the child's mentor, and the first
  screen said so wrongly until the browser suite caught it. Runs at `rcl_start`, in `rcl_tick`, and on `admin_assign_mentor`.
- **Steps**: `RCL_STEPS` = online, payment, orientation, documents, idcard.
- Tests: PHP "accept ·", "centre offer ·" (11), "confirm ·" (8), "helper ·" (4), and the onboarding/pay checks
  rewritten for the new order. Mutations checked: removing the confirmWait guard and the mentor preference each
  fail their test. The answer-once claim guards concurrent taps; a sequential second tap is also refused by
  `app_offer_by_token`, so no sequential test can tell the claim's absence.

## 25 Nov 2026 — NGG Online, live: billing settings, grace and pause, automatic live classes, local currencies, course depth

- **Merge.** `afv/brave-faraday-pdlh7o` (accepted then confirmed; a nearer centre offered) merged in. Both lines had
  used migration 245; ours kept it (appliesTo) and theirs became 248, which also re-adds appliesTo for a database
  built from their line.
- **Migration 249**: online_course_enrolments, online_classes (+autoKey, groupNo, locked), online_class_sessions,
  online_class_joins, online_class_members, online_access_holds. Merge policy names all four memberId tables.
- **Fees**: `onlineMonthlyBasis` (month | once; 'online:once' ledger key). Course charges follow enrolment dates;
  the accrual opens/closes enrolments (`online_enrolments_sync`).
- **Access**: `online_access_state()` is computed from the ledger (fees_allocate, every kind including course
  `training`), never stored. States ok · grace · paused · held · owing (pausing off). Only live classes and the
  session pause. Reminder stages fitted to the window, latest stage only, quiet hours 21:00–07:00; notices through
  `dues_notice_send` (kinds online_due, online_paused, online_restored, online_class).
- **Planner**: `online_plan_classes()` — groups, greedy clash-free colouring with stability (current slot first),
  instructor load balancing, Jitsi links, locked classes planned around, archive what is no longer needed. Webcron
  `online_plan` (6h), `online_class` (10 min: reminders + follow-up), `online_access` (30 min), `fx` (daily).
- **FX**: `public.fx` (cached, topic `fx`), `admin.fx*`. Components: `NggPrice`, `nggLocalPrice`, `NggCurrencyPick`,
  `useNggFx`, `nggLocalTime`. Currency from the time zone, never the locale.
- **Lessons**: 78, validated through `curriculum_validate()`, ≥3 checks each, no MCQ whose key is the longest option.

## 25 Nov 2026 — the blank site: precompressed copies compressed twice

After deploying the 25 Nov zip the live site loaded blank: `app.<hash>.min.js` and `api-client.<hash>.js` threw
"Invalid or unexpected token". `.htaccess` rewrote each request to the `.br` (or `.gz`) copy built beside it, and the
host compressed that again — a `curl --compressed` of the live bundle decoded once to Brotli bytes, and even a
gzip-only request got the Brotli copy. Files with no copy (React) were fine. The copies and their rewrite are gone
(build.js, .htaccess, docs/PERFORMANCE.md); the perf-shell test holds it. The new build has new file names, so a
browser that cached the broken bundle (served `immutable` for a year) asks for the new one.

## 26 Nov 2026 — the family account: an adult's, smarter connecting, and devices

- Owner: "Fix the child connection. It is not smart at all"; "the child and parent should still be connected even when
  the parent logs on another device. There'll just be a notice and a minor layer of verification"; "we must be able to
  verify that the user is an adult".
- **Migration 250**: guardians.dob / adultDeclaredAt / phoneVerifiedAt; family_link_codes; guardian_devices.
- **domain/family-connect.php**: `family_adult_set` (18+ on a Lagos calendar, declaration required); `family_found_children`
  (verified email or verified phone, first name only); `family.ward.connect` (one tap, re-checked server-side);
  `family.phone.find` (same reply whether or not a record names the number; phones matched digits-only in SQL both
  engines read); `family.code.confirm` (5 tries, claimed with a relative increment, one use); `family_device_seen`.
- **family.ward.add (code)**: the second layer — a confirmation code to the record's parent contact unless the account's
  own email is on the record; with no contact, pending for the desk. **record** now connects at once (email proved).
- **Sessions**: remembered families get a sliding 30 days (re-signed daily while used); `ngg_fdev` device cookie.
- Not built: a face-based age check. It needs a specialist provider (Yoti, Smile ID) and an account with them.
- Tests: two browser suites (mentor v15, projects) were already failing because NGG Online made an admin's NGG centres
  three; their expectations were updated. The "Saturday between terms" check was made independent of a fixture whose
  term is dated relative to today.

