# The Labs — a learning-science audit (8 Nov 2026)

The owner's report: *"It felt so repetitive, your brain just wants to find patterns to get out of
it, not solve."* And: placement *"shows 1 of 5, then 1 of 6, then 7, and it goes on."*

This document records what was found, as a psychologist and as an educationist, what was
changed, and what is still open. It is evidence-led: every finding below was reproduced against
the running engine, not inferred from the design.

## 1. What a learner actually met

Sampled real practice sessions (eight questions each) from the engine:

| Topic | What came up |
|---|---|
| EN-015 Tenses | "They (finish) the project yesterday" **three times** in one session |
| MC-025 Fractions | the same "why it works" argument **four times**, lines reshuffled |
| PH-012 Friction | "Which of these REDUCES friction?" **four times**, options reshuffled |
| MC-112 Exact trig values | "What is sin 90°?" twice |

And the content behind it:

| Lab | Topics | Topics with only 3 question forms |
|---|---|---|
| Maths | 200 | 17 |
| English | 80 | **68** |
| Physics | 90 | **65** |

So most English and Physics practice was three templates on rotation. Every one of the eight
questions was on the same topic, too: the learner always knew which method the next question
wanted before reading it.

## 2. Why that defeats learning

- **Pattern-matching instead of thinking.** With one template visible at a time, the efficient
  strategy is to learn the surface ("x + 7 = 25: subtract the number") and stop reading. The
  learner does this rationally; the design rewards it. Varied practice transfers and repeating a
  single surface does not (Schmidt & Bjork 1992; Paas & van Merriënboer 1994).
- **Blocked practice hides the skill exams test first: choosing the method.** Mixing earlier
  topics in (interleaving) is the best-replicated fix in school maths. In a cluster-randomised
  trial with 787 students, the interleaved group scored 61% against 38% on an unannounced test a
  month later (Rohrer, Dedrick, Hartwig & Cheung 2019).
- **Massed over-practice is boring and buys little.** Extra same-day repetitions of a solved
  type add almost nothing long-term (Rohrer & Taylor 2006), but they cost motivation. The
  repetition is what learners feel as "annoying".
- **Wheel-spinning.** A learner who cannot get three right in a row within ten tries is not
  learning from more of the same (Beck & Gong 2013). Systems that keep serving items to such a
  learner waste their time and teach them that they "can't do maths".

## 3. Placement: what was wrong

- **It started everyone at Stage 1.** A JSS3 learner in Maths faced up to **20 gates** of 4–6
  questions, each a fresh "Question 1 of N". Placement looked endless and opened with counting.
- **One slip ended it for good.** A gate passed only if *every* answer was right *and* fast.
  Anything less fixed the learner's level permanently, with no way to redo it. A careless slip,
  or a slow typist on a phone, placed a strong learner years too low.
- **A stage is the wrong unit.** A child can be well ahead in Number and behind in Geometry; a
  single stage for both under-teaches one and over-teaches the other.
- **In lessons, the step count grew while you watched.** "Step 1 of 5" became "Step 1 of 6" as
  the Remember-it card loaded late.

## 4. What was changed

### Practice

- **No repeats.** A question is never asked twice in one session, and no wording more than twice.
- **Forms rotate like a dealt deck**: every form once before any repeats, and never the same form
  twice in a row.
- **One "why it works" per session.**
- **Interleaving.** Practice carries up to two questions from topics the learner already knows,
  this topic's prerequisites first. They are placed among the new ones, never first, and never
  labelled.
- **Retake debt cut from 5 to 3** right answers after a failed mastery check.

### Placement: knowledge-space placement with an adaptive ability estimate

This is the method ALEKS is built on (Doignon & Falmagne). ALEKS's own K–12 placement asks at
most 16 questions (EDM 2024).

- **Every topic has a probability the learner knows it.** That probability comes from an
  ability estimate per strand (Number, Algebra, Speech Work…). It starts near where learners of
  that age usually are, and every answer in that strand moves it with an Elo/IRT update
  (Pelánek 2016).
