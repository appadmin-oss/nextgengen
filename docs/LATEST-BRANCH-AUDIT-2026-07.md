# NGG — Latest-Branch UX & Architecture Audit (2026-07-16)

Branch audited: `claude/nextgengen-latest-audit-wzccku` (HEAD `d9f47b3`).
Scope: the whole product as it stands — the marketing/portal SPA, the member
dashboard, the Anchor Journal PWA, the staff Control Room + portals, the field
kiosks, and the PHP API behind all of them.

Method: five parallel deep reads (frontend platform, public UX, member/auth UX,
admin console, PHP backend), each restricted to reporting only what it verified
in source. The most severe claims were then re-verified by hand against the
files cited; every finding below carries a `file:line` reference you can open.

> This audit is deliberately critical — it is a list of what to fix, not a
> scorecard. NGG is a genuinely ambitious, largely well-built system for its
> constraint (no-build shared PHP hosting, low-end mobile Nigerian audience),
> and the strengths are real and listed at the end. Read the two together.

---

## How to read this

Severity is about **impact if it stays unfixed**, not effort to fix:

- **Critical** — safeguarding, data loss, trust, or a security bypass. Fix
  before onboarding more real children/parents.
- **High** — breaks a core workflow at volume, or a maintainability/perf wall
  the product will hit soon.
- **Medium** — real friction, inconsistency, or accessibility failure.
- **Low** — polish and hardening.

Several items were already flagged in the earlier `OPERATIONAL-AUDIT.md` /
`PRODUCT-DESIGN-AUDIT.md` passes and remain unfixed on this branch — those are
marked **(repeat)**.

---

## Critical

### C1. Journal reflections are silently deleted when a teen's session has expired
`journal/app.jsx:299` — the offline write queue drains with:
`catch (e) { if (isOffline(e)) break; else store.setQueue(...filter out this entry) }`.
`isOffline` only matches `/network|fetch|Failed to fetch|offline/i`
(`journal/app.jsx:204`), so a `401 unauthorized` / `session_expired` is treated
as a *permanent* failure and the entry is **dropped from localStorage**, roughly
20 s after the save toast reassured the member "Couldn't save — kept on this
device." This is the product's core habit (daily reflection) losing a child's
words with no re-auth prompt. Compounding it: `api/auth/me.php:8` uses
`session_read()` (HMAC + absolute expiry only), which disagrees with
`require_session()`'s idle/revocation checks — so the app boots "signed in,"
`me()` passes, and the first data write 401s into exactly this deletion path.
Member idle timeout is 12 h while journaling is a ~24 h ritual, so this is the
*common* path, not an edge case.
**Fix:** treat coded auth errors as retryable (keep queued, surface a re-auth
sheet); make `me.php` use the same session authority as data endpoints.

### C2. Circle guardian pairing: unthrottled child-name lookup, and "revoke" doesn't revoke
`api/public/circle.php` is the **only** file in `api/public/` with no
`rate_limit_check` — so `circle.lookup` (`api/_lib/domain/circle.php:165-171`)
returns a **child's full name** for any valid 6-digit code, brute-forceable
across a 10⁶ space with no throttle. Pairing (`circle_connect`) mints a 180-day
guardian token with no student-side approval or notification. And
`member_circle_revoke` (`circle.php:155-162`) flips `circle_links.status` to
`revoked` but never rotates `members.anchorCode` — so an unlinked adult who
remembers the 6-digit code can silently re-pair. This directly contradicts the
in-product promise "They lose access to your progress immediately"
(`journal/app.jsx:1503`). For a safeguarding-first youth program this is the
highest-risk item in the audit.
**Fix:** add rate limiting to `api/public/circle.php`; rotate `anchorCode` on
revoke; require student-side confirmation to pair.

### C3. Impersonation bypasses the admin 2FA gate and can *mint* a 2FA-passed session
`api/admin/impersonate.php:6` guards with `require_session()`, not
`require_admin()`, and "start" checks only `role === 'super_admin'` (line 22) —
never `adminOk`. "stop" then re-issues the admin session with
`session_issue(..., true)` (line 16, verified against the `bool $adminOk`
signature at `api/_lib/session.php:14`), on the code comment's assumption the
admin was "already 2FA-cleared before they started" — which the start path never
enforced. Net effect: a `super_admin` cookie obtained with **password alone**
can call start → stop and return holding `adminOk=true`, defeating the TOTP gate
that `require_admin()` (`session.php:174-181`) enforces on every other admin
endpoint.
**Fix:** guard impersonate with `require_admin()`; on stop, restore `adminOk`
from the *pre-impersonation* claim, not an unconditional `true`.

