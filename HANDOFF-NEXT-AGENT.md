# HANDOFF — for the next agent (17 Nov 2026)

**Delete this file when everything in it is done**, and append what you did to `docs/HANDOFF.md`, which
is the permanent log. Never rewrite that one.

## Ground rules (the owner's, standing)

**Branch and git**
- **The owner, 18 Nov: "Never add Claude/ to my branches again!"** Never create or push a branch whose name
  starts with `claude/`. Use the owner's `afv/` prefix.
- Branch: `afv/brave-faraday-pdlh7o` (it carries everything on `claude/finme-dues-training-fees-l54o5j` and
  more; that older branch is no longer pushed to). No pull request.
- **Other sessions push to this branch too.** Before you start anything, and again before every push,
  run `git fetch origin` and `git log HEAD..origin/afv/brave-faraday-pdlh7o`. Never
  duplicate work already pushed. It happened on 17 Nov: the shop's pages were built twice in parallel.
  Merge (fast-forward when you can); never force-push.
- Never commit `api/config.php`: `git add -A && git reset -q api/config.php`.
- Commit trailers:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MrRoWy2syTb9DhJTxkdYka
  ```

**The owner's rules**
- Never patch with `!important`.
- No lazy builds; every feature completely functional.
- Don't ask, decide — but when the owner says "don't build yet", don't.
- Read `CLAUDE.md` first.

**After each batch**
- Build: `node build.js`.
- PHP suite: `php api/tests/run.php`.
- The browser suites the change touches, **one at a time**. Each writes a throwaway `api/config.php`
  and refuses to start if one exists.
- Docs: `docs/ADMIN-GUIDE.md`, and append to `docs/HANDOFF.md`.
- Commit and push.
- Production zip in the scratchpad: `ngg-production.zip` built from `dist/`, excluding
  `api/config.php`, `*.log`, `api/_cache`, `api/logs` and `api/storage`.
- HawkScan cannot run here (no `HAWK_API_KEY`). Say so.

**State at hand-over**
- PHP suite 7330/0. Schema target 238.
- Last green browser runs: shop 26/0, mathlab-e2e 135/0, labs-focus 14/0, membership-pay 41/0,
  assign-desk 34/0, club-apply 50/0.

---

## 1. Shop management upgrade — NGG done (18 Nov); Africa GATES on its own branch

**NGG: done** — all ten items of `docs/SHOP-MANAGEMENT-PLAN.md` §2 (see the 18 Nov entry in `docs/HANDOFF.md`
and the shop section of `docs/ADMIN-GUIDE.md`). **Africa GATES:** built on `afv/shop-upgrade` in
appadmin-oss/Africa-GATES (from `claude/ai-assistance-judges-features-1ka4oz`); read that branch's own handoff
notes for what is finished.

The original brief, kept for context:

Owner, 17 Nov: *"Upgrade the shop massively. Add the Africa GATES repo latest branch and also massively
upgrade its shop for better and effective management. Research!"*

**The research and the Africa GATES audit are done.** Read `docs/SHOP-MANAGEMENT-PLAN.md` before
anything. It holds the research with sources, the "do not build" list, NGG's current shop and its build
order (§2), and the Africa GATES audit, its gaps, its build order and its environment notes (§3).

Still open, outside §2 and never asked for: delivery zones, a member price, bundles, a VAT line. Unconfirmed
with Paystack: whether bank-transfer and USSD payments refund automatically (a failed refund says so).

## 2. Online NGG members (the owner's decisions recorded; phase 1 done)

Read `docs/ONLINE-MEMBERS-PLAN.md`. It holds the owner's voice note, the decisions, the phases and the
survey of where the code assumes a centre.

**Done:** phase 1 (`35217954`). The **NGG Online** home is a `centres` row with `online = 1`, added by
migration 236. Online members have no meeting days, so they get no absence, fine, suspension or held
day. The join form lists only buildings.

**The owner's decisions on 17 Nov:**
- No yearly fee.
- **$10 registration, which comes with a mentor.** The voice note said $10 a month, prepaid: confirm
  which.
- **$5 per course, with an instructor.** Per month, or once? Confirm.
- *"Upgrade the value of being an online member so the pay is actually worth it."* The plan lists the
  value case.

**Next:** phase 2.
- The join form asks "At a centre (scholarship)" or "Online".
- Accepting an online member sends the online invoice: in full, not pro-rated, with no yearly fee.
- The money settings `onlineMonthlyNgn` 13000 and `onlineMonthlyUsd` 10.
- Course enrolment at $5 with an instructor.
- Then phases 3–6.

**Still open with the owner:**
- What happens to an unpaid online member's access.
- Dollars or naira for buyers abroad.
- The scholarship T-shirt price. On-site scholarship members pay the T-shirt plus a ₦2,000 commitment
  fee; there is no T-shirt in the joining invoice yet.

## 3. Labs standard exam (TODO 1–3 done; one item open)

Done 17 Nov:

| Item | Commit |
|---|---|
| Blueprint and difficulty mix | `3f102326` |
| Exam hall: navigator, flags, change answers until hand-in | `9cdd6b28` |
| Report: what to study, pace, last paper, predicted grade | `63e5f88e` |

The admin guide is updated (`70927aae`).

**Open: TODO 4, a licence-gated slot for real past questions.**
- A table for licensed items with their provenance: board, year, paper, number and licence ref.
- A setting that stays **off** until staff record a licence reference.
- The engine mixes the items in only when the setting is on.
- Staff import and a toggle in the Control Room (Learning).
- Tests that it stays off.
- **Never** load exam-board text without a licence, and never name an exam body in learner-facing text.

## 4. Also on this branch from 17 Nov (all pushed; for context)

- **Maths length tell** (`7bf1b132`, docs/LABS-AUDIT.md round 9): 57 Maths forms that gave their
  answer away by length were fixed.
- **Merges and ports:**
  - `claude/magical-fermi-d97fqw` merged (`247dbee2`).
  - The assignments audit from `claude/stoic-hamilton-1f18hh` ported (`92668895`). That branch is a
    separate history frozen at 31 Oct; **never merge it**, because it would delete about 100k lines.
- **Mentor intake fix** (`67f9708f`):
  - "Accept" on a mentor application now creates the mentor.
  - A stuck accepted application comes back to the Inbox as "Finish: create the mentor".
- **The NGG shop** (`d0f498fa` server; pages `7d23dcdf` by a parallel session): Paystack checkout,
  stock per option, collection or delivery, the Control Room desk.
- **Codex test brief** (`docs/CODEX-TEST-BRIEF.md`): the owner runs Codex on `codex/continuous-tests` to
  test and broaden the suites. It logs product defects in `docs/TEST-DEFECTS.md`. Check that file for
  anything it found.
- **A local stash in the 17 Nov container** (`my-shop-pages-superseded-by-7d23dcdf`) holds a superseded
  second version of the shop pages. It is not needed.
