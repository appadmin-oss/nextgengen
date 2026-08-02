# Engagement tracking, and what a volunteer award is actually made of

*A plan. Nothing here is built yet; §7 says what I would do first and why.*

---

## 0. The brief, and what I would widen

The ask names six factors for volunteer awards:

> engagements · donations & support · referrals (volunteers & donors) · dispute
> resolution · attendance · responsiveness

Three things about that list before any design.

**It is six inputs to one number, and the number is the dangerous part.** A
composite score decides who gets recognised in front of their peers. Get the
weights wrong and the system quietly teaches people what to optimise: if
referrals are worth a lot, NGG will get referrals, including bad ones. Every
proposal below therefore carries its *anti-gaming* note, and §5 is about the
score being contestable rather than merely computed.

**Half of it does not exist to be measured.** Of the six, only attendance is
recorded today, and only for a volunteer's *duty rota* — not for the sessions
they actually taught. Donations exist as a table with no link to a person.
Referrals, disputes and responsiveness have no representation at all. So most
of this plan is instrumentation, not analytics: **you cannot score what you do
not capture, and capturing it honestly is 80% of the work.**

**Instructors and students need different instruments, not one shared one.**
The brief pairs them, and they do belong on one screen — but a child's
engagement is *participation* (did they come, did they take part, are they
growing) and an instructor's is *contribution* (did they show up prepared, did
they respond, did they bring people in). Scoring a child on "responsiveness"
would be a category error with safeguarding consequences. §3 and §4 separate
them deliberately.

### What I would add to the six

| Added factor | Why it belongs |
|---|---|
| **Delivery** — sessions actually taught, on time, with a plan | The core of the job. Today nothing records that a scheduled session happened, so an instructor who never taught and one who taught twelve times look identical. |
| **Preparation & evidence** | The evidence trail is what makes the programme auditable to funders. The volunteers who log photos and lesson plans are doing organisational work that is currently invisible and unrewarded. |
| **Mentoring & peer support** | Mentors rate students (V3). Nobody records a senior volunteer coaching a junior one, which is exactly what NGG wants more of. |
| **Safeguarding standing** | Not a positive factor — a **gate**. A volunteer with an open safeguarding concern or an unresolved dispute against them must not be able to win an award on points. See §5.3. |
| **Longevity & return** | The volunteer in their fourth summer is worth more than the sum of one summer's points, and a per-cohort score erases them. Needs §3 Phase 1 (`people` + `involvements`) to be expressible at all. |

### What I would explicitly *not* score

- **Donation amount.** See §2.3 — recognising volunteers by naira raised makes
  the award purchasable and turns a service programme into a fundraising
  league. Count *acts of support*, cap the contribution, never rank on value.
- **Anything about a child, on a volunteer's scorecard.** A volunteer's
  students' attendance is not the volunteer's score. It is a confounded
  measure (the centre with transport problems is not a worse instructor) and it
  creates pressure to under-record absence.

---

## 1. Where the ground actually is

Audited, not assumed. What exists today:

| Thing | Table | Reality |
|---|---|---|
| Volunteer duty rota | `attendance_duty` | One volunteer per centre per day, round-robin, admin-overridable. Real and working. |
| Volunteer points | `volunteer_points` | `kind` ∈ {`duty_assigned`, `duty_complete`, `duty_streak`, `award`}. **Everything a volunteer can earn today comes from the attendance rota.** |
| Levels & milestones | `DUTY_LEVELS`, `DUTY_AWARDS` in `volunteers.php` | Point thresholds → level names and one-off awards, emailed. |
| Awards (formal) | `awards` | `subjectType` student\|volunteer, `tier`, `valueNaira`, `period`, `eligibilityStatus`. Minted from the analytics workspace. |
| Hours certificates | `volunteer_certs` | Milestone + hours. Hours are not derived from anything. |
| Student attendance | `attendance` | UNIQUE(studentId, date). Solid. |
| Student behaviour / V3 | `behaviour_logs`, mentor stars | Verbal / vocal / visual, 0–5 each. |
| Activities & evidence | `activities`, evidence artefacts | Photos, lesson plans, worksheets. Logged by hand. |
| Discipline | policy engine — infractions, sanctions, `awardsEligible` | **Already has an eligibility flag.** This is the hook the award gate should use rather than a new one. |
| Donations | `donations` | `reference`, `email`, `name`, `amount`, `status`. **No `memberId`, no attribution to whoever brought it in.** |
| Referrals | — | Nothing. No `referredBy` on `applications`, `volunteers`, `summer_students` or `donations`. |
| Disputes | — | Nothing. |
| Responsiveness | — | Nothing. There is an outbox and a mailer; nothing records whether a person read or answered. |

