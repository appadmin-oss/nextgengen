# Institutional Policy & Operational Blueprint

> Source of record for the discipline / attendance / accountability engine.
> Transcribed from the Governing Council's *Institutional Policy & Operational
> Blueprint* (Afrovanguard / Street-To-Stardom / LCASP). Authority: The
> Afrovanguard Governing Council. Executive channel: cacentre@afrovanguard.org.ng
>
> **Implementation note (safeguarding):** these are minors. The system
> *detects, counts, and flags* infractions and surfaces the policy-mandated
> outcome to a human admin. It does **not** auto-execute irreversible actions
> (permanent expulsion, blacklisting) without an admin confirming — see
> "Enforcement stance" at the end.

## Part I — The Student Blueprint

### 1.1 Attendance — the "3-Strike" rule
Maximum **two (2) absences** for the whole program (valid, verified emergencies only).
- **Strike 1 — Warning:** first absence logged.
- **Strike 2 — Dormant Track:** second absence. Program privileges, special
  activities, and eligibility for the ₦500k Awards are frozen.
- **Strike 3 — Eviction:** third missed session → flagged for permanent
  expulsion; checked out, no certificate, forfeits all showcases.

**NGG members — asking first, and what an unasked absence costs.** A member (or
their parent, from the family app) asks the desk to excuse an absence with a
*leave of absence* request, which always needs a reason. The allowance is the
member band's `absenceLimit` (two by default) and the count is the engine's own:
absences logged, plus days still ahead on open or approved leave. A request
that would go past the limit is refused with how many are left.

- **Nobody asked:** the absence is fined at the member band's `absenceFine`
  (₦1,000 by default; 0 switches it off), one fine per absent day.
- **Asked, not yet decided:** the absence is held — no fine until the desk
  answers. Declined, it is fined then; approved, it is excused (and still counts
  towards the limit).
- **Academic leave** is its own request: weeks away for school exams or a school
  programme (up to ten weeks a request, with a reason and the school). Approved,
  its days are not absences at all: the sweep does not log them, absences already
  logged on them are voided, and they never count towards the limit.

### 1.2 Lateness & suspension
- **1-Hour Advance Resumption Protocol:** if the block opens 08:00, the student
  check-in deadline is **07:00** sharp. Missing it is recorded as **tardy** —
  visible, but not an infraction. The Part VI redline below is the threshold
  that accrues one. (The resumption time defaults to 07:00 once the blueprint
  is being enforced; before that the shipped defaults were 09:00/08:30, the
  inverse of the redlines.)
- **Lateness cap:** 3 instances of lateness → automatic **Suspension**.
- **Post-suspension:** 2 further latenesses → ₦5,000 fine **or** eviction.

### 1.3 Check-in & AI verification
- Every student scans their slip / student ID **IN and OUT** daily at the checkpoint.
- Fail to scan IN → the AI logs a **full absence** for the day.
- Scanned IN but not OUT → a **half-day**, not an absence (from 31 Oct 2026):
  the child came. Two half-days count as one absence. A half-day carries no
  absence fine. A sign-out that arrives late (a gate back-fill) clears it.
- **Musing Period** is compulsory; late/missing it downgrades the day to a
  **half-day**, accelerating the dormancy track.

## Part II — The Volunteer Vanguard Code
Applies to Volunteers, Instructors, Mentors, Coordinators.

### 2.1 Lateness
- **1-hour advance resumption:** volunteer check-in window closes **before 07:00**.
- **Lateness cap:** 4 instances → automatic **Suspension**.
- **Post-suspension:** 2 further latenesses → ₦10,000 fine **or** eviction.
- **Mandatory Review Time** (daily/weekly). Missing it without written executive
  clearance is an administrative infraction.

### 2.2 ID credentials & penalties
- **1st oversight (no ID):** issued a temporary **Volunteer Emergency Card** for
  that single day.
- **2nd time:** ₦1,000 fine.
- **Lost card:** ₦2,000 replacement fee to mint a new digital credential.

### 2.3 Dormancy, Suspension, Eviction (volunteers)
- **Dormancy:** declining energy / missed Review Times / low engagement →
  un-deployed to the bench until cleared by management.
- **Suspension:** hitting the 4-lateness threshold, severe negligence, failure to
  enforce student policy, or public insubordination → **14-day** total ban from
  the CACENTRE premises + digital channels.
- **Eviction:** critical post-suspension lateness, financial misconduct, gross
  subversion, or unapproved absences → termination + blacklisting.

### 2.4 Attendance-taker rotation (daily duty)
Taking the roll is a rotating duty, not a fixed post — every active volunteer
carries the standard.
- **One taker per centre per day.** The system auto-rotates the duty across the
  active-volunteer pool (round-robin, offset per centre so no two centres draw
  the same person on the same day). An admin may **override** the day's taker
  from the Control Room (**People → Attendance duty**).
