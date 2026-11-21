# Online NGG members — the plan (17 Nov 2026)

## The owner's words

From the voice note of 16 Nov 2026 and the replies of 17 Nov:

> "Can we have the Next Generation Genius Club become a global thing … ten dollars per month …
> if you seek scholarship … on site … you choose Egbeda or Ayobo or any other centre. But if you choose
> online you just have to be paying ten dollars per month, that's ₦13,000 per month … choose whatever
> course they want … get a mentor … accountable, follow the journal … community … a timing for them on
> Saturday … online mentors who will talk to them via the portal … onboarding … a recruitment portal …
> for the scholarship they pay for the T-shirt, pay for the commitment fee ₦2,000 … online: $10 every
> month."

Also from the owner: "1. Yes" (online members are a new kind of member who never attends a centre), and
"Theirs is monthly prepayment".

## Decisions

Assumed defaults are marked *default*. The owner can change any of them.

| | On-site (scholarship) | Online |
|---|---|---|
| Home | A centre (Egbeda, Ayobo, …) | **NGG Online**, a real `centres` row with no CACENTRE link |
| Money | T-shirt + commitment fee ₦2,000 a month (the existing dues) + the membership fee | **$10 a month, shown as ₦13,000, paid before the month** (the owner's "monthly prepayment"). No T-shirt, no membership fee (*default*) |
| Attendance | The gate, check-in, absence rules (docs/POLICY.md) | **None of those apply.** The Saturday online session and Labs/Learn activity are the record |
| Card | Printed ID-1 card | Digital card only: the existing dashboard card and QR (*default*) |
| Mentor | Centre mentors | **Online mentors**, recruited through their own intake, who reach members through the portal |
| Course | The centre's courses | Any NGG course |
| Community, journal, Labs | Yes | Yes |

**Why a real centre row and not a blank centre.** Staff scoping, mentors, timetables, notices and the
registration checklist are all keyed by centre (see the survey in this plan's appendix). With a blank
centre, every scoped desk would lose sight of the member.

**The name is "NGG Online", never "Online".** `events.centre = 'Online'` already means "every member",
so a centre literally named "Online" would collide with it.

**It is seeded by migration.** Once CACENTRE's list has arrived, a centre cannot be added by hand
(`managed_by_cacentre`). The sync never touches an unlinked row unless CACENTRE lists that name.

**Online membership is not prorated.** The first month of an online membership is charged in full: the
member is paying for access to the platform, not for meeting days. On-site joining is unchanged.

## Phases

1. **The home and the guards.** Must be done before anyone joins online.
   - A migration seeds the `NGG Online` centre with `online = 1` and `programmes` set to `ngg`.
   - A helper, `centre_is_online()`.
   - Skip online members in every job that would punish someone for not checking in:
     - `policy_sweep_member_absences`
     - the outage brake
     - `make_absences_run`
     - `attendance_daily_run`
     - `companion_rate` (at-risk)
     - status-board centre issues
     - the growth score's attendance weight, which is reweighted
   - Keep it out of the ID Card Studio's print plan.
   - Tests: an online member is never fined, flagged at risk or reported absent.
2. **Joining.**
   - The join form asks "At a centre (scholarship) or Online ($10 / ₦13,000 a month)".
   - Online hides centre-only copy ("Come to Egbeda on Saturday") and shows the online Saturday session.
   - The server accepts the NGG Online centre.
   - Accepting an online member sends a prepayment invoice for the first month only.
3. **Money.**
   - Settings: `onlineMonthlyNgn` (13,000) and `onlineMonthlyUsd` (10), shown together.
   - Online members accrue that amount monthly instead of the commitment fee.
   - Prepaid: a month is owed on the 1st, notices arrive before it, and pay-ahead is allowed.
   - "Membership lapses when unpaid" uses the existing dues reminders. Lapse rules are left to the owner.
4. **On-site scholarship completion.** The defect the owner reported.
   - Joining at a centre adds a T-shirt line to the joining invoice (setting: `tshirtFee`, with a size
     field on the form).
   - Every step after applying is visible to the family and to the desk: applied → accepted → invoice
     paid → T-shirt issued.
   - First fix, done 17 Nov: a mentor application could be "accepted" without a mentor being made, and
     then vanished. See docs/HANDOFF.md.
5. **Online mentors and the Saturday session.**
   - A mentor application chooses "online".
   - Online mentors are paired with online members.
   - A recurring online Saturday session: the link, the time (8:30, the same as the centres), and
     attendance by joining it through the portal.
6. **Staff management.**
   - An "Online" view in the Control Room: who is paid up, who is active in Labs/Learn this week, who has
     no mentor, who missed the online session.
   - Centre-scoped staff can be scoped to NGG Online like any centre.

## Open with the owner

- **Lapsed online members.** Does an unpaid online member lose access after a grace period? How long?
- **Currency.** Is the USD price charged in dollars to members abroad (Paystack supports USD for
  eligible merchants), or always as naira?
- **Fees.** Do online members pay the yearly membership fee, or only the monthly $10?
- **T-shirt.** What does it cost, and is it the same for every centre?

## Appendix: where the code assumes a physical centre

This is the survey of 17 Nov 2026, kept here so the phases can be checked against it.

- **Joining**
  - `public_apply` (events.php ~634–810), `club_apply_details` (~973)
  - page-apply.jsx: the required centre field (~109) and in-person copy (~1070–1112)
  - `admin_application_convert` (admin2.php ~960–1141)
- **Centres**
  - `admin_centres_upsert` refuses new centres once CACENTRE is in charge (registration.php ~3097)
  - The sync rules (cac-locations.php ~26–173)
- **Money**
  - One global `fees` setting (fees.php ~67–80, 312); no per-centre or per-category amount
  - `membership_prorate` uses the centre's meeting days (membership-pay.php ~102)
- **Attendance**
  - `policy_sweep_member_absences` (policy.php ~2013–2083) and the outage brake (~1126–1168)
  - `make_absences_run` (make.php ~67)
  - `attendance_daily_run` (parent-reports.php ~666)
  - `companion_rate` (companion.php ~37–87)
  - Status-board centre issues (status.php ~158)
  - The growth attendance weight (growth.php ~53)
- **Cards**
  - The digital card already exists: `DashboardIdCard`, the "gate pass" QR, and `/q/` verification
  - The card shows a "CACENTRE <centre>" chip (card-template.jsx ~1108)
- **Scope**
  - `admin_centre_names_in_scope` / `admin_member_scope_gate` (util.php ~632–708) map through
    `centres`, so the home must be a row
- **Content filtered by centre**
  - Events (the `'Online'` sentinel), assignments, the timetable (`tt_for_centre`), notices, Today,
    Saturday formation, community homework peers
- **Not filtered**
  - Labs, Learn, curriculum, and Community channels

## Owner decisions, 17 Nov 2026 (later)

> "The online members do not pay the yearly fee. Registration is $10 comes with a mentor... Each course
> should be $5 with instructor. Upgrade the value of being an online member so the pay is actually worth it."

- **No yearly membership fee** for online members. This replaces the open question above.
- **$10 registration includes a mentor.** Read with the voice note's "$10 per month, prepaid monthly",
  this is the monthly online membership, and the mentor is part of it. *To confirm with the owner:* is the
  $10 a one-off registration or the monthly price?
- **Each course is $5, with an instructor**, on top of membership. *To confirm:* is that $5 per course,
  per month, or once per course?
- **Make it worth paying for.** The value case to build in phase 2 onward:
  - a named mentor and a monthly 1:1 check-in
  - a live online Saturday session
  - an instructor per course, who gives feedback on submitted work
  - the Labs (Maths, Physics, English) with exams and certificates
  - verifiable certificates per course
  - the journal, with mentor replies
  - Community
  - a progress report to the family every month
  - a digital member card

## Built, 21 Nov 2026 (phases 2, 3, 5 and 6)

Phase 1 was `35217954`. The rest is built. Defaults are where the owner had not decided; each one is a
setting.

- **Joining (phase 2).** The join form asks "How will your child take part?": *At a centre* or *Online*,
  with the price. Online removes the centre question; the server places the applicant at NGG Online
  (`public_apply` `mode: online`). Summer School cannot be joined online. Staff switch Online off under
  Members → Online.
- **Money (phase 3).** `fees_member_monthly()` is the one answer for what a member pays a month. It is read by
  the joining invoice, the accrual, pay-ahead and the advance notices. An online member pays:
  - `onlineMonthly` (₦13,000, shown as $10), owed on the 1st and never pro-rated, with a mentor included;
  - `onlineCourseFee` (₦6,500, shown as $5) for each course they take, with an instructor;
  - no membership fee, no commitment fee and no training place.
  - **Default, to confirm:** the course fee is **per month** (`onlineCourseBasis` `month`). `once` charges a
    course one time.
  - **Default, to confirm:** the $10 is **monthly** (the voice note), not a one-off registration.
  - Course charges are posted for the current month only, because when a course was chosen is not recorded.
  - Only catalogue courses are billed, never "Other" free text.
- **Online mentors and the session (phase 5).**
  - The mentor form asks "Where will you mentor?". *Online* places the applicant at NGG Online.
  - Members → Online pairs online members with online mentors through `admin_assign_mentor`, one at a time
    or "everyone without a mentor".
  - The online session has a link, a day, a time (Saturday 08:30 Lagos by default) and a length.
  - Online members press **Join** on the portal's Saturday screen. That records attendance
    (`online_session_joins`, migration 247) and only then hands over the link.
- **Staff (phase 6).** Members → Online shows who is owing, who has no mentor, who missed the last session and
  who was quiet this week. It also holds the session settings. The online prices are under Money → Dues &
  arrears → Amounts → NGG Online.

**Still open with the owner:** the $10 (monthly or one-off), the $5 (per month or once), what happens to an
unpaid online member's access (nothing automatic is built), and dollars or naira for buyers abroad (naira
today; the dollar figure is what families are told).