**One structural blocker, named up front.** Everything in this plan wants to say
"this person, over four summers". `summer_students` has no `memberId`, one
cohort exists at a time, and a volunteer's identity is `volunteers.volunteerId`.
Longevity, return rate and cross-programme contribution are **not expressible**
until §3 Phase 1 of `PLAN-ngg-year-round.md` (a `people` table and an
`involvements` table) lands. Everything else here can ship before it; those
three cannot.

---

## 2. The instruments — what to capture, and how not to poison it

Each subsection: **the signal · how it is captured · what it costs the person
capturing it · how it would be gamed.**

### 2.1 Delivery — sessions taught

*The single biggest gap.* A `sessions` schedule exists as content; nothing
records a session being **delivered**.

- **Capture:** a `session_deliveries` row — `sessionId`, `centre`, `date`,
  `volunteerId`, `startedAt`, `endedAt`, `presentCount`, `planAttached`,
  `source` (kiosk \| coordinator \| self). Opened from the same gate kiosk that
  already takes attendance, so the instructor taps once at the start and the
  roll they were going to take anyway closes it.
- **Cost:** one tap. If it costs more than that it will not be done, and a
  half-recorded delivery table is worse than none — it makes the diligent look
  average.
- **Gaming:** self-reported delivery with no children checked in. Require a
  non-zero `presentCount` from the real `attendance` table for a delivery to
  score, and mark self-sourced deliveries distinctly.

### 2.2 Engagements

Deliberately broad in the brief, so make it concrete and countable:

| Engagement | Already emits something? |
|---|---|
| Session delivered | no — §2.1 |
| Attendance duty closed | **yes** — `attendance_duty.completedAt` |
| Activity logged with evidence | yes — `activities` + evidence rows |
| Assignment graded | yes — assessments exist; the grading queue is already a known backlog |
| Behaviour/V3 rating given | yes — `behaviour_logs` |
| Event or outreach attended | partly — `events` |
| Journal/community contribution | yes — the Program Journal |

- **Capture:** no new capture for most of these. What is missing is a
  **ledger** — one place that says "this person did this thing on this day,
  worth this much". Today `volunteer_points` is that ledger but only the rota
  writes to it. Widen it (§4.1) rather than build a second one.
- **Gaming:** volume over substance — forty one-line activity logs. Cap points
  per kind per day, and weight an activity by whether it carries evidence.

### 2.3 Donations & support

- **Capture:** `donations.attributedToId` (nullable) + `attributionKind`
  (`referred` \| `solicited` \| `self`), set when a donation arrives through a
  volunteer's share link or is attributed by an admin afterwards. Plus a
  `support_acts` table for the non-monetary kind that NGG actually runs on —
  venue lent, transport provided, equipment donated, meals — with
  `estimatedValue` **recorded for reporting and excluded from scoring**.