- **On assignment**, the volunteer is notified by email ("You're on attendance
  duty today — <centre>") and it appears on their digital ID.
- **Close the roll.** The taker checks every learner in at arrival and *closes
  the roll* before leaving. Closing is what banks the reward (below); an open
  roll at end of day is a missed Review-Time infraction (§2.1).

### 2.5 Gamified attendance — value-driven rewards, levels & awards
Duty is rewarded, visibly and immediately. Points accrue to a per-volunteer
ledger and drive levels, streaks and awards.
- **Points:** on-duty assignment **+10**; closing the roll **+40** (plus **+2**
  per learner marked, capped **+40**); a **+15** streak bonus for closing the
  roll on consecutive days.
- **Levels:** Recruit → Steward (150) → Keeper (400) → Marshal (800) → Vanguard
  (1500). Level-ups and streaks return a warm, specific response at the kiosk —
  never a hollow "done".
- **Awards** at 150 / 400 / 800 / 1500 points (Reliable Steward, Roll Keeper,
  Attendance Marshal, Vanguard of Order) are minted **once each**, **emailed**,
  and shown **in-app** on the volunteer's digital ID. These sit alongside the
  service-hour certificates (§5) and feed the ₦-value Awards framework.
- **Check-in state email:** every new check-in triggers a personal email about
  where that person stands. When they're **doing well** — a service-certificate
  milestone within reach — the message is **award-focused** ("one more session
  to unlock your award"); otherwise it's a warm **nudge** toward the habit.
  Guardians receive the student's version (milestone celebration or a "they made
  it today" note). Sent **synchronously** at check-in (no cron/SSH dependency)
  and toggleable in *Control Room → Settings* (default on).

## Part III — Architecture of Order & Crisis Protocol

### 3.1 Chain of command (order over age)
Authority is by office, never biological age:
`Student → Volunteer → Center Leader → Group Centre Leaders → NGV → Afrovanguard Members → The Governing Council`

### 3.2 Honour & silence
Decorum/silence before superiors and in strategy sessions. Talking over a
superior, arguing directives in public, or bypassing the chain is a dishonour
against the vision.

### 3.2a Safeguarding comes before the chain
The chain of command and §3.2 are for running the programme. They never apply
to a child's safety. Any child, parent or volunteer who is worried about harm —
abuse, bullying, an adult's behaviour, a child being unsafe at home or at a
centre — may go **straight to anyone they trust**: a mentor, any admin, the
safeguarding lead, or the executive portal. They do not have to go through the
person they are worried about, or ask permission. Doing so is never a breach
of honour or silence, and nobody may be sanctioned for raising a concern in
good faith.

### 3.3 Crisis resolution (the safety valve)
1. On-ground issues flow step-by-step up the chain.
2. Formal escalation: document and transmit digitally to the executive portal
   (cacentre@afrovanguard.org.ng). No scenes on the floor.

## Part IV-A — Appeals and review
Any decision on a person's record can be appealed: a warning, the Dormant
Track, a suspension, an eviction, a fine or a fee.
- A member appeals from Records; a parent from the family account. They name
  the decision and say what happened.
- **A different person reviews it.** Whoever issued or confirmed the decision
  cannot decide its appeal.
- **A reason either way.** Overturned or kept, the family is told why.
- **Overturned** lifts the decision and everything it carried: its fine comes
  off the account (a paid one becomes credit), a suspension's re-entry fee goes
  with it.
- **An eviction is not confirmed while its appeal is open.**
- One appeal per decision.

## Part IV — Reinstatement after eviction
1. **365-day cool-off** — fully barred for one calendar year, once any appeal
   (Part IV-A) has been decided.
2. **Mandatory training** — pass **CIMC 1** (Community Influencing Master Class 1).
3. **Reinstatement fine** — ₦10,000 before the AI profile / credentials reactivate.

## Part V — AV-Incentive Framework & Awards
Financial awards for flawless compliance (students + volunteers). *Prize metrics
& categories: to be supplied.*

## Part VI — Absolute lateness deadlines (the AI redlines)
- **Student redline:** scans in at **08:30 or later** → flagged **LATE**. 3 logs → Suspension.
- **Volunteer redline:** scans in at **09:00 or later** → flagged **LATE**. 4 logs → Suspension.
- The AI clock locks these timestamps. No manual overrides, no verbal adjustments.

---

## Enforcement stance (how this system applies the policy)

**Implemented** in `api/_lib/domain/policy.php`, behind
*Summer School → Programme & policy*. Off until an admin switches it on.

The engine treats the policy as **detection + counting + flagging**, with
irreversible outcomes gated behind an explicit admin action:

| Signal | System behaviour |
|---|---|
| Absence / late scan (vs redline) | logged automatically at check-in and by the nightly sweep; counts kept per person |
| Strike 1 | **Warning** issued automatically |
| Strike 2 / dormancy threshold | **Dormant** issued automatically; awards eligibility frozen |
| Suspension threshold | **14-day ban applied automatically**; the scanner and the community door both refuse |
| Eviction threshold | **applied automatically** for students & volunteers; blocked everywhere, awards forfeited. *(NGG members are the exception — see `confirmEviction` below.)* |
| Fines (₦1k/₦2k/₦5k/₦10k) | recorded as owed on the person's ledger; not auto-charged |
| Reinstatement | 365-day gate + CIMC-1 + ₦10k checklist an admin clears |

**`autoEnforce` is ON**, and it governs the *reversible* sanctions. The
Governing Council's instruction is that the thresholds bite without a human in
the loop — "the AI system automatically flags the profile", "no manual
overrides, no verbal adjustments" — so warnings, dormancy, suspension and fines
all take effect the moment the counter crosses.

For summer students and volunteers this includes **eviction** — under
`autoEnforce` a third absence expels outright. Two things mitigate a wrongly
logged fact, and coordinators should know both:

1. **Void the fact, not the sanction.** Voiding a wrongly logged infraction
   (with a written reason, kept on the record) lifts every sanction it caused,
   immediately — the state is derived, never stored.
2. **Watch the kiosk.** A day the desk could not scan is a day the sweep will
   read as absent for everyone who was actually there. Cancel that date in the
   programme calendar before the nightly sweep runs and no absence is logged
   for it at all.

Setting `autoEnforce` to false extends review-first to **suspension** as well,
so it too is raised as *proposed* and blocks no one until an admin confirms it.
The counters, the ledger and the board are identical either way — only the
moment of effect changes.

**`confirmEviction`** protects the gravest sanction for **NGG members only**,
exposed in the admin console under *NGG member enforcement* ("Require an admin
to confirm a member's eviction"). ON by default and independent of
`autoEnforce`, it holds a member's eviction as *proposed* for review — the
crossing is auto-flagged but no member is expelled until an admin confirms it.
This exists because a member's year-round attendance is swept the same way, and
an expulsion has no undo, only the Part IV reinstatement gauntlet. Summer
students and volunteers are unaffected — their eviction stays automatic. Turn
this off to hold members to the same automatic stance, and a member's eviction
then follows `autoEnforce` like the other sanctions.

### Two layers: facts and consequences
**Infractions** are facts (`absence`, `late`, `tardy`, `halfday`,
`no_checkout`, `idcard_missing`, `idcard_lost`, `review_missed`,
`misconduct`) — one per person per kind per day, so a re-scan or a re-run of
the sweep can never become a second strike.

**Sanctions** are consequences derived from those counts and keyed on the count
that triggered them, so re-evaluation is idempotent. Compliance state is always
**derived**, never stored: voiding a wrongly logged absence lifts everything it
caused, immediately. Voids need a written reason and are kept on the record.

Enforcement does not rewrite `volunteers.status` / `summer_students.status` —
those drive rosters and a dozen unrelated queries. It blocks the scanner,
freezes awards eligibility, and flags the profile.

### What counts as a session day
Absence is only logged on a day the programme actually runs, per the admin's
**programme calendar** (term window, weekdays, holidays, extra days). Without
one, every calendar day counts — which marked the whole cohort absent on a
Sunday. Set it in the same screen.

### Digital channels
§2.3's suspension is "a **14-day total ban** from the CACENTRE premises **and
digital channels**". The community sign-in enforces that too: a suspended or
evicted card is refused at the door with the reason, not a bad-credentials
message.

Timezone for the redlines: **Africa/Lagos (WAT, UTC+1)**, from the `tzOffset`
in Settings → Attendance. Check-ins are dated and graded in that local
timezone, and a scan banked while a kiosk is offline is graded at the moment
the card was presented, not when the queue flushed.


## NGG members are held to more than Summer School (platform rules)

Summer School participants are children in a season with no account; their
ladder is warnings, dormancy and suspension, and a fine only after a
suspension. NGG members belong for years and carry a ledger, so the platform
holds them to three further rules, each set in **Conduct & fines → Member
thresholds → Stricter than Summer School**:

1. **Every late is fined, from the first** (default ₦500), on the member's
   account. This is in addition to the suspension ladder.
2. **No grace band.** Arriving after resumption (plus any grace minutes) is
   late — there is no "tardy" in between for members.
3. **A day with no sign-out is a half-day** (since 31 Oct 2026; it was a whole
   absence before, and those days were converted). Two half-days count as one
   absence. Sign-out opens at the closing time set in
   Settings, so leaving early means no sign-out. This applies from the day the
   rule first took effect; earlier days are not counted.

Member enforcement is switched on separately ("Enforce for NGG members"); none
of this applies until it is.

## Wi-Fi at the centres

- Access follows the record: active members, staff, mentors and instructors are
  on; the Dormant Track is limited; suspended, evicted and inactive records are
  off; Summer School participants are on within their edition's dates. Graduates
  are off unless set otherwise. Fees owing does not touch Wi-Fi unless that rule
  is switched on. The table is in Control Room → Wi-Fi → Who gets on.
- Each person signs in with their printed ID and a Wi-Fi PIN that is theirs
  alone. Anything done on the Wi-Fi with it counts as them.
- For under-18s the centres' Wi-Fi filters adult content and malware and forces
  SafeSearch and YouTube Restricted, where the gateway supports it. Mobile data
  and phone hotspots are outside it.
- **No browsing record is kept.** Gateways report counts (people online, load),
  never who visited what. Under the Nigeria Data Protection Act 2023 (s.31) a
  record of where a child goes online would need their guardian's consent and a
  privacy impact assessment (s.28) first, and filtering does not need one.
