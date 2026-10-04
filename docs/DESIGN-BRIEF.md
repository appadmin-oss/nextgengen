# Design brief — the NGG Control Room, member portal and curriculum document

For the redesign done in **Claude Design**. Hand this whole file over as the brief.
It says what to design, what the product can and cannot build, and what to send back
so the design lands as designed instead of being reinterpreted on the way in.

---

## 1. What is being redesigned, in order

| # | Surface | Where it lives today | Who uses it |
|---|---|---|---|
| 1 | **Control Room shell**: sidebar, top bar, command palette (⌘K), section headers, tabs | `page-admin.jsx` (`AdminShell`, `ADMIN_SECTIONS`), `command.jsx` | Staff, daily |
| 2 | **Status board**: KPI strip and one table per kind of person | `AdminStatus` in `page-admin.jsx` | Leads, admins |
| 3 | **Members**: dashboard tiles, roster table, bulk bar, row menu, and the **member record drawer** with its eight tabs | `AdminMembers`, `AdminMemberDetail`, `MemberRecordPanel` | Staff |
| 4 | **Shared admin vocabulary**: tables, drawers, chips, KPI tiles, empty/loading/error states, confirm dialogs, toasts, form fields | `components.jsx`, `styles-app.css` | Every section |
| 5 | **Member portal**: dashboard, curriculum, timetable, card, journal links | `page-dashboard.jsx` | Members (children and teens) |
| 6 | **Family page** (parents and guardians) | `page-family.jsx` | Guardians |
| 7 | **Curriculum document**: the downloadable PDF and Word file | `api/_lib/templates/curriculum-document.{php,css}` | Members, guardians |

The rest of the Control Room (about forty sections) gets #4 and inherits the result.
Design #4 once, well; do not mock up every section.

**Out of scope.** The **Card Studio** (`/cards`) and the **Design Studio**
(`/designer`) already have their own closed dark design system, documented in
CLAUDE.md §8. Leave them alone, unless you are deliberately proposing to bring the
Control Room onto the same tokens. If so, say so: that is a decision, not a
side effect.

## 2. The constraints a design has to fit

These are facts about the hosting, not preferences. A design that needs one of
them broken cannot be shipped.

- **Shared hosting: Apache and PHP.** No Node on the server, no build step on the
  server, no server-side renderer, no headless browser.
- **React 18 with no framework and no bundler at runtime.** Every `.jsx` file is
  concatenated into one script. There is no CSS-in-JS, no Tailwind build and no
  component library. **Styling is plain CSS**: `styles.css` for the public site
  and portal, `styles-app.css` for the Control Room.
- **No new npm runtime dependencies.** Fonts must be self-hosted files, or system
  fonts. External stylesheets and CDNs are not available to the app.
- **Classes, not inline styles.** The Control Room still carries about 1,100
  inline `style={{…}}` objects, and that is where the current inconsistency
  lives. The redesign is the moment to replace them with named classes. Deliver
  the design as classes and tokens so that can happen.
- **One renderer per thing.** For example, one member card renderer. Do not
  propose a second visual version of something that already renders, such as a
  "preview" that differs from the print.

## 3. Rules the design must keep

These are enforced by tests or written into the codebase's rules:

- **Contrast**: 4.5:1 minimum for all body and caption text, on screen and in
  print. 3:1 for borders and controls that carry meaning.
- **Targets**: 24×24px minimum; 44px on touch (`pointer: coarse`).
- **No drag-only interactions.** Every action has a click or keyboard route.
- **Every icon-only control has a visible-on-focus label.** Every toggle shows
  its pressed state.
- **Three states for every list and panel**: loading, empty, and an honest error
  with a Retry button. A blank table is never acceptable. Design all three.
- **"Not part of your access" is not "empty".** The member record shows a
  distinct state when the viewer's role cannot see a part, such as money for
  somebody without the fees permission. Design it so it cannot be mistaken for
  "nothing recorded".
- **Partial results**: a bulk action where 28 of 40 succeeded is shown as
  partial, with what was refused and why. It is never shown as success.
- **Words** (fixed vocabulary; use these in all copy):
  - **Member**: an NGG member, year-round. A Summer School child is a
    **participant**.
  - **Centre**: a place. **Edition**: one Summer School season. **Group**: a
    class within an edition.
  - Never call an edition a "cohort", or a participant a "student", in UI copy.
