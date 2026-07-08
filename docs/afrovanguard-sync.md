# NGG ↔ Afrovanguard sync

NGG (Next Generation Genius) is an Afrovanguard programme — its mentorship runs
inside the wider **Street-To-Stardom** network. This document describes how the
two independent sites (separate codebases, separate databases) stay in sync.

## What syncs, and which way

| Data | Direction | Mechanism | Source of truth |
|------|-----------|-----------|-----------------|
| Approved mentor / volunteer pool | Afrovanguard → NGG | pull (cron) | Afrovanguard |

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
