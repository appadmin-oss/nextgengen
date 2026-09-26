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
5. [Members](#members)
6. [Centres](#centres)
7. [Summer School](#summer-school)
8. [The NGG Club](#the-ngg-club)
9. [Applications, sign-ups and verification](#applications-sign-ups-and-verification)
10. [ID cards](#id-cards)
11. [How bulk actions behave](#how-bulk-actions-behave)
12. [Searching and filtering](#searching-and-filtering)
13. [Things that go wrong, and what they mean](#things-that-go-wrong-and-what-they-mean)
14. [Before you press it — the warnings list](#before-you-press-it--the-warnings-list)

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
Summer School on *Gate links*, `qr` opens it on *QR cards*. Old bookmarks
and old links keep working; there is just one screen behind them now.

---

## What you can see and do (permissions)

Access is built from **capabilities**. A role is a bundle of them, and an
individual can be granted extras on top. Both are set in
**System → Access & roles**.

| Capability | Unlocks |
|---|---|
| `content` | Sessions, missions, posts, events, forms, photo review, site content |
| `people` | Members, applications, volunteers, mentors, centres, ID cards, conduct |
| `inbox` | Newsletter, messages |
| `settings` | Settings, diagnostics, integrations, donations, site content |
| `rbac` | Access & roles, and resetting somebody's 2FA |
| `summer` | The Summer School sections |
| `club` | The NGG Club portal |
| `audit` | Audit log, Engagement, the M&E view |
| `journal` | The institutional journal |
| `fees` | The fee ledger and dues reminders |

The roles:

| Role | Capabilities |
|---|---|
| Super admin | everything |
| Admin | `content`, `people`, `inbox` |
| Summer coordinator | `summer` |
| Club coordinator | `club` |
| Editor | `content` |
| Audit / M&E | `audit` |

Two of these are **deliberately not bundled** and have to be granted
per-person:

- **`fees`** — the fee ledger is money. A member-desk admin does not get it
  by being a member-desk admin.
- **`journal`** — writing the programme's institutional record is a
  different trust from publishing site content. An editor is not
  automatically a journalist.

### Centre scoping

A staff account can be **scoped to particular centres**. If yours is:

- The member roster only ever shows you members at your centres, including
  when you export, count or select-all. There is no filter you can clear to
  see past it.
- A bulk action refuses any row outside your centres and tells you which.
  It does not silently skip them.

Scoping is enforced when the request arrives, not by hiding buttons — so it
holds even if a stale page is left open.

---

## Members

**People → Members.**

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
  `docs/ROSTER-IMPORT.md` if you maintain that workbook.
- **+ New member** creates one by hand.

### History

Every change a staff account makes is written to the **audit log**
(System → Audit trail) with who, what and when. A bulk run is **one** entry
naming the action, the count and every refusal — not one entry per row —
so "who suspended forty people on Tuesday" has a readable answer.

---

## Centres

**People → Centres.** A centre is a place. Adding, editing and retiring one
needs the *Members* (`people`) permission.

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

**Centre codes are unique across the whole system**, not per year. The code
is the prefix on printed member ID cards, so changing one changes what new
cards say.

---

## Summer School

**Summer School → Summer School.** One workspace, fifteen panels, grouped by
what you are actually doing.

### Structure — what the season *is*

- **Editions & groups** — the important one. See below.
- **Academy catalogue** — the academies/courses on offer.
- **Programme & policy** — the rules of the season.

### Intake — getting children in

- **Intake form** — build the form families fill in.
- **Gate links** — the shareable sign-up links.
- **Pending sign-ups** — applications waiting on you.
- **Enrol at the desk** — enrol somebody in front of you, right now.
- **Bulk import** — paste a CSV of participants; each row is enrolled and
  QR-bound, respecting capacity.

### Running — day to day

- **Roster** — the edition's participants.
- **Check-in kiosk** — the screen you leave open at the door.
- **Attendance** — the registers.

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

### Promoting into the Club

The **promotable** list is the Summer School participants who look ready:
searchable, paged, with an attendance figure alongside each. A **no contact**
flag marks rows with no reachable guardian — promote those with your eyes
open.

Select and **Promote into the Club**, up to **200** at a time. Promoting in
bulk runs exactly the same promotion as promoting one person, so the two
cannot drift apart.

### The Club roster

Search, filter by participation status and centre, sort, page. Statuses are
**Active**, **Graduated · NGG** and **Inactive**.

Bulk actions on the Club roster are deliberately narrower than the member
desk: **set participation** and **post to centre**, up to **500** rows. The
Club roster is not where member lifecycle is administered.

---

## Applications, sign-ups and verification

Three different queues, for three different things:

- **People → Applications** — year-round NGG applications.
- **Summer School → Pending sign-ups** — this edition's intake.
- **Content → Photo review** — photographs submitted by members,
  volunteers and Summer School participants, waiting on approval before
  they appear anywhere or print on a card.

Photo review matters more than it looks: a member with no approved
photograph prints a card with a blank where the face goes. The **Missing:
photo** filter on the member roster is the list of people that will happen
to.

---

## ID cards

There are **two studios**, and they do different jobs. Each names the other
on screen, so you do not have to remember which is which.

| | **Card Studio** (`/cards`) | **Design Studio** (`/designer`) |
|---|---|---|
| What it is | Prints the **standard** cards for all three subjects | Draws layouts, binds them to your own fields, publishes them, prints them |
| Layout lives | in code — fixed | in a template you edit |
| Use it when | you want the standard card, in quantity | you want a card **back**, or a layout change |

The Card Studio has a tab per subject: **Participants**, **NGG members** and
**Volunteers**. Each one prints that subject's own standard card, and each
says what is true of it — a member card is fixed at 54 × 85 mm (ID-1, a
wallet slot), so the trim setting on that screen is switched off with a note
saying so; it governs the Summer School and volunteer cards only. Members
have no *Resend ID* button because a member issues their own card from their
dashboard.

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

## Quote of the week

**Content → Quote of the week** (needs the `content` capability). The home page
shows one saying a week, taking turns by language: **Hausa 1, Igbo 1, Yorùbá 1,
then Hausa 2, Igbo 2, Yorùbá 2**, and so on. The number beside each saying in a
language's list is its turn. The strip at the top shows the next nine weeks as
"Hausa #1", "Igbo #1"… A language with nothing live sits out until it has one,
and the same language never shows two weeks running.

- **Add / edit** — the saying in its language, the English translation, the
  answer (riddles only) and the deeper meaning. *Hidden* keeps a saying but
  takes it out of the rotation.
- **↑ / ↓** — change a saying's turn within its language.

### Voices

Each saying is read aloud on the home page in two parts: **the saying in its
own language, a short pause, then the English translation**. Visitors can turn
the English part off ("English too").

- **Automatic** — with a Spitch key set (`'tts' → 'spitch_key'` in
  `api/config.php`), saving a saying voices it straight away. **Voice
  everything missing** fills in any gaps (40 per press). As a backstop, this
  week's saying is voiced the first time the home page asks for it.
- **Default voices** — pick the voice for each language and for the English
  part. Regenerate a saying to hear a new choice.
- **A person's voice-over** — **Record** or **Upload** on a saying. It always
  wins over a generated voice and is never replaced without asking.
- **Cloned voices** — *Clone a voice from a recording*: a native speaker
  records 10–30 seconds and you type exactly what they said. You must tick that
  they agreed. Their voice then appears in every voice list.
- Yorùbá written without tone marks is tone-marked before it is read, so it is
  pronounced correctly. Write sayings with their marks where you can.
- Changing a saying's words remakes its generated voice; changing only the
  translation remakes only the English part.

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
