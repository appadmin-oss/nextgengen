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
   - [Mentorship: Anchor Pods](#mentorship-anchor-pods)
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
| Members | The year-round roster. Search, filter, edit, bulk actions, ID printing. |
| Applications | People who applied and have not been processed yet. |
| Volunteers | Volunteer roster and their status. |
| Mentors / Mentorship | Mentor records and mentor–member pairings. |
| Behaviour monitor | Conduct incidents as they come in. |
| Dues & fees | The fee ledger. Separate permission — see below. |
| Conduct policy & fines | Thresholds, suspensions, fine amounts. Governs members **and** Summer School. |
| Member requests | Things members have asked for and are waiting on. |
| Staff activity | What staff accounts have been doing. |
| Engagement | Participation figures. |
| **Centres** | The centre directory. Add, edit, retire. |
| **ID cards** | The print log, one person's card history, and the doors into both studios. |

**Summer School** — the season, and only the season.

| Section | What it is for |
|---|---|
| Summer School | The whole coordinator workspace: editions, groups, intake, roster, kiosk, records. One door, fifteen panels. |
| Attendance duty rota | Who is on register duty when. |
| Baseline & endline | The assessments taken at the start and end of an edition. |

**Content** — sessions, missions, the Anchor Journal app, assignments,
events, posts, photo review, comments, community, tournaments, promotions,
announcements, forms, site content, public status pages.

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
  infractions and sanctions.
- **Fees**: balance, payable now and recent ledger entries. Only for `fees`.
- **Curriculum**: how far through their course they are, what is overdue and
  what comes next.
- **Companion**: the last six weekly assessments.
- **Family & mentor**: the guardian on the record, family accounts linked to
  them, and their mentor with meetings in the last 90 days.
- **Classes**: their course's classes on their centre's timetable.

A tab you have no permission for says so. "Not part of your access" is not the
same as an empty ledger, and the screen never shows one as the other.

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

---

## Centres

**Members → Centres.** A centre is a place. Adding, editing and retiring one
needs the *Members* (`people`) permission. **Add a centre** is at the top of
the page.

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
- **Start from**: a centre's official week (its classes come in and can be
  changed — instructors are never named), the sample school week, or blank.
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

### Structure — what the season *is*

- **Editions & groups** — the important one. See below.
- **Academy catalogue** — Summer School's academies and courses for the season. The NGG Club keeps its **own** course list under **Curriculum → Courses**; editing one never changes the other.
- **Programme & policy** — the rules of the season.

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

The family pays through the link (Paystack), or by bank transfer or cash.

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

### Watching the training fee

