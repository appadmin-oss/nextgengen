# NGG ↔ Afrovanguard sync

NGG (Next Generation Genius) is an Afrovanguard programme — its mentorship runs
inside the wider **Street-To-Stardom** network. This document describes how the
two independent sites (separate codebases, separate databases) stay in sync.

## What syncs, and which way

| Data | Direction | Mechanism | Source of truth |
|------|-----------|-----------|-----------------|
| Approved mentor / volunteer pool | Afrovanguard → NGG | pull (cron) | Afrovanguard |
| Promotion to NextGen Vanguard (NGV) | NGG → Afrovanguard | push (signed webhook) | NGG |
| NGV standing ended (demoted, erased, consent withdrawn) | NGG → Afrovanguard | push (signed webhook) | NGG |
| NGG volunteers and the sessions they served | NGG → Afrovanguard | pull (signed, `api/hooks/afrovanguard.php`) | NGG |

NGG mirrors Afrovanguard's **approved** mentors into its own `mentors` table
with `source='afrovanguard'`, so the Control Room and the public mentor strip
show one combined pool. NGG's own (`source='ngg'`) mentors are never touched.

The seam is deliberately built on infrastructure both sites already have, so it
is secure and reversible:

- **Afrovanguard side** — the existing **inbound integrations API**
  (`integrations/api.php`) authenticated by a scoped **App Token**
  (Studio → Webhooks → API tokens). A new scope `mentors:read` unlocks:

  ```
  GET /integrations/api.php?action=mentors.directory[&segment=org|external][&limit=]
  Authorization: Bearer av_int_…
  → { ok, program, count, generated_at, mentors:[ {ref,name,email,segment,headline,focus,capacity,accepting,active_mentees}, … ] }
  ```

  `ref` (`av-mentor-<id>`) is a stable cross-site key. The payload is PII-light
  and read-only; the token is scoped to exactly this.

- **NGG side** — `api/tools/sync-afrovanguard.php` (CLI + cron). It pulls the
  directory and upserts each mentor keyed by `ref` (→ `mentorId`), mapping
  `accepting` → `status`, `focus` → `tracks/skills`, `capacity` → `maxMentees`,
  and stamping `source='afrovanguard'`, `program`, `afrovanguardRef`. Mentors
  that drop out of the approved pool are soft-retired (`status='inactive'`).

## Setup

1. **Afrovanguard** — Studio → Webhooks → API tokens → create a token named
   e.g. `NGG mentor sync` with the **`mentors:read`** scope. Copy the
   `av_int_…` value (shown once).
2. **NGG** — in `api/config.php` set:
   ```php
   'afrovanguard' => [
       // …existing links…
       'api_base'  => 'https://afrovanguard.org.ng/integrations/api.php',
       'api_token' => 'av_int_…',   // the token from step 1
   ],
   ```
3. **Cron** (NGG host), e.g. every 6 hours:
   ```
   0 */6 * * *  php /home/USER/public_html/api/tools/sync-afrovanguard.php >/dev/null 2>&1
   ```
   Run `php api/tools/sync-afrovanguard.php --dry-run` first to preview. Leaving
   `api_token` empty disables the sync (no-op).

## Verified

End-to-end over HTTP: an approved Afrovanguard mentor is served by
`mentors.directory` and mirrored into NGG's `mentors` table as an
`afrovanguard`-sourced row, with `accepting=false` correctly mapping to
`status='inactive'`. Re-runs are idempotent (keyed on `ref`).

## Extending

The same pattern (scoped App Token in, cron/webhook out) covers future flows —
e.g. NGG mentor **applications** pushed back to Afrovanguard via
`POST ?action=event {type:"mentor.application", …}` (scope `events:write`),
which fans out through Afrovanguard's webhook system.

## NGV promotion push (NGG → Afrovanguard)

When NGG promotes a member to NextGen Vanguard, it tells Afrovanguard, which
opens or finds their account and enrols them (`integrations/ngg.php` →
`lib/NgvIntake.php` there). Code: `api/_lib/domain/ngv-portal.php`.

