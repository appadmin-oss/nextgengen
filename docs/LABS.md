# Adding a Lab

The owner (5 Nov 2026): *"Prepare, we'll be adding more labs."* Physics shipped as the second Lab on 6 Nov 2026 and English as the third the same day; the engine is Lab-aware. **This page is the handover for the next Lab** — English (§5) is the worked example of a Lab built from a kit and modules.

The Maths Lab is the first Lab. Most of what it does is not maths: the climb, practice, mastery
checks, reviews, the stage boss, certificates, the Daily Problem and the timed exam papers. A
new Lab (Physics, Chemistry, English…) brings its own **content** and reuses the **engine**. It
must never fork the engine. Two copies of the guards (marking, the server clock, the "never
send the key" rule) is how one copy ends up missing a guard.

## 1. How the engine finds a Lab

- **One registry, two halves.**
  - `LABS` in `api/_lib/domain/labs.php` holds the content and the rules.
  - `NGG_LABS` in `src/modules/tools/tools-core.jsx` holds the tabs and addresses the browser needs.
  - `tests/labs-client.test.js` fails if the two disagree on ids, order, address, title, icon, daily-problem name, or whether papers are offered.
- **The address is the Lab.**
  - `/study/<seg>` is a Lab. Maths keeps `/study/lab` for every old link; Physics is `/study/physics`.
  - The API client sends `lab` on every call (`mlabLab()` in `api-client.js`). `backend_dispatch()` sets it once per request with `lab_from()` and refuses an unknown Lab (`unknown_lab`).
- **Content goes through `lab_call()` only.** A Lab names its functions in `content`:
  - `stages`: stage → [title, [ten topic titles]];
  - `strands`;
  - `bands`: give one band `summit: true`, and its daily problem comes from there;
  - `edges`: prerequisites, by topic number;
  - `courses`;
  - `forms`: topic id → generators;
  - optional: `why` (proofs), `papers` (timed papers), `formulas` (the certificate's background pattern).

  The engine never calls a subject's function by name.
- **A topic resolves through its own prefix** (`lab_for_comp`). Marking, a topic's title and its forms are correct whatever Lab the request names. A session also records its Lab (`mlab_sessions.lab`) and is always answered and scored in it.
- **Per-Lab data:**
  - `mlab_track` holds the climb, momentum and bosses, one row per member per Lab.
  - States are read by prefix.
  - Sessions, the daily problem, chests, papers and certificates are scoped by Lab.
  - XP and the streak stay shared: one streak for all of a child's studying.
- **Certificates:**
  - Maths keeps its keys (`mlb:` and `mlbs:`). Every other Lab uses `mlb-<PREFIX>:` and `mlbs-<PREFIX>:`.
  - The document carries `lab` and `labTitle`, so its title, its verify page and the printed sheet name the right Lab.
- **Features** (`features` in `LABS`):
  - `daily`: a daily problem from the summit band, named by `dailyName`;
  - `exams`: the Lab's `papers`;
  - `explore`: the client has explorers for it.

## 2. Adding English (or any Lab): the checklist

1. **Registry entry** in `LABS`:
   - a unique two-letter `prefix` (e.g. `EN`);
   - `path` `/study/english`;
   - `content`, `features` and `dailyName`;
   - a matching row in `NGG_LABS`.
2. **Content files** `englishlab-map.php` and `englishlab-gen.php`.
   - Prefix every function (`eng_…`).
   - Add both files to the list in `api/_lib/bootstrap.php`. A file that isn't in that list does not exist.
3. **Generators use the shared builders** (`mlb_typed`, `mlb_mcq`, `mlb_error_of`, `phy_dia`-style figures if needed). They follow the rules in §3.
4. **Client-side visuals, if any**, go in their own file (`src/modules/<lab>/…`), loaded before `mlb-app.jsx`. Add it to BOTH `build.js` `ORDER` and `index.html`.
   - Explorers merge into `MLB_EXPLORE`, `MLB_TRY` and the explorer map by spreading, as `PHY_EXPLORE`, `PHY_TRY` and `PHY_EXPLORERS` do.
   - Diagram types with a `<lab>-` prefix can be handed off in `MlbDiagram`, as `phy-` is.
5. **Tests**, copying the Physics block in `api/tests/run.php`:
   - the generator sweep;
   - the map checks;
   - isolation between Labs: climb, states, sessions, daily problem, certificates;
   - "no exam body named".

   Also extend `tests/labs-client.test.js` (it reads `LABS`, so it mostly extends itself) and add a journey to `tests/mathlab-e2e.test.js`.
6. **Docs**: describe the Lab in `docs/ADMIN-GUIDE.md` and append the change record to `docs/HANDOFF.md`.

**What English will need that the engine does not have yet:** marking free writing (grammar fixes, summaries, essays).
- Today's item kinds are `num`, `frac`, `expr`, `ratio`, `pair`, `mcq`, `error` and `order`.
- A new kind (for example `text`, with an accepted-answers list and a normaliser) must be added ONCE, to `mlb_mark()` and `mlb_public()` in `mathslab-gen.php`, with a test. Never in a second marker.
- Essay-length marking that needs judgement does not belong in the instant marker. It needs its own design: queue for a teacher, or a rubric-checked model call through the existing AI layer.

## 3. The rules every generator follows (they are tested)

- **Derive every answer and every wrong option.** Never type a key; a mistyped key marks a child wrong.
- **Name the misconception behind each wrong option.**
- **Give every question worked steps and a hint.**
- **Append only.** A session stores (topic, form number, seed), so a form never changes its number. New forms go at the END of a topic's list.
- **A typed quantity carries its unit** (`unit`). A learner who types the unit too ("12 N") is not marked wrong (`mlb_strip_unit`).
- **No exam body is named** anywhere a learner reads (owner, 6 Nov 2026). The questions are our own, written to the syllabus. A test sweeps every Lab's questions, maps, courses and papers.
- **The sweep in `api/tests/run.php` must pass:**
  - the key marks itself right;
  - there are at least three distinct options;
  - no typed form gives everyone the same answer;
  - the key never reaches the browser.

## 4. How the Physics Lab teaches (the pattern to copy)

- **Predict, then see** (`PhyPredict`, `PHY_PREDICT`). Each explorer opens with one prediction, each wrong option a real misconception. The explorer opens once the learner commits to a guess, and after they try it the Lab says whether the guess held and why. This is predict–observe–explain, the strongest-evidenced use of simulations.
- **Guidance built into the design (PhET's implicit scaffolding).** The interactive figure is central and the most basic control comes first. Wording is minimal, a control and the arrow it drives share a colour, and slider ranges are chosen so the extremes and the "twice as much" cases teach.
- **Standard diagrams with a reading guide.** Every figure is drawn in school conventions and has "How to read this diagram": the symbols drawn as a key, then what the figure shows (owner: "Make sure diagrams are the standard and they understand how it works").
- **The summit is guided.** Olympiad problems are one hard idea cut into steps, each step a question that gives the previous result. Tough, but reachable.
- **Tests:**
  - `tests/physicslab-shot.js` draws every figure from a real question and every explorer. It fails on an empty figure, a missing reading guide, an explorer that opens before the prediction, or a control that changes nothing.


## 5. The English Lab: a Lab built from a kit and modules

English (6 Nov 2026; owner: *"Build the engine. Make it modular."*) adds no engine code except ONE answer kind in the shared marker. Everything else is content, split so a topic is data:

- **`text`, the shared typed-word kind** (`mlb_text_norm()` and `mlb_mark()` in `mathslab-gen.php`). Compares the learner's words to the key and an `accept` list. Curly/straight quotes, spacing and a space before punctuation never matter. Capitals and the final `.`/`?`/`!` matter only when the item sets `case`/`punct`. With right words but wrong capitals it says so (`form`). `mlb_public()` never sends `accept`.
- **The kit** (`englishlab-kit.php`): `eng_choose`, `eng_type`, `eng_spot`, `eng_order` and `eng_derive`. Each turns a table of rows into a form the engine already runs. `eng_derive` is for rules (plurals, past tenses, comparatives) where the wrong options are the regular rule misapplied (`eng_regular_plural`, `eng_regular_past`).
- **The map** (`englishlab-map.php`): stages, strands, bands, edges, courses, the paper, and the certificate's background lines.
- **Seven content modules**, listed ONCE in `ENG_MODULES` (`englishlab-kit.php`): `englishlab-words` (Stage 1), `-grammar` (Stages 2 and 4), `-sounds` (3), `-reading` (5), `-writing` (6), `-wordpower` (7) and `-senior` (8). `eng_forms()` joins them in that list's order. A test holds that every map topic comes from exactly one module.
  - To add a topic: one entry in the map and one in a module.
  - To add a module: one line in `ENG_MODULES` and one in `api/_lib/bootstrap.php`.
- **The passage bank** (`eng_passage()`, in the kit): every reading passage is written once and read by any module. The Reading stage and the Senior Paper's comprehension and summary topics share it.
- **Per-Lab copy lives in the registries, never in the shared screens.** Two strings were Maths- or Physics-only and showed in every Lab: the map's search hint and the page title's "with diagrams and simulations". They are now `find` (in `NGG_LABS`) and `pitch` (in both `LABS` and `NGG_LABS`). `tests/labs-client.test.js` holds that the two `pitch` values agree.
- **Append only, still.** A row's position in its table is part of a replayed question (the seed picks the row). New rows go at the END.
- **Never a `$` in content.** The Lab's screen reads `$…$` as mathematics. The sweep fails on one.
- **Tests:**
  - the English block in `api/tests/run.php`: the sweep (the key and every accepted alternative mark themselves right; every wrong option names its slip; no `$`), the `text` marker's promises, the map, isolation from the other Labs, the paper, the daily problem and the certificate;
  - `tests/labs-client.test.js`;
  - the English journey in `tests/mathlab-e2e.test.js`, which answers a real practice question in the browser.
- **Not yet built:**
  - judged free writing: an essay or a whole letter needs a teacher queue or a rubric-checked model call through the AI layer, never the instant marker;
  - assessment of unscripted speech quality: recorded models, minimal-pair listening and dictation are available (see §6), but transcription alone is not a pronunciation score.


### English summit implementation plan — 7 November 2026

Base: `4b8e9e08`, freshly fetched from `claude/finme-dues-training-fees-l54o5j`; work stays on `codex/english-lab-gods`. No migrations or shared Learn edits.

Baseline before content: **6,963 backend checks passed / 0 failed; 28 client checks passed / 0 failed; 104 browser checks passed / 0 failed**. Browser tests use installed Chromium through an external Playwright adapter, with the repository test unchanged. Initial environment attempts failed on PHP subprocess permissions and the missing Playwright browser download; these were resolved before recording this baseline. The earlier source revision had 6,937 backend passes and is not the baseline for this work.

Inventory below is the starting snapshot: **80 topics, 259 forms, 35 taught rules**. “No” identifies a missing taught rule, not missing practice.

| Topic | Existing forms | Taught rule |
| --- | ---: | --- |
| EN-001 | 3 | No |
| EN-002 | 3 | No |
| EN-003 | 3 | Yes |
| EN-004 | 3 | Yes |
| EN-005 | 3 | Yes |
| EN-006 | 3 | Yes |
| EN-007 | 3 | No |
| EN-008 | 3 | No |
| EN-009 | 3 | No |
| EN-010 | 3 | No |
| EN-011 | 4 | Yes |
| EN-012 | 3 | Yes |
| EN-013 | 3 | Yes |
| EN-014 | 3 | Yes |
| EN-015 | 3 | Yes |
| EN-016 | 3 | Yes |
| EN-017 | 3 | Yes |
| EN-018 | 3 | Yes |
| EN-019 | 3 | Yes |
| EN-020 | 3 | Yes |
| EN-021 | 4 | Yes |
| EN-022 | 4 | Yes |
| EN-023 | 5 | No |
| EN-024 | 6 | Yes |
| EN-025 | 5 | Yes |
| EN-026 | 4 | Yes |
| EN-027 | 4 | Yes |
| EN-028 | 5 | Yes |
| EN-029 | 3 | No |
| EN-030 | 3 | No |
| EN-031 | 3 | Yes |
| EN-032 | 3 | Yes |
| EN-033 | 3 | Yes |
| EN-034 | 3 | Yes |
| EN-035 | 3 | Yes |
| EN-036 | 3 | Yes |
| EN-037 | 3 | Yes |
| EN-038 | 5 | Yes |
| EN-039 | 3 | Yes |
| EN-040 | 3 | Yes |
| EN-041 | 3 | No |
| EN-042 | 3 | No |
| EN-043 | 4 | No |
| EN-044 | 3 | No |
| EN-045 | 3 | No |
| EN-046 | 3 | No |
| EN-047 | 3 | No |
| EN-048 | 3 | No |
| EN-049 | 3 | No |
| EN-050 | 5 | Yes |
| EN-051 | 3 | Yes |
| EN-052 | 3 | No |
| EN-053 | 3 | No |
| EN-054 | 3 | No |
| EN-055 | 3 | No |
| EN-056 | 3 | No |
| EN-057 | 3 | Yes |
| EN-058 | 3 | No |
| EN-059 | 3 | No |
| EN-060 | 3 | No |
| EN-061 | 3 | No |
| EN-062 | 3 | No |
| EN-063 | 3 | No |
| EN-064 | 3 | No |
| EN-065 | 3 | No |
| EN-066 | 3 | No |
| EN-067 | 3 | No |
| EN-068 | 3 | No |
| EN-069 | 3 | No |
| EN-070 | 3 | No |
| EN-071 | 3 | No |
| EN-072 | 3 | No |
| EN-073 | 3 | No |
| EN-074 | 3 | No |
| EN-075 | 3 | No |
| EN-076 | 3 | No |
| EN-077 | 3 | No |
| EN-078 | 3 | No |
| EN-079 | 3 | No |
| EN-080 | 3 | Yes |

Implementation order:

1. Complete and review taught rules, starting with concord and tenses; contextual synonyms/antonyms; oral English; inference; summary; then remaining topics. Each topic gets 3–6 clearly judged examples with reasons, including both right and wrong. Qualify existing overgeneralised rules and remove ambiguous judgement examples.
2. Append targeted production/reasoning practice through `eng_drill_forms()` until every topic has at least four forms and a typed, error-spotting or ordering form. Existing form numbers, rows and seeded outputs remain unchanged; compare against captured replay fixtures.
3. Append EN-081–EN-100 in stages 9–10: rhetoric, register, literary technique, critical reading and advanced oral interpretation. Add the Gods of English summit band, course, prerequisites and paper coverage. The shared engine already selects its daily question from the summit band; verify that behaviour rather than copying it.
4. Deepen oral practice and minimal pairs. Verify new transcriptions/stress against Cambridge or Oxford UK before adding them; record any new speaking text with the existing British generator, preserving all existing clips. Dictionary access is currently blocked by the environment allowlist; a two-domain configuration draft has been saved. Do not label unverified pronunciations verified.

Before each deliverable commit: examiner review, a scratch sweep of each new form across 200 seeds (options, hints, marking, public-key exclusion, answer variation), and all three baseline suites. Commit deliverables separately and push only the new branch. Free essays remain teacher-assessed; instant marking will use bounded answers with explicit instructions and accepted alternatives.

Implementation checkpoint: foundation rules now cover all 80 topics; **87 appended forms bring the total to 346**, with at least four per topic and production/reasoning everywhere. The optional fifth field of an `eng_spot` row supplies per-part explanations; omitted fields preserve historical output. The first 777 replay samples remain byte-for-byte equivalent as decoded question objects. The 200-seed sweep passed for all 87 new forms (17,400 instances). Final foundation validation: 6,963 backend, 28 client and 107 browser passes, zero failures.

## 6. Teaching before practice: The rule and Hear and say

- **The rule** is the engine's existing teaching step (lab content `why`, read through `mlb_why_of`). English supplies `eng_rules()` (`englishlab-teach.php`): `[rule, reminder, [[example, why], …]]`.
  - Lines starting `✓`/`✗` are drawn as a contrast, because `NGG_LABS.english.teach.contrast` is set.
  - The step's words ("The rule", "Next example", "Why") come from `teach`, never from the shared screen.
  - Every foundation topic EN-001–EN-080 now has 3–6 explicitly marked examples, including both ✓ and ✗, with a reason for each; regression checks enforce that contract.
- **Hear and say** is lab content `speak` (`eng_speak()`, `englishlab-speech.php`): `how`, `pairs` and `say` per topic. `mathslab.comp` passes it as `speak`, with `speak.audio` (text → recorded clip URLs). The client is `src/modules/mathslab/eng-speak.jsx`, which is in `build.js` `ORDER` and `index.html`, before `mlb-app.jsx`.
- **The voice is recorded** (`tools/english-voices.py`, Kokoro, Apache-2.0, British voices `bf_emma`, `bm_george`, `bf_isabella`, `bm_lewis`). The clips are committed under `assets/audio/english/`.
  - Each file is named by a hash of its text (`eng_audio_name()`), so changed text gets a new recording.
  - Where the voice would misread, `ENG_SAY_PHONEMES` gives the exact phonemes (the verb "record").
  - The player falls back in order: the recording, then `mathslab.voice` (Spitch, only for the Lab's own text, cached), then the device's best natural voice.
- **Listening** (`mathslab.listen`) uses Spitch speech-to-text when a key is set (rate-limited, 10 a minute; the target sentence comes from the topic, never from the client). Otherwise the browser's recogniser, otherwise record and play back.
- **The microphone was denied site-wide** by `Permissions-Policy: microphone=()` (`.htaccess` and `bootstrap.php`), which would have silently broken this step and the portal's voice notes on the live site. It is `microphone=(self)` now.
