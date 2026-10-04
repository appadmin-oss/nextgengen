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
- Tests: `access:` block in run.php (15 checks). `tests/forms-*.js` and `tests/screenshots.js` now read bootstrap.php's domain list instead of keeping a copy (the copy fell behind summer-editions.php and the self-registration approval fataled in the harness).