### C4. No crisis / disclosure path anywhere in the member experience
Grepping `journal/app.jsx`, `page-dashboard.jsx`, and `momentum.php` for
helpline / crisis / abuse / trusted-adult returns nothing. The AI coach system
prompt (`api/_lib/domain/momentum.php:152`) is tuned for Socratic questioning
and homework refusal but has no handling for self-harm or abuse disclosure — a
teen journaling "Difficult because…" or telling the coach something serious gets
"What made you feel that way today?" and no signposted help. For a program
serving children 10–17, a disclosure route is table stakes.
**Fix:** add a persistent, always-reachable help/crisis affordance; add
disclosure detection + a safe hand-off message to the coach prompt.

### C5. Fabricated social proof across the public site (repeat)
Presented as real, on live public routes: a press wall — "BellaNaija, TechCabal,
Pulse, Channels TV, The Continent · FEATURED · 2025/2024"
(`page-other.jsx:96-102`, flagged in the prior operational audit, still shipped);
a "Genius of the Week: Tunde · 16 · +2,980 XP" card (`page-home.jsx:174-181`);
"Active in this stage 318 / 164 / 29 / 06 · LIVE" (`page-home.jsx:341-345`);
evergreen fallbacks "500+ / 1,200+ missions verified / 60+ graduates"
(`page-home.jsx:66,127-136`); testimonials attributed to named teens and a
parent (`data.js:140-145`); a "Dr. Ade · 23 mentees · ★4.9" spotlight with a
DiceBear placeholder face (`page-other.jsx:392-405`); and footer social icons
that all link to bare platform homepages, each tagged `// TODO: real handle`
(`data.js:179-185`). A summer "CURRENT COHORT · Meet the summer class" is 12
fictional children with DiceBear faces and streaks, **unlabeled**
(`page-club.jsx:69-117`, `data.js:84-97`) — while `ProfilePage` elsewhere does
the honest thing with a "Sample profile · not a real member" banner. For a
child-safeguarding nonprofit whose entire pitch to parents is trust, invented
press, ratings, and "live" numbers are materially damaging if noticed.
**Fix:** gate every unproven claim behind real data or remove it; label all
sample/demo content the way `ProfilePage` already does.

---

## High

### H1. The entire product ships as one 681 KB bundle to every visitor
`dist/app.min.js` is 680,959 bytes / **162 KB gzip** (`dist/build-manifest.json`),
concatenating all 15 source files — including the 279 KB admin console
(`page-admin.jsx`, ~90 components) and 231 KB `page-other.jsx` — so an anonymous
homepage visitor downloads and parses the whole Control Room.
`vendor/jsQR.min.js` (46 KB gz) also loads on every page (`index.html:131`)
though only the kiosk uses it. With react-dom and ~214 KB of CSS, first visit is
~250–300 KB gzip / ~1.2 MB parsed — heavy for the stated low-end-Android
audience. The classic-script-globals architecture (`build.js:34-88`) structurally
precludes `React.lazy`/dynamic `import()`, so there is **no code-splitting path**
without a module migration.
**Fix:** at minimum, lazy-load jsQR to the kiosk route; longer term this is the
strongest argument for the module-bundler migration (see H8).

### H2. MySQL auto-migrate drops all seed data and can re-run the full schema on every request
`db_apply_mysql_schema()` (`api/_lib/db.php:96`) only executes statements
matching `^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE)` — so
**every `INSERT` is skipped**, and the default `vol_tiers` rows the SQLite path
seeds (`db.php:647`, mirrored at `schema-mysql.sql:479`) are never inserted on
the no-SSH MySQL host this feature exists for. Worse, the schema hash is recorded
only when `$allOk` (`db.php:111`); any statement failing with a code outside the
swallowed set `[1050,1060,1061,1091,1826]` (e.g. a missing ALTER privilege)
means the hash is never saved and the ~40-statement DDL replay runs on **every
subsequent request forever** — a silent per-request performance cliff.
**Fix:** replay seed `INSERT`s (idempotently); record progress so a partial
failure doesn't loop; test the MySQL dialect path (it currently has no test).

