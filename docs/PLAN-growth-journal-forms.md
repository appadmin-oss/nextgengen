# Plan — Growth Potential analytics · Program Journal · Form reliability & caching

Status: proposed · Branch: `claude/gate-links-staff-desk-4g73f9`

---

## Context

Four pieces of work, from two different causes.

**Forms and caching are a live defect.** Staff and families report forms that
"don't submit" and show a connection error. The connection is usually fine —
the request is being held open by background work, timing out client-side, and
reporting a failure for a write that already succeeded. Retrying then trips a
per-IP rate limit that was never sized for a shared connection, and there is no
idempotency, so a retry that *does* land creates a duplicate. These four
interact, which is why it reads as "the site is flaky" rather than one bug.

**Growth Potential analytics and the Program Journal are new capability.** The
analytics workspace (`page-analytics.jsx`, `api/_lib/domain/analytics.php`)
already delivers four levels — Executive, Operations, Research, Evidence — but
every number in it is *descriptive*: what happened, to whom, how many. Nothing
tells a coordinator **who is about to fall out of the programme** or **which
centre is about to stall**, which is the decision they actually make each week.
The Community app (`page-club.jsx`, `api/_lib/domain/community.php`) has
channels, posts, mentions, reactions and moderation, but no durable record of
the programme's own story — the advice given, the contributions made, the issues
raised and how they resolved.

Confirmed decisions from the requester:

| Question | Decision |
|---|---|
| Growth Potential scope | **Both** student-level and centre-level, in one section. Must be *detailed, structured, intelligent and professional* — all four. |
| "Journalist" | **A role.** A new capability gating who may author journal entries. |
| Journal privacy | **Staff-only default**, three levels: Staff → Community → Public. Share links resolve only at Public. |
| Offline outbox scope | **All intake forms.** Plus: fix the caching issues affecting submissions — research, improve, make it smarter. |

---

## Workstream 1 · Form submission reliability

### 1.1 Root cause: the response is held open by background work

`web_cron_schedule()` is called from `api/_lib/bootstrap.php:114`, which registers
`web_cron_run` as the **first** shutdown function on every request. Compare the
two shutdown paths in `api/_lib/webcron.php`:

```php
// after_response() — line 116-117: flushes on BOTH server types
if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
else { @ob_end_flush(); @flush(); }          // ← non-FPM fallback

// web_cron_run() — line 137: flushes on FPM ONLY
if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
                                             // ← no else. Nothing is flushed.
```

On PHP-FPM this is invisible. On Apache `mod_php` or CGI — which is exactly the
"no SSH, no cron" shared hosting the web-cron exists to serve — the response
bytes sit in the output buffer while `web_cron_run` does up to **45 seconds** of
deliveries, reminders and maintenance. `after_response` (registered later, so it
runs second) then adds up to 45s more of SMS/SMTP. The browser sees nothing.
`api-client.js:36` aborts writes at 60s and reads at 20s, throws code
`timeout`/`network` with `status 0`, and the form says "Couldn't reach the
server — check the connection" for a registration that committed fine.

The existing comment at `webcron.php:100-103` describes this exact outcome and
was the reason `after_response` was written; `web_cron_run` never got the same
treatment.

**Fix.** Extract the flush into one helper both paths call, so they cannot drift
again:

```php
/** Hand the finished response back to the client before doing slow work. */
function response_detach(): void {
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); return; }
    while (ob_get_level() > 0) { @ob_end_flush(); }
    @flush();
}
```

Call it at the top of `web_cron_run()` and inside `after_response()`. Note the
`while` loop — the single `@ob_end_flush()` in `after_response` today only pops
*one* buffer level, and `ob_start()` may be nested (mod_deflate, `output_buffering`
ini, an app-level buffer). One level is not enough to guarantee the bytes leave.

`api/_lib/response.php` already sends `Content-Length`, so once the bytes are
flushed the browser can complete the response even on a keep-alive connection.
That half of the problem is already solved; this is the missing half.

### 1.2 Idempotency, so a retry is safe

