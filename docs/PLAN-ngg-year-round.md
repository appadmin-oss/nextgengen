# Audit — what this system thinks NGG is, and a plan for what it actually is

Status: **audit + proposal, nothing built** · Branch: `gate-links-staff-desk-4g73f9`
Written August 2026, after the observation that "the entire site has been focused
mainly on the summer students and not even NGG themselves."

That observation is correct, and it is structural rather than cosmetic. This
document sets out the evidence (§1), what it costs (§2), a plan to fix it (§3),
and — because it was asked for specifically — a separate plan to take the design
studio from what shipped this week to a genuinely flexible tool (§4).

---

## 1. The evidence

Not impressions. Each of these is a line of code or a schema constraint.

### 1.1 The system can only run one programme at a time

`summer_current_cohort()` returns *the single newest active row*, and every write
path in the product calls `summer_ensure_cohort()`:

```php
// api/_lib/domain/summer.php:22
return db_row("SELECT * FROM summer_cohorts WHERE status='active' ORDER BY id DESC LIMIT 1") ?: null;
```

There is no way to have a Saturday coding club and the summer school open at the
same time. Activating one deactivates the other. **A November programme cannot
exist in this system today** — not "is awkward", cannot exist.

### 1.2 A child is a summer student, and nothing else

`summer_students` has no `memberId`. There is no join anywhere between a child in
the summer programme and a `members` row. A twelve-year-old who attends the
summer school and then joins the year-round Club is **two unrelated records**:
two IDs, two photographs, two consent ledgers, two behaviour histories, and no
way to say "this is the same child, two years on."

That is the single most expensive thing in this document, because it is the
thing an impact report is made of. NGG cannot currently answer "how many of last
year's children are still with us?" — not because nobody built the query, but
because the data cannot express it.

### 1.3 Attendance is one row per child per day, for the whole organisation

```sql
-- db/schema-mysql.sql:249
UNIQUE KEY idx_attend_unique (studentId, date)
```

There is no programme or session dimension. If a child comes to a morning class
and an afternoon club on the same Saturday, the second scan is a duplicate. The
gate kiosk will say "already checked in" and be, by the schema's definition,
right.

### 1.4 The only analytics in the product is summer analytics

`api/_lib/domain/analytics.php` is headed *"Summer School Analytics"* and every
query in it joins `summer_students`. The admin nav entry is labelled "Analytics"
but titled **"Summer School Analytics"** (`page-admin.jsx:47`). There is no
organisational view: no year-on-year, no programme comparison, no retention, no
volunteer-hours total, no donor summary.

### 1.5 The admin console has no Programmes section

The nav groups are **People, Content, Inbox, System** (`page-admin.jsx:46-77`).
Registration, QR codes and Attendance duty are filed under *People* and gated on
a capability literally named `summer`. Someone opening this console cannot see
what programmes the organisation runs, because that is not a thing the console
has a place for.

### 1.6 Fundraising is filed under System

```js
{ id: "donations", group: "System", label: "Donations", ..., cap: "settings" },
```

Donations sit between the audit log and diagnostics, behind the *settings*
capability. An organisation's income is, in this information architecture, a
piece of server tooling.

### 1.7 The vocabulary is one programme's

`summer_students`, `summer_cohorts`, `SUM-2026`, `cap: 'summer'`,
`admin.summer.*` — 50 references to `summer_students` in `registration.php`
alone. Every future programme either pretends to be summer or gets a parallel
implementation.

### 1.8 What is already there, and only needs ranking

This is not a gap-everywhere audit. The year-round machinery mostly exists and is
simply unranked and unconnected: Anchor missions, the Club, the Community feed,
mentorship, events + RSVPs, donations, the programme journal, volunteer tiers,
certificates. The problem is not that NGG's work is missing from the system. It
is that **the summer programme is the system, and everything else is a feature
of it.**

---

## 2. What it costs

- **Nothing can be reported year-on-year.** No child identity survives a
  programme, so retention, progression and alumni are unanswerable — the three
  numbers a funder asks for first.
- **Every new programme is a rebuild.** The next thing NGG runs will either be
  crammed into "summer" or copied into a parallel set of tables.
