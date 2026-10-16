# Portals handoff — progress log

The three portals in the design handoff (Mentor v15, Member v9, Instructor v6),
built on the APIs that already exist. Newest entry first. Append; never rewrite.

## 2026-10-16 · Mentor Portal v15 — shipped at /mentor

**Built**
- Design compiled, not re-drawn: `tools/dc-compile.js` turns
  `docs/design/portals/mentor-portal-v15.dc.html` into `src/modules/mentor15/mp15-view.jsx`
  plus a generated, scoped CSS block in `styles-app.css` (no `!important`, base rules under `:where()`).
  Sample copy that is really data (dates, the officer's name, the policy date) is
  mapped in `mp15-subs.json`; a missing key fails the compile.
- Controller `mp15-app.jsx`: every screen on the existing `member.mentor.*` ops
  (week, caseload, goals, mentee, scorecard, index, sessions, saturday, messages,
  commitments, team, academy and their actions). Each screen has loading, empty and an error with Retry.
- Router: `/mentor` → `MentorHome`. NGG pod/peer/lead/coord mentors get v15;
  instructors, Summer-only mentors and every refusal (sign-in, not cleared, no centre)
  keep the class portal. `?tab=class|results|…` opens the class portal, with a button back.
  "Stars & results" in the nav reaches it.
- Real reports: progress (one mentee) and pod reports, as PDFs in the browser (jsPDF).
- Fonts: Geist and Geist Mono vendored (`assets/fonts`, OFL in `vendor/licenses`).

**Saturday Formation Schedule (8:00am–2:00pm)**
- Not hard-coded in any screen. It is seeded once into `saturday_formation`
  (migration 148) from `sf_blocks_seed()` and read from the table; an admin with `content`
  edits a block with `admin.formation.save` (times, wording, each audience's part).
- `public.formation?audience=member|mentor|instructor|admin|parent` (cached; topic `formation`)
  gives each reader only their part. The mentor portal shows it on This week (next blocks)
  and Saturday (the whole day); the Saturday agenda is now the 8:30 Musing & mentor breakout.
- Reminders and family messages: `sf_tick()` runs in the web-cron (`mpa_tick`). On a Lagos
  Saturday, at each block's start, members checked in, mentors and Saturday instructors get the
  block (in-app). Guardians who take check-in news get the morning plan (8:00), a
  not-arrived notice (8:45) and the close summary (2:00), by email; opted-out guardians get nothing.
  `saturday_formation_sends` makes every send happen once.

**Verified**
- `php api/tests/run.php` — 4354 passed (8 new formation checks).
- `node tests/mentor-v15.test.js` — 10 passed (real login, caseload, scorecard save, session log,
  Saturday, concern, caseload refusal, class portal reachable, no page errors).
- `tests/mentorship.test.js` 28 and `tests/curriculum-ui.test.js` 35 still pass.

**Not done yet (next)**
- Admin screen for editing formation blocks (the op exists; no Control Room panel yet).
- The formation day in the member, instructor and family portals (component `FormationDay`
  takes an `audience`; mount it there).
- Instructor Portal v6, then Member Portal v9.
- Known limits: "Add a note" in the Mentees bulk bar uses a browser prompt; a coordinator
  with several centres sees their first centre (no switcher in the design yet).
