# CLAUDE.md — working in this repository

Next Generation Genius (NGG) is Afrovanguard's youth programme. This repo is
the whole product: a React 18 single-page app, a PHP 8.4 + SQLite backend, and
a staff Control Room, deployed to **shared hosting** (Apache, no shell, no
Node, no headless browser, no build step on the server).

That last sentence is the source of most of the architecture below. Read the
constraints before proposing a change; a suggestion that assumes a bundler, a
worker queue or a server-side renderer is not implementable here.

---

## 1. Build and run

```bash
npm install
node build.js          # or: npm run build / npm run check
npm run dev            # http-server on :8123  (needs a real PHP host for /api)
php -S 127.0.0.1:8777  # backend, from the repo root
```

**There is no dev bundler and no framework.** In development `index.html`
loads each `.jsx` file with `<script type="text/babel">` and
`vendor/babel.min.js` compiles it **in the browser**. In production
`build.js` (esbuild) transforms each file's JSX, **concatenates them in
`ORDER`**, and minifies once.

Consequences you must respect:

- **No module closures.** Every top-level `function` hoists across all
  twenty-one files; every top-level `const` is effectively a global. A name
  collision between two files is a real bug and the build will not catch it.
- **`ORDER` in `build.js` must equal the `<script type="text/babel">` tags in
  `index.html`, in the same order.** `validateOrderAgainstIndex()` exits the
  build if they diverge. Adding a file means editing both.
- **Load order is dependency order** for anything evaluated at module scope
  (constant tables, registries). Function calls at runtime are fine in any
  order because of hoisting.
- Vendors (Fabric, jsPDF, TanStack Table, Babel) live in `vendor/` and are
  loaded on demand by `loadVendor`. Do not add an npm runtime dependency.
- **First paint in dev is slow** — Babel compiles ~21 files. Browser tests
  need a generous boot budget; use `waitForBoot` from `tests/_serve.js`
  (60s), never a fixed sleep.

## 2. Frontend layout

| File | Holds |
|---|---|
| `app.jsx` | The router and the page registry. Loaded **last**. |
| `components.jsx` | Shared UI, including the admin action layer. |
| `page-admin.jsx` | The whole Control Room. |
| `page-designer.jsx` | The ID card Design Studio. |
| `card-template.jsx` | Template model, field binder, presets, preflight. |
| `page-*.jsx` | One public area each. |
| `api-client.js`, `data.js`, `outbox.js`, `photos.js` | Plain JS, not JSX. |

### Routing

Path-based, no router library. **One registry, `ROUTES` in `app.jsx`**, is the
single source of truth for a page's id, `<title>`, meta description, whether
it carries its own chrome, and whether it is indexable.

```js
const ROUTES = [ { id: "apply", title: "…", chrome: "own", index: false }, … ];
```

Derived from it: `PAGE_IDS`, `PAGE_META`, `OWN_CHROME_PAGES`, `NOINDEX_PAGES`.
`pageFromPath()` / `pathForPage()` do the URL mapping; `.htaccess` provides
the SPA fallback so deep links and refreshes work.

**Never reintroduce a second list of pages.** Four hand-maintained lists
(ids, titles, chrome, noindex) drifted until a page existed in some and not
others, and the symptom was a working link that rendered as a 404.
`routeAudit(renderKeys)` compares the registry against what actually renders
and publishes the result to `window.__routeAudit`; `tests/route-registry.test.js`
fails the build if a route, a renderer or a title is missing.

Navigation to the application flow goes through **`goApply(setPage, program, opts)`**,
which pushes `/join?program=anchor|summer` (plus optional `centre` / `track`).
`JoinPage` reads the programme **from the URL**, not from a global. A global
that is set before navigation and read after it is a race; the URL is the
state, and it survives a refresh and a shared link.

- Staff Control Room: `/nextadmin`. `/hq` and `/admin` are kept aliases.
- ID Card Studio: `/club/id-cards` (`/cards` forwards to it). Design Studio: `/designer`.

## 3. Backend layout

