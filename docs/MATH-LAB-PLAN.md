# Math Lab — The Mathematics Clinic
## Review, research and implementation plan

*Prepared 3 November 2026 for Next Generation Genius. Status: **direction approved by the owner, with the decisions in §17**. Nothing has been built yet.*

> **Owner decisions (3 Nov 2026), in one place.** The Math Lab interface is **replaced completely**, not restyled.
> - **Members only** for the full Lab, with Coursera-style courses (§6.3).
> - Members **start at the lowest point and climb fast** on their performance and speed, instead of sitting a placement test (§9.4).
> - A **lightweight, flexible version for non-members**.
> - **Free.**
> - Pilot band and first exam: as recommended (Stages 5–7 first, then 1–4; exam track WASSCE Paper 1 + JAMB).
> - Licences and the full exam track are **the long run**.
> - **AI drafts items, heavily guarded against errors** (§8.7).
> - The build and the content are done by **Claude and ChatGPT** working as the team, with the owner reviewing (§16).

---

## 0. The short version

**What you asked for:** turn Math Lab into the Mathematics Clinic described in the curriculum JSON (keep the name Math Lab), put it on the study page with its own address, make it adaptive, gamified, results-driven, attractive and engaging, and fill it with real questions from SAT, West African, Ghanaian, Nigerian and other exams.

**Verdict:** feasible, and worth doing, but it is a content programme with software attached, not a software project with some content. Four findings drive everything below:

1. **The curriculum document is an excellent skeleton with almost no flesh.** Its 170 competency titles, 17 stages, teaching philosophy, mastery policy and assessment split are sound. But 13 of the 16 fields on every competency are the same sentence with the title swapped in, 160 of 170 prerequisites point to the competency itself, and there is not one question, answer, worked example or rubric in it. (§2)
2. **Today's Math Lab has a good engine and poor everything else.** The answer generator is genuinely well designed: answers are derived, so a mistyped key cannot mark a child wrong. The questions it generates are thin, repetitive, sometimes mathematically unsound for the level, and only cover about 45 of the 170 competencies. The product around them is a timed typed-answer test hidden inside the Arcade. (§3)
3. **"Real questions" must mostly mean real exam *form*, not copied exam *text*.** WAEC Ghana licenses past questions exclusively to one publisher, Cambridge refuses electronic publication of past-paper questions, and College Board requires permission for any reuse and refuses all AI use of its content. The lawful core is original items written to each exam's exact format and syllabus, plus links to free official material, plus licences pursued in parallel. (§8)
4. **The evidence supports this design, at realistic sizes.** Adaptive, level-targeted maths practice in low- and middle-income countries produces about **0.2–0.4 standard deviations** of gain (Mindspark India +0.37 SD in 4.5 months; LMIC meta-analysis 0.35 SD for level-adaptive approaches). Bloom's "2 sigma" is not a planning number. There is no Nigerian randomised trial, so we should run our own. (§5)

**Recommended shape (now decided):** one Math Lab, with a completely new interface, at `/study/lab` (with `/mathlab` and the old Arcade entry forwarding to it), built on the clinic's 170-competency map with a real prerequisite graph, a placement test, per-competency mastery with delayed retention checks, an exam track per board, a question bank with provenance and two-person review, and gamification that rewards mastery and retention rather than volume. Pilot one band (Stages 5–7, algebra) at one or two centres for a term before widening.

**Budget reality:** the software is roughly 5–7 months of one strong developer to a pilot-ready core. (Now that Claude and ChatGPT are the team, read §16 for how the hours translate.) The content (about 4,000+ reviewed original items, ~600 question generators, ~40 diagram templates, 170 lesson packs) is the larger cost: of the order of **4,000–5,500 skilled hours** over 12–18 months, most of it maths specialists and item writers. (§16)

---

## 1. Sources for this plan

| Input | What was done |
|---|---|
| `mathematics-clinic-detailed-curriculum.json` (1.4 MB, v2.0) | Parsed every field; measured how much of each field is unique across the 170 competencies; checked the prerequisite references. |
| Current Math Lab (`api/_lib/domain/mathlab.php`, 1,220 lines; UI in `page-club.jsx`) | Read the engine; generated 3 samples of each of the 91 question forms across the 21 generators and audited them. |
| The rest of the platform | Study tools page (`/study`, `src/modules/tools/`), spaced-repetition scheduler (`study-tools.php`), XP/levels (`momentum.php`), course placement, curriculum engine, family app, Control Room. |
| Research stream A — exams and licensing | Formats of NCEE, BECE, WASSCE (Core/Further), NECO, NABTEB, JAMB UTME, Ghana BECE/WASSCE, Digital SAT, PSAT, ACT, IGCSE; copyright and reuse terms of each body; Nigeria Copyright Act 2022. |
| Research stream B — learning science | Mastery learning, knowledge tracing, adaptive testing, retrieval/spacing/interleaving, worked examples, grading explanations with AI, gamification meta-analyses, LMIC evidence. |
| Research stream C — products | Khan Academy, IXL, ALEKS, DreamBox, Zearn, Brilliant, Duolingo, Prodigy, Mathletics, Seneca, Sparx, Dr Frost, Photomath; uLesson, Prepclass, Gradely, Afrilearn, Myschool.ng, Eneza, M-Shule, Siyavula; maths input, rendering and diagram libraries. |

Where a research claim could not be confirmed against the primary source, it is marked **(unverified)**. Several official sites (College Board, ACT, Cambridge help, GeoGebra, Desmos) were blocked from this session's network; those facts came through search results or secondary sources and must be checked before anything public relies on them.

---

## 2. Review of the curriculum document

### 2.1 What is strong

- **The progression.** 17 stages × 10 competencies, from "One-to-one correspondence and counting objects" (MC-001) to "Capstone mathematical modelling, numerical methods and research" (MC-170). The sequence is coherent and recognisably Nigerian-secondary in its middle and upper stages.
- **The philosophy.** Start at the learner's real level, rebuild gaps, progress by evidence not age, treat diagrams as reasoning tools, require explanation and retention. This is exactly what the strongest evidence supports (§5).
- **The instructional model.** Seven steps: Experience → Understand → Represent → Connect → Practise → Apply → Defend.
- **The assessment policy.** 85% proposed threshold, explicitly "to be validated by piloting"; marks split Concept 20 / Procedure 30 / Application 25 / Reasoning 15 / Retention 10 (sums to 100); "a score alone does not override a serious misconception"; targeted remediation; delayed retention check at 7–14 days; evidence recorded for every decision.
- **Honesty.** It says itself that it is not a WAEC syllabus and must be mapped before claiming coverage.

### 2.2 What is missing or wrong (measured, not estimated)

| Field (per competency) | Distinct versions across 170 (title removed) | Meaning |
|---|---|---|
| title | 170 | Real |
| diagram_specifications | 170 (but only **34 distinct descriptions** across 340 diagrams) | Mostly templated per stage |
| prerequisite_knowledge | 161 | **Broken**: 160 of 170 read "Competency *N* and the earlier competencies in this stage", where *N* is the competency's own number. Stage openers (011, 071, 161…) point to "earlier competencies in this stage" that do not exist. |
| learning_outcomes, key_content, teaching_sequence, worked_example_requirements, common_misconceptions, practice_requirements, assessment, remediation, extension, retention_check | **1 each** | Identical boilerplate. E.g. every competency's misconception is "memorising a procedure without understanding". |
| teaching_materials | 5 | Generic lists |
| stage_purpose (17 stages) | 1 | "Develop secure understanding of *X* as a foundation…" |
| Questions, answers, worked examples, rubrics | **none** | Roadmap phases 2–4 have not started |

**Sequencing problems found while drafting the prerequisite graph (Appendix C):**
- **055 Graphical solution of linear equations** (Stage 6) needs plotting straight lines, which is **091 Cartesian coordinates** and **094 Equation of a straight line** (Stage 10).
- **058 Difference of two squares** (Stage 6) depends on **061 Squares, cubes and higher powers** (Stage 7).
- **110 Number bases** sits in Stage 11, but number bases are JSS 1 / SS 1 work in the Nigerian syllabus and appear in WASSCE Paper 1. A learner preparing for WAEC would meet it far too late.
- **Complex numbers** are absent from all 170 titles, though today's Math Lab has a level for them. Check whether WAEC/NECO Further Mathematics needs them before deciding.
- Several Stage 17 titles (163 Forces, 164 Moments, 165 Momentum) are mechanics topics found in Further Mathematics, but 169 (differential equations, multivariable) and 170 (capstone research) go beyond any West African school syllabus. That is fine for a "beyond" stage, but they should be labelled enrichment, not exam preparation.

**Consequence:** treat the document as the *map and the policy*. Every competency still needs its real content: specific outcomes, misconceptions, worked examples, practice items, diagrams and a mastery check. That is the content programme in §16.

### 2.3 Feasibility of the document's own timings

- 90 minutes × 3 sessions a week is right for centre-led classes but not for home practice; home sessions should be 10–20 minutes (the 85%-success practice target in §5 makes short sessions effective).
- 170 competencies at a pace of one to two weeks each is 3–6 years for the whole ladder. That is acceptable only because placement lets most learners start mid-ladder, and because the document itself says "do not promise a fixed completion time".

---

## 3. Review of the current Math Lab

### 3.1 What it is

