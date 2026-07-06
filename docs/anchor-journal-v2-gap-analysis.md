# Anchor Journal v2 — design gap analysis & implementation plan

Source of truth: the uploaded design comps **`Anchor Journal.dc.html`** (the member
PWA) and **`Anchor Portal.dc.html`** (the *Anchor Circle* guardian/mentor portal),
plus their prototype logic. This document itemises every screen and feature in the
design, its status against what we currently ship (`journal/*`), and the work
required. **Nothing in the design is to be skipped.**

> Note: the user has said **another Journal update is still on the way**, so build
> each item modularly (member_state-backed tools, cap-gated portal) to absorb churn.

Legend: ✅ have · 🟡 partial/needs upgrade · 🔴 missing (new build)

---

## A. Member PWA — screens

### A1. Onboarding — 🟡 upgrade (currently single screen)
Design = 4 steps with a back button + progress dots:
1. **Welcome** (brand lockup + tagline).
2. **Name** — capture the member's preferred name.
3. **Why** — pick a motivation from chips (auto-disqualify none; just tags the journey).
4. **Study time** — pick a daily study time (5 presets).
- Persist `name`, `why`, `studyTime` (member_state `prefs` + optional profile name).
- "Replay intro" in You must re-enter this flow.

### A2. Home / Journey — 🟡 upgrade
- Top bar: streak 🔥, diamonds 💎 (taps → Shop), calendar btn, You (star) btn. ✅ mostly.
- "Today's reflection is waiting" / "Anchored for today" banner. ✅.
- Greeting + name. ✅.
- **Level card**: `Level N · <LevelName>`, `WEEK 01 · IDENTITY`, streak pill, XP bar
  `{xp} / 250 XP`, `NEXT · LEVEL {n+1}`. 🟡 align to the 250-XP/level model (§C).
- **QUICK TOOLS** grid (6 tiles): Focus · Notepad · Goals · Systems · Calendar · Journal. 🔴 new.
- **This week's path** — 5 nodes (reflection, name-yourself, daily systems, morning quote,
  night reflection). ✅ (nodes already tappable).