**Transport.** NGG's integration bus, as a generic signed webhook to the
destination `INT-AV-NGV` (created from config on first use; an older row is
brought up to date). Retried with backoff until Afrovanguard answers 2xx.

```
POST {afrovanguard.ngv_webhook_url | org_url + /integrations/ngg.php}
X-NGG-Event:     private.ngv.account | private.ngv.revoked
X-NGG-Delivery:  the event id (the same on every retry)
X-NGG-Timestamp: unix seconds
X-NGG-Signature: sha256=hex(HMAC_SHA256(secret, timestamp + "." + body))
body: {id, event, createdAt, data}
```

`secret` is `afrovanguard.ngv_webhook_secret` in NGG's `config.php`, and the
same value as `NGG_WEBHOOK_SECRET` on Afrovanguard. Empty means nothing is
sent. Both events are `private.`: the bus delivers them only to a destination
that names them exactly, never to a `*` or prefix subscriber such as a chat
room.

### `private.ngv.account`: promoted

| Field | |
|---|---|
| `nggMemberId` | NGG member id; Afrovanguard's idempotency key |
| `name`, `email` (lower-cased), `phone`, `centre`, `dob`, `track`, `displayId`, `volunteerId` | what opening the account needs; no guardian, school or notes |
| `minor` | bool: under 18, **or no usable date of birth** (treated as a minor) |
| `guardianConsent` | `{status, method, at, by}` |

`guardianConsent.status`:

- `granted`: the latest `ngv_transfer` row in NGG's consent ledger is a
  grant. `method` is how it was obtained, `at` is when it was recorded (ISO
  8601 UTC), and `by` is the **guardian's** name (never the staff member who
  recorded it).
- `none`: a minor with no grant. NGG does not send these. Promotion is
  refused (`guardian_consent_required`) and the re-send / "Send NGVs" sync
  holds them back, but the value is defined so the contract is total.
- `n/a`: an adult (`minor: false`). `method`, `at` and `by` are `''`.

**Afrovanguard enforces this:** an intake with `minor: true` must carry
`guardianConsent.status = "granted"`, or it is held.

The consent is type `ngv_transfer` ("Share my child's details with
Afrovanguard's NextGen Vanguard"). It is recorded per child in the Control
Room under the member's **Publication consent**, with the method and the
guardian's name. The bulk desk refuses it, because one name cannot stand for
every family. It is not on the Summer School forms.

### `private.ngv.revoked`: no longer a vanguard

```
data: {nggMemberId, volunteerId, reason, at}
reason: demoted | erased | consent_withdrawn
```

Afrovanguard's `NgvIntake::revoke()` needs only `nggMemberId`. It withdraws
them there and voids the card. The other fields are for its log. Nothing
personal travels with this event. Sent when:

- a member is **demoted** from NGV (`admin.members.demoteNgv`);
- a member who was ever put forward for NGV is **erased**;
- a guardian's `ngv_transfer` is **withdrawn** (the latest row is not a
  grant) for a minor who is an NGV. An adult never needed it, so recording
  one for an adult changes nothing.

**Backfill.** The Control Room's "Send NGVs to Afrovanguard" (op
`admin.members.ngvPortalSync`) re-announces everyone promoted *and* re-sends
`private.ngv.revoked` for everyone who was promoted and has since been
demoted, erased, or had the consent withdrawn. Both sides are idempotent. The
result reports `announced`, `delivered`, `heldForConsent` and `revoked`. A
minor promoted before the consent rule, with **no** `ngv_transfer` row at
all, is not revoked automatically: nobody withdrew anything. Such a minor is
held (never re-sent), and revoking them is a decision for staff.

### Volunteer feeds (Afrovanguard pulls)

`av_volunteer_feed` and `av_volunteer_sessions` leave out `photoUrl`,
`email` and `phone` (sessions: `email`) for a promoted member who is a minor
without a granted `ngv_transfer`.