- 20 levels (21 generators including "Calculus in Motion"), each with 3 tiers of question forms: **91 forms** in total. Six strands; each level declares the levels it needs (a map, not a chain, since a past fix).
- A round is a fixed paper: 10–12 typed answers in about 5 minutes. Pass is 70%. Three paper stages (Foundation / Standard / Stretch) chosen by best score.
- Server-authoritative: answers stay on the server, one submission per round, elapsed time from the server's clock.
- UI: a teaser card inside the Club page's Arcade, opening a full-screen board, paper and result. No URL of its own.

### 3.2 What is good and must be kept

1. **Answers derived from the same parameters as the question.** A mistyped key cannot exist. The supply is unlimited and the test suite can re-derive every answer. This is the single most valuable idea in the current Lab; competitors (Seneca) are publicly criticised for wrong answer keys.
2. **Prerequisite map rather than a rope.**
3. **Server-side marking, one shot, server timing.**
4. **Generous form, strict value** marking: `1,250` = `₦1250` = `1250`.

### 3.3 Why the questions are poor (audit of every form)

Audited by generating three samples of all 91 forms. The arithmetic is always right; the *questions* are the problem.

**A. Mathematically unsound or misleading for the level**
- *Quadratics:* "If α and β are the roots of 4x² + 8x + 10 = 0, find α + β." The discriminant is negative (64 − 160), so there are no real roots. Same for 2x² − 5x + 12. At SSS level this teaches that every quadratic has real roots. The generator never checks the discriminant.
- *Indices:* "Simplify 5⁵ × 5¹, giving your answer as a number" → 15625. This tests multiplying out large numbers, not the law of indices; the skill (5⁶) is not what is marked.
- *Mis-filed questions:* "Find the area between y = 36 and y = x²" sits in *Calculus in Motion*; vector scalar products sit in *Coordinate Geometry*.

**B. The answer is given away, or there is no thinking left**
- "Evaluate log₂4 + log₂8. *(Use log m + log n = log mn.)*"
- "In triangle ABC… *Using a² = b² + c² − 2bc·cos A*, find a²."
- "A body moves… *Acceleration is d²s/dt²*. Find the acceleration."
- "Rationalise 6/√2. The answer is a√2. What is a?"
- "The conjugate of −3 + 2i is −3 − 2i. Multiply…"

**C. Degenerate or constant forms (same question every time)**
- "Simplify sin²θ + cos²θ" — always 1.
- "Two vectors are perpendicular when their scalar product is ___" — always 0.
- Logic "p AND q", "p OR q" — p and q always both true, so always T.
- Probability "greater than 5 on a die" — always 1/6.
- Standard deviation of data like "12, 20, 12, 20" — always two repeated values, so the answer is half the difference; a pattern, not the skill.
- Ratio sharing always asks for Bola's share.

**D. The skill is bent to fit a single typed number**
- "Expand (x − 4)(x + 5). What is the coefficient of x?" (the skill is the expansion).
- "Add (6 + 2i) and (−1 + 5i). What is the REAL part?"
- "Multiply the matrix by the vector. What is the FIRST entry?"
- "Express … in partial fractions as a/(x−2) + b/(x−5). What is a?"
Because the only answer type is one short typed value, whole skills are reduced to one fragment of the answer.

**E. Presentation**
- Plain-text notation: `x^2`, `log5 of 3125`, "(6 4 ; −6 7), where the rows are separated by a semicolon".
- No diagrams anywhere, so geometry, mensuration, bearings, graphs and statistics charts cannot be asked.
- Typos and grammar: "x²  + 6x" (double space), "at t = 1 seconds", "coefficient of x^1".
- No multiple choice, although WAEC, NECO, JAMB, BECE and SAT are all 75–100% multiple choice in their first paper.

**F. Coverage**
About **45 of the 170 competencies** have any generator. None at all for Stages 1–2 (number sense, arithmetic foundations), Stage 8 (geometry), Stage 9 (mensuration, bearings, transformations), most of Stage 10 (graphs), Stage 14 transformations, Stage 15 (advanced trig, circles, conics) or Stage 17 mechanics beyond kinematics. Number bases, variation, linear programming, inequalities, construction and loci — all exam staples — are missing. (Appendix B.)

**G. Pedagogy**
No worked solutions or hints, no misconception feedback, no placement, no spaced review, no explanation of *why* an answer is wrong, no record an instructor or parent can read, and a 70% pass that does not match the clinic's 85% policy.

### 3.4 Why the product around it is poor
- Hidden: three clicks deep inside the Club page's Arcade, no URL, cannot be linked from a lesson, a notice or a parent message.
- One activity type (a timed paper) for every purpose: learning, practice, assessment and exam prep are all the same screen.
- A stale message ("Clear the level below this one first") still describes the old chain the map replaced.
- No progress view beyond best score per level; nothing for teachers, mentors or parents.

---

## 4. What we are building — product definition

**Name:** **Math Lab**, with the curriculum inside it called **the Mathematics Clinic**. "Math Lab" is the place; "the Clinic" is the method (diagnose, treat the gap, check it held). Copy can say "Math Lab · The Mathematics Clinic".

**One-sentence promise:** *Start where you really are, fix what's missing, and prove it stuck — on your phone, in minutes a day.*

**Who it is for**
| User | Needs |
|---|---|
| Learner 8–12 (primary/JSS) | Short, visual, encouraging sessions; big buttons; no reading walls |
| Learner 13–19 (JSS/SSS) | Exam relevance (BECE, WASSCE, NECO, JAMB, SAT), speed, proof of progress |
| Instructor / mentor | Who is stuck on which prerequisite; a live class mode; marking queue for explanations |
| Parent | Plain-language progress, what to encourage, exam readiness |
| Centre lead / NGG management | Mastery rates, retention, attendance-dose, cohort comparisons |
| Content team | Authoring, review, publishing, item statistics |

**Five modes, one engine**

| Mode | Purpose | Stakes |
|---|---|---|
| **Climb** (members) | Start at MC-001 and rise fast to the learner's real level on performance and speed (§9.4). A short placement *check* is available each term to confirm. | Low |
| **Learn** | Worked example → guided → independent, per competency | None |
| **Practise** | Adaptive mixed practice at ~70–85% success, interleaved | None |
| **Check** | Mastery check, retention checks, stage "boss" | Medium: changes mastery state |
| **Exam** | Timed, format-faithful papers per exam board | Practice; centre-proctored sittings optional |

---

## 5. What the research says, and the decisions it drives

| Finding | Evidence | Design decision |
|---|---|---|
| Mastery learning works, modestly | ~0.5 SD across 108 controlled evaluations (Kulik, Kulik & Bangert-Drowns 1990), older studies with researcher-made tests; modern tutoring RCTs ≈ 0.37 SD; Bloom's 2σ rests on two dissertations | Target 0.2–0.4 SD; measure it ourselves |
| Teaching at the learner's level is the strongest lever in LMICs | Mindspark (Delhi) +0.37 SD maths in 4.5 months, largest gains for weakest learners (Muralidharan, Singh & Ganimian 2019, *AER*); LMIC meta-analysis 0.18 overall, **0.35 for level-adaptive** (Major, Francis & Tsapali 2021) | Placement + prerequisite graph are non-negotiable; start below grade when needed |
| No mastery threshold is empirically optimal | No study compares 80/85/90; where the bar sits matters more than the model (Pelánek) | Keep 85% as policy, log everything, tune after the pilot |
| Practice success rate ≠ mastery bar | ~85% success is a heuristic from a learning-theory model (Wilson et al. 2019), untested on children's maths | Pick practice items for 70–85% predicted success; separate from the mastery check |
| Simple models are enough | Elo is "simple, robust, effective" (Pelánek 2016); BKT with forgetting matched deep knowledge tracing (Khajah et al. 2016) | Elo for item difficulty and learner ability; BKT-style probability per competency; no neural models |
| Placement in ~30 questions | ALEKS places across ~500 topics with ≤ ~30 questions using a prerequisite structure | Adaptive placement over the 170-node graph, stop at ~25–35 items |
| Item calibration needs data | Rasch difficulty stable to ±0.5 logit after ~100–150 responses, ≥ 8 right and 8 wrong (Linacre) | Start with author difficulty, let Elo move it, refit offline at ~100 responses |
| Retrieval practice | g ≈ 0.5–0.6 vs restudy | Every session opens with retrieval |
| Spacing | Best gap grows with the retention target; no fixed ratio (Cepeda et al. 2008) | Expanding checks: ~3 days → 7–14 days → 30–60 days |
| Interleaving maths | d = 0.83 on a delayed test, preregistered RCT in 54 classes (Rohrer et al. 2020) | Practise blocks while learning, mixed sets for review |
| Worked examples | g = 0.48 in maths; correct examples beat incorrect; self-explanation prompts reduced the effect (Barbieri et al. 2023) | Every competency starts with worked examples that fade into practice; error-spotting comes later, sparingly |
| Gamification helps, if designed carefully | Cognitive g ≈ 0.49 (Sailer & Homner 2020), learning g ≈ 0.50 (Bai et al. 2020); leaderboards + badges lowered motivation and exam scores in one study (Hanus & Fox 2015); Duolingo streak evidence is not peer-reviewed | Reward mastery and retention, forgiving streaks, opt-in small leagues by growth; no global leaderboards; no rewards per question |
| AI can grade explanations, with humans | Several studies near human-human agreement *with rubrics and review*; zero-shot grading sometimes worse than guessing the mean; mostly preprints; none on Nigerian children's writing | Machine-scored reasoning formats first; AI-suggested scores on free text, human moderation, never a gate alone |
| Offline, low-data wins at scale in Africa | Myschool.ng offline CBT, Eneza SMS, Siyavula zero-rated, EIDU on cheap Android | Download-able session packs, text + SVG, no video by default, sync later |

