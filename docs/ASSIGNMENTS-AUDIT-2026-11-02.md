# Assignments audit — 2 November 2026

Scope: `api/_lib/domain/assignments.php`, its schema, the web-cron job that
issues lesson homework, and the classic dashboard's hand-in. Tests are in
`api/tests/run.php` (block `AUDIT-ASG-2026-11-02`) unless named otherwise;
each was seen failing on the code before its fix.

## Found and fixed

| # | Sev | Defect | Fix | Test |
|---|---|---|---|---|
| 1 | High | A member at "egbeda " could hand in, but the Egbeda instructor's reach was an exact `in_array`: the hand-in was invisible, marking said `out_of_scope`, the missing list, audience preview and reminder skipped them. | `assignment_centre_key()` / `assignment_centre_in_scope()` (trim + lower case) used by every centre scope check. | `assign audit 1 · …` (7 checks) |
| 2 | Medium | Back to draft was allowed after work was handed in (members lost their marked work) and re-publishing told everyone again. | Draft refused while submissions exist (`has_submissions` + reason, status op and save); publish tells only members not told and not handed in, claimed through `assignment_notices` (migration 216). | `assign audit 2 · …` (6 checks) |
| 3 | Medium | Lesson homework: read-then-insert with no unique key, called from the list-view tick and web-cron alike, so a lesson could be issued and notified twice; the tick's read-then-write stamp was not atomic and its catch was silent. | `assignments.autoKey` UNIQUE for auto-issued rows (migration 217; MySQL backfill in `NGG_MYSQL_ROW_FIXUPS`), insert with `INSERT OR IGNORE` / `INSERT IGNORE`, notify only what landed; compare-and-swap tick claim; the catch logs `[assignments]`. | `assign audit 3 · …` (7 checks) |
| 4 | Medium | The classic dashboard (non-NGG, `?classic=1`) sent only text and one file, so step, link, photo and recording assignments were always refused. | `AssignmentCard` opens `AsdHandIn`, the NGG portal's panel. dist/ rebuilt. | `tests/assign-desk.test.js` (classic dashboard, 4 checks) |
| 5 | Low | MySQL `assignments.centre` VARCHAR(32), `track` VARCHAR(64); save accepted 80 — strict MySQL refused it. | Widened to 80 with `ALTER … MODIFY` in the mirror (precedent: migration 178); save caps are `ASG_CENTRE_MAX` / `ASG_TRACK_MAX`. | `assign audit 5 · …` (2 checks; 3 on MySQL) |
| 6 | Low | No automatic reminder; Remind was manual only. | Web-cron `assign_due` (daily): once per member, assignment and kind (`due_soon` within 36 h, `overdue` up to a week), through the desk's own wording. | `assign audit 6 · …` (6 checks) |

Also: `assignment_notices` is named in the member-merge policy (`MOVE_UNIQUE`).

## Still open

- Assignments published before migration 216 have no notice rows, so the
  first re-publish of one still tells its audience once more.
- A lesson already issued twice before migration 217 keeps its duplicate
  (unkeyed); staff close or delete it.
- `members.centre` on MySQL is still VARCHAR(32), narrower than `centres.name`
  (160); a centre name longer than 32 cannot be stored on a member there.
- The MySQL mirror replay reports pre-existing 1064 errors on MySQL 8 for
  columns named `rank` (`vol_tiers`, `mentors.rank`), unrelated to assignments.
- Suite baseline on 14 Nov 2026 has four failures outside assignments
  (three date-dependent mentor scorecard checks and "portal: reading an entry
  marks it read").
