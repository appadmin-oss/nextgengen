# NGG — The NGGC 2040 brief, audited against the branch (2026-09-17)

Branch audited: `claude/community-audit-1aqug7`, at `d61fceb` before this
session's work — then re-checked against `52e6a06` after merging the
thirty-seven commits the branch had gained in parallel (the route registry,
the Summer School edition/group split, the two card studios, `CLAUDE.md`).
Findings below are stated against the merged tree; where the merge changed a
finding, it says so.
Subject: the **NGGC 2040 Human Capital Formation & Leadership Development
Brief** — twenty-four sections defining what the Next Generation Genius Club
is for — read clause by clause against what the codebase actually does.

This is not a general code audit; `LATEST-BRANCH-AUDIT-2026-07.md` and
`PRODUCT-DESIGN-AUDIT.md` are that, and their open findings still stand. This
asks one narrower question: **the brief says the programme measures X — does
anything in this system measure X?**

Every claim below carries a `file:line` you can open. Where the answer is
"partly", the gap is named rather than rounded up to a yes.

---

## Summary

Of the brief's twenty-four sections, the branch already implemented more than
a reading of it would suggest — the Anchor Journal, musing, dues and fines,
attendance, mentor meetings and goals, chess and tournaments are all real,
shipped and tested. The gaps were concentrated in three places:

| | State before this session | Now |
|---|---|---|
| The brief as a public statement | Nowhere on the site | `/about` |
| The brief as data the code shares | Retyped per surface, or absent | `formation.jsx` |
| Courage Index (§14) | **Nothing at all** | Implemented end to end |
| The four divisions (§5) | **No data model** | Doctrine only — see G1 |
| Mentor's weekly review (§18) | **Nothing at all** | Doctrine only — see G2 |
| NGG → NGV progression (§20) | Free-text column | Unchanged — see G3 |

The remaining gaps are written up below with what each would take. They are
**not** implemented, and this document does not claim otherwise.

---

## What the brief asks for, and what exists

### Implemented before this session — verified

**§8 Musing Time.** Real, and older than the brief's framing of it. A musing
window is a policy setting with an end time (`api/_lib/domain/policy.php:342`,
`'musing' => ['enabled' => true, 'endsAt' => '08:00']`), the Anchor Journal
collects the reflection (`journal/app.jsx:157`, `:426`), and it round-trips
through `member_state`. The brief's nine prompts are not the ones the journal
asks, which is a content decision rather than a gap.

**§10 Anchor Journal.** Substantial — a whole PWA (`journal/app.jsx`, 2,000+
lines) with reflections, streaks, XP, a coach, goals and a circle. The brief's
specific nine-block weekly structure (VALUE / VISION / VIRTUE / REFLECTION /
FAILURE / COURAGE / RESPONSIBILITY / IMPACT / NEXT MOVE) is **not** the
journal's schema; the phrase "Values·Vision·Virtues" appears once as marketing
copy at `page-other.jsx:1724` and nowhere as a data structure. The nine blocks
now exist as doctrine (`formation.jsx`, `NGGC_ANCHOR_JOURNAL`, each with a
stable `key` deliberately safe to persist against an entry) so that adopting
them is a schema change and not also a transcription exercise.

**§11 Community participation.** The Community workspace is one of the largest
subsystems in the product — channels, posts, reactions, stars, homework,
reports (`api/_lib/domain/community.php`, `community-engagement.php`). It
measures participation richly. It does not measure it against the brief's ten
marks, which are about usefulness to others rather than activity.

**§12 Chess.** Extensive and genuinely good: an engine (`chess-engine.jsx`,
66KB), clock, variants, social play, tournaments with pairing
(`api/_lib/domain/tournaments.php`, `tournament-pairing.php`), match review.
Games, wins, losses and tournament participation are all recorded. What the
brief asks for beyond statistics — the debrief, and the mapping from board
behaviour to leadership behaviour — is not in the product; it is now at least
stated publicly on `/about` and held as data in `NGGC_CHESS.mirrors`.