```
api/{auth,member,admin,public,hooks,tools}/*.php   thin HTTP routes
  → gs_call($op, $args, $useCache)                 api/_lib/sheets.php
    → backend_dispatch($op, $args)                 api/_lib/backend.php  (op registry)
      → domain function                            api/_lib/domain/*.php
```

- **A route file does no work.** It reads input, calls one op, prints the
  result. Business logic lives in a domain file so the PHP test suite can call
  it directly.
- **Every op is registered in `backend_dispatch()`'s `$map`.** An unmapped op
  is `unknown_op`, and a mapped op whose function is not loaded is a fatal —
  which is why domains load from **one explicit list in
  `api/_lib/bootstrap.php`**. A new `domain/x.php` that is not in that list
  does not exist. Scripts and tests must bootstrap, not `require` a domain
  directly.
- `api/config.php` holds secrets and is **not** in the repo. `bootstrap.php`
  refuses to serve when `cookie_secret` is missing, short or a placeholder —
  that is deliberate; do not soften it. Several test suites refuse to run when
  `api/config.php` exists, so move a local dev config aside before running
  them.

### Database

SQLite, **auto-migrated at runtime** from a contiguous ladder in
`api/_lib/db.php`. MySQL is applied by hand from `db/schema-mysql.sql`.

Adding a migration is three edits, all required:

1. Append `N => "…"` to `$migrations` — contiguous, never renumbered.
2. Bump `NGG_SCHEMA_TARGET` to `N` (currently **213**).
3. Mirror the DDL into `db/schema-mysql.sql`, ending with
   `INSERT INTO schema_version (version) VALUES (N) ON DUPLICATE KEY UPDATE version = version;`

`db_assert_migration_ladder()` catches the two classic mistakes (a gap, and a
top migration that does not equal the target).

**Column names are the camelCase the SPA uses.** There is no translation
layer between database and JSON, on purpose. Do not add one, and do not
rename a column to snake_case "for consistency" — every consumer would have
to change with it.

Destructive DDL is a last resort. SQLite cannot drop a column on older
builds; prefer adding a column and leaving the old one unread. `cohortId`
stays in payloads even where the concept is now called an edition, because it
is the join column every other summer table carries.

### Sessions and CSRF

Stateless **HMAC-signed cookies** — `session_issue($row, $adminOk)`. There is
no server-side session store (shared hosting). Admin TOTP re-issues the cookie
with `adminOk = true`; a stale cookie cannot grant admin. CSRF is
double-submit. Do not weaken any of this to make a feature easier.

### Public read cache

`gs_call($op, $args, true)` caches by op + args for `$CONFIG['cache_ttl'][$op]`.
Writes purge by **topic** — `cache_invalidate('centres')` — and
`gs_cache_topics()` maps a topic to the ops it invalidates. When you add a
public op that reads something already cached, add it to the topics that
change it; a public page serving a renamed or retired record is the failure
mode.

## 4. Permissions

Capability-based, not role-based, at the point of use.

`admin_role_caps()` in `api/_lib/util.php` bundles capabilities into roles;
`capsExtra` on a member row grants extras per person. Capabilities:
`content, people, inbox, settings, rbac, summer, club, checkin, curriculum, audit, journal, fees`.

- `checkin` is the door: check-in desk links (`/gate`), their passwords and the
  duty rota. It checks in everyone all year, so it is not a Summer School cap.
  The Summer sign-up kinds (`self`, `review`, `register` at `/enrol`) stay
  `summer` — `GATE_KINDS` in `domain/registration.php` maps each kind to its cap.
- `curriculum` is what the Club teaches — lessons, materials, checks and the
  progress against them (`domain/curriculum.php`). Held by admins and club
  admins; grant it per person to an instructor who writes lessons.
- `admin` holds `club` and `summer` as well as people/content/inbox;
  `club_admin` holds `club`, `people`, `checkin` and `curriculum`. A club admin's sensitive
  acts (suspend/deactivate, confirmed merge, centre rename/retire/delete,
  volunteer removal) are **queued, not refused**: `approval_intercept()` in
  `domain/approvals.php` runs at the top of `backend_dispatch()`, and the
  request runs as the requester only when a second admin (holding `people`,
  not a club admin, not the requester) approves it.

