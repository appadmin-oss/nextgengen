# Brief: continuous testing and broadening (for Codex)

**Your job:** keep the test suites green and widen what they cover. You do **not** change product
behaviour. Product work belongs to the Claude sessions on `claude/finme-dues-training-fees-l54o5j`.
When a test finds a real defect, report it (see "When something fails"). Do not redesign the feature.

## Branch and git

- Work on your own branch: `codex/continuous-tests`, started from
  `claude/finme-dues-training-fees-l54o5j`.
- Before every round, run `git fetch origin` and merge that branch in. Product sessions push to it
  several times a day.
- Never commit `api/config.php`. Use `git add -A && git reset -q api/config.php`.
- Never rewrite history, force-push, or skip, disable or loosen a test to get green.
- Commits are small. Each one names what it covers and what it found.

## How the suites run

Read `CLAUDE.md` §10 first.

- **The PHP suite:** `php api/tests/run.php`. It is one file, about 7,250 checks, and takes about
  6 minutes. Each check is `chk(label, cond)`.
- **Everything:** `npm run test:all`. That is 141 steps: the build, the build test, the PHP suite, and
  every node suite. It takes hours.
- **Browser suites run one at a time, never in parallel.** Each one writes a throwaway
  `api/config.php` and refuses to start if one already exists.
  - Dev boot takes about a minute, because Babel compiles in the browser.
  - Use `waitForBoot` from `tests/_serve.js`, never a fixed sleep.
  - Chromium is at `/opt/pw-browsers/`.
- **Twice a day, run the PHP suite on MySQL too:** `npm run test:mysql` with
  `NGG_REQUIRE_MYSQL=1`. Two real defects were only visible there.

## Round loop

1. Fetch and merge the product branch. Run `node build.js`.
2. Run `php api/tests/run.php`, then the node suites one by one. Record each result as `suite: N/0`
   or `suite: N/F`, with the first failing label.
3. Triage every failure:
   - **Pinned markup.** The screen changed on purpose: the suite asserted a class or a count that
     moved. Update the assertion to pin the **promise**, not the markup. Example: "the Exams page
     offers the Lab's own papers plus the Standard exam" is a promise; "`.mlb-paper` count is 2" is
     markup. Note the change in the commit message.
   - **Race.** The suite read something before it was there. Wait for the thing it reads. Never add a
     longer fixed sleep.
   - **Product defect.** Do not fix product code. Append it to the defects log (below) and leave the
     test failing. A red test is the record.
4. Broaden, in this order of value:
   1. **Promises with no test.** Find them by reading `docs/HANDOFF.md` entries from the last two
      weeks. Each entry states what was promised.
   2. **The three states on every screen:** loading, empty, and an error with a retry.
      `CLAUDE.md` §9 says a silent empty table is the bug that hides an outage.
   3. **Server refusals.** Each refusal code a domain returns (`out_of_scope`, `own_account`,
      `members_only` …) gets a test that reaches it through `backend_dispatch`, not only the
      function.
   4. **Phone width** (390px) for every member-facing screen. Check for no horizontal scroll and that
      every control can be reached.
   5. **Keyboard and focus:** where focus goes after each press (`tests/labs-focus.test.js` is the
      model), and that Escape closes drawers.
5. Every new suite goes into `package.json`, both as its own script and inside `test:all`. A test
   file nothing runs is not a test.
6. Commit, push, and write the round summary (below).

## Rules the tests must respect

They are product rules, so a test must not assert against them:

- Never `!important` (`tests/no-important.test.js`).
- No native `confirm()` for destructive actions.
- Vocabulary (`CLAUDE.md` §5): member, centre, edition, group and participant. A Summer School child
  is a participant, never a student. "Cohort" is never shown to users.
- No exam body is named anywhere a learner reads. Internal ids may say `waec`.

## When something fails that you must not fix

Append to `docs/TEST-DEFECTS.md` (create it if needed):

```
## <date> — <suite>: <failing label>
Seen: <what happened, with the output line>
Expected: <the promise, and where it is stated (HANDOFF entry / CLAUDE.md section)>
Repro: <command>
```

## Round summary

Append to the end of `docs/HANDOFF.md`. Append only; never rewrite it.

```
## <date> — Codex test round <n>
Results: PHP N/F; <suite> N/F; …
Fixed (tests only): …
New coverage: …
Defects logged: …
```