### H3. The admin route layer silently drops params the UI sends — breaking pagination and truncating exports
`api/admin/members.php:7-14` forwards only `q/centre/status/type`, but the domain
handler supports `page/pageSize/all/staff` (`api/_lib/domain/admin.php:60-78`)
and the UI sends them (`page-admin.jsx:527,533,1881`). Verified consequences:
the Members pager shows "Page 2" while the server always returns page 1; "Export
CSV" with `all:1` silently exports only the first 50 rows (while auditing a
*full* export); and "Access & roles" (`staff:1` dropped) lists the first 50 of
**all** members as "everyone with staff access," each with a live role dropdown —
and non-staff rows leaking in render a `<select>` matching no option, so the
browser shows "Editor" and an accidental grant is one change-event away
(`page-admin.jsx:1922`). `api/admin/audit.php:5-11` has the same class of bug
(drops `page/pageSize/all`).
**Fix:** forward the full param set in the route files; add a shared route
helper so this can't drift per-file.

### H4. 2FA lockout recovery is dead end-to-end
The domain mints 8 backup codes like `3F9A-1C7B` and returns them once
(`api/_lib/domain/auth.php:396-405`), and the gate UI is ready to render them
(`page-admin.jsx:220-227`) — but `api/auth/admin-totp-setup.php:16-19` strips
`backupCodes` from the response, so they are **never shown**. Even if an admin
had one, the gate input strips non-digits and requires exactly 6 digits
(`page-admin.jsx:242,246`), so a hex code can't be entered. A lone super-admin
who loses their phone is locked out with no self-service path (the "Reset 2FA"
flow needs *another* super-admin).
**Fix:** return `backupCodes` from setup and display them once; accept the
hex/alphanumeric format at the gate.

### H5. Journal read is an IDOR — cross-member enumeration of non-private entries
`api/member/journal.php:8` sets `memberId => $_GET['memberId'] ?? $s['mid']`, and
`anchor_journal_list()` (`api/_lib/domain/anchor.php:166-172`) returns an entry
if `isOwn || isAdmin || !isPrivate`. So any authenticated member can pass
`?memberId=<other>` and read that member's non-private entries. Entries default
to private (`db.php:251`), so blast radius is limited to entries a member
explicitly un-privated — but the endpoint trusts a client-supplied subject id
instead of scoping to the session.
**Fix:** ignore client `memberId` for the list op unless the requester is
admin/mentor with a legitimate relationship.

### H6. The "offline-first" Journal PWA is unusable offline from a cold start
Boot requires a live `NGGApi.auth.me()`; on failure `member` stays null and
`SignInGate` renders (`journal/app.jsx:247-255, 380-381`), which cannot
authenticate offline. The member identity is never cached (the store holds
entries/weeks/pstate but no member). The install prompt promises "Add to your
home screen — works offline" (`journal/app.jsx:1933`) and the SW precaches the
shell correctly — but the auth gate defeats it the moment the OS evicts the page
while offline. Related: `member_state` writes (notes, goals, daily systems,
self-scores) are fire-and-forget with no queue (`journal/app.jsx:312-315`) and
the next `refresh()` overwrites local with server (`journal/app.jsx:280`), so a
failed offline write is silently reverted and two devices are last-writer-wins.
**Fix:** cache the member identity for offline boot; queue `member_state` writes
the same way journal entries are (once C1 is fixed).

### H7. Global-namespace coupling + hand-maintained load order is fragile
Every module publishes via `Object.assign(window, {...})` and the prod build
concatenates all 15 files into **one shared lexical scope** (`build.js:77-88`),
so any duplicate top-level `const` across any two files is a whole-app parse
error, and use-before-define across files is a latent break. Load order is
duplicated in `build.js:37-53` and `index.html:133-147`; the build validator
catches *order* drift (a real strength) but nothing catches name collisions.
**Fix:** treat this as the motivating constraint for the module migration; until
then, a lint pass for cross-file top-level identifier collisions.

### H8. React 18 UMD is a dead-end pin that will force a migration
`vendor/react*.production.min.js` are 18.3.1 UMD builds; `createRoot` is used
correctly (`app.jsx:326`). But React 19 dropped UMD entirely, so any future
React upgrade forces the exact module-bundler migration the globals-on-`window`
architecture was built to avoid — and that migration also unlocks H1
code-splitting. This is the central architectural fork in the road.