- **The organisation is invisible to itself.** There is no screen that answers
  "how are we doing?" for NGG — only for one cohort of one programme.
- **The public site leads with the summer school**, so a donor, a partner school
  or a volunteer arriving in November sees a programme that is not running.

---

## 3. The plan — make the programme a dimension, not the world

The ordering matters more than the sizing: **identity first, then programmes,
then reporting.** Doing them in any other order means migrating data twice.

### Phase 1 — One person, many involvements

The change everything else depends on.

- A `people` table: name, DOB, photo, guardian, contacts, consent — the facts
  about a human being, which do not belong to a programme.
- An `involvements` table: personId, programmeId, role (`student`, `volunteer`,
  `mentor`, `staff`), cohort, status, joined, left.
- `summer_students` becomes a **view onto** people + involvements, so every
  existing screen keeps working while the truth moves underneath it. The 50
  call-sites in `registration.php` are migrated behind that view, not rewritten
  in one commit.
- Backfill matches existing `summer_students` to `members` on name + guardian
  phone + DOB, and **leaves ambiguous matches unmerged and listed for a human** —
  merging two children by accident is far worse than leaving them separate.

**Acceptance:** "show me every child who was here in 2025 and is still here in
2026" returns a real answer.

### Phase 2 — Programmes as first-class

- A `programmes` table: name, kind, colour, start, end, status, whether it takes
  attendance, whether it issues IDs.
- Summer becomes a row in it. So do the Club, Anchor and anything run next
  November. **Several can be active at once** — the constraint in §1.1 is
  removed rather than worked around.
- `attendance` gains `programmeId` and its unique key becomes
  `(studentId, programmeId, date)`, so one Saturday can hold two activities.
- A **Programmes** group in the admin nav, holding registration, attendance, QR
  and rosters — scoped to whichever programme is selected. The `summer`
  capability becomes `programmes`.

**Acceptance:** run a two-week November coding club, with its own roster,
attendance and IDs, without touching the summer cohort.

### Phase 3 — Report on the organisation

- An **Organisation** view above the programme views: people reached this year
  vs last, retention, volunteer hours, centres active, donations, upcoming
  events. NGG's dashboard, not a cohort's.
- The existing "Summer School Analytics" stays exactly as it is and becomes one
  programme's tab beneath it. It is good; it is simply not the top of the tree.
- Donations move out of *System* into a **Fundraising** group with their own
  capability, and gain a donor record so repeat giving is visible.

### Phase 4 — The public site in November

- The home page leads with the organisation and what is open *now*; the summer
  programme becomes one card among several rather than the site's subject.
- A programme page template, so a new programme is content rather than code.
- "What's on" driven by the `events` table that already exists and is barely
  surfaced.

---

## 4. The design studio — what "real and flexible" needs next

The studio shipped this week does layout, binding, preflight and export. It is
not yet a tool somebody would choose for real work. Here is the honest gap list,
in the order I would close it.

### 4.1 Fix first: a placed photograph cannot be saved

**This is a live bug, not a missing feature.** Placed images are stored as data
URLs inside `schemaJson`, and the whole design is capped at 512KB
(`CTPL_MAX_BYTES`, `card-templates.php:33`). A 1600px JPEG at q0.82 is commonly
300–400KB, which is 411–548KB once base64-encoded — so **one photograph on a
poster can already exceed the cap for the entire design.** The save fails with
`too_large` and the design is lost.

The fix is an **asset library**, which is the right architecture anyway: uploads
go to the existing photo storage, the design references a URL, and the same
image can be reused across designs instead of being duplicated into each one.

### 4.2 Multi-page documents

A certificate has a back. A programme booklet has four pages. The schema holds
one page; it needs `pages: []` with the current document becoming page one.
Export becomes a multi-page PDF.

### 4.3 Real groups

There is multi-select, which is not the same thing. A group is a **persistent**
object you can move, scale, name, lock, reuse and nest — a logo lockup with its
strapline should stay together when somebody drags it.

### 4.4 Text that can carry a sentence

