# Mentor Portal — handoff (2026-10-16)

Branch: `claude/finme-dues-training-fees-l54o5j`. Baseline when this was written:
`php api/tests/run.php` → **4346 passed, 0 failed**. Node: test:build 31/31,
test:wisdom 49/49, test:routes 60/60, test:mentorship 28/28 (last run before the gate change — re-run it).
Read CLAUDE.md first. Schema target is **147**.

## The user's requirements (verbatim intent)
- "Give the mentor portal real functions… No low-grade implement. Clean, good
  structure. **Zero clashes with the old API and its endpoints.**"
- Record access: own caseload only, "lighter, more safe and community-driven".
- Every process must pass five tests: **Repeatability, Visibility,
  Accountability, Verification, Replication**.
- "All permissions are compulsory and should be granted by default" (latest
  message; interpreted as guardian/family notification prefs: checkin/weekly/alerts
  always on, not opt-out-able. NOT yet implemented, and NOT confirmed — ask the
  user once if unsure; it may instead mean mentor capabilities.)

## Architecture you need
- Live UI: legacy `MentorPortal` in `page-other.jsx` (v14 was withdrawn 10-13).
- Gate: `mentor_gate()` (`api/_lib/domain/mentor.php`) → lanes: admin, mentors row,
  volunteer mentor/instructor, volunteer Ops. `mp_gate()` / `mp_caseload_ids()` /
  `mp_role()` in `mentor-portal.php`. Record ops via `mentoring_open()` in
  `mentoring.php` (caseload-first, accountable 7-day cover: `mentoring_cover`,
  table `mentor_record_cover`, migration 147).
- Concerns go to `safeguarding_cases` through `mp_concern_file()`.
- Automations: `mentor-automations.php` (`MPA_JOBS`, web-cron `mpa_tick`).
- Design handoff: `Mentor Portal v15.dc.html` in the Dashboard_redesign_planning_3.zip
  the user attached (design_handoff_ngg_portals/designs/). Ask the user to re-attach
  it if it is not in the new session.

## Done (committed)
- Quote of the week (wisdom.php, qow.jsx) on home and Community.
- Live mentor fixes, jobs/goals/family/API fixes, caseload + cover model (147).
- Merged the account-safety audit (69184fc, 08bc84d); closed its S3:
  `public.session` now purged by topic `sessions` (admin_sessions_upsert).
  The audit's CLAUDE.md §6 rewrite (ADMIN_SECTIONS → CR_PAGES,
  src/modules/control/CONTRACT.md) is the user's decision — not done.
- **This commit — High 1 + Medium identity:**
  - `mentor_gate` carries `screened`. An unscreened mentors-row mentor gets
    `centres=[]`, `courses=[]` (reach nobody; every legacy op fails closed) but
    keeps `reportCentres/reportCourses` so `member_mp_concern` still works.
  - Volunteer mentor/instructor lanes refuse `not_cleared` unless
    `safeguarding='cleared'`. `mp_screened`/`mentoring_screened` just read `$g['screened']`.
  - Email fallback only binds an UNLINKED mentor row; a row bound to another
    memberId/volunteerId → `mentor_record_ambiguous` + ops_record.
    Volunteer email lookup fails closed on 2+ matches.
  - Tests: block "Gate lanes fail closed" at the end of run.php. **Known gap:**
    its star check calls `member.mentor.star`, which is not an op (passes
    vacuously). Change it to `behaviour.star.give` with `subjectId`/`stars`.

## Remaining, in priority order
1. **High 2** `member_mp_message_reply`: build thread id server-side, require a
   non-empty in-caseload subject, require screening (partly done: ownership by kind).
2. **High 3** `attention`: leads/coords only; route legacy concern flags to
   `safeguarding_cases` (partly done in mentor_attention).
3. A test calling EVERY legacy mentor action as an unassigned (and unscreened) mentor.
4. Medium: safeguarding case filing — adult/staff role + tight per-user limit;
   peer mentors (minors, `mp_role`='peer') must not see family-contact notes,
   update bodies, guardian name (`member_mp_mentee`), check-in notes or shared
   journals (`member_mp_messages`); per-child daily family-message cap; per-mentor
   rate limits with floors for `mentor.*` (currently per IP); register/review only
   on Saturdays ≤ today (`mp_recent_date` currently allows any day within 14);
   Academy retry limit (answer key already stripped).
5. Low: `member_mp_week` UPDATE inside a GET; relationship-save push dedupe;
   one mentor overwriting another's weekly review; `chat_send` ignores member
   status; hard-coded safeguarding phone → setting; crisis alert fallback when
   no officer email (notify leads/staff + ops_record); `retreat_book` swallows
   exceptions; misleading CSRF docblock; CSP unsafe-inline/eval; keep the 8 MB
   source map and `api/tests/run.php` out of `dist/`.
6. Then build **Mentor Portal v15** from the design, on the EXISTING ops
   (`member.mentor.*`, `mp_*`) — add ops, never rename or repurpose one.

## Conventions that bit this work
- Test fixtures for mentors need `checkedAt`; volunteers need `safeguarding => 'cleared'`.
- `??` on a legitimately-null reach falls through — use `array_key_exists`.
- MySQL mirror: data UPDATEs go in `NGG_MYSQL_ROW_FIXUPS`, not schema-mysql.sql.
- dist conflicts: `git checkout --theirs dist && node build.js`.
- A module-scope const referencing a later file's const crashes the SPA.
- Append to docs/HANDOFF.md; update docs/ADMIN-GUIDE.md for workflow changes.
