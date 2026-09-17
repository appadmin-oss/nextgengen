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
| The four divisions (§5) | **No data model** | `members.division`, closed set — see G1 |
| Mentor's weekly review (§18) | **Nothing at all** | Recorded weekly, with a due list — see G2 |
| NGG → NGV progression (§20) | Promotion real, but unevidenced | Evidence + readiness recorded — see G3 |

All three gaps this audit named have since been implemented, in the commits
that follow it — G1 as `members.division`, G2 as `mentor_reviews`, and G3 as
the evidence record described below. **G3's original finding was wrong**, and
the entry says so in full rather than quietly reading as though it had always
said the right thing. G4 and G5 are not this work's: G5 was fixed upstream,
and G4 is left for the programme to decide.

Each was re-checked against the merged tree before being worked, which is how
G3's error surfaced.

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

## The gaps this audit found

Stated as they were found, with what happened to each. G1 and G2 were
confirmed against the merged tree before being implemented; G3 did not
survive that check and is corrected in place.


### G1. The four professional divisions have no data model — High

`§5` defines four divisions and assigns every member to one. The schema has no
such column: `grep -c division db/schema-mysql.sql` returns **0**. What exists
instead is `members.track` (a free string — "Music", "Tech", "Robotics") and
`members.disciplines` (a comma list, `members-import.php:43`). Neither is the
brief's taxonomy, and neither is closed.

Consequence: the programme cannot answer "how many members are in Technology &
Applied Engineering", cannot report per-division, and cannot enforce that
chess is taken across all four — which is §6's entire point.

**Implemented.** Migration 115 adds `members.division`, holding the id rather
than the display name, backfilled from `track` where that is unambiguous and
left blank where it is not. `admin.members.upsert` refuses a fifth division
rather than coercing it, the roster importer takes a Division column and falls
back to the same mapping the migration uses, and `admin.divisions.overview` is
the roll-up — with `unplaced` as a first-class number, because a division
report that omits the children nobody has assigned reads as complete. The
doctrine now exists in PHP too (`domain/formation.php`), pinned to
`formation.jsx` by `tests/formation-parity.test.js`.

### G2. The mentor's weekly review is not a surface — Medium

`§18` lists twelve questions a mentor should be able to answer for every
assigned member every week. Nothing prompts them, nothing records the answers,
and nothing shows a lead which members went a week without being reviewed.
`mentor_attention()` (`api/_lib/domain/mentoring.php`) is the nearest thing —
it surfaces flagged concerns and overdue goals, which is a queue of exceptions
rather than a review cadence.

**Implemented.** Migration 116 adds `mentor_reviews`, one row per (subject,
ISO week) so a review amends rather than appends. The surface that matters is
not the form but `mentor_reviews_due` — who has not been reviewed this week,
by name, on the roster screen a mentor already opens. An empty review is
refused, because allowing one would let a mentor clear the flag without
anybody having looked.

### G3. ~~`members.level` is unvalidated free text~~ — **this finding was wrong**

Recorded rather than deleted, because a corrected audit is worth more than a
tidy one and the mistake is instructive.

**What it claimed:** that `members.level` carries the NGG → NGV rung, that it
accepts any string, and that there is no promotion event or record of who
promoted whom.

**What is actually true:** `members.level` is the roster's CLASS level — A, B,
C or O — documented at `docs/ROSTER-IMPORT.md:134` and described by its own
migration (`db/schema-mysql.sql:2341`, "the first thing a centre lead asks
about a child"). The Control Room field is labelled "NGG level" with the
placeholder `A`. It has nothing to do with §20. And NGG → NGV promotion was
already implemented, thoroughly: `admin_member_promote_ngv()`
(`api/_lib/domain/volunteers.php`) provisions the volunteer record, mints the
ID and check-in token, links both ways, is idempotent across a re-press and a
revoke, emits an event and writes an audit line.

**How it happened:** the finding was inferred from a column's name and type
without opening the doc that describes it or grepping for the promotion. Two
minutes of either would have killed it. The lesson is the one this repo's own
CLAUDE.md states — investigate rather than guess — and it is here because an
audit that is confidently wrong about one section invites doubt about the
other twenty-three.

**The real §20 gap, once the wrong one was cleared:** the promotion recorded
that it happened and who pressed the button, never why. So "was this child
promoted on evidence of formation or because they had been around long
enough" — the one question the section is about — had no answer six months
later. That is now implemented: `member_formation_readiness()` gathers the
formation record for the screen that decides, the promotion requires the
promoter's own sentence, and `member_promotions` keeps both alongside a
snapshot of what was known at the time. Tenure is shown on that screen and
labelled as not being evidence, which is §20's argument rather than a
decoration.

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
