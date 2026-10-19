# Handoff — Club portal v3 + Community redesign (work in progress)

> **To the agent picking this up:** read this whole file first, then `CLAUDE.md`.
> Update this file as you go. **Delete this file in the final commit once every
> item below is done** (and record what shipped in `docs/HANDOFF.md`, which is
> append-only).

Branch: `claude/finme-dues-training-fees-l54o5j`. Push with
`git push -u origin claude/finme-dues-training-fees-l54o5j`.

## Session rules the user set

These rules are verbatim:
- "Do not ever patch with !important. NEVER!"
- "No lazy build"
- "All features completely functional"
- "don't ask tho"

Other rules:
- Never commit `api/config.php`. After `git add -A`, run `git reset -q api/config.php`.
- Tests write a throwaway config and refuse to run if one exists.
- After changes, build `dist/` and send the user a production zip.
  - Build it in the scratchpad.
  - Exclude `api/config.php`, `*.log`, `api/_cache`, `api/logs` and `api/storage`.
- End every commit with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019M1o9QaaXoo7SqBbC7nj8n
  ```

## What the user asked

The user uploaded `Dashboard_redesign_planning.zip`, which is really a handoff for two products:
- **NGG Club staff portal v3**: the dashboard, the command palette, Saturday readiness, the AI weekly brief and roughly 22 sections.
- **NGG Community**: the feed, composer safety check, viewers and moderation.

Their words: "implement with accuracy. Build out features that may not exist. Ensure it is properly in sync. Roles are properly assigned."

They added:
- "Centre lead for NGG differs from that of summer". This is done; see below.
- "Club admin manages all centres". `club_admin` is unscoped, and the portal keeps it that way.

The design files are already in the repo:
- `docs/design/portals/club-portal-v3.dc.html`
- `docs/design/portals/student-directory.dc.html`

The original zip is unpacked at `/tmp/claude-0/-home-user-nextgengen/e214c1e0-ccbe-567f-9231-aa75bfb430ba/scratchpad/dash-redesign/design_handoff_community_club/`. That folder also holds `COMMUNITY.md`, `CLUB_PORTAL.md`, `DATA_MODEL.md`, `tokens.json`, `screenshots/` and `design/Community.dc.html`.
- **If the scratchpad is gone,** ask the user to re-upload the zip. You need it for Community.

## Done and pushed

**Commit `826b561`: separate NGG and Summer centre leads, and the Club v3 design compiled.**
- Migration 160 adds `centres.summerLeadVolunteerId`.
  - It is NULL until set.
  - For MySQL, the backfill lives in `NGG_MYSQL_ROW_FIXUPS['centres.summerLead']`.
- The centre editor and the directory show both leads.
- Public Summer pages use the Summer lead.

**Commit `b76141f`: Club portal v3 server layer.**
- The domain is `api/_lib/domain/club-portal.php`; the route is `api/admin/club-portal.php`. All ops are `admin.clubp.*`.
  - The gate is `club`. Only NGG centres appear, and scope is checked per row.
- Ops:
  - boot, dashboard, section (13 generic sections), decide, create (8 forms)
  - checkins and checkin (tell, seen, unseen)
  - consents, consent.set, consent.link
  - ann.list, ann.reach, ann.save (an approval workflow, with a web-cron job `club_ann` for scheduled sends)
  - brief and brief.send (`ai_complete` with a deterministic fallback)
  - search
- Migration 161 adds:
  - the tables `club_announcements`, `club_checkin_state` and `conduct_rules`
  - the columns `attendance_duty.startTime` and `endTime`
- `fees_post` now enforces conduct rules: a rule that is off posts nothing, and a cap holds per term.
- The roster op `admin.club.members` gains a `track` filter and `counts`.
- Safeguarding accepts `in_progress`.

## Done since (committed with this file)

- **Directory ops** in `club-portal.php`: `directory`, `register`, `message`, `dir.bulk` and `dir.save`. They are registered in `backend.php` and the route.
  - PHP suite: **4779 passed**, including the new Club portal and directory checks in `api/tests/run.php`.
- **Compiler:** `tools/dc-compile.js` now supports `<dc-import>`. It emits `dcImport(v.dcImports, name, props)`, defined in `src/modules/dc/dc-runtime.jsx`.
- **Client:** these files live in `src/modules/club3/`.
  - `cp3-view.jsx` and `sd3-view.jsx` are generated; never edit them. Recompile commands are in each file's header.
  - `cp3-subs.json` holds the sample-text substitutions.
  - `cp3-meta.jsx`: the nav, section metadata, row decisions, forms and tournament options.
  - `cp3-app.jsx`: the `Cp3Portal` controller.
  - `cp3-directory.jsx`: `Sd3Directory`, the embedded roster.
- The files are added to `build.js` ORDER and `index.html`.
- `/club-admin` now mounts `Cp3Portal` through `PortalGate ... bare`, a new prop in `page-portals.jsx`. The old `ClubManager`, `ClubPromote` and `ClubRoster` are now unused.
- CSS was appended at the end of `styles-app.css`:
  - `.cp3x*`
  - `dvh` fixes for the compiled roots
  - no `!important`
- `node build.js` passes.
- New test `tests/club-portal-v3.test.js`: 5 out of 5 pass, dashboard only so far.

## Next, in order

1. (done) Commit and push.
2. (done) **Fix the two failing checks in `tests/club-portal-v3.test.js`.** It now has 13 checks; 11 pass.
   - Passing: dashboard, roster, centre-lead scope, phone tab bar.
   - **Promote list stays on its spinner.** The sidebar badge counts 1, so the
     dashboard's call works, but the screen's call
     `NGGApi.admin.club.promotable({pageSize:200})` had not returned after 20s.
     - Likely cause: `suggestedCentre` road-distance lookups to an external
       service that cannot be reached offline.
     - Check `admin_club_promotable` and `centres-ngg.php`.
     - Either cap or skip those lookups when the service is unreachable, or
       load the list without suggestions and fill them in afterwards.
     - Also make `promoteErr` and slow loads visible on the screen. Right now
       `pEmptyText` only shows once `S.promote` is set.
   - **Palette member search failed.** Ctrl K, then type "tobi"; the expected
     text never appeared.
     - Check that the Ctrl K handler fires while focus is in the page.
       `onKey` is attached to `document`.
     - Check that `admin.clubp.search` returns, and that `palMembers` renders
       under "Members".
   - Screenshots were taken with `CLUBV3_SHOTS=<dir>`. The dashboard and
     promote shots match the design closely.
3. (done: 48 checks, `npm run test:clubv3`, in `test:all`) **Then extend `tests/club-portal-v3.test.js`.** Drive each item in the browser and fix what breaks.
   - Command palette: Ctrl K, then a member search.
   - Roster: the directory loads, search works, the drawer saves, a centre lead takes the register.
   - Promote: the graduate is listed, the confirm warns about a missing guardian email, and the promotion lands in the database.
   - Permissions: record a consent; the write is deferred by Undo, so wait 7 seconds before checking.
   - Check-ins: Tell mentor.
   - Announcements: a coordinator submits, then an admin approves.
   - Applications: accept is blocked without a photo.
   - Rota: fill a shift.
   - Timetable: add a slot with clash detection, then export.
   - Tournaments: create a tournament.
   - Centre lead: locked to Ayobo.
   - Phone at 390 px: the bottom tab bar is fully on screen.
   - Take screenshots with `CLUBV3_SHOTS=dir` and compare them to `screenshots/club/*.png`.
   - Add the test to `package.json` scripts and to `test:all`.
4. (done) **Rewrite the Club part of `tests/admin-bulk.test.js`.** It currently drives the old two-tab screen.
   - Starting line: `── A club coordinator gets NARROWER actions`.
   - Point it at v3: Promote at `?s=promote`, and the roster bulk actions in the directory.
   - Then delete the dead `ClubManager`, `ClubPromote` and `ClubRoster` from `page-portals.jsx`.
5. (done: routes 60/60, ui 661/661, responsive-staff 3/3, admin-bulk 44/44) **Run the other suites** and fix anything broken:
   - `npm run test:routes`
   - `test:ui`
   - `tests/responsive-staff.test.js`
   - `tests/admin-bulk.test.js`
6. (done; tournaments results stay read-only, results come from games on the chess screen) **Known gaps in Club v3 to close or state honestly:**
   - **Tournaments:** results come from games on the chess screen, so results are read-only in the portal. There is no over-the-board result entry; only add it if it can update ratings properly.
   - **Mentorship row action:** it opens `/control/people/mentorship`. Check that path exists.
   - **ID cards:** "Print" goes to the ID Card Studio.
   - **Desk creation:** shows the generated password once, in a confirm dialog. Check that the `admin.gates.create` response field really is `password`.
7. **Community redesign** (task #36). The gap audit:
   - The existing app is in `page-club.jsx`: `CommunityPage` at about line 882 and `CmMobileApp` at about line 3987.
   - Admin moderation is in `page-admin.jsx`, around lines 5655 and 6812–6994.
   - The server is in `api/_lib/domain/community*.php`.
   - **Missing:**
     - the Home carousel
     - post kinds question, work, announcement and homework, plus the `answered` state
     - the live safety-check rules, shared between JS and PHP:
       - phone numbers
       - unkind words, with a kinder rewrite
       - social links
       - ALL CAPS
       - a video notice
     - students-only hold rules; staff are exempt
     - reaction burst and pop animations, with the client emoji set matched to the server set 👏❤️🔥💡🎉🙌
     - the code editor with live preview
     - video chapters, captions and transcript, plus a resume op
     - moderation queue filters, median review time, and Edit & approve / Message author / Escalate
     - safeguarding severity and lead, gated on the existing `safeguarding` cap rather than `content`
     - a Questions filter and a My posts filter
   - **Approach:** compile `Community.dc.html` with dc-compile, the same way as Club v3, and drive it from a controller on the existing `community.*` ops. Add the missing ops.
8. **Docs.** Update `docs/ADMIN-GUIDE.md` for the Club portal v3, the separate Summer lead, announcement approval and fine-rule caps. Append to `docs/HANDOFF.md`.
9. **Deliver.** Build `dist/`, zip it to the scratchpad as `ngg-production.zip`, and send it to the user.
10. **Delete this file.**

## Gotchas learned

- Babel dev mode logs "[BABEL] Note … exceeds 500KB" as a console error. Tests must ignore it.
- In MySQL, the mirror (`db/schema-mysql.sql`) must contain only CREATE, ALTER and INSERT statements. Data backfills go in `NGG_MYSQL_ROW_FIXUPS` in `db.php`; a check in `run.php` enforces this.
- `members.role` can be NULL. Use `COALESCE(role,'') NOT IN …`; the constant is `CP_STAFF_ROLES_SQL`.
- `json_error($code, $status, $detail)`: `detail` is a string, and the client reads it as `err.detail`.
