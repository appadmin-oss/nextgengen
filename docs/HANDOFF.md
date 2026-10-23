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