- **One solid accent on screen at a time**, on the live action. A selected tab
  or an open panel is a *state*: use a quieter treatment, not the fill.
- **Status colours never stand alone.** "Active / Quiet / Dormant / No activity
  yet" and "On track / Watch / At risk" always carry their word, not only a
  colour.

## 4. The people and what they need to see first

Roles are defined once in the code (`ADMIN_ROLES`, `api/_lib/util.php`). A
person's sidebar shows only what their role allows, so design for a short
sidebar as well as a long one.

| Role | Sees | Their first question |
|---|---|---|
| Super admin / Admin | Everything (money only with the `fees` grant) | "What is broken today?" |
| Centre lead | One centre: its members, attendance, timetable, staff | "Who didn't come in, and who needs a conversation?" |
| Club admin | The Club: members, curriculum, check-in | "Is the Club running?" |
| Summer admin | Summer School only | "Is the season on track?" |
| Editor | Content | "What's waiting to publish?" |
| Auditor | Read-only, with the audit log | "Who did what?" |

## 5. What to send back

Send it so it can be implemented without guessing:

1. **Tokens** as a CSS custom-property block: colour (light, plus dark if
   proposed), type scale, spacing scale, radii, shadows, control height. Keep the
   scales **closed and short**. A value off the scale is the drift this redesign
   exists to remove.
2. **Components** as static HTML and CSS, one file per component or a single
   component sheet, using the class names you want the code to use. Cover every
   state: default, hover, focus, pressed or selected, disabled, loading, empty,
   error, partial. Minimum set:
   - sidebar and nav group
   - section header
   - tabs
   - table, with sortable header, selected row and a row menu
   - bulk bar
   - drawer
   - KPI tile
   - status chip
   - form field, select and checkbox
   - button: primary, secondary, ghost, danger
   - confirm dialog
   - toast
   - error state with retry
3. **Screens** as HTML prototypes for #1–#3 and #5–#6, at 1440px and at 390px
   (phone), with realistic data. Use Nigerian names, real-looking centre names,
   ₦ amounts and dates in Lagos time.
4. **Notes** on anything that is behaviour rather than appearance, such as what
   collapses on a phone, focus order, or what a keyboard user presses.

JSX is welcome, but it will be adapted into the existing components rather than
dropped in, so HTML and CSS are just as good.

## 6. The curriculum document (the template slot)

Members download their course curriculum from the portal as a **PDF** (the
browser's Save as PDF) and as a **Word file**. Both come from **one template**:

- `api/_lib/templates/curriculum-document.php`: the markup (PHP prints the data)
- `api/_lib/templates/curriculum-document.css`: the look (inlined into the page)

Design a professional document to fill that slot. The data it receives:

```
title          "Piano curriculum"
member         { memberId, fullName, track (course), centre }
generatedAt    ISO date
total, completed, pct
weeks[]        { week: 1..n, lessons[] }
  lesson       { title, course, level, durationMins, summary,
                 objectives[] (strings), body (lesson text: paragraphs, lists),
                 materials[] { title, kind, url },
                 checks[] { prompt, options[] },
                 progress: null | { status, bestPct, completedAt } }
```

Constraints specific to the document:

- **A4, print-first.** Provide `@page` rules (margins, page numbers if wanted),
  page-break rules (a lesson should not split badly; each week may start a page),
  and a cover.
- **No external anything.** The page is served with a strict Content Security
  Policy: no web fonts, no external images, no remote CSS. Use system font
  stacks. Any logo must be an inline SVG or a `data:` image.
- **Word opens the same HTML.** Word's renderer ignores flexbox, grid and CSS
  variables, and handles floats and positioned elements poorly. Design so the
  document degrades to clean, readable blocks in Word: headings, tables for
  any two-column layout, plain lists. Stating that tradeoff is better than
  hiding it.
- **Black-and-white printing must still read.** Progress ("Done · 85%",
  "Started", "Not started") cannot rely on colour alone.
- Brand line: "Next Generation Genius · NGG Club". The organisation is
  Afrovanguard.

## 7. How it gets implemented

The design is implemented into the code by hand, screen by screen, against this
brief: tokens first, then the shared components (#4), then each screen.

The existing browser tests (`npm run test:all`) must stay green throughout. That
is why behaviour notes matter as much as appearance.

Anything in the design that conflicts with §2 or §3 will come back as a
question, not be quietly altered.
