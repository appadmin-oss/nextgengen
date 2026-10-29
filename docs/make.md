# Make.com scenarios

NGG keeps every rule. Make does three things NGG cannot do on shared hosting:
keep time when nobody is visiting the site, hear an answer, and wait days for
a person. This page is the contract between the two, and the build sheet for
each scenario.

What Make never does: take consent (that is several explicit answers on NGG's
own form), issue or lift a sanction, charge a fee, or draw a card. A
guardian's reason is recorded **beside** an absence; whether it excuses the
absence is still a person's call on the conduct screen.

---

## 0 · Once, before any scenario

1. **Make: Scenario settings → "Data is confidential" → on**, for every
   scenario below. Without it Make keeps a copy of every payload (children's
   first names, guardians' numbers) in its run history. Choose the EU region
   when the organisation is created.
2. **NGG secret.** In `api/config.php`:
   ```php
   'hooks' => [
       'attendance_secret' => '…',
       'make_secret' => '<a long random string>',
   ],
   ```
   Empty means the door is off and answers 404. Keep this string in a Make
   **data store** or a scenario variable, never in a module's visible text.
3. **NGG → Make (events).** Control Room → Settings → Integrations → add a
   **Webhook** destination with the URL of a Make *Custom webhook* trigger,
   and subscribe it to the events that scenario needs (below). NGG signs every
   delivery (`docs/integrations.md` §2) and retries for up to eight attempts.
   One Make webhook can take several events and branch on the `event` field
   with a Router; separate webhooks per scenario are easier to read.
4. **Make → NGG (actions).** Every call back is an *HTTP → Make a request*:

   | Field | Value |
   |---|---|
   | URL | `https://<site>/api/hooks/make.php` |
   | Method | `POST` |
   | Body type | Raw, content type `application/json` |
   | Header `X-NGG-Timestamp` | `{{formatDate(now; "X")}}` |
   | Header `X-NGG-Signature` | `sha256={{sha256(TS + "." + BODY; "hex"; SECRET)}}` |

   Build `BODY` once in a *Set variable* module and send that exact string;
   the signature covers the bytes, so a body re-serialised between signing
   and sending is refused. Requests more than five minutes old are refused.

### The actions

| `action` | Send | Get back |
|---|---|---|
| `absence.reason` | `ref`, `reason` (`sick` · `travelled` · `family` · `other`), optional `note`, `channel`, `messageId` | `{ref, reason, replaced}` |
| `safeguarding.ack` | `ref`, `by` (a name), optional `channel`, `messageId` | `{already, ackBy, ackAt}` — the first acknowledgement stands |
| `safeguarding.status` | `ref` | `{acknowledged, ackBy, ackAt, reviewedAt}` — reviewed on the Behaviour screen counts |
| `registration.status` | `ref` (the participant id from the event) | `{status, verified, hoursPending}` |
| `editions` | — | the editions, newest first, with dates and counts |
| `impact` | `month` (`YYYY-MM`; a bad value means last month) | totals and per-centre counts — never a name |
| `jobs` | — | each background job's age, `stale` per job, `healthy` overall |

Errors come back as `{ok:false, error}` with 400 (bad input), 401 (signature),
404 (`not_found`) — `unknown_action` lists the actions there are.

### The events

| Event | Fired | Carries |
|---|---|---|
| `private.attendance.absences` | hourly, after the nightly absence sweep; once per centre per day | `centre`, `date`, `reasons`, `items[]`: `ref`, `personType`, `firstName`, `guardianName`, `guardianPhone` (E.164) |
| `private.registration.stalled` | 48 hours after a registration without consent | `ref`, `firstName`, `centre`, `guardianName`, `guardianPhone`, `verifyUrl`, `hoursPending` |
| `safeguarding.flag` | with every `behaviour.flagged` | `ref`, `category`, `severity`, `source`, `centre`, `flaggedAt`, `adminUrl` — no name, no note |
| `safeguarding.acknowledged` | when `safeguarding.ack` lands | `ref`, `severity`, `centre`, `by`, `channel` |
| `absence.reason` | when `absence.reason` lands | `ref`, `centre`, `date`, `reason` |
| `edition.milestone` | once per edition per milestone | `editionId`, `name`, `milestone`, `startDate`, `endDate`, `daysToStart`, `daysToEnd` |

A `private.` event reaches **only** a destination that names it exactly — a
Chat room subscribed to `*` never receives a guardian's number. The absence
list is not even built until a destination names it.

Milestones: `starts_in_42`, `starts_in_14`, `started`, `ends_in_7`, `ended`.
One already overtaken when the dates were set is skipped, not sent late.

---

## 1 · Heartbeat and watchdog — build this first

NGG's background work runs on visitor traffic. A quiet weekend is a weekend
with no reminders, no absence sweep and no season close.

- **Heartbeat** — three scenarios, each one *HTTP → Get a file* (or Make a
  request) on a schedule:
  - every 15 min: `https://<site>/api/public/cron.php?key=<cron_key>&job=reminders`
  - every hour: `…&job=maint`
  - daily, 02:00: `…&job=accrue`
  Plus `…&job=deliver` every 5 minutes if Chat or Make deliveries matter
  within minutes. `cron_key` is in `api/config.php`.
- **Watchdog** — hourly: `{"action":"jobs"}` → *Filter* `healthy = false` →
  WhatsApp/email the ops lead with the stale job names. Also poll
  `/api/public/health.php` and alert on any status other than 200.

Cost: roughly 4,000 operations a month with `deliver` included, 1,500 without.

## 2 · Consent ladder

Subscribe: `private.registration.stalled`.

1. Trigger → WhatsApp the guardian the `verifyUrl` (business-initiated, so an
   approved *template* message: "{{firstName}}'s place at NGG Summer School is
   waiting for your consent. It takes a minute: {{verifyUrl}}").
2. *Sleep* is capped at 5 minutes in Make, so store `ref` + `askedAt` in a
   **data store** and run a second scenario hourly over the store.
3. At +24h: `{"action":"registration.status","ref":…}` → if `verified`, delete
   the record; else WhatsApp again, naming the centre.
4. At +48h, still not verified: a call task for the centre coordinator (Chat
   card or a row in their sheet) with the guardian's name and number.

## 3 · Why were they away?

Subscribe: `private.attendance.absences`.

1. Trigger → *Iterator* over `items` → WhatsApp template with four
   quick-reply buttons: Sick · Travelled · Family matter · Other. Put the
   `ref` in the button payloads (`AB-…|sick`).
2. A second scenario on WhatsApp's *Watch events* (incoming message) → split
   the button payload → `{"action":"absence.reason","ref":…,"reason":…,
   "channel":"whatsapp","messageId":…}`. A free-text reply after "Other" can
   go in `note`.
3. Staff see "Guardian says: Sick (whatsapp)" beside the absence on the
   conduct screens and decide whether to void it.

Answers are accepted for 14 days; a later answer replaces an earlier one.

## 4 · Safeguarding escalation

Subscribe: `safeguarding.flag`. Nothing about the child leaves NGG — the
message carries the reference, severity, centre and `adminUrl`, and whoever
acts signs in to read who and what.

1. Trigger → message the safeguarding lead with an "I've got this" button
   whose payload is the `ref`; store `ref` + time in a data store.
2. Their tap → `{"action":"safeguarding.ack","ref":…,"by":"<their name>"}`.
3. A scenario every 15 minutes over the store:
   `{"action":"safeguarding.status","ref":…}` → acknowledged → delete;
   not after 2 hours → the deputy; not after 6 → the director.

Marking the log reviewed on the Behaviour screen also stops the ladder. The
Behaviour drawer shows who acknowledged and how.

## 5 · The Summer School season

Subscribe: `edition.milestone`. Read dates with `{"action":"editions"}` —
never type them into Make; a second calendar disagrees within a season.

| Milestone | Do |
|---|---|
| `starts_in_42` | re-enrolment invitations to last edition's guardians, by centre |
| `starts_in_14` | volunteer rota confirmations; chase missing ID photos |
| `started` | weekly attendance summary per centre to coordinators (`impact`) |
| `ends_in_7` | feedback form to guardians |
| `ended` | season report from `impact` for the edition's months |

## 6 · Monthly impact report

Scheduled, 1st of the month: `{"action":"impact"}` (last month) → fill a
Google Docs or Slides template → share with the director. Every figure is a
count; `attendanceRate` is check-ins ÷ (check-ins + absences logged), so it is
measured against the days people were expected.

---

## What it costs, roughly

| Scenario | Operations a month |
|---|---|
| Heartbeat + watchdog | 1,500–4,000 |
| Consent ladder | ~3 per stalled registration |
| Absence reasons | ~2 per absent child, plus 1 per answer |
| Safeguarding | a handful per flag |
| Season, impact | a few hundred |

Never route `attendance.marked` through Make — hundreds a day spends the
credits in a week; the per-centre absence list is the digest instead.

## What stays out of Make

The CACENTRE gate, NGV promotion and the locations sync (signed, tested, need
answers in seconds); card rendering (one renderer per card); consent, fees and
sanctions (rules live in NGG).