- `fees` and `journal` are **deliberately not** in the `admin` or `editor`
  bundles. Money and the institutional record are separate trusts, granted
  per person. Do not bundle them in to simplify a screen.
- Gates: `admin_gate()` (staff), `admin_cap_gate($p, $cap)` (one capability),
  `admin_cap_gate_any($p, [$caps])` (any of several — **reads only; never
  widen a write with it**).
- **Centre scoping**: `centreScope` on a staff row, resolved by
  `admin_centre_names_in_scope()` / `admin_centre_allowed()`. Enforced on the
  way **in**, per row, never by trusting the list the client had on screen —
  a scoped admin's export, count, select-all and bulk run are all scoped.

**Ownership follows the data, not the screen it grew up on.** The centre
directory gates on `people` (members depend on centres; their printed card
prefix is a centre code) even though it used to live inside Summer School. A
Summer School coordinator must not be able to rename or delete a centre. Ask
"who owns this record" before "which portal is this button in".

## 5. Domain vocabulary — the part that keeps breaking

Five words, fixed meanings. Use them in code, in UI copy, in tests, in docs.

| Term | Is | Is not | Stored in |
|---|---|---|---|
| **Member** | An NGG member, year-round | a Summer School participant | `members` |
| **Centre** | A **place**, owned by NGG | a class; a Summer School entity | `centres` |
| **Edition** | One **season** of Summer School | a class | `summer_cohorts` |
| **Group** | One **class within an edition** | a centre | `summer_groups` |
| **Participant** | A child in an edition | a member | `summer_students` |

- The column `cohortId` means **edition**, everywhere, with no exceptions.
- **`members.cohort` is the exception, and it is a different word.** On a
  member row it is the **intake year** — the source of the printed ID's prefix
  (`023-` ⇒ 2023) — and has nothing to do with a Summer School edition. One
  word, two meanings, one database: `member_intake_year()` in
  `domain/member-id.php` pins the member's, and no UI shows the word "cohort"
  for it.
- The word **cohort** is not shown to users. When a coordinator says
  "cohort" they mean a **group**.
- "Student" belongs to the Club. Summer School has **participants**.

### The two programmes are separate, and NGG is the one that lasts

Summer School is a **phase**: one season, a lanyard card that expires with it,
a centre-prefixed number. NGG is the programme somebody belongs to for years:
an ID-1 card in a wallet that does not expire on a season's clock, and a
year-prefixed number. Three places enforce that, and all three were once one
thing:

| | Summer School | NGG members |
|---|---|---|
| Printed ID | `CODE-YY-NNN` (`EG-26-001`), centre-prefixed | `YYY-NNN` (`026-014`), intake-year-prefixed |
| Minted by | `card_display_id()` (registration.php) | `member_mint_display_id()` (member-id.php) |
| Card config | `idcard_program()` | `idcard_program('member')` |
| Card size | 54 × 75mm, lanyard | 54 × 85mm, ID-1 wallet |
| Validity | the season | does not expire (`validityDays` 0) |

- **`members.type` is `NGG` or `Summer`** — the table holds both populations,
  and a Summer account carries a `SUM-` memberId. `member_is_ngg()` is the
  test; everything that issues a MEMBER credential refuses anyone else, or one
  person ends up with two printed identities.
- **One settings blob, two programmes' configs.** `idcard_program($subject)`
  layers an `ngg` block over the shared organisation fields (website, phone,
  logos — one organisation, changed once). The stored root IS the Summer
  config, unchanged, so no deployment needs a migration.
- **A printed ID is never reissued.** It is in somebody's wallet; editing a
  record must not invalidate a card that is physically correct.
- **Mint from the highest serial, never a count.** Counting reuses gaps, and a
  gap is where a card printed but never recorded here lives.

### Enforced invariants