**§13 Dues, fines & financial responsibility.** Fully implemented and the most
carefully reasoned subsystem in the codebase. A real ledger with an accrual
engine, uprating, tenure, compliance cutoffs and a member statement
(`api/_lib/domain/fees.php`, 850+ lines; `member-self.php:101`). Fines exist,
and so do the brief's safeguards: members can appeal through
`member_requests`, the schema comment at `db/schema-mysql.sql` is explicit that
"a member confirming their own payment is not a thing this ledger will ever
accept", and guardians see it. The brief's §13 could have been written from
this code.

**§17 Member dashboard.** Six of the brief's seven groups have real surfaces —
identity, discipline (attendance), competence (assignments, assessments,
certificates), chess, financial accountability, leadership (profile projects,
stars). Formation was the one with a hole in it, which is §14 below.

**§7 / §18 The mentor system.** `api/_lib/domain/mentoring.php` is the right
shape: meetings (what was discussed, what was agreed, whether it needs a
lead's attention) and goals with dates and closure, gated on the subject and
not merely the requester, with an explicit and correct comment that none of it
is ever returned to the child's own portal. The mentor portal
(`page-other.jsx:7120`) is real and photographed by `tests/mentor-shot.js`.

### Implemented in this session

**§14 The Courage Index.** Was absent entirely — `grep -ri "courage"` before
this session returned marketing prose and nothing else. Now: schema 112
(`courage_marks`, both drivers), `courage_index()` / `courage_mark_save()` /
`member_courage()` in `api/_lib/domain/mentoring.php`, routes at
`api/_lib/backend.php:51` and `:285`, a mentor tab (`McCourage`,
`page-other.jsx`), the member's own card (`DashCourage`,
`page-dashboard.jsx`), and 19 assertions in `api/tests/run.php`.

Three of the brief's constraints are enforced rather than documented: a mark
without an observed instance is refused (`evidence_required`); the index is a
mean over 120 days rather than the latest mark; and there is no cohort-wide
board anywhere, asserted by a test, because a courage leaderboard is how the
brief's "the objective is not to create reckless children" quietly stops being
true.

**§1–§24 as a public statement.** `/about` (`page-about.jsx`), rendered from
`formation.jsx` rather than retyped, with 62 assertions in
`tests/about-page.test.js` covering both the doctrine's arithmetic and the
eight places a page has to be registered to be reachable.

---

## Gaps that remain

Each was re-checked against the merged tree, not just the tree they were found
in: `grep -c division db/schema-mysql.sql` is still 0, `mentors.email` still
carries no `UNIQUE`, nothing in `api/_lib/domain/` mentions a weekly review,
and `members.level` still has no closed set.


### G1. The four professional divisions have no data model — High

`§5` defines four divisions and assigns every member to one. The schema has no
such column: `grep -c division db/schema-mysql.sql` returns **0**. What exists
instead is `members.track` (a free string — "Music", "Tech", "Robotics") and
`members.disciplines` (a comma list, `members-import.php:43`). Neither is the
brief's taxonomy, and neither is closed.

Consequence: the programme cannot answer "how many members are in Technology &
Applied Engineering", cannot report per-division, and cannot enforce that
chess is taken across all four — which is §6's entire point.

What it would take: a `division` column on `members` (closed set of the four
ids already in `NGGC_DIVISIONS`), a backfill mapping the existing `track`
values onto it, the admin member form and the roster importer teaching it, and
per-division reporting in `analytics.php`. The doctrine half is done —
`nggcDivision()` resolves by id or name and returns the mandate, courses and
brand colour — so this is a schema and UI change, not a content one.

### G2. The mentor's weekly review is not a surface — Medium

`§18` lists twelve questions a mentor should be able to answer for every
assigned member every week. Nothing prompts them, nothing records the answers,
and nothing shows a lead which members went a week without being reviewed.
`mentor_attention()` (`api/_lib/domain/mentoring.php`) is the nearest thing —
it surfaces flagged concerns and overdue goals, which is a queue of exceptions
rather than a review cadence.

The questions now exist as `NGGC_WEEKLY_REVIEW` and are published on `/about`,
so a mentor can at least read what is expected of them. Turning that into a
weekly review record would reuse the `mentor_meetings` shape almost exactly.