There is no submission key anywhere in the intake path, so a client retry after a
timeout either duplicates the record or trips the `duplicate_suspect` heuristic
(name + parent contact) and stops with a scary prompt.

Add a client-generated `submissionId` (UUID, minted once when the form is first
opened, persisted with the draft) carried on every intake write:

- New table `intake_submissions` (migration 70): `submissionId` UNIQUE,
  `op`, `resultJson`, `createdAt`.
- A helper `intake_once(string $submissionId, callable $fn): array` in
  `api/_lib/util.php`: on a hit, replay the stored result verbatim without
  re-running `$fn`; on a miss, run it and record the result inside the same
  transaction. Unknown/empty `submissionId` falls through to today's behaviour,
  so nothing breaks if an old bundle is cached in a browser.
- Wrap the write in `gate_register` (`domain/registration.php:1107`),
  `selfreg_submit` (`domain/selfreg.php:179`), `public.apply`, `contact` and
  `reshoot`.

This is the precondition for everything in 1.3 — an outbox that retries is only
safe once a retry is guaranteed not to double-register a child.

### 1.3 The offline outbox — all intake forms

Generalise the pattern that already works in the kiosk
(`page-admin.jsx:6946-7028`: `KIOSK_Q`, `kioskQueue()`, `flush()` on the
`online` event plus a 15s interval). Today it exists once, inline, for check-in
scans only; the intake forms merely save a *draft* to `localStorage`
(`page-other.jsx:3592-3608`) and lose the *submission* on failure.

New shared module `outbox.js` (loaded alongside `api-client.js`, added to
`build.js` `CACHED_FILES` so it participates in the build hash):

```
outbox.enqueue(op, payload)   → persist first, then attempt. Returns a receipt.
outbox.flush()                → drain oldest-first; stop on the first network error
outbox.pending(op)            → count, for the "N waiting to send" banner
outbox.subscribe(fn)          → UI updates when the queue moves
```

Behaviour, mirroring the kiosk's hard-won rules:

- **Write to storage before the network attempt** — this is the "save offline
  even when online" the requester asked for. A submission survives a tab close,
  a crash, a dead battery and a 60s timeout.
- Carry the `submissionId` from 1.2, so a replay is a no-op server-side.
- Retry with exponential backoff (2s → 4s → 8s → 30s cap), on the `online`
  event, and on a periodic tick.
- **A server refusal is not a retry.** `4xx` with a named code (validation,
  `gate_invalid`, `photo_rejected`) dequeues and surfaces the reason. Only
  `status 0` / `network` / `timeout` / `5xx` / `rate_limited` retry. The kiosk
  flush learned this the hard way (`page-admin.jsx:7011-7014` — a silently
  dropped scan left the desk believing someone was checked in).
- IndexedDB when available, `localStorage` fallback. Photo data URLs make
  registration payloads large; `localStorage`'s ~5MB ceiling is a real limit.

Wire into: `/apply` self-registration and the gate desk (`page-other.jsx`),
volunteer registration and apply (`page-other.jsx`), contact
(`page-other.jsx:~969`), guardian reshoot. Each gets the same small status strip:
*"Saved on this device · sending…" / "N waiting to send" / "Sent ✓"*.