Summer School (`api/_lib/domain/summer-editions.php`, each with a test in
`api/tests/run.php`):

1. At most **one** edition is `active`; activating another demotes the
   previous to `closed` — never `archived` (archiving is a roll-up, its own
   op, and `admin_summer_edition_status` refuses it with `use_archive_op`).
2. A group's `code` is unique **within its edition**, not globally.
3. A participant belongs to at most one group, and only to a group in **their
   own** edition. Cross-edition assignment is refused, never coerced.
4. Capacity is a **refusal**, not a warning: the rows that do not fit fail and
   are named; the rest go through.
5. Deleting a group with participants is refused unless the caller says where
   they go (`reassignTo`, or an explicit unassign).

Centres (`api/_lib/domain/registration.php`):

6. **Centres follow CACENTRE's locations** (`domain/cac-locations.php`). Once
   the list has arrived over the gate hook, a centre is added, renamed and
   retired in CACENTRE, not here (`managed_by_cacentre`); a rename cascades to
   every table in `CAC_CENTRE_NAMED_BY`. Code, colour and page stay NGG's.
   A centre in use cannot be deleted silently. `admin_centres_delete` reports
   `uses` and refuses with `centre_in_use` unless `retire` (checked **first** —
   retiring is the answer to the refusal) or `force`. Retire keeps every
   record resolving; that is the intended path.

Seasons (`summer-editions.php`):

7. A **live edition has a duration**: activating one needs a start and an end
   date, at most `SUMMER_EDITION_MAX_DAYS` (183) apart (`dates_required`,
   `season_too_long`). The desk refuses a participant outside their edition's
   dates (`edition_not_started` / `edition_ended`); cards issued for an edition
   expire on its end date (`summer_edition_card_expiry`); the nightly job
   closes an active edition whose season has ended (closed, never archived).

## 6. Control Room conventions

### Sections

**One registry, `ADMIN_SECTIONS` in `page-admin.jsx`**: id, nav group, nav
label, page title, icon, required capability. `ADMIN_NAV_GROUPS` fixes group
order. The sidebar, the command palette (`command.jsx`) and the deep-link
resolver are all generated from it — never hand-list sections anywhere else.

- **A retired section id is not a dead route.** It is in bookmarks and in
  links. `ADMIN_SECTION_ALIASES` + `resolveAdminSection()` forward it to the
  section and sub-tab that replaced it (`registration → summer/gates`,
  `qr → summer/qr`). Retire by aliasing, not by deleting.
- Cross-section jumps go through `window.__adminSection(section, tab)`, and
  the sub-tab travels through the **pending-tab store**
  (`setPendingAdminTab` / `takePendingAdminTab` / `useAdminTab`), which
  publishes to subscribers. A jump to an already-open section must still
  change its tab, and a pending tab must always be consumed — a leaked one
  reopens the wrong panel later, which is exactly how it broke before.

### Bulk and individual actions

`components.jsx` holds the layer; use it, do not write a bespoke one.

`useAdminSelection(rows, key)` · `AdminSelectAll` · `AdminRowCheck` ·
`AdminBulkBar` · `AdminRowActions` · `runAdminAction(action, ids, opts)` ·
`adminFailSummary(results)`

**One declaration per action** feeds both the bulk bar and the row menu, so an
action and its bulk equivalent cannot drift into doing different things,
asking differently, or being permitted differently. An action that needs a
value declares `open(ids)` (it opens a form and the selection is kept); one
that acts declares `run`/`runOne`. `bulkHidden` / `rowHidden` keep an action
out of one surface — resetting two hundred people's 2FA in one press is not a
feature.

Non-negotiables, client and server:

- The **count is read before the confirm**, so a list refreshing underneath
  cannot change what the operator agreed to.
- **Per-row verdicts win over a top-level `ok`.** A run where 28 of 40 were
  refused is reported as partial, never as success. `runAdminAction` never
  throws and returns `{ran, ok, failed, results}`.