### G3. `members.level` is unvalidated free text — Medium

`§20` is emphatic that NGG → NGV is evidence of formation and never time
served. The column that carries it (`db/schema-mysql.sql:2355`,
`ALTER TABLE members ADD COLUMN level VARCHAR(16) DEFAULT ''`) accepts any
string: the admin upsert lists `level` among the free columns
(`api/_lib/domain/admin.php:254`) with no enum, and the importer merely
uppercases and truncates it (`members-import.php:234`). There is no promotion
event, no record of who promoted whom or on what evidence, and no constraint
stopping two spellings of the same rung coexisting.

`NGGC_PROGRESSION` now states what each rung means. Enforcing it needs a closed
set plus a promotion record — which is the same shape as the awards ledger
already in the schema.

### G4. `mentors.email` has no uniqueness constraint — Medium

Found by accident: a test fixture of mine reused an email another fixture
already used, and the second mentor row silently took over the first one's
cohort scope. The gate resolves a person to a mentor by email and takes a row;
with two rows it takes whichever comes back first, so a duplicate record
**changes what children an adult can see and mark**. `db/schema-mysql.sql:34`
has no `UNIQUE` on `mentors.email`, and `admin_mentors_upsert` does not check
for one.

This is a safeguarding-adjacent access-control issue, not just hygiene. Fixing
it means a uniqueness constraint, a de-duplication pass over existing rows
(`merge.php` already exists for members and is the model), and a check in the
upsert. **Not fixed here** — it needs a data migration decision about existing
duplicates that is the programme's to make, not mine.

### G5. ~~Four dashboard tabs are 36px against a 44px floor~~ — fixed upstream

Recorded because it was found and then closed while this was being written,
and the sequence is worth keeping. `tests/dashboard-shot.js` failed at
`d61fceb` on "Overview", "Money & account", "Records" and "Requests"
measuring 100×36, 148×36, 82×36 and 90×36 on a phone — verified by stashing
this session's changes and re-running, so it was never this work's doing.

`8cff328` on the parallel line of work fixed exactly this, and the suite is
green on the merged tree: *0 control(s) under 44px on a phone*, 10 screens
clean including the four new Courage Index states.

**Still open, same class:** the topnav's own mega-menu triggers measure 38px,
and the accessibility button 38×38. Nothing asserts the public site's touch
targets the way `dashboard-shot.js` asserts the dashboard's — which is why
this one was caught and that one was not.

---

## Notes on method and on what was not verified

- The PHP suite runs against SQLite by default. **Schema 112's MySQL branch is
  mirrored from the SQLite ladder and was not executed** — this sandbox has no
  MySQL server. `NGG_TEST_DSN=... npm run test:api:mysql` on a machine that
  does is the outstanding check.
- Counts quoted here are from runs in this session: `php api/tests/run.php`
  2,738 passing before, 2,757 after; `node tests/about-page.test.js` 62;
  `node build.js` clean throughout.
- Section numbers (§) refer to the brief as supplied. Where the brief and the
  code disagree on a number, the brief wins and the code was changed: the
  divisions carry **41** courses between them, not forty — Business Strategy
  has eleven.

---

## The strengths, since an audit that only lists gaps misleads

This codebase is unusually well-reasoned for its constraints (no-build PHP
shared hosting, low-end Nigerian mobile). Three things stand out and are worth
protecting:

1. **Comments explain decisions, not mechanics.** Nearly every non-obvious
   choice carries the failure it prevents — why the roster import digest is
   not unique, why a percentage is withheld when the denominator is unknown,
   why a star is one per child per day. This is why implementing against it
   was possible without breaking it.
2. **The tests assert what would be silently wrong.** `contrast.test.js`
   checks colour arithmetic because a screenshot of unreadable text looks
   plausible; `build.test.js` checks the cache-busting id because a stale
   bundle deploys cleanly. That posture is rarer than it should be.
3. **Safeguarding is designed in, not bolted on.** Mentor scope is enforced on
   the subject rather than the roster, the mentoring record is explicitly
   never served to the child, a certificate is `noindex` because a parent
   forwarding it should not publish it. G4 above is a gap in that design, not
   an absence of it.