Today an element is one uniform run. Professional work needs bold and colour
*inside* a line, lists, and a real distinction between "the box is fixed and the
text fits it" and "the text grows the box". Also: text on a path (a curved
certificate seal), outline/stroke, and per-element letter-spacing on a run.

### 4.5 Masks and image effects

Clip an image to any shape, not just a rounded rectangle; corner-radius per
corner; background removal on a placed photograph (Cloudinary is already
integrated); blur and duotone.

### 4.6 Data merge — the feature that ties this back to §3 — **built**

Pick a published template, pick a filtered roster, generate one design per
person, export the batch. This already half-exists in the card studio for IDs;
generalising it is what makes the studio produce **certificates for 240 children
and 30 volunteer badges** rather than one card at a time.

Shipped as a Batch panel in the studio, over a new roster read
(`api/_lib/domain/merge.php`, `admin.merge.rows`). Three things are worth
recording, because each was a decision rather than a detail:

- **Card issuance is a filter, not a precondition.** The studio's only roster
  read was `admin.cards.data`, which exists to feed a card printer and is bound
  to `regStatus = 'verified' AND token != ''`. That is the wrong population for
  a certificate: a child who attended every day and whose card was never issued
  — because a photograph was rejected — is exactly who a certificate is for, and
  to that read they did not exist.
- **Attendance is counted from the register, not read from
  `summer_students.daysPresent`,** which is a cache and is stale the moment a
  scan is corrected. "Attended at least N days" is the filter a certificate run
  is actually made of, so it has to be true on the day it prints.
- **One row builder, two callers.** `card_row_student` and `card_row_volunteer`
  were extracted from the card payloads and are now shared, so a merged
  certificate and a printed ID cannot disagree about a name or an expiry. The
  volunteer card printed no expiry for months precisely because two copies of
  that mapping existed and only one of them read `qr_codes`.

Output is one page per person at the real trim size, an imposed A4 sheet through
the card studio's existing prepress module (offered only where the piece
actually gangs up), or a ZIP of PNGs named for each child. Rendering runs in the
browser on the same Fabric canvas that drew the proof, measures the first page
and refuses a run that will not fit in memory, and stops before it starts to say
which people are missing a photograph.

**Still open here:** volunteer duty days are not counted (they live in
`attendance_duty` and mean something different from a child's check-in), and a
run is capped at 600 people.

### 4.7 Charts from real data

An impact report needs the analytics it already has, as artwork. A chart element
bound to a real query — attendance by centre, growth over the year — would make
the annual report a design rather than a screenshot.

### 4.8 The craft layer

Rulers and draggable guides; snap-to-grid with a settable grid; numeric spacing;
drag to reorder layers; copy/paste between designs and from the system
clipboard; autosave with visible version history; per-design thumbnails in the
picker; comments for approval before a print run.

### 4.9 Export honesty

Multi-page PDF, JPG, transparent PNG, @2x/@3x. **Embed fonts in the SVG** — the
current SVG export references font names, so a printer without Inter installed
gets a substitution and does not know it. And a real answer on CMYK: today's
export is RGB, which is correct for digital presses and wrong for an offset
house.

---

## 5. What I would do first

1. ~~**§4.1, the asset library.**~~ **Done.** It was a bug, it was small, and
   every other design feature was worth less while a photograph could not be
   saved.
2. ~~**§4.6, data merge.**~~ **Done** — taken before Phase 1 because it is
   continuous with the asset library and needs nothing from the identity work.
   It turns the studio from a nice tool into the thing that produces 240
   certificates in November.
3. **§3 Phase 1, people and involvements.** Everything else in §3 waits on it,
   and every week it is delayed is another cohort of children entered as records
   that cannot be connected to their own past. **This is now the next thing.**

§3 Phase 1 is the one with real risk: it moves identity for every child in the
system. It should ship behind the compatibility view described above, with the
backfill's ambiguous matches reviewed by a human rather than guessed.

---

## 6. What this document is not

It does not propose rewriting what works. The summer programme's machinery —
registration, consent, the gate kiosk, QR issuance, the analytics — is the most
carefully built part of this product and none of it should change. The proposal
is to put a layer *above* it so that it is one of the things NGG does, rather
than the shape of everything NGG can do.