The user-facing consequence: a submission is never lost and never *reads* as
lost. The current copy ("check your connection — nothing you typed has been
lost") becomes true in a stronger sense — it is queued and will go on its own.

---

## Workstream 2 · Caching — audit, and make it smarter

Already fixed on this branch (commit `66b4064`): `gs_cache_write` wrote a file
for ops with no positive TTL, littering the cache dir with entries no read could
serve; and `/status` double-cached behind its own consent-stamped memo. The
remaining items:

### 2.1 The rate limiter is the caching artifact that breaks submissions

`api/_lib/rate-limit.php:30` sets the public sign-up ceiling:

```php
'selfreg.submit' => ['max' => 4, 'window' => 300],   // 4 per 5 min, per IP
```

Keyed on `client_ip()` alone (`rate-limit.php:53-57`). On Nigerian mobile
carriers and any centre WiFi, a whole queue of families shares one address — the
fifth family in five minutes is refused as an attacker. Worse, with 1.3 in place
every *retry* burns a slot, so a genuine timeout cascades into `rate_limited`.

The codebase already contains the correct reasoning, applied to a different
endpoint — `rate-limit.php:32-38` on `arcade.start`: *"a whole centre shares one
connection — a class of thirty children opening the arcade together is the
NORMAL case, not an attack."* That argument is exactly as true of a registration
queue and was never applied here.

Fix:
- Raise `selfreg.submit` to a ceiling that clears a real queue (~40/300),
  keeping it a runaway-script guard rather than a per-family quota. The real
  control is that a submission is not a registration until a human approves it
  (`selfreg.php:1-12`).
- Key the bucket on `IP + gateId` so one centre's link cannot exhaust another's.
- **Exempt idempotent replays**: check `intake_submissions` before
  `rate_limit_check`, so re-sending a known `submissionId` never consumes a slot.
- Return `Retry-After` on 429 so the outbox backs off intelligently instead of
  hammering.

### 2.2 `cache_remember` serves stale data with no age ceiling

`api/_lib/util.php:254-263`: when the builder throws, the last good payload is
served — with no bound on how old it is. If the builder keeps throwing, a
months-old payload is served indefinitely, and the only trace is an `error_log`
line nobody reads.

Fix: cap the stale window (serve stale only within, say, 10× the TTL), and route
the event through `ops_record('warn', …)` so Diagnostics shows "serving stale
`public_status`, 4h old" instead of failing silently. Reuses `ops_record` from
`api/_lib/domain/ops.php:34`.

### 2.3 Cache invalidation is manual and incomplete

`gs_cache_purge` is called from only three places — `api/admin/posts.php:31`,
`events.php:29`, `anchor.php:19`. Every other admin write that changes a cached
public read leaves the stale copy in place until its TTL expires. Notably
`public.centres` and `community.showcase` are read with `useCache = true` but
have **no TTL entry**, so they were writing files nothing read (fixed) and are
now simply uncached — a correctness win, a small performance loss.

Fix: a single `cache_invalidate(array $ops)` helper, plus a declared map of
*which mutation invalidates which read*, so the relationship lives in one place
instead of being remembered at each call site. Give `public.centres` and
`community.showcase` real TTLs and purge them from the centre/community admin
writes.

### 2.4 Service worker: `/api/` is safe, one bug elsewhere

`service-worker.js:63,67` correctly skips non-GET and `/api/` entirely, so the
SW is not implicated in form submissions. One real defect at line 89-95: the
cache-first branch's `.catch(() => hit)` returns `hit`, which is `undefined` on
that path — an offline miss rejects with `undefined` rather than a useful
response. Return a synthetic 504 instead.

---

## Workstream 3 · Growth Potential analytics

Must be detailed, structured, intelligent and professional. Descriptive
analytics already exist; this adds the *predictive* level.

### 3.1 Where it goes

A new **Level 5 · Growth Potential** section in `page-analytics.jsx`, reachable
from the existing `an-levelnav` (line 484-487), served by extending
`analytics_workspace` in `api/_lib/domain/analytics.php:85` with a `growth` key.
Reuses the existing filter bar, drill-down pane (`AnDrill`) and chart primitives
(`AnLine`, `AnScatter`, `AnDonut`, `AnKpi`) so it looks native rather than bolted
on.

### 3.2 The model — student level

A composite 0-100 **Growth Potential Index (GPI)** per student, from five
signals, each normalised to 0-100 and **cohort-relative** (z-scored within the
student's own centre and age band, so a strong student at a struggling centre is
not punished for their peers):

| Signal | Weight | Source |
|---|---|---|
| Attendance trajectory — slope of the last 4 weeks, not the average | 30% | `attendance` |
| Academic movement — grade delta vs their own baseline | 25% | assessments |
| Engagement — missions/assignments completed, journal cadence | 20% | missions, `assignments` |
| Recognition — stars, badges, peer signals | 15% | `community_stars`, badges |
| Conduct — behaviour flags, resolved vs open | 10% | behaviour tables |

Deliberate design choices that make this *intelligent* rather than a weighted
average with a nice name:

- **Trajectory, not level.** Slope over the window. A child at 60% attendance
  and climbing is a different case from one at 60% and falling; a mean cannot
  tell them apart, and it is the difference that decides who gets a phone call.
- **Confidence, surfaced.** Reuse `analytics_stats` (`analytics.php:22`) for n,
  mean, median, sd. Every score ships an `n` and a confidence band; below a
  minimum n the student appears under "insufficient data", never with a
  fabricated score. A number a coordinator cannot trust is worse than a blank.
- **Two ranked lists, one engine.** *Rising* (top GPI + positive slope) and
  *At risk* (low GPI or a sharp negative inflection). At-risk is the one that
  earns the feature — it is the list nobody can produce today.
- **Reason codes, not just scores.** Each row carries the 2-3 signals that drove
  it ("attendance −18% over 3 weeks; 2 open conduct flags"). A score with no
  explanation does not survive contact with a staff meeting.
- **Every row drills through** to the underlying records via
  `analytics_drilldown` (`analytics.php:375`), so a claim can always be checked.

### 3.3 The model — centre level

Per centre, a **Growth Readiness** panel:

- Enrolment trajectory (4-week slope) and retention curve.
- Funnel conversion: `self_pending` → `parent_pending` → `verified` → attending,
  with the drop-off stage named. The self-registration statuses from migration 69
  make this measurable for the first time.
- Capacity headroom — enrolled vs capacity, and staffing ratio from `mentors`.
- A cohort-normalised composite, ranked, with the constraining factor named
  ("capacity-bound", "staffing-bound", "conversion-bound") so the ranking
  implies an action rather than just a league table.

### 3.4 Professional output

- PDF/CSV export through the existing `onExport` / `exportPdf` path
  (`page-analytics.jsx:434-453`), so a board pack is one click.
- A documented methodology panel — weights, window, normalisation, minimum n —
  visible in the UI. An unexplained score is not defensible to a funder.
- Written into `docs/` alongside this plan so the model is reviewable.

### 3.5 Cost

`analytics_workspace` is already a heavy read. The growth computation is
per-student over a 4-week window, so it must not run on every page load: compute
behind `cache_remember` with a stamp derived from `MAX(id)` of `attendance` (the
same trick `api/public/status.php:18` uses with the consent ledger), and refresh
it in `web_cron_maintenance`.

---

## Workstream 4 · Program Journal (in the Community)

A durable, curated record of the programme's story, living as a destination in
the Community app.

### 4.1 Data model (migration 70, mirrored into `db/schema-mysql.sql`)

```
program_journal
  entryId, title, body, kind, status, visibility,
  authorId, authorName, occurredAt, centreId,
  mediaJson, shareToken, createdAt, updatedAt

program_journal_tags
  entryId, personId, personKind, role     -- who was involved, and how
```

- `kind` — `advice` | `contribution` | `issue` | `milestone` | `decision` | `note`.
  Covers "major advice, contributions, issues, everything".
- `status` — `open` | `in_progress` | `resolved` | `archived`. An issue is not
  just recorded, it is tracked to a resolution.
- `visibility` — `staff` | `community` | `public`, **defaulting to `staff`**.

### 4.2 The journalist role

Add `journal` to the capability list at `api/_lib/domain/admin.php:251` (today
`['content','people','inbox','settings','rbac','summer','club','audit']`), and a
Journal section to `ADMIN_SECTIONS` in `page-admin.jsx:45`. Authoring and
publishing gate on `admin_cap_gate($p, 'journal')`
(`api/_lib/domain/admin.php:26`). Reading follows `visibility`; being *tagged* in
an entry requires no capability at all.

### 4.3 Privacy, sharing, and the safeguarding constraint

Three levels, staff-only by default, so an entry naming a child is never exposed
by accident. Widening is an explicit, audited act (`audit('journal.visibility')`).

A `shareToken` mints a public link, but it **resolves only while
`visibility = 'public'`** — revoking visibility kills every link already sent.
This mirrors the gate-link model we have just been working in: the link is the
credential, and it stays revocable.

Public entries must pass the same consent check the public status board uses —
reuse the consent-ledger logic behind `api/public/status.php` so a child whose
guardian has withdrawn consent cannot appear in a publicly shared entry, and a
withdrawal takes effect on the next request rather than when a timer expires.

### 4.4 Memories — the Google Photos behaviour

A `Memories` rail at the top of the Journal destination, assembled server-side:

- **On this day** — entries from this date in previous weeks/years.
- **This week last term** — the same programme week, previous cohort.
- **Milestone resurfacing** — high-signal entries (`milestone`, or heavily
  reacted) resurfaced on a decay schedule.
- **Auto-collections** — "Alimosho, Week 3", "Every issue we resolved this
  term", built from `kind` + `centreId` + date, with a generated cover from
  `mediaJson`.

Each card respects the viewer's visibility level, so a member never sees a
staff-only memory. Generation runs in `web_cron_maintenance`
(`api/_lib/webcron.php:151`) and is cached per viewer-level — it is a read-heavy
view of immutable history, which is the ideal cache and a good use of the
smarter invalidation from 2.3.

### 4.5 Surfaces

- Community sidebar destination alongside `arcade` and `bookmarks`
  (`page-club.jsx:825-852`), reusing `community_mentions`
  (`community.php:394`) for people tagging and `community_post_shape`
  (`community.php:433`) conventions for consistent shaping.
- Admin authoring screen under the new Journal section.
- A public read view for shared entries, `noindex` by default — add `journal` to
  the `noindexPages` list in `app.jsx:215`.

---

## Sequencing

Workstream 1 and 2 first: they are a live defect, they are small relative to 3
and 4, and 3.5/4.4 both depend on the smarter caching from 2.

1. **1.1 flush fix** — smallest change, largest immediate effect. Ships alone.
2. **2.1 rate limits + 2.2 stale ceiling + 2.4 SW** — the rest of the "flaky
   submissions" picture.
3. **1.2 idempotency** — the precondition for retries.
4. **1.3 outbox** — across all intake forms.
5. **2.3 cache invalidation map.**
6. **3 Growth Potential** — model, then endpoint, then UI, then export.
7. **4 Program Journal** — schema + role, then authoring, then Memories.

Steps 1-2 are independently shippable and worth landing before the rest.

---

## Verification

**Automated** (all currently green: 1258 PHP · 362 UI smoke · 12 build):

- `php api/tests/run.php` — new cases for `intake_once` replay (same
  `submissionId` twice → one record, identical result), rate-limit exemption for
  replays, `cache_remember` stale ceiling, GPI scoring against a seeded cohort
  (known inputs → known score, plus the insufficient-data path), journal
  visibility matrix (staff/community/public × viewer level), and `shareToken`
  refusing to resolve after visibility is narrowed.
- `node tests/ui-smoke.js` — the Growth Potential section renders from a mocked
  workspace; the Journal destination renders and respects visibility.
- A new `tests/forms-offline.js`, modelled on the existing
  `tests/kiosk-offline.js` — real Chromium, real PHP server: fill the public
  sign-up form → go offline → submit → assert it is queued and the UI says so →
  come back online → assert exactly **one** student row appears. Then the same
  with a 60s-stalled response, asserting no duplicate on retry.

**Manual:**

- The flush fix cannot be reproduced under PHP-FPM. Verify with the built-in
  server or Apache `mod_php` (no `fastcgi_finish_request`): force a due job,
  submit a form, and confirm the response returns immediately instead of after
  the job. `php -S` is single-threaded and non-FPM, so it reproduces.
- Diagnostics → Background jobs: "Run now" (shipped earlier on this branch)
  makes the job timing controllable while testing this.

---

## Open risk

The GPI is a score attached to a named child, visible to staff. It predicts
disengagement, and a label like "at risk" can follow a student. Two guardrails
belong in the build, not as an afterthought: the score is **never** shown to the
student or their guardian, and every list is framed as *who to support this
week*, with reason codes, rather than a ranking of children. Worth an explicit
decision from the requester before 3 ships.