---

## 6. Where it lives: routes, study page, access

### 6.1 Addresses

| Address | Behaviour |
|---|---|
| **`/study/lab`** | Math Lab home (the study page's new **Math Lab** tab) |
| `/study/lab/map` | The skill map |
| `/study/lab/practice` | Today's adaptive session |
| `/study/lab/learn/MC-049` | One competency: learn, practise, check |
| `/study/lab/placement` | Placement test |
| `/study/lab/exams` · `/study/lab/exams/wassce` · `/study/lab/exams/jamb/mock-03` | Exam track |
| `/study/lab/progress` | My progress, badges, history |
| **`/mathlab`**, `/math-lab`, `/lab` | Forward to `/study/lab` (kept forever, like the other forwarded addresses) |
| Old Arcade teaser | Becomes a link to `/study/lab` |

How it fits the existing code: the study page already has **one registry** of tabs (`STT_TOOLS` in `src/modules/tools/tools-core.jsx`) from which tabs, sub-paths and titles are derived, plus an alias table for old addresses. Math Lab is one new entry there with its sub-tabs; the `/mathlab` forward goes in `pageFromPath()` like the existing `/member/...` forwards. No second list of pages (CLAUDE.md §11).

### 6.2 Who can use it
**Decided: members only for the full Lab, free; a lightweight flexible version for everyone else.**

| Visitor | What they get |
|---|---|
| **NGG member** (free) | The whole Lab: the climb, the map, courses (§6.3), mastery checks, retention, bosses, badges, certificates; progress on the account, visible to their mentor and family |
| **Non-member: Math Lab Lite** (free, no account needed) | Pick any topic and practise generated questions with instant marking, worked solutions and hints. Progress stays on the device. Includes a short "how far can you climb?" taster. No mastery record, certificates, courses or leagues; a clear "join NGG to keep your progress" path |
| Instructor / mentor | Their groups' progress, live class mode, moderation |
| Content staff | Item bank, review, publishing (Control Room) |

Lite runs entirely from generators and published practice items, never from mastery checks or exam mocks, so nothing that decides a member's record is exposed to anonymous users. It is rate-limited per device and IP like the other public tools.

### 6.3 Courses: the Coursera-style layer (members)

The map is how the Lab thinks; **courses** are how a learner chooses what to study. A course is a published, ordered path through the map with a name, a promise and a certificate:

| Course | Spans | For |
|---|---|---|
| Number Foundations | Stages 1–4 | Primary and anyone with gaps |
| Algebra Essentials | Stages 5–7 | JSS 2 – SS 1 (the pilot) |
| Shape, Space & Measure | Stages 8–10 | JSS / SS |
| Senior Secondary Mathematics | Stages 10–12 | SS 1–3, WASSCE/NECO core |
| Further Mathematics | Stages 13–16 | SS 2–3 Further Maths |
| Mechanics & Beyond | Stage 17 | Enrichment |
| WASSCE Mathematics Prep (later) | Board blueprint across stages | SS 3 (exam track, the long run) |

Each course page has:
- **Syllabus:** its modules (stages) and the competencies in each, with estimated hours.
- **Enrol:** one tap, free.
- **Progress:** % of competencies mastered, the next lesson, and a weekly target the learner sets.
- **Graded items:** each module's mastery checks and its boss count toward the course grade; the grade shown is mastery-based ("8 of 10 mastered"), not an average of attempts.
- **Course discussion:** links to that course's Community channel (Community already has course channels).
- **Certificate on completion:** every module boss passed and every competency at least Mastered. It is a verifiable PDF with its own link, built on the platform's existing certificate pages.
- **Accomplishments:** a page listing certificates and badges, shareable from the member's profile.

Courses never fork the map: one competency mastered counts in every course that contains it, so learners are not made to repeat work.

---

## 7. The knowledge model

### 7.1 Competencies, strands, micro-skills
- **170 competencies** keep their IDs (MC-001…MC-170) and stage numbers.
- Each also carries a **strand** (Number, Algebra, Geometry & Measure, Graphs & Functions, Statistics & Probability, Trigonometry, Discrete & Logic, Calculus, Mechanics) so the map can be viewed by stage *or* by road, as today's Lab does.
- Each competency splits into **3–6 micro-skills** (e.g. MC-049 Multi-step linear equations → collect like terms; brackets on one side; unknown on both sides; fractions in the equation; check by substitution). Micro-skills are what items are tagged with and what placement narrows down; competencies are what the learner sees.
- Each competency gets **syllabus tags** per exam board (e.g. WAEC General Maths topic code, JAMB topic, BECE topic, SAT domain/skill), drafted by one model and reviewed by the other during syllabus mapping (§8.7). This is what lets the Exam track say "this paper tests 9 competencies; you have mastered 6".

### 7.2 The prerequisite graph
- A directed acyclic graph: edge A → B means "B cannot be learned without A". Expect **300–400 edges**, the first content deliverable: drafted by one model, reviewed by the other, signed off by the owner (§8.7).
- **Rules:**
  - an edge only where B genuinely uses A;
  - no edges "because it came earlier";
  - each competency has 1–4 direct prerequisites;
  - cross-stage edges are expected;
  - cycles are a build-breaking error;
  - a test checks the graph is acyclic and that every competency is reachable.
- **Uses:**
  - placement (infer down and up);
  - unlocking ("ready to learn" frontier);
  - remediation (walk back to the earliest prerequisite that fails);
  - reporting ("stuck because of X").
- Appendix C drafts Stages 5–7 to show the shape and the sequencing problems it exposes.

### 7.3 Misconception catalogue
- Each competency lists **3–8 specific misconceptions** with a code, e.g. `ALG-SIGN-MOVE` ("changes side without changing sign"), `FRAC-ADD-DENOMS` ("adds denominators"), `IDX-MULT-BASES` ("multiplies the bases when multiplying powers").
- Every multiple-choice distractor is tagged with the misconception that produces it; a generator form produces its distractors by *applying* the misconception to the same parameters (so distractors are also correct-by-construction as wrong answers).
- Two hits of the same misconception in a competency raise a flag; a flag blocks mastery until a targeted remediation set is passed ("a score does not override a misconception").

---

## 8. Questions: sources, law, quality

### 8.1 Four sources, one bank

| Source | Use for | How correctness is guaranteed |
|---|---|---|
| **Generators** (today 91 forms, target ~600) | Procedural practice, retention checks, exam-style objective items | Answer and distractors derived from the parameters; test suite re-derives |
| **Original authored items** (target ~4,000+) | Concept, application, reasoning, diagram, explanation items | Drafting model ≠ solving model; the §8.7 gates; statistics flag items after use |
| **Exam-style originals per board** (inside the authored set) | Mocks that look and feel like WASSCE, NECO, JAMB, BECE, SAT | Same review; tagged with board, paper, section, syllabus topic |
| **Licensed real past questions** (when agreements exist) | Authentic past-paper practice | Provenance and licence recorded per item; removable on request |
| **AI-drafted items** | Draft volume for authors | Never published without human review; **never** from College Board content (their terms forbid AI use) |

### 8.2 Real exam questions: what is lawful *(research summary — not legal advice; get a Nigerian IP lawyer's opinion before publishing any real exam text)*

| Body | Copyright / terms (as found) | Free official material | Licensing |
|---|---|---|---|
| WAEC Nigeria | Ownership assumed; WAEC's own reuse terms **not found** | Free study portals launched 2025 (past questions, marking schemes, Chief Examiners' reports) | No public programme found |
| WAEC Ghana | Minister stated in 2021 WAEC owns copyright and **Kingdom Books** is the only licensed publisher of past questions; disputed by Africa Education Watch | — | Exclusive publisher licence (claimed) |
| NECO, JAMB | No public copyright/licensing statements found; JAMB has disowned unofficial CBT software | — | Unknown; ask directly |
| College Board (SAT/PSAT) | Owns copyright; reuse (even non-commercial) needs permission; **refuses use of its content with generative AI**; linking needs no permission | Bluebook practice tests; Khan Academy Official SAT Practice | Khan is the exclusive official partner |
| ACT | All content copyrighted; reproduction by written permission; linking allowed | Free practice booklet | Case by case |
| Cambridge (IGCSE/O Level) | Teachers may print for their own students; **no electronic publication of past-paper questions**, no complete papers | Specimen papers | Narrow |
| Nigeria Copyright Act 2022 | s.20 fair dealing "such as" non-commercial research, private use, criticism, review, **education**; exceptions cannot be contracted away; systematic copying of whole banks into a public platform is **unlikely** to be fair dealing (unconfirmed) | | |

Nigerian edtechs (uLesson, Teesas, Myschool.ng and others) openly carry "years of past questions"; **no licensing deal or takedown was found**. That shows enforcement has been rare, not that the practice is lawful. WAEC Ghana's exclusive licence shows WAEC treats past-paper publishing as something it licenses.