### H9. Closed mega-menus leave ~10 focusable buttons in the tab order
The desktop "Programs"/"The room" panels hide via `opacity:0; pointer-events:none`
(`styles-app.css:1838-1854`) rather than `display`/`visibility`, while their item
buttons stay focusable and the container is `aria-hidden={!isOpen}`
(`components.jsx:466-504`). Keyboard users tab through invisible controls, and
`aria-hidden` with focusable descendants is a WCAG violation. (The mobile drawer
does this correctly with `visibility:hidden`.)
**Fix:** add `visibility:hidden` (or `display:none`) to the closed panel state.

---

## Medium

### M1. Brand gold/coral text fails WCAG AA contrast by default
`--gold-500` #f5b026 on `--paper` #fbf7ed is ~1.8:1, used for 10–11px eyebrow
labels across light sections (`page-other.jsx:664,972,977,1056`,
`page-club.jsx:58`); `--coral` #ff5a3c error text is ~3.1:1 on white
(`page-other.jsx:961,1692`). The opt-in high-contrast widget exists, but the
*default* smallest text fails AA.

### M2. Session expiry mid-use is invisible and dead-ends everywhere
Dashboard swallows poll 401s and keeps rendering stale data
(`page-dashboard.jsx:26-35`); action failures toast "Please sign in again"
(`page-dashboard.jsx:1121-1131`) but nothing calls `openSignIn()`, and typed
assignment/journal text sits behind the toast with no recovery. Same pattern
strands the gate kiosk after a 12 h shift expiry (`page-other.jsx:2718,2730`) and
underlies C1.

### M3. Staff idle timeout silently stops applying when the device row is pruned
`api/_lib/session.php:158-165` runs the 30-min staff idle check only
`if ($row)`; a pruned `device_sessions` row leaves a 2FA-passed admin cookie
valid for the full 7-day absolute TTL with no idle check and no revocation
handle. Impersonation also downgrades a super-admin to the 12 h member idle
window (`impersonate.php:27` issues `adminOk=false`).

### M4. Newsletter/broadcast send inline, in-request, up to 2000 recipients
`admin_newsletter_send()` (`api/_lib/domain/admin2.php:192-206`) loops SMTP sends
one-by-one inside the HTTP request — a real list guarantees a timeout and
partial, non-resumable sends. The integration bus (`bus.php`) already implements
outbox + retry + backoff; email conspicuously doesn't reuse it. UX side: broadcast
confirms "every active member… no undo" (`page-admin.jsx:1808`) with **no
recipient count**, no preview, and no test-send.

### M5. Destructive admin actions use bare `confirm()` and don't refresh the list
Delete-and-anonymise (irreversible PII scrub), reset-2FA, reset-password, and
impersonate all use native `confirm()` (`page-admin.jsx:683-697`), inconsistent
with the styled `dialog.confirm` used 28× elsewhere, with no typed-name friction.
After delete, only `close()` runs — `load()` never fires — so the deleted member
stays visible until a manual filter change.

### M6. Reflect editor has zero draft persistence — and its own Coach button destroys the draft
All seven sections live in component `useState` (`journal/app.jsx:565-579`); a
refresh/OS-kill/nav loses everything, and "Talk it through with your Coach"
(`journal/app.jsx:688-693`) calls `go("coach")`, unmounting Reflect and erasing
the half-written entry.

### M7. Applicants are never shown their application reference
The backend returns `ref` from every apply (`api/_lib/domain/events.php:490-510`)
and the Contact "Check your status" widget requires it (`page-other.jsx:1050`),
but JoinPage discards the response and shows only "Application received"
(`page-other.jsx:620-637,817-826`). The volunteer flow *does* show its reference —
the highest-stakes flow is the inconsistent one; a parent who loses the email
can't self-serve status.

### M8. Join wizard validates on-click-only with one aggregated error
Validation runs only on "Continue" and surfaces one message in a box below the
card (`page-other.jsx:591-608`); inputs get no `aria-invalid`/`aria-describedby`,
nothing focuses/scrolls to the offending field, and errors reveal one-per-click.

### M9. No focus management on route change; two of three modal layers don't trap focus
Route change announces + scrolls to top but leaves keyboard focus where it was
(`app.jsx:168-204`); MediaModal has Escape + scrim only (`page-other.jsx:156-193`);
DialogHost confirm dialogs get no initial focus and Tab escapes behind
(`safety.jsx:195-212`). The mobile drawer and a11y panel *do* trap — the pattern
exists but isn't applied consistently.