- **The prerequisite graph** (313 links in Maths) spreads each answer. A right answer means
  everything the topic is built on is known. A wrong one means nothing built on it can be.
- **Each next question goes where it tells us most:** the strand we know least about, at the
  topic closest to fifty-fifty for this learner.
- **A surprise is checked, not trusted.** An answer the model rated under one in five (likely a
  slip or a guess) is followed by a question in the same strand at the same stage.
- **It stops when little is uncertain**: usually 6–10 questions, never more than 15. The counter
  reads "at most 15, usually fewer" and never changes. Nothing is timed, and nothing is marked
  while it runs.
- **It can be redone once a week.** A redo clears whatever placement alone had marked known.

Measured in simulation, 20 runs per profile:
- **Accuracy:** 91–100% of topics classified correctly for most learner profiles, with and without
  careless slips.
- **Over-placement:** under 5% of topics are ever called known when they are not. Errors run the
  safe way.
- **Known weak spots:**
  - Very strong Maths learners with slips are under-placed on the top strands (70–90%).
  - An early slip can leave about a fifth of a strong learner's topics to (quickly) learn.

  Reviews within days, and the weekly redo, absorb both.

### Lessons

- The step list is drawn once, after everything it depends on has arrived.

## 5. Still open (the next work, in order)

1. **Content depth: the real cause of repetition.** 68 English and 65 Physics topics have three
   question forms. The target is 5–7 forms per topic, with at least two typed, and contexts drawn
   from a pool, not fixed. The engine now refuses to repeat, so a thin topic gives a shorter
   session rather than a repetitive one. That is better, but not the fix.
2. **Wheel-spinning detection.** No three in a row within ten tries should stop practice and
   change the approach: re-teach with the worked example, send the learner to the prerequisite
   that is failing, or open Guide (the hint companion). It should not serve more of the same.
3. **Fast-track for what is already known (the expertise-reversal effect, Kalyuga 2003).**
   Forcing a learner who knows a topic through every lesson step is a known harm. A short typed
   pre-check could open Practise straight away. This touches the owner's "everyone must study"
   rule (4 Nov 2026), so it needs a decision.
4. **Distractors that need knowledge.** Several multiple-choice items can be answered by
   elimination ("Benue grows yams" as a main idea). Distractors should be the misconceptions
   learners actually hold.
5. **Calibrated difficulty.** Topic difficulty is currently its stage. Learning each topic's
   difficulty from real answers (Elo item ratings) would sharpen placement and practice. Use two
   parallel rating chains, so adaptive selection does not bias the ratings (Keeping Elo alive,
   2025).

## Sources

- Rohrer, Dedrick, Hartwig & Cheung (2019), *A randomized controlled trial of interleaved mathematics practice*, J. Educ. Psych.
- Rohrer & Taylor (2006, 2007) on overlearning and shuffled practice.
- Schmidt & Bjork (1992); Paas & van Merriënboer (1994) on variability of practice.
- Beck & Gong (2013), *Wheel-spinning: students who fail to master a skill*, AIED.
- Doignon & Falmagne, *Knowledge Spaces*; ALEKS placement evaluation, EDM 2024 industry track.
- Matayoshi et al., stopping rules for adaptive assessments (AIED 2019; IJAIED 2021).
- Pelánek (2016), *Applications of the Elo rating system in adaptive educational systems*, Computers & Education.
- *Keeping Elo alive* (2025), measurement properties of Elo-based learning systems.
- Kalyuga (2003), the expertise reversal effect.

---

# Round 2 — 13 Nov 2026: "it still feels repetitive"

Round 1 stopped identical questions. Round 2 measured what a learner's brain actually recognises:
the question's **skeleton**, meaning its wording with the numbers, names and quoted text blanked.

## Findings

| Measure | Maths | English | Physics |
|---|---|---|---|
| Distinct skeletons in an 8-question session (median) | 5 | 7 | 6 |
| Sessions with ≤3 skeletons | **21%** | 0% | 0% |
| Topics with <5 distinct skeletons | **61** | 1 | 0 |
| Multiple-choice share | 32% | **62%** | 37% |

