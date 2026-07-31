# Plan — Growth Potential analytics · Program Journal · Form reliability & caching

Status: **delivered** · Branch: `claude/gate-links-staff-desk-4g73f9`

> All four workstreams shipped. Two things changed from the plan during
> implementation, both because reality disagreed with it:
>
> - **The forms defect was not what §1.1 predicted.** The `web_cron_run` flush
>   gap is real and is fixed, but the reason the public form would not submit was
>   a lossy route file: `public/selfreg.php` forwarded `$res['error']` only, and a
>   field-level rejection arrives as `errors` (plural) with no `error` key — so
>   the family got `{"error":"failed"}` and the fall-through message blamed the
>   connection. `public/gate.php` already forwarded the whole refusal, which is
>   why the staff desk worked and the public form did not. An HTTP-level test now
>   guards it; the domain-level suite could never have seen it.
> - **The `post_max_size` theory in §1.3 was half right, and it was a second,
>   separate bug.** It was not the cause of "the form does not submit" — `php -S`
>   accepted a 10.6MB body cleanly, so it was recorded as a deployment risk
>   rather than a diagnosis. It then turned up in production exactly as
>   predicted, as a bare `413` on `selfreg.php`. The public form was the one
>   surface that embedded its headshot inline (no session, so no signed upload)
>   and it did so with a raw `FileReader`, bypassing the resampler every other
>   upload path already went through. Fixed at the source rather than by asking
>   hosts to raise a limit: the file is resampled to 1000px/q0.78 before it
>   becomes a data URL, which takes a 6.9MB photo to well under nginx's 1MB
>   `client_max_body_size` default. `tests/forms-selfreg-ui.js` asserts both the
>   ratio and the bytes actually put on the wire.
>
> One thing was found only by running it: the Growth index was scoring children
> for weeks *before they enrolled*, manufacturing a "was away, now returning"
> curve. Fixed by windowing from `enrolledAt`.

### Follow-up: date of birth, and consent in one tick

Three later changes to the same public form, requested after it was in use:

1. **Age → date of birth.** The form asks for a birthday and the age is derived
   on submit (`dob_age`), so a family cannot type an age that disagrees with it
   and the age cannot silently go stale across a season. Every downstream
   reader still sees `age`, so no report, band or eligibility rule changed.
   Migration 72 adds `summer_students.dob`; a seed regenerates the
   auto-published `summer-reg` form. Forms an admin published by hand are left
   alone deliberately and keep working through the `age` fallback.

2. **The 413** — see above.

3. **Consent in one tick, taken here, with no second email.** The desk flow
   splits consent from registration for a good reason: a volunteer typing a
   family's answers cannot consent for them, so the guardian gets a link. The
   self-serve form is the opposite case — the guardian is the one filling it in.
   Emailing them a link to re-consent to clauses they just read added a day of
   latency and everything email deliverability can cost, and bought nothing. So
   `selfreg_submit` now records the ledger at submit time
   (`selfreg_record_consents`, `method = 'self_serve'`) and `selfreg_approve`
   goes straight to `verified` and issues the ID instead of parking the row at
   `parent_pending`.

   **One deliberate deviation from "all consent is required", and it is not a
   style choice.** Permission to *publish* a child's photograph (`media`,
   `site_visibility`) is asked separately and either answer is accepted. Consent
   is not freely given if refusing it costs a child their place, which is
   precisely what the NDPA means by consent — bundling publication into a
   mandatory tick would make every publication permission the programme holds
   worthless, and the publication itself unlawful. The mandatory tick therefore
   covers participation, medical, data, trips and comms; publication sits below
   it, clearly optional, and the review desk shows the answer next to the photo
   so a reviewer cannot assume yes. `CONSENT_PUBLICATION` names the split in one
   place and the test suite pins it.

   The one message that still goes out is the one families actually want: the
   Genius ID, after approval, once there is an ID to send.

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

---

## Follow-up: photos with no Cloudinary, the caching layer, DOB, and the ID cards

Six things, reported from a live deployment. Grouped because five of the six had
the same root shape: something worked on the machine it was built on and quietly
did not work on a host configured differently.

### 1 · Headshots vanished without Cloudinary

Cloudinary needs three keys in `api/config.php`. Until they are set there is
nowhere to upload to, and every intake path treated that as an error in its own
way: `apply.php` truncated an inline data URL to 512 characters of base64,
`reshoot_submit` refused it as `bad_photo`, `gate_register` dropped it, and
`admin_photo_replace` refused a replacement. The public form's photo was
discarded silently — so a registration succeeded and the review desk, whose only
job is to look at a photograph, rendered an empty frame.

There was also a dead line making it worse: `gate_register` read
`$ing['url']` from `photo_ingest`, which has never returned a `url` key. The
write-back could never have fired.

Fixed by holding the bytes ourselves:

- `photo_store_put` / `api/public/photo.php` — a content-addressed local store.
  The id is an **HMAC of the file's bytes under `cookie_secret`**, not a bare
  hash: a bare hash would let anyone holding a copy of a child's photograph
  confirm it is in the system and fetch it back. Served `immutable` for a year,
  because the id *is* the bytes.
- `photo_intake_url` — the one door every intake path now uses. Hosted URL passes
  through; inline data URL is persisted and replaced by its served URL.
- The governed pipeline still runs on top when there is a cloud, fed the
  absolute URL (Cloudinary and the vision model have to *fetch* the image), and
  `photo_apply_to_subject` relativises before writing — a stored absolute URL
  bakes in today's hostname.
- `photo_store_sweep` in maintenance: write-on-intake plus a refusable intake
  means abandoned originals, and a shared host's disk quota is a bad way to find
  that out. Conservative — a week old before it is a candidate, and it does
  nothing at all if it cannot read what is referenced.