### M10. Shared-IP rate limit locks whole classrooms out of sign-in
`auth.request` is 5 hits/60 s **per IP** and shared by `gateway.php` and
`request.php` (one code sign-in consumes 2 hits), so ~3 teens behind one
school/cybercafé NAT exhaust the bucket (`config.example.php:249`). Password-less
teens are the heaviest users of exactly this path.

### M11. File-based rate limiter has a read-modify-write race and never GCs
`rate_limit_check()` (`api/_lib/rate-limit.php:9-37`) reads unlocked, then writes
under `LOCK_EX` — concurrent requests both read a sub-limit count and both write,
so bursts slip the cap (weakening the very brute-force throttles it exists for),
and `_cache/_rl/*` grows one file per (op,IP) forever (webcron GC skips it).

### M12. Media room and blog are shells that read as real content
Every `MEDIA_ITEMS` entry lacks a URL (`data.js:147-154`) so every play button
opens "the recording isn't online yet" despite advertising durations and view
counts (`page-other.jsx:173-188`). Every blog article — including real
admin-authored posts — gets identical canned paragraphs, a stock figure, and a
fixed pull-quote appended (`page-blog.jsx:203-237`), so different titles render
the same essay.

### M13. Two orphaned backends remain wired to nothing (repeat)
`anchor.mission.verify` is registered (`api/_lib/backend.php:43`) and is the only
path that moves a proof-requiring submission from `submitted`→`verified` (awards
XP) — but there is still **no client or admin surface** to call it (grep for it
in `api-client.js`/`page-admin.jsx` is empty), so every photo/text-evidence
submission is stranded forever with no XP and no feedback. Flagged in
`OPERATIONAL-AUDIT.md`; still unfixed on this branch.

### M14. No SSR/prerender on an SEO-dependent marketing site
`index.html` serves an empty `#root`; per-route titles/descriptions are set
client-side (`app.jsx:14-40`), OG/twitter tags are homepage-only
(`index.html:22-34`), and `.htaccess` even rewrites 404s to the JS shell — so
shared links to `/blog/...` all preview as the homepage, and every sitemap URL
needs ~700 KB of JS to render.

---

## Low (hardening & polish)

- **L1. Service-worker cache version derives from the JS hash only** — a
  CSS/`data.js`/`api-client.js`-only deploy produces a byte-identical SW, so
  SW-controlled users get stale assets indefinitely (`build.js:101,178` vs the
  cache-first precache in `service-worker.js:13-77`).
- **L2. Prod CSP still ships `'unsafe-inline' 'unsafe-eval'`** — the `.htaccess`
  comment says to drop them once precompiled, but `build.js` copies `.htaccess`
  verbatim into `dist/`, so the eval-free bundle keeps an eval-permissive CSP.
- **L3. SQLite DB + logs sit in the web root** behind only nested `.htaccess`
  (`config.example.php:24`; `api/.htaccess` doesn't block `storage/`/`logs/` at
  the parent) — one misconfig from a downloadable member/auth DB.
- **L4. SMTP auto-downgrades TLS verification** on any error matching
  `/certificate|ssl|tls|verify|self.signed/` (`api/_lib/mailer.php:346-360`),
  carrying AUTH credentials over an unverified connection — a MITM can induce it.
- **L5. `api-client.js` has no timeout/abort/retry** (`api-client.js:14-45`); a
  hung connection hangs the UI forever, and `catch(_){data={}}` collapses HTML
  500s into a generic `http_500`.
- **L6. `rel="modulepreload"` on a classic script** (`build.js:122`,
  `dist/index.html:125`) — fetches/compiles the 681 KB file as a module;
  `rel="preload" as="script"` was intended.
- **L7. Committed `dist/` (199 files) with no CI** — nothing verifies the bundle
  was rebuilt from sources; `dist/vendor/babel.min.js` (3.1 MB) also ships unused.
- **L8. UTC day-bucketing misdates late-evening reflections** for the WAT (+1)
  audience (`journal/app.jsx:205`) — "reflected today" stays unlit until 1 am.
- **L9. Raw error codes leak to teens/guardians** in the Journal SignInGate and
  CirclePortal (`journal/app.jsx:1874,1884`, `page-other.jsx:1804`) instead of
  reusing the humanized map at `auth.jsx:568-595`.
- **L10. Mixed Apache 2.2/2.4 access syntax** across protected dirs
  (`storage/.htaccess` uses `Require all denied`, `_cache/.htaccess` uses
  `Order Deny,Allow`) — one or the other 500s depending on host modules.