**Dues & fees → Training fees** (needs `fees`; a centre-scoped admin sees their
own centres). One row per NGG member who carries a training fee or is in their
training months: what has been **charged** (and how many sessions, days or
weeks that is), how much service has **covered** (earned off, plus anything
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

### Uploading a sheet of fines

**Dues & fees → Upload fines** (needs the `fees` permission). For a register
of fines kept on paper or in a spreadsheet.

1. **Choose your sheet** — an **Excel workbook (.xlsx)** or a **CSV** (commas,
   semicolons or tabs). Or download the CSV template. Columns are found by
   their heading: *member* (printed ID or member number), *name*, *email*,
   *amount* (or **Fine**), *reason*, *date* and *note*; common headings ("Member
   No", "Comments", "Offence", "Outstanding fine") are recognised and any other
   column (a subscription or commitment fee, say) is ignored. If the sheet has
   **no reason column**, type one reason for every row ("Outstanding fine,
   term 1") in the box that appears. A PDF cannot be read — in Excel or Google
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
   - Amounts may be written `5000`, `₦5,000` or `5k`. Dates may be
     `2026-10-04` or `04/10/2026` (day first).
   - Reasons: *late*, *absent*, *equipment*, *conduct*; anything else is kept
     as the written reason.
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

### Family accounts — parents and guardians

**Control Room → People → Families.** Needs `people`; a centre-scoped admin
sees and decides only their own centres' children.

Parents sign in at **/family** with their own email — a six-digit code, no
password. The account is laid out like the other portals: their children down
the left (along the top on a phone), and five screens for the child chosen —
**Today** (what needs them, with one-tap *will be away*, *lost ID card* and
*question a charge*), **Attendance & conduct**, **Fees** (with *Pay online*),
**Lessons & timetable** and **Messages to the centre** — plus *Emails &
connection*. The address carries the child and the screen, so a shared link
opens the same place. It is a separate account, not a member account: it cannot open
any member page, and nothing in it can reach the Control Room. On it they see,
for each child: today's sign-in (late, and by how much), attendance this term,
conduct and fines, fees due, lesson progress and the weekly check-in. They
**never** see the child's journal, reflections, coach chats or messages.

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

From the family account a parent can tell the centre a child will be away,
appeal a charge, or ask for a replacement card. These arrive in **Member
requests** marked *From their family account*, and your reply is emailed to
the parent as well as the member. A parent cannot claim a payment — an
offline payment needs a verified receipt, which is the member's path.

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
| `/mentor/ngg` | NGG pod, peer and lead mentors; coordinators and admins (as coordinator) | This week, Mentees, Goals, Sessions, Saturday (Before / During / After), Messages, Pod growth (Leadership Index), **Class** (Stars, School results, Curriculum) and **My role** (role, Academy, hub). The Saturday schedule sits under each page's own work, not above it |
| `/mentor/summer` | Summer School mentors; admins | This edition's participants only: stars, notes, reviews, concerns |
| `/mentor/class` | An NGG mentor: the portal's **Class** area (`?tab=results` / `?tab=curriculum` open those tabs). Anyone else with the class tools (an admin with no pod): the stand-alone class page | Stars, V3, notes, curriculum, school results |
| `/instructor/ngg` | NGG instructors (Instructor Portal) | Today, Roll, Plan (hinge, exit, retrieval from earlier weeks), Teach, Exit ticket, Session log, Skills board (evidence to move a child up), Marking, Curriculum, Students, Community, School results, Report a concern |
| `/instructor/summer` | Instructors who also teach Summer School | That edition's participants only |

`/mentor` sends a person with one portal straight to it and shows a chooser to anyone who
covers both programmes. A coordinator over several centres switches centre at the top of every screen.

**Saturday Formation Schedule** (Control Room → Learning → Saturday formation, `content`):
the 8:00–2:00 day, block by block, with what members do, what mentors watch for, what
instructors deliver, what admin must have ready and what families are told. Every portal
and the Saturday reminders read this one table; edit a block and they all change. On the
Saturday register a mentor ticks, per child, the values seen and the duties: On time
(the gate's arrival time is shown), Assignment in, Checked out — and can **Add detail**: one line
(up to 500 characters) of what they saw, saved with the register. It shows under the child's name,
opens the weekly review ("Noted: …") and joins the child's timeline. A child's name on the register
opens their profile; **Go to the weekly review** takes the mentor straight to After.

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

Three different queues, for three different things:

- **People → Applications** — year-round NGG applications. Accepting an NGG
  applicant sends the joining invoice (see *Joining fees* under The NGG Club).
- **Summer School → Pending sign-ups** — this edition's intake.
- **Content → Photo review** — photographs submitted by members,
  volunteers and Summer School participants, waiting on approval before
  they appear anywhere or print on a card.

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
- **18 and over** is not refused, it is sent to **NGV registration on
  Afrovanguard** (`afrovanguard.ngv_url` in `api/config.php`; empty means
  `{org_url}/academy/ngv/`).
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

**Make cards.** The left column is everyone who needs a card: **New** (never
printed), **Reprints** (asked for again), **Blocked** (no photo yet — press
*Ask for photo*, or *Ask everyone blocked* to ask up to 200 at once). A
member is told how to add a photo (Edit profile on their dashboard), in the
app and by email, and a child member's guardians are told too; a Summer
School participant's guardian is emailed; a volunteer is emailed and asked to
reply with one. The admins for their centre get one summary per press. The
row then says when they were asked; asking again within 3 days needs *Ask
again*. A member printed for the first time is given their ID number when you
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

## File storage (Cloudflare R2 or Backblaze B2)

When Cloudinary's plan runs low, give the site a **storage bucket** instead.
Once one is set in Control Room → Settings → **API keys → File storage**, every
new upload (headshots, avatars, covers, proofs, hand-ins, community posts, school
reports) goes to the bucket. **Nothing already on Cloudinary moves or breaks**:
those photos keep showing from where they are.

- **Which one.** **Cloudflare R2** is the recommendation: 10 GB free, and you
  never pay for people viewing files (Cloudinary counts every view). **Backblaze
  B2** works the same way (10 GB free, then about $6 per TB a month). Any other
  S3-compatible store (Amazon S3, Wasabi) works too.
- **Setting it up** takes the endpoint, the bucket name, an access key and its
  secret, and the bucket's **public address**. `docs/SETUP.md → File storage`
  has the steps for R2 and B2, including the one rule the bucket needs (CORS)
  so browsers may upload to it.
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

## Image storage (Cloudinary)

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
  the plan itself needs upgrading on cloudinary.com.

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

- Search boxes match **partially** and ignore case. On the member roster,
  the same box covers name, member ID and email.
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
| Members (children and young people) | A private question · a 6-digit PIN · an authenticator app · a code by email |
| Instructors, volunteers and mentors | An authenticator app · a code by email · a 6-digit PIN |
| Guardians | A family PIN · an authenticator app · a private question |
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
  - **Let them in without it for 10 minutes.** This is for a child at the desk
    who has forgotten their answer. Do it only with the person in front of
    you. It is one person at a time, never a bulk action. If they are already
    on the question screen, they press "I've been let in by staff" and they
    are in. Every let-in is in the audit log.
  - **Reset.** Clears what they set, so they choose a new one.
  - **Require it** of one person, whatever the policy. **Back to the policy**
    undoes that.
  - **Email a reminder** to set it up. At most one every 3 days.
- **Five wrong answers** pause that person's second step for 15 minutes. A
  let-in also lifts the pause.

---

## Things that go wrong, and what they mean

| What you see | What it means | What to do |
|---|---|---|
| A section is missing from the sidebar | You do not have its capability | Ask a super admin; check **Access & roles** |
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
| "Not a Member ID or email" at sign-in | Older builds refused card numbers | Card numbers (`VOL-INS-26-001`, `026-014`) are accepted now |
| A child cannot remember their sign-in question | Their second step | **Members › Sign-in security** → their row → *Let them in for 10 minutes*, or *Reset* |
| "No phone on your record" at the card door | The volunteer record has no phone, so the card can never be checked | Use *Email me a sign-in code instead*, or add their phone |
| A screen looks empty | Almost always a filter | **Clear all filters** |

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
