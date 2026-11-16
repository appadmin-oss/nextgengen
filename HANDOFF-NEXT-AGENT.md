# HANDOFF — for the next agent (Labs: the standard exam — IN PROGRESS, 16 Nov 2026)

Branch for this work: `claude/magical-fermi-d97fqw` (built on `claude/finme-dues-training-fees-l54o5j`).

## Owner's request (voice note, 15 Nov 2026, transcribed)
"For the Math Lab, let it create the real WAEC [exam] to end with … in half the minutes of WAEC: if WAEC
takes two hours, it should do the same in one hour. Anybody who scores 70% is already a genius, 85% a super
genius, 100% a grandmaster." Then: "Research and find questions. For the exam, use a standard engine to make
the exam feel real and tough — and effective." Applies to all Labs.

## Owner's decisions (16 Nov 2026)
- **Questions:** original, written to the real paper's blueprint, NOW; plus a **licence-gated slot** for real
  past questions that stays OFF until the owner records a licence. Never load WAEC/NECO/JAMB text without it.
- **Do not name WAEC** (or any exam body) anywhere a learner reads — the 6 Nov rule stands; a test sweeps for it.
  Internal ids may say `waec`.

## DONE (committed)
- `paper 'waec'` ("Standard exam") in every Lab, via the shared engine (`mathslab.php` MLB_PAPERS,
  `phy_papers()`, `eng_papers()`): Maths 50 Q / 45 min (real 90), Physics 50 / 38 (real 75), English 80 / 30
  (real 60); four options A–D only (`'options' => 4` filters the pool and the draw); server-enforced clock.
- Titles `MLB_WAEC_TIERS`: Genius ≥70, Super Genius ≥85, Grandmaster =100; grade bands `MLB_WAEC_GRADES`
  (A1 75+ … F9 <40). In the report, the score line, history and the paper card (best title, three titles).
- UI in `src/modules/mathslab/mlb-app.jsx` (MlbExams card, MlbResult headline/tier); CSS in `styles.css`.
- Tests in `api/tests/run.php` (search "standard exam"). PHP suite 7192/0 at commit.
- Research (WASSCE schemes): Maths P1 50 MCQ 1½h (P2 essay 2½h, 13 Q, answer 10); Physics P1 50 MCQ 1¼h
  (P2 structured/essay 1½h, P3 practical); English P1 80 MCQ 1h. More in docs/MATH-LAB-PLAN.md §8.3.

## TODO (in this order)
1. **Blueprint + difficulty ("tough")**: `mlb_exam_pick` draws randomly with one question per topic. Give
   `waec` papers a blueprint — share of questions per strand as the real paper weights its syllabus — and a
   difficulty mix leaning hard (e.g. ~20% easy / 45% medium / 35% hard by stage within range). Research the
   real topic weights first (owner said "research").
2. **Exam-hall engine ("real")**: in MlbPlay for `mode === 'exam'`: a question navigator (jump to any
   question), flag for review, change answers until hand-in, no right/wrong shown until the end, confirm
   hand-in naming unanswered/flagged counts. Check what the current exam flow already does first (it is linear).
3. **"Effective" report**: predicted grade, per-area weakness → the Lab topics to study (links), time per
   question, comparison with previous standard exams.
4. **Licence-gated real questions**: table (SQLite ladder in `api/_lib/db.php` + `db/schema-mysql.sql` +
   bump NGG_SCHEMA_TARGET — see CLAUDE.md §3) for licensed items with provenance (board, year, paper, number,
   licence ref); a setting that stays off until a licence reference is recorded by staff; the engine mixes
   them in only when on. Staff import + toggle in the Control Room (Learning). Tests that it stays off.
5. Docs: `docs/ADMIN-GUIDE.md` (labs section), `docs/LABS.md`; append `docs/HANDOFF.md`.
6. Run: `php api/tests/run.php`, `node tests/labs-client.test.js`, `node tests/mathlab-e2e.test.js`,
   `node tests/mathlab-shot.js`, `node tests/physicslab-shot.js`, build test. Not yet run for this change:
   the browser suites above.

## Also done on this branch earlier (all pushed)
Pay ahead by month or term (12-month cap, dues-change notice); division majors (Tech → Coding);
division/course matching fixes with an exhaustive test ("matching ·" in run.php). See commit messages.

---

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

PHP suite: 6805 passed, 0 failed on 4 Nov 2026 (the earlier "portal: reading
an entry marks it read" failure no longer reproduces).

---

## The next job: Maths Lab — continue from the preview

**A deep functional preview is built (3 Nov 2026)** — read the last entry of
`docs/HANDOFF.md` for exactly what exists (Stages 1–7, the climb, mastery,
reviews, bosses, courses, Lite) and what does not. The name is **Maths Lab**.
Continue from it rather than starting again.

**Done since (4 Nov 2026, `e8f4236e`):** the Arcade teaser is a link to
`/study/lab` that reads `mathslab.home`; the old ladder's client code
(`MathLab`, `MathPaper`, `MathMarked`, `NGGApi.member.mathlab`, the `.ml-*`
rules) is removed; `ui-smoke.js` and `mathlab-shot.js` cover the new Lab in a
browser. The old SERVER ops (`mathlab.php`, `arcade.php` `mathStart`/
`mathSubmit`) are kept: issued level certificates must keep verifying, and
they are what a progress migration would read.

**Done 4 Nov (later):** one certificate system — stage certificates every ten
topics and the course certificate after, as NGG documents in the committed
design; spot-the-error and diagnosis questions fixed; a Progress view with
recurring mistakes. See the last entry of `docs/HANDOFF.md`.

### Background (the plan)

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