**Recommended path**
1. **Core: original exam-style items.** A paper's *format* (counts, options, sections, choice rules, timing) and its *syllabus topics* are facts, not protected expression. Write originals to each board's blueprint. Do not closely paraphrase specific past questions.
2. **Link** to free official material (WAEC portals, Bluebook/Khan for SAT, Cambridge specimens, ACT booklet) from inside the Exam track, with our own topic diagnosis around it.
3. **Reference without reproducing** where useful: "Similar to WASSCE 2019 Paper 2, Q7 (bearings)" next to *our own* question and worked solution.
4. **Pursue licences** in parallel: WAEC Nigeria, NECO and JAMB first; a WAEC partnership is also a credibility asset. Licensed items replace originals as they arrive, with provenance on each one.
5. **Do not** ingest SAT content into any AI pipeline, and do not publish Cambridge past-paper questions.

### 8.3 Exam formats the Exam track must reproduce

| Exam | Paper 1 | Paper 2 | Time | Calculator | Confidence |
|---|---|---|---|---|---|
| **WASSCE Core/General Maths** (NG, GH, SL, LR, GM) | 50 MCQ, 40% of subject | 13 questions: Section A 5 compulsory; Section B answer 5 of 8 | 1½ h + 2½ h | Scientific (verify) | Good (multiple secondary sources agree) |
| **WASSCE Further / Elective Maths** | 40 MCQ (30 Pure, 4 Statistics, 6 Vectors & Mechanics) | Section A 8 compulsory (48 marks); Section B answer 4 of 7, ≥1 per part (52) | **Conflict:** 1 h + 2 h vs 1½ h + 2½ h | | Verify with WAEC |
| **NECO SSCE Maths** | 50 MCQ (A–D), 40% | Theory, 60% | Verify | | Medium; moving to CBT 2025–26 |
| **JAMB UTME Maths** | 40 MCQ, 4 options, CBT | — | 2 h for the whole UTME (180 questions) | Basic on-screen only (unverified) | Good |
| **Ghana BECE Maths** | 40 MCQ | 6 questions, answer 4 | 1 h + 1 h | None | Medium (sample paper copy) |
| **Nigeria BECE/JSSCE** | Objective | Essay | Unconfirmed | | **Low — research with NECO/state boards** |
| **NCEE** (Common Entrance) | Maths + Quantitative Aptitude, ~60 Q in ~60 min (unofficial) | | | | **Low** |
| **NABTEB** | Objective | Essay | Unconfirmed | | Low |
| **Digital SAT Math** | 2 adaptive modules × 22 = 44 (some unscored); ~75% 4-option MCQ, ~25% student-produced response | | 2 × 35 min | Desmos built in | Medium-good (one source says 24 per module) |
| **ACT Math** | 45 Q, 4 options (from 2025) | | 50 min | Allowed | Medium |
| **Cambridge IGCSE 0580** | Non-calculator + calculator papers, structured, all compulsory | | Core 1½ h / Extended 2 h each | Split | Good (official syllabus) |

**Grading scales to mirror:** WASSCE A1 75–100, B2 70–74, B3 65–69, C4–C6 50–64 (credit), D7, E8, F9 0–39; SAT section 200–800; ACT 1–36; JAMB 0–100 per subject.

### 8.4 The item record (what every question stores)

```
item:
  id                 MI-000123
  kind               mcq | numeric | fraction | expression | coordinates | multi-part
                     | order-steps | find-the-error | diagram-read | diagram-construct
                     | explain | true-false-why
  stem               Markdown + LaTeX ($...$), short, plain English, Nigerian contexts
  diagram            {template, params} — drawn in the browser as SVG
  options            [{text, correct, misconception}]       # MCQ
  answer             {value | expression | set} + form rule (lowest terms, factorised…)
  tolerance          numeric tolerance / significant figures
  solution           worked steps (2–8), each a sentence + maths
  hints              up to 3, increasing
  competencies       [MC-049]   micro-skills [MC-049.3]
  dimension          concept | procedure | application | reasoning
  difficulty         1–5 author estimate → elo rating → rasch (after ~100 responses)
  exam               board, paper, section, syllabus code, "style" | "licensed" | "reference"
  provenance         source, author, reviewer, licence, permission ref, rights holder,
                     territory, year/paper/question number (licensed only)
  status             draft → in review → approved → published → retired
  stats              attempts, p-correct, discrimination, mean time, distractor counts
```

Generators produce the same record shape at request time from `(form, seed)`; storing only the seed keeps a question reproducible for review and appeals.

### 8.5 The question quality standard (from the audit)

Every item, generated or authored, must pass:
1. **Tests the named skill**, not arithmetic around it (no "give 5⁶ as a number").
2. **Does not give the method away** in the stem.
3. **Mathematically valid at its level** (real roots at SSS level, sensible units, realistic values).
4. **Varies:** parameters span the skill; no constant answers; names and contexts rotate across Nigerian and wider African settings.
5. **Right answer type for the skill**: an expansion is answered as an expression, a matrix product as a matrix, a probability as a fraction.
6. **Typeset**: LaTeX, never `x^2` or "rows separated by a semicolon".
7. **Distractors from real misconceptions**, each tagged.
8. **Worked solution** a learner can follow.
9. **Accessible**: diagram has a text description; no colour-only meaning; works at 360 px width.
10. **Two people** have checked it (author ≠ reviewer) before publication; generator forms have a re-derivation test.
11. **Statistics watched**: an item with p-correct < 0.2 or > 0.95, negative discrimination, or a distractor nobody picks is pulled for review automatically.

### 8.6 The content pipeline

**Item lifecycle:** Draft → Independent solve and gates (§8.7) → Owner batch spot review → Canary → Published → Monitored → Retired

| Step | Who | Tooling |
|---|---|---|
| Write / import | Item writer, or importer (CSV / JSON / Word with a template) | Control Room → Math Lab → Question bank |
| Draft with AI (optional) | Writer prompts; AI proposes stem, options, solution | Never from SAT content; always marked "AI-drafted" |
| Check | Re-derive answer (generator), or second solver; check distractors map to misconceptions | Preview on a phone-size frame; KaTeX and diagram render |
| Review | The second model solves blind; any disagreement quarantines; the owner spot-reviews the batch | Two-person rule enforced by the server (like offline payments today) |
| Publish | Content lead | Versioned; edits to a published item create a new version |
| Monitor | Automatic | Flags from statistics (§8.5 rule 11) and learner "report a problem" |
| Takedown | Content lead | One action retires an item or a whole source/licence |

Duplicates are caught by a normalised-stem fingerprint plus a similarity check. Every licensed item records its permission reference and territory.

### 8.7 The AI content team and its guardrails (decided)

The owner has decided that the build and the content are done by **Claude and ChatGPT**, with AI drafting **heavily guarded against errors**. The guardrails exist because a wrong key or a wrong worked solution does more harm than a missing question.

**Who does what**
| Role | Done by |
|---|---|
| Engine, interface, tests | Claude (in this repository), with ChatGPT for independent review of risky changes |
| Generator forms | Claude writes; the re-derivation test proves every answer |
| Authored items (concept, application, reasoning, diagrams) | One model drafts; **the other model solves independently** without seeing the key |
| Syllabus mapping, prerequisite graph, misconception catalogue | One model drafts; the other reviews; the owner signs off on the graph |
| Final say on publishing a batch | The owner (or a delegated instructor), working from a review sheet rather than raw items |

**The error gates. An item is published only if every gate passes:**
1. **Schema and lint:** all required fields; LaTeX compiles in KaTeX; no `x^2` plain text; the answer type matches the skill (§8.5).
2. **Two independent solutions agree:** the drafting model's key and the other model's blind solution must match exactly, or be equivalent under the server's checker. Any disagreement **quarantines** the item; it is never "resolved" by a third AI vote.
3. **Machine verification where possible:** numeric answers are recomputed by the PHP checker from the stem's numbers, or by evaluating the expression at sample points. Items whose answer can be computed must be computed, not trusted.
4. **Distractor audit:** each wrong option is produced by its tagged misconception and is genuinely wrong (the checker confirms it is not equivalent to the key).
5. **Level and sense check:** values realistic, real roots at SSS level, units consistent, no method printed in the stem, reading level suits the stage.
6. **Duplicate check:** fingerprint and similarity against the bank.
7. **Provenance:** source = "AI-drafted" with both model names and the date; nothing derived from College Board material, ever; no reproduction of exam-board text.
8. **Canary release:** a newly published item appears **only in practice, never in a mastery check, boss or mock**, until it has about 30 responses with sane statistics (p-correct 0.2–0.95, no negative discrimination, every distractor chosen at least once). Only then can it be used in checks.
9. **Live watch:** the statistics auto-flag (§8.5 rule 11) and learners' "report a problem" button pull an item from use immediately, pending re-verification.
10. **Owner spot review:** each batch carries a review sheet showing the item, both solutions, the checker result and a 10% random sample flagged for the owner (or a delegated instructor) to look at before the batch goes live.

**What AI must not do:**
- write or edit a mastery state, a learner record or a published item directly. It produces drafts, and the pipeline decides;
- grade an explanation without the human confirmation step in §9.5;
- touch SAT/College Board content (their terms forbid it) or reproduce WAEC, NECO, JAMB or Cambridge text.

