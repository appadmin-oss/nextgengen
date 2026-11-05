# Adding a Lab

The owner (5 Nov 2026): *"Prepare, we'll be adding more labs."*

The Maths Lab is the first Lab. Most of what it does is not maths: the climb, practice, mastery
checks, reviews, the stage boss, certificates, the Daily Problem and the timed exam papers. A
new Lab (Physics, Chemistry, English…) brings its own **content** and reuses the **engine**. It
must never fork the engine. Two copies of the guards (marking, the server clock, the "never
send the key" rule) is how one copy ends up missing a guard.

## 1. Register it

`api/_lib/domain/labs.php` holds `LABS`, the one list of Labs (CLAUDE.md §11). Add an entry:

```php
'physics' => ['id' => 'physics', 'title' => 'Physics Lab', 'subject' => 'Physics', 'prefix' => 'PH',
    'path' => '/study/physics', 'status' => 'soon', 'icon' => 'ph-atom', 'docProgram' => 'physicslab',
    'what' => 'One line a child understands.'],
```

- **`prefix`** is two capital letters. It must be unique; the PHP suite fails on a duplicate.
- **Topic ids** are `PREFIX-NNN` (`PH-001`). Because ids never collide across Labs, the shared
  tables (`mlab_state`, `mlab_sessions`, `mlab_profile`, `mlab_enrol`) hold every Lab's rows with
  **no migration**.
- **`status`** is `soon` until the Lab's first stage has questions, then `live`.

## 2. Bring the content (one file per kind, as Maths does)

| Maths file | What it holds | A new Lab needs |
|---|---|---|
| `mathslab-map.php` | `mlb_stage_table()` (stages → ten topic titles), strands, `MLB_BANDS`, `MLB_EDGES` (prerequisites), `mlb_courses()` | the same shapes, ids with the Lab's prefix |
| `mathslab-gen*.php` | `mlb_forms()`: topic id → list of question generators | generators built with the SAME item builders: `mlb_typed`, `mlb_mcq`, `mlb_error_of`, `mlb_jamb` / `mlb_sat` |
| `mathslab-why.php` | "Why it works" proofs, where a topic rests on a result | optional; same shape |
| `mlb-app.jsx` `MLB_EXPLORE` | interactive explorers per topic | optional |

Every domain file must be added to the explicit list in `api/_lib/bootstrap.php`. A file that is
not in that list does not exist.

## 3. The rules every generator follows (they are tested)

- **Derive every answer and every wrong option.** Never type a key: a mistyped key marks a child
  wrong.
- **Name the misconception behind each wrong option.**
- **Give every question worked steps and a hint.** Maths is written in LaTeX.
- **Append only.** A session stores (topic, form number, seed), so a form never changes its
  number. New forms go at the END of a topic's list. The proof pair's position is recorded while
  the list is built (`mlb_why_at`), so appending never moves it.
- **The sweep in `api/tests/run.php` must pass.** It generates every form under many seeds and
  checks:
  - the key marks itself right;
  - no option repeats;
  - no typed form gives everyone the same answer;
  - the key never reaches the browser.

## 4. What still has to be generalised when the second Lab arrives

Today the engine (`domain/mathslab.php`) reads Maths' map and forms directly:
`mlb_competencies()`, `mlb_stages()`, `mlb_forms()`, `mlb_courses()` and `MLB_BANDS`.

When the second Lab's content exists, the change is mechanical:

1. **Pass the Lab id through.** `mathslab.*` ops take a `lab` parameter, defaulting to `maths` so
   every existing link keeps working.
2. **Resolve through the registry.** Each of those five readers resolves through `LABS[$lab]`:
   add `'map' => 'mlb_stage_table'`, `'forms' => 'mlb_forms'` and so on to the entry, and call
   those functions.
3. **Make the client Lab-aware.**
   - `MathsLab` takes the Lab from the path (`/study/<lab>`).
   - The study-tools shell lists Labs from `labs.list` instead of one hard-coded "Maths Lab" tab.
   - The topic-id pattern in `mlbRoute` already accepts any prefix.
4. **File certificates per Lab.** They are numbered NGG documents filed under `docProgram`.
   `documents.php` checks `'mathslab'` in two places; make those read the registry.

This was not done in advance on purpose. An abstraction with only one user is a guess about the
second, and the second Lab's real needs (units in answers, diagrams of circuits, essay marking for
English) will decide it.

## 5. Checklist for a new Lab

- [ ] `LABS` entry with a unique prefix.
- [ ] Map file, forms file(s), optional proofs, all in `bootstrap.php`'s list.
- [ ] PHP suite green, including the generator sweep and the Lab registry check.
- [ ] `docs/ADMIN-GUIDE.md`: what the Lab covers and how its levels map to school years.
- [ ] `docs/HANDOFF.md`: append the change record.