- Every batch is **capped** and the cap is named in the refusal:
  `MEMBERS_BULK_MAX`/`CLUB_BULK_MAX` 500, `SUMMER_ASSIGN_MAX` 500,
  `CLUB_PROMOTE_MAX` 200, `CRUN_MAX_ISSUES` 600.
- The whole payload is **validated before any write**.
- **Self-protection**: an operator's own account is refused (`own_account`).
- **Tier-protection**: a staff account cannot be suspended, deactivated or
  deleted through the member roster (`staff_account`). Staff lifecycle lives
  in Access & roles, where the last-super-admin rule is.
- **Scope** is refused per row (`out_of_scope`), not silently skipped.
- **`unchanged` is reported**, distinct from applied.
- **One audit event per run**, with action, count and refusals — not one per
  row. "Who suspended forty people on Tuesday" must have a readable answer.
- A bulk op **delegates to the single-row implementation** where one exists
  (`admin_club_promote_bulk` → `admin_club_promote`), so there is one
  promotion, not two.

Deliberate asymmetry: the Club desk's bulk actions are **narrower** than the
member desk's (status and centre only). The Club roster is not where member
lifecycle is administered. Do not "complete" it.

### Lists

Server-side search, facets, sort and paging. **Sort columns and facet fields
are allow-listed by name** — the caller never contributes SQL text — and an
unknown value **falls back to the default rather than erroring**, so a stale
bookmark shows the roster, not a failure. Return the true `total` for the
filter, and expose an ids op (`admin_members_ids`) so "select all N matching"
is one request rather than paging. Filter above the page cap, never below it:
a filter applied to the drawn page filters the page.

Watch for N+1s in roster code. `admin_club_promotable` did one attendance
query **per student** (800+ queries for a normal list); it is one grouped
query now. New list code that loops queries is a defect, not a slow path.

## 7. ID cards

Two studios, one record. Say which is which in any UI that mentions them.

- **ID Card Studio** (`/club/id-cards`, `src/modules/idcards/`) lays out and
  prints the cards for all three subjects — members, Summer School
  participants, volunteers — on sheets of card stock, logs every run, and
  keeps a reprint queue (`domain/id-studio.php`). The sheet maths is
  `ids-core.jsx` and is held to the millimetre by `tests/ids-core.test.js`.
  Its slots draw the REAL renderers through one adapter, `IdsRecordFace` —
  never a second drawing of a card. A subject is a row of `IDS_KINDS`, never
  an `isVol`-style boolean. A proof, or a card marked failed after printing,
  does not count as somebody having a card.
  - **Each card type prints with its assigned design** (`id_designs`,
    `admin_ids_design_set`): a **published** front of that kind, with its
    paired back, drawn by the Design Studio's own `dsnRaster` → `tplToFabric`;
    or, when none is assigned, the standard card (`NggcMemberCard` +
    `NggcMemberCardBack` for members, `CardFront` / `VolunteerCardFront` /
    `CardBack` for the rest). A draft is never assignable, and a design
    unpublished since falls back rather than printing a draft. The run sends
    only the `templateId`; the version is the server's.
  - **The sheet takes the size of the cards on it** (`idsRecordMm`), never the
    reverse; a mixed-size sheet is a red check.
  - **A member with no printed ID is minted one before the print**
    (`admin_ids_mint`, never reissued), so the card carries the record's number.
  - **A photo request reaches people, not a log**: the member (and their
    guardians who take alerts), a participant's guardian, a volunteer by
    email, plus ONE digest per press to the staff for that centre, never the
    requester. `id_photo_asks.channels` records what actually went; a 3-day
    quiet period needs `force` to override; at most 200 a press.
  - **The member card's back** is `NggcMemberCardBack`
    (`ids-member-back.jsx`), to the programme's design: navy field, the NGG
    mark, the member's secure QR in scan brackets, and an amber band with the
    programme's email and social handle. It carries no name, money or medical
    details — it is the side a finder sees first.