### A3. Reflect editor — 🟡 major upgrade
Design sections:
1. Morning quote + Read aloud. ✅.
2. Today's musing (textarea). ✅.
3. Daily system check (6 toggles) + mood row. ✅.
4. **School execution log** 🔴: "What I learned today" text **+ Yes/No rows** ("Did I take
   notes properly?", "Did I respect my teacher?").
5. **Home execution log** 🔴: Yes/No rows ("Did I follow my study time?", "Did I obey
   instructions at home?") **+ "How did I use my phone today?"** text.
6. **Peer modeling** 🔴: "Who did I influence or invite today?" + "What behaviour did they
   notice in me?"
7. Night reflection · 3 sentences. ✅.
8. **"Talk it through with your Coach"** entry → Coach (§A11). 🔴.
- "Anchor it" → +60 XP, +5 💎, streak, celebrate. 🟡 align economy.
- The extra Yes/No + text fields must be captured into the saved entry body and parsed
  back by the entry-detail view.

### A4. Daily systems — ✅ (matches; keep week-history we added).
### A5. Timeline / journal — ✅ (entry cards + tap-to-detail already shipped).
### A6. Calendar — ✅ (stats, grid, legend, day detail). Minor visual alignment only.
### A7. Growth — ✅ mostly (rank ring, streak/diamonds, week dots, rank ladder, self-score,
habit focus, 12-week grid). Add **Anchor shop** link row (§A9). Self-score is display-only
in the design here (no tap-to-rate shown) — keep our editable version.
### A8. Library (quotes + 12 weeks) & Week detail — ✅.
### A9. Anchor Shop — 🔴 new
- **Streak Freeze** (30 💎) — miss a day without losing the streak.
- **Accent themes** — lime (default/owned) + violet / amber / mint (purchasable, then equip).
- Equipping a theme overrides the app accent everywhere.
- Persist: `diamonds`, `ownedThemes`, `accent`, `streakFrozen` (member_state).
### A10. You — 🟡 upgrade
- Profile card (name, level). ✅.
- **YOUR CIRCLE + Anchor Link invite code** 🔴: a 6-digit code the member reads to a
  parent/teacher/mentor to connect via the portal; circle rows (Home/School/Mentor) show
  real LINKED/PENDING status from the backend (§B).
- Settings: reminder ✅, read-aloud ✅, **Sound & haptics** 🔴 (new toggle), The Charge ✅,
  Replay intro ✅.
### A11. Coach (AI Reflection Coach) — 🔴 new
- Chat UI; Socratic, warm, **refuses schoolwork/answers** (system prompt in the design).
- Backend: reuse `api/_lib/ai.php` (`ai_complete`) with the coach system prompt; new
  `member.coach` op (rate-limited). Graceful fallback to canned reflective prompts when no
  AI key is configured. Coach chats are **private** (never shared to the circle).
### A12. Focus — 🔴 new (also a bottom-nav tab)
- Presets: Study 25m / Break 5m / Deep 45m; circular countdown; start/pause/reset.
- Completing a session → +5 💎 + toast.
- **Today's tasks**: add / toggle / remove (persist in member_state, per-day).
### A13. Notepad + Note editor — 🔴 new
- List of free notes (title, preview, date); create/edit/delete; full-screen editor.
- Private; persist in member_state (or a `journal_notes` store if size warrants).
### A14. Goals — 🔴 new
- List with progress bars, +/- steppers, add goal (title + target #), **Share** (Web Share
  API / clipboard). Persist in member_state.
### A15. The Charge — ✅ (static letter; matches).
### A16. Bottom nav — 🟡 add **Focus** (4 tabs: Journey · Focus · Growth · You).
### A17. Celebrations — 🟡 add a distinct **Level-up** overlay (we only have "Anchored!").

---

## B. Anchor Circle Portal (guardian / teacher / mentor) — 🔴 entirely new
A separate surface (the "linking" the user flagged). Flow:
1. **Role** — Parent/Guardian · Teacher · Afrovanguard Mentor. Copy stresses read-only.
2. **Code** — enter the student's 6-digit Anchor Link code.
3. **Verify** — show the matched student; confirm.
4. **Consent** — explicit CAN (see streaks/systems/progress, confirm conduct, leave remarks)
   vs CANNOT (read reflections, open notes/goals, see coach chats) + agree checkbox.
5. **Dashboard**:
   - Student header (name, week/level, streak).
   - Stats: avg systems, reflections, conduct %.
   - Systems-held-this-week bar chart.
   - **Confirm conduct** — per-day toggles (role-specific copy).
   - **Leave a weekly remark** → surfaces in the student's Weekly Review / mentor card.
   - **Download weekly report** (PDF/printable).
   - **Unlink**.
   - **Mentor** role additionally sees a **cohort strip** (multiple students, at-risk flags).

**Backend for §B (the linking core):**
- Migration: `circle_links` (memberId ↔ guardian identity + role + status + createdAt +
  revokedAt), `circle_confirmations` (per member/week/day/role), `circle_remarks`
  (member/week/role/text). Invite code stored/rotatable on the member (or a codes table).
- Ops: `member.circle` (my links + statuses + invite code), `member.circle.rotateCode`,
  `member.circle.revoke`; portal side `circle.pair` (code→student), `circle.dashboard`,
  `circle.confirm`, `circle.remark`, `circle.report`, mentor `circle.cohort`.
- Auth model for guardians/teachers: code-based lightweight link (decide: anonymous
  code-scoped token vs. account). Mentors are existing Afrovanguard mentor accounts.
- Wire the student's **Your Circle** statuses + **Weekly Review remarks** to this real data
  (the `mentor.remark`/circle seam is already in the journal — feed it for real).

---

## C. Economy & progression alignment — 🟡
- **250 XP per level**, 5 levels (Seedling→Vanguard), +60 XP + 5 💎 per reflection,
  +5 💎 per focus session; level-up crosses 250 and rolls the remainder.
- Reconcile with our current rank/XP model; keep server-derived where possible, but
  diamonds/levels/themes are member_state (client-authoritative cosmetic economy).

---

## D. Visual system — 🟡
- Fonts: **Bricolage Grotesque** (display), **Space Grotesk** (body), **Space Mono** (mono).
  The PWA is offline/CSP-bound, so **self-host** these fonts in `journal/` (woff2) rather
  than Google Fonts, or accept the existing system fallback. Track as an explicit item.
- Accent is themeable (§A9); default lime `#c9f24e`. Violet/pink gradient background,
  floating blobs — already close in our build.

---

## E. Persistence map
- **member_state (KV, exists):** prefs (name/why/studyTime/reminder/readAloud/sound),
  systems:*, selfscore:*, peers, **notes**, **goals**, **focusTasks:<day>**, **shop**
  (diamonds/ownedThemes/accent/streakFrozen), coach transcript (optional, private).
- **server tables (new):** circle_links, circle_confirmations, circle_remarks (+ invite code).
- Diamonds: cosmetic — keep client/member_state authoritative; do not gate real value on it.

---

## F. Build phases (tasks)
1. **Tools foundation + multi-step onboarding** — member_state plumbing, name/why/studyTime.
2. **Focus / Notepad / Goals** — self-contained tool screens + Quick Tools grid + 4-tab nav.
3. **Reflect editor v2** — school/home Yes-No logs, phone use, peer notice, coach entry.
4. **Coach** — `member.coach` op on ai.php + chat UI + graceful fallback.
5. **Shop + economy** — diamonds/levels/themes/streak-freeze + level-up celebration.
6. **Circle linking backend** — migrations + ops + invite code.
7. **You → Your Circle + invite code** wired to real link status.
8. **Anchor Circle Portal** — role→code→verify→consent→dashboard (+ mentor cohort).
9. **Weekly report** (printable) + remark→Weekly-Review wiring.
10. **Self-hosted fonts** + final visual alignment.
11. Each phase: tests + build both targets + Playwright smoke + commit.