- **L11. Two parallel dispatch layers** (`gs_call` → `backend_dispatch`) and ~30
  near-identical route files with drifting error-status conventions
  (`member/dashboard.php` maps to 500, most others to 400) — a shared route
  helper would remove the copy-paste.
- **L12. CSRF token isn't bound to the session** despite the comment claiming so
  (`csrf.php:11-19`) — double-submit is sound in practice under SameSite=Lax, but
  a leaked token is replayable within its TTL.
- **L13. Frontend has no automated tests** beyond two E2E scripts (kiosk,
  journal-smoke); the security perimeter (CSRF, cookie signing, rate-limit races,
  MySQL dialect) is exactly what the PHP test suite doesn't cover.
- **L14. Summer-student profiles (`/q`, `/s`) and certificates (`/cert`) are
  indexable** while the equivalent member profile is `noindex` — a
  safeguarding/SEO inconsistency for public pages of minors (`app.jsx:195`).
  Flagged in `OPERATIONAL-AUDIT.md`; still unfixed.

---

## Cross-cutting themes

1. **Honesty of content is the biggest single risk.** C5 + M12 + the fabricated
   press/cohort/testimonials aren't isolated bugs — they're a pattern of
   placeholder content shipped as if real, on a site whose entire value
   proposition to parents is trustworthiness. This is the cheapest high-impact
   fix: label or remove.

2. **Session expiry is unhandled end-to-end.** C1, H6, M2, M3 are one root cause
   wearing four hats: the client assumes the session it booted with is still
   alive, and every surface (journal, dashboard, kiosk) degrades badly when it
   isn't — up to and including data loss. One shared "re-authenticate without
   losing my work" primitive would close all four.

3. **The globals-on-`window` / no-bundler architecture has reached its ceiling.**
   H1, H7, H8, L1, L6 all trace back to it. It was the right call for no-build
   shared hosting, but the 681 KB single bundle and the React-19 UMD dead-end
   mean a module migration is now the highest-leverage architectural investment —
   it unlocks code-splitting, kills the load-order fragility, and unblocks
   framework upgrades at once.

4. **Backend patterns are strong in the core, thin at the edges.** SQL is
   uniformly parameterized, auth hygiene is genuinely good (Argon2id, lockout,
   enumeration-safe, TOTP), and the integration bus is well-designed — but that
   rigor doesn't reach email delivery (M4), the MySQL dialect (H2), rate limiting
   (M11), or the route/dispatch boilerplate (L11).

---

## What's genuinely good (so the picture is fair)

- **Auth core**: stateless HMAC-signed cookies + a server-side device register
  for remote revocation and new-device email alerts; Argon2id with rehash-on-
  login, 8-fail lockout, enumeration-safe uniform responses, TOTP 2FA with hashed
  backup codes. Unusually strong for a small nonprofit app.
- **RBAC done twice on purpose**: one `ADMIN_SECTIONS` source of truth for UI
  gating plus per-handler server re-checks, with real last-super-admin and
  no-self-demotion guards surfaced as friendly warnings.
- **The gate/kiosk offline queue is a model of how to do it** — proper
  network-vs-rejection discrimination, visible pending count, manual sync,
  dedupe, and a typed-code fallback when the camera fails. (Ironically the
  journal queue, C1, is where the same care was needed and missing.)
- **Integration bus**: outbox → per-destination deliveries with exponential
  backoff, dead-lettering, and an inspectable log; SSRF-aware outbound HTTP
  (https-only, private-range blocking, no redirects).
- **Build discipline**: a drift guard that fails the build if bundle order and
  `index.html` diverge; build-stamped SW cache-busting; secrets/DB scrubbed from
  `dist/`; committed `dist` byte-identical to source.
- **Public-form UX**: real draft autosave with honest "your draft is saved" copy;
  disabled-submit buttons that *explain* what's still needed; consistent
  double-submit protection and error-code→human-message maps.
- **The Circle privacy model is real, not marketing** — guardians structurally
  cannot read reflections/notes/coach chats; only aggregates leave the server
  (the pairing/revocation mechanics in C2 are the gap, not the privacy model).
- **Accessibility widget** (contrast/motion/readable-font/underline) seeded from
  OS prefs with a focus-trapped panel; skip link that programmatically focuses
  `#main`; motion system fully guarded by `prefers-reduced-motion`.

---

*Prepared 2026-07-16. Every finding was verified against the cited source on
this branch. Prior-audit repeats are noted; new findings dominate the Critical
and High tiers.*