- **Design Studio** (`/designer`) draws, binds, publishes and prints
  templates, including card **backs**. Its workspace has two modes:
  **design** (layers | canvas | properties) and **print**
  (canvas | records, editing rails hidden), so the canvas is never displaced
  by the batch panel — see `.dsn-work.is-printing`.
- **People → ID cards** is the print log and one person's card history for
  all of them.

Architecture:

- **One renderer per card, never two.** `tplToFabric()` serves the designer
  canvas, the roster preview and the 300-DPI export at three scales; geometry
  is in design units on a 590-wide grid. The hand-coded cards have the same
  rule: `NggcMemberCard` is the member card everywhere it appears, and where a
  surface needs a different contract it gets an **adapter**
  (`MemberCardStudioFront` wraps the millimetre-based renderer for the Card
  Studio's scaled-pixel contract). Never fork a card into a second drawing —
  what you see would stop being what prints, and the two would drift within a
  season. `tests/ui-smoke.js` guards this by asserting a string that exists in
  exactly one renderer.
- **A card's real-world size comes from its subject first**, the programme
  setting second (`S.trimMm || program.widthMm`). A member card is ID-1
  (54 × 85mm) and its geometry is its renderer's, not a programme setting;
  reading the programme for every subject had the studio describing a trim it
  was not printing.
- Rendering happens **in the browser** (Fabric + jsPDF via `loadVendor`)
  because the host has no headless renderer. Not a shortcut; a constraint.
- `TPL_FIELDS` in `card-template.jsx` is the binder — `{{field}}` substitution
  against a real row. `card_row_member` / `card_row_student` /
  `card_row_volunteer` are the server-side row shapes. Member rows carry one
  `fullName` and no split parts; anything that assumes `firstName`/`surname`
  must fall back (see `tplNameParts`, `merge_sort`, `dsnRowName`).
- **Draft (`schemaJson`) vs published (`publishedJson`) with a recorded
  `version`.** Editing a draft changes nothing anyone prints. Publishing does.
- `CTPL_KINDS` = member | student | volunteer; `CTPL_FACES` = single | front |
  back (the default is `single`, "One-sided"); a front may name a back via
  `pairId`. A fork does **not** inherit `pairId`.
- **Preflight runs client-side (`tplPreflight`) and again on the server**, so a
  stale page cannot skip it: required fields per kind (backs exempt), WCAG
  contrast (3:1 error, 4.5:1 warn), QR module size checked **in millimetres**.
- **Every run is recorded** (`domain/card-runs.php`) with the template and the
  **version read from the template row, not from the request** — that is what
  makes "reprint that batch as it was in July" answerable. A run whose every
  card was issued before is derived as a `reprint`. `admin_card_history` leads
  with `latest` and a `designMovedOn` tri-state so "is the card in their hand
  current?" has an answer.

## 8. The studios' design system

The Design Studio (`/designer`) renders from **one set of tokens**,
declared once in `styles-app.css`. The direction, so a change can be checked
against it rather than argued about:

> A dark press room — ink-blue surfaces, ONE amber accent earned only by the
> live action, geometric sans for structure over monospace for every number
> and label. An instrument, not an app. The card being designed is the only
> bright object on the screen; everything else is housing and recedes.

The scales are **closed**. Nothing in either studio may use a value that is
not on them:

| | Tokens |
|---|---|
| Surface | `--dsn-bg`, `--dsn-s1`, `--dsn-s2`, `--dsn-s3`, `--dsn-sink` — depth by **elevation, not outline** |
| Ink | `--dsn-ink`, `-2`, `-3`, `-4` (`-4` is disabled only, never for reading) |
| Accent | `--dsn-gold` + `--dsn-gold-dim` + `--dsn-gold-ink` |
| Radius | `--dsn-r-surface` / `-control` / `-inner` / `-pill` — four, not seven |
| Space | `--dsn-sp-1`…`-6` |
| Control height | `--dsn-ctl` — **one value**, 36px, 44px on coarse pointers |
| Type | `--dsn-t-display` / `-head` / `-body` / `-ctl` / `-small` / `-meta` |

Classes, not inline styles. The Design Studio uses `.dsn-*`. The ID Card
Studio is a light workspace with its own closed token set on `.ids-app`
(`--ids-*`, ID_CARD_STUDIO.md §7) and `.ids-*` classes; `.cs-row` survives
from the old Card Studio because the review desk's bar uses it.

**Inline styles beat a stylesheet**, so consistency cannot be imposed from
outside: chrome belongs in CSS or it will drift. What legitimately stays
inline is per-element geometry (a width, a one-off margin) and — the one real
exception — a value that IS data, such as the swatch whose background is
the centre's own colour. A stylesheet cannot know that one.

Two rules that are easy to break and were broken:

- **One solid accent on screen at a time**, on the live action. A selected tab,
  an open panel and a live warning are **states** and take `.is-on`
  (dim accent), not the fill. Publish / Print-ready PDF is the fill.
- **Native `<select>` chrome is not acceptable on a dark surface** — the OS
  draws its own light-mode arrow. Both studios draw one caret as a background
  image and keep the field on the studio's own surface.

## 9. UX and accessibility standards

These are requirements in this codebase, not aspirations. `tests/contrast.test.js`
and `tests/designer.test.js` enforce parts of them.

- **4.5:1 minimum** for body and caption text, on screen and on printed cards.
  Print is not exempt — a caption nobody can read on a card is a defect.
- Every icon-only control needs an `aria-label`; every toggle needs
  `aria-pressed`.
- **Nothing may require a drag.** The Design Studio's every operation has a
  keyboard route and the studio prints its keyboard contract on screen.
- Live regions for counts and selection announcements (`aria-live="polite"`);
  `role="search"` on search forms with a `role="status"` result count.
- Drawers and menus: Escape closes, focus is restored to the trigger.
- Tables: `<th scope="col">`, real checkbox labels, imperative
  `indeterminate` on the select-all.
- **Three states are not optional**: loading, empty, and an **honest error
  with a retry**. A silent empty table is the bug that hides an outage.
- **Layout belongs in CSS**, not in inline `style` grids — `styles.css` for
  the public site, `styles-app.css` for the Control Room. Tests that pin
  inline markup rot; tests that pin a class survive.
- `.chip` is `text-transform: uppercase`, and `innerText` reflects that —
  assert chip text case-insensitively.

## 10. Testing and verification

```bash
php api/tests/run.php     # the PHP suite: one file, chk(label, cond)
npm run test:all          # build + build test + PHP suite + every node suite
npm run test:routes       # route registry      npm run test:admbulk   # bulk actions
npm run test:summered     # editions & groups   npm run test:sumpage   # /summer page
npm run test:designer     # card studio         npm run test:ui        # ui smoke
npm run test:a11y         # axe-core WCAG 2.1 A/AA across the portals and the journal
npm run test:mysql        # the PHP suite again, on MySQL (see below)
```

**The PHP suite runs twice: once on SQLite, once on MySQL.** The repository
ships two schemas — the ladder in `api/_lib/db.php` and the hand-written
mirror in `db/schema-mysql.sql` — and every deployment above a single site
runs the second. Testing only the first hid two real defects of the same
shape, SQLite tolerating what MySQL will not: `community.search` was a hard
SQL syntax error on MySQL (a backslash `ESCAPE` that SQLite reads literally)
and returned a 500 on every MySQL deployment; and a peer mentor could see
children's shared journal entries, because the privacy guard ran its query
with an empty parameter list instead of skipping it, which SQLite quietly
returned nothing for. Neither was findable on SQLite at any effort.

`tests/mysql-suite.js` is in `test:all`. Without a reachable server it prints
a loud notice and passes — hard-failing every machine without MySQL would
get `test:all` abandoned, and a suite nobody runs protects nothing. Set
`NGG_REQUIRE_MYSQL=1` in CI or before a release to make the skip a failure.
It recreates the database named in `NGG_TEST_DSN` and **refuses any name
without "test" in it**, so a misdirected DSN stops there rather than
somewhere irreversible.

- Node E2E tests spawn `php -S`, write a **throwaway `api/config.php`**, and
  **refuse to run if one already exists**. Move a local dev config aside.
- `tests/_serve.js` gives `waitForServer` / `waitForBoot`. Chromium is at
  `/opt/pw-browsers/`, driven by `playwright-core`.
- **Add a new suite to `test:all` and to `package.json` scripts.** A test file
  nothing runs is not a test.

Expectations for any change here:

- **Record the baseline before you start.** Pre-existing failures are facts to
  report, not yours to hide.
- **Never claim a test passed without running it.** Say which command, and
  what it printed.
- **Compiling is not working.** Verify the behaviour end to end — the op
  through the route through the screen — before calling something done.
- Let the existing suites do their job. `designer.test.js` has caught real
  defects in new card presets (a card with no name field; six labels at
  2.63:1); `ui-smoke.js` catches assertions that pinned markup instead of
  behaviour.
- Prefer a test that pins the **promise** ("meeting days are deduped, sorted
  and range-checked") over one that pins an incidental string.

## 11. Structures that must not come back

Each of these was removed because it caused a specific failure. Reintroducing
one reintroduces the failure.

- **A second list of pages, sections, titles or capabilities.** One registry,
  everything derived. Drifting parallel lists produced a working link that
  rendered as a 404.
- **A global set before navigation and read after it** (`window.__nggProgram`).
  Put the state in the URL.
- **Two sections mounting divergent subsets of the same panels** (the old
  `registration` and `qr` screens). One workspace, panels grouped by task,
  aliases for the old ids.
- **A bespoke bulk implementation per screen.** The guards are the feature;
  duplicating the surface duplicates the places a guard can be forgotten.
- **A bulk endpoint per verb.** One op, many declared actions, each with its
  own capability.
- **Summer School owning centres**, or any portal owning a record it does not
  own.
- **A per-row query inside a list serialiser.**
- **A filter applied to the drawn page** rather than above the page cap.
- **A forked card renderer** for a new preview or export surface. Adapt at the
  boundary instead.
- **A boolean where a domain has three cases.** `isVol` is the worked example:
  it was cheap at two subjects and blocked the third outright.
- **A control that cannot act, left visible and enabled.** Disable it and say
  why (the trim box on a fixed-size card), or don't render it (a resend button
  for a subject with no resend op).
- **A media query standing in for a panel's own width.** Container queries
  exist; `@media (max-width: N)` silently lies the moment the panel stops
  being the width of the window.
- **A value off the studios' scales** — a fifth radius, a second control
  height, a font size between two steps. Thirteen buttons once carried four
  radii and eight paddings on one screen; that, and not any single choice, is
  what made it read as unfinished.
- **Chrome in an inline `style` object.** It cannot be corrected from a
  stylesheet, so it is where drift goes to hide.
- **A cached public op with no invalidation topic.**
- **Inline style grids** where a class belongs.
- **The entity called a cohort in user-facing copy**, and **"student" for a
  Summer School participant**. This is not a ban on the English word: "Reflect,
  privately or with the cohort" and "Cohort completion rate" describe a group
  of learners and are fine. What must never appear is *the edition* called a
  cohort ("Archive the cohort when summer ends") or *a participant* called a
  Summer student — those are the two that send an operator to the wrong
  screen.

## 12. Where the documentation is

- `docs/ADMIN-GUIDE.md` — for the people who run the programme. Terminology,
  the portal map, workflows, error meanings, the warnings list. Update it when
  a workflow or a label changes.
- `docs/SETUP.md` — installing and configuring a deployment.
- `docs/SCHEMAS.md` — table shapes.
- `docs/ROSTER-IMPORT.md` — the members workbook and its import.
- `docs/PRINT-SPEC.md` — what the studios hand a print shop.
- `docs/POLICY.md` — programme policy: conduct thresholds, fines, attendance.
- `docs/FORMS.md` — the intake form builder's cascade and conditional logic.
- `docs/HANDOFF.md` — a historical change record. **Append, never rewrite**;
  it is the log of why things are the way they are.