**Honest note:** with no human maths specialist, the two-model check, machine verification and canary release are the safety net. They catch wrong answers well. They catch *pedagogical* weaknesses (a poor sequence, a misleading example) less well, so instructor feedback from the pilot centres is part of the guardrail, not an extra.

---

## 9. The assessment structure

### 9.1 Instruments

| Instrument | When | Length | Item mix | Scoring | What it changes |
|---|---|---|---|---|---|
| **The climb** (members, first start) | From the first session until the learner reaches their level | Woven into the first sessions: ~45–75 min in total for an SS-level learner | Probe items, mostly typed numeric/expression (not guessable MCQ) | Correctness + speed + consistency (§9.4) | Marks competencies "Known (fast-tracked)", provisional until a retention check confirms |
| **Placement check** (optional) | Each term; on demand | 25–35 items, ~25 min, adaptive | Mostly MCQ + numeric across strands | Graph-based inference + Elo | Confirms or corrects the climb |
| **Warm-up retrieval** | Start of every session | 3–5 items | Due reviews + recent | Elo/BKT update | Practice selection |
| **Practice** | Daily | 8–15 items per session | Targeted at 70–85% predicted success, interleaved after first learning | Elo/BKT; hints reduce credit | Probability of knowing each competency |
| **Mastery check** | When probability ≥ 0.85 with enough evidence | 10–12 items, untimed, no hints | Blueprint below | Weighted with floors | → **Mastered** |
| **Retention check 1** | 7–14 days after mastery (earlier ~3-day touch if shaky) | 3–5 items, new items | Procedure + application | Pass ≥ 80% | → **Secure**, or back to **Review** |
| **Retention check 2** | 30–60 days later | 3 items | Mixed | Pass ≥ 80% | → **Long-term** |
| **Stage boss** | All 10 competencies of a stage Mastered | 20–25 items, 30–40 min | Mixed across the stage + 20% spiral from earlier stages | ≥ 80% overall, ≥ 60% per competency | Stage badge + certificate; flags weak competencies back to Review |
| **Exam mock** | On demand / scheduled | Format-faithful (e.g. WASSCE P1: 50 MCQ, 1½ h) | Board blueprint by topic weight | Board's scale + topic breakdown | Exam readiness report → back into competencies |
| **Proctored sitting** (optional) | Centre-run | Mock or stage boss | — | — | Certified result for records |

### 9.2 The mastery check blueprint

It follows the clinic's mark split, with retention measured later rather than in the same sitting:

| Dimension (weight) | Items | Formats | Marked by |
|---|---|---|---|
| Concept (20) | 3 | Why/which MCQ with misconception distractors; 1 diagram-read | Machine |
| Procedure (30) | 4 | Generator items across two difficulty bands | Machine |
| Application (25) | 2 | Unfamiliar context, multi-step | Machine (numeric/expression) |
| Reasoning (15) | 2 | Find-the-error, choose-the-justification, order-the-steps | Machine |
| Explanation (optional, inside Reasoning when centre-led) | 1 | 2–3 sentence written "Defend" | AI-suggested score → instructor confirms |
| Retention (10) | — | Delivered as Retention check 1 | Machine |

**Pass rule:**
- weighted score ≥ 85% on the 90 points available at the check;
- **and** no dimension below 60%;
- **and** no open misconception flag.

A pass makes the competency **Mastered**; the retention check later completes the record. A learner who misses gets a targeted set (the failed dimension and any flagged misconception) and can retry after it, with new items.

### 9.3 The mastery states

```
Not started → Learning → Practising → Ready to check → Mastered → Secure → Long-term
                  ↑                                   │           │
                  └─────────────── Review ←───────────┴───────────┘
                                 (failed retention: one step back, not to the start)
```

- **Learning:** worked examples seen; first attempts.
- **Practising:** BKT probability ≥ 0.6.
- **Ready to check:** probability ≥ 0.85, at least 6 items across at least 2 difficulty bands, and no open misconception flag.
- **Review:** a failed retention check. Short targeted practice, then a re-check. No full demotion: this avoids the "SmartScore whiplash" users hate about IXL.

### 9.4 Adaptivity mechanics

- **Elo:**
  - each answer updates the learner's ability on that competency and the item's difficulty;
  - K-factor decays with the number of answers;
  - hints and long response times reduce the "win".
- **BKT-style probability** per competency:
  - parameters prior, learn, slip and guess, set per stage at first;
  - fitted after the pilot.
- **Next-best activity**, in order:
  1. due retention checks;
  2. an open misconception flag;
  3. a blocked prerequisite (remediation);
  4. "ready to check";
  5. frontier competencies;
  6. exam goal topics;
  7. interleaved review.
- **Placement check walk** (the optional termly check; the first-start route is the climb in §9.4a):
  - start from a prior set by age or class (e.g. SS1 → Stage 6–7);
  - choose the competency that best splits the remaining uncertainty;
  - a right answer marks its prerequisites likely known, and a wrong answer probes them;
  - stop at standard error ≤ 0.3 or 35 items.
- **Calibration:** author difficulty → Elo live → Rasch refit offline once an item has about 100 responses.

### 9.4a The climb: start at the bottom, rise fast (decided)

Members begin at **MC-001** on their first visit, as the owner decided. The design goal is that **nobody who already knows the early stages is bored or slowed**: a strong SS 2 learner should reach their real level in roughly **45–75 minutes spread over their first sessions**, while a learner with real gaps stops exactly where the gaps are.

How it works:
1. **Stage gates first.** At each stage the learner meets a **gate**: 6 mixed questions from across that stage's 10 competencies, mostly typed answers (numeric, fraction, expression), so they cannot be guessed. A learner who answers **all 6 correctly, each within a fast-but-fair time** (calibrated per item, about the 40th percentile of time for learners who answer correctly), clears the whole stage as **Known (fast-tracked)** and moves straight to the next gate. A whole early stage can be cleared in 3–5 minutes.
2. **Partial gates narrow down.** 4–5 of 6 correct, or correct but slow, splits the stage: the competencies behind the misses get a 2–3 item **probe** each. Passed probes become Known (fast-tracked); failed ones become the learner's first **Learning** competencies.
3. **Fewer than 4 of 6** ends the climb at this stage. The learner starts learning here, and later stages stay locked behind their real prerequisites.
4. **Momentum.** Three consecutive clean gates make the next gate shorter (4 items), and five make the following one a 3-item **jump probe** two stages ahead. One miss restores the full gate. This is the "improve depending on performance, speed and so on" behaviour.
5. **Speed is never used alone.** It only lifts a correct answer to "fast-tracked". A wrong fast answer counts as a miss, and very fast correct answers on several typed items in a row are a cheating signal that pauses fast-tracking.
6. **Provisional until proven.** Fast-tracked competencies get their **first retention check within 3–7 days**, mixed into normal practice. A failed check sends that competency (not the stage) to Review. A learner who rushed is quietly corrected without being sent back to counting.
7. **Resumable.** The climb can stop at any time and continues next session from the same gate. Progress shows as the constellation lighting up stage by stage, which also makes the first visit feel rewarding rather than like a test.
8. **Instructor override.** An instructor can start a learner at a chosen stage (for example, from a school report), which the climb then confirms from there.

Expected numbers to calibrate in the pilot: gate pass time thresholds per item, the 6/4 cut-offs, and the share of fast-tracked competencies that later fail retention. More than 15% failing means the gates are too easy.

### 9.5 Explanation, reasoning and the human loop
- Prefer machine-scored reasoning formats: find the error, choose the justification, order the steps. Free-text "Defend" is used in centre sessions, where an instructor is present.
- Free text is scored against a 0–2 analytic rubric (correct idea · uses the right representation · justifies the step). AI suggests the score and its confidence, and an instructor confirms in a moderation queue. Low-confidence answers always go to a person, and a random 5–10% of high-confidence ones are double-checked. Agreement between AI and instructors is tracked per item.
- Free text never decides mastery on its own.

### 9.6 Integrity
- Answers are never sent to the browser for checks or exams. Each generated item is reproducible from a server-held seed.
- One submission per check; time comes from the server; checks reach the server as one batch.
- **Exposure control:** an authored item appears in at most N checks per learner; generator parameters are randomised.
- **Answer-getting apps** (Photomath and similar) are countered by multi-step and parameterised items, by find-the-error and explain formats, and by Sparx-style "bookwork checks" in centre sessions ("What did you get for question 4?").
- Proctored sittings at centres for anything that goes on a record.

### 9.7 What reports show

| Report | Contents |
|---|---|
| **Learner** | The map lighting up; streak; this week's wins; "your next 3"; exam readiness per board |
| **Instructor** | Class map heat; who is stuck on which prerequisite; misconception clusters; moderation queue; live-session results |
| **Parent** | In the family app, plain words: what was mastered, what is being worked on, time spent, what to praise; monthly summary |
| **Management** | Mastery rate, retention rate, placement gain term-on-term, dose (minutes/week) versus gain, centre comparison by growth |

---

## 10. Gamification

**Principles from the evidence:**
- reward mastery and retention, not volume;
- forgive misses;
- compare a learner to themselves first;
- never charge children for advantage (the 2021 complaint against Prodigy is the cautionary tale);
- no global leaderboards.