1. **The first Maths topics are the thinnest, and every new learner starts there.**
   - MC-001 to MC-040 have **one or two practice forms each**. The other two forms are "why it
     works" arguments, allowed once a session.
   - So MC-012 practice was "Ebo has ₦389 and Ife has ₦163. How much more does Ebo have?" seven
     times, with names and amounts swapped.
   - Round 1's "forms per topic" figure counted the why forms, and hid this.
2. **The wording cap compared exact sentences,** and a new name and new numbers make every
   sentence technically different.
3. **The feedback after a right answer was chosen by the question's position.** Question 1 always
   said "Nice work!" and question 2 always "Correct!", so every session opened with the same words.
   Several lines ("You've got this!") praised the child, not the work.
   Feedback on the task and the process helps; praise of the self does not (Hattie & Timperley 2007;
   Kluger & DeNisi 1996).
4. **Over-practice (fixed 9 Nov).** A learner who never erred answered 16 questions per topic.
   Three in a row now opens a six-question check, about 9 questions in all
   (Cen, Koedinger & Junker 2007; Kelly et al. 2015).
5. **The lesson routine was the same for every topic.** Line-by-line worked examples and a
   mandatory picture walk suit a first topic and become tedious by the twentieth. Worked examples
   should fade as competence grows (Renkl & Atkinson 2003; Kalyuga's expertise reversal).
6. **English is still 62% multiple choice.** Recognition is easier than recall, and a quarter of
   guesses are right. The Codex English work added production forms; more are still needed.

## Changes

- **Skeleton cap.** A skeleton is capped at two per session (three for picture questions). Recent
  sessions are avoided by skeleton too. A thin topic now gives a short session, never copies.
- **Reviews cover every topic due.** A review always asks one question per due topic; freshness
  can no longer drop a topic.
- **Feedback names the result.**
  - A right answer is confirmed plainly.
  - Streaks and recoveries are named as what the learner did.
  - "Not quite" lines are picked at random and point the learner to the working.
- **Fading.** After five topics studied in a Lab, the worked example offers "Show the whole
  working" in one press, and the Remember-it step no longer blocks moving on.
- **Content.** New practice forms for the 61 thin Maths topics, Stages 1–4 first, appended only so
  no stored session changes.

## Round 3 — 13 Nov 2026: "Why was mine wrong?"

A wrong TYPED answer used to get only the key and the generic working. The learner who typed 226 for
236 was told the same thing as the one who typed 9. That gap is now closed by
`api/_lib/domain/mathslab-explain.php`, in three layers:

1. **Code names the slip where it can:**
   - the sign;
   - a power of ten (place value or units);
   - one off (counting the starting number);
   - the digits swapped;
   - stopping at an earlier line of the working;
   - the wrong operation on the question's own numbers, named: "your answer is 389 + 163".
2. **Otherwise the AI gives one or two sentences.** It is given the question, the key, the steps
   and the answer, and nothing about the child.
3. **Code checks the AI.** A reply carrying a number found nowhere in the question, the working or
   the learner's answer is discarded. That is the hallucination Reddig et al. (IJAIED 2025)
   measured in about a third of GPT-4's error hints. The learner gets a pointer to the working
   instead.

The learner opens it themselves. The evidence is that LLM feedback helps when learners choose to
use it (arXiv 2506.17006). It runs in practice only; a check, quick check, boss or exam refuses it.
AI calls spend the shared daily allowance, and a failed call is given back.

## Round 4 — 13 Nov 2026: "Work through one with Guide"

When the stuck card appears (no three right in a row in the last ten), it now offers a fourth way
on: a guided question with Guide (`api/_lib/domain/mathslab-walk.php`, op `mathslab.walk`).

The research is a warning as much as a promise:
- **An unguarded chatbot can harm learning.** In a field experiment with nearly a thousand
  high-school maths students, GPT-4 raised practice grades. Students who then lost it scored about
  17% lower on the unassisted exam than students who never had it. Most had used it to get answers
  (Bastani et al., PNAS 2025). The same model, prompted to give hints and not answers, did no such
  harm.
- **AI coaching helps when it gives fewer answers away.** In a randomised trial, an AI that
  suggested what human tutors should say raised mastery by 4 points, and by 9 for students of the
  weakest tutors. It did this by giving fewer answers away and asking more probing questions
  (Tutor CoPilot, Wang et al. 2024).

So the design keeps the answer away from the AI entirely:

- **A fresh question.** The question just missed already shows its answer and working, so Guide
  starts a new one of the same topic, with the key held on the server.
- **Code holds the ladder.**
  1. The authored hint.
  2. The working, one line per press, stopping before any line that contains the answer.
  3. The whole working, then "Now try one on your own".
- **The AI only rewords the rung,** in reply to what the learner said or tried. It is never sent the
  key. Code rejects a reply that states the answer, or that uses a number from a line not yet
  revealed. Small numbers count here too: "9 take away 3 gives 6" is that line leaking. A rejected
  reply is replaced by the rung's own words.
- **Not marked.** The guided question does not move mastery or count towards three in a row. The
  next, unaided question is the one that counts.
- **Limits and safeguarding.** At most four AI turns per question, from the shared daily allowance;
  a failed call is refunded. What the learner types is checked for a disclosure first, and a
  disclosure is answered with people, never a hint.

Tests: 14 PHP checks (`walk ·` in `api/tests/run.php`) and a phone journey in
`tests/mathlab-e2e.test.js`: stuck card → Guide → each rung → whole working → a fresh unaided
question, with mastery unchanged.

Sources: Bastani et al. (2025), *Generative AI without guardrails can harm learning*, PNAS 122;
Wang, Ribeiro, Robinson, Loeb & Demszky (2024), *Tutor CoPilot*, arXiv 2410.03017.

### Round 4, follow-up (same day)

- **"Prefer typed" was reversed.** The sort in `mlb_pick_items` put typed forms *last*. So the
  quick check that can mark a topic known, and every review, asked the recognisable forms instead:
  recognition passing for recall. Building Guide exposed it: twelve Guide picks on MC-012, which
  has three typed forms, gave no typed question. The comparator is fixed, and two tests pin the
  promise:
  - typed first, 20 draws out of 20;
  - a quick check is all typed when the topic has typed forms.
- **Guide picks a parallel problem.** It now avoids only the exact questions asked, not their
  shapes (the same kind of question with new numbers is what a walk-through wants), and uses skill
  forms only. It had been serving the "why it works" ordering forms, which have no working to climb.
- **A wrong try in Guide is told its slip,** named in code: ten times too big, the wrong
  operation on the question's numbers, or the authored misconception for a choice.


## Round 5 — 13 Nov 2026: proofs, recalibrated

The owner tried the Lab and reported: *"I did not try learning again. I just wanted to spot
patterns. Also, I think you may have taken the understanding how it works a little too far."*

**Measured before the change:**
- **Lessons:** 116 of 200 Maths topics made the learner read a formal argument, line by line,
  before practising. That included primary subtraction (MC-012), whose argument is algebra.
- **Practice:** every practice session on those topics included a proof question.
- **Mastery checks:** 112 of them did too, so mastering "a − b" meant putting an argument's lines
  in order. That form is the most pattern-matchable question in the Lab: the "So…" line goes last.

**Changed:**
- **Mastery checks test the skill, never the proof:** 0 of 1,200 sampled questions.
- **The "put the argument in order" form is no longer asked.**
- **"Why is line N true?" is asked only from Stage 5** (`MLB_WHY_FROM_STAGE`), at most once a
  session. Stages 1–4 are primary-age foundations: their lessons keep the idea, and their practice
  is the skill.
- **The lesson's argument no longer gates the lesson.** The idea is shown; the line-by-line argument
  is there to read. The worked example still has to be worked, so a lesson still cannot be skipped.
  The English Lab's "The rule" stays a required step, because there the learner judges every line.

The proofs themselves are unchanged. The owner's rule for them was "only necessary", and showing
why mathematics works stays the Clinic's founding idea. What changed is that the proofs are no
longer *tested* as if they were the skill.
