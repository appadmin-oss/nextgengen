# HANDOFF — for the next agent

**Delete this file when you have finished the work in it** (and append what you
did to `docs/HANDOFF.md`, which is the permanent log — never rewrite that one).

Branch: `claude/finme-dues-training-fees-l54o5j`. No PR. Fetch and merge before
pushing — **another session pushes to this branch too**; check `git log
HEAD..origin/<branch>` before starting anything, and never duplicate work it has
already pushed. Never commit `api/config.php` (`git add -A && git reset -q
api/config.php`). Commit trailers:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MrRoWy2syTb9DhJTxkdYka
```

The owner's standing rules: never patch with `!important`; no lazy builds;
every feature completely functional; don't ask, decide (but when the owner says
"don't build yet", don't). After each batch: build (`node build.js`), PHP suite
(`php api/tests/run.php`), the browser suites the change touches, docs
(`docs/ADMIN-GUIDE.md`, append `docs/HANDOFF.md`), commit, push, and a
production zip in the scratchpad (`ngg-production.zip` from `dist/`, excluding
`api/config.php`, `*.log`, `api/_cache`, `api/logs`, `api/storage`). HawkScan
cannot run here (no `HAWK_API_KEY`).

Dev-mode boot takes about a minute (Babel in the browser); browser suites need
`waitForBoot` and run 10–25 minutes each (family-ui ~13 min). They write a
throwaway `api/config.php` and refuse to run if one exists — run them one
after another.

Known pre-existing failure (fails on the untouched base too, not yours to hide):
PHP suite "portal: reading an entry marks it read".

---

## The next job: Math Lab → The Mathematics Clinic

**Read `docs/MATH-LAB-PLAN.md` first, all of it.** It is the approved direction
(owner decisions of 3 Nov 2026 are in its §17 and at the top). It contains the
review of the owner's curriculum JSON (17 stages × 10 = 170 competencies), the
audit of today's Math Lab and its questions, three research streams (exam
formats and licensing; learning science; product landscape), and the full
design: routes, knowledge model, question bank, assessment structure, the
climb, courses, gamification, interface, scale, codebase fit, delivery phases.

What the owner decided (summary — the plan is authoritative):

- **The interface is replaced completely.** Not a restyle of the Arcade Lab in
  `page-club.jsx`. New home: `/study/lab` as a tab of the study page (one entry
  in `STT_TOOLS`, `src/modules/tools/tools-core.jsx`), with sub-pages for the
  map, practice, a competency (`/study/lab/learn/MC-049`), exams and progress.
  `/mathlab`, `/math-lab` and `/lab` forward there (in `pageFromPath()`, like
  the `/member/...` forwards); the Arcade teaser becomes a link.
- **Members only** for the full Lab, **free**, with **Coursera-style courses**
  (enrol, syllabus, progress, graded checks, verifiable certificates — plan
  §6.3). **Math Lab Lite** for non-members: generated practice with marking and
  worked solutions, progress on the device only.
- **No placement test on first start: the climb** (plan §9.4a). Members start
  at MC-001; stage gates of 6 typed questions, fast-and-correct clears a whole
  stage as "Known (fast-tracked)", momentum shortens gates, speed never counts
  alone, fast-tracked competencies get a retention check in 3–7 days.
- **Claude and ChatGPT are the build and content team.** AI drafts items,
  **heavily guarded** (plan §8.7): two independent solutions must agree, machine
  verification where computable, distractor audit, canary release (practice
  only until ~30 responses with sane statistics), live statistics watch,
  owner spot review per batch. Never any College Board content in an AI
  pipeline; never reproduce exam-board text.
- Pilot **Stages 5–7** (algebra) first, then 1–4. Exam track (WASSCE P1 + JAMB
  first) and licences are **the long run**.

What to keep from today's Lab (`api/_lib/domain/mathlab.php`): the
derived-answer generators (an answer key cannot be mistyped), server-side
marking, one-shot submission, server timing, and the prerequisite *map*. What
is wrong with it: plan §3 and Appendix A (constant answers, method printed in
the stem, roots of quadratics with no real roots at SSS level, skills cut to one
typed number, plain-text maths, no diagrams/MCQ, ~45 of 170 competencies).

Where to start (plan §16): Phase 1 foundations — the 170-competency map as
data, the prerequisite graph (Appendix C has a draft for Stages 5–7 and the
sequencing problems it exposed), micro-skills and misconceptions for Stages
5–7, the item record and quality standard — then Phase 2 (engine and bank).
Owner decisions 8 and 9 (the "Defend" step; names/theme) are still open — the
plan states the defaults.

The source curriculum JSON was uploaded to the session, not the repository; if
you need it, ask the owner to attach it again (its useful content — the 170
titles in order, the stage names, the policies — is reproduced in the plan).

---

## Also in this branch, done (see `docs/HANDOFF.md` for details)

Dues notices before they fall due (all channels) · family-app money fixes ·
parents pay Paystack's charge · announcements in the member portal and
Community · Control Room jump hook installed once · ledger and conduct fixes by
the other session (lates before the first band, statement that reconciles, aged
debt book, transactions journal).