- Client side, `NGGApi.uploadOrInline` replaces the try-public-then-signed-then-
  give-up dance at every headshot surface. "Photo uploads aren't set up on this
  server yet — skip for now" is gone.

`api/storage/.htaccess` now guards the deny in both Apache syntaxes. It was 2.4
only, which 500s a 2.2 host; that directory holds children's photographs.

### 2 · A 401 on the review desk read as a broken connection

`require_session()` answers `unauthorized` with no session and `session_expired`
when a kiosk one idles out. Twelve hours is a working day, so the second is the
one a real reviewer hits — and the desk only recognised the first, falling
through to "couldn't load, check your connection" with no way back. `DESK_RELOCK`
now covers both on both desks.

### 3 · A 504 "Offline and not cached" on an ordinary route

Two independent causes, both in the service worker:

- `cache.addAll()` is one promise over the whole precache list, so **one** entry
  that 404s rejects it and nothing at all is cached — and the rejection was
  swallowed by an offline-tolerant `catch`, leaving a worker that is installed,
  active, and holding an empty cache. Entries are now cached individually.
- The navigation fallback matched the request URL exactly, so `/review?g=…` never
  hit the cached shell. Now `ignoreSearch`, with an inline offline page as the
  last resort — a navigation always gets a document.

### 4 · Real cache busting

Freshness rested on the worker being network-first for fixed-name entry files
plus a `no-store` header, both of which a host, proxy or CDN can override. Moved
to per-file content hashes: `app.<tag>.min.js`, `styles.<tag>.css`. `index.html`
is the only no-cache file and it names the current set; the hashed files are
`immutable` for a year and never revalidated. Per-file rather than one build id,
so a CSS-only deploy does not re-issue a 1.3MB bundle. The plain names still ship
for anything that hard-codes them, served must-revalidate.

### 5 · The DOB was not stored on the admin path

The public form asked for a birthday and stored one; `admin_summer_enroll` — which
the desk *and* the CSV importer both go through — took only a typed age and never
wrote `dob`. An age is right for exactly one season, so those rows go silently
wrong at the next intake. The date is now accepted and wins over a typed age when
both are given; it stays optional, because a desk sometimes genuinely only has an
age, and the roster shows which rows those are rather than hiding it.

### 6 · Centre colour on the volunteer ID, made context-aware

The band, ring and code chip existed but were hard-coded to white text with a
drop shadow. Centre colours are picked by an admin, so:

- Ink is now derived from the colour's luminance (`cardInk`), thresholded a
  little earlier than the screen-perfect 0.5 — ink on card stock reads darker
  than a backlit pixel, and these get printed.
- A centre colour perceptually close to the tier frame it sits inside gains a
  keyline (`cardColorsClash`, redmean distance). The white gutter alone was not
  enough for a maroon frame around a red band, and the palette is editable so no
  fixed pairing can be relied on.
- A volunteer with no single site gets the programme mark instead of a hole — two
  card geometries in one print run reads as a misprint, not as "works
  everywhere".
- Long centre names scale to fit rather than running off the end.
- An instructor's **faculty** joins their role on the back: "INSTRUCTOR" is the
  least identifying thing you can print at a site where every third person is one.

### 7 · Closing the public sign-up, through validity rather than beside it

There was already a mechanism that decides whether a public link accepts
submissions: the gate's validity window. Adding a separate global "closed" flag
would have created a second source of truth about the same question, and the
first time the two disagreed nobody would know which one was authoritative. So
closing sign-ups **is** expiring the gate — `selfreg_gate_expired()` is the only
check, and the admin action sets validity.

The screen a parent then sees is deliberately generic. An earlier cut listed
centres with addresses and a reopening date, which is wrong on both counts: the
list goes stale silently, and a date the programme has not committed to becomes a
promise. It now says the link is fine, that nothing they did is wrong, that they
can register in person at their nearest NGG centre, and that the link will work
again — plus one optional free-text note an admin can set for the current
closure.

### 8 · Level 6 deepened — dose–response, power, and who the average is made of

Level 6 could compare periods, segments, weekdays and intakes, but every panel
answered "what happened" and none answered "so what". Three additions, each
chosen because nothing already on the page could substitute for it:

- **Dose–response** (`an_correlate`, `an_dose_response`). Each child's own
  attendance rate against their own outcome — average graded score, and mentor
  stars per day attended. The finding worth having is the *absence* of an
  association: if the children who come twice as often do no better, more
  attendance is not the lever, and the question becomes what happens in the
  sessions. Children with no recorded outcome are excluded rather than entered as
  zero, and the screen states the coverage, because scoring nothing is not
  scoring badly and treating it as such manufactures the association.
  Stars are divided by **days attended**, not days enrolled — a star can only be
  given on a day the child is present, so a raw total (and equally a
  per-opportunity-day rate) has the dose baked into the outcome and the
  correlation would restate the input.
- **Minimum detectable effect** (`an_detectable`). What "not significant" leaves
  open. At ten children per group nothing under about 25 points is visible, so a
  real 15-point gap and no gap at all produce the same verdict. Keyed on the
  number of children, not child-days, for the same clustering reason the z-test
  is. A flat period result now carries this sentence rather than standing alone.
- **Concentration** (`an_concentration`). A Gini over per-child rates plus the
  share of attendance held by the best- and weakest-attending thirds. "50%
  attendance" is either everyone coming half the time or half the children
  coming always and half never — a healthy programme and a retention emergency
  wearing the same number, and the average is the one statistic guaranteed not to
  tell them apart.

All three refuse to print below the ten-child floor rather than returning a
number, and all three appear in the published method list.
