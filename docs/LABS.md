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
- **Five content modules**, one per strand: `englishlab-words` (Stage 1), `-grammar` (Stages 2 and 4), `-sounds` (3), `-reading` (5) and `-writing` (6). `eng_forms()` joins them.
  - To add a topic: one entry in the map and one in a module.
  - To add a module: one line in `eng_forms()` and one in `api/_lib/bootstrap.php`.
- **Append only, still.** A row's position in its table is part of a replayed question (the seed picks the row). New rows go at the END.
- **Never a `$` in content.** The Lab's screen reads `$…$` as mathematics. The sweep fails on one.
- **Tests:**
  - the English block in `api/tests/run.php`: the sweep (the key and every accepted alternative mark themselves right; every wrong option names its slip; no `$`), the `text` marker's promises, the map, isolation from the other Labs, the paper, the daily problem and the certificate;
  - `tests/labs-client.test.js`;
  - the English journey in `tests/mathlab-e2e.test.js`, which answers a real practice question in the browser.
- **Not yet built:**
  - judged free writing: an essay or a whole letter needs a teacher queue or a rubric-checked model call through the AI layer, never the instant marker;
  - audio for speech work: the Sounds items are written so audio can be attached to the same items.
