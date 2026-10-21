# HANDOFF — for the next agent

**Delete this file when you have finished the work in it** (and append what you
did to `docs/HANDOFF.md`, which is the permanent log — never rewrite that one).

Branch: `claude/finme-dues-training-fees-l54o5j`. No PR. Fetch and merge before
pushing. Never commit `api/config.php` (`git add -A && git reset -q api/config.php`).
Commit trailers:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MrRoWy2syTb9DhJTxkdYka
```

The owner's standing rules: never patch with `!important`; no lazy builds;
every feature completely functional; don't ask, decide. After each batch: build
(`node build.js`), PHP suite (`php api/tests/run.php`), the browser suites the
change touches, docs (`docs/ADMIN-GUIDE.md`, append `docs/HANDOFF.md`), commit,
push, and a production zip built in the scratchpad (`ngg-production.zip`,
excluding `api/config.php`, `*.log`, `api/_cache`, `api/logs`, `api/storage`).
HawkScan cannot run here (no `HAWK_API_KEY`).

Dev-mode boot takes about a minute (Babel in the browser); browser suites need
`waitForBoot` and run 10–25 minutes each. They write a throwaway
`api/config.php` and refuse to run if one exists — run them one after another.

---

## Done and pushed (commit 3daf0f50, 2026-10-21)

Academy gate (browse, no saves until complete) · one conversation per child in
mentor Messages, leads reach any child at their centre · staff shown to
children/families as title + surname (migration 165) · editable Saturday plan
(`Mp15Agenda`) · ID Card Studio assistant fixes (filtered vs not found,
`kindOf`, `notKinds`, several acts, improve/position photos, 📎 photo upload,
AI time budget) · `StaffCurriculumMap` (course → year → term → week) · growth
report (`mp_growth`, mentor Growth tab + pod table, family Growth screen).
Details: the last entry in `docs/HANDOFF.md`.

Verified at that commit: PHP suite 4921/0; mentor-v15 65/0; instructor-v6
24/0; ids-studio 59/0; volunteer-edit 14/0; community-v3 37/0; member-v9 37/0;
`tests/ids-ask-select.test.js` 15/0. ids-ask had 1 real failure, fixed after
(an unreadable request re-applied the plan) — re-run it.

## In progress (update this list as items land)

1. **Device-aware guides with real screenshots** (owner asked: guides tailored
   per device, screenshots, a walkthrough when someone moves to a new kind of
   device, and onboarding for children — not an Academy).
   - `src/modules/guide/guide.jsx`: tours now carry `{ shot, phone, desktop }`
     per step; `GuideShot` shows `assets/guide/<shot>-<phone|desktop>.jpg`;
     `GUIDE_DEVICE_TOURS` is the "first time on a phone / computer" tour,
     shown when someone who has done the tour opens the portal on a device
     class not in `onboard.<portal>.devices`.
   - `tools/guide-shots.js` seeds a demo programme and takes the pictures.
     NOT YET RUN. Run it, look at every picture, fix what is wrong.
   - Still to do: CSS for `.ngt-shot` / `.ngt-where`; the Academy's "Start
     here" lessons get a `shot` each (seeds JSON) and `StaffAcademy` shows it;
     `tests/guide.test.js` (every named shot exists at both sizes; the device
     tour appears for a new device class) added to `test:all`.
2. **Browser re-runs pending**: mentor-v15, instructor-v6, family-ui, ids-ask,
   curriculum-ui (new checks for Growth, the curriculum map, the family Growth
   screen). A batch was running when this was written.

## Asked by the owner on 2026-10-21, not started yet

3. **AI: no provider choice for the operator — route automatically.** Use the
   best model for the job: free-tier models (Groq, Gemini free, OpenRouter
   `:free`) do the bulk; paid models (Claude, OpenAI) only do the hard thinking
   ("braining"), and only under a **spend limit** set in settings. Track
   estimated spend per call; when the limit is reached, paid models are
   skipped. The assistant's "use Gemini" talk can stay quietly but must not be
   advertised. (`api/_lib/ai.php`: `ai_run`, `ai_profile_candidates`.)
4. **Extra Cloudinary accounts** for more credits and storage: several sets of
   keys; uploads go to an account with room; credits exhausted on one moves to
   the next; set in Control Room (the image-storage settings).
5. **Faults in the owner's screenshots:**
   - Registration "About your child": a broken icon box above "ID card:
     ELEYINMI…"; errors shown before the person has finished a field (email
     while typing, the mobile number "This is required" before it was
     reached) — validate on blur / submit.
   - ID Card Studio assistant: lower-case typed names shown as chips
     ("ayomide abubakar") — show the record's name once matched; the "last
     sheet has 6 empty slots" row squeezes into a narrow column — let the
     action wrap below.
6. **The assistant's input is not smart enough**: suggest people as you type
   (no @ needed), accept with Tab; understand pasted numbered lists; offer the
   next useful requests for what is on screen.