| Element | Design |
|---|---|
| **The Constellation** | The map as a night sky of 170 stars in 17 constellations (stages). A star glows when Mastered and burns brighter when Secure and Long-term; it dims while in Review. Locked stars show their prerequisites when tapped. |
| **XP** | Mastery +100; Secure +50; Long-term +50; stage boss +300; placement completed +50; practice +1 per correct answer, **capped at 30 a day** (no grinding). |
| **Levels** | XP feeds the existing NGG momentum levels and awards; Math Lab titles (Apprentice, Analyst, Strategist, Architect, Grandmaster) are cosmetic. |
| **Streak** | A day counts with one meaningful session (≥ 5 items, or one check). Freezes are earned (1 per 7-day streak, hold up to 2). Weekly goal of 3/5/7 days is the learner's choice. |
| **Bosses** | The stage exit is a "boss" with its own art. Pass and the constellation completes; fail and the screen names the stars to strengthen, with no shaming. |
| **Badges** | Few and meaningful: *Comeback* (a Review regained), *Iron Memory* (10 Long-term), *Defender* (5 explanations confirmed by an instructor), *Error Hunter* (20 find-the-error correct), *Placement Pioneer*, *Exam Ready: WASSCE P1* (3 mocks ≥ B3), plus centre seasonal badges. |
| **Leagues** | Opt-in, groups of 20–30, ranked by **XP gained this week** (growth), with no relegation shaming; centre-vs-centre seasons ranked by **average mastery growth**. |
| **Live class** | Instructor-run quick race on the projector (Mathletics Live / Dr Frost Live pattern); scores are team-based by default. |
| **Celebrations** | Short, skippable, sound off by default; a 3-second star animation, not a 10-second video. |
| **Certificates** | Stage certificates (PDF, rendered in the browser) for records and parents. |

**Explicitly not doing:**
- pay-to-win items;
- loot boxes;
- leaderboards of raw score;
- penalties for wrong answers in practice;
- a streak that resets with no freeze;
- rewards per question answered.

---

## 11. Experience design (attractive, modern, engaging)

