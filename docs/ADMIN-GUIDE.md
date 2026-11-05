# Administrator's guide — Next Generation Genius

For the people who **run** the programme: coordinators, centre leads, the
member desk, whoever prints the ID cards. It is not a developer document.
Nothing here asks you to touch a database or read code.

If you only read one section, read [The five words that matter](#the-five-words-that-matter).
Almost every confusing thing in this system comes from someone using one of
those five words to mean something else.

---

## Contents

1. [Getting in](#getting-in)
2. [The five words that matter](#the-five-words-that-matter)
3. [Map of the Control Room](#map-of-the-control-room)
4. [What you can see and do (permissions)](#what-you-can-see-and-do-permissions)
5. [The status board](#the-status-board)
6. [Members](#members)
7. [Centres](#centres)
8. [Summer School](#summer-school)
9. [The NGG Club](#the-ngg-club)
   - [The curriculum](#the-curriculum)
   - [The Club portal (/club-admin)](#the-club-portal-club-admin)
   - [Club announcements](#club-announcements-club-portal--announcements)
   - [Mentorship: Anchor Pods](#mentorship-anchor-pods)
   - ["Start here": the portal guides](#start-here-the-portal-guides-compulsory-on-first-login)
   - [The Community (/community)](#the-community-community)
10. [Applications, sign-ups and verification](#applications-sign-ups-and-verification)
11. [ID cards](#id-cards)
12. [How bulk actions behave](#how-bulk-actions-behave)
13. [Searching and filtering](#searching-and-filtering)
14. [Things that go wrong, and what they mean](#things-that-go-wrong-and-what-they-mean)
15. [Before you press it — the warnings list](#before-you-press-it--the-warnings-list)

---

## Getting in

The staff area is called the **Control Room**. It lives at **`/nextadmin`**.
`/hq` and `/admin` still work — they are kept because they are in people's
bookmarks — and all three land in the same place.

Two steps:

1. **Sign in** with your member account, the same one you would use on the
   public site. Staff accounts are ordinary member records with a role added.
2. **Enter a 6-digit code** from your authenticator app. Every staff account
   needs two-factor authentication; there is no way to switch it off for one
   person.

The first time, you will be shown a QR code to scan (Google Authenticator,
Authy, 1Password, anything that does 6-digit codes) and a set of **backup
codes**. Save the backup codes somewhere that is not your phone. Each one
works once, and when you use one the Control Room tells you how many are
left.

You will be asked for a code again after a while even though you are still
signed in. That is deliberate: the Control Room re-checks the code, it does
not sign you out. Nothing you were doing is lost.

**Lost your authenticator?** Another admin with the *Access & roles*
permission can reset it from **Members** → find yourself → row menu →
*Reset their 2FA*. You then enrol again on your next visit. Your backup
codes stop working the moment somebody resets you.

**Press `⌘K` / `Ctrl+K` anywhere** — or just `/` when you are not typing in
a field — to open the command palette. Type a section name ("members",
"editions", "print log") and it takes you there. It is the fastest way
around, and it only ever offers you sections you are allowed to open.

---

## The five words that matter

| Word | What it means here | What it does **not** mean |
|---|---|---|
| **Member** | Somebody enrolled in NGG year-round. Has a member ID, a centre, a level, an ID card. | Not a Summer School participant. |
| **Centre** | A **place**. Egbeda, Ikotun, and so on. It belongs to NGG the organisation. Its code is the prefix printed on member ID cards. | Not a class, not a group, not a Summer School thing. |
| **Edition** | One **season** of Summer School — "Summer School 2026". | Not a class. Not a centre. |
| **Group** | One **class inside an edition** — "Egbeda · Music · Morning". Has its own dates, its own lead, its own register, its own report. | Not a centre, even though it usually runs at one. |
| **Participant** | A child enrolled in a Summer School edition. | Not a member. A participant may later *become* a member; that is a separate step. |

Two consequences worth internalising:

- **Summer School runs at centres. It does not own them.** A Summer School
  coordinator cannot rename or delete a centre, because every member's record
  and every printed card depends on it. Centres live in **People → Centres**
  and need the *Members* permission.
- **A "cohort" is not a thing you manage.** The word used to mean three
  different things in this product. It is gone from the screens. If you say
  "cohort" and mean a class, the product calls that a **group**; if you mean
  the season, it calls that an **edition**.

---

## Map of the Control Room

The left-hand navigation is grouped. Sections you have no permission for are
not shown at all, so your sidebar may be shorter than a colleague's.

**Top (no permission needed beyond staff access)**

- **Overview** — what needs attention today.
- **Status board** — how everybody is doing: members, centres, mentors,
  instructors, centre leads and staff. See [The status board](#the-status-board).
- **Analytics & M&E** — figures across members, volunteers and Summer School.
  (It was called "Summer School Analytics", which sent everybody looking for
  year-round numbers to the wrong place.)

**People** — where humans are administered.

| Section | What it is for |
|---|---|
| Members | The year-round roster. Search, filter, edit, bulk actions, ID printing. **Registration**: each new member's registration checklist and who is helping them. |
| Applications | People who applied and have not been processed yet. |
| Volunteers | Volunteer roster and their status. |
| Mentors / Mentorship | Mentor records and mentor–member pairings. |
| Behaviour monitor | Conduct incidents as they come in. |
| Dues & fees | The fee ledger. Separate permission — see below. |
| Conduct policy & fines | Thresholds, suspensions, fine amounts. Governs members **and** Summer School. |
| Member requests | Things members have asked for and are waiting on (Inbox). |
| Request history | Every request ever raised — open, approved, declined, withdrawn — and who decided it. |
| Staff activity | What staff accounts have been doing. |
| Engagement | Participation figures. |
| **Centres** | The centre directory. Add, edit, retire. |
| **ID cards** | The print log, one person's card history, and the doors into both studios. |

**The Analyst** (the sparkle panel beside any Control Room page) answers about
the figures on screen. It reads totals, never names, so when the figures don't
answer a question it says what it can read instead of going quiet. Ask it for
**an export of members** ("send me the members grouped by their divisions") and
it downloads a CSV straight from the roster — every member you can see (your
centres only, and only with the People permission), grouped by division,
centre, level, status or programme, or in name order. The names never go to the
AI.

**AI: who answers, and what it costs.** Nobody picks an AI provider; each
feature is routed by the kind of work it is. *Everyday work* — screening posts,
classifying observations, photo checks, Anchor Journal coaching, summaries, the
ID Card Studio assistant — runs on **free** models (Groq, Gemini, OpenRouter's
free ones). *Hard thinking* — marking written answers, the Analyst's answers,
lenses and synthesis — tries **paid** models (Claude, OpenAI) first and falls
back to free ones. Paid models only run within the **monthly limit** set in
**Settings → API keys → AI spending** (blank or 0 keeps them off). Every call is
logged with its tokens and estimated cost; a paid call that could take the month
over the limit is not made, and the free model answers instead. The block shows
this month's spend by model, what is left and how many paid calls the limit held
back; the *AI features* table shows each feature's kind of work and, when it is
on rules only, why. With only a paid key and no free one, everyday work uses each
feature's own rules unless you allow paid models to do everyday work too.

**Deciding a request.** Open it — in **Inbox → Member requests**, or in
**Members → Request history** — and decide it there. Every reply starts as a
drafted message in full sentences, by name, saying what happens next; edit it or
send it as it is. **Decline** asks you to pick the reason (for a payment: *not on
the statement yet*, *a different amount arrived*, *already recorded*; for leave:
*no absences left*, *asked after the day*; and so on), and the family is told
what to do about it. **Send a message** writes to them on the request without
deciding it — "Who at the centre took the cash?" — and the message is emailed,
shown on their request, and kept on it for the desk.

- **A payment made more than one way.** A family can now say *₦10,000 by
  transfer (reference …) and ₦2,000 in cash to Mrs Awolaja* as two lines, and
  attach a photo of the receipt. **Approve and post** shows one line per way it
  arrived — filled in from what they wrote, even when an older claim put the
  whole story in the reference box — and posts **one ledger entry per line**, each
  with its own method and reference, so the transfer can be found on the
  statement and the cash has a name against it.
- **Correct my details.** The request is read for what it asks: *Date of birth:
  Sat 8 Jun 2013 — on the record now: Tue 6 Aug 2013*. Dates are read day first;
  phone numbers are tidied (+234… becomes 0…); a date that makes the child older
  than 25 or younger than 5, or a number already on another member's record, is
  flagged. **Change it** opens with those lines filled in; check them and press
  **Change and approve** — the record and the request are updated together, and
  the reply says exactly what changed. When they named a field but gave no new
  value ("Parent phone number"), **Ask for the new value** asks them for it. From
  a parent's account, "phone number" means the parent's.

**Finding a request.** A request waiting for a decision is in **Inbox → Member
requests**. Once it is decided — or
the member withdraws it — it leaves the Inbox, and it is in **Members →
Request history** (`/control/members/request-log`). Search there by the
request id an alert or a webhook carried (`REQ-9EE53F1611`), the member's name
or ID, the subject, or the reference on a bank statement; filter by status and
kind. Opening one shows what the member wrote, the reply, who decided it and
when, and the ledger entry a payment was posted to. Typing a `REQ-` id into
**Ctrl K** goes straight to it, and a member's own record has a **Requests**
part with all of theirs. A centre admin sees, and can decide, only their own
centres' requests.

**Summer School** — the season, and only the season.

| Section | What it is for |
|---|---|
| Summer School | The whole coordinator workspace: editions, groups, intake, roster, kiosk, records. One door, fifteen panels. |
| Attendance duty rota | Who is on register duty when. |
| Baseline & endline | The assessments taken at the start and end of an edition. |

**Content** — sessions, missions, the Anchor Journal app, assignments,
events, posts, photo review, comments, community, tournaments, promotions,
announcements, forms, site content, public status pages.

- **Sessions** (Learning → Sessions) shows one year at a time; the arrows step
  a year back or forward, and the year stays in the address, so a refresh or a
  shared link opens the same year. Tap a session to change its dates, name,
  theme or cover.
- **Missions** (Learning → Missions) lists proof waiting for review first, then
  the twelve weeks. Tap a submission to verify it (the XP is awarded) or to
  return it with feedback, which you write in a form and the member sees. Each
  week has its own **Add**.
- **Posts** (Content → Posts) lists every post, drafts and archived included.
  Tapping one opens the stored post for editing. A new post stays a draft until
  its status is set to Published.

**Inbox** — newsletter and messages.

**System** — Access & roles, Audit log, Diagnostics, Integrations &
delivery, Donations, Settings.

**Retired doors that still work.** The old `registration` and `qr` sections
were separate screens that showed a partial, drifting copy of panels the
Summer School workspace already had. They now forward: `registration` opens
Summer School on *Sign-up links*, `qr` opens it on *QR cards*. Old bookmarks
and old links keep working; there is just one screen behind them now.

---

## What you can see and do (permissions)

Access is built from **capabilities**. A role is a fixed bundle of them; an
individual can be granted extra capabilities and limited to named centres.
**System → Access & roles** shows every staff account and, under *What each
role can do*, the full matrix — roles × capabilities × the sections each one
opens — read from the same list the server enforces, so it is always true.

| Capability | Unlocks |
|---|---|
| `people` | Members, centres, volunteers, mentors, applications, families, ID cards; conduct and behaviour for **NGG members and volunteers** |
| `club` | The NGG Club roster, the timetable, the companion |
| `summer` | Summer School editions, groups, participants, sign-up desks; conduct and behaviour for **Summer participants** |
| `checkin` | Check-in desks, their passwords, the duty rota |
| `curriculum` | Lessons, materials, checks, the Club's course list |
| `content` | Posts, events, missions, sessions, assignments, the Journal, quotes, announcements |
| `inbox` | Newsletter, messages |
| `fees` | Dues, training fees, fines, payments |
| `journal` | Writing the institutional record |
| `audit` | Monitoring & evaluation and the audit trail (read only) |
| `settings` | Settings, integrations, diagnostics, donations |
| `rbac` | Staff roles, extra capabilities, centre scope, and account recovery (2FA and password resets) |

| Role | Capabilities | Notes |
|---|---|---|
| **Super admin** | everything | Keep to two or three people. |
| **Admin** | `content` `people` `inbox` `club` `summer` `checkin` `curriculum` | Runs the programme. No money, settings or roles. |
| **Club coordinator** | `club` `people` `checkin` `curriculum` | Suspensions, merges and centre changes wait for a second admin. |
| **Summer coordinator** | `summer` `checkin` | One season. |
| **Centre lead** | `club` `people` `checkin` | **Only their own centre(s).** Has no access at all until given a centre. Suspensions and merges wait for a second admin. |
| **Editor** | `content` | |
| **Auditor (M&E)** | `audit` | Reads; changes nothing. |

**Deliberately in no role but the super admin's:** `fees` (money), `journal`
(the record), `safeguarding` (reports about young people), `settings` and `rbac`
(the system). Grant them to a named person — `safeguarding` to the centre's
safeguarding officer, with their centre scope.

**Nobody grants upward.** Changing someone's role, or resetting their 2FA or
password, needs `rbac` — and never reaches a role further than your own. Only a
super admin can create or touch another super admin.

**Who a record is about decides who may change it.** A conduct entry or a
behaviour note about an NGG member needs `people`; about a Summer participant,
`summer`. Both desks can open *Conduct & fines* and *Behaviour*; each sees and
changes only its own people.

### Centre scoping

A staff account can be **limited to particular centres** (Members → Edit →
Access). A *Centre lead* must be; for other roles it is optional. Scoped, you
see and act on only your centres':

- members (including export, count and select-all), the roster and bulk
  actions — refused per row, never silently skipped;
- the centre directory (you can edit your centres, not add one);
- volunteers and volunteer applicants;
- fees accounts, the arrears list and the fees search;
- conduct and behaviour records;
- check-in desks (a desk for every centre is not yours to see);
- mentor assignments and the status board.

Scoping is enforced when the request arrives, not by hiding buttons — so it
holds even if a stale page is left open.

---

## The status board

**Status board** answers "how is everybody doing?" in one screen, one tab per
kind of person. Every figure is for the centres you can see: a centre lead sees
their own centre, a super admin sees all of them.

| Tab | Shows | Needs |
|---|---|---|
| Members | Counts by status, who came in today (and how many late), the companion's ratings, who is suspended or owes fines, and an **attention list** naming each member who needs somebody and why | `people` or `club` |
| Centres | Per centre: members, who is in today, classes on the timetable, lead, and what is missing (no lead, no classes, not on the map) | `people` or `club` |
| Mentors | Mentees, stars and remarks in the last 60 days, and whether they are active | `people` |
| Instructors | Courses, classes on the timetable, sessions taught and materials waiting for review | `people` |
| Centre leads | Each centre's lead, and the centres with nobody leading them | `people` |
| Staff & admins | Role, centres, 2FA, last sign-in and last action, approvals waiting | `rbac` or `audit` |

The money totals on the Members tab appear only for somebody holding `fees`.

**Active, quiet, dormant.** Active means work recorded in the last 14 days,
quiet within 30, dormant beyond that, and "No activity yet" means nothing has
ever been recorded. Tick **Only what needs attention** to hide everybody who
is fine. Each figure in the strip at the top opens the tab it counts.

**Flags on staff.** "no 2FA" is a staff account without an authenticator;
"no centre" is a scoped role (a centre lead) with no centre assigned. That
account cannot open anything until one is given, in Access & roles.

---

## Members

**People → Members.**

### In the new Control Room (`/control`)

**Members → Roster.** Search (name, member ID or email), filter by status,
programme and centre, and sort by a column; the footer gives the true total.
Click a member to open their record, then **Edit**. Only the fields you
change are sent, and only those are checked, so an old value on a record you
did not touch (an email typed as "N/A", say) no longer stops you saving a
phone number. A refused save keeps the form open and says why, for example
"…is already on Member 08's record". **Add member** gives an NGG member the
next printed ID. Tick rows for **Set status** or **Post to centre**; staff
accounts and your own are refused and named. A Club coordinator's change is
sent to a second admin to approve, and the screen says so. Roles are not
edited here: that is **Settings → Access & roles**.

### A member's courses

A member's **courses** are chosen, not typed. In **Edit**, pick their
**Division** and the **Courses** list shows that division's courses as they
are under **Divisions & courses** (Chess is in every division). Tick what
they study. Their lessons, their Community channels, the assignments that
reach them and the instructors' class lists all follow exactly those courses.
A member on two courses is in both classes.

- **Several at once:** tick members in the roster → **Set courses**, then
  *Add these*, *Replace theirs with these*, or *Take these off*. Running it
  twice reports "unchanged", not applied again.
- **A course that is not in the catalogue is refused by name.** Add it under
  **Divisions & courses** first.
- **Older records** had a typed *track* instead ("Coding", "Piano", "Tech").
  Where it names courses exactly, it was turned into chosen courses
  automatically. Where it is broad ("Tech", "Media", "Music") the member keeps
  that division's or the music courses until you choose; a word that names no
  course ("Design") gives none. Filter the roster by **Missing → No courses
  chosen** to find them, select all, and use **Set courses**.
- An instrument is the **Musical Instruments** course, never the whole arts
  division: a pianist is no longer given Catering, Adire and Crafts.

### The dashboard

The **Dashboard** tab counts the membership and, under **Conduct &
progression**, what has happened to it. Every one of these tiles is a list:
press it and the roster opens filtered to exactly the members it counted.

| Tile | Counts |
|---|---|
| **Fined** | People with a fine imposed — owed, paid or cleared. A fine that is only *proposed*, or was *waived* or *lifted*, is not counted. |
| **Owing · ₦…** | People with a fine still active or pending, and how much. This is the conduct record's figure; the ledger balance is in the **Dues** panel, which needs the `fees` permission. |
| **Suspended now** | A live policy suspension (no end date, or ending today or later), or a record set to *Suspended* by hand. Both are turned away at the gate. |
| **Evicted** | A live eviction. An evicted member is not also counted as suspended. |
| **Sanction to decide** | The policy proposed a sanction and nobody has confirmed or dismissed it yet. Work these from **Conduct & fines**. |
| **Promoted to NGV** | Every recorded NGG → NGV promotion; the note under the tiles gives the last 12 months. |

A centre-scoped admin sees their own centres' figures only.

### Finding somebody

- The **search box** matches name, member ID and email, any part of it.
- **Filters**: centre, status, membership type, **level**.
- **"Missing…"** filters find records that would print a card that is
  technically fine and wrong in the hand: no photograph, no printed ID, no
  discipline or track. These are the same three counts the ID batch drawer
  shows, so the count and the list always agree.
- **Sorting** — click a column. Name order, newest first, centre, status.
- **Paging** — the header shows the true total for your filters, not just
  what is on screen.

### Statuses

| Status | Means |
|---|---|
| Active | In the programme |
| Graduated · NGG | Finished the NGG track |
| Graduated · Vanguard | Finished the Vanguard track |
| Suspended | Out of circulation, expected back |
| Inactive | Out of circulation |

### One member's whole record

Click a member to open their record. **Overview** is what it always showed:
profile, ID card, mentor, NGV standing and status. The other tabs come from
one read, so moving between them costs nothing:

- **Attendance**: the last 60 days, with lates (and by how many minutes) and
  the absences the nightly sweep recorded.
- **Conduct**: their standing, lates, absences against the limit, fines owed,
  infractions and sanctions. When a guardian has answered "why were they
  away?" on WhatsApp, their answer is beside the absence — "Guardian says:
  Sick (whatsapp)". It explains the absence; it does not remove it. Void the
  absence yourself if the reason excuses it.
- **Fees**: balance, payable now and recent ledger entries. Only for `fees`.
- **Curriculum**: how far through their course they are, what is overdue and
  what comes next.
- **Companion**: the last six weekly assessments.
- **Family & mentor**: the guardian on the record, family accounts linked to
  them, and their mentor with meetings in the last 90 days.
- **Classes**: their course's classes on their centre's timetable.

A tab you have no permission for says so. "Not part of your access" is not the
same as an empty ledger, and the screen never shows one as the other.
Setting **Suspended** or **Inactive**, or changing somebody's role, signs
them out on every device at once. A suspended account cannot sign back in.

### Acting on one member

Open the **Actions ▾** menu at the end of the row. You get exactly the same
actions as the bulk bar, plus two that only make sense one at a time:

- **Reset their 2FA** (needs `rbac`) — they enrol a new authenticator next
  visit; their backup codes stop working.
- **Send a password reset** — they get a one-time link by email. Their
  current password keeps working until they use it.

Neither of those has a bulk version, on purpose.

### Acting on many

Tick rows, or tick the header box for the whole page. A bar appears at the
bottom of the table:

- **Set status…**
- **Post to centre…**
- **Set level…**
- **Set membership type…**
- **Dues reminders…** (needs `fees`)

Each of these asks for the value first, because "set status" has five
answers and "post to centre" has as many answers as there are centres.

If your filters match more rows than the page shows, the bar offers **"Select
all N matching the filter"**. That is how you act on four hundred people
without paging through them.

### Other things on this screen

- **Export CSV** exports **everything matching your current filters**, in
  your current sort order — not just the page. With rows ticked, the bulk bar
  offers **Export selected** instead.
- **Print IDs** opens the batch drawer for everything matching your filters.
  See [ID cards](#id-cards).
- **Import roster** loads the file produced from the members workbook. See
  `docs/ROSTER-IMPORT.md` if you maintain that workbook. Every member it
  touches gets a printed ID if they have none — the dry run names each one.
  An ID in an older format is listed with **Declare this format** (super
  admin); an ID that is somebody else's here, or on two rows, is refused by
  name, and an import never changes an ID a member already carries. A
  probable typo (`O24-016`) is named with the real ID it looks like and whose
  that is. **Download the ID list (CSV)** gives every ID issued or spelled
  differently, to copy back into the workbook. Children on the registration
  form with no roster row are **filed as applications**, not members —
  confirm them in Applications, which issues their ID.
- **Duplicates → Member IDs** lists any printed ID carried by two records,
  and anybody holding two IDs. One child entered twice: **Same person?**
  merges them, and the record the ID belongs to keeps it — both old cards
  still resolve. Two children given one number: give the one who does not
  hold it a new ID. Every member ID is held by exactly one record, enforced
  by the database; typing somebody else's ID on a record is refused with
  their name.
- **+ New member** creates one by hand.

### History

Every change a staff account makes is written to the **audit log**
(System → Audit trail) with who, what and when. A bulk run is **one** entry
naming the action, the count and every refusal — not one entry per row —
so "who suspended forty people on Tuesday" has a readable answer.

### Registration: helping a new member finish registering

Control Room → Members → **Registration** (`people`). Every NGG member has a
registration checklist; a member accepted from an application gets theirs at
once. A named **supervisor** at the member's centre helps them through it, and
the member and their guardians see how far along they are.

The checklist has two kinds of item:

- **From the record.** Guardian linked, consents recorded (taking part,
  emergency medical care and records granted; photos and the website answered),
  photo on file, date of birth, school, emergency contact, courses placed, the
  membership fee paid (only while fees are switched on) and the ID card
  printed (a proof does not count). These are done when the member's record
  shows them, and only then: a photo of a birth certificate does not give the
  record a date of birth. Fix the record, and the item passes.
- **Items staff add.** A title, what the supervisor should do, the evidence it
  takes (a photo, a document, or a note), whether the supervisor must be at the
  member's centre that day, and how old the evidence may be.

| You want to… | Do this |
|---|---|
| See who has not finished | **Show: Still registering**. Each row has their progress, what is left and who is helping. **Nobody helping yet** lists the ones without a supervisor. |
| Give a member a supervisor | Open the member → **Assign a supervisor**, or select several from one centre → **Assign a supervisor**. Pick from **Suggested** and press **Assign**. |
| Understand a suggestion | Each line says why, from what the system already holds: check-ins at that centre's gate on recent Saturdays and in the last six weeks, the check-in desk rota, the timetable there, what the person says they are free for, how many members they already support, and that their safeguarding is cleared. A member's own mentor is marked **Already their mentor**. |
| Ask someone who has not been at the centre lately | Under **Not seen at …**, press **Assign with a reason** and say why. The reason is kept in the audit log. Nobody uncleared is ever listed. |
| See what is left for one member, and the evidence | Open the member. **Still to do**, **Done** and **Evidence submitted** (every attempt, accepted or refused, with the reason). **Open file** shows a submitted file. |
| Reject an item that was verified | Open the member → **Done** → **Reject**, and say what was wrong. It reopens and the supervisor is told why. Items from the record cannot be rejected: correct the record. |
| Add, change, reorder or retire an item | **Add an item** at the top; open an item under **Items staff added** to **Change**, **Move up**, **Move down** or **Retire** it. A retired item leaves every checklist but keeps its history; **Bring it back** restores it. |
| Start checklists for members who joined before this existed | **Start N checklists** at the top (at most 500 a press; it says how many are left). Nobody is told until a supervisor is assigned. |
| Help a member yourself | Assign yourself, then use **Show: Mine to help**. Open the member and press **Submit** (or **Check again** for an item from the record). |

**Who may supervise.** Staff holding `people` whose centres include the
member's; an NGG mentor at that centre whose screening is recorded; an NGG
volunteer mentor or instructor at that centre whose safeguarding is cleared.
Nobody supports more than 12 members at once: a thirteenth is refused and
named. The assignment checks all of this again when you press it, member by
member, whatever the screen showed; a scoped admin is refused for members
outside their centres.

**What counts as evidence.** The supervisor submits from **My registrations**
in the Mentor Portal (My role → My registrations), or from this screen if they
are staff. An item counts only when the evidence is the kind the item asks for
(a photo is JPG, PNG, WebP or HEIC; a document is a PDF, a Word file or a photo
of the page; at most 10 MB, uploaded here, not a link elsewhere), is no older
than the item allows, comes from the member's assigned supervisor, and — when
the item says so — the supervisor checked in at the member's centre that day.
A refused attempt says why in words, and is kept.

**Who is told.** The supervisor, in the app, when they are assigned and once a
week while any of their members has items open. The guardians, by email and
in the family account, once a week, with only the things the family can do
(consents, the photo, date of birth, school, an emergency contact, the fee).
The member sees "Your registration: 6 of 9 done" on **Me**, with what is left
and the supervisor's first name; a guardian sees the same on **Today**. Neither
sees any evidence, or anyone else's.

| Refusal | What it means |
|---|---|
| cannot supervise there | Not staff with `people` for that centre, and not a cleared NGG mentor or volunteer there. |
| not seen at the centre — give a reason | No check-in, rota or class there in six weeks. Assign with a reason, or pick someone suggested. |
| the supervisor is at the cap | They already support 12 members. |
| not in a centre you administer | Outside your centre scope. |
| This item needs a photo; that is a PDF | The evidence was the wrong kind of file. |
| That is 45 days old | Older than the item accepts. |
| This item needs you at … | The supervisor had not checked in at the member's centre that day. |

---

## Centres

**Members → Centres.** A centre is a place. Adding, editing and retiring one
needs the *Members* (`people`) permission. **Add a centre** is at the top of
the page.

### Centres come from CACENTRE

CACENTRE owns the buildings, so **CACENTRE's locations list is the one list of
places** (CACENTRE → *Attendance → Desks and settings → Locations*). The
CACENTRE gate sends that list to NGG whenever it changes, and NGG's centres
follow it. You will see a note at the top of this page once the list has
arrived, and a **From CACENTRE** chip on each centre that comes from it.

| In CACENTRE you… | In NGG this happens |
|---|---|
| add a location | a centre is added, with a code made from its name (change the code here before any card is printed) |
| rename a location | the same centre is renamed, and every member, participant, volunteer and other record that names it moves with it |
| take a location off the list | the centre is retired here (never deleted) |
| change a location's days, hours or terms | kept on the centre for reference; NGG's own attendance policy still decides lateness and NGG's days |

What you can no longer do here, once the list has arrived: **add** a centre,
**rename** a CACENTRE centre, change whether it is **open**, or **remove** it.
The screen and the server both refuse (`managed_by_cacentre`) and say where to
do it instead. Everything else is still NGG's: the **code**, the **colour**,
the address and map, the lead, the contacts, the public page, and which
programmes run there.

A centre NGG already had is matched to its CACENTRE location by name (or a
name the location had before), so its code, colour and every record keep
working. A centre NGG has that CACENTRE does not shows **Not a CACENTRE
location**: retire it here, or ask CACENTRE to add it.

**Check-ins through the CACENTRE gate** now record which location the person
came in at (the *centre* on the attendance record). The gate also judges
lateness at the desk by **NGG's own policy** (resumption and grace from
*Settings → Attendance*), so the desk shows what NGG records.

**NGG centres and Summer School centres are separate records.** NGG is where a
member belongs for years; Summer School is a season. In October 2026 the two
were split, once, automatically:

- **Egbeda** and **Ayobo** are the NGG centres. Every member, mentor and NGG
  record that already said "Egbeda" or "Ayobo" is on them with no change, and
  members written differently ("egbeda centre", "NGG Ayobo") were tidied onto
  the exact name.
- The centre Summer School shared with them became Summer School's own record,
  **Egbeda (Summer School)** / **Ayobo (Summer School)**, keeping its code (the
  prefix on the Summer cards already printed); its participants moved with it.
- Every Summer School centre was **retired** — on record, offered nowhere.

**Summer School centres end with their edition.** When an edition's season
ends (or a coordinator closes it), every centre that runs only Summer School
and that no live edition still uses is retired. Making an edition live brings
back the Summer venues its groups meet at. NGG centres are never touched.

**Programmes at this centre** (under *Identity* when you edit one): tick **NGG
Club**, **Summer School**, or both. Each programme offers only its own
centres — the NGG join form, the Club timetable and its public page list NGG
centres; the Summer form, the Summer desks, the review queue, the Summer roster
and the Summer centre pages list Summer centres. A centre that runs only one
programme shows *NGG Club only* or *Summer only* on its row. Every centre
starts as both, so nothing changes until you narrow one.

**Codes.** `ST` is kept for Summer cards whose centre cannot be found, and a
code made only of digits (`026`) would read as an NGG member number, so both
are refused.

Each row shows what depends on it: members posted there, Summer School
participants enrolled and waitlisted in the current edition, and groups. When
you try to delete one, the refusal adds volunteers to that list.

**Open a centre** (tap its row on a phone) to see its record, with **Edit**,
**Map and geo-fence**, **Summer venue** (when it runs Summer School), the public
page when it is live, and **Remove**. Edit is one form: identity, programmes,
location and leads, contact and meeting times, and — once the public page is
published — the page's words and pictures. The map and the Summer venue each open
on a page of their own, with *All centres* to come back. A note at the top counts
the centres that are not mapped yet, because the check-in desk cannot confirm
somebody is at a centre without its map.

### Retiring versus deleting

When you try to delete a centre that is in use, you are asked to **retire it
instead**. Take that offer unless you are certain.

- **Retire** — the centre stops being offered anywhere (no new members, no
  new groups) and every existing record still resolves. A `retired` chip
  appears on the row. This is almost always what you want.
- **Delete anyway** — the row goes. Records that pointed at it are left
  pointing at a name that no longer exists, including printed card prefixes.

A centre with nothing depending on it deletes without the prompt.

## Timetable

**People → Timetable** (anyone with *Club*, *Members*, *Curriculum* or
*Check-in* can read it; changing it needs *Club*). One timetable per centre:
each class is a course, a day, a start and end time, and optionally a level, a
room and an instructor. Pick the centre at the top — the screen remembers it.

**Clashes are refused, not warned about.** Saving a class is refused, with the
reason in words, when it would:

- put two classes in the **same room** at overlapping times;
- give one **instructor** two classes at once — at any centre;
- run the **same course and level** twice at once at one centre;
- fall on a **day the centre does not meet**, or **outside its hours** (both
  read from the centre's *meeting days / time* on People → Centres).

A class that ends at 12:00 and one that starts at 12:00 do not clash. Classes
saved before a rule existed, or that a centre edit has since put out of hours,
are listed at the top under *Clashes to fix*, each with a **Fix** button.

**Removing a class** asks first, then takes it off every view. A centre with classes
on its timetable counts them among its *uses* when you try to delete it.

### Where people see it

| Who | Where |
|---|---|
| Staff | **People → Timetable**, with **Print** and a link to the public page |
| Members | **Dashboard → Timetable** (`/dashboard/timetable`) — their centre, their course marked "Your course" |
| Parents | their **family account** (`/family`), on each child's card |
| Anybody | **`/timetable`** — the **Timetable maker** (menu: *The room → Timetable maker*; also linked from the Centres and Parents pages). *Start from* a centre's week, or share `/timetable?centre=<centre>` to open on it |

The public page never shows instructors' names. The staff, member and family
versions print on one clean sheet (**Print**), list classes under a heading per
day as a real table, say "Your course" in words rather than by colour alone,
and become labelled cards on a phone rather than a table that scrolls sideways.

### The Timetable maker (public)

**`/timetable`** is a free tool for anybody — members, parents, children who
are not members yet. Nobody signs in and nothing is sent to us: the timetable
stays in that browser.

- **Eight designed templates**: Studio, Midnight, Sunrise, Blueprint, Bold,
  Kente, Pastel and Chalkboard. Each has eight named colours (Blue, Green, Amber, Rose, Violet,
  Orange, Teal, Slate), and the text on every class block reads at 4.5:1 or
  better on its colour.
- **Classes** are added through a form — name, days, start and end, where, a
  note, a colour. Nothing needs dragging. Classes that overlap sit side by side
  and the list says "Overlaps …".
- **Layout**: which days, which hours (they widen by themselves to fit an
  early or late class), 12- or 24-hour clock, A4 or US Letter, landscape or
  portrait.
- **Start from**: a centre's official week, the sample school week, or blank.
  A centre's classes come in **ticked, one by one** (*Import → Which classes
  are yours?*): only what is ticked goes in the week, and instructors are never
  named. A signed-in member opening their centre (*Make my week*) gets **their
  own classes only** (their courses, and Chess), titled "<name>’s week", with
  a note saying how many more run there and a *Choose classes* button to add
  any of them. A timetable is a person's, so for anybody else a centre link
  opens *Which classes are yours?* with **nothing ticked** and nothing added
  until they choose; the week keeps its own title ("My week").
- A centre that moves a class the visitor **kept** is reported for them to
  accept; a class they left out is never reported as a change.
- **Undo and redo** (buttons, or Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z): every
  change can be taken back, including a cleared timetable.
- **Quick add**: the NGG Club's courses and common school subjects, one tap to
  start a class. Each class can carry an **icon** (named, for screen readers).
- **Title colour**: any colour; one that will not read on the template is
  flagged with its contrast ratio and a one-tap "nearest shade that reads".
  **Larger text** for a timetable read from across a room. **Week starts on**
  Monday or Sunday. Eight templates, including **Pastel** and **Chalkboard**.
- **Paste from a spreadsheet** (*Start from*): rows copied from Excel or Google
  Sheets — day(s), times, class, where, in any column order ("Mon/Wed",
  "Mon–Fri", "9am", "14:30–15:15") — with unreadable lines named.
- Members (Dashboard → Timetable) and parents (family account) have **Design my
  own timetable**, which opens the maker on their centre's week.
- **Take it away**: **Download PDF** (fills the page at the chosen size),
  **Picture (PNG)** (twice print size), **Add to calendar (.ics)** — every class
  repeats weekly in Lagos time from the *Starts on* date, until the optional
  *Repeats until* date — **Print**, and **Copy link**, which carries the whole
  timetable in the link so someone else gets their own copy to change.

**Centre codes are unique across the whole system**, not per year. The code
is the prefix on printed member ID cards, so changing one changes what new
cards say.

---

## Summer School

**Summer School → Summer School.** One workspace, fifteen panels, grouped by
what you are actually doing.

### The Summer School portal (`/summer-admin`)

The coordinator's screen for the season, on a phone or a desk. It opens on
**Today**: who is in, who came late, who has not come, and a **Needs you** list
with the children who could slip through first (came then stopped, missing a
required consent), then the things worth a call this week. Every number on it
opens the list it counts — "1 came, then stopped" opens exactly that child.

The screens are **Today, Participants, Registrations, Groups, Register,
Check-in desk, Incidents, Consent, Messages, Cards & QR, Editions &
certificates** and **Into NGG**. The season's settings, sign-up links, imports
and history stay in the Control Room (below).

- **Incidents** — first aid, health, behaviour, pickup, lost items. Type the
  child's name or printed ID; a name that matches two children is refused and
  you are shown their IDs. **Tell guardian** sends an email and a text where the
  family has them, and is only marked told when one actually went — it never
  includes your note, which may name other children. If nothing could be sent
  you are given the guardian's number to call.
  **Safeguarding** is different on purpose: saving it files a case in the
  safeguarding queue (Control Room → People → Mentorship → Safeguarding) and
  emails the centre's safeguarding officer. The portal then shows only
  "Restricted" and the case number — not the child, not the details — and it
  cannot tell the family or close it. The lead decides both.
- **Messages** — pick a template, who it goes to (not in today, stopped
  coming, under 50%, not yet confirmed, or everyone), and email, SMS or both.
  The preview shows the message as a family reads it. Sending waits 8 seconds
  so it can be undone, at most 500 families go in one send, and the Sent list
  shows how many each one reached. SMS is offered only once text messages are
  set up; the "Pickup reminder" appears only when a sign-out time is set.

- **Find a child or jump anywhere:** press **/** or **Ctrl K** (⌘K on a Mac)
  and type a name, a printed ID, or the last four digits of a card. With
  nothing typed it shows the children you opened last.
- **Shortcuts:** **g** then **t** Today, **d** desk, **r** register,
  **p** participants, **i** incidents, **m** messages, **n** Into NGG; **?** lists them; **Esc** closes the
  top panel. Shortcuts do nothing while you are typing in a box.
- **Undo really undoes.** Alerting every absent child's guardian, sending a
  message, moving children into NGG and sending joining invoices wait **8 seconds** before
  anything happens. Press **Undo** (or **z**) inside that time and nothing is
  sent. If you close the tab during the 8 seconds, the act still goes through
  shortly afterwards — it is held on the server, not in your browser.
- **Check-in desk** takes a card's code, a printed ID or a name and checks the
  child in or out with the same rules as the door: lateness from the door time
  and grace minutes (Control Room → Settings → Attendance), the season's dates,
  and conduct holds. Letting a child go before sign-out time asks for a
  reason, which is recorded. For a desk with a camera that keeps working
  offline, use a check-in desk link instead.
- **Into NGG** lists children who finished with 70% attendance or more. "No
  NGG centre to offer" means no active centre runs NGG — add or map one in
  **Control Room → Centres** first. "Fees are off" means no joining invoice
  can be sent until fees are switched on in **Control Room → Fees**.
- A coordinator scoped to some centres sees, counts, searches and alerts only
  those centres' children, everywhere in the portal.

### Structure — what the season *is*

- **Editions & groups** — the important one. See below.
- **Academy catalogue** — Summer School's academies and courses for the season. The NGG Club keeps its **own** course list under **Curriculum → Courses**; editing one never changes the other.
- **Programme & policy** — now in **Money → Conduct & fines** (the calendars,
  the policy and the compliance board); this panel links there.

### Intake — getting children in

- **Intake form** — build the form families fill in.
- **Sign-up links** — Summer School's shareable links: a **Public sign-up** for families, a **Review desk** for approving those sign-ups, and a **Registration desk** where staff enrol a walk-in child (details, photo, consent) with a desk password.

The door's **Check-in desks** are no longer here: they check in members and volunteers all year, so they have their own section (Control Room → Check-in → Check-in desks), with the **Duty rota** beside them.
- **Pending sign-ups** — applications waiting on you.
- **Enrol at the desk** — enrol somebody in front of you, right now.
- **Bulk import** — paste a CSV of participants; each row is enrolled and
  QR-bound, respecting capacity.

### Running — day to day

- **Roster** — the edition's participants.
- **Check-in kiosk** — the screen you leave open at the door.
- **Attendance** — the registers.

**The season.** An edition is live only with its start and end dates set,
and no more than six months apart. Outside those dates the desk will not check
a participant in: it says *season ended* or *season hasn't started*, with the
date. Cards issued for an edition expire on its end date. The night after the
end date, the edition moves to **Closed** by itself. Archive it from Records
when you are ready.

**Closing a season thanks its volunteers.** The moment an edition closes —
by itself after its end date, or with **Close the season** in Editions &
certificates — every volunteer of that season is sent a thank-you by email:
everyone on the Summer roster (Summer-only or Club-and-Summer) who has not been
archived, and any Club volunteer who checked in during the season's dates. Each
is thanked by name, with the sessions they gave that season. It happens once per
person per season — closing again sends nothing twice. The first few go
straight away and the rest within minutes; a message that did not go is tried
again (three times in all). Editions & certificates shows how far it has got
(*N of M volunteers thanked*) and how many have no email address on file, so
those people can be thanked in person.

**Issue certificates** now says *Issuing…* while it works and reports how many
were issued; once every child still active has one, the step shows *N issued*
instead of the button.

**The volunteer at the door** has a guide on the desk itself (*Volunteer guide*, under the camera) and a printable copy in `docs/VOLUNTEER-DESK-GUIDE.md`. A *Do not admit* result stays up until they press OK.

**The face check (optional).** Turn it on in Control Room → Settings →
General → *Face check at the check-in desk*. After a scan, the desk shows
**Check face**: the front camera looks at the person for a few seconds and
compares them with the photo on that card's record. The desk then sees one of:

| Says | Means |
|---|---|
| *Looks like the same person* | The face matches the record photo, and it is a real, live face. |
| *Not sure* | Close, but not clear enough (poor light, a cap, a slow phone). Check another way. |
| *Does not look like the card's owner* | Check their identity another way before admitting. |
| *That doesn't look like a live face* | A photo or a screen may be held up to the camera. |
| *No clear face seen* | Ask them to face the camera in good light and try again. |
| *No photo on the record* | Nothing to compare with; check another way. |

The person on duty always decides: **Admit**, or **Hold — check another way**.
The check is advice, never an automatic refusal.

Privacy (Nigeria Data Protection Act 2023): the comparison happens **on the
desk's own device**. No picture of the face and no face measurements are sent
to the server or kept anywhere; the camera is switched off as soon as the check
closes. The server records only the outcome, the scores and the decision,
against the card holder, in the audit trail (`gate.face`). Because a face is
biometric data, tell families in the programme's privacy notice that the desk
may compare faces with record photos, and leave the check off at centres where
that notice has not gone out. The first use on a device downloads the face
models (about 9 MB, once); after that they load from the device.

**One door, everyone.** The kiosk, a gate link's desk and *Mark present* on a
profile all check in **participants, volunteers and NGG members**. Scan any
card or type the number printed on it. A member's secure card (`MEMQR-…`),
an older printed member card, and a typed member ID (`026-014`) all work.
A member's attendance belongs to the Club, so checking a member in from the
Control Room needs the **Club** permission. A gate link's desk needs no
permission, for anyone. Refusals you may see for a member:

| Says | Means |
|---|---|
| *That member card was replaced* | They have an old card. Ask for the new one, or type their member ID. |
| *That membership is not active* | The member is suspended or inactive. Refer to the coordinator. |
| *Not permitted* | You lack the Club permission, or your session expired. |

### Records — what comes out of it

- **Group report** — one group's attendance and progress.
- **QR cards** — the pre-printed scannable cards.
- **ID cards** — through to the studios.
- **Certificates** — end-of-season certificates.

### Editions

An edition is one season. It has a name, dates, an apply-opens and
apply-closes date, and a lifecycle:

**planning → active → closed → archived**

- **Only one edition can be `active` at a time.** Activating a new one
  automatically moves the previous one to **closed**. It is *not* archived —
  archiving is a separate, heavier step that rolls the season up.
- To archive, use the archive action explicitly. The status control refuses
  to do it for you, so you cannot archive a season by accident while
  changing its state.

### Groups

A group is a class inside an edition — a centre, an academy, a session
time. It exists because a flat participant list could not express two Music
classes at one centre, could not be handed to a named lead, could not carry
its own dates, and could not be reported on.

Each group has a **code**, generated from the centre and academy (e.g.
`EG-MUS`). Codes are unique **within an edition**, so last year's
`EG-MUS-AM` is free to be reused this year.

Rules the system enforces, so you do not have to remember them:

1. **A group's edition cannot be changed after it is created.** Create the
   group in the right edition; if it is in the wrong one, make a new one and
   move the participants.
2. **A participant belongs to at most one group, and only to a group in
   their own edition.** Assigning across editions is refused outright.
3. **Capacity is a refusal, not a warning.** An assignment that would take a
   group past its cap fails *for the rows that do not fit* and tells you
   which ones. The rest go through.
4. **You cannot lower a group's capacity below the number already enrolled.**
   Move people out first.
5. **You cannot delete a group that still has participants** unless you say
   where they go — either *reassign to* another group in the same edition, or
   an explicit *unassign*. If the destination is full, the delete is refused
   rather than half-done.

**Meeting days** are stored normalised. Type them however you like — the
system reads the day numbers out, removes duplicates, sorts them and drops
anything out of range. `"6, 3, 1, 3, 9, 0"` is stored as `1,3,6`.

### Past editions

**Summer School → Past editions** lists every edition. **Import a past
edition** brings in a season's register from a spreadsheet (CSV or .xlsx; the
header has a template): name, date of birth, centre, course, guardian name,
phone and email, the ID they were printed, days present, status and notes.
Headers are matched loosely ("Child's Name", "Parent Phone", "Days present").

- Choose an edition that is not running, or describe a new one (name, year,
  start and end); a new one is created **closed**.
- The file is **checked first**: new, already there (same name and the same
  guardian phone or email), and refused rows with the reason (no name, a date
  that is not a date, an ID that is somebody else's). Nothing is written.
- **Import** writes exactly the file that was checked. No card is bound and
  nobody is emailed.
- A row's centre is matched to Summer School's own record of that place. A
  place Summer School has no record of is created as a **retired** Summer
  centre, so the history resolves and no form offers it.

### Assigning participants to a group

Open a group → **Assign**. You get two lists: the group's current
participants, and the **ungrouped** active participants of that edition. Search
either. Move people across.

A run moves up to **500** at a time and reports a verdict for every row. If
seven of your forty were refused, the toast says seven were refused and the
list tells you why for each — it does not report the run as a success.

### The group report

**Records → Group report**. Pick an edition (it opens on the current one) and
you get every group in it side by side: capacity, enrolled, sessions held,
present, expected, attendance rate, lead and dates. **Export CSV** gives you
the same table.

Attendance is measured over **the group's own dates**, not the edition's. If
nothing has been measured yet, the rate is **blank**, not 0% — a group that
has not met yet does not have 0% attendance, and the two must not look the
same on a report somebody makes decisions from.

---

## The NGG Club

The Club is where Summer School participants continue year-round. It has
its own permission (`club`), so a Club coordinator sees the Club and nothing
else.

### Divisions and courses

NGG is organised in **four divisions**, and every NGG course sits in exactly
one of them:

| Division | Card label | Courses (as seeded) |
|---|---|---|
| 🎭 Creative & Performing Arts | CREATIVE ARTS | Music, Musical Instruments, Vocal Training, Music Production, Acting, Stagecraft, Catering, Adire, Crafts |
| 🎥 Media & Content Strategy | MEDIA | Video Production, Cinematography, Graphic Design, Branding, Digital Content Creation, Social Media, Visual Storytelling |
| 💻 Technology & Applied Engineering | TECH | Artificial Intelligence, Coding, Software Development, Robotics, Automation, Tech Product Design, Cybersecurity |
| 📊 Business Strategy, Operations & Administration | BUSINESS | Project Management, Product Management, Data Analysis, Business Development, Finance, Human Resources, Operations, Administration, Strategic Thinking |

Edit them in **Learning → Divisions & courses** (needs `curriculum`): the
icon, the name, the label the member card prints, the sentence families read
on the join form, and the courses. **Summer School keeps its own catalogue**
(Summer School → Structure) and nothing here changes it. A course already
holding members, lessons or classes asks before it is taken off; its members
keep it on their record. *Reset to the NGG divisions* puts the table above
back.

The NGG join form asks for a **division first**, then a course inside it, and
says what joining costs before anybody applies.

### Reviewing applications (Inbox → Applications)

| You want to… | Do this |
|---|---|
| Accept a child | **Accept & create member**: the start date, and the centre when the application names none. Each child is their own member, even when brothers and sisters applied from one parent's email. A declined application, or a child who is now outside 10 to 17, is refused with the reason. Pressing it twice, or in two tabs at once, makes **one** member: the second press says *already had a record* and names them. The application remembers the member it became. |
| A converted child | Cannot be **waitlisted or rejected** from the application (*already a member*): that used to send the family a refusal after their welcome. Change their membership on the member record. |
| Put a child on the waiting list | **Waitlist**. The family is emailed and the main parent is texted. The application stays in the inbox, marked *Waitlisted*, and you accept it from there when a place opens. |
| Decline | **Reject**, with an optional line the family reads in the email and text. |
| See only your centres | A centre-limited admin sees, exports, accepts and declines their own centres' applicants only. |

A family who sends the form again for the same child (same email and date of
birth) is emailed a 6-digit code and must enter it before the application
changes. Without it, anyone who knew the email and the birthday could replace
a child's guardian and photo.

### Volunteer registrations (Mentors → Volunteers)

Both volunteer forms (Summer School at /volunteer, NGG all year at
/join/volunteer) now ask for **two referees** and a signed **safeguarding
declaration**. An applicant **under 18** names a parent or guardian who agrees.

- The review shows the referees, the declaration and the guardian; under-18s
  carry an *Under 18 · guardian* chip. Approving one asks you to confirm you
  have **spoken to the guardian**; that is recorded as their consent.
- Approval issues the ID, but a volunteer sees children (the instructor
  roster, the mentor portal) only once **safeguarding is set to Cleared**.
  Contact the referees before you clear them.
- Somebody already volunteering for one programme who applies for the other
  is a new application; approving it makes them serve **both**.
- NGG's form only offers centres that run the Club. **Settings → Sign-ups**
  now has a separate switch for NGG volunteer registration.

### Invoices, receipts and certificates (from 4 Nov 2026)

Every invoice, receipt and Math Lab certificate is a printable A4 page.
Open one, then press **Print or save as PDF**.

- **Numbers** follow on with no gaps: `NGG-INV-2026-00001`,
  `NGG-RCP-2026-00001` and `NGG-ML-13-2026-00001` (13 is the level). A
  cancelled invoice keeps its number and says it was cancelled. Invoices and
  receipts made before 4 Nov keep the numbers they were issued with.
- **A receipt never changes.** It is printed from what it said when the
  payment settled. A later rename or fee change does not touch it.
- **A transfer still being checked** gets an *Acknowledgement*, not a
  receipt. The receipt follows when the second person confirms it.
- **Math Lab level certificates** were given when a member cleared a level of
  the old twenty-one-level ladder (70%, or a Distinction at 90%). That ladder
  was replaced on 3 Nov 2026 by the **Maths Lab** at `/study/lab` (the
  Arcade's *Maths Lab* band opens it), so no new level certificates are
  issued; every one already issued stays valid and verifiable.
- **Maths Lab certificates** come in two kinds, both NGG documents (numbered,
  in the family's Documents, checkable at `/verify`, printed in the same
  certificate design):
  - a **stage certificate** (`NGG-MLS-…`) for every stage of ten topics, when
    all ten are mastered and the stage boss is beaten — it records the boss
    score when the boss was the session that earned it;
  - the **course certificate** (`NGG-MLC-…`), the full one, once every stage
    of a course is done.
  They are issued automatically the moment they are earned (a member who had
  already earned one gets it the next time they open the Lab), once each, and
  a topic that later slips in a review does not take one back. In the Lab they
  are linked from the Map (each stage), Courses and Progress.
- **Families** find them in the Family Portal under Money → Documents.
- **Verify:** the QR code opens `/verify/<number>`. Anyone holding the
  document can check it there with the check code printed under the QR.
  Without the code, nothing is shown.

**Details on documents** (Money → Membership payments → *Details on
documents*): the legal name, RC number, TIN, address, fees contact,
signatories, VAT and days to pay.
- A blank detail is left off the page.
- Issued receipts and certificates keep the details they were issued with.
  A detail that was blank on them prints once you fill it in.
- VAT is *Exempt* by default. At 7.5% the VAT is shown inside the amount
  charged, so the total stays what the account charged.

### Joining fees: the membership invoice

Nothing is paid until a child is **accepted**. In **Inbox → Applications**,
*Accept & create member* asks for the **start date**, then creates the member
and emails the family **one invoice**:

- the **membership fee** (Money → Dues & arrears → membership fee), and
- the **commitment fee** for the first month, charged **only for the meeting
  days left** from the start date (their centre's meeting days on the Club
  calendar; calendar days if no calendar is set). Joining with one Saturday of
  four left costs a quarter of the month. From the next month the commitment
  fee (monthly dues) is charged in full.

The fees must be switched on under Dues & arrears; with them off the member is
still accepted and the screen says no invoice went.

**Clearing dues is no longer possible.** "Clear dues they don’t owe" (from the
roster or a member's record) was withdrawn on 30 October 2026: it let one person
wipe a family's debt with a sentence of reason, which is how a fraud would look.
Nobody can use it, the super admin included. A member whose dues were settled to
a date before then still shows "Membership and dues settled up to …" on their
Fees, and those periods are still never charged. To take money off an account
now: record the payment that was made, or waive a specific amount with its
reason (Money → the member's account). A waiver is capped at what is **payable
now** — the training place is never part of it (it is written off by the MOU,
not waived), so waiving more than is owed cannot leave credit behind.

**Reading a member's account** (Money → Dues & arrears → open a member). It
reads like a bank statement, in three parts:

- **The summary**: *Payable now* in large type, and beside it the sum that
  makes it — what was charged, by kind (membership, monthly dues, fines,
  adjustments), less what was received, by kind (payments, waivers) — so
  **Total charged − Total received = Payable now** on the page. When more has
  been paid than charged it says *In credit*. The programme month, reminders
  and the MOU are listed here, each with its button.
- **What is owed**: every charge with something left on it, oldest first by
  the day it fell due — payments always settle the oldest charge first, so the
  top line is what the next payment pays — with what was paid of it and what
  is left.
- **Statement**: every entry, newest first, with a charge or payment column
  and the balance after it. A voided entry stays listed, struck out of the
  figures. Open any line to see it or void it.

The **training place** sits below, on its own: it is covered by NGG and never
in the figures above. (Before 3 Nov 2026 the account showed *Charged* with the
training place inside it, and the figures did not add up.) The family's Fees
page reads payments the same way: a charge partly paid shows what was already
paid of it.

**The money report for a period** (Money → Dues & arrears → Transactions).
Pick *From* and *To*; above the list of entries is a **statement for the
period** for every account in your centres: *Owed at the open*, plus
*Charged*, less *Received*, less *Waived* (and any other credits), equals
*Owed at the close* — the sum is printed, so it can be checked on the page.
*Collected* is what was received as a share of what was due. *Month by month*
gives the same sum for each month (each opens where the last closed) and
downloads as a CSV for the treasurer. The figures are real money only — the
training place is never in them — and "owed" is net: a family paid ahead
offsets a debt elsewhere, so the per-family list is **Who owes**. *What* and
*State* narrow the list of entries but not the statement (fines on their own
have no opening balance); a member search narrows both, which gives one
family's year as a statement.

**What a payable is made of.** Wherever a figure owed is broken down — the
family's *To pay now*, the member's *To pay*, the *made of* column on Who owes —
the lines come from one place and add up to it: monthly commitment fees grouped
with their months named (a missed month is said: "February – April, June
2026"), membership, each fine with its reason, and, for a member who left before
the MOU was complete, the **training place** line. That line used to be missing,
so a family that left early saw a breakdown smaller than the amount asked for.

**On their phones.** A member's Money screen and the family's Fees page read
the same account. The member's card for the training place says where they
are: *Earning off · N%*, *MOU complete* with its date, or *Owed* if they left
before completing. Each month on the family statement closes on *Owed at
month end*, and the latest agrees with *To pay now*. Both call monthly dues
the **commitment fee**.

The family pays through the link (Paystack), or by bank transfer or cash.

**Money that arrived and could not be applied.** When a family pays an invoice
that was replaced or cancelled while their payment page was open, or pays an
amount that does not match, the money is listed at the top of **Money →
Membership payments** until somebody decides it: **Apply to account** (posted as
a payment, so their balance goes down), **Refunded** (refund it in Paystack
first, then record the refund reference) or **Dismiss** (with a reason). Each
decision is recorded with the name of who made it.

**Paying the balance online.** After joining, a member's account (their
dashboard) and the family portal show **Pay ₦… online** whenever there is
something to pay and Paystack is connected. Pressing it makes a **balance
invoice** (`NGG-BAL-…`) for exactly what is payable that day and opens the same
payment page as the joining invoice. Paystack's own confirmation settles it: one
payment goes on the ledger (the dues and fines were already there), and the
receipt is emailed. If the balance changes before they pay, the old balance
invoice is cancelled as *superseded* and the next press makes a new one for the
new figure. A transfer waiting to be verified blocks online payment until it is
checked, so nobody pays twice. Policy fines on the conduct ledger are not
included yet; dues, training fees and fines posted to the fees ledger are.

**Paystack's charge is paid by the family (from 3 Nov 2026).** Paying online,
the family pays what is owed **plus Paystack's charge**, worked out so that
after Paystack takes its cut NGG receives the whole amount. The figure is shown
before anybody presses Pay — on the pay page ("₦7,000 plus Paystack's ₦209
charge"), on the family app's **Pay ₦7,209 online** button and pay sheet, and
on the member's own account — with the free way beside it: **a bank transfer to
NGG has no charge**. The account records only the ₦7,000; the charge is
Paystack's, not something owed to NGG. The receipt lists it as *Paystack
charge* and its total is what left the family's account.

The terms live under **Money → Dues & arrears → Amounts → Paying online**:
the switch (off = NGG absorbs the charge), the percentage (1.5%), the flat
charge (₦100), the payment size under which the flat charge is waived (₦2,500)
and the cap (₦2,000) — Paystack's local card terms. If your Paystack plan
differs, change them there. A checkout started before a change keeps the
charge it was started with. Donations are unchanged: a donor gives what they
choose.

**Money → Membership payments** lists every invoice, joining and balance:

- **Resend link** — only while unpaid and with no offline payment waiting.
- **Record offline payment** — for a transfer, deposit, POS or cash payment.
  It needs the **exact invoice total**, who paid, the bank, the **reference**
  (for cash: the number on the receipt you wrote), the date paid, and the
  **evidence** — a photo or PDF of the slip, receipt or bank alert. It is held
  as a claim; nothing is paid yet and the family is **not** sent the link
  again.
- **Verify** — a **different** member of staff with `fees` opens the
  evidence, then types the **reference and amount from the bank statement or
  cash book** (not from the record) and confirms the money arrived. Only then
  is the invoice paid: the charges and the payment go on the member's ledger,
  a numbered receipt (`NGG-RCT-2026-00001`) is issued, and the family is
  emailed a thank-you with the receipt.
- **Reject** — with a reason; the invoice stays open.

What the server refuses, whoever asks: a different amount; a future date, or
one before the invoice; a reference already used anywhere (spacing and case
do not matter); an evidence file already used, even on a rejected claim; the
recorder verifying their own entry; anybody recording or verifying a payment
on their own account; a second claim while one is pending; a mismatched
reference or amount at verification. Every step is in the audit log.

Bank details printed on the invoice are set from the **Bank** button on the
same screen (a 10-digit account number).

### Volunteer pay

**Control Room → Money → Volunteer pay** (the Fees capability). An active NGG
volunteer earns a fixed amount for each programme day they are present **and**
active. Everything below is set on that tab.

- **Amount per day** — what one day earns. Changing it never changes a day
  already decided: each day keeps the amount of its own day.
- **Counting from** — no day before this date is ever paid. Left empty, it is
  the day pay is switched on, so switching on does not pay the whole history.
- **Which days count** — programme days only (the volunteer's Club or Summer
  School calendar), or any day they check in.
- **Being active** — present is not enough when "Require activity" is on: at
  least one chosen activity must be recorded that day: checked out at the end,
  completed the attendance duty, earned volunteer points, or led a class session.
- **When a day is excluded** — later than N minutes, past the red line, a half
  day, no check-out, safeguarding not cleared. An excluded day is kept with its
  reason, and the volunteer sees it.

**Reading a pay period.** Each period is a settlement that has to close:
*Earned*, less what was *paid to volunteers*, less what was *kept for NGG
fines*, less what was *held for Afrovanguard's fines*, is *Still to pay*. The
sum is printed beside the figure, so "₦40,000 earned, ₦6,000 to pay" is
explained on the page. The list's *NGG fines owed* column is what each
volunteer owes NGG now; what pay will take is worked out when it is paid.

### Donations

**Money → Donations** (the Settings capability). Every figure is counted over
every gift: *Raised* (and by channel), *Gifts* and *donors* (one donor giving
twice is one donor), *Largest gift*, and *Not completed*. A checkout that
Paystack has not confirmed is *Pending* for 48 hours and *Abandoned* after
that: nobody paid, and it is not money on its way. *By month* is what was
raised in each month (CSV for the treasurer). The list shows the newest 500;
**Export CSV** has every gift.
- **Pay period** — weekly, every two weeks or monthly, and the most days paid in
  one period (0 = no limit; days over it are kept as excluded).

A day is decided once it is over, by the hourly job or "Decide finished days
now". Open a volunteer to see their days: exclude an earned day, or restore an
excluded one, with the reason (never once paid). A period can be paid once it
has ended: pay the volunteers outside the system first, then "Pay this period"
records it with how and the reference (a bank transfer needs its reference). A
payout recorded by mistake can be voided from the volunteer's wallet; its days
are owed again. A volunteer who is also an NGG member sees their own pay on
**Me** in the app.

A volunteer who is also an Afrovanguard member sees the same pay on their
Afrovanguard **Wallet**, beside (never inside) what they owe Afrovanguard.
Afrovanguard asks NGG for it at `api/hooks/afrovanguard-pay.php`, signed with
the secret the two sites already share (`afrovanguard.ngv_webhook_secret` here,
`NGG_WEBHOOK_SECRET` there), and matches the volunteer by email.

**Who is paid.** NGG volunteers only — those serving the Club (`ngg`) or both.
A Summer School volunteer, and any volunteer record with no programme set,
earns nothing here and gets no pay card on Afrovanguard.

**Fines come off the pay** (on by default; "Take fines off pay" under Fines).
When a period is paid, each volunteer's fines come off first, down to ₦0, and
whatever is left of a fine stays owed for the next payment:

1. NGG's own fines on the member record they also have. Settled on their
   ledger as a payment, method `volunteer_pay`, with the payout as reference.
2. Then Afrovanguard's fines (NGV and Vanguard Quest), matched by email.
   NGG now holds that money for Afrovanguard: the tab shows the running total
   as **Fines held for Afrovanguard** — hand it over. If Afrovanguard cannot be
   reached, its fines are left owed there and the run says so; nobody is
   charged twice.

Pay each volunteer the amount on their line **after** fines. Voiding a payout
puts both kinds of fine back; if Afrovanguard cannot be reached the void is
refused and nothing changes — try again.

**Bank details.** A volunteer adds where they are paid on **Me** in the app or
on their Afrovanguard Wallet; the desk can add them from the volunteer's wallet
("Add bank details"). Account numbers are 10 digits. The volunteer is emailed
and told in the app about **every** change, whoever made it, and the pay table
marks a change in the last two days ("changed recently") — check before paying
into it. A transfer to somebody with no bank details on record is recorded, and
the run says how many had none.

**What the volunteer is told.** When they are paid: the amount, the days, what
fines were taken off and where it went (email and app). When a day is not paid:
in the app, one notice per pay period that updates as days are added. When the
desk excludes or restores a day, when a payout is voided, and when their bank
details change.

### Promoting into the Club

The **promotable** list is the Summer School participants who look ready:
searchable, paged, with an attendance figure alongside each. A **no contact**
flag marks rows with no reachable guardian — promote those with your eyes
open.

Select and **Promote into the Club**, up to **200** at a time. Promoting in
bulk runs exactly the same promotion as promoting one person, so the two
cannot drift apart.

**Every promotion asks which NGG centre** — never a Summer School venue. The
nearest NGG centre is suggested and chosen for you:

- measured from the **home address** on their registration when there is one.
  Addresses are read the way people in Lagos write them: if the street is not
  on the map, the landmark it is near ("near Ikotun bus stop") or its area is
  used, and the form says so;
- otherwise from **where their Summer School met**;
- with a **Google Maps** key (Settings → API keys), the closest few are ordered
  by **driving time**, not straight-line distance. Without one, OpenStreetMap
  finds the places, free.

If nothing can be placed on a map and there is more than one NGG centre, the
promotion is not guessed: choose the centre. Mapping each centre (its **Map**
button) makes the suggestions exact.

### The Club roster

Search, filter by participation status and centre, sort, page. Statuses are
**Active**, **Graduated · NGG** and **Inactive**.

Bulk actions on the Club roster are deliberately narrower than the member
desk: **set participation** and **post to centre**, up to **500** rows. The
Club roster is not where member lifecycle is administered.

### The curriculum

**Control Room → Content → Curriculum.** Needs the `curriculum` permission
(held by super admins, admins and Club admins; grant it to anyone else per
person). Club staff with `club` can read the lessons but not change them; `audit` can also read the progress report.

The curriculum is **NGG Club only**. Summer School does not use it.

**Importing lessons** (new Control Room: **Learning → Curriculum → Import
lessons**). Choose a **bundled course** (one that ships with the site) or a
**file** (CSV, Excel .xlsx or JSON; **Download template** gives the columns).
Pressing **Check the lessons** writes nothing: it lists every row as new,
updated, unchanged or refused, with the reason. **Import N lessons** then
writes exactly the rows that were checked. If the file changed in between,
you are asked to check it again. Running the same course or file a second
time reports every lesson as unchanged. Tick lessons to **Publish**,
**Unpublish**, **Retire** or **Delete** them. A lesson somebody has started
is retired rather than deleted.

If an import or a save is refused with "the host's firewall refused this
request", the hosting company's mod_security is blocking it before it reaches
the site. Ask them to allow POSTs to `/api/admin/`.

**Courses** (the *Courses* tab, needs `curriculum` to change) is the NGG
Club's own course list, by faculty: what the NGG join form offers, what lessons
are filed under, and what the timetable can schedule. It started as a copy of
Summer School's academy catalogue and is separate from it — a Summer
coordinator tidying the season's offer no longer takes courses off the Club. A
course that still has lessons or timetable classes keeps working if you take it
off the list, and the tab names it. *Copy Summer's catalogue* replaces the
Club's list with Summer's current one, if you ever want them equal again.

**A lesson** belongs to a **course** from the Club's course list (Piano, Coding,
…) or to *the whole Club* (leave the course blank), and sits at a **week** and a
**position in that week**. Two lessons cannot share a slot. Each lesson has a
summary, what they'll learn, the lesson text, **materials** and **checks**.

The lesson text has a **formatting toolbar**: headings, bold, italic, bullet
and numbered lists, a callout, code, a divider, links (**Ctrl+K**; also
Ctrl+B and Ctrl+I), an **image** you upload, and a **video** — paste a
YouTube or Vimeo link and it plays inside the lesson. **Preview** shows it as
a learner will see it. Only https links (and files uploaded here) are kept as
links; anything else stays plain text. The downloadable curriculum document
carries the same formatting.

- **Materials** are links (https only) or files uploaded to this server: PDF,
  slides, documents, sheets, images, audio or video, up to **25 MB** each.
  Uploaded files open only for people who are signed in. A PDF, image,
  audio, video or YouTube/Vimeo material **opens inside the lesson** — the
  learner does not leave the platform — with *Open ↗* for a new tab.
- **Checks** are *multiple choice* (marked on the spot) or open: *written
  answer*, *essay*, *reflection*, *project write-up*, *code* or *practical
  task*. Open answers are marked by AI **only on a capable model** (set the
  `marking` AI profile — small, fast models such as Haiku, Flash or Mini are
  refused), each kind against its own guidance and your rubric: an essay on
  its argument, a reflection on honesty and detail and never on its opinion,
  code on whether it works. An answer the AI is unsure about waits for the
  instructor, and a reflection that may describe harm is never marked — it is
  held and flagged for the instructor as a safeguarding matter. Give a
  written check a **model answer** and a **rubric** — both are shown to the
  marker, never to the member.
- **Pass mark** (default 60%) decides when a lesson counts as **Done**.
- **✦ Draft with AI** writes a draft lesson and checks from the title. Nothing
  is saved until you press Save, and AI-written checks are labelled as such.

**Materials from instructors.** NGG instructors and mentors can add a
material to any lesson in **their own courses** from the Curriculum tab of
their portal — a link (a video, a Scratch or Replit project, a PDF) or a file:
PDF, slides, documents, sheets, e-books, images, audio, video, Scratch and
code files, zip packs, up to 25 MB. It **waits for approval**: members do not
see it, and it is not in the lesson editor's list, until somebody with the
`curriculum` permission approves it under **Curriculum → Submissions** (one
at a time or in bulk). Sending one back needs a reason, which the instructor
gets by email and in their portal. Somebody who already holds `curriculum`
adds materials straight in.

**Statuses:** *Draft* (only staff see it), *Published* (members see it) and
*Retired* (hidden, but the progress it holds is kept). A lesson somebody has
started cannot be deleted — retire it. Changing the checks after somebody has
answered bumps the lesson's **version**, so old results stay readable as what
they were.

**Import** takes a CSV (download the template on the Import tab): `course,
week, position, title, summary, objectives, body, materials, check1,
check1_options, check1_answer, check1_rubric, check2…`. Options are separated
with `|`; an answer may be the option's letter, number or text. **Check the
file** first — every row is reported as *new*, *update*, *unchanged* or
*refused* (with the reason, e.g. "did you mean Piano?" for a misspelt course)
and nothing is written. **Import** then writes exactly what was checked; if
the file changed in between, it is refused and you check again. Up to
**1,000** rows per file.

**Courses that come with the platform** are listed on the same Import tab.
**Practical Coding — Full Stack Web Developer (2026)** is the first: 72 lessons
over 24 weeks, three a week (one per class day — Tue/Wed/Thu), filed under
*Practical Coding*, level *Full Stack Web Developer 2026*. **Load to check**
puts it through the normal check; nothing is written until you press
**Import**, and it arrives as drafts unless you tick *Publish*. Loading it
again later updates only the lessons that changed. It has no dates of its
own: set the **term start** under Progress → Deadlines and every lesson's due
date follows from its week.

It is the coordinators' freeCodeCamp-based sheet, corrected: the "weeks" in
the sheet were really sessions (three to a week), and the dates were 2025's.
Git and GitHub, going live on GitHub Pages by week 4, mobile-first responsive
design and the box model all come before layout; the three scattered
positioning lessons are one; no lesson is more than about 65 freeCodeCamp
steps (the sheet had 104 and 115); the back end is four required weeks with
security and deployment, not five optional sessions; there are catch-up weeks
after each phase, a project at the end of each, a full-stack capstone, and a
check on every lesson. A readable copy is `docs/curriculum/practical-coding-2026.csv`.

**Media Lab — Digital Creative Learning (2026)** is the second: 48 lessons over
24 weeks, two a week (*learn & practise*, then *create & review*), level
*Media Lab 2026*. Month by month: foundation and digital safety, graphic design,
photography and writing, video, social media and marketing, then leadership and
portfolio. Each month ends in a team challenge marked on the programme's rubric
(technical skill 30%, creativity 20%, completion 20%, teamwork 15%, leadership
15%) and a reflection. It is filed under its own course, **Media Lab**, because
it spans design, photography, video and social media and is not one of
*Graphics Design* or *Video Editing*. That course is not in the academy
catalogue, so loading it ticks *Allow courses not in the academy catalogue* for
you. Once imported, *Media Lab* can be put on the timetable. Consent and the
13+ age rules of Canva and CapCut are taught in week 1, before anybody
photographs a person. A readable copy is `docs/curriculum/media-lab-2026.csv`.

**Progress** shows, per lesson, how many members of that course have started
and finished it, and the average score. A scoped admin sees their centres only.

**Deadlines, reminders and fines** (top of the Progress tab). Set the **term
start**. A lesson with checks in week N is then due N weeks after the term
starts — or after the member joined, if that is later, so a new member never
owes past weeks on day one. While an assessment is outstanding (not completed,
and not waiting for an instructor to mark it):

- the member and the parent on their record get **one email** listing what is
  due, from *Remind from* days before it is due and every *Remind every* days
  after;
- once it is more than *Fine after* days overdue (a week by default) the
  member is **fined once** for that lesson, on their account;
- **Behind** lists the members with overdue assessments, the longest overdue
  first, with what they have been fined.

Changing the fine amount or window needs the **Dues & fees** permission as
well as Curriculum. Members see each lesson's due date, and how many days
overdue it is, on their Curriculum page.

**Members** find their lessons on their dashboard under **Curriculum**, by
week. **Instructors and NGG mentors** see the lessons for their courses in the
Mentor Portal's **Curriculum** tab, with the written answers waiting to be
marked beside the model answer and rubric.

### Where a member's courses come from

**Control Room → Learning → Curriculum → Schedule.** Needs `curriculum`.

Two modes, and the setting decides which is live:

| Mode | A member's lessons are… |
|---|---|
| **By member** (default) | The courses chosen for them. If none are chosen, their track and the interests on their card are matched to course names; failing that, every course in their division. |
| **By division** | Their **division's own shared curriculum** — the spine every course in that division has in common — and nothing from the individual strands. Club-wide lessons and Chess still reach everyone. |

**Why the division mode exists.** The fallback in the first mode was doing a
bad impression of it: a member with no courses on record was handed *all seven*
of Technology's strands at once, so their week showed Automation, Coding,
Cybersecurity and more, side by side. That is a wall, not a curriculum. A
division has one spine; the division mode delivers that.

**Before you turn it on, read the coverage board** (same screen). The spine
that ships covers **Year 1 only**, so a member placed in Year 2 or 3 would open
their portal and find nothing. The board shows every division against every
year, and counts exactly how many members a gap would strand — if that number
is not zero, write the missing year's curriculum first, or leave the setting
on *By member*.

### What members say about a session (testimonials)

At the end of every lesson a member is asked one question — *what did today
give you?* — in one or two lines, in their own words. It is never required:
skipping it is not recorded, and nothing in the lesson, the review or their
progress depends on having written one.

**Control Room → Inbox → Testimonials.** Needs `content`. Each one shows the
words, which member wrote them, and **how they would be signed** if published:
their initials and age, their first name and age, or not named at all. The
member chooses that themselves, in the box; a full name is not on the list.

**Publishing needs the guardian's consent**, read from the same consent ledger
that decides whether a child may be named anywhere else on the public site
("Feature on our website"). Without it there is **no Publish button** — not a
button that refuses — and the queue says why. Record the consent on the member
first, then come back. You can always read the words; they are useful whether
or not they ever go anywhere.

Three things follow from that, and they are the point of the feature:

- **Withdrawing the consent takes the words off the site**, on the next page
  load, with nobody having to remember to unpublish anything.
- **The member can take it back at any time** by clearing the box on the
  lesson — published or not.
- **Editing it un-publishes it.** The site shows words somebody approved, and
  an edited line is not those words any more, so it comes back to this queue.

Published ones appear on the public home page. If none are published, that
section of the home page is not shown at all — it is never filled with
examples.

### Where members actually do the lessons: the Learn app (/learn)

Members open **Learn** from their portal, or go straight to `/learn`. It is its
own app, the way the Anchor Journal and the Study tools are — not a panel
inside the dashboard.

| Address | What it is |
|---|---|
| `/learn` | **This week** — what to do now: anything late first, then the next lesson, then anything half-done |
| `/learn/courses` | **My courses** — the shelf, with how far through each one they are |
| `/learn/course/<course>` | One course, week by week |
| `/learn/lesson/<lesson>` | **A lesson, full screen** |
| `/learn/plan` | **School** — their own school subjects and this week's practice |
| `/learn/plan/<subject>` | One subject's drill |
| `/learn/review` | How the review works, and what they will be asked about |
| `/learn/helper` | The study helper |
| `/learn/notes` | **Notes** — the lessons they saved for later, and every note they wrote |

**Every one of those is a real address.** A lesson can be bookmarked, sent to a
mentor, or opened from a message, and the browser's Back button goes back. It
could not be any of those things before, because a lesson was an overlay on
the dashboard with no address of its own.

A **course** page ends with *Where this leads* — the recognised credentials
that course prepares them for, and a button to say they are going for one.
What they hold shows on **This week**, wherever it came from.

A lesson page carries, in this order: last session's review (which can always
be skipped — being away is not a reason to be shut out of this week), what
they'll learn, the lesson itself with **Read it to me** and a speed control,
next session's questions, and *How did that go?* at the end.

**How the week-later review works (and what counts).** Each lesson's questions
are asked again at the start of the member's next lesson **in the same
course**, from memory. Three rules decide it:

- *Last week's lesson* means the previous lesson in that course — not
  whatever lesson sits before it in the member's list. (It used to mean the
  latter, so anybody taking two courses was almost never asked.)
- **Passing on the lesson day does not count as remembering.** A member may
  answer the questions straight after reading the lesson, and passing still
  completes it — but they are asked again at the next session. Only an answer
  given **two or more days** after they opened the lesson is recorded as
  recall (`reviewedAt`), and once it is, they are not asked twice. A review is
  never offered in the same sitting as the lesson it reviews.
- **A wrong answer is marked, not given away.** After a try the member sees
  which questions they got wrong; the right answers appear once they pass, or
  after **3** tries. Before this, the answers appeared after the first try
  beside *Submit again*, so every second attempt passed and a lesson's score
  meant nothing.

`/learn/review` lists both kinds of waiting: lessons not finished, and lessons
*passed on the day — still to remember*.

Around the lesson, so somebody coming back has somewhere to start:

- **Pick up where you left off.** *This week* leads with the last lesson they
  opened and have not finished, and three figures: weeks in a row with a lesson
  finished, how many this week, and the time their finished lessons add up to.
  The figures are worked out from their completions, never stored, so they
  cannot disagree with the progress you see in the Control Room.
- **Save for later** and **My notes** on every lesson. Notes are private to the
  member: no staff screen, report or AI reads them. Both collect under *Notes*.
- **Mark as done** on a lesson that has no questions, which before had no way
  to be finished at all.
- **Previous / Next** at the foot of a lesson, and *Lesson 2 of 8* at the top.
- **Find a lesson** on *My courses*, across every course they are on.
- **Go deeper.** A short read on the lesson's topic, fetched from Simple
  English Wikipedia (English Wikipedia if it has nothing), shown with its
  source and licence and only when the article's title shares a real word with
  the lesson — then a short list of free, reputable places to learn more,
  chosen by hand for each course (Khan Academy, OpenStax, CS50, MDN, Lichess,
  musictheory.net, the WHO and the like: no ads in front of the first lesson,
  nothing a child pays for). They open in a new tab. Reads are cached for a
  month; if Wikipedia is down or busy, the read is simply left out and the list
  still shows. To change the list for a course, a developer edits
  `LEARN_SOURCES` in `api/_lib/domain/learn.php`.

### Where courses lead: the awarding bodies outside NGG

Our curriculum has always pointed somewhere. Practical Coding leads to
freeCodeCamp; Stage & Studio Trades to Trinity Drama and the NBTE National
Skills Qualification; Tech Foundations to Cisco NetAcad and Google; music to
Trinity and ABRSM. Until now all of that lived in lesson text and links, which
meant two things went wrong at once: **a child finished twenty-four weeks of
work and nothing told them there was a recognised certificate at the end of
it**, and when a funder asked how many of our members hold an external
credential, we had no answer.

**Control Room → Learning → Where courses lead** is the registry and the
roll-up. Three things, kept separate because they are separate:

| | What it is |
|---|---|
| **An awarding body** | The organisation — freeCodeCamp, Trinity College London, NBTE. Its country, its website, whether it is free. |
| **An award** | The thing a member can actually hold — "Responsive Web Design", "Graded Examination in Music · Grade 3". Each names **which of our courses lead to it**, and how long it stays valid. |
| **A credential** | One member against one award. |

A member is in one of four states against an award: **working towards it**,
**entered for it**, **holds it**, or **sat it, not yet passed**. An award with
a validity period also reads as **expired** once its date passes — that is
worked out from the date each time it is read, so it can never be out of date.

#### Who records what

- **The member** can only ever say *"I'm going for this"*, on their course page
  in the Learn app. That is their aim, and they can take it back.
- **The centre** records a result (`curriculum`). A child cannot claim they
  hold a certificate; the programme records it. Once a result is recorded, the
  member can no longer change that row.
- Recording **"holds it" needs the date it was awarded.** The refusal is
  deliberate: every count on every screen is built on that date, and a
  credential without one is a claim rather than a record.

#### Setting it up

**Start with the button, not a blank screen.** *Add the bodies our curriculum
points at* fills the registry from our own lesson links — freeCodeCamp, Cisco
NetAcad, Elements of AI, Google, NBTE, Trinity College London and ABRSM, each
already attached to the courses that point at it. Four of those routes are
**free**. Nothing is guessed: every line comes from a material link one of our
lessons already carries, which is the same thing we have been telling learners
to go and do.

It is safe to press again at any time. It only ever adds what is missing and
never touches an entry you have edited.

Then:

1. Check each body and add anything the list missed.
2. Add what it awards. **Attach the courses that lead to it** — this is the
   step that makes the route appear for members; an award with no course
   attached is in the registry but reaches nobody.
3. **Fees, grade names and exam dates are left blank on purpose.** They change
   every year and differ by country, and a stale price in front of a family is
   worse than no price. Put this year's in the award's cost note.

#### Things that will refuse, and why

- **"A body members hold awards from is not deleted silently."** Retire it
  instead. Retiring keeps every record resolving — somebody's certificate does
  not stop being theirs because we stopped offering the route — and simply
  stops anything new being added against it.
- **"That award is not awarded by that body."** Refused rather than quietly
  re-pointed, so a mis-click cannot move somebody's credential to the wrong
  organisation.
- **Recording the same award twice** corrects the first record. It never
  creates a second credential — Grade 1 and Grade 2 are different awards, so a
  ladder still works normally.

### School: practising for their own exams (/learn/plan)

NGG teaches a curriculum, but a child's school results are what decides their
next five years. **School** is where they practise for those, inside the same
app, on the plan their own results already produced.

**It is not a new plan.** It is the growth plan a coordinator agreed with them
after their last report card (People → a member → Results): the subjects, where
they are now, where they are going, and how many sessions a week they
committed to. School is that plan with the practice attached, so the sessions
a child promised can actually be done rather than only counted.

A subject's page gives them five questions. They answer, and the screen marks
them with the working shown — **why**, not just a tick. Three things then
happen at once, which is the whole point of it being here rather than in a
separate tool:

1. **The week's counter moves.** It is the plan's own counter, the same one the
   coordinator sees at the next check-in. Practice done is practice recorded.
2. **What they got wrong becomes flashcards**, in a deck called
   `School · <subject>`, which the spaced repetition in Study tools then brings
   back on the day they are about to forget it.
3. **The next set moves with them.** Five levels; 80% or better moves up, under
   40% moves down. A child who is struggling is not handed the same paper
   again, and one who is flying is not held at the bottom.

Eight drills a day, at most — after that it says so and sends them away. The
limit is deliberate: this is practice, not a way to spend an evening.

**Where the questions come from**, in order:

1. **A past-questions bank**, if the deployment has one configured
   (`study_bank` in `api/config.php`). Real WAEC, NECO and UTME past questions
   beat anything generated — the wording and the difficulty are the ones the
   child will actually meet.
2. **The AI layer**, asked for questions at that child's level, in Nigerian
   contexts and naira, and required to explain the working.
3. **Neither** → it says so plainly and points them at their flashcards and
   their instructor. It never hands a child a blank paper, and it never
   invents a question it could not explain.

If members report "Nobody can write you questions right now", the deployment
has no question source — see **Settings → AI** and the `study_bank` block in
`api/config.example.php`.

### Study tools (/study)

Members open **Learn → Study tools** in their portal (or go to `/study`). It is
their own kit, and nothing in it is seen by staff. Five tabs, with similar
tools together and handing work to each other:

- **Today** — the focus timer (25-minute blocks with breaks, or 15, 45, 50),
  beside the week: focus minutes by day, the study streak, cards due and the
  best typing speed.
- **Revise** — **Flashcards** with spaced repetition (a card they know comes
  back after a day, then six, then weeks; one they miss comes back the same
  day; typed, pasted "front — back", or written by the study helper from a
  lesson); **Quiz me** (five multiple-choice questions on one of their lessons,
  and the ones they miss become flashcards with one press); **Summarise notes**
  (their own class notes summarised, with key terms that become flashcards).
- **Maths** — a scientific **calculator** (a sum with x in it is one press from
  its graph), a **graph plotter** with a table of values, and **number bases**.
- **Words** — a **dictionary** (any word looked up can be added to a "My words"
  deck) and **typing practice**.
- **Course labs** — one per division, the member's own first:
  Tech (a code playground for HTML, CSS and JavaScript, and a password-strength
  checker), Creative (metronome with tap tempo; piano with scales and chords),
  Media (colour contrast to the accessibility standard; palette maker),
  Business (break-even and profit, budget planner, savings and interest).

The study helper (flashcards from a lesson, quizzes, note summaries) uses the
same daily allowance as the helper on a lesson page, and refuses to summarise
notes that talk about being hurt — it points to people instead. Without an
account, Today's timer, Maths, Words and the labs still work. Limits: 40 decks,
500 cards a deck. Old addresses (`/study/cards`, `/study/calc` …) forward to
the tab that holds them now.

The code playground runs a member's code in `assets/sandbox/code-sandbox.html`,
which `.htaccess` serves with its own policy: no network, and a sandbox that
cannot read the site's cookies, storage or pages. Keep that `<Files>` block
when editing `.htaccess`, or the playground's scripts will not run.

### Three years, by mastery

NGG runs for three years, so a lesson's **level** carries its year: `Year 1 ·
Foundation`, `Year 2 · Developing`, `Year 3 · Advanced` (any level that says
"Year 2", "Yr 2" or "Level 2" counts). A lesson whose level names no year is
for everyone, as before.

- A member starts at **Year 1**. Finishing **80%** of a year's lessons in a
  course opens that course's next year. A quick learner moves on early, and
  one who needs longer is not pushed on with gaps.
- Unfinished lessons from a year they have moved past stay on their list,
  marked **catch-up**.
- Staff can **place** a member in a year, for example an experienced pianist
  starting at Year 2: `action=year` on the curriculum route, with the
  `curriculum` permission in the Control Room, or as their instructor in the
  portal. A member cannot place themselves.
- **Deadlines and fines** follow the term for the year a member is *placed*
  in. Catch-up work, and a year opened early by progress, never falls due.

The bundled **Music — Piano and Guitar** course is built this way: 24 lessons
per year per instrument. Every lesson has an *Essentials* strand (theory,
reading, ear, instrument care, practice habits, performance, Nigerian music
history, technology and business), plus *If this is new to you* and *If you
already can* work. A JSON file that says `"allowNewCourse": true` (as the
bundled files do) imports without switching the setting on by hand.

**Export PDF** (Learning → Curriculum) opens one course, or one year of
it, as a print-ready page. Press **Save as PDF** there, or **Download as
Word**. The *Instructor* edition includes the answers and marking guides. The
*Members* edition, and the copy members download from their own portal, has
no answers and no weekly assignments, because assignments are set and dated
on the assignments desk.

### The NGG Learning Path: Year → Term → Week

Every course is arranged the same way. There are three programme **years**,
each of two **terms** of twelve Saturdays. A lesson is coded `Y1·T2·W3`
(Year 1, Term 2, week 3 of that term). The lesson list sorts and filters by
these codes, members see them on Learn, and the PDF export groups lessons
under them.

- The **year** comes from the level ("Year 2 · Developing").
- The **term** comes from the level ("Term 2", or "Module 3", where two
  modules make a year), or else from the week: weeks 13–24 are Term 2.
- A term takes its **name** from the level when the level gives one
  ("Year 1 · Module 2: Spreadsheets, Finance…").

To keep a new course in line, write its levels as `Year N · Term T: Name`.
Use weeks 1–24 within each year.

### Which courses have lessons, and building one that has none

**Learning → Curriculum** opens with three figures (courses with lessons,
courses with none, members with no lessons) and a **Courses** table: every
course in the catalogue, whether it has lessons, drafts only, or nothing, how
many lessons are published and for which years and weeks, how many set
homework, and how many members take it. Courses with members and no lessons
come first, because those members open Learn to an empty list.

**Build a course outline** drafts a term for one course: choose the course,
the year and level (say the year, so members see their own year's lessons),
how many weeks (4 to 24), and the week to start at. It follows NGG's term
shape: welcome and first win, fundamentals, a mini project, a feedback round, a
new technique, a real-world brief, a capstone and a showcase. With AI set up
the titles are written for the course; without it you get the standard
outline named for the course. The outline goes through the same check as an
import and arrives as **drafts nobody sees**, never on top of a lesson already
in that slot. Open each draft, use **Write the lesson** to write it from its
title, read it, and publish.

### AI in the curriculum

- In the lesson editor, give a lesson only a title and press **✦ Write the
  lesson with AI**. The AI writes the whole lesson in the NGG Saturday
  standard, with demonstration, guided practice, independent assignment,
  feedback, success criteria, AI used well, and support and stretch work. If
  you have written notes, the AI drafts the summary, objectives and checks
  instead, and never rewrites your notes. Read every draft before saving.
- Members have a **Study helper** on Learn. They choose a lesson and ask a
  question; it explains, gives an example and asks them a question back. It
  never does their assignment. It allows 20 questions a day, and needs an AI
  provider under Settings → API keys.

### Assignments

**Learning → Assignments** in the Control Room, and **Progress →
Assignments** in the instructor portal. It is the same desk in both places.

**Lessons set their own homework.** A published lesson with a "This week's
assignment" section sets that assignment by itself when its week of the term
begins: published to the lesson's course and **year**, at every centre, due
when the lesson is due, with the lesson's success criteria as steps, and the
members it is for are told. It happens once per lesson. A lesson that already
has an assignment (one you set by hand) is left alone. On the desk these rows
say **Set by the lesson**; edit, close or delete them like any other. The bar
at the top of the desk says it is on and which week of the term it is; an
admin in the Control Room can **Turn off** (and back on, which sets this
week's straight away). It needs the term's start date (Curriculum → schedule).

Homework from a lesson reaches the year that lesson is for: a Year 2 lesson's
homework is not set for Year 1 members.

- **New assignment**: choose the course (an admin can also choose the whole
  Club), optionally the centre, and optionally a lesson. **Draft from the
  lesson** fills in the lesson's own weekly assignment, its objectives and its
  marking guide. **Write it with AI** appears only when an AI model is set up
  for marking. Before you publish, the editor shows how many members it
  reaches and names a few of them. Leave the due date blank and it is due
  next Saturday.
- **How it is handed in**: *Writing*, *A document or file*, *A photo*
  (members can take it with the camera), *A recording* (members can record
  audio or video in the portal, or upload one), *A link* (recognised as a
  Google Doc, Sheet, Slides or Form, Canva, GitHub, YouTube, Trello and
  others; members are reminded to share Google links as *Anyone with the link
  · Viewer*), *A checklist*, or *Anything that shows it*. Up to five files.
  **Draft from the lesson** suggests the type: a Sheets lesson asks for a
  link, a piano lesson for a recording.
- **Success criteria**: one per line. Members tick every one before they can
  hand in, and the marker sees which were ticked.
- **Hand-ins** shows what came in, what is waiting to be marked, and who has
  not handed anything in. **Remind** notifies the people who have not handed
  in, at most once a day.
- **Mark** gives a mark out of the points and some feedback. **Return for
  changes** needs feedback, and the member can then hand it in again.
  **Suggest a mark** (with AI) only fills in the form; a person still saves
  the mark.
- **Bulk**: Publish, Move to draft, Close and Delete. Each asks first and
  reports each row's result. An assignment someone has handed in cannot be
  deleted, only closed.
- An instructor sets work for their own courses and centre. They can also
  mark an every-centre assignment for their course, but only their own
  centre's hand-ins. Whole-Club work is admin-only.

### How the training fee works (from 29 Oct 2026)

The training fee is the cost of a member's place: **₦300,000 for the three
years by default**, charged **once** when they start. It is not a bill. NGG
covers it while they serve, and it is earned off across the 18-month service
half, **by the days they actually serve**.

- **Each member keeps the terms they started on.** The basis, the amount and
  the two half lengths are fixed on their account at their first accrual.
  Changing the settings (or an uprate) only affects members who start after.
- **Charged per session, day or week instead?** Choose it under *Training fee
  is charged*. Changing it needs a new amount in the same save, because the
  amount means something different on each. Saving with the old figure is
  refused. Summer School is never charged as a training session.
- **Leaving.** A member made *inactive*, or evicted, stops earning the fee off
  that day. What service had not earned off then becomes **real money they
  owe**: it is in what they are asked for, in reminders and on their statement.
  A member who completed the MOU or graduated owes none of it.
- **Suspension is a pause.** No days are earned while suspended, and they are
  never credited back after it is lifted. A suspended member owes nothing for it.
- **The balance ceiling counts real money only** (membership, dues, fines). The
  training fee no longer stops dues being charged.
- Members charged per session before this change keep those charges. If they
  came to more than ₦300,000, the excess is taken back by a write-off marked
  "Training fee held to the fixed ₦300,000"; if less, the rest is charged.
- A deployment that never changed the old default (₦75,000 per session) now
  reads as the ₦300,000 total. A rate an admin actually chose is kept.

### Watching the training fee

**Dues & fees → Training fees** (needs `fees`; a centre-scoped admin sees their
own centres). One row per NGG member who carries a training fee or is in their
training months, and anybody who left still owing part of it (filter **owed**):
what has been **charged** (and how many sessions, days or weeks that is), how much service has **covered** (earned off, plus anything
written off at the MOU), what is **still to cover**, where they are in the
three years, and whether their service credit is **paused** (a suspension) or
**stopped** (an eviction). Filter by phase or by paused/stopped, sort by what
matters today, or search. Totals for what is shown sit above the table.

**Open →** shows that member's account with the same schedule the member sees
on their own dashboard — every charge, what has happened but waits for the
next accrual run, and what is still to come before charges end — in staff
words. The member's panel and this drawer are drawn by one component from one
server answer, so they cannot disagree. On a day or week rate, "still to come"
reaches as far as the meeting calendar is set.

### Telling families about dues — before, after, and when they say they paid

**Money → Dues & arrears → Reminders** (needs `fees`; a centre-scoped admin
sees and sends for their own centres). Three kinds of message reach a family,
and every one goes to **every linked guardian**, not one email address:

| Message | When | Where it goes |
|---|---|---|
| **Before it falls due** | *N* days before monthly dues (the 1st) or a membership renewal (the join anniversary) — 7 by default | the family app of each guardian, each guardian's email and the parent email on the record, Telegram where a guardian's phone is linked to the NGG bot, SMS (off by default; one per family, only when Telegram did not reach them), and the member's own portal |
| **Arrears reminder** | money already owed, no more often than every *N* days (at least 7) | the same channels |
| **Payment note received / answered** | the moment a parent sends *I've paid*, and when the desk approves or declines it | the family app and email; the answer says what is still to pay — or, when nothing is owed today, the next amount and date |

- **Each family hears once per due date.** December's dues and a renewal that
  fall on the same day are one notice with both lines and the total. The
  background job and the **Send today's … now** button share one log, so
  pressing it, or the job running every 15 minutes, never tells anyone twice.
- **Who is not told, and why** — a family paid ahead past the date (their
  credit is spent on the charges in date order), a family that asked not to be
  chased (*Stop reminders* on their account), and a family with no way to be
  reached (no linked guardian, no parent email, no phone). The **Coming up**
  table shows, for the next fortnight, each family, what falls due, the amount,
  the day they will be told (or *Told* with the date), and how many apps,
  emails and phones will reach them — *No way to reach them* is the list to fix
  in People → Members.
- **Sent to families** is the record: each notice, its amount, and the
  channels that actually delivered it. *Nobody reached* means every channel
  failed — usually no mail server and no linked guardian.
- **Payment notes waiting**: open *I've paid* notes. When one waits longer than
  the hours set (48 by default, 12 to 168), every staff member holding `fees`
  for that centre gets one nudge a day saying how many and how old the oldest
  is. The notes themselves are answered in **Inbox → Member requests**.

**Settings** — *Amounts → Before dues fall due*: the switch, how many days
before (1–30), each channel, and the desk nudge. Telegram and SMS are listed as
*not available on this site* until the bot or the SMS gateway is set up under
Settings. Notices start when dues are on; they need nothing else switched on.

### Conduct & fines — one home for fines

**Money → Conduct & fines** is where fines live, start to finish. It has five
views, and each person sees only those their permissions reach:

| View | Needs | What it holds |
|---|---|---|
| **Rules** | `fees`, `people` or `summer` | **Every rule in one place** — the rulebook's four (late, absence, permission, evidence) and every written rule — each as *trigger → consequence (fine and/or frog jumps) → what happens on repeat → cap* |
| **Fines** | `fees` | This term's fines at a glance, **Upload fines**, the **fine rules**, and the one-time clearance |
| **Compliance** | `people` or `summer` | Everybody with something on record, and each person's record |
| **Policy** | `summer` | The thresholds: absences allowed, lates, suspension, the fines the policy issues |
| **Calendars** | `summer` | Which days count — the Summer School days and the NGG member days |

#### The Rules page

One table, one row per rule, read the same way whoever wrote it:

- **When** — what breaks it (*arrives after 10:00*, *phone out in class*).
- **Costs** — the fine, the frog jumps, or both.
- **On repeat** — e.g. *every 3rd time in a term: a 7-day suspension and a
  ₦1,000 re-entry fee*, or *every 2nd time: referred for review*.
- **Cap** — the most it can cost in a term.
- **Broken** — how many times it has been recorded.

Who can change what: a written rule is added or edited by somebody holding
`fees` (**Add a rule**); the rulebook's four rows by somebody holding
`people`. A row you cannot change says so instead of offering a button.

**Recording a breach.** *Record a breach* (or **Members → select people →
Broke a rule…**, or a person's conduct drawer) records that a written rule
was broken, for up to 100 people at once, on today or a date in the last 90
days. The fine, the frog jumps and any escalation follow automatically, the
same way the rulebook's own do. Refused rows are named: not found, a staff
account, outside your centres, your own account, or already recorded for that
day. One audit entry per press.

**Announce the rules** writes an *Our rules* notice from the table and opens
it in the notice editor as a draft — read it, then send it like any notice.

Dues & arrears is about money owed and paid; it no longer has an upload.
Old links to *Dues & arrears → Upload fines* open Conduct & fines. In Summer
School, *Programme & policy* now points here too.

**Fine rules.** A table you can search and filter — one row per rule (Late attendance, Missed sessions,
Equipment, Conduct, and any written rule) with its **standard amount**, its **cap per member per
term**, how many fines it has governed this term, and **On/Off**. Open a row
to change it, or **Add a rule**. A rule that is **off** refuses fines of its
kind (from the desk, the policy or an upload); a **cap** posts only what is
left of it in the term. The standard amount is what a register's **tick** or
**count** costs (see the upload below). A cap smaller than the standard amount
is refused. Changes apply to fines posted from then on — a fine already on an
account keeps its amount — and every change is in the audit log. Rules are
switched off, never deleted, so a fine posted under one can always be explained.

**Brought over by upload** (Fines). Every fine, due and membership charge an
upload put on an account. A register's **Dues** column is now posted as dues
(and a **Membership** column as membership), beside the fines on the same
line — before 30 October 2026 a Dues column was read as the fine's amount, so
arrears could be sitting on accounts as fines, and with a Fines column beside
it one of the two was dropped. Fines whose own words say dues, monthly,
subscription or arrears are flagged (*Reads like: Dues*). Select them and
choose **These are dues** (or membership, or fines): each is voided with your
reason and posted again, the same amount on the same day, as the right kind.
What the family owes does not change; what it is called does.

**Compliance.** Totals (warned, dormant, suspended, evicted, policy fines owed)
and everybody with a consequence on record, worst first. Open a row for the
record: the **consequences** (a fine can be marked paid, a suspension served, a
dormancy cleared) and **what they are based on** — each logged absence, late
and ID-card entry. A wrong entry is **voided** with a reason; it stays on the
record, struck through, and everything it caused is lifted at once. The record
also logs *No ID card today*, *Lost ID card*, and for volunteers *Missed Review
Time*; an evicted person can be **reinstated** (a Governing Council override,
with its resolution, when the conditions are not met).

**The member rulebook.** Under Policy → *NGG members — the rulebook*, set as
the Management notice states it, every figure editable:

- **Lateness by arrival time.** Activities begin at the resumption time
  (09:00). From 09:30 to before 09:45: ₦500 fine and 3 frog jumps; from 09:45
  to before 10:00: 5 frog jumps; at or after 10:00: **management review** — it
  appears on Compliance as awaiting review, with no automatic penalty, and is
  closed with *Reviewed* on the record. Up to three bands.
- **Absence without permission:** ₦1,000 and 7 frog jumps. An absence with
  permission costs nothing; one still waiting for the desk is not charged
  until it is decided.
- **Suspension:** the third absence without permission in a session suspends
  for 7 days from the next day. When the week is over the child still cannot
  check in until the **₦5,000 re-entry fee** is paid or waived — a payment
  that covers it marks it paid by itself. Lifting the suspension lifts its
  fee.
- **Permission:** at most 5 absences with permission are accepted in a
  session — a request that would go over is refused when it is made, and the
  desk cannot approve past it either. An absence longer than 21 days is a
  formal written application, not a dashboard request.
- **Assignment evidence:** a member with nothing handed in by an
  assignment's due day owes ₦1,000, once per assignment — only for assignments
  due after the rule first ran.
- **Frog jumps** are listed on Compliance under *Frog jumps to do*, with who,
  how many and why; select and **Mark done** as they are done at the centre.
  They never block anybody.
- **A fine is money; frog jumps are on top of it.** A late, an absence or a
  broken rule usually costs both. Each set of frog jumps shows, in *Fine for
  it*, the fine charged for the same incident and whether it is owed, paid or
  waived. Ticking the jumps off clears the exercise only; the fine stays on the
  member's account (*Policy fines owed*) until it is paid or waived.

*Which rulebook* can be set back to the older ladder (warnings, Dormant Track,
eviction), whose settings are kept under *NGG members — the older ladder*.
The rules PDF and the family portal's rules box state whichever is running.

**Fresh start** (Compliance, top right). Choose the day of the announcement:
every offence recorded before it is revoked with your reason, and whatever it
caused — warnings, suspensions, reviews, frog jumps and unpaid policy fines —
is lifted, however late it was issued. The preview is exact (it is worked out
and then undone) and changes nothing. A fine already **paid stays paid**; an
**evicted** member is listed, not reinstated (use their record); fines
brought over by upload stay owed unless someone with the Fees permission
ticks *Also waive fines brought over by upload*. Dues are never touched. The
day and reason are shown on Compliance afterwards.

**When check-ins did not reach NGG.** Above the board, Compliance shows what
needs a person when the check-in feed fails:

- **Held days.** The nightly check no longer marks a whole centre absent when
  nothing arrived from it. A centre where nobody checked in (three or more
  people expected), or a day when fewer than one in ten checked in anywhere, is
  **held** instead, and nobody is marked absent. The same goes for
  **sign-outs**: a centre where people signed in and not one sign-out arrived
  (or a day when almost nobody's did) is held, rather than counting everybody
  an incomplete day. Open it and choose **Nobody is absent** (the centre did
  not meet, or the check-ins or sign-outs were lost — it is never counted
  later) or count it (the absences or incomplete days are logged now, under
  your name, and the usual warnings and fines follow; a sign-out that arrives
  later still clears an incomplete day). The brake is **Hold a day when
  check-ins or sign-outs did not arrive** under Policy; leave it on.
- **Check-ins that named nobody.** A check-in from CACENTRE or a desk that NGG
  cannot match to anybody is kept, not dropped. Open it, **Match to a person…**
  by their ID, and the check-in is recorded for that day — if they had been
  marked absent for it, that absence and whatever it caused is undone. Or
  **Set aside**.
- **Repair absences** (top right). For a period when check-ins or sign-outs
  were not arriving: choose the dates, **only centre-days where check-ins or
  sign-outs clearly didn't arrive** (fewer than one in five expected checked
  in — or, for a missing sign-out, fewer than one in five of those who came
  have one) or **every absence the check logged**, and who. Each row says what
  was **missing** — a check-in or a sign-out — so a day everybody came and
  nobody's sign-out arrived reads as the feed, not as truancy. The preview lists each centre-day, how
  many absences and people, how many are warned or Dormant now, the absence
  fines it would lift, and the **imported fines and dues it will not touch**.
  **Undo these absences…** asks for a reason; each absence is voided with it,
  everybody's standing is worked out again (warnings, the Dormant Track and
  proposed evictions that no longer hold are lifted; their absence fines come
  off the account, a paid one becoming credit), and one entry goes in the
  audit log. An absence a person logged is never touched, and nor is any fine
  or due that came from the old records or an upload.

**A check-in or sign-out that arrives late undoes the absence.** If CACENTRE
re-sends days already checked, each check-in voids that day's absence and
each sign-out voids that day's incomplete day (with the reason kept), and
what they caused is lifted. CACENTRE's gate can re-send up to 31 days of
sign-outs (*Send NGG the check-outs it missed*); the repair covers whatever
cannot be re-sent.

**Policy.** One form, saved with the bar at the bottom: whether the policy is
enforced for Summer School and, separately, for NGG members; the lateness time
and the ladder (absences allowed, lates before a suspension, its length, the
fine after it) for participants, for volunteers/mentors/instructors and for
members; the members' stricter fines (every late, an unexplained absence); ID
cards and reinstatement. **Run the absence sweep now** is at the top.

**Calendars.** For each calendar: whether today counts and the next day that
does, then **Use this calendar**, the start and end, the weekdays it **meets
on**, **cancelled days** and **extra days** (add a date, remove one with ×).
With no dates typed in, the Summer calendar follows the edition's own season.
Switching a calendar off makes every date count — the warning above it says so.

### Clearing every active member's account — once

**Conduct & fines → Fines**, at the bottom, for a **super admin** only. For
balances carried over from before this system. It can be used **one time, ever**,
and it clears the **whole account** — with one exception:

- **Cleared:** the unpaid **fines, dues and membership** this system charged.
- **Never cleared:** anything that arrived by **import** (an uploaded fines
  register) stays owed in full. Payments already made are counted against the
  system's own charges first, so an imported charge is never treated as paid.
- **Not touched:** the **training fee** — service earns it off, and the MOU writes
  it off; it is not a debt in the same sense.

1. **Clear every active member's account — once** (Preview) lists every active
   NGG member with something to clear, by kind (fines, dues, membership), what
   will be cleared, and what imported charge stays owed. Nothing has happened yet.
2. **Clear these accounts, once…** asks for a reason, the phrase **CLEAR ALL
   ACCOUNTS** typed exactly, and the current 6-digit code from **your
   authenticator app** (set one up on your own account first; five wrong codes
   lock it for fifteen minutes). It clears exactly the list you saw; if anything
   changed since, it asks you to look again.
3. Each account gets one waiver for what was cleared, with your reason and a
   note of what it covered. Charges made afterwards are owed as normal.

Afterwards the screen shows, to everyone with the Fees permission, when it was
run, by whom, for how many accounts, how much and why — and it can never be run
again, by anybody. The cleared charges stay on each account with the waiver
beside them, so uploading an old register again still reports it as already
posted.

### The rules as a document

**Conduct & fines → Export the rules (PDF)** (on the Fines, Policy and Calendars
views) downloads one formal document of every rule in force: the fine rules and
their limits per term, the attendance and lateness ladder for each group, the
members' additional rules, ID cards and reinstatement, the programme days, and
how a fine is recorded and appealed — dated, with a reference number on every
page. It is drawn from the same settings the system applies, so it says exactly
what the system does on the day it is issued. Export it again after a change.

### Uploading a sheet of fines

**Conduct & fines → Fines → Upload fines** (needs the `fees` permission). For a register
of fines kept on paper or in a spreadsheet — as it was kept; it does not need
retyping into a template.

1. **Choose your sheet** — an **Excel workbook (.xlsx)** or a **CSV** (commas,
   semicolons or tabs). Every sheet of a workbook is read (a sheet per centre is
   fine). The screen finds the **heading row** itself, even under a title, and
   recognises headings by meaning: *Names*, *Name of child*, *Member No*,
   *Email*, *Fine (₦)*, *Amount owed*, *Offence*, *Date*, *Remarks*, *Centre*.
   "S/N" is ignored. A sheet with **a column per kind of fine** (Late, Absent,
   Equipment, Conduct) becomes one fine per filled column, and its *Total* column
   and any **TOTAL** line are not fines. Under a kind of fine whose heading
   has no money in it, a **tick** (✓, x, yes) is one fine and a **small number**
   is how many ("Late: 3" is three late fines), each at that rule's **standard
   amount**; "Late (₦)" is read as money. A row that names its reason but leaves
   the amount empty also takes the standard amount; a written **0** is always "no
   fine". The check's summary has **How the file was read** — open it and read
   it against your sheet: it names each column used and ignored, and how many
   cells were ticked or counted. If the sheet has **no reason** anywhere, type one reason for every
   row ("Outstanding fine, term 1"). A PDF cannot be read — in Excel or Google
   Sheets choose *File → Download → CSV* or save as .xlsx.
2. **Check the file.** Every row says which member it matched and **how** —
   by ID, by email + name, by email, or by **name only** (shown in bold: give it
   a second look). Nothing is posted yet.
   - Names may be written in either order and with stray marks
     ("Mobolaji Daniel *" finds Daniel Mobolaji); that match says *name, words
     reordered*, in bold. A misspelt name is **refused** with the likely member
     offered as "Could be" — it is never charged on a guess.
   - A row whose fine is empty, `Null`, `-` or `0` is **skipped** ("no fine on
     this row"), not refused.
   - An email that two siblings share, or a name two members carry, is
     **refused** and the candidates are listed — fix the row with the printed ID.
   - A **centre** column, or the sheet's own name ("Egbeda"), settles two
     members of the same name at different centres (*name + centre*).
   - A printed ID written inside the name — "Ada Okafor (026-014)" — is used.
     A name missing a middle name ("Ada Okafor" for Ada Chioma Okafor) matches
     when it fits exactly one member, as *name, part of it* — a weak match.
   - Amounts may be written `5000`, `₦5,000`, `#5,000`, `5,000 naira`,
     `5,000/-` or `5k`. Dates may be `2026-10-04`, `04/10/2026` (day first),
     `4/10/26`, `4th October, 2026` or `Oct 4 2026`. A date that has not come
     yet is refused (day and month swapped, usually).
   - Reasons: *late*, *absent*, *equipment*, *conduct*, also read from a
     sentence ("came 40 minutes late", "did not attend") in the reason or the
     note; anything else is kept as the written reason.
   - A standard amount shows under the figure: *3 × ₦500 standard*. A kind whose
     rule has no standard amount is refused ("write the figure"); more than 20 in
     one cell is refused.
   - **The fine rules are applied in the check.** A rule switched off
     refuses its rows ("that rule is switched off"); a rule with a cap per term
     shows the amount that will really post, marked *capped*, with the sheet's
     figure beside it. What you post is what the check showed.
   - Summer School participants cannot be fined here — they have no ledger.
3. **Post fines.** Each fine lands on the member's account and in their next
   reminder. Up to **500** rows a file.

Uploading the same sheet again fines nobody twice: rows already on the ledger
are reported as *already posted*. Two genuine fines for the same member, day
and reason must differ in their note.

### Signing out, and closing time

**Settings → Attendance & punctuality → Closing time** sets, separately for
NGG Club members, Summer School participants and Summer volunteers, the time
from which people may sign out. Leave one blank for no closing time.

- The check-in desk has a **Check in / Sign out** switch; the Control Room
  kiosk has **Arrivals / Sign-outs**. A second scan never signs anybody out —
  the desk must be switched.
- Before closing time a sign-out is **refused** ("Too early to sign out —
  sign-out opens at 14:00") at the desk, the kiosk and the CACENTRE gate.
  Somebody who leaves early has no sign-out for the day, which the conduct
  policy counts.
- **A sign-out that arrives late still counts.** The nightly check counts a
  day with a sign-in and no sign-out as a **half-day** (two make one absence;
  no absence fine). If the sign-out reaches NGG
  afterwards (a CACENTRE gate departure delivered late, or CACENTRE's
  **Send NGG the check-outs it missed … from the last 31 days**), it is stamped
  at the time it happened and that day's "no sign-out" half-day is voided, with
  the reason kept. A member's record shows such a day once: **No sign-out ·
  half-day** until the sign-out arrives, then **Present** with its time.
- An admin in the Control Room kiosk can **Let them go early…** with a written
  reason (a sick child collected by a parent). It is recorded in the audit
  trail as an early sign-out. A check-in desk cannot do this.
- **NGG members are emailed** when they sign in (with the time, and whether
  they were late) and when they sign out (with the time spent at the centre).
  Their parent's address on the record gets the same note. The **Email a state
  note on check-in** switch in Settings turns these off with the Summer
  School's guardian notes.

### The companion — weekly check-ins

**Control Room → People → Companion** (needs `club`; `people` and
`curriculum` can read it). Every week the companion looks at each active NGG
member's **last four weeks**: sessions attended and missed, late arrivals,
days with no sign-out, curriculum lessons done and overdue, average check
score, conduct status and fines owed. It rates each member by **fixed rules**
— *On track*, *Watch*, or *Needs support* — and the reasons are shown on the
row, so a rating is never a verdict without an explanation. Those who need
support are listed first.

It then writes each member a short note — what is going well and one or two
next steps for the week — and emails it to them and the parent on their
record. With AI set up the note is written by the AI (it is given numbers
and a first name only — never a surname, contact or centre); without AI the
rules write it. Members see it under **Dashboard → Companion**, with the
weeks before. The Reflection Coach in the Anchor Journal is told the week's
next steps so its questions are relevant.

**Re-assess now** redoes a member's check-in for the week after a register
or mark is corrected (it is not emailed again). **Settings → Companion**
turns the weekly check-ins off.

### Which days count (programme days)

Two calendars decide which days are programme days; both are on **Conduct &
fines** (or Summer School → Policy).

- **Summer School** runs for the **Summer School edition's dates** on the
  weekdays ticked (Mon–Fri by default). Leave the dates blank and it follows
  each new edition by itself; type dates only to override. A **group** with
  its own meeting days uses those for its participants.
- **NGG members** run **all year, term by term**: a member day is any ticked
  weekday (Saturday by default) inside any term in **Sessions** — the breaks
  between terms are not member days, and the calendar never stops when a term
  ends. A **centre** whose *Meets* field names its days ("Wednesdays",
  "Wed & Sat", "weekends") uses those days for its members instead.
- Holidays and extra days apply to everybody.
- Each panel's **Save** saves only that calendar.
- Switching enforcement on starts counting absences from **yesterday** — it
  never goes back and marks the whole term absent.
- Attendance rates count only scans on real programme days, so a visit on a
  day the centre does not meet never hides a missed session.

### The Club portal (/club-admin)

The NGG Club's own staff portal. It needs the **club** capability: admins and
club admins see every NGG centre; a **centre lead** sees only their own centre,
and every count, list, export and bulk action is held to it on the server.
Summer School centres never appear here.

- **Dashboard.** *Saturday readiness* (who is on the rota, desks, consents and
  photos still missing), the things to clear before Saturday, and the **weekly
  brief** — three short paragraphs (*Before Saturday*, *Slipping*, *This week*)
  written by AI from the week's facts, or by a fixed template when AI isn't set
  up, so it always works. *Send* emails it to the team.
- **Ctrl K** (or the search box) opens the command palette: any section, any
  member by name, any action.
- **Members:** Roster (the student directory — search, filters, register, bulk
  status/centre, messages), Promote (graduates into the Club; warns when a
  guardian email is missing), Permissions (consents, recorded with how they were
  given; Undo for a few seconds), Applications (accepting needs a photo),
  Approvals, Member requests, Families, ID cards (Print opens the ID Card Studio).
- **Care:** Check-ins (a low check-in can be sent to the child's mentor with
  *Tell mentor*, or marked seen), Mentorship, Behaviour, **Conduct & fines**.
- **Programme:** Timetable (clashes refused; export), Curriculum, Tournaments
  (results come from the games played on the chess screen, so they are
  read-only here).
- **Comms:** Announcements (below). **New announcement** asks who gets it —
  everyone, NGG members, Summer School, or any one centre — and shows how many
  active members each reaches; the confirm repeats that number. A centre name
  the system does not know is refused rather than sent to everyone. **Gate:** Check-in desks (a new desk's
  password is shown once), Duty rota. **Team & centres:** Team, Centres,
  Volunteers, Staff activity.
- On a phone the bottom bar holds Home, Roster, Timetable, Check-ins and More.
- **Every Club tool works on a phone.** Applications, Families, ID cards,
  Conduct & fines, Curriculum, Tournaments, Volunteers, Staff activity and the
  Wi-Fi regions and setup used to show as greyed-out "Computer" rows under
  More. Each now opens on the phone as a list: tap a row for its detail and
  decisions, and the list's own action (Add a rule, Add a course, Add a shift,
  Open a desk …) is the black button at the top. Tournaments has its own phone
  screens for hosting one, adding players and entering results. A loading bar
  or an error with **Try again** now shows on the phone too.

**Conduct & fines.** Each rule (late, absent, equipment …) has an amount, an
on/off switch and an optional **cap per term** (the same rules as Control Room →
Money → Conduct & fines, where they can also be edited). A rule that is off posts
nothing; a capped rule never takes a member past its cap in a term — the last
fine is reduced to fit, and once the cap is reached nothing more is posted.
Guardians see every line. Only admins and club admins change rules; a centre
lead cannot.

**Two leads per centre.** A centre has an **NGG lead** and, separately, a
**Summer School lead** (Centres → the centre). The Club portal and NGG pages use
the NGG lead; public Summer School pages use the Summer lead. When the two were
split, a centre that runs Summer School started with its old lead in both
places; change either one without touching the other.

### Official notices (Control Room → Announcements → Notices)

Notices are written **on the page**, like a document — a one-line
announcement and a full management notice use the same editor.

1. **New notice** opens a blank page: a **title** and the **message**. That is
   all a short announcement needs ("No class this Saturday" — "The centre is
   closed for repairs."). Press Enter in the title to start the message.
2. **An official notice** adds its parts from the page: **+ Letterhead** (the
   organisation and the kind of notice — it then reads "Subject: …") and
   **+ Sign-off**, both filled from your last notice. Or **paste the whole
   notice from WhatsApp onto the empty page**: the letterhead, subject, body
   and sign-off are filled in for you, and the sections, bold and lists keep
   their formatting.
3. **Write and format** with the band above the page: **Text** / **Heading**
   for a paragraph or a section heading (a heading that starts "1." keeps its
   number), **B**, *I*, strikethrough, bullets, undo/redo. Type `-` and a space
   for a bullet. Shortcuts: Ctrl+B, Ctrl+I, Ctrl+Alt+2 heading, Ctrl+Alt+0
   text, Ctrl+S save. Pasting from Word or Google Docs keeps bold and lists.
4. **It saves itself.** A draft saves a moment after you stop typing (the bar
   says *Saved*); a draft reaches nobody. The address is the notice's own, so
   a refresh or a shared link reopens it.
5. **Sending** (the panel on the right; a sheet from **To …** on a phone)
   says in one sentence who it reaches, then: who it is for (everyone, a
   programme or one centre), members / families / both, whether readers must
   **confirm they have read and understood it**, and whether to email it too.
6. **Preview** shows it exactly as members and parents will read it.
   **Publish…** confirms how many members (and their families) it is about to
   reach. Each member gets it in their notifications, with a push; each family
   account gets it once in Messages, however many children; and, if chosen,
   every address gets one email (sent a batch a minute).
7. **Who has read it.** Open the notice: how many read it and how many
   acknowledged it — the member themselves, or a parent for them — and a list
   of everyone it is for. **Remind** sends one more notification to those who
   have not, and nobody else; once a day at most.
8. **Correct…** opens the published notice in the same editor; change it,
   say what you corrected (required — readers are shown it), and **Save the
   correction**. Who it went to cannot change. Readers see that it was
   corrected, when, and your note. **Withdraw…** takes it back; readers see
   that it was withdrawn and why, and unsent emails are cancelled. A published
   notice is never deleted.

**Publish later.** In the Sending panel, **When → Publish later…** takes a
date and a time (Lagos time, up to 60 days ahead). The draft then goes out by
itself at that minute, as it stands then — keep editing until then. The bar
shows the time; **Don't schedule it** takes it away again, and **Publish
now…** still sends it at once. If the person who scheduled it has lost the
right to publish by then, it is not sent: it stays a draft and the audit log
says why.

**Who it reaches.** *Members and their families* goes to each member's feed
and each family account; *Members only* to the members alone; *Families only*
to the parents alone — the child cannot open a families-only notice, nor see
it in their list. Parents get a push notification on their phone when a
notice arrives in their family inbox. **Remind** follows the same choice: a
families-only reminder goes to the parents (the notice comes back to the top
of their inbox, unread), never to the children.

**While writing.** If the connection drops, the editor says *Not saved* and
saves by itself when it is back. If two people edit the same notice, the
second save is stopped — nobody's words are overwritten silently — and the
editor offers **Load their version** or **Keep mine**. Closing the tab with
unsaved words asks first. Once a notice has gone out, who it is for, whether
it is emailed, and whether it asks for an acknowledgement are fixed.

**On a notice's page:** **Send me a test email** (the notice as its email, to
your own address only), **Duplicate as a new draft** (same words and
audience, for next week's version), the email figures (sent, still to send,
failed after three tries) when it was emailed, and **Export who has read it
(CSV)** to chase by phone.

**Copy for WhatsApp** gives the notice back in WhatsApp's own marks to paste
into a group. Members and parents read it at **/notice/…** (signed in;
parents through their family account), where they can also **print or save
it as a PDF**. A member's notices are listed at **/notice**. A parent can
also acknowledge from Messages — signing the notice there is the same thing.

**Quick message** is the old one-line notification, kept for short alerts.

### Announcements reach the member portal and Community (from 3 Nov 2026)

What you announce no longer lives only behind the bell:

- **In the member portal**, an unread quick message, club announcement or
  official notice from the last fortnight sits at the **top of the member's
  Today**, ahead of their to-dos, until they read it (a notice opens on its own
  page; a message opens in their notifications). It is also in the bell, as
  before.
- **In Community**, each one can be posted as a **pinned Announcement in the
  commons**, by the person who sent it (for a club announcement, by its
  approver). It is posted once however often it is resent, and an official
  notice that is **withdrawn comes down from Community too**.
  - Quick message: **Show it in Community** (on by default).
  - Official notice: **Delivery → Show it in Community** (on by default; it
    links to the full notice).
  - Club announcement: the **Community** channel chip (on for new ones).
  - A message for **one centre** is headed "For Egbeda centre — …", because the
    commons is shared by every centre. A **Summer School-only** message, or one
    for **guardians only**, never goes to Community — it is the NGG members'
    space; the screen says so and the sender is told.
- **Money reminders never go to Community** — they are one family's business.
  The member sees their own in their portal, in words for them: "₦7,000 due
  1 Dec — your parent or guardian has been told" before it falls due, and "Your
  account: ₦2,000 to pay — your parent or guardian has been sent a reminder"
  for arrears. The child is told, never chased.

### Club announcements (Club portal → Announcements)

A coordinator or centre lead writes an announcement; an **admin approves** it
before anything goes out (an admin's own goes straight out, or at the time
they set). The approver reads exactly what will be sent — including the text
message version, below.

**Channels.** A new announcement starts on **App** and **Email**, plus
**Telegram** once the site has a Telegram bot (Settings → API keys → Telegram).
SMS is never on by default: it costs money per text.

| Channel | Members | Guardians |
|---|---|---|
| App | their notifications | their **family account** — a "From the Club" list at the top of /family, marked new until read |
| Email | their email | every guardian email on the record and on family accounts, once each |
| Telegram | their phone, if connected to the bot | their phone, if connected — the **whole** message, free |
| SMS | — (members don't get SMS) | guardians' phones; a phone that already got it on Telegram is not texted too |

**Too long for a text.** A text holds 306 characters ("NGG: " and all — two
texts). When the message is longer and SMS is ticked, the editor asks for an
**SMS version**:

- **Shorten with AI** writes one. It is checked before you see it: every
  number, date, day, time, amount of money, phone number, link and email in the
  full message must still be in it. If the AI drops one it is asked once more,
  naming what it left out; if it still can't, it says so and offers email and
  Telegram instead. Nothing the AI writes is sent without the approver reading it.
- You can write or edit the SMS version yourself. The editor names any fact it
  leaves out ("Leaves out 10") as you type.
- **Send by email and Telegram instead** turns SMS off; those channels carry the
  whole message.
- If an announcement is submitted with SMS, a long message and no faithful SMS
  version, **SMS is dropped** and it goes by email (and Telegram) instead — and
  the screen says so. A text is never cut off mid-sentence.

**Nobody reached is refused.** An announcement whose channels reach nobody in
its audience (for example App only, to guardians at a centre where no guardian
has a family account yet) is refused with the reason, not "sent" to nobody. The
reach line under the editor counts each person once.

### Approval notifications

Nothing waits in a queue unseen any more. Each of these sends an in-app
notification **and** an email with a link straight to the right screen:

| When | Who hears |
|---|---|
| A club admin's action is queued for approval | every admin who can approve it (holds `people`, is not a club admin, is not the requester) |
| That request is approved, rejected, or approved but fails to run | the club admin who asked — with the reason |
| An instructor submits a curriculum material | everyone with the `curriculum` permission |
| It is approved or sent back | the instructor — with the reason |
| A member raises a request (payment, appeal, leave, ID card) | staff with `people` whose centre scope includes the member |
| The request is decided | the member — by email as well as in the app |
| A parent asks to connect through the record's parent email | staff with `people` whose centre scope includes the child |
| A request a parent raised is decided | the member, **and** the parent at their family-account address |
| Anything new in the Inbox — a contact message, an application, an approval, a member request, a comment, a photo to review, a testimonial | everyone who can act on that part of the Inbox (see *New items in the Inbox* below) |

### New items in the Inbox: the bell, a push and an email

Everyone who can act on a new Inbox item is told three ways, sized so that a
busy morning is one alert, not forty:

- **The bell** holds **one** item per part of the Inbox that counts up —
  “4 new member requests” — rather than four alerts. Reading it starts the
  count again.
- **A push notification**, on every device where you turned notifications on
  (**Account → Notifications**). It updates in place rather than stacking.
- **An email** — the first one, then **at most one every half hour** for each
  part of the Inbox, saying how many are waiting. **No email while you are in
  the Control Room** — you can see it arrive. Switch inbox email off under
  **Account → Notifications → Email me about new inbox items**.

Who counts as “can act on it”: the same permission the Inbox tab needs
(Messages: `inbox`; Applications, Approvals, Member requests: `people`;
Comments, Photo review, Testimonials: `content`), and a centre-scoped admin
hears only about their own centres. The person who caused the item is never
told about it. A family's own Summer sign-up photo is reviewed with the sign-up
at the desk, so it does not alert anyone separately.

### Family accounts — parents and guardians

**Control Room → People → Families.** Needs `people`; a centre-scoped admin
sees and decides only their own centres' children. Choose *Waiting*,
*Connected*, *Refused*, *Disconnected* or *Left by the parent* above the list;
tick the connections and use **Approve**, **Refuse** or **Disconnect** in the bar
that appears. Refusing and disconnecting ask for the reason the parent is emailed.

Parents sign in at **/family** with their own email — a six-digit code, no
password. The family app has five sections, the same on a phone (a bar at the
bottom) and a computer (a sidebar): **Today** (how the child is today, what is
owed, what needs the parent, the latest messages), **Saturdays** (the record,
and *Coming up*: events to answer and a booked mentor meeting), **Growth** (the
Leadership Index, school results and the session plan, lessons, the mentor),
**Fees** (what is owed, the statement, the training place) and **Messages**
(the household inbox and their requests to the centre). On a phone the top is
one bar: the child (tap to switch), a bell with the number of things waiting,
and their account. The address carries the child, section and sub-tab, so a
shared link opens the same place. It is a separate account, not a member
account: it cannot open any member page, and nothing in it can reach the
Control Room. They **never** see the child's journal, reflections, coach chats
or messages with their mentor.

**What a parent can do there:** answer an event (*I'll come* / *Can't make
it*); sign a monthly report and an approved session plan as read (the mentor
sees it); remind a child whose school results are late, or upload a photo of
the report for them (the child then checks the scores and writes the plan, as
before); book one of the mentor's free times or ask the mentor a question; and
tell the centre about an absence, appeal a charge or ask for a new ID card.

**Anchor Circle is part of the family account (added 2026-10-28).** The old
no-account portal at **/circle** is retired; it now says where each person goes.
A child's *Anchor week* — the systems they held each day, the days they
reflected, their streak, and the days an adult confirmed their conduct — is
seen by their circle of adults:

- **Parents** see it on *Growth* (a line of it on *Today*): they confirm the
  days conduct met expectations at home and leave the child a note (five a
  week). The child reads notes in their app.
- **Mentors** do nothing: the children they are assigned are connected already.
  In the mentor portal, open a mentee → *Growth and lessons* → *Anchor this
  week*. When an assignment ends, so does the connection. A mentor also reads
  the child's whole journal — see *The mentor reads the journal* below.

Anybody connected through the old portal must reconnect this way; the days
they confirmed and the notes they left stay on the child's record.

**Mentor Messages: one conversation per person (changed 2026-10-28).** In
the mentor portal, *Messages* lists people, not items. Each child is one
conversation: what they wrote, the journal entries they sent and their
check-ins, in time order, answered from one reply box that reaches their
app (after 8pm it waits until 8am). Families and colleagues (the lead, or
for a lead their mentors, both sides of the conversation) are conversations
too. The list is grouped — *Needs a reply*, *Children*, *Families*,
*Colleagues* — shows the last word and who said it, and has *Find a person*
and *New message*. On a phone the conversation fills the screen, with *All*
to go back. *Their page* opens the child's record.

**The mentor reads the journal (added 2026-10-28).** Nothing in a child's
journal is kept from their mentor. In the mentor portal, open a mentee →
*Journal*: every entry they have written, newest first, with the mood, the
date and whether they sent it — including the entries they did not send and
their weekly reviews, which are now always saved to the journal in full
(obstacles too). Each reading is recorded in the audit log
(`mentor.journal.read`). A **peer mentor** — a young person mentoring — does
not get the tab and the server refuses it: children's journals are for adult
mentors. Parents do not see the journal. The member, journal and family apps
now say "only you and your mentor" where they used to say "private".

**Money, from the parent's side (added 2026-10-27).** Payments are the parent's,
not the child's:

- **Pay ahead.** *Fees → Pay ahead* offers 1, 3, 6 or 12 months of the
  commitment fee, each priced by NGG with what is owed today and any membership
  renewal that falls in those months. It is one invoice (*NGG-ADV-…*), paid
  online or by transfer like any other. **Nothing is charged early**: the
  payment waits on the account as a credit and meets each month's charge on the
  1st, so no reminder goes out while it lasts and the account shows *Paid ahead
  to <month>*. A fee changed in the meantime is charged at its new price
  against the same credit. Paying ahead waits until the joining invoice is paid.
- **"I've paid".** A parent who paid by transfer or at the desk tells you from
  *Fees → Paid by transfer or at the desk?* — one line per way they paid
  (transfer with its reference, cash with who took it, POS with its receipt
  number), the date, and a photo of the receipt if they have one. It arrives in **Member requests** as *Payment made*, marked *From
  their family account*, and moves no money until you approve it against the
  statement — exactly as a member's claim used to.
  The parent is told at once that it arrived (with their reference and how
  long checking takes), and told again — in the family app and by email — when
  you approve or decline it.
- **The child asks.** The member's app no longer has *I've made a payment*. On
  their account screen there is one button, **Ask my parent**: every connected
  parent gets a message in their family account and an email asking them to
  pay, or — if they already paid — to say so with the reference. Once a day; a
  child with no connected parent is told how to connect one. The parent sees it
  at the top of *Today* until it is paid or confirmed.

Today also now shows, under the child's account: quick actions (an absence,
the mentor, paying ahead, a replacement card), what is coming up at the centre,
and the lessons the child is on.

**What a parent cannot change:** their own name and phone, who may collect the
child, and the five consents are **read-only** in the family app. *Ask to
change* sends a request to the desk (*Change family details*, *Change who can
collect*) — you check it and make the change. Who may collect a child is in
their record: **People → Members**, open the member, *Who can collect…* (one
person per line: name, relation, phone). A session plan is shown to the
family only after the mentor has approved it.

**Absences and fines (members).** An absence nobody asked about is fined (the
*absence fine* in Settings → Policy, NGG member enforcement). If a request covers
the day and you haven't answered it, nothing is charged until you do: **declining
it issues the fine, approving excuses it.** Approving **academic leave** goes
further — its days stop being absences altogether (logged ones are voided) and
don't count towards the two.

**The monthly report** is written for every connected child on the first days
of the month and lands in the family inbox asking for a signature. Families
expected at an event who haven't answered are reminded three days and one day
before; both sides of a mentor meeting are reminded the day before. Mark an
event *families expected* on the event itself.

A parent connects to a child in one of two ways:

- **The child's Anchor code + a part of their name** (the code on the child's
  *You → Your Circle* screen). This connects at once — the child gave the code.
- **"Records with your email"** — NGG records whose *parent email* is the
  parent's sign-in address. This only **asks**: it waits in *Families* until
  someone approves it. Holding an inbox is not proof of being the parent, so
  approve only when you know the family.

Either way the child is told (in the app and by email), and the connection is
listed on their own Circle screen. A child cannot remove it themselves —
**Disconnect…** here does, at once, and the parent is emailed your reason.
Refusing a request also needs a reason.

From the family account a parent can tell the centre a child will be away (with
the reason; a child has two absences in the programme, and a request past that is
refused), ask for **academic leave** (exams or a school programme, up to ten weeks), appeal a charge, ask for a replacement card, ask the mentor a
question, or ask for their details or the collectors to change. These arrive
in **Member requests** marked *From their family account* (a question for the
mentor also goes straight to the mentor), and your reply is emailed to the
parent as well as the member. A payment made by transfer or at the desk is
claimed by the **parent** (*Payment made*, from their family account); a member
can no longer claim one from their own app and asks their parent instead.

Every family email is **always on** and cannot be switched off: every sign-in
and sign-out, the Saturday plan and close, the Monday weekly summary, alerts
(a fine issued, a child not arrived) and mentors' family updates. They are part
of membership. The family account lists them as *On*; preferences a parent set
before this rule are ignored.

---

### Mentorship: Anchor Pods

**Control Room → People → Mentorship** (`/control/mentorship`) is HQ's and the
leads' workspace. Mentors use the **Mentor Portal** at `/mentor`, which has one
address per programme so NGG members and Summer School participants never share a list:

| Address | Who | What |
|---|---|---|
| `/mentor/ngg` | NGG pod, peer and lead mentors; coordinators and admins (as coordinator) | This week, Mentees, Goals, Sessions, Saturday (Before / During / After), Messages, Pod growth (Leadership Index), **Class** (Stars, School results, Curriculum) and **My role** (role, Projects, Academy, hub). The Saturday schedule sits under each page's own work, not above it |
| `/mentor/summer` | Summer School mentors; admins | This edition's participants only: stars, notes, reviews, concerns |
| `/mentor/class` | An NGG mentor: the portal's **Class** area (`?tab=results` / `?tab=curriculum` open those tabs). Anyone else with the class tools (an admin with no pod): the stand-alone class page | Stars, V3, notes, curriculum, school results |
| `/instructor/ngg` | NGG instructors (Instructor Portal) | Today, Roll, Plan (hinge, exit, retrieval from earlier weeks), Teach, Exit ticket, Session log, Skills board (evidence to move a child up), Marking, Curriculum, Students, Community, School results, Report a concern |
| `/instructor/summer` | Instructors who also teach Summer School | That edition's participants only |

**An instructor's class** is every active member at their centre who takes
one of the courses on their volunteer record — by the member's chosen
courses, so a child on Robotics *and* Coding is in both classes, and a course
typed in a different case still counts. Their roll, Marking, Analytics,
Students and School results all read that one class.

- **Marking:** a written answer waits under **Progress → Marking** with the
  question and what the child wrote. Pick a mark, add a line, **Save and next**.
  The child gets a notice with the lesson, their score and your words, and the
  counts on Today and Analytics update at once.
- **Analytics:** each lesson shows how many of the class finished it
  ("3/12"), and the average score of those who did.

`/mentor` sends a person with one portal straight to it and shows a chooser to anyone who
covers both programmes. A coordinator over several centres switches centre at the top of every screen.

**Messages with children.** In the portal's **Messages**, each child is one
**conversation** with the whole exchange in it, whoever wrote first. **New
message** starts one: a pod or peer mentor picks from their own mentees; a
**lead mentor** (and a coordinator) can type the name of **any child at their
centre**, mentee or not — not a colleague and not another centre's child. A
mentee's profile also has **Message {name}**. Messages to children written
between 8pm and 8am wait and go at 8am; the child answers in their own chat,
and the answer comes back into the same conversation.

**Saturday Formation Schedule** (Control Room → Learning → Saturday formation, `content`):
the 9:00–3:00 day (moved an hour later on 30 Oct 2026, from 8:00–2:00), block by block,
with what members do, what mentors watch for, what instructors deliver, what admin must have
ready and what families are told. Every portal and the Saturday reminders read this one
table; edit a block and they all change — including the families' three emails (the plan at
the first block's start, the not-arrived notice 45 minutes in, the summary at the last
block's end), "on time" on the mentor's register (checked in by the first block), and the
hours the family app shows. The doors, the grace minutes and when sign-out opens are the
**attendance settings** (Control Room → Settings), which the family app now reads rather
than printing a fixed 09:00 and 14:00 — if sign-out is set to open at 14:00, move it to
15:00 there so families are not let go before the day ends. On the
the Saturday, block by block, with what members do, what mentors watch for, what
instructors deliver, what admin must have ready and what families are told. Every portal
and the Saturday reminders read it; change a block and they all change.

| You want to… | Do this |
|---|---|
| Change a block's time, name or words | Open the block → **Change this block**. With **Move the blocks after it too** on (the default), a later end moves the rest of the day with it, keeping every length and gap. Off, a time that runs into the next block is refused and named. |
| Add a block | **Add a block**: its name, what it comes after, how many minutes. The blocks after it move later by its length. |
| Remove, reorder or copy a block | Open the block → **Remove this block** (the blocks after it move up), **Move up** / **Move down** (the two swap places; the day still ends when it did), **Duplicate**. |
| Start the day at a different time | **Move the day**: the whole day, or from one block on, to a new start. Nothing may run past midnight or move more than five hours at once. |
| Give one centre a different day | **A centre's own day**: a copy of the main day, used at that centre every Saturday until you remove it. |
| Change one Saturday only | **Change one Saturday**: that Saturday everywhere, or at one centre. It starts as a copy of the day in force there. |
| Cancel a Saturday | **Mark a Saturday off**, everywhere or at one centre, with a line families read. Nothing is sent that day and every portal says so. A note without "off" is shown above that Saturday's plan. |

Which day applies at a centre on a Saturday is the first that exists of: that
Saturday at that centre → that Saturday everywhere → the centre's own day → the
main day. **Versions of the day** lists them; the address names the one on
screen, so a link opens it. A centre-scoped admin changes only their own
centres' days. **What it is for** on each block (check-in, mentor breakout,
classes, break, close) decides the reminders: members are not reminded at
check-in, instructors are reminded at the classes block, the mentor breakout
sets the mentors' planning window. Families who take check-in news get the plan
an hour before the day starts (never before 8:00), a not-arrived notice 45
minutes in and the close at the day's end, all by their child's centre's day.
On the
Saturday register a mentor ticks, per child, the values seen and the duties: On time
(the gate's arrival time is shown), Assignment in, Checked out — and can **Add detail**: one line
(up to 500 characters) of what they saw, saved with the register. It shows under the child's name,
opens the weekly review ("Noted: …") and joins the child's timeline. A child's name on the register
opens their profile; **Go to the weekly review** takes the mentor straight to After.

**The Saturday plan (Before).** The mentor's part of the day is the
**Musing & mentor breakout** block of the formation schedule (9:30–11:00 by
default), so its window — and what follows it — come from Control Room →
**Musing & mentor breakout** block of the formation schedule (8:30–10:00 by
default; the block whose kind is *Mentor breakout*, at the mentor's centre, that
Saturday), so its window — and what follows it — come from Control Room →
Learning → Saturday formation, never from a fixed number. The *Pod huddle*
always opens it (the register is taken there) and the *Close* always ends it;
between them the mentor times every item in five-minute steps, moves items up
or down, renames them and says what happens (*Edit*), adds an activity from
the library or one of their own, removes any but the huddle, one-to-ones and
close, or puts back the standard plan. The summary line keeps count: *"85 of
90 min planned · 5 min spare"*, or what an overrun runs into. **One-to-ones**
are picked on the same screen (up to six; longest since their last first) and
each child gets a time. It saves as they go and says so (*Saved*, or why not
with *Retry*); *Share with {lead}* sends the lead the running order with times
and names.

**A pod** is one mentor and the members matched to them, at one centre: at
least **five** (the Commitment Policy) and at most **eight**. Every match moves
through five phases — **Match** (the offer), **Connect** (weeks 1–6, getting to
know each other: no goals yet), **Grow** (7–40, one goal at a time), **Lead**
(41–50, the mentee leads something for the pod) and **Close** (51–52, a
planned ending, never a silent stop).

**Matching is a choice of two.** In **Match queue**, open a member and approve
two mentors; the member (or their guardian) picks one — from their own account,
or you record the choice from the match in **Relationships**. Only mentors who
are **cleared** appear, at the member's centre, with a place free. *Undo* on the
toast withdraws an offer nobody has chosen yet. Once chosen, the portal
schedules the cadence: weekly one-to-ones in Connect, then every two weeks, a
monthly goal check and parent summary, the termly relationship check, two lead
check-ins in the first month, and the closure conversation.

**Cleared** means three things, all required before a mentor sees any child's
record: screening (record it in **Mentors**), all **13 Mentor Academy modules**
(the mentor takes them in the portal; answers are checked by the server; child
safeguarding is renewed yearly), and the signed **NGGC Mentorship Commitment &
Conduct Policy**.

### "Start here": the portal guides, compulsory on first login

Both staff Academies — the **Mentor Academy** (in `/mentor/ngg`) and the
**Instructor Academy** (in `/instructor/ngg`, under Resources) — open with a
group called **Start here: using the portal**: six short guides (three to five
minutes each), one per part of the portal, each saying which tool does which
job ("five families need an update → All mentees, filter, select, Family
update"; "a child arrives after you closed the roll → reopen it"). Each ends
with a few questions, checked by the server.

- **Compulsory, but the portal stays open to look around.** Until somebody
  has completed their **whole Academy** — the "Start here" guides and every
  required module for the portals they work in (an NGG mentor 19, a Summer
  School mentor 16, an instructor 9) — every screen of their portal opens, but
  a banner on each one says *"Your Academy: N of M done … nothing you do here
  saves until it's complete"*, and the server refuses that portal's writes
  (sessions, reviews, the register, stars, messages to children). **Report a
  concern always works.** The moment the last module is passed, saves go
  through. A yearly renewal that lapses puts the banner back until it is renewed.
- **Not clearance.** The guides are separate from the 13 modules that clear a
  mentor to be matched; finishing them doesn't clear anybody, and adding a guide
  never un-clears anybody.
- **Who is exempt.** Staff with admin access, and a mentor whose Academy you
  recorded as completed in person (Control Room → Mentorship → Mentors → the
  mentor → *Academy completed in person*).
- **Instructors** also have *Retrieval, hinge questions and exit tickets*,
  *Feedback that moves learning* and *Safeguarding for instructors* (renewed
  yearly). An instructor whose safeguarding check isn't recorded yet still gets
  the portal — the Academy and Curriculum — with the class empty and the reason
  said.
- Three tries at one module a day; then it says when to come back.
- **How children see them.** The Academy page opens with *How children see
  you*: a mentor or instructor picks their title (Mr, Mrs, Ms, Miss, Dr, Prof,
  Engr, Coach, Aunty, Uncle, Pastor). Children and families see every adult as
  **title + surname** — "Mrs Adeyemi", never "Funmi" — in the chat, *My
  mentor*, the timetable, courage marks, results notes, Saturday evaluations,
  Community posts and the family's Saturday summary. With no title chosen it is
  **Coach**. You can set it for them too: Control Room → Mentors → the mentor →
  *Title*, or Volunteers → *Edit details* → *Title*. Staff screens keep full names.
- The content is `api/_lib/seeds/mentor-academy.json` and
  `api/_lib/seeds/instructor-academy.json`. When a portal screen changes, change
  its guide in the same commit.

**The adaptive rules** run every six hours (and on *Run the rules now*). They
write a nudge; nothing is ever sent to a child.

| Rule | When | Who sees it |
|---|---|---|
| R1 | A mentee misses two Saturdays the centre met | Mentor, with a ready message to the parent |
| R2 | No one-to-one for 21 days | Mentor — top of Today |
| R3 | Two weekly reviews say “worse”, or a concern is raised | Lead, with an intervention opened |
| R4 | A goal is completed | Mentor — the next goal from this week’s Anchor theme |
| R5 | The first six weeks | Goal tools hidden; two lead check-ins scheduled |
| R6 | A mentor’s reviews under half the pod for three weeks | Lead only — a private support chat, never a public flag |
| R7 | A low termly relationship check, either side | Lead, with an intervention opened |
| R8 | A mentor is leaving | Lead — every match moves to a planned closure; nobody is re-matched until it is done |
| P1 | A month short on the Commitment Policy | Lead only, privately |

**The Commitment Policy, measured.** In **Mentors**, *Record commitment
attendance* records who came to CIMC training (Saturday 7:00am), the weekly
Mentor Preparation session (7–8pm), Saturday 9:30 mentoring (at least twice a
month), the Tuesday STS meeting and the quarterly retreat. A mentor who has
completed CIMC training is marked so once and no longer needs Saturday 7:00am.
The month also counts the pod (five or more), parent summaries and the Anthem
and Pledge. The conduct commitments (values, accountability, feedback,
leadership) are listed for the lead's own review and are not scored.

**Projects and activities.** *My role → Projects* in the Mentor Portal. A lead
or a coordinator sets a project for the mentors they lead and the children at
their centre; any mentor, for the children in their own caseload. A project
has a name, what to do, a start and a finish date (a year at most), and the
people on it, optionally split into named groups (twenty at most, two hundred
people). Everyone on it is told when it is set and sees the same countdown.
A mentor marks their own part done; a child marks theirs from **Community**
in their app, where they see the project, their group (other children by first
name, adults by title) and who set it; a project finishing within a week is
on their **Today**. The person who set it sees every group's tally and may set
anyone's part — done, not done yet, or *excused* (an excused part is not
counted). Taking someone off keeps them on the record if they had finished.
The commitment *Support NGGC projects and activities* on My role counts the
mentor's projects this month ("1 of 2 done · next finishes 20 Oct"), and turns
into a to-do when a part is past its finish date — only while the project is
open; a finished project is never "past its date". Saving and marking wait for
the Academy, as the portal's other saves do.

A mentor with no safeguarding screening recorded can be on a mentors-only
project, but is refused (by name) on one with children, because everyone on
it sees the children's names. Somebody already on a project who has since left
— gone inactive, moved centre — stays on it until you take them off, so it can
still be edited, finished or cancelled; they just cannot be *added* to a new
one. Once a project is finished, only the person who set it (or the Control
Room) can change a part.

**Projects in the Control Room.** **Mentorship › Projects** shows every project
at the centres in your scope — the ones leads and mentors set in the mentor
portal and the ones set here — with how many are open, finishing this week and
past their finish date, and each project's groups, progress and countdown.
**New project** (People permission) picks a centre, then its mentors and
children (or *every child at the centre*), the dates and the groups: name the
groups ("Red, Blue") and everyone is shared out across them, mentors first, one
to a group. Open a project to see each group, **Set part** for anyone (done, not
done yet, excused), **Edit**, **Mark finished**, **Reopen** or **Cancel
project**. The rules are the mentor portal's own: a finished part is never
removed, at most 200 people and 20 groups, a year at most.

**Supervision, written up.** In **Mentors**, *Book supervision* books the
Tuesday after STS; the button then reads *Write up supervision* and the row
shows the date. After the meeting, the lead (or a coordinator) writes what they
told the mentor and up to five things agreed, and saves. That closes the
booking (on the day it was written, if earlier than booked), the mentor is
told, and in **My role** they read the feedback and the agreed points. The
commitment *Feedback received professionally* dates from the last notes ("Last
supervision notes 3 Oct"), says "No supervision written up yet" until there are
some, and turns amber after four months without any. Notes can also be written
for a supervision held without a booking.

**Safeguarding.** *Report a concern* is in the Mentor Portal's header,
for every mentor, cleared or not. A report goes to the safeguarding officer for
that centre (the staff member holding `safeguarding` with the centre in scope),
gets a case number, and cannot be edited by the reporter. The **Safeguarding**
tab is drawn only for people holding that capability; notes and status changes
sit beside the report, never over it, and every opening of a case is recorded.

**A concern can also start from a conversation note.** On a child's record,
ticking *This is a concern about the child* on a conversation opens the same
kind of case for the safeguarding officer, and tells the centre's lead mentors.
It works at a centre with no lead mentor too: the case is what makes sure
somebody hears. Marking a note that is already a concern again does not open a
second case.

**Who reads what.** A mentor opens a child's record only once their
safeguarding **screening** is recorded (they can still report a concern before
then). In the portal's *Needs attention* list, a concern's wording is shown to
the centre's lead mentors and staff, to the mentor who wrote it, and to the
child's own mentor — not to every mentor at the centre.

**Pairing by hand** (*Members → Mentor*) now behaves like a chosen match: it
starts the relationship (with its cadence and the first-weeks goal lock), a
reassignment closes the old relationship and starts a new one, and removing the
mentor closes it. A child has one mentor at a time.

**Goals in the record** start as a *draft*. Once the mentee has agreed it,
press *They agreed · start it*; only then is it live. *✓ Done* marks it
achieved and *Drop* pauses it.

**Automations paused while the new portal is withdrawn.** Control Room →
Settings → Mentorship automations shows some cards as *Paused in code*: the
ones whose only result appeared in the Mentor Portal v14 screens that were
withdrawn (Due now, the Family tab, Saturday planning, scorecards,
commitments, the Academy). They come back on together if those screens
return. Pushes that fall in quiet hours (8pm–8am) now wait and go at 8am
instead of being lost; a child is asked their side of the relationship check
once per cycle, not every morning.

**Impact** shows six measures against fixed targets — match length (≥ 70%
reach 12 months), contact (≥ 85% with a one-to-one in 14 days), weekly reviews
(≥ 90%), relationship quality (≥ 4 of 5), goals completed on time (≥ 60%) and
mentor retention (≥ 75%) — each with the counts it came from.

The Mentor Portal (`/mentor`) is the class roster: *Stars & notes* (stars, V3,
conversations, goals, courage and the weekly review on each child's record),
*Curriculum*, *School results* and, for leads, *Needs attention*. Pod screens
from the October 2026 portal (This week, Saturday register, Academy online,
Messages) were withdrawn; their server rules (R1–R8, the Academy gate, the
nightly jobs) still run.

**School results.** A member uploads their term report on their dashboard
(**School results** tab), checks the scores and writes a plan for at most three
subjects, each with a "when and where". It goes to their mentor, who approves it
or sends it back with a note in the Mentor Portal's **School results** tab
(`/mentor/class?tab=results`; the email's `/mentor?tab=results` lands there). Approved, it is live; the family
hears only if the member chose that. Plans whose study sessions are mostly
missed are listed there too.

## The Community (/community)

The members' community runs on the redesigned app (**Community v3**). The
previous app is still one link away at `/community?classic=1` while everyone
moves over.

- **Home** leads with the week's quote, announcements, homework due and
  featured posts. Channels hold posts of five kinds: post, **question** (can be
  marked answered by its author or staff), **work** (a project, with photos,
  video, files or **code** that runs in a live preview), **announcement** and
  **homework** (set by staff, with a due date and hand-ins). Staff announcements
  and homework are pinned.
- **Video** plays in the page with chapters and captions, and remembers where
  each member stopped. Posted media is resized in the browser before upload.
- **The safety check** runs as a member types, with the same rules on the
  server: phone numbers, social-media links, unkind words (with a kinder way to
  say it), shouting in capitals, and a reminder before posting video. A
  **student's** post that trips a rule is **held** for a moderator, and they are
  told why; staff posts are not held.
- **Reports** from members carry a reason. A *safety* report opens a
  safeguarding case straight away.
- **Moderation** (Control Room → Community): the queue filters by kind and
  reason and shows the median time to a decision. For each item: *Approve*,
  *Edit & approve* (fix a phone number or a word and let it through),
  *Message author*, *Hide*, or *Escalate* (hides it and opens a safeguarding
  case with a severity). Every decision is timed and recorded.
- **Safeguarding cases** are seen and changed only by people with the
  **safeguarding** capability — not by everyone with *content*. A case has a
  severity (low → urgent), a lead, a status and notes.
- Members also have their **journal**, the arcade, drafts that survive a
  closed tab, `/poll` and `/shrug`, image paste, and an offline notice.
- **Homework:** each child gets one private in-app notice when a task is set,
  which opens the task's post. Their note and link are kept per task, and a
  task counts as *seen* the first time its card is on screen, which is what
  the tracker's "Not seen since…" line reads. A late task still says *Hand
  in*. Homework is never set in Commons; the composer picks a course channel.
- **Search** asks the server, in a channel as well as on Home. It matches the
  words and the name on a post, and stays inside the channels the member
  follows. *See their posts* on a profile card lists what that person wrote.
- **Catch me up** lists the member's own unread posts, each one opens. A
  member whose post or reply is hidden or taken down is told, privately.
  Nobody but the author can reply to a post that is still waiting for a check,
  and deleting the reply marked as the answer re-opens the question.
- Counts and new posts refresh once a minute while the page is open. The
  *People* tab lists everyone who has posted in the channel. Typing names a
  child as "Ada N.", never by full name.

## Member records: from optional to required

The roster was seeded quickly, so many records have gaps. **Control Room →
Settings → Member records** closes them in three steps:

1. **Off** (the default). Nothing is asked. The page still shows how
   complete the roster is and who is missing what.
2. **Collecting**, with a deadline. Active members see *Complete your
   record* on their dashboard with the days left. Nothing is locked before
   the deadline. After it, the dashboard opens on the form until the record
   is complete, and other member screens send them back to it. Use **Email
   reminders** on the list to send families exactly what is missing.
3. **Required**, once the records are in. Saving an active member needs
   every chosen field; the message names what is missing.

Choose the fields a complete record needs (name, date of birth, sex, photo,
school, class, home address and LGA, parent's name, phone and email,
centre…) and who is asked (NGG members; Summer School accounts optional).

**Suspended, inactive and graduated members are never asked, locked or
refused on save.** Their record keeps what it has. Suspending a member
always works, even with gaps. Making them active again puts them under the
drive like everybody else.

**The join date** is not on the member's form or the general edit form. It
is set when the member is made (blank means today), by acceptance and
promotion, and by an import only where none is on file. To change it, open
the member and use **Correct the join date**: a date and a reason. The date
must sit in the intake year their printed ID shows (026-… is 2026), cannot
be in the future, and the old date and your reason are kept.

## Applications, sign-ups and verification

Four different queues, for four different things:

- **People → Applications** — year-round NGG applications. Accepting an NGG
  applicant sends the joining invoice (see *Joining fees* under The NGG Club).
- **Summer School → Pending sign-ups** — this edition's intake.
- **Content → Photo review** — photographs submitted by members,
  volunteers and Summer School participants, waiting on approval before
  they appear anywhere or print on a card.
- **Inbox → Testimonials** — what members said about their own sessions. See
  [What members say about a session](#what-members-say-about-a-session-testimonials).

**The Club application** (`/join`, policy version 2026.10) replaced the
Google Form. Seven steps: who is filling it in and the centre; the child;
school and class; home and origin; both parents; course, vision, hobbies and
areas of influence; photo and agreements. Then a review.

- What it refuses, in the form and again on the server: ages under 10; a
  surname typed as the first name; an email with no proper domain (it offers
  the likely fix); a phone that is not an 11-digit Nigerian mobile (it mends
  `803…` and `+234…`); "Yes" as a vision (40 characters at least); a promo
  code with spaces or a phone number in it; a photo too small, too dark or
  too bright for the card.
- **18 and over** is not refused, it is sent to **NGV's application form on
  Afrovanguard** (`afrovanguard.ngv_url` in `api/config.php`; empty means
  `{org_url}/academy/ngv/register.php`), with the name, date of birth, email
  and mobile already typed here filled in.
- **The same child sent twice** (same email and date of birth) updates the
  application you already have, as long as it is not yet decided. A brother or
  sister on the same parent's email is a separate application.
- **All six agreements are required to join the Club**: taking part,
  emergency care, privacy, family updates, and photos, videos and the website.
  Off-site trips are the family's choice. Each is recorded with the policy
  version and the date; when you accept the child, the member inherits them.
  Summer School's parent verification keeps its own rules.
- Accepting copies the parent's name and number, the school and class, and
  the child's own mobile onto the member. Everything else (address, origin,
  hobbies, how they heard) stays on the application.
- The policies a family agrees to are at **/policies**.
- **The school list** is every primary and secondary school in Lagos and Ogun
  from GRID3 Nigeria's open data, plus schools families have typed in: a
  school a family types is added to the list when you accept their child.

Photo review matters more than it looks: a member with no approved
photograph prints a card with a blank where the face goes. The **Missing:
photo** filter on the member roster is the list of people that will happen
to.

---

## ID cards

**Scanning a card with a phone.** A member card's QR opens the member's page
(`/q/<code>`): name, photo, division, course, centre, member since, days
present, and whether the membership is active. Every card printed from the ID
Card Studio now carries the member's secure code. An older card that carried
only the member number (`/?m=…`) still opens the page, but with initials only
and no photo, because a member number is not a secret; reprint it. A replaced
card opens nothing.

There are **two studios**, and they do different jobs. Each names the other
on screen, so you do not have to remember which is which.

| | **ID Card Studio** (`/club/id-cards`) | **Design Studio** (`/designer`) |
|---|---|---|
| What it is | Lays out and prints the cards for all three subjects on sheets of card stock, and keeps the print log and a reprint queue | Draws layouts, binds them to your own fields, publishes them, prints them |
| Layout lives | the design assigned to each card type, or the built-in standard card | in a template you edit |
| Use it when | you want cards in quantity, cut from sheets | you want a new layout or a new back |

**Which design prints.** In the ID Card Studio, *Designs* (right column)
picks the design for each card type — NGG members, Summer School,
volunteers. Only designs **published** in the Design Studio are offered, and
a design's paired back comes with it. *Standard card* is the built-in one;
members' standard card has a back too (return-to address, the holder's name
and ID, a signature line — never money or medical details). The header shows
what each type prints with, and every run in the log records the design and
its version. Every card prints at its own size — a record at its design's
size, an uploaded image at the *Card size* you set for uploads. **Cards of
different sizes go onto sheets of their own automatically**, after the others;
the pager says each sheet's size, the confirm lists each size and its sheets,
and the print is still one PDF (the print-shop export makes one PDF per size).

**Removing a sheet.** The bin next to the sheet arrows takes every card on that
sheet off the run (an uploaded image loses only the copies that were on it).
It asks first, and Undo puts it back. Nobody's record changes.

**Photos on the card.** A head-and-shoulders photo is shown whole. A photo
with more in it (half or full length, a wide scene) is cropped to the head and
shoulders, using Cloudinary's face detection; photos stored on this site are
always shown whole. Uploaded card images are shown whole too (*Fill the card*
crops them on purpose).

**A photo that can't be loaded** (the file is missing on the server) is named
in red before printing, with *Take it off*. Replace the photo from the card's
*Edit photo*, or print the others first.

**When a card can't be drawn**, nothing is printed and a dialog names the
cards, says why, and offers *Try again* or *Take them off the sheet*. If it
says the browser holds an old copy of the print tools, reload the page
(Ctrl+Shift+R).

The old address `/cards` still works and opens the ID Card Studio.

**Print from a prompt.** The bar at the top of *Make cards* takes a request in
your own words: *“New cards for Egbeda members, front and back”*, *“Reprint
026-003 and 026-014”*, *“Summer School participants who registered this week,
proof on A4”*, *“Volunteers, fronts only, by name”*. Press *Plan the print*
(or Enter). The studio puts the matching people on the sheet, sets the sides,
crop marks, paper, quality and order you asked for, and shows what it
understood: the count, the sheets, the settings it changed (outlined), and
anyone left out and why (no photo yet, *Ask for photos*; an ID not found;
somebody who already has a card, *Reprint them*). **Print N cards** on that
result makes the PDF at once. It refuses if the sheet changed since the plan.
*Undo* puts the sheet and settings back. The list on the left shows the same
filter, so you can check or change the selection by hand.

**Change it in words.** While a plan is on screen, the bar takes a change:
*“fronts only”*, *“only Ijaiye”*, *“add 026-010”*, *“not Ada”*, *“make it a
proof”*, *“sort them by name”*. A request that names who to print (*“volunteers
at Egbeda”*) starts a new plan instead. Each part the studio understood is a
chip; its × takes that part out at once. *“Except …”* leaves people out, and
names and centres may be misspelt (*“Egbda”*, *“Ada Obbi”*). It also reads *“the
first ten”*, *“in October”*, *“since Monday”*, *“since 3 October”*. When the last
sheet has empty slots, the result offers to fill them with other cards that are
waiting. Recent requests show as chips under the bar, ↑ in the empty bar brings
back the last one, and **/** anywhere in the studio jumps to the bar.

It reads the request with whichever AI key is set (OpenAI, Claude, Gemini,
Groq or OpenRouter; System → Service keys) and always with the studio's own
rules, which work with no key at all. The result says which read it. It only
selects from the people the studio already shows you and changes the studio's
own settings: it never prints, sends or changes a record by itself.

**Named lists, said plainly.** When you name people, the count says why it is
short of the names (*"3 cards · 4 named: 1 no photo yet"*). Somebody kept off
by the plan's own filter is named with the reason (*"Taiwo Ayomide is a Summer
School participant, and this is NGG members only"* — *Put Taiwo on too*), not
reported as missing. Somebody on two lists (an NGG member who was also at
Summer School) is flagged, with *Keep the NGG member card* / *Keep the Summer
School card*; you can also say it: *"Badmus should be NGG, not summer"* (that
picks his record and filters nobody else). *"Exclude summer"* leaves Summer
School out — it no longer reads as "Summer School only". A name nobody has
shows the closest names on the lists, with *Use …*.

**More ways to say who.** These are read even with no AI key (the studio's own rules):
- *"The volunteers from Ijaiye and Ikorodu"* — several centres at once; each shows as its own chip.
- *"Print 026-001 to 026-040"* — the forty in that block, and only 2026's (025-007 stays off). *"Cards 40 to 80"* without a prefix is every year's.
- *"The last 20 members who joined"* — the twenty most recent, not the first twenty on the list. (*"The last 7 days"* is still a date.)
- *"Everyone at Yaba except those already printed"*, *"who still needs a card in Ikorodu?"* — the people still waiting for a card.
- *"Without a photo"* / *"only the ones with photos"* — a photo filter. *"…without a photo, ask them for one"* opens the photo request for exactly them.
- *"Volunteers and members together, one sheet per centre"* — both lists, each centre on its own sheet. *"Print the backs too"* turns the backs on.
- *"Ada Okafor's card"* means Ada Okafor; a two-word centre (*Yaba Hub*) is never read as a person.

**Photo work in words, and photos in the chat.**
- *"Improve the photos, remove their backgrounds"* opens **Improve photos** for
  the people in that request (or the plan on screen) with *Plain grey
  background* already on; you check the count and press Improve. Several acts
  in one request run in order (*"…and ask the ones with no photo for theirs"*
  then opens the photo request for just those people, not everyone waiting).
- *"Help position the image"* opens the framing tool for the one card in
  question, or lists the cards with *Position photo* / *Edit photo* buttons.
- **The framing tool shows the photo as each card prints it** (fixed
  2026-10-28). It used to preview a portrait box labelled "Member card" that no
  card has, and called the volunteer card's box "Summer School". Now the
  person's own card comes first, outlined and marked *prints on this*:
  - a member card's wide photo, full bleed across the top (54 × 37.8 mm);
  - a Summer School card's circle;
  - a volunteer card's landscape box.

  If that card type has a design assigned, the preview uses that design's
  photo box instead. The other card types follow, each under its own name,
  because one photograph can be on more than one card.
- **📎 in the assistant** adds photos. Name each file after the person or
  their ID (*Ada Obi.jpg*, *026-014.png*) and it matches them; one photo with
  one card picked needs no name. Anyone not matched is chosen from a list (or
  searched). *Save* checks each like any headshot and replaces the photo on
  their record, with a verdict per photo; *Put them on the sheet* follows.
  Saving photos needs the **Content** permission.

**Which AI.** Say *"use Gemini"* (or Groq, Claude, OpenAI) to choose which
reads your requests, *"which AI?"* to see what is set up, or *"use the rules"*
for none. A provider that isn't set up is said so, and another reads it. If
the AI is slow the studio's rules answer on their own after about 20 seconds,
so a request never just times out.

**Make cards.** The left column is everyone who needs a card: **New** (never
printed), **Reprints** (asked for again), **Blocked** (no photo yet — press
*Ask for photo*, or *Ask everyone blocked*).

**The studio keeps your work, and keeps up.** The sheet, its settings, the
filters and any uploaded images are kept on this computer: close the tab or
refresh, and the sheet is as you left it (the studio says so). The records
themselves are always read fresh. A change made anywhere else — a photo
added in the Control Room, a reprint asked for in another tab, a card printed
on another computer — shows in the studio on its own: soon after a change in
another tab of the same browser, when you come back to the studio, and once
a minute while it is open. It never refreshes in the middle of a print. If a
card on your sheet was printed elsewhere in the meantime, the checks say so
and offer to take it off, so nobody gets a second card by accident.

**When an email can't be sent.** A photo request says what actually went. If
the person has an email but the site's mail failed to send it, the studio
says *"The email couldn't be sent"* and points you at the mail settings —
it no longer says "no email on file" for someone who has one, and a request
is only "all sent" when it all went.

**Photo requests, for one person or two thousand.** One press asks everyone you chose (up to 2,000).
- **Before anything goes**, the confirm shows how each person is reached: members by email and in the app, their parents or guardians by email (each greeted by name), volunteers by email, and Summer School parents with their re-shoot link. It names anyone with no email or guardian on file, who must be asked in person, and says who is left out and why. Open *What they get* to read the exact words.
- **Each message is written to one person**: their name, their card, their centre, how to take a photo that passes, and a button that opens the photo page for exactly them. Nobody has to find Edit profile or reply to an email. The link works for 21 days; the photo is checked like any other.
- **Big requests go out in batches.** The first 25 go at once and the rest over the next few minutes, so nothing piles up. The admins for those centres get **one** summary when it has all gone: counts by centre and who could not be reached, never a list of a thousand names.
- **Afterwards**, ask the assistant *"how is the photo request going?"*: photos in, still waiting, and who could not be reached. You can send **one reminder** from two days after the request, to those who were reached and still have no photo. *"Download the list of who has no photo"* gives a spreadsheet.
- The row says when they were asked; asking again within 3 days needs *Ask again*.

A member printed for the first time is given their ID number when you
print — it is theirs for good and never reissued. Tick
people, or *Add N to the sheet*. The middle is the sheet exactly as it will
print. Pick what you are doing at the top — *New intake*, *Reprints*, *One
person*, *Made elsewhere* (upload finished card images; files named
"…-front" and "…-back" pair up on their own) or *Proof* (150 dpi, watermarked,
nobody is marked as printed). The right column sets card size, paper,
margins, order, backs and cut marks, and lists anything that would spoil the
run. Red items must be fixed before *Print* works.

**Printing.** *Print* makes a **PDF of the sheet** and downloads it; it never
opens the browser's print dialog. Open the PDF and print it at **Actual size
(100%)**, not "fit to page" — the footer of every sheet says so, and which
way to flip it for double-sided. The studio starts drawing the cards as soon
as they are on the sheet (under the Print button: *Preparing in the
background · 12 of 30*, then *Print-ready*), so pressing Print usually takes
under a second. The confirm lets you print everything, in batches (so a paper
jam costs one batch, one PDF each), or only some sheets (to redo the ones
that jammed). *Print an alignment test* downloads a PDF of numbered slot
outlines: print it first on a new printer and measure it with a ruler. After
each run the studio asks which cards came out badly; tap them and they go
straight back on the sheet as reprints, and the run in the log shows them as
not printed.

**Double-sided: long edge or short edge.** Choose the flip your printer
does. *Long edge* (most printers) mirrors the backs left to right and they
come out upright. *Short edge* puts each back in the opposite row and
**upside down on the PDF** — that is correct: the printer turns the sheet top
to bottom, and the back lands the right way up behind its front.

**Improve photos.** *Improve photos* (above the sheet) applies one Cloudinary
edit to everybody photographed on the sheet: focus on the face, centre, top
or bottom, zoom, brighten, sharpen, and an optional plain grey background
(that one uses Cloudinary credits, and is refused up front when they are
used up). Nothing is generated — faces are reframed and adjusted, never
redrawn. A photo stored on this site is uploaded to Cloudinary first. The
result says how many were improved, how many already looked like that, and
who could not be done and why; the cards on the sheet then redraw. It needs
the **Content** permission and Cloudinary's keys in `api/config.php`. One
person's photo is still edited with *Edit photo* on their card — members
included now.

**Print log** and **Look up a person** are tabs in the studio too: every run
with the design it used, and every card ever issued to one printed ID.

A member with no printed ID assigned still prints, falling back to their
internal member id rather than a blank — but the studio and the Design
Studio's batch list both **flag** it, and the member roster's **Missing:
printed ID** filter is the list of exactly those people. Fix the record
before laminating.

**People → ID cards** is the record of both. Two tabs:

- **Print log** — every run, filterable by who it was for and whether it was
  a print, a reprint or a proof.
- **One person's cards** — look somebody up and see every card ever issued
  to them, newest first, with a clear answer to *"is the card in their hand
  current?"*

### What a run records

Every run stores the design **and the exact published version** of it that
was used. That is what makes "reprint that batch as it was in July"
answerable. The version is read from the template itself, not from whatever
the printing screen thought it was.

A run is marked a **reprint** automatically when every card in it had been
issued before. Reprint reasons: **lost**, **damaged**, **details changed**,
**never received**, **other**.

A run covers up to **600** cards.

### Designing a card

In the Design Studio:

1. Pick a **kind** — member, student (Summer School) or volunteer — and a
   **side**: *One-sided*, *Front* or *Back*. A front can be paired with a
   back so the two print together.
2. Draw. Every tool has a keyboard route; the studio prints its keyboard
   contract on screen, and nothing needs a mouse drag to be reachable.
3. **Bind** fields. `{{name}}`, `{{displayId}}` and the rest are filled from
   the real record at print time. The list of available fields is on screen.
4. **Preview** against a real person, not a placeholder.
5. **Publish**. Publishing records a version. The draft you keep editing and
   the published design people print from are separate — editing a draft does
   not change what is being printed until you publish again.

### Preflight

Before it lets you publish, the studio checks things that produce a card
that is wrong in the hand:

- **Required fields per kind.** A member card must show a name and a printed
  ID. A card **back** is exempt — a back with no name on it is normal.
- **Contrast.** Text below 4.5:1 against its background is a warning; below
  3:1 is an error. A caption nobody can read on a printed card is not a
  design choice.
- **QR size.** A QR code below the minimum module size in millimetres will
  not scan off a card, and is flagged in millimetres, not pixels.

The server checks the same things again when you publish, so the check
cannot be skipped by a stale page.

### Printing

Rendering happens **in your browser** — the designer canvas, the roster
preview and the 300-DPI print export are the same renderer at three
different scales, so what you see is what prints. Give a large batch time
and do not close the tab.

Member cards can also be printed straight from **Members → Print IDs**,
which uses your current filters. The batch drawer counts how many of the
selection have no photograph, no printed ID and no discipline, and each
count links to the roster showing exactly those people so you can fix them
before printing.

---

### When a card needs reprinting

The studio puts somebody back in the queue on its own when the card in their hand no longer matches their record:

- their photo was replaced
- their name was corrected
- their printed ID changed
- their QR was reissued, so the old card no longer opens

A newer card design alone does not. A card in last year's design is still a good card. Use **Look up a person** to see why, and to queue a reprint on purpose.

Choose the reason when you queue one:

- **Lost** and **Never received**: the new card gets a new QR, and the lost card stops working at the gate.
- **Damaged** and **Details changed**: the person keeps the same QR.

Logging a print closes the requests it satisfied. A proof closes nothing.

### Replacing a photo

A replaced or edited photo replaces the old one. The old file is deleted at once and older versions keep no picture. The only exception is when another person's record still uses the same file; then it stays until that changes.

### When a member asks to change their photo

Members cannot change their own photo. It is the face on their printed ID, so they **ask**. On their profile they choose the photo they want, add a reason, and send it. Their photo stays as it is until someone decides.

The ask arrives in **Inbox → Photos** as **Photo change** (needs the `content` capability; a centre-scoped desk sees only its centres). It shows the photo **Now** beside the one **Asked for**.

- **Approve** puts it on their profile and on the next card printed. A card already printed is not reissued.
- **Decline** needs a reason, because they see it. Their photo stays.

Either way the member gets a notice. Only one ask per person waits: a newer one replaces the older. The member can **Withdraw** an ask while it waits.

A reshoot that staff asked for (a guardian's retake link) is still applied directly, because staff asked for it.

## Quote of the week

**Content → Quote of the week** (needs the `content` capability). The home page
shows one saying a week, taking turns by language: **Hausa 1, Igbo 1, Yorùbá 1,
then Hausa 2, Igbo 2, Yorùbá 2**, and so on. The number beside each saying in a
language's list is its turn. The strip at the top shows the next nine weeks as
"Hausa #1", "Igbo #1"… A language with nothing live sits out until it has one,
and the same language never shows two weeks running.

**When it changes:** once a week, at **midnight at the end of Sunday (00:00
Monday, Lagos time)**, and never in between. Once a week's saying has been
shown it is **locked for that week**: adding, hiding or reordering sayings
changes the weeks to come (the strip is a forecast), never the one already on
the home page, in the Journals and in Monday's email. If the locked saying is
hidden or deleted, the week picks again.

- **Add / edit** — the saying in its language, the English translation, the
  answer (riddles only) and the deeper meaning. *Hidden* keeps a saying but
  takes it out of the rotation.
- **↑ / ↓** — change a saying's turn within its language.

### Voices

Each saying is read aloud on the home page in two parts: **the saying in its
own language, a short pause, then the English translation**. Visitors can turn
the English part off ("English too").

- **Generated once, then saved.** With a Spitch key set (`'tts' → 'spitch_key'`
  in `api/config.php`), saving a saying voices it. Each clip is made **once**
  and kept: pressing Generate again, re-saving, or even deleting and re-adding
  the same words in the same voice reuses the saved clip and costs nothing.
  **Voice everything missing** fills gaps (40 per press). If this week's saying
  has no clip when the home page first asks, it is voiced then — once; if that
  fails it is not retried by visitors, press Generate.
- **Pronunciation check.** Every new clip is played back to the voice service's
  own speech recogniser in the same language and compared with the words. The
  score shows beside the clip. If a voice stumbles, the next native voice for
  that language is tried automatically and the best is kept. A red score means
  listen to it — record a voice-over if it is wrong.
- **How it should be read** (in the edit form) — the same words with their full
  tone marks, when the saying is written without them. Only the voice uses it;
  the page shows the saying as written. This is the biggest single help to Igbo
  and Yorùbá pronunciation.
- **Default voices** — pick the voice for each language and for the English
  part. Regenerate a saying to hear a new choice.
- **A person's voice-over** — **Record** or **Upload** on a saying. It always
  wins over a generated voice and is never replaced without asking.
- **Cloned voices** — *Clone a voice from a recording*: a native speaker
  records 10–30 seconds and you type exactly what they said. You must tick that
  they agreed. Their voice then appears in every voice list.
- Yorùbá is tone-marked by the voice service before it is read. Igbo and
  Hausa are not — give them a "How it should be read" spelling if needed.
- Changing a saying's words remakes its generated voice; changing only the
  translation remakes only the English part.

### One quote, everywhere, and the Monday email

The quote on the home page **is** the quote in every member's Anchor Journal
for the week (the Journal's card now reads "Quote of the week", and changes at
midnight at the end of Sunday, not daily) and the quote in the Monday email. When no saying is live,
all three fall back to the same week's Anchor quote from **Anchor app →
Quotes**.

Every active NGG member gets the email once a week; each has a one-click
"Stop these quote emails" link. **Settings → Email NGG members the Quote of
the Week** turns the email off for everyone.

## Free messages on Telegram

Telegram messages cost nothing, on Android **and** iPhone. Once somebody
connects, every text the site would send their number — sign-in codes,
check-in alerts, guardian notices, volunteer IDs — goes to their Telegram
instead. If Telegram can't reach them, the SMS goes as before, so nothing is
ever lost.

**Setting it up (once, about five minutes):**

1. In Telegram, open **@BotFather**, send `/newbot`, and pick a name (e.g.
   *NGG Messages*) and a username ending in `bot` (e.g. `NGGMessagesBot`).
2. Copy the token BotFather gives you into Control Room → Settings → API keys
   → **Telegram**, and press **Test**. Test checks the token and connects the
   bot to this site. The site must be on `https://`.

**How people connect:** share **yoursite/telegram** (it has a button and a QR
code) in parents' WhatsApp groups, on the noticeboard, or in a newsletter.
Families also see it under *Emails & connection* in their family account.
They open the bot, press **Start**, then **Share my phone number**. That's all.
Telegram only lets them share their *own* number, so nobody can redirect
somebody else's messages. They should use the number on their NGG record (or
their child's record, for a guardian). `/stop` in the chat goes back to SMS;
`/status` shows what is connected.

## Text messages: the free way

Control Room → Settings → API keys → **SMS Gateway for Android (free)**. It is
open-source software (sms-gate.app): install the app on the programme's own
Android phone, turn on **Cloud Server**, and paste the username and password
the app shows. There is no monthly fee and no message cap, unlike textbee's
300 a month on its free plan.

**It does use the phone's airtime.** Every text message costs what the SIM's
carrier charges, whichever app sends it; only the software and the relay are
free. Put an SMS bundle on that SIM (it is far cheaper than paying per text),
keep the phone charged, on Wi-Fi or data, and with battery saving off for the
app. Nigerian numbers go to this phone first, then textbee, Termii and Twilio
if they are set. Email and in-app alerts cost nothing and are always sent too.

## File storage (any S3-compatible bucket)

When Cloudinary's plan runs low, give the site a **storage bucket** instead.
Once one is set in Control Room → Settings → **API keys → File storage**, every
new upload (headshots, avatars, covers, proofs, hand-ins, community posts, school
reports) goes to the bucket. **Nothing already on Cloudinary moves or breaks**:
those photos keep showing from where they are.

- **Which one.** **Cloudflare R2** is the recommendation: 10 GB free, and you
  never pay for people viewing files (Cloudinary counts every view). **Backblaze
  B2** works the same way (10 GB free, then about $6 per TB a month). Amazon S3,
  Wasabi, DigitalOcean Spaces, Supabase Storage, IDrive e2 and any other
  S3-compatible store work too.
- **Setting it up.** Press **Set up** on the File storage row and pick your
  provider: the guide shows its steps in order, what the endpoint, region and
  public address look like, and a button that copies the one rule the bucket
  needs (CORS) so browsers may upload to it — for Backblaze B2, whose website
  cannot set that rule, it copies the B2 command instead. **Connect** opens the
  form for that provider. It takes the endpoint, the bucket name, an access key
  and its secret, and the bucket's **public address**. IDrive e2, other
  providers and custom domains also need one line added to the site's
  `.htaccess` (the guide says so; `docs/SETUP.md → File storage` has it).
- **Test** writes a small file, reads it back from the public address, and
  deletes it. If it fails it says which part: the keys, the bucket name, or a
  bucket that is not public.
- **Diagnostics** shows *File storage: new uploads go to the bucket* once it is
  working. Cloudinary's usage warnings then stop pausing uploads.
- **What a bucket does not do.** It stores files; it does not edit them. Images
  are shrunk in the browser before they are sent, and the face-aware photo
  framing still works (it is done by the AI framer). Cloudinary's one-click
  photo edits only apply to photos still held on Cloudinary.
- **Safety.** The browser is given a link that uploads **one** file, of **one**
  type and **one** exact size, for 15 minutes. It cannot overwrite anyone else's
  file. Web pages, SVGs and scripts are refused. The secret key never leaves the
  server.
- **Replacing a photo** deletes the old one from the bucket, unless another
  record still uses it.

### How the bucket saves space without losing quality

- **The same file is stored once.** When somebody uploads a photo or a PDF the
  bucket already holds (a picture shared by five people, a worksheet handed in
  by a whole class), nothing is uploaded: the stored copy is used. The site
  checks this by reading the stored file back itself, so nobody can trick it
  into handing out a different file.
- **Hidden photo data is removed, not the picture.** A phone photo carries
  camera details and often the GPS position where it was taken. That is
  stripped from every community photo and hand-in; the picture itself is kept
  byte for byte.
- **Large photos are stored as WebP** when that is smaller than JPEG at the same
  quality setting — usually a quarter to a third fewer bytes for the same
  picture. Headshots stay JPEG for printing.
- **Unused files are deleted.** A photo picked and then abandoned, a deleted
  post, a replaced hand-in: once nothing on any record has used a file for a
  week, it is removed from the bucket overnight. Diagnostics → *Files in the
  bucket* shows what is stored, what was saved, the largest files, and a
  **Clean up now** button.

## Image storage (Cloudinary)

**More than one Cloudinary account.** One free plan holds about fifty people's
photos a month. Control Room → Settings → **Diagnostics** → *Cloudinary
accounts* lists the main account (the keys in Settings → API keys) and any you
add with **Add an account…** — a free account signed up with another email
address adds its own credits and storage. You need its cloud name, API key and
API secret (Cloudinary console → Settings → API Keys); the keys are **checked
with Cloudinary before they are kept**, and the secret is never shown again.

- **Uploads go to the first account, in the order shown, that has room.** When
  one passes 85% (or is full), new uploads move to the next by themselves, on
  the next usage reading; when a plan resets or is upgraded it takes uploads
  back. The list says where uploads go now.
- **Photos already uploaded stay where they are and keep showing** — an image
  link names its own account and needs no key. Removing an account from the
  list only stops uploading to it, reading its usage and deleting from it; the
  screen says how many photos on record still show from it.
- Open an account to **check its usage now**, **move it up or down** (the main
  account is always first), **pause** uploads to it, change its name or keys,
  or remove it. Every change is recorded in the audit log (never a key).
- Alerts name the account: "Cloudinary (Second plan) is full — new uploads now
  go to Third plan". Only when every account is full are uploads paused.
- **Free space…** frees the resized copies on every account.

Photos and uploads are kept on **Cloudinary**, whose plan has a limit (credits,
shared between storage, bandwidth — every time a page shows an image — and
transformations). The site watches it for you:

- **Checked every six hours.** Control Room → Settings → **Diagnostics** →
  *Image storage* shows how much of the plan is used, part by part, and when it
  was last checked. **Check now** reads it at once.
- **You are told as it climbs**: at 70%, 85% and 95% the admissions inbox and
  everyone with the `settings` permission get an email and an app alert, once
  per level. At 85% and above it also appears first in **Home → Needs you**.
- **What happens as it fills**: from 85% the paid AI photo edits stop. At 95%
  (or when Cloudinary starts refusing work) **new uploads are paused** so the
  account is not tipped over: photos are kept on the site's own storage
  instead, and other uploads say why they can't go. Nothing already stored is
  touched.
- **Less is stored per upload**: every image (headshots, avatars, covers,
  proofs, submissions, community posts) is resized and compressed by Cloudinary
  *before* it is stored, so a 6 MB phone photo is kept at a fraction of that.
  Documents and videos are not re-encoded.
- **Free space…** (Diagnostics) deletes the resized copies Cloudinary made for
  each page — every original is kept, and a copy is remade when a page next
  needs it. Type FREE SPACE to confirm. If storage is still high afterwards,
  the plan itself needs upgrading on cloudinary.com. It **refuses** while any
  record still shows a photo as an edit with its background removed: deleting
  those copies would make Cloudinary remove every background again (75
  transformations each). Store them as plain images first (below).
- **Where the credits went, and what changed.** A background removal costs
  Cloudinary 75 transformations, and it used to run again for every card size,
  crop and image format built from the edited photo — about 450–600 per person,
  which is why the free plan ran out at roughly fifty people a month. Now:
  - an approved or edited photo is **stored once as a plain image** as it
    looks (the edit is kept on record), so every later size costs one
    transformation, not 76;
  - **Store edited photos…** (Diagnostics) converts the photos already on
    records, 50 a press, counting first;
  - card photos are delivered in one format (JPEG) instead of one per browser;
  - community images come in four widths instead of twelve, resized after any
    edit (a tiny avatar no longer re-runs the edit), and a video is delivered
    as the one version made at upload instead of being transcoded twice.
  Headshot uploads are deliberately **not** de-duplicated: they come through a
  page that needs no sign-in, and telling a stranger "this exact photo is
  already stored" would let anyone test for a child's picture.

## Settings and connected services

Settings (Control Room → Settings) is split by what a setting changes:

- **General** — whether sign-ups are open, the messages the programme sends,
  volunteer hours, the featured session, how long staff stay signed in, and
  the homepage banner.
- **Attendance** — when somebody counts as late, the grace period, and the
  closing time before which nobody can sign out.
- **Card branding** — what is printed on Summer School cards and digital IDs.
  Layouts and printing are in the ID Card Studio.
- **API keys** — every outside service, one card each.

### API keys

Each card says whether the service is **Connected** (a key entered here),
**Connected · config.php** (a key in the server's config file), **Incomplete**
or **Not set**, what it powers, and where to get a key ("Get a key"). Add,
Change, Test and Remove act on that one service.

- A key typed here is **encrypted on the server** and never shown again — the
  card shows only its last four characters. To change one, paste the new key;
  a blank field keeps what is saved.
- A key entered here is used **instead of** the one in `api/config.php`.
  Remove it and the file's key is used again.
- **Test** sends one small real request. A key that is set but refused looks
  exactly like a working one until you do.
- **Paystack** takes money, so its keys follow the bank-account rule: once a
  secret key is in use, a change is a *proposal*, every member of staff with
  Fees is emailed, and it applies only when a second person with Fees and
  Settings confirms it by pasting the same key from the Paystack dashboard.
- **Gemini** keys from Google AI Studio now start `AQ.`; older ones start
  `AIza`. Both work. Leave the model blank: the key uses the newest Gemini
  model Google lets it use, and moves on by itself when one is retired.

### Make.com

Make.com is set up from **Settings → Integrations → Make.com**: work down the three numbered steps — signing key, Make's webhook
(then **Send test**), the scheduler address. Each key is shown once, on the
panel, until you press **I've copied it**; afterwards only how it ends.
The scheduler address is ONE address that runs every background job that is
due. Best, put it in the CACENTRE gate as the secret `NGG_CRON_URL` (Cloudflare
→ the gate worker → Settings → Variables and Secrets): the gate calls it every
minute and visitors' pages then do no background work. Otherwise one Make
scenario or a cPanel cron, every minute. Older one-per-job addresses
(`&job=…`) still work.
The scenarios to build in Make are listed under the steps, each saying which
step it still needs, with its build steps and an example to copy. Replacing a
key stops the old one at once. **Turn off** refuses Make's calls and pauses its
events; making a new signing key turns both back on. The scenarios themselves
are in `docs/make.md`.

Once it runs, three things show up in the Control Room:

- guardians' answers about absences, beside each absence on the Conduct tab;
- on the Behaviour monitor, who acknowledged a safeguarding flag, when, and
  through what — the escalation stops as soon as somebody does, or as soon as
  the log is marked reviewed here;
- nothing else. Make never consents for a parent, never voids an absence and
  never issues or lifts a sanction.

The **Photo framing** keys (two Gemini keys: one measures every headshot, the
other checks photos and backs it up) and the table of which provider answers
each AI feature are on the same page.

## How bulk actions behave

Every bulk action in the Control Room goes through the same machinery, so
they all behave the same way. Worth knowing once:

- **The count in the confirm is the count that runs.** It is read before you
  are asked, so a list refreshing underneath you cannot change what you
  agreed to.
- **A run reports per row.** "38 of 40 done, 2 refused" is a normal outcome,
  not an error. You are told which two and why.
- **A run that half-worked is never reported as a success.** The per-row
  verdicts win over any overall status.
- **Selection is capped** — 500 rows for member and Club actions, 500 for
  group assignment, 200 for Club promotion, 600 cards for a print run. If
  you select more, you are told the cap rather than getting a partial run
  with no explanation.
- **Your own account is always refused.** A bulk suspend over a filter that
  happens to include you would be a lockout, and the button that does it
  looks like every other button.
- **Staff accounts cannot be suspended, deactivated or deleted through the
  member roster.** The roster's filters cannot tell an admin from a child.
  Staff lifecycle is in **System → Access & roles**, where the
  last-super-admin rule lives.
- **Actions you have no permission for are not shown.** The bar is built
  from your capabilities, and the server checks again on arrival.
- **Individual and bulk are the same action.** The row menu and the bulk bar
  are generated from one declaration, so they cannot drift into doing
  different things, asking differently, or being permitted differently.
- **Selecting past the page**: "Select all N matching the filter" selects the
  filter, not the page.
- **Unchanged rows are reported as unchanged**, not as changed. Setting
  forty people to a status thirty already had says so.

---

## Searching and filtering

- Search boxes match **partially**, ignore case, and take **every word in
  any order**: "bello amina" finds Amina Bello, and "amina egbeda" narrows
  rather than finding nothing. A trailing space (which a phone keyboard adds)
  changes nothing.
- The member roster, the Club roster, the Summer roster, the registration
  desk, the fees lookup and the security desk all find a person by the
  **printed ID on their card** (026-014, EG-26-001) as well as by name, the
  internal ID and email. Where there is a phone on file, a number is found
  however it was written: "0803 111 2222" finds "+2348031112222".
- A search that fails says so, keeps what you typed, and offers **Try
  again** — it never shows an empty list as if nobody matched. In the
  Control Room's tables the search box stays put while results load.
- A centre lead's searches look only in their centres, and the whole search
  runs inside them, so a match is never hidden behind other centres' rows.
- The **public** Summer School page's search ignores accents as well as case,
  so "Iwaya" finds "Ìwàyà" — worth knowing when a family says they cannot
  find their centre.
- Filters combine — centre **and** status **and** level.
- **Clear all filters** is next to the filter row. Use it when a screen
  looks empty for no reason; the usual cause is a filter left set from
  earlier.
- Filters are **not** in the address bar. A Control Room section is in-app
  state, so you cannot bookmark a filtered roster or send someone a link to
  one — describe the filters instead, or export the CSV and send that.
- A filter or sort column that no longer exists is **ignored**, not an error:
  an out-of-date link shows you the roster rather than a failure.

---

## Signing in, and two-step sign-in

### The first screen is the same for everyone

On a phone or computer that has not signed in here before, every email or ID
gets the same next screen: a password box, and **No password? Email me a
sign-in code** under it. That is deliberate. The screen used to skip straight
to "code sent" for people without a password and go to the password box for
staff, which told anyone who typed an address whether it belonged to a member
of staff. Most members simply press the code button. A device somebody has
signed in on before is told what applies, a few times a day.

A wrong password and "this account has no password" give the same message.
Asking for a code for a staff account looks like any other request, but no
code is sent: that inbox gets a note saying staff sign in with a password.
Signing out only works from the app's own button, not from a link or an
image somebody posts.

### One email on several accounts

Brothers and sisters on a parent's address, a family inbox: one email can be on
several member accounts, and that is fine. The member editor, a member changing
their own email and the roster import all accept it (the import notes "shares
its email with N other members" on the row).

- **A code or link** is emailed **once** to the address, naming who is on it
  ("Tobi and Femi"). After it is typed or tapped, the screen asks **Who's
  signing in?** with each account's name, card number and centre, and opens
  the one chosen. Nobody is signed in before the choice, and the choice is good
  for ten minutes, once. Escape or Cancel signs nobody in.
- **A password** says whose it is: one child's own password opens that child
  straight away. If the same password was set on several of the accounts, the
  same question lists those.
- **Forgot your password?** sends one email with a **Set {name}'s password**
  link for each account.
- A suspended account is never offered, and neither is a staff account that
  signs in by password only (staff keep using their password).
- Each child can always sign in with their own Member ID or card number.

### Who signs in where

- **Members** sign in with their email, Member ID or the number on their card
  (`026-014`), and a code we email them (or a password, if they set one).
- **Instructors, volunteers and mentors** use the same door. They type their
  email or the number on their Vanguard card (`VOL-INS-26-001`) and get a code
  at the address on their volunteer record. The card door (card number plus
  their own phone) still works. When their record has no phone, the card door
  says so and offers the emailed code instead.
- **A mentor who only has a mentor record** (added in Mentors, with an email
  and no member or volunteer account) can sign in with that email. The first
  time they do, they are given a volunteer record linked to their mentor
  record, so the portal and their ID card both find them.
- **Guardians** sign in on the Family page with their email and a code.
- **Staff** sign in with a password and then the Control Room's authenticator
  app, as before.

### The second step, by kind of person

Each kind of person chooses one way. The first listed is the one suggested:

| Who | Ways they may choose |
|---|---|
| Members (children and young people) | A private question · a 6-digit PIN · an authenticator app · a code by email · a code by text message |
| Instructors, volunteers and mentors | An authenticator app · a code by email · a 6-digit PIN · a code by text message |
| Guardians | A family PIN · an authenticator app · a private question · a code by text message |

**A code by text message** is offered only while a text channel is set up
(Telegram, the programme's own phone, or a paid SMS provider, under Settings →
API keys). The person types a number or uses the one on their record; it is
set only once a texted code reaches it. If they have connected Telegram, the
code goes there, free. If texts stop working later, the sign-in screen says
the text did not go through, and their backup codes still let them in.
| Staff | The Control Room authenticator (managed in **Access & roles**) |

Whatever they choose, they also get **eight one-time backup codes** when they
set it up. They show once; the person saves, prints or downloads them. A
backup code opens the portal in place of the usual step, for a lost phone or
a forgotten answer, and each works once. New codes (from "Two-step sign-in" in
the account menu) need the current step first, and replace the old ones.

The desk can narrow the list for any kind (**Policy per kind of person →
Ways they may choose**). It cannot leave a kind with no way. Taking a way
away stops new set-ups with it; people already using it keep it until they
change.

A team member who chose the emailed code is not asked for a second email after
signing in with an emailed code. That would be the same thing twice.

Anybody without a second step sees an alert at the bottom of the screen until
they add one. They can change or turn it off from the account menu ("Two-step
sign-in"), or from the palette in the Member Portal. Changing it needs the
current answer or code first. Where it is required, it cannot be turned off.

### Members › Sign-in security

- **The three cards** show how many of each kind have a second step. Click
  one to list those people.
- **Policy per kind of person** (needs Settings):
  - **Off.**
  - **Optional:** people are shown the alert.
  - **Required:** anyone without one sets it up before their portal opens.
- **Actions** on a row, or on a selection:
  - **Let in for 10 minutes**, as Google Workspace admins do (*Turn off for
    10 minutes*). For somebody who cannot sign in: a forgotten password or
    answer, a new phone, an email they cannot open. Open their row and press
    *Let in for 10 minutes*.
    - For the next 10 minutes, their sign-in needs **only their email or ID**:
      they type it, press *Continue*, and they are in. No password, no code,
      no second step. A guardian types their email on the NGG Family app.
    - It lets in **one** sign-in. The next one on that email or ID gets the
      normal door again.
    - If their second-step screen is already open, it **opens by itself**.
    - You are also shown a **one-time code**, for somebody who is not in front
      of you. Read it to them. On any sign-in screen they choose *I have a code
      from staff* and type their email or ID and the code. It works once,
      within the 10 minutes.
    - When two children share one email and both are let in at once, the
      email is ambiguous: they use the ID on their card, or the code.
    - Afterwards they are taken to **set a new second step**, without the old
      one. They are emailed (and notified) that it was done. It is in the
      audit log.
    - One person at a time, never a bulk action. Do it only with the person in
      front of you, or on the phone with them: anyone who types their email or
      ID in those minutes gets in.
  - **Reset.** Clears what they set, so they choose a new one.
  - **Require it** of one person, whatever the policy. **Back to the policy**
    undoes that.
  - **Email a reminder** to set it up. At most one every 3 days.
- **Five wrong answers** pause that person's second step for 15 minutes. A
  let-in also lifts the pause.

---

## The member portal on a phone, and for younger members

**The simple view.** Members under 13 see a simpler My NGG: five places
named in plain words (Today, My mentor, Learn, Me, Help), big buttons on
Today for the four things they do most, and Money kept out of the menu (it
is a guardian's business at that age; its page still opens from a link).
Older members see the full view. Anyone can switch in **Profile → How your
portal looks**, and the choice is theirs: it is not reset by a birthday.

**Tabs on a phone.** Inside each place, the tabs (for example Lessons,
Saturday, Timetable, Study tools) wrap onto a second line as buttons on a
narrow screen, so every one is visible. They used to scroll sideways out of
sight. The same is true in the mentor and instructor portals.

**Notifications.** The bell opens a panel of what happened, grouped Today,
Yesterday, This week and Earlier. Every item that goes somewhere has a button
that says where ("Open the chat", "See today's plan", "Open the event"); the
button opens it and marks the item read. Each item can be marked read or
unread, and dismissed (with Undo). These marks are the member's own: when one
member reads or dismisses an announcement sent to everybody, it stays unread
for everyone else (until now, the first reader marked it read for all). On a
Saturday the timetable no longer sends one alert per block: there is one
"Now · …" item, updated as the day moves on.

**Signing out.** Every portal now has its own **Sign out**: the member,
mentor and instructor portals carry it at the foot of the sidebar (the icon
next to your name). On a phone, the member portal's round initials button in
the top bar opens **More**, where Sign out sits under Get help; in the mentor
and instructor portals it is at the bottom of **More**. Signing out on a
shared centre computer also clears any half-written community post.

**Passwords, from inside the portal.** Me → **Sign-in and password** (also
"Change my password" in the search box, and a button in Edit profile). It
says whether the member has a password. **Change password** asks for the one
they use now, then the new one, and they stay signed in; five wrong tries lock
it for 15 minutes. A member who has forgotten it presses **Forgot it? Email me
a code**: a 6-digit code goes to the email on their record (or their
guardian's), and they set the new password with it without leaving the
portal. Nobody needs to sign out, and nobody at the desk needs to reset it.

**Ideas and feedback.** Help → **Share an idea** (also in the search box,
and on My mentor → Community). A member picks *How NGG is going for me*,
*An activity idea*, *Something NGG should change*, *Something I love* or
*Something in the portal isn't working*. "How NGG is going" is a rating from
*Not good* to *Great* (words are optional); the others need at least six
characters. Any of them may be sent **without their name**. A rating of *Not
good* or *Not great* reaches the desk titled as somebody to talk to, not as a
suggestion. Ideas are their own kind
of request, so a child with ideas waiting can still ask for help. "Something
feels wrong?" is not an idea: the sheet sends it to Help, where it goes to
safeguarding.

In the Control Room, ideas arrive in **Inbox → Member requests** as *Idea or
feedback*. They are not approved or declined:

- **Thank and close** closes it with your reply, or a plain thank-you if you
  write none. The member is told — unless they sent it without a name, in
  which case the thank-you reaches nobody, and the inbox says so.
- **Pass to centre lead** sends it, with your note, to whoever holds the
  centre lead role for that centre, and leaves it open marked *Passed*. If no
  one holds that role there, it says so.

An idea sent without a name keeps only its centre, so it is seen by the staff
of that centre (and by unscoped admins), never by another centre's.

**The Mentor screen is a messaging screen.** The conversation fills the
height of the screen, scrolls on its own, opens on the newest message, and
keeps the message box at the bottom. Messages are grouped by day ("Today",
"Yesterday") and by sender, with the mentor's initials beside theirs. On a
computer a side panel shows the mentor, who else is helping, links to
Prepare for Saturday / Next steps / How it's going, and what was agreed; on a
phone the conversation takes the screen and the next session is one line at
the top. The message box grows as you type (Enter sends, Shift+Enter starts a
new line).

**Community on a phone** has one navigation: the Community's own header, menu and tab bar. The menu has **My NGG** and **NGG website** to leave. Scroll past the post box at the top and a slim **Share something…** bar appears at the bottom; tap it to write.

**Messages on a phone** keep only what is needed: the next session is one row (tap it to prepare), quick replies appear only when there is a message to answer, and the safety note is one line.

**Every portal on a touch screen.** On a phone or tablet every button, tab,
filter chip and drop-down in the member, mentor, instructor, family, Club,
Summer School, Community and Learn portals is at least a fingertip tall (44
points), and every text box uses 16-point text, so an iPhone no longer zooms
the page into a field and leaves it zoomed. Long names wrap instead of being
cut off: the mentor's Mentees and Class lists put a child's status and buttons
under the name, and a lesson's state sits under its title in My course.

- On a phone the bottom bar holds Home, Roster, Timetable, Check-ins and More.
- **Every Club tool works on a phone.** Applications, Families, ID cards,
  Conduct & fines, Curriculum, Tournaments, Volunteers, Staff activity and the
  Wi-Fi regions and setup used to show as greyed-out "Computer" rows under
  More. Each now opens on the phone as a list: tap a row for its detail and
  decisions, and the list's own action (Add a rule, Add a course, Add a shift,
  Open a desk …) is the black button at the top. Tournaments has its own phone
  screens for hosting one, adding players and entering results. A loading bar
  or an error with **Try again** now shows on the phone too.
 instead of wrapping onto a second
line: the Mentor, Companion and area tabs (My mentor / Companion / Community)
in all three portals, the mentor portal's Saturday tabs, the quick replies, and
the Control Room's tab rows. A fade at the edge shows there is more to swipe
to, and the chosen tab is scrolled into view.

**Messages between a member and their mentor.** The Mentor screen refreshes
by itself every 30 seconds while it is open (and when the member comes back
to the tab), so a reply appears without reloading. Each of the member's own
messages says **Sent** or **Seen**. A reply to a check-in or a journal entry
is labelled as one. Quick replies ("Thank you!", "Can we talk on Saturday?")
start the message in the box; they never send it on their own. "I need help
with something" opens Help, not just a message to the mentor. After 8pm the
box says the message is kept and the mentor will see it in the morning.

**Voice notes and reading aloud.** A member can record a voice note (up to
two minutes, small enough for mobile data) in the message box, listen to it,
then send it; the mentor plays it in their inbox. The Anchor Journal records
voice notes too. Mentor messages, the journal prompt, a lesson and a journal
entry each have **Read aloud**, using the phone's own voices (it works
offline). A voice note on its own has no words for the safeguarding check to
read: the words "Voice note (0:42)" are what it carries, so a mentor should
listen to one within the usual reply window.

**The Anchor Journal and the portal are one journal.** The desktop sidebar
has **Your apps → Anchor Journal / Community**; Today has **Write today's
reflection**; the simple view has a **My journal** tile. All open in the same
tab, and the journal has a **My NGG** link back. In the journal, **Share
with [mentor]** (off by default) shares that entry with the mentor, who is
told; their reply shows under the entry in the journal and on the portal's
Journal screen, which lists recent entries as Private or Shared.

**Me → Profile** shows the whole record: name, NGG ID, date of birth, centre,
course, class, school, when they joined, email, phone, guardian and guardian
phone. **Edit profile** changes the photo and bio; everything else is asked
for through **Ask for a change**.

**Getting started (Today).** A new member sees up to five first steps, each
read from their record, never a box they tick: add a photo, say hello to
their mentor (or "your centre will match you" while they have none), write a
first reflection, answer the week's check-in, link a parent or guardian with
the Anchor Circle code (their mentor is connected for them). Each has one button. The card disappears when all
are done, and a member can hide it (Help → Show "Getting started" brings it
back). Help also has **Take the tour again**.

**Tours that know the device.** Every portal's first-visit tour is written for
the device it opens on. On a phone it talks about the bar at the bottom and
shows, in the phone's own words (iPhone or Android), how to put NGG on the
home screen; on a computer it talks about the list on the left (and, in the
Control Room, ⌘K). A step about a control **lights it up on the real page**,
with the card moved out of its way; a step about another screen shows a
**screenshot** of it, taken from the real portal on a phone and on a computer
(`node tools/guide-shots.js` retakes them after a layout change). Somebody who
took the tour on a phone and later signs in on a computer (or the other way
round) gets a **short tour of what is different there**, once. The children's
tour (My NGG) reads bigger and ends on the Getting started list.

**Supporting mentors.** A member has one mentor, plus at most **two**
supporting mentors, each for one thing (Coding, Exams) and optionally until a
date. Add them in the member's record → Mentor → **Add a supporting mentor**;
tap one to end it. Rules: the member must have a main mentor first; the main
mentor cannot also be a supporter; a peer mentor never supports another child;
an end date passes on its own. A supporting mentor writes in the child's one
conversation, which the main mentor always sees, and gets nothing else of the
child's: wellbeing, scores and family details stay with the main mentor, as do
the relationship checks and alerts. Making a supporter the main mentor ends
their supporting role. The child sees "Also helping you: … · Coding".

## Things that go wrong, and what they mean

| What you see | What it means | What to do |
|---|---|---|
| A section is missing from the sidebar | You do not have its capability | Ask a super admin; check **Access & roles** |
| "Nobody holds the centre lead role for …" when passing an idea | That centre has no centre lead account | Thank it yourself, or give someone the Centre lead role in **Access & roles** |
| "Give them a mentor first" / "At most 2 supporting mentors" | A supporting mentor needs a main mentor, and there is a limit of two | Assign the main mentor, or end a supporting one |
| "Out of scope" on a bulk run | Those rows are at centres you are not scoped to | Have someone unscoped do it, or get your scope widened |
| "Centre in use" when deleting a centre | Members, participants, groups or volunteers still point at it | **Retire** it instead |
| "Group not empty" when deleting a group | It still has participants | Reassign them, or unassign them explicitly |
| "Destination full" when reassigning | The group you are moving people into has no room | Raise its capacity or pick another |
| "Capacity below enrolled" | You lowered a cap under the number already in the group | Move people out first |
| "Cross edition" on an assignment | The participant and the group are in different editions | Groups only take participants from their own edition |
| "Edition immutable" | You tried to move an existing group to another edition | Create the group in the right edition instead |
| "Use archive op" when setting a status | Archiving is a separate, deliberate action | Use the archive action |
| "Own account" refused | You were in your own bulk selection | Untick yourself |
| "Staff account" refused | A staff record was in a member-roster lifecycle action | Do it in **Access & roles** |
| "Too many" | Your selection is over the cap for that action | Do it in batches; the message names the cap |
| A group report shows no attendance rate | Nothing has been measured over that group's dates yet | Not an error. It is not 0% |
| A card prints with a blank face | No approved photograph | Filter the roster by **Missing: photo**; approve in **Photo review** |
| A card shows the wrong details | It was printed from an older published version | Check **ID cards → One person's cards**; reprint |
| A card's QR will not scan | Flagged at publish time if the modules are too small | Fix the QR size in the Design Studio and republish |
| "Backup code used — N left" | You signed in with a backup code, not your app | Re-enrol your authenticator soon |
| A member sees lessons but no assignments | Older builds compared the member's status and centre exactly; an imported "Active", a blank status or "egbeda " matched nothing | Fixed: those compare the way the rest of the record does. A member still sees nothing if they are suspended, or their course is not the assignment's |
| "Not a Member ID or email" at sign-in | Older builds refused card numbers | Card numbers (`VOL-INS-26-001`, `026-014`) are accepted now |
| A child cannot remember their sign-in question, or a volunteer has a new phone | Their second step | **Members › Sign-in security** → their row → *Let in for 10 minutes* (at the desk) or *Give a one-time code* (by phone), or *Reset* |
| "No phone on your record" at the card door | The volunteer record has no phone, so the card can never be checked | Use *Email me a sign-in code instead*, or add their phone |
| A screen looks empty | Almost always a filter | **Clear all filters** |
| "Guardian consent required" on **Promote to NGV** | The member is under 18, or has no date of birth on file. Promotion shares their details with Afrovanguard | Record the guardian's decision under **Publication consent → Share with NextGen Vanguard**, with the guardian's name and how it was given. Then promote |

---

## Before you press it — the warnings list

Short list. Everything on it is hard or impossible to undo.

1. **Deleting a centre instead of retiring it.** Retiring keeps every record
   working. Deleting leaves member records and printed card prefixes
   pointing at a name that no longer exists. When you are offered the choice,
   retire.
2. **Activating an edition.** It closes the previous one. That is usually
   what you want, but it is a season-wide change made from a small control.
3. **Archiving an edition.** It is a roll-up, not a status change. It is a
   separate action for that reason.
4. **Deleting a group.** Decide where its participants go before you start,
   not in the dialog.
5. **Resetting somebody's 2FA.** Their backup codes stop working
   immediately. If they are travelling and cannot enrol, they are locked out.
6. **Bulk status changes across "all N matching the filter".** Read the
   filter before you read the count. The count is right; it is the filter
   that is usually wrong.
7. **Printing a batch before fixing the missing-data counts.** A card with no
   photograph prints perfectly and is useless. The counts link to the exact
   people; spend the five minutes.
8. **Changing a centre's code.** It is the prefix printed on new member ID
   cards.
9. **Editing a published card design.** Editing the draft is safe and changes
   nothing. **Publishing** changes what everybody prints from then on. Old
   runs keep their version, so old batches are still reprintable as they
   were.
10. **Deleting anything to "tidy up".** If a screen offers to retire, void,
    close or archive instead, that option exists because somebody already
    learned this lesson.

---

## Where else to look

- `docs/ROSTER-IMPORT.md` — the members workbook and the import file.
- `docs/PRINT-SPEC.md` — card dimensions, bleed, printer requirements.
- `docs/POLICY.md` — programme policy, conduct thresholds, fines.
- `docs/FORMS.md` — the form builder.
- `CLAUDE.md` — for developers: architecture, invariants and conventions.

### A backup Cloudinary account

Settings → API keys → Photos → **Cloudinary · backup account** takes a second account's cloud name, API key and API secret. A free account is fine. **Test** checks it and shows how much of its credits are used.

- **When the main account runs low** (the image-storage monitor reads it every 6 hours and it reaches *high*), or the moment it **refuses an upload for credits**, new photos and edits move to the backup on their own. You get an email and a Diagnostics entry, and AI photo edits start again.
- **"Refuses an upload" includes uploads made from people's phones and browsers**, which go straight to Cloudinary. When Cloudinary turns one away for credits, the page tells this site, the site checks the main account itself (it reads the account and, if that doesn't settle it, tries a tiny upload of its own), and only then moves to the backup. The person's upload is then sent to the backup, so they see no error. A refusal for any other reason (a damaged file, say) is shown to them as it was and moves nothing.
- **No web-cron on your host?** The 6-hourly reading is also taken when somebody uploads and the last reading is older than that, so the switch never waits on a cron job.
- **When the main account passes 70% used** (checked every 6 hours, and straight away when the backup's keys pass **Test**), or the moment it **refuses an upload for credits**, new photos and edits move to the backup on their own. You get an email and a Diagnostics entry, and AI photo edits start again.
- **Photos already on the main account keep showing.** One that is edited while the backup is in use is copied across once (editing it again reuses that copy), so the edit doesn't spend the main account. The optional **Upload preset** is for photos on the public application form; without it those go to this site while the backup is in use.
- **When the main account renews** (back under 70%), work moves back to it with another email.
- **You can choose.** Settings → Diagnostics → Image storage → **Cloudinary accounts**: open an account and press **Use for new uploads now**. The choice holds (even past 70%) until you press **Back to automatic**; only a full account is still skipped, so uploads never stop.
- **What a backup can't save:** photos already stored on the main account still use its bandwidth every time a page shows them. Only new photos, and photos edited again, move to the backup.
- **Photos on a spent account move only when they are needed.** Nothing is copied in bulk, so the new account holds only photos somebody actually used:
  - **Printing** in the ID Card Studio first copies the photos on that run that sit on an account past 70% to the account in use. The studio says how many it copied.
  - **Editing** a photo copies that one photo first.
  - Each is copied once, so a second print or edit reuses the copy. The old file stays, so shared links keep working.
  - Photos nobody prints or edits stay where they are. They still use the old account's bandwidth when a page shows them, but no new storage anywhere.
- **An account Cloudinary has stopped** ("account disabled", over its limits) now counts as full when its usage is read, instead of keeping its last reading.


## Community replies work like a chat

A post's replies read like a chat thread:

- **Layout:** your own replies sit on the right. Several replies in a row from one person share one name. Each new day starts under a day line. A "new replies" line marks where the replies you haven't seen begin.
- **Reply to one reply:** press the curved arrow (or swipe the reply right on a phone). Your reply quotes the one you answered. Tap the quote to jump to the original. The person you quoted is notified.
- **React:** press the smiley (or hold a reply on a phone) to react with one of the six community reactions. Pressing the same one again takes it back.
- **Live replies:** new replies appear while the thread is open, checked every few seconds. If you have scrolled up, a button shows how many are new and takes you to the latest.
- **Sending:** on a computer, Enter sends and Shift+Enter starts a new line. On a phone, the send button sends.

Reporting and deleting a reply work as before. Every action has a button; nothing needs a gesture.

## Assessing one child (Instructor Portal)

**Students → a child → Assess** is where an instructor assesses one child:

- **Skills:** every skill of the course being taught, on four levels (Not yet, Getting there, Can do it, Can teach it). Moving a child up needs one line of what you saw. One press saves all the changes.
- **A note:** choose Progress, Strength, Concern or Tell the family, and write what you noticed. It goes on the child's record, where their mentor reads it. A worrying note is flagged to the safeguarding lead.
- **Lesson answers:** shows how many of the child's answers are waiting for your mark, with a button straight to them.

This works for a child who takes the course as their second course too.

Someone who both teaches and mentors gets the **Instructor Portal** at `/instructor`. Before this fix they were shown the Mentor Portal there.

## Study plans: targets of 85% and more, and what a mentor can do

- **Targets:** every target is at least **85%**. The plan drafts 85, or the next band up (90, 95, 100) at least 5 points above where the child already is. A target under 85 is refused, whether the child or the mentor sets it.
- **Making 85 realistic:** a bigger climb gets more study sessions a week (3, 4 or 5). Every subject shows a **mid-term mark**, halfway between the current score and the target, to check against at mid-term. A child scoring under 50 has their mentor drafted as the helper.
- **When they study:** the child picks the **days**, a **time** (before school, in a free period, after school, in the evening, at the weekend) and a **place**, instead of typing a sentence. The plan reads, for example, "Mon, Wed, Fri · after school · at home". The number of days sets the sessions a week.
- **A score of 0** is flagged to the child to check before sending, because it is usually a misread report.
- **The mentor:** before approving, a mentor can change any subject's target (never under 85), its sessions a week and what the child will do. They then press **Approve with my changes**; the child is told what changed. Once a plan is live, the mentor can **write to the child about the plan** (praise a kept week, or ask what got in the way). It goes on the plan's record and reaches the child as a notice.

## A child's lessons (instructors and mentors)

- **Instructor:** Students → a child → **Work** shows every lesson of the course: done (with the score), waiting for your mark, started or not started, plus a line such as "4 of 9 lessons done · average 78% · Year 1".
- **Mentor:** a mentee's **Growth and lessons** tab shows the same, for every course the child takes.
- **A mentor's class:** it is their mentees whenever they have any, including mentees paired before the current session started.

## Editing a mentor

- **Role:** Mentor, Lead mentor or Peer mentor. Changing a lead back to Mentor steps them down. The change is in the audit log.
- **Department:** a course, which narrows the children they see. Leave it empty for a mentor who works across courses.
- The cursor now stays in the field you are editing. Before this fix it could jump back to Full name.

## School results that read 0 everywhere

- A report where every subject is 0 was not read; it is not a term of zeros. It is now refused when the child confirms it ("Every score says 0…").
- Older ones show to the instructor as **Scores not read**, not "0% · Needs attention". Use **Remind** to ask the child to type the scores in.

## Feedback in the Inbox

Feedback that an older version saved as an ordinary request is now shown as feedback, with **Thank and close** and **Pass to centre lead**, never Approve or Decline.

## Placing children in the curriculum, and checking off what they have done (Instructor Portal)

- **Students → Place the class:**
  - Every child is listed with the year they are placed in now, and a **suggested year** with the reason. The suggestion comes from how long they have been in NGG (their intake year) and how much of their lessons they have done.
  - Press **Use every suggestion** or choose Year 1–3 per child, then save the whole class at once.
- **A child → Assess → Tick what they've done:**
  - Every lesson of the course is listed by week. Tick the ones the child has really done, or use **Done up to week N**.
  - A lesson the child finished in the portal keeps its score and can't be unticked here.
  - The portal's numbers are an estimate; the instructor's ticks are the validation.
- **Mission proof review (Control Room):** a child's typed answer shows as their words, not as a broken "View proof" link. The Verify button is readable again.
- **Reading report cards:** the AI now reads the full table (CA, exam, total, grade). It checks each total against CA + exam and the grade, and reads unclear cards a second time, more carefully.


## Portal time (Analytics → Engagement → Portal time)

Shows how long NGG members actually use the portals: who came, for how long, on which days and at what hour, which portal, and which centre.

**How time is counted:**
- Time counts only while a portal is open, on screen, and in use (touched in the last two minutes).
- A tab left open overnight adds nothing.
- Two open tabs do not double the time.
- A day counts at most 12 hours per portal.

**What you can do:**
- Pick the window (7, 30 or 90 days) or a centre.
- Search for a member.
- Export the CSV.

"Not seen" means no time was recorded in the window. Counting started with this release.

## Backup AI keys (Settings → AI keys)

There are six slots:
- the main key;
- three **backup Gemini keys**: create each in a separate Google account at aistudio.google.com;
- a **Groq** key (console.groq.com), used last and never for photos or report cards;
- a photo key.

When one key hits its daily limit, the next one serves. Press **Test** on each key after saving it.


## Instructors and courses

- **An instructor's courses are their class.** In Mentors & volunteers → Volunteers → edit, type the courses they teach, separated by commas.
  - Spelling and capitals are corrected to the catalogue's.
  - A name that is not a course is refused, with the nearest course suggested.
- **When you promote a member to staff,** they start with their own courses. Change them in the editor if they teach something else.
- **Instructors do not see school results.** Results are for the child's mentor (Mentor portal), the family and NGG admin.
- **Every course has its own Community channel,** created automatically, including courses added later. A course channel you archive stays archived.

- **Lessons for a course.** An instructor can write a lesson for their own course from Resources → Curriculum → "Write a lesson for …". It arrives in Control Room → Curriculum → Lessons as a **draft**; publish it there and their class sees it. An instructor you have given the curriculum permission publishes directly.
- **When a course has lessons of its own,** those are what its class sees. Lessons filed under related names (an instrument for Musical Instruments, "Drama" for Acting) are used only for a course with none of its own.

## Making someone an instructor AND a mentor, and skipping the Academy

Open the person in **Mentors & volunteers → Volunteers**, then go to the "Also" section of their record.

- **A mentor as well:** tick it to add them to the mentor roster. Their role stays Instructor, and both the Instructor and Mentor portals open for them. Pair their mentees in Mentors & volunteers → Pairings. Untick it to take them off the mentor roster.
- **Skip the online Academy** (instructors): tick it when they trained in person or need no training. Their portal stops asking for the modules. The waiver is recorded with the date and who granted it. You cannot set it on your own record.
- **For a mentor's Academy,** use Mentors & volunteers → Pairings → the mentor → Academy "Completed in person".

## Wi-Fi at the centres (Control Room → Wi-Fi, and the Club portal → Wi-Fi)

Who can use it: anybody given the **network** capability (Access & roles) —
the people who look after the centres' equipment. Super admins have it. Admins
do not, unless it is given to them. In the Club portal it is under **Systems →
Wi-Fi** and opens right there, the same screens as in the Control Room.

**How it works.** Each centre has a *gateway* — its router or Wi-Fi controller.
Every one to five minutes it fetches its centre's list from NGG with its own
key. Members sign in with their **printed ID** (e.g. `026-014`) and a 6-digit
**Wi-Fi PIN**, which they see in the app under **Me → Wi-Fi**. Nobody is added
or removed by hand: Wi-Fi follows the record. Suspend somebody and they are
signed out at the gateway's next fetch.

**The four tabs.**
- **Gateways** — each centre, its gateway, and whether it is working. What needs
  a look is listed first, in words, with what to do. Open a gateway for what it
  reported, what it holds, its setup guide, a line test, its key and removal.
- **Speed & health** — each centre's line speed and, at the busiest hour this
  week, about how much each person gets. **Test this connection** measures the
  line from your own device: run it on the centre's Wi-Fi, from where people
  sit. Every test is kept with who ran it and your note.
- **Who gets on** — the access table (on / limited / off for each kind of
  record), whether fees owing limits Wi-Fi, and each profile's speed, devices,
  hours, *fast page loads* (burst) and priority. Edit in place, then **Save
  changes**. **Why can't somebody get on?** looks a person up and says why.
- **Setup guides** — which gateway a centre can use and what each can do.

**Adding a gateway.** Add a gateway → choose what it is and its centre. Its
**key is shown once**, in its setup guide, already inside the script. Follow
the guide on the gateway. It shows as *Working* after its first fetch. Lost the
key? **Rotate the key** and run the setup again with the new one.

| Gateway | Status | Notes |
|---|---|---|
| MikroTik (RouterOS 7) | Pilot first | The fullest: speeds, burst, priority, devices, sign-out, 30-day remember, filtering, line tests |
| RADIUS bridge (UniFi, Omada, pfSense, OPNsense) | Pilot first | A Raspberry Pi at the centre. Removal bites at the next sign-in (within a minute on pfSense with re-authentication on) |
| OpenWrt with openNDS | Pilot first | The PIN sign-in page must be proven on one router |
| Anything else (JSON feed) | Ready | For your own script or controller |

"Pilot first" means: set it up at **one** centre and watch it for a week before
the others. The scripts follow each maker's manual, but no router can be tested
from NGG's own systems.

**What the warnings mean.**

| It says | What to do |
|---|---|
| Not connected yet | Run its setup guide on the gateway |
| Silent for 3 hours | Check its power and internet. It keeps the people it had; nobody new gets on and nobody suspended is removed until it fetches again |
| N fetches with the wrong key | After a rotation, run the setup again. If you didn't rotate it, rotate it now |
| The gateway reported a problem | Read the message; certificate problems are usually the router's clock |
| Slow line | Below 5 Mbit/s. Ask the provider; test at a quiet time to tell the line from the crowd |
| More promised than the line can give | Members are allowed more than the line can share at busy times. Lower the member speed to the figure shown (keep burst on), or upgrade the line |
| Working hard / Low on memory | The router is too small for the centre, or needs a restart out of hours |

**Privacy.** Gateways tell NGG how many people are online, their CPU, memory
and uptime, as hourly summaries, and how much data each signed-in person used
(amounts per day, nothing else). Never what anybody visits. NGG keeps no
browsing record (see docs/POLICY.md, Wi-Fi).

**Data used and allowances (added 2026-10-28).** *Wi-Fi → Data used* (Control
Room and Club portal) lists each person heaviest first: today, the period and
this month, against their allowance. Members see their own under *Me → Wi-Fi*;
families do not. Set allowances in *Who gets on → Speeds*: a daily and a
monthly MB per profile (0 for none; a month counts from the 1st, across every
centre). Over one, the *Used up their data allowance* row of the table applies:
**Limited** (the slow profile) by default, **Off**, or **On** to watch without
enforcing. It takes effect at the gateway's next fetch and lifts by itself at
midnight or on the 1st. To let one person carry on, set their Wi-Fi to On by
hand with a reason. Only MikroTik gateways (after their script is pasted again)
and the JSON feed report data used; the RADIUS and OpenWrt setups don't yet.

**Setup guides** read in the order the job is done: what it sets up and how
long it takes, what you need, numbered steps with every command (and the
script) inside the step that uses it, then each common problem beside its fix.

**Overrides.** Someone who should have Wi-Fi but whose record says otherwise
(an alumni mentor on Saturdays) can be set by hand from *Why can't somebody get
on?* — by whoever looks after their record — with a reason. An override never
undoes a suspension.

**CACENTRE runs the Wi-Fi (added 2026-10-28).** CACENTRE is the authority for
the Wi-Fi across the estate: it holds and hands out the PINs, the routers fetch from it, and
its blocks and overrides win. NGG keeps its say. Every 15 minutes NGG sends
CACENTRE everybody it speaks for: members, staff, mentors and instructors, and
Summer School participants within their edition's dates. Each person goes with
NGG's verdict (**on**, **limited** or **off**) and the reason, worked out from the
table on *Who gets on*, from suspensions, and from the overrides set here.
CACENTRE never gives anybody more than NGG does. Somebody suspended here is off
at CACENTRE within the quarter hour; a record deleted here is withdrawn there.
Data allowances are counted at CACENTRE now, not here.

The Gateways page shows when the list was last sent, how many people were on
it, and anything CACENTRE refused. A super admin can press **Send now**.

- *"CACENTRE could not place CP (12)"*: the centre is not one of CACENTRE's
  locations. Add the location at CACENTRE (Attendance → Locations); the next
  send makes its Wi-Fi site there by itself. Until then those 12 people can sign
  in only at the hubs. (A centre that IS a CACENTRE location never shows this:
  NGG names the place with each person, and CACENTRE makes the site the first
  time.)
- *"doesn't recognise NGG's key"*: the Wi-Fi rides the connection NGG already
  has with CACENTRE's gate for attendance, so the key is `hooks.attendance_secret`
  in NGG's `api/config.php`, the same value as `NGG_SECRET` on the gate. Once
  attendance works, so does this. There is no separate Wi-Fi key.
- *"NGG isn't sending its people there yet"*: that key isn't set. Until it is,
  the gateways and the members' PINs stay NGG's, as before.

**Moving a centre's router to CACENTRE.** Once NGG is connected, routers are
added at CACENTRE: *Add a router at CACENTRE* opens it, and a centre with no
router has its site made at CACENTRE from the location of the same name once
NGG has sent its list — nothing to type. An NGG router moves in three steps, listed on its card under
*Moving it to CACENTRE*:

1. At CACENTRE, add a router for the centre's site.
2. Paste CACENTRE's one line on the router. This removes NGG's script.
3. Press **It now runs from CACENTRE** here.

From then on:
- NGG stops watching that router and never reports it silent.
- Members at that centre see CACENTRE's PIN in the app straight away.
- If NGG's script is in fact still on the router, it keeps its people and logs
  *moved_to_cacentre*.

*Back to NGG* undoes it, and NGG sends the router a full list at its next fetch.

**Members still get their PIN in the app.** CACENTRE holds the PINs and hands
them out, but nobody goes to another site for one: *Me → Wi-Fi* asks CACENTRE
for the member's username and PIN, and *Get a new PIN* changes it there. A
centre whose router still fetches from NGG keeps showing NGG's PIN, the one
that router knows. Once the router is pointed at CACENTRE (no fetch from NGG
for a day), the app shows CACENTRE's. If CACENTRE can't be reached, the screen
says so with *Try again* rather than showing a PIN that no longer works.

### Wi-Fi in the Club portal, regions and analytics (added 2026-10-27)

- **Who sees what.** You see the Wi-Fi of the centres you look after: your own
  centre, the centres of a Wi-Fi region you lead, or — for a super admin —
  every centre. A note at the top says which.
- **Club portal → Wi-Fi** (for anybody holding `network`): **Overview** (who is
  online per day, the busy hours, how much of the day gateways are there, line
  speeds, each region's health, what needs you), **Gateways** (search and
  filter every gateway; open one for its diagnosis and tools), **Regions**,
  **Speed tests**, **Who gets on**, **Setup**. The Control Room's Wi-Fi page has
  the same, including Analytics and Regions.
- **Wi-Fi regions** group centres for their Wi-Fi. They are their own
  capability, **Wi-Fi regions** (`wifi_regions`, the super admin's): an NGG
  admin who holds `network` looks after their own centre's Wi-Fi but does not
  see or manage regions. Whoever holds it makes regions, puts centres in them
  and chooses their leads (staff who hold `network`). A lead sees and looks
  after their region's centres.
- **A whole region at once.** Open a region: *Line test, every gateway* asks
  each of its gateways to measure its line at the next fetch; *New keys, every
  gateway* rotates every key and lists the new ones once (copy them as CSV, then
  run each router's setup again). The count is shown before you confirm, and if
  the region's gateways changed meanwhile it is refused rather than done. Leads
  can do this for their own region. *Gateways → Line test* does the same for
  every gateway matching the filters.
- **A gateway goes silent.** One that has not fetched for an hour is reported
  once — one message and email per person listing all the silent gateways, never
  one per gateway — to the region's leads; a centre with no region (or a region
  with no lead) goes to the network staff who look after that centre, and failing
  them to those who look after every centre. Its next fetch ends the silence, so
  a later one is reported again.
- **Server load.** Every fetch is timed. *Overview → Server load* (Wi-Fi regions
  capability) shows the last 24 hours and what 2,000 gateways would cost this
  host, with a verdict: *Within budget*, *Close to the budget* or *Over budget*.
  **Do not put a second region live until it reads *Within budget*** after the
  pilot region has run for a day.
- **Speeds follow down**: the network's defaults, then a region's own, then a
  centre's own. Set only what differs; "set here" switched off means "follow".


**When the list doesn't reach CACENTRE (406).**
- A 406 means CACENTRE's web host refused the request before CACENTRE saw it.
- NGG now splits the list and tries again in smaller parts, so everybody else still gets through.
- Anybody refused even when sent alone is named in the Wi-Fi status note. Check that person's name and email for unusual characters, or ask CACENTRE's host which firewall rule fired.

**Who loses Wi-Fi.**
- Only an active (or graduated) member is on.
- A deleted, merged, inactive, suspended or pending record is off at the next send.
- Once CACENTRE is updated, someone who stops being on the list at all (deleted from NGG) is withdrawn too.

## Courses: placing every child (Members → Courses) and Course health (Learning)

A child's courses decide their lessons, Community channels, timetable and which instructors' classes they are in. They are now set **once, here**, and every portal reads the same list.

- **Proposed:** for a child nobody has placed, their record proposes courses, from the track and the interests on the card, within one division. The child sees them marked "not confirmed yet".
- **Needs a look:** the proposal needs a person to decide. Examples: their card names another division (a Tech child whose card also says Media), a division word gave a whole division, or nothing names a course. Open the child to see why.
- **Confirm proposed:** select children, then Confirm. Their proposal becomes their courses.
- **Add / Remove / Set courses:** choose from the course list. To place a child in two divisions on purpose, do it here.
- **Course health** (Learning) lists every course: the children in it, its instructors, lessons, class times and channel. A course failing children comes first. Open one to see what is missing and go straight to where it is fixed.


### Lesson files that went missing (2026-10-29)

If pictures, GIFs or diagrams you uploaded to lessons have disappeared, the
files were deleted from the server (usually by a deploy that replaced the
website folder); the lessons themselves are fine. **Learning → Course health**
now marks any course with *lesson files missing* and its drawer lists each
lesson and file — upload them again from Curriculum. Learners see "The picture
… could not be loaded. Tell your instructor" instead of a broken image. New
uploads are kept outside the website folder (see SETUP → Lesson files).

The bundled lessons now carry their own diagrams: every music lesson shows its
session drawn to scale, the scales it teaches on a keyboard (and a staff for
piano), and the chords it uses as chord boxes — each one can be played.

### Every bundled lesson now teaches the idea, not only the steps

All 528 bundled lessons — Practical Coding, Media Lab, Tech Foundations,
Studio Trades, Instruments, the Divisions, the Business course and three years
of Piano and Guitar — now open with an **Understand it** section that explains
the session's idea in full, a **Key words** list, and **Read and watch** links
to reputable sources (the same links appear under the lesson's materials).
Every link was checked to load before it shipped. Sites update existing
lessons automatically on the next page load, **unless an instructor has
edited that lesson** — an edited lesson is never overwritten. To take the new
text into an edited lesson, open the bundled course and copy the section in.

### Lesson materials say what to do with them

Each material on a lesson now shows three things to the learner: its title, a
**one-line instruction** ("Choose the drill for today's topic and do ten in a
row", "Official safety guidance — read the key points before the practical")
and the site it comes from, with an action word — **Practise**, **Read**,
**Watch**, **Listen** — instead of the file type. In the lesson editor, each
material has a third box, *What to do with it* (up to 240 characters). Write
it as an instruction to the child, not a description of the site. Practice
sites (exercises that mark themselves, sandboxes, interactive lessons) are
recognised automatically.

The bundled courses were cleaned at the same time: dead and blocked links
removed (four Trinity pages, ABRSM, Canva, JustinGuitar, MuseScore's sheet
music, the British Museum search, a Google search posing as a metronome);
exam and certificate pages that were repeated on every lesson now appear once,
on the first lesson of each level, marked *For the whole course* (the
qualifications themselves live in Credentials); and every lesson keeps at
least two materials. An edited lesson keeps its own materials.

## Push notifications — on phones, without opening the portal

Members, parents and staff can have their messages arrive on their phone or
computer like any app's. Everything that already reaches the bell (and every
email a parent gets from the family account) can arrive as a notification.

**Turning it on**
- **Member:** the bell → **Get these on your phone** → **Turn on notifications**.
- **Parent:** **Account → Notifications on this device**, or the **Turn on**
  prompt on Today.
- **Staff:** **Account menu → Notifications**, or the prompt at the top of the Inbox.
- **Send a test** confirms it works on that device. **Turn off here** stops
  that device; **Turn off everywhere** stops all of them.
- **Which devices.** Android phones (Chrome, Samsung Internet, Opera, Firefox —
  Tecno, Infinix, Samsung, Pixel alike), Windows, Mac and Linux computers
  (Chrome, Edge, Firefox, Safari 16+), and iPhone/iPad on iOS 16.4 or later.
  Where a device cannot, the card says the one thing that fixes it:

  | Device | What the card says |
  |---|---|
  | iPhone/iPad in Safari | Share → *Add to Home Screen*, open NGG from the icon, turn on there |
  | iPhone in Chrome or Firefox | open the page in Safari, then add it to the Home Screen |
  | iPhone on iOS older than 16.4 | update iOS (Settings → General → Software Update) |
  | A page opened inside WhatsApp, Instagram or Facebook | open it in Chrome or Safari (⋯ → *Open in browser*) |
  | Brave | turn on *Use Google services for push messaging* in Brave's privacy settings |
  | Safari 15 or older on a Mac | update macOS, or use Chrome/Edge/Firefox |
  | Notifications blocked for the site | allow them in the site settings (or the phone's app settings) |


**What keeps it from being a nuisance** — each is automatic:

| Rule | What happens |
|---|---|
| Quiet hours (default 9pm–7am) | Nothing buzzes. What arrived is held and comes as **one** “While you were away” summary when they end. Change or switch off in the card. |
| Urgent | A child checking in or out, a safeguarding message, a duty, a security notice — never held, never muted, stays on screen until dealt with. |
| Already looking | Somebody with that portal open in front of them sees it there; their phone does not buzz too. |
| Bursts | After three in ten minutes, the rest wait and arrive together as one. |
| Same thing again | The third reply on one request updates the notification; it does not stack three. |
| Topics | Each person can mute what they don't want (payments, learning, community…). Muting never mutes something urgent. |
| Dead devices | A device the browser says is gone is forgotten; one that keeps failing is dropped after eight tries. |

Tapping a notification opens the page it is about, reusing an open NGG tab.
The words travel encrypted end to end: Google, Apple or Mozilla carry them but
cannot read them.

## The Inbox: every item can be acted on from where it is

Each kind of item now opens with what matters and the action already drafted:

- **Messages.** The pane says whether the sender is already with us (“Parent of
  Tobi Adewale (NGG · Egbeda)”), with **Open Tobi's record** one press away. The
  reply box starts with a **drafted reply** that fits what they asked — fees,
  signing in, an ID card, session times, applying, mentoring, partnership — and
  knows when the sender is a parent (it will not tell a parent how to apply for
  a child who is already a member). Edit it, then Send. A message that mentions
  a child being hurt, bullied, missing or unsafe goes to the top with a note to
  read it first.
- **Applications.**
  - **Ask for something** drafts an email asking for whatever is missing — the
    photo, the date of birth, the centre, a phone number — sends it, and keeps
    the application in the Inbox, marked as in hand, with the request in its
    thread.
  - **Waitlist** and **Reject** now **tell the family**, in a drafted message you
    can edit (empty it to change only the status). What was said is kept on the
    application.
  - The pane says if the address is already a member or a parent, how many
    times it has applied before, and if the age is outside 10–17.
- **Approvals (family links).** **Decline** starts from a drafted, kind reason;
  **Open the child's record** is beside it.
- **Comments.** A comment that shares a phone number, an email or a social
  handle is flagged (“On a children's site that stays hidden: reject it”) and
  Approve stops being the highlighted button. Links and all-capitals are noted.
- **Testimonials.** Words with contact details are flagged and cannot be
  published from here.
- **Photo review.** **Ask for reshoot** starts from what the check found (“it is
  too dark, it is blurry”) in words a family can act on; **Open their record** is
  on member photos.



## Appeals

A member (from Records) or a parent (from the family account) can appeal any
decision on the record: a warning, the Dormant Track, a suspension, an
eviction, a fine or a fee. It arrives in **Requests**.

- **Overturn it** lifts the decision and everything it carried (its fine, a
  suspension's re-entry fee). **Keep it** leaves it standing. Both need a
  reason; the family reads it.
- Whoever issued or confirmed the decision can't decide its appeal
  ("somebody else reviews the appeal").
- A proposed eviction can't be confirmed while its appeal is open.

## Achievements and learning outside NGG

**Achievements are worked out, not typed.** A member's Records page and the
family's Growth page show them: days attended (10, 25, 50, 100, 200),
sessions in a row and on time in a row, lessons completed, full marks, stars
from instructors, confirmed outside learning, and a top-three place at their
centre for attendance or lessons this month or last. A streak counts programme
days; only a real absence breaks it, never a day away with permission or a
day the gate was down. Staff add their own recognitions (academic,
consistency, conduct, leadership, creativity, service, sport) from
**Learning → How members are doing**, opening a member.

**Learning outside NGG.** A member logs something they learnt on another site
or app from **Records → Learning outside NGG**: what, where, how far, hours,
and a video, screenshots or pictures, a link or notes. It waits in
**Learning → How members are doing** until somebody with the Curriculum
permission confirms it or sends it back with a note. Only confirmed entries
count. **Bring in a report** takes a platform's progress export (CSV or Excel):
rows are matched by printed ID, then by name; unmatched rows are listed, and
nothing is added until you press Add. Report rows arrive confirmed.

**How each member is doing** lists every active member in your centres:
lessons done here, average score, outside learning and hours, days attended in
the last 90, and when they last learnt anything. "Nothing learnt in 30 days"
is the list to follow up.


## Photos: stored in the bucket, optimised once, served from the bucket

New uploads go to the file-storage bucket (R2) once one is set in **Settings →
API keys → File storage**. Cloudinary is asked **once** per photo for the sizes
the pages use; the small copies are stored back in the bucket and every page
loads them from there, so viewing photos costs no Cloudinary credits.

In **Settings → Diagnostics → Photo storage**:
- **Move held photos to the bucket**: the photos still kept on this server. The
  server copy is kept; missing files are left alone. It also runs every hour.
- **Optimise photos**: makes the sizes now. It also runs every ten minutes.
- **Use their Cloudinary photos**: for a record whose file is gone but whose
  person has a photo in Cloudinary.

## Maths Lab: the 170-Point Mathematics Mastery Framework (`/study/lab`)

The Mathematics Clinic's idea, built into the Lab: understand **why** maths
works, never only memorise it; never skip a foundation; never write a child
off as "bad at maths" when a foundation was simply never taught.

- **All 170 points are open**, in 17 stages of ten, grouped into five
  **bands**: *Foundations* (Primary, Stages 1–4), *Algebra and number*
  (JSS · BECE, 5–7), *WAEC core* (SSS · WASSCE Mathematics, 8–12),
  *Further Mathematics* (WASSCE Further Mathematics, 13–16) and *Beyond*
  (mechanics, university and research, 17). The map shows each stage's band;
  Progress shows how many points of each band a member holds.
- **Why it works.** The foundations (Stages 1–4, starting from why
  1 + 1 = 2) and every topic built on a law, formula or theorem (91 topics
  in all, e.g. Pythagoras, the quadratic formula, the laws of indices,
  differentiation from first principles) show a short argument on the topic
  page. It appears one line at a time, each with the reason it is true. Topics
  that are a skill or a convention have none. Practice on those topics
  includes two kinds of question from the argument: *why is this line true?*
  and *put the argument in order* (arrow buttons; no dragging).
- **Explore it.** About 60 topics have an interactive panel with sliders that
  work by keyboard and touch. Among them: the number line, arrays,
  area-model brackets, fraction bars, the angle sum, Pythagoras' squares,
  sectors and radians, straight lines, parabolas and the discriminant, the
  unit circle (CAST), a chord becoming a tangent, strips under a curve, a die
  rolled 1,000 times, series and compound growth.
- **Foundations to fix first** (Progress, and Home when it applies). When a
  member keeps getting a topic wrong, the Lab traces it back to the
  **earliest** topic underneath it that they do not yet know, and offers
  *Start here*. Practising the hard topic harder fixes nothing when the gap
  is lower down.
- **A topic that needs a later stage's idea** (e.g. *Graphical solution of
  linear equations* in Stage 6 uses coordinates from Stage 10) is not locked
  by it. The topic introduces what it needs, and the page says where the
  full topic is.
- Rounding rules are stated under the answer box ("correct to 2 decimal
  places"). Any answer that rounds to the right value is accepted.
- **Home** reads top to bottom:
  1. where the member is (stage and band);
  2. **Up next**, one step explained in a sentence, with one button;
  3. **Your progress**: topics known, streak, level, and the current stage's
     topics, with *Open the map*;
  4. then foundations to fix, courses, how the climb works, and badges.
- **Finding a topic (the path).** The Map is a path, like Duolingo's, drawn
  in the Control Room's style. Each stage has a header, followed by its ten
  topics as round buttons: black with a tick when known, gold with *Start* on
  the one to do next, white when open, and grey with a lock when not yet
  open. The stage boss (a trophy) comes last. **Only the member's focus
  stage, the one holding their next lesson and marked *You are here*, is
  open.** Every other stage shows just its header and progress, and opening
  one closes the others. Pressing a
  topic shows its name and a *Start* button. On a computer, a side panel shows
  the streak, stars, XP and *Up next*.
- **Courses** open as the member reaches them. A course whose first stage
  the member has not reached shows **Locked** with the reason, for example
  "Opens at Stage 5 — know all of Stage 4 first, 3 of 10 so far", and has no
  Enrol button. Enrolling shows *Enrolled*, and *Continue* goes straight to
  the course's next topic.
- **Each course shows what it holds**: its stages in order, by name, each
  marked done, *on now* or ahead, with how many of its ten topics the member
  knows. An enrolled course also says how close the next certificate is
  ("4 topics to go for your Stage 2 certificate").
- **Praise in practice**, on Duolingo's pattern:
  - The words vary from answer to answer.
  - A run of right answers is counted with a flame, and called out at 3, 5
    and 8 in a row.
  - The answer after a miss is greeted ("Back on track").
  - A wrong answer gets a lift and the working, never just "wrong".
  - Praise names the work (careful working, coming back, managing without
    the hint), never the child's cleverness: that keeps them trying at the
    hard ones.
  - Practice only. Placement gates, checks and bosses still give no answers
    until the end.
- **The end of a session** has a headline (*Perfect!*, *Session complete!*,
  *Good effort!*, *You finished it. Keep going!*) and three tiles: XP
  earned, accuracy with a word (*Flawless*, *Amazing*, *Great*, *Getting
  there*, *Building up*), and the best run (or the time on task). A good
  session gets a short confetti burst, skipped when the device asks for
  reduced motion.
- **Opening another stage on the map** shows it with *Back to my stage*.
  Closing it returns to the member's own stage.
- **A topic is a lesson in steps**, one screen at a time: *Explore* (the
  interactive), *Why it works* (the proof), *Worked example*, then *Practise*
  (with the *Mastery check* and the topics it builds on). A step bar shows
  where the member is. *Continue* and *Back* sit at the bottom.
- **Practising.** Answers are numbered: on a computer, keys 1–9 choose and
  Enter checks. The result shows the score once, says what to do next, and
  lists the questions missed first with their worked solutions open.
  *Practise again* starts a fresh set. Going back to the topic opens it on
  *Practise*.
- **The placement gate, reviews and the stage boss test the skill itself.**
  The "why is this line true?" proof questions appear only in practice and
  in the mastery check.
- **Everyone studies; nobody guesses their way through.**
  - **No skipping.** *Continue* opens only once the step has been done: an
    explorer slider moved, every line of the proof read, every line of the
    worked example shown. Steps ahead cannot be opened early.
  - **The server enforces it.** Reaching *Practise* records the study, and
    practice and the *Mastery check* are refused for a topic that has not
    been studied, whatever the page sends. A topic already studied or known
    can be moved through freely.
  - **The check opens on readiness.** The *Mastery check* opens only when
    practice shows the member is ready.
  - **A failed check is not retaken at once.** It owes **5 right practice
    answers, without a hint**, before it opens again; the topic page counts
    them down.
  - **A lost stage boss** sends every topic it caught the member on back to
    practice, each owing the same 5 answers and a new mastery check. The boss
    stays locked until those topics are mastered again.
- **Written for an eleven-year-old.** Every explorer opens with a *Try this*
  challenge, one thing to do and one thing to notice. The readouts and the
  early proofs use everyday words ("one number word for each object", not
  "one-to-one correspondence"). Keep new copy to that standard: easy to
  follow, never dumbed down.