- **Scoring rule:** count of distinct supporters brought in, **capped** (I would
  cap the contribution of this whole factor at ~10% of a volunteer's score).
  Never rank on naira.
- **Gaming:** this is the factor most likely to corrupt the award. A volunteer
  with a wealthy uncle is not a better volunteer. The cap is not a detail, it is
  the design.
- **Privacy:** a donor's identity is not a volunteer's to display. The scorecard
  shows counts; names live in the donations screen behind the existing cap.

### 2.4 Referrals

- **Capture:** `referrals` — `referrerId`, `subjectType` (`volunteer` \|
  `donor` \| `student`), `subjectRef`, `stage` (`invited` → `applied` →
  `accepted` → `active_90d`), `createdAt`, `confirmedAt`, `source`
  (`link` \| `self_declared` \| `admin`). Plus `referredBy` captured at intake —
  a one-line addition to the volunteer application and the donation form.
- **Score on the STAGE, not the referral.** A referral that never became an
  active volunteer is worth nothing; one still active at 90 days is worth a lot.
  This is the single most important anti-gaming decision in the document:
  scoring `invited` produces spam, scoring `active_90d` produces recruitment.
- **Gaming:** self-referral rings, and claiming somebody who was already coming.
  `source = self_declared` requires admin confirmation before it scores, and a
  referral cannot be claimed for a person who already has a record.

### 2.5 Dispute resolution

The subtlest factor, and the one most likely to be got wrong. "Dispute
resolution" can mean two entirely different things and they must not share a
number:

1. **Disputes a person RESOLVED** — a coordinator who de-escalated a conflict
   between two children, mediated a guardian complaint, sorted a rota clash.
   This is skilled work and is currently invisible.
2. **Disputes a person was the SUBJECT of** — a complaint against them.

- **Capture:** `disputes` — `disputeId`, `kind` (`safeguarding` \| `conduct` \|
  `logistics` \| `grievance`), `raisedById`, `aboutId` (nullable), `centre`,
  `severity`, `status` (`open` → `investigating` → `resolved` \| `withdrawn`),
  `resolvedById`, `openedAt`, `resolvedAt`, `outcome`. Plus `dispute_notes`,
  append-only.
- **Scoring:** resolution counts toward the score, weighted by severity and by
  time-to-resolution. **Being the subject of one is not a score deduction — it
  is a gate** (§5.3), because a points deduction implies a dispute can be
  bought off with enough attendance.
- **Access:** `safeguarding`-kind disputes are not readable under the ordinary
  `people` capability. This needs its own capability, and the analytics layer
  must not aggregate them into anything a coordinator can see.
- **Gaming:** logging trivia as disputes to resolve them. Only a coordinator or
  above may set `resolved`, and the resolver may not be the person who raised it.

### 2.6 Attendance (volunteers)

Today: duty rota only. Widen to what the brief means:

- **Capture:** volunteers already have QR tokens and the gate already scans
  them. `attendance` is `UNIQUE(studentId, date)` and student-shaped, so
  volunteer presence needs either a `personType` column or its own
  `volunteer_attendance` table. **I would add the column** — one attendance
  concept is easier to reason about than two, and the policy engine already
  treats students and volunteers with one set of rules.
- **Derived:** rate against *expected* days (their rota + their scheduled
  sessions), not against calendar days. A volunteer rostered twice a week who
  attends twice a week is at 100%, and any other denominator punishes them.
- **Gaming:** scanning in and leaving. Checkout is already in the policy engine;
  use it, and treat a scan with no matching delivery or roll as a half-day.

### 2.7 Responsiveness

The hardest to measure without becoming surveillance. Be narrow and honest.

- **Measure only responses to EXPLICIT REQUESTS**, never general activity. Three
  request types exist or nearly exist: a rota assignment (accept/decline), a
  grading queue item, an admin message needing a reply.
- **Capture:** `requests` — `requestId`, `kind`, `toId`, `subjectRef`,
  `sentAt`, `dueAt`, `respondedAt`, `outcome` (`done` \| `declined` \| `expired`).
  Every existing notification that expects something back writes one.
- **Derived:** median time-to-respond and completion rate, **within business
  hours of the programme calendar** — a request sent 21:00 Friday is not "slow"
  because it was answered Monday 08:00. The programme calendar already knows
  which days are programme days; use it.
- **Explicitly not measured:** read receipts, login frequency, time on page,
  message volume. These measure availability, not contribution, and they punish
  the volunteer with a job.
- **Gaming:** clicking "done" without doing it. Where the request has an
  observable completion (a grade recorded, a roll closed), score the
  observation, not the click.

---

## 3. Student engagement — a different instrument

Not the volunteer score with the names changed.

**Signals (all already captured or cheap):** attendance rate and streak;
punctuality; activity participation; assignment submission and grade
trajectory; V3 ratings; behaviour logs; journal contributions; peer
recognition.

**Composite:** an **Engagement Index** per child per week, which is deliberately
*not* the same as the existing Growth Potential score:

- Growth Potential (Level 5) is **predictive** — who is about to fall out.
- Engagement Index is **descriptive** — how involved is this child now.

They will correlate, and both are useful: one tells a coordinator who to ring
this week, the other tells a funder what participation looks like. Building one
and calling it both is how a screen ends up lying about what it means.

**Safeguarding constraints, non-negotiable:**

- No child-level engagement score is shown to another child, ever. No leaderboards
  of children by engagement.
- "Disengaged" is a label that follows a child. The list is titled by **what to
  do about it**, every row carries the reasons that put it there, and it is
  staff-only — the exact pattern Level 5 already uses.
- Recognition for children stays on **achievement and effort**, not on a
  composite index. A child with a difficult home life must not lose an award to
  a rounding decision in a formula.

---

## 4. Architecture

### 4.1 One ledger, widened

`volunteer_points` is already an append-only, idempotent-per-(person, kind, date)
ledger. Widen rather than replace:

- `personType` (`volunteer` \| `student`) so one ledger serves both.
- `factor` — the six-plus-added factors, so a score can be **decomposed** on
  screen. Today `kind` is both the event and the category; separating them is
  what lets a scorecard say "you are at 340: 120 from delivery, 90 from
  attendance…".
- `sourceRef` — the row that caused it, so every point is traceable to a
  delivery, a dispute, a referral. **A point with no traceable source cannot be
  contested, and an award that cannot be contested is a rumour.**
- `weightVersion` — which scoring version minted it (§5.2).

Everything else emits into it. The rota already does.

### 4.2 Scoring is a nightly job, not a query

Points accrue live; the composite is computed by a scheduled sweep into
`engagement_scores` (`personId`, `personType`, `period`, `factor`, `raw`,
`normalised`, `weighted`, `computedAt`, `weightVersion`).

Why materialised: the score is read on every roster row, every scorecard and
every award screen, and a live composite over six joined factors on shared
hosting will not hold. Web-cron already exists and already runs sweeps.

### 4.3 Normalisation, and the trap in it

Raw counts are not comparable — a volunteer at a 40-child centre can log more
than one at a 12-child centre by doing nothing differently. **Normalise within
peer group** (same role tier, same centre size band), and say so on the
scorecard. Percentile within a small peer group is unstable, so: floor the
group at n = 8, and fall back to programme-wide with a visible note when the
group is smaller. A silently unstable percentile is worse than an honest
programme-wide one.

### 4.4 Screens

1. **Instructor scorecard** (their own, in the volunteer portal) — the score,
   decomposed by factor, with the ledger rows behind each. Their own first,
   before anyone ranks them: somebody should see their own number before it is
   used about them.
2. **Engagement analytics** (Control Room) — a new level on the analytics page,
   in the pattern of the existing ones: instructors by factor, students by
   engagement index, centre comparison, trend.
3. **Award panel** — candidates by score with every gate shown (§5.3), the
   decomposition, and a required human confirmation.
4. **The Analyst pane already reads these** — once the factors are in the
   evidence payload, "who should get the service award and what says so" becomes
   answerable by the pane built this week.

---

## 5. The award itself

### 5.1 Weights, as a starting proposal

| Factor | Weight | Note |
|---|---:|---|
| Delivery (sessions taught) | 25% | The job. |
| Attendance & punctuality | 20% | Includes rota duty. |
| Engagements (activities, grading, ratings, evidence) | 20% | Evidence-carrying activities weighted higher. |
| Responsiveness | 10% | Business-hours only. |
| Dispute resolution | 10% | Severity- and time-weighted. |
| Referrals (at `active_90d`) | 10% | Stage-scored. |
| Donations & support | 5% | **Capped.** Count of supporters, never value. |

These are a **starting point for a human argument, not an answer.** The numbers
should be argued about by the people who run the centres before anything mints
an award on them.

### 5.2 Weights are versioned and stored

`award_weights` — `version`, `weights` JSON, `effectiveFrom`, `setById`, `note`.
Two reasons, both learned the hard way elsewhere in this codebase: last
November's award has to still be explicable under last November's rules, and a
weight change must be an event with a name on it rather than a silent edit.

### 5.3 Gates, evaluated before any score

A gate is pass/fail and no amount of points overrides it:

1. **Safeguarding clear** — `volunteers.safeguarding` is not `pending`/`failed`
   and no open safeguarding dispute.
2. **No open conduct dispute** where they are the subject.
3. **Policy standing** — the existing `awardsEligible` flag from the discipline
   engine. It already exists; use it rather than inventing a second rule.
4. **Minimum service** — a floor of delivered sessions, so a high rate over two
   sessions cannot win.
5. **Data sufficiency** — enough signal to score at all. A volunteer with three
   ledger rows gets "not enough on file", not a low score.

### 5.4 Contestability

Every score decomposes to factors, every factor to ledger rows, every ledger row
to a source record. A volunteer can see their own scorecard and **raise a
dispute against it** — which is itself a `disputes` row, closing the loop. An
award nobody can question is a popularity contest with arithmetic on top.

### 5.5 The thing to watch

Publishing a ranked leaderboard of volunteers by composite score would change
behaviour within a week, and not only for the better. I would ship: **your own
scorecard, always**; **award candidates, to coordinators only**; and a
**celebration of winners** — but not a live public league table. That is a
recommendation, not a technical constraint, and it is the user's call.

---

## 6. Privacy, safeguarding and the analytics boundary

- The Analyst pane and Level 7 see **aggregates only** — the existing
  `insight_scrub` gate already refuses a payload containing a name, id or
  contact, and engagement evidence must go through it unchanged.
- Safeguarding disputes need their own capability, are excluded from every
  aggregate, and never reach the AI evidence payload at all.
- A volunteer's scorecard is visible to: themselves, their coordinator, and
  award administrators. Not to other volunteers.
- Everything scoring-related is auditable: `audit()` on weight changes, gate
  overrides and minting.

---

## 7. Phasing — what I would do first, and why

**Phase 1 · Make the invisible visible (no scoring at all).**
`session_deliveries` + volunteer attendance on the existing gate + the widened
ledger (§4.1). Ship a scorecard that shows **counts, not a score**. Nothing is
ranked. This is deliberately unglamorous and it is the right first step: it puts
real data in front of people and lets them tell you the instrument is wrong
before anything depends on it.

**Phase 2 · The two structural tables.** `referrals` and `disputes`, with intake
capture (`referredBy` on the volunteer application and the donation form) and
the dispute desk. These are the two factors with no proxy at all, and referral
data is only useful once it has aged 90 days — so starting the clock early
matters more than it looks.

**Phase 3 · Responsiveness.** `requests`, written by the notification paths that
already exist. Narrow scope, business-hours arithmetic against the programme
calendar.

**Phase 4 · Scoring.** Weights, versioning, the nightly sweep, normalisation,
the gates. Only now, on three cohorts' worth of Phase-1 data, is there enough to
argue about weights honestly.

**Phase 5 · Awards and analytics.** The award panel, the engagement level on the
analytics page, the Analyst evidence extension.

**Cross-cutting, and it blocks the good version:** §3 Phase 1 of
`PLAN-ngg-year-round.md` — `people` and `involvements`. Without it, longevity
and return are unscoreable and every metric resets each summer. Phases 1–3 can
proceed in parallel with it; Phase 4 is much weaker without it.

---

## 8. What this plan is not

It does not propose scoring children against each other, publishing a volunteer
league table, or ranking anybody on money raised. It proposes recording the work
people actually do — which is currently invisible for everything except closing
a register — and then, carefully and contestably, recognising it.