### 11.1 Look
- A distinct Math Lab identity inside the study page: dark "night sky" for the map, light "paper" for questions; one accent colour for the live action (matches the studios' rule in CLAUDE.md §8).
- Type: maths in KaTeX; numbers tabular; generous spacing. Diagrams are crisp SVG and scale to any phone.
- Motion is purposeful and brief: a star ignites, a step slides in.

### 11.2 Key screens

| Screen | Contents |
|---|---|
| **Lab home** (`/study/lab`) | Greeting; today's goal ring; "Continue" (next-best activity); due reviews; streak; exam countdown if set; recent stars |
| **Map** | Constellation by stage, or road view by strand; filter ready / review / mastered; tap a star for status, prerequisites, "learn" or "check" |
| **Competency page** | What it is (2 lines + diagram); worked example (stepped); "Try one"; practice; mastery check button with readiness meter |
| **Session player** | One question per screen; a progress pip strip; answer area (choices / keypad / maths field / diagram); "Hint" (shows cost); "Check"; then feedback: right with the next question, or wrong with the specific misconception message, the worked solution, and a "try a similar one" button |
| **Results** | What moved (stars), XP, what's next; for checks, the dimension breakdown |
| **Placement** | Friendly intro ("this isn't a test you can fail"); adaptive items; ends with the map lit to the learner's real level and a three-step plan |
| **Exams** | Board chooser; mock list; timed CBT player faithful to the real exam (question palette, flagging, review screen, timer); report by topic with links to competencies |
| **Progress** | Weekly minutes; mastery by stage; retention calendar; badges; certificates |
| **Instructor desk** (Control Room / instructor portal) | Groups; heat map; stuck list; assign; live session; moderation |
| **Question bank** (Control Room) | Search and filter; editor with live phone preview; review queue; statistics; licences |

### 11.3 Answer input
- **Custom keypad** (about 10 KB) for numbers, fractions, powers, roots, π, ±, x, y. It covers most items at every level.
- **MathLive**, loaded only when an item needs full algebraic entry. It is MIT licensed but heavy, so it must never load on every screen.
- **Equivalence checking:**
  - Simple numeric and fraction answers are checked on the server in PHP.
  - Algebraic answers are checked by evaluating both expressions at 5–10 random points with a safe expression parser in PHP. A per-item form rule ("lowest terms", "factorised") checks structure where the skill requires it.
  - SymPy is not available on PHP-only shared hosting, so it is not part of the design.
  - The client can pre-check for instant feedback; the server's answer is final.
- **Nothing requires dragging** (CLAUDE.md §9). Order-the-steps and diagram-construct items use tap-to-select and keyboard.

### 11.4 Diagrams
- An in-house **SVG diagram kit**, about 40 parametric templates: number line, fraction bar and circle, place-value chart, array, bar model, clock, angle, triangle, polygon, circle parts, parallel lines with a transversal, coordinate plane with lines and curves, bar/pie/histogram, Venn (2 and 3 sets), bearing compass, net and solid, vectors, a matrix as a grid, and a motion graph.
- **JSXGraph** (LGPL/MIT, self-hosted, works offline) for interactive graphs and constructions.
- **GeoGebra and Desmos are not core dependencies:**
  - GeoGebra requires a paid agreement for commercial use, and an NGG fee-charging context could count.
  - Desmos needs an API key and is online-only.
- Every diagram has a text description for screen readers.

### 11.5 Low data, offline, cheap phones
- First load of Math Lab under ~200 KB (KaTeX font subset, keypad, player); diagrams are code, not images.
- **Session packs:** the next session's items are fetched in one request (text + diagram parameters, no answers for checks) and cached; practice answers queue in the existing outbox when offline and sync later.
- Practice can run offline. Checks and exams need a connection at submission so the server marks them.
- No video by default; an optional short explainer per competency, downloadable on Wi-Fi.

### 11.6 Accessibility
- KaTeX with MathML output for screen readers.
- Focus rings and keyboard paths everywhere.
- 4.5:1 contrast.
- Large tap targets.
- Dyscalculia-friendly options: extra time in checks, number-line support and reduced visual load.

---

## 12. Scale

### 12.1 Content scale

| Asset | Target for full ladder | Pilot (Stages 5–7) |
|---|---|---|
| Competencies with full content | 170 | 30 |
| Micro-skills | ~700 | ~120 |
| Misconceptions catalogued | ~900 | ~150 |
| Generator forms | ~600 (from 91) | ~120 |
| Authored items (all types) | ~4,250 (≈25 per competency) | ~750 |
| Exam-style originals for mocks | WASSCE P1 ×20 mocks (1,000), JAMB ×25 (1,000), BECE ×15 (600), SAT-style ×10 (440), theory bank ~600 | 2 WASSCE P1 + 2 JAMB mocks |
| Diagram templates | ~40 | ~15 |
| Worked examples | 170 × 3–4 | ~100 |

### 12.2 Usage scale and the hosting

**Assumptions:** an active learner does about 30 items per practice day, 4 days a week, which is about 120 responses a week.

| Daily actives | Responses / year | Peak requests (one request per answer) | Peak requests (batched per session) | Hosting |
|---|---|---|---|---|
| 200 | ~1.2 M | ~1/s | < 0.3/s | Shared hosting with SQLite is fine |
| 2,000 | ~12 M | ~10/s | ~2/s | MySQL required; shared hosting at its limits |
| 10,000 | ~60 M | ~50/s | ~8/s | A VPS or managed MySQL; shared hosting is not enough |
| 50,000 | ~300 M | — | ~40/s | Dedicated application and database servers, a CDN, a read replica |

**Design choices that make scale cheap:**
1. **Batch per session:** one request fetches the session pack and one submits it, instead of one request per answer. This cuts requests by about 6×.
2. **Seeded generators:** store `(form, seed)`, not the generated text; regenerate on demand.
3. **Raw attempts kept 18 months**, then rolled up into per-learner-per-competency summaries. Indexes on (learner, competency) and (item).
4. **Per-competency state in one row per learner per competency.** Maps and reports read the state table, never the raw attempts. This avoids the kind of per-row query in a loop that CLAUDE.md §6 flags.
5. **Static assets** (KaTeX fonts, keypad, diagram kit) cache-forever with fingerprinted names, as the build already does.
6. **Item calibration runs as a nightly job**, bounded per run, like the existing nightly jobs.
7. **Thresholds to move off shared hosting:**
   - more than about 1,500 daily actives;
   - sustained more than 5 requests per second;
   - an attempts table above about 20 M rows.

### 12.3 People scale
- Item writing: about 5 reviewed items an hour including distractor rationale and solution; review about 15 an hour. 4,250 items ≈ 850 writing hours + 280 review hours.
- Generator forms: 2–3 hours each including tests. 500 new forms ≈ 1,000–1,500 developer-hours. Contract maths-literate developers or train item writers to specify forms.
- Moderation of explanations: about 1 minute each. At 2 explanations per learner per week and 1,000 actives, that is about 33 hours a week of instructor time. Keep "Defend" to centre sessions and lean on machine-scored reasoning.

---

## 13. How it fits this codebase

*Described, not built. Names follow the existing conventions.*

**Backend:**
- New domain files, all registered in the explicit list in `bootstrap.php`:
  - `domain/mathlab-map.php`: competencies, strands, graph, syllabus tags;
  - `mathlab-items.php`: bank, versions, review, import, statistics;
  - `mathlab-gen-*.php`: generators by strand;
  - `mathlab-engine.php`: Elo, BKT, next-best activity, placement walk;
  - `mathlab-assess.php`: checks, boss, mocks, marking, equivalence;
  - `mathlab-report.php`: learner, instructor, parent and management reports.
- The current `mathlab.php` generators move into the strand generator files as the first ~91 forms, rewritten to the §8.5 standard.

**Tables (camelCase columns, migration ladder plus MySQL mirror):**
- `ml_competencies`, `ml_edges`, `ml_skills`, `ml_misconceptions`;
- `ml_items` with `ml_item_versions`, `ml_item_reviews`, `ml_sources` (licences);
- `ml_state` (learner × competency: state, p, elo, evidence, dates);
- `ml_attempts` (learner, item or form+seed, response, correct, hints, ms, mode);
- `ml_sessions`, `ml_checks`, `ml_mocks`;
- `ml_flags` (misconceptions);
- `ml_moderation`.

**Operations, each in `backend_dispatch()`:**
- learner:
  - `mathlab.home`, `mathlab.map`, `mathlab.session.next`, `mathlab.session.submit`;
  - `mathlab.check.start`, `mathlab.check.submit`;
  - `mathlab.placement.next`, `mathlab.placement.submit`;
  - `mathlab.mock.list`, `mathlab.mock.start`, `mathlab.mock.submit`;
  - `mathlab.progress`, `mathlab.report`;
- staff:
  - `admin.mathlab.items.*` (search, save, review, publish, retire, import, stats);
  - `admin.mathlab.groups.*`, `admin.mathlab.moderate`, `admin.mathlab.live.*`.

**Permissions:**
- Editing the bank uses the existing **`curriculum`** capability.
- Publishing needs a **different person** from the author, enforced on the server.
- Licences and sources need `curriculum` plus `settings`.
- Instructors see only their groups, and centre scoping applies throughout.

**Frontend:**
- A new `src/modules/mathlab/` folder: map, player, keypad, diagram kit, exam CBT player, progress, placement.
- Mounted as the study page's **Math Lab** tab.
- KaTeX and MathLive are vendored and loaded through `loadVendor` on demand.

**Elsewhere in the platform:**
- **Family app:** a Math Lab card per child.
- **Member portal:** "Today" shows the next Math Lab action.
- **Mentor and instructor portals:** the stuck list.
- **Control Room:** Learning → Math Lab (bank, review, stats, licences).

**Tests:**
- PHP: graph acyclicity, generator re-derivation for every form, marking and equivalence, state machine, placement convergence on simulated learners, permissions.
- Browser: the player on a 360 px phone, offline queue, exam CBT player.
- Accessibility: axe across the Lab.

**Migration from today's Lab:**
- Existing `math_progress` rows map to competencies as "provisionally known". Learners confirm with a short check rather than redoing everything.
- The Arcade teaser links to `/study/lab`, and the old `mathlab.*` operations stay until the new ones replace them.

---

## 14. Validation and how we will know it works

**Before launch:**
- Syllabus mapping tables for WAEC General and Further, NECO, JAMB, Nigeria BECE and Ghana BECE.
- The graph reviewed by both models and signed off by the owner; every published item through the §8.7 gates.

**Pilot (one term, Stages 5–7, 2 centres, about 150–300 learners):**
- Placement at the start and end of term: the gain is the primary outcome. Pre-register the measure and the analysis.
- Stagger the rollout so some groups start later and act as a comparison.
- Track:
  - mastery rate;
  - retention-check pass rate;
  - accuracy on unfamiliar problems;
  - minutes per week (dose);
  - instructor moderation agreement;
  - item statistics;
  - streak and churn;
  - learner and parent satisfaction.
- **Realistic target:** +0.2 to +0.35 SD on the placement scale over a term for regular users. Look for bigger gains among the weakest starters, as Mindspark saw.

**Decision gates:**
- Do not widen to more stages until:
  - the mastery-check pass rate is in a sensible band (40–80% on first attempt);
  - at least 70% of learners pass the retention check at 7–14 days;
  - item flags are under 5%;
  - instructors use the stuck list weekly.

---

## 15. Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Content cannot be produced fast or well enough | High / high | Pilot one band; generators for procedure; the §8.7 gates; canary release; instructor feedback; AI drafts with human review |
| Copyright action over exam questions | Medium / high | Originals + links + licences; provenance per item; takedown in one action; legal opinion before any real text |
| A wrong answer key | Medium / high (trust) | Derived answers; two-person review; statistics auto-flags; "report a problem" button |
| Low engagement after novelty | Medium / high | Short sessions, mastery-based rewards, centre integration (dose drove Mindspark), parent nudges |
| Shared hosting limits | Medium / medium | Batching, seeded items, roll-ups; the thresholds in §12.2 trigger a move |
| Answer-getting apps | High / medium | Multi-step, find-the-error, bookwork checks, proctored sittings for records |
| AI grading unfair to Nigerian English | Medium / medium | Never a gate; human moderation; tracked agreement |
| Over-claiming exam alignment | Medium / high | "Exam-style" labelling; predicted grade only after calibration; verify formats with the exam bodies |
| Instructor workload | Medium / medium | Machine-scored reasoning; moderation only in centre sessions; stuck list instead of raw data |

---

## 16. Delivery plan

**Team (decided):**
- **Claude:** engine, interface, tests, generators, and drafting.
- **ChatGPT:** independent second solver and reviewer for every item, and a second opinion on risky code.
- **The owner:** decisions, batch spot review, graph sign-off.
- **1 instructor champion per pilot centre:** classroom feedback and the "report a problem" triage.
- An IP lawyer for a few hours *before* any real exam text is used. That is long run, but the advice is needed before it starts.

The hour estimates below were written for a human team. With AI doing the drafting, calendar time is bounded instead by:
- **review throughput** (the owner's spot reviews);
- **canary data** (items need ~30 responses before they can be used in checks);
- **pilot learners' time.**

Budget for the owner's review at about 2–4 hours a week during content phases.

| Phase | Weeks | Deliverables | Exit criteria |
|---|---|---|---|
| **0. Decisions** | done | Decisions in §17 taken 3 Nov 2026 | Signed off |
| **1. Foundations** | 3–8 | Syllabus mapping; prerequisite graph v1 (all 170, two-model reviewed, owner sign-off); micro-skills and misconceptions for Stages 5–7; item record and quality standard; authoring guide | Graph acyclic and reviewed; 30 competencies specified |
| **2. Engine and bank** | 5–14 | Tables and operations; Elo/BKT; next-best activity; equivalence checking; question-bank editor with two-person review and import; generators rewritten to standard (91 → ~120 for the pilot); diagram kit v1 (15 templates) | Every generator re-derives; review enforced |
| **3. Learner experience** (a completely new interface) | 9–18 | `/study/lab` and the `/mathlab` forward; map; player; keypad; worked examples; hints; mastery check; retention scheduling; **the climb**; **courses and certificates**; **Math Lab Lite** for non-members; gamification v1; offline packs; parent card; the old Arcade Lab retired | 360 px phone test passes; first load under 200 KB; axe clean |
| **4. Content for the pilot** | 6–18 | ~750 authored items through the §8.7 gates; 30 lesson packs; stage gates for the climb across all 17 stages (generator-built); instructor guide | Every item through the gates; statistics baseline |
| **5. Pilot** | 19–32 (one term) | 2 centres; instructor desk; moderation; weekly item fixes | Metrics in §14 |
| **6. Scale out** | 33+ | Stage by stage: Stages 1–4 next (foundations), then 8–10, then the upper stages; courses published as their stages complete; hosting move if thresholds are hit | Each stage meets the decision gates |
| **7. Exam track and licences (the long run)** | later | WASSCE P1 and JAMB mocks first, then BECE, SAT-style; legal opinion; licence approaches to WAEC, NECO and JAMB | Formats verified with the exam bodies |

**Effort (order of magnitude):**
- Software to pilot-ready: about 1,000–1,400 developer hours.
- Content for the full ladder: about 4,000–5,500 hours, now mostly AI drafting and verification (§8.7). Calendar time is bounded by the owner's reviews and by canary data, not by writing hours.
- The pilot band alone: about 900–1,200 content hours.

---

## 17. Decisions (taken by the owner, 3 November 2026)

| # | Question | Decision | Where it lands |
|---|---|---|---|
| 1 | Who can use it | **Members only** for the full Lab, **with Coursera-style features**. Members **start at the lowest point** on first start and are **moved up quickly by their performance and speed**. A **lightweight, flexible version for non-members**. | §6.2, §6.3, §9.4a |
| 2 | Paid or free | **Free** | §6.2 |
| 3 | Pilot band | **As recommended**: Stages 5–7 first, then 1–4 | §16 |
| 4 | Which exam leads | **As recommended**: WASSCE Paper 1 and JAMB first, then BECE, then SAT-style | §16 phase 7 |
| 5 | Licences with WAEC, NECO, JAMB | **The long run.** Not now; originals first | §8.2, §16 phase 7 |
| 6 | AI drafting and suggested scores | **Yes, heavily guarded to prevent errors** | §8.7, §9.5 |
| 7 | Who builds and writes | **Claude and ChatGPT** are the effort | §8.7, §16 |
| 8 | "Defend" step | Not decided. Default: centre sessions with instructor confirmation; at home, machine-scored reasoning formats only | §9.5 |
| 9 | Names and theme | Not decided. Default: "Math Lab · The Mathematics Clinic", constellation map | §4, §10 |
| — | Interface | **Replaced completely** (not a restyle of the Arcade Lab) | §11, §16 phase 3 |

## Appendix A — Question audit, by level

| Level | Forms | Main problems |
|---|---|---|
| 1 Number & Numeration | 6 | Ratio always asks for Bola; no fractions/decimals operations beyond "of"; no number bases |
| 2 Sets | 4 | Fine numerically; no Venn diagrams drawn; no 3-set problems |
| 3 Algebraic Processes | 5 | "Coefficient of x" instead of an expansion; no factorisation, inequalities, change of subject by expression |
| 4 Indices & Logs | 5 | Index laws marked by the multiplied-out number; method printed in the stem; duplicate items |
| 5 Surds | 4 | Answer form handed over ("a√2, what is a?"); (√3)² trivial |
| 6 Quadratics | 4 | **Roots of equations with negative discriminant**; one root given away |
| 7 Polynomials | 4 | Partial fractions reduced to "what is a?" |
| 8 Sequences | 5 | Reasonable; no "find n", no word problems |
| 9 Binary operations | 4 | Repeats; inverse form formulaic |
| 10 Complex numbers | 5 | Real part / imaginary part only; conjugate given in the stem; not in the 170-competency curriculum |
| 11 Trigonometry | 4 | **sin²θ + cos²θ always 1**; formula printed in the stem; no diagrams, no bearings, no elevation |
| 12 Coordinate geometry | 5 | Vector dot product mis-filed here; no line equations, no graphs |
| 13 Vectors 3D | 4 | **"Perpendicular when scalar product is ___" constant 0**; first component only |
| 14 Statistics | 5 | SD data always two repeated values; no frequency tables, charts, grouped data |
| 15 Probability | 5 | **"Greater than 5" always 1/6**; no tree diagrams, no combined events in context |
| 16 Binomial & counting | 4 | "coefficient of x^1"; no word problems on arrangements |
| 17 Logic | 4 | **AND/OR with p and q always true → always T** |
| 18 Matrices | 3 | First entry only; no multiplication of matrices, no inverse, no transformations |
| 19 Differentiation | 4 | Fine but narrow; duplicates |
| 20 Integration | 3 | Narrow; area always under y = 2x |
| 21 Calculus in Motion | 4 | Definition printed in stem; an area-between-curves question mis-filed here; "1 seconds" |

## Appendix B — Coverage of the 170 competencies by today's generators

| Stage | Competencies with any generator | Notes |
|---|---|---|
| 1 Number Consciousness | 0 / 10 | Needs visual items (counting, number line, place value) |
| 2 Arithmetic Foundations | 1 / 10 (020 HCF/LCM) | |
| 3 The Number System | 2 / 10 (027, 030) | |
| 4 Applied Arithmetic | 2 / 10 (031, 038) | |
| 5 Language of Algebra | 4 / 10 (045, 046, 048, 049) | |
| 6 Algebraic Structures | 3 / 10 (051, 053, 054) | |
| 7 Powers, Roots, Patterns | 5 / 10 (063, 064, 066, 067, 068/069, 070) | |
| 8 Geometry Foundations | 0 / 10 (077 hypotenuse only, as trig) | |
| 9 Measurement & Spatial | 0 / 10 | |
| 10 Graphs & Coordinates | 2 / 10 (093, 096) | |
| 11 Advanced Algebra | 4 / 10 (101, 103, 104, 107, 108) | |
| 12 Trig, Stats, Probability | 5 / 10 (111, 112, 114, 118, 119, 120) | |
| 13 Further Algebra & Logic | 5 / 10 (121, 122, 123, 127, 128, 129, 126) | |
| 14 Matrices & Vectors | 4 / 10 (132, 133, 137, 139) | |
| 15 Advanced Trig & Analytic | 0 / 10 | |
| 16 Calculus | 4 / 10 (153, 157, 158, 159) | |
| 17 Further & Mechanics | 2 / 10 (161, 162, 166 partial) | |
| **Total** | **≈ 45 / 170** | |

## Appendix C — Draft prerequisite edges, Stages 5–7 (draft, for two-model review and owner sign-off)

| Competency | Needs |
|---|---|
| 041 Patterns and unknown quantities | 015 tables by reasoning, 018 four operations |
| 042 Letters as variables and constants | 041 |
| 043 Terms, coefficients, expressions | 042, 023 integer × ÷ |
| 044 Like terms and simplification | 043, 022 integer + − |
| 045 Distributive law, expanding brackets | 044, 023 |
| 046 Substitution and evaluation | 043, 024 order of operations |
| 047 Equality and balance | 042, 018 |
| 048 One-step linear equations | 047, 022 |
| 049 Multi-step linear equations | 048, 045, 027 fractions |
| 050 Word problems, formula construction | 049, 040 modelling |
| 051 Change of subject | 049 |
| 052 Linear inequalities, number line | 049, 008 number lines, 021 negatives |
| 053 Simultaneous: substitution | 049, 046 |
| 054 Simultaneous: elimination | 053, 044 |
| 055 Graphical solution | 053, **091 coordinates, 094 straight line (Stage 10: sequencing problem)** |
| 056 Factorise: common factor | 045, 019 factors |
| 057 Factorise: grouping | 056 |
| 058 Difference of two squares, identities | 056, **061 squares (Stage 7: sequencing problem)** |
| 059 Algebraic fractions | 056, 027 |
| 060 Variation | 032 direct proportion, 033 inverse proportion, 051 |
| 061 Squares, cubes, higher powers | 014 multiplication, 015 |
| 062 Roots as inverse operations | 061 |
| 063 Laws of indices | 061, 043 |
| 064 Zero, negative, fractional indices | 063, 027, 062 |
| 065 Standard form | 064, 028 decimals, 035 rounding |
| 066 Surds, simplification | 062, 020 prime factors |
| 067 Surd operations, rationalisation | 066, 045, 058 |
| 068 Logarithms as inverse powers | 064 |
| 069 Laws of logarithms, log equations | 068, 063, 049 |
| 070 Sequences, AP and GP | 041, 046, 063 |

## Appendix D — Example item record

```json
{
  "id": "MI-004517",
  "kind": "mcq",
  "stem": "Solve $3(x - 2) = 2x + 5$.",
  "options": [
    {"text": "$x = 11$", "correct": true},
    {"text": "$x = 3$",  "misconception": "ALG-DIST-FIRST-ONLY"},
    {"text": "$x = -1$", "misconception": "ALG-SIGN-MOVE"},
    {"text": "$x = 7$",  "misconception": "ALG-COLLECT-CONST-WRONG"}
  ],
  "solution": [
    "Expand the bracket: $3x - 6 = 2x + 5$.",
    "Take $2x$ from both sides: $x - 6 = 5$.",
    "Add 6 to both sides: $x = 11$.",
    "Check: $3(11 - 2) = 27$ and $2(11) + 5 = 27$. ✓"
  ],
  "hints": ["Start by expanding the bracket on the left.", "Get the $x$ terms on one side."],
  "competencies": ["MC-049"], "skills": ["MC-049.2"],
  "dimension": "procedure", "difficulty": 2,
  "exam": {"style": ["WASSCE-P1", "JAMB", "BECE"]},
  "provenance": {"source": "original", "author": "writer-07", "reviewer": "spec-01", "licence": "NGG-own"},
  "status": "published"
}
```

## Appendix E — Selected sources

- Kulik, Kulik & Bangert-Drowns (1990), *Review of Educational Research* 60(2) — mastery learning.
- Muralidharan, Singh & Ganimian (2019), *American Economic Review* 109(4) — Mindspark.
- Major, Francis & Tsapali (2021), *British Journal of Educational Technology* 52(5) — personalised EdTech in LMICs.
- Pelánek (2016), *Computers & Education* — Elo in education; Khajah, Lindsey & Mozer (2016) — knowledge tracing.
- Cepeda et al. (2008), *Psychological Science* — spacing.
- Rohrer, Dedrick, Hartwig & Cheung (2020), *Journal of Educational Psychology* 112(1) — interleaved maths practice.
- Barbieri et al. (2023), *Educational Psychology Review* 35 — worked examples in maths.
- Wilson et al. (2019), *Nature Communications* 10:4646 — the ~85% rule.
- Sailer & Homner (2020), *Educational Psychology Review* 32 — gamification meta-analysis; Bai, Hew & Huang (2020); Hanus & Fox (2015).
- Linacre, *Rasch Measurement Transactions* 7:4 — sample sizes for item calibration.
- ALEKS / knowledge space theory — EDM 2022, 2024 industry papers; Matayoshi (AIED 2019).
- IXL SmartScore guide; Khan Academy mastery help pages; Sparx Maths bookwork checks (school letters).
- College Board copyright guidelines and permission form; ACT terms; Cambridge copyright guidance; WAEC study portals (2025 press); Ghana WAEC/Kingdom Books (2021 press); Nigeria Copyright Act 2022 commentary (Banwo & Ighodalo, LawPavilion).
- WAEC General and Further Mathematics syllabus copies; JAMB UTME structure; Digital SAT structure (Princeton Review, UWorld; official page blocked in this session).

*Facts marked unverified, and any official page that was blocked during research, should be checked at the source before anything public depends on them.*
