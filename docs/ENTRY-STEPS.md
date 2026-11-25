# NGG entry steps — onboarding that finishes

Owner, 18 Nov 2026, with the paper card *NGG ENTRY STEPS* (Full name · Enquiry ·
Orientation · Payment · Submit documents · Online registration · ID card · Attend
lectures · Supervisor): "Add these to the default acceptance checklist. The day
this is completed is when the child resumes, not that it is added on completion.
Ensure there's massive follow-ups. The MoU is to be printed, signed and brought
to the centre, for it is to be checked; a photo of where it is signed must be
taken. The timetable must be done on the site too."

This page records how each line of the card became the system, and why.

**The order changed on 24 Nov 2026** (owner: "They can register online and make
payments first. Document submission and ID card are the last"): Online
registration · Payment · Orientation · Submit documents · ID card. The card's
lines below are the same; `RCL_STEPS` holds the order.

## The card, line by line

| Card | In the system | Where |
|---|---|---|
| Full name / Supervisor | The member, and their registration helper: their mentor once they have one, else the best person seen at their centre, chosen by itself; staff may choose by hand (owner, 24 Nov 2026). | `reg_checklists.supervisorId`, `rcl_auto_helpers` |
| Enquiry | Done before a checklist exists: the application at /join is the enquiry. The checklist starts when it is accepted. | `admin_application_convert` → `rcl_start_for_new_member` |
| Orientation — policies, membership fee, commitment fee, T-shirt | Default item **Orientation attended**: at the centre, a note of who came. | `RCI-ORIENTATION` (migration 240) |
| Payment — all required fees | **Joining fees paid**: the joining invoice (membership fee + first month's commitment fee). | `RCL_AUTO['fee']` |
| Submit documents — file | Default item **File handed in** (at the centre). | `RCI-FILE` |
| — passport | **Passport photograph** on the record. | `RCL_AUTO['photo']` |
| — MoU | **Membership Agreement (MoU) handed in**: signed online, then the inked paper copy checked and photographed at the centre, then countersigned. | `RCL_AUTO['mou']`, `admin_mou_paper` |
| — report card | Default item **Latest school report card** (a document, dated within 400 days). | `RCI-REPORTCARD` |
| — timetable | **Personal timetable on the site** (19 Nov 2026, "My week"): the member's own timetable at /timetable has school on at least three weekdays AND one thing of the child's own (study or an activity). An NGG session does not count as their own. | `RCL_AUTO['timetable']`, `rcl_timetable_own` |
| Online registration | Guardian linked, consents, date of birth, school, emergency contact, courses. | `RCL_AUTO` (step `online`) |
| ID card | **ID card printed** (a proof is not a card). | `RCL_AUTO['idcard']` |
| Attend lectures | **Not a box.** The day the last item is done is the day the member resumes: `resumedOn`, written once and never moved; the family, member and supervisor are told. | `rcl_refresh`, `rcl_tell_resumed` |

Steps are `RCL_STEPS` in `domain/registration-checklist.php`. Every item carries
one; an admin item's step is chosen when it is saved (`bad_step` otherwise).
Orientation, the file and the report card are ordinary admin items so a
programme lead can reword, reorder or retire them without a release.

## Why "resumes on completion"

A member record is created the day an application is accepted. That is the day
NGG *decided*, not the day the child is ready: no agreement, no fees, no card.
Counting attendance, dues or a cohort from that day mixes children who are
learning with children who have not finished joining. So the checklist's
completion is the date that matters, and it is recorded separately
(`reg_checklists.resumedOn`). The first month's commitment fee is still priced
from the start date set at acceptance (money already invoiced is not
re-priced); if the programme wants that to follow the resumption day instead,
that is a decision for the owner, not a side effect.

## Follow-ups: evidence, then design

The research we leaned on:

- Randomised studies of early-childhood enrolment in New Orleans found that
  **text reminders raised the share of families who completed verification by
  about 7–10 percentage points**, whatever the tone of the message
  ([Educational Evaluation and Policy Analysis, 2020](https://journals.sagepub.com/doi/abs/10.3102/0162373720922237);
  [Research Connections summary](https://researchconnections.org/childcare/resources/38205)).
- The same work found families stalled because the process was **confusing —
  unsure where to take documents and exactly what to bring**
  ([EdWorkingPaper ai19-88](https://www.edworkingpapers.com/sites/default/files/ai19-88.pdf);
  [Brookings](https://www.brookings.edu/articles/can-text-messages-help-families-applying-for-early-childhood-education-programs)).

So:

1. **Front-loaded cadence for the family**: day 1, day 3, day 7, then weekly
   (`RCL_FAMILY_STAGES`), each stage sent once (the sends ledger), stopping the
   day registration is complete.
2. **Every reminder names what to bring and where**: each automatic item has a
   `bring` phrase ("the printed Membership Agreement, signed by a parent and a
   witness"), admin items are "… (at the centre)", and the message names the
   member's centre.
3. **A follow-up is somebody's job on a day**: `reg_checklist_followups` logs
   how (call, WhatsApp, at the centre…), what happened, a note and the **next
   date** — required while the checklist is open. The first is due three days
   after the start. The supervisor is told on the day it falls due.
4. **Escalation**: no progress in 14 days, or a due follow-up with nobody
   assigned, reaches the centre's staff (holding `people`, scoped to the
   centre), once a day each. *They may not continue* goes to the staff inbox.
5. **One list to work from**: Members → Registration → *Needs a follow-up*.

## The paper Membership Agreement

Online signing gives understanding: the plain-words summaries and the five
questions. The **inked copy** is the paper the programme keeps. The flow is:

1. Family reads, answers, signs online → told to **print, sign in ink with a
   witness, and bring it to the centre** (page, email, and a print button).
2. The printed copy carries `MOU-… · version · child's name` at the foot of
   **every page**, so a photograph of any page is tied to the exact text, and
   a section to sign in ink.
3. Staff **receive** it (`admin.mou.paper`): five checks (`MOU_PAPER_CHECKS`),
   all must be true, and a photograph of the signed page — ours (bucket,
   Cloudinary or this site's store), an image read from its own bytes, at
   least 1600 × 1000 px (an A4 page at ~200 dpi; scanning guidance for signed
   consent forms recommends 200–300 dpi). Nothing is written by a refusal.
4. **Countersign** is refused until the paper is received (`paper_first`).
5. The checklist's `mou` item needs both.

A family with no phone or data signs the paper only: staff print it, and on
receipt type who signed, the witness and the off-site answer
(`signedVia = 'paper'`; consents recorded with method `mou_paper`).

## Tests

`php api/tests/run.php` — *entry steps ·*, *follow-ups ·*, *mou paper ·* and
*mou paper only ·* (each proven to fail with its rule removed).
`node tests/mou-sign.test.js` — the family is told to print and bring it; the
Control Room receives the copy with every check and a camera photograph before
countersigning.

## The scholarship, and online members

Owner, 18 Nov 2026: "The MoU does not apply to online members, the agreement varies. The MoU for the NGG should
project that it is a scholarship of 1.5 mil."

- **Scholarship.** `fees.scholarshipValue` (default ₦1,500,000, Money → Amounts) is frozen on each agreement with the
  other figures. Clause 3 is *The NGG scholarship: what NGG provides*; the printed copy opens with an award panel; the
  family's page and both emails show it. Framing the family's payments as a *contribution* and the place as an
  *award* is the point: the family sees what their child receives, and clause 12's early-exit figure reads as
  returning part of a scholarship, not a penalty.
- **Online members** (`member_is_online`) get no agreement: `mou_start` refuses `online_member`, Agreements skips
  them, and the checklist's `mou` item does not apply (`RCL_AUTO['mou']['not'] = 'online'`). Their own terms can be
  added as a second agreement when the programme writes them.
