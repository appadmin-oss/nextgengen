# Control Room v2 — how a tab is written

The spec is `CONTROL_ROOM.md` in the design handoff (§3 blocks, §4 layers, §5 phone).
The shell, blocks and layers are built; a tab is **data**: one entry in `CR_TAB_DEFS`,
keyed by the tab id from `CR_PAGES` in `cr-pages.jsx` (the one registry — do not add
pages or tabs anywhere else; ask before changing it).

```js
Object.assign(CR_TAB_DEFS, {
  fees: {
    skeleton: ["kpis", "table"],            // loading layout: kpis | table | queue | cards
    load: async ctx => ({ ... }),           // fetch; throw → honest error + retry
    blocks: (data, ctx) => [ block, … ],    // pure; runs on every render
    actions: (data, ctx) => [ action, … ],  // header buttons; exactly one primary
    count: async ctx => n,                  // optional tab pill (Inbox only)
    facts: data => "text",                  // optional; what Ask is told (default: kpis/bars/attention)
  },
});
```

`action` = `{ l, icon, primary?, run(), disabled?, why? }` (`why` = the tooltip saying why it is
disabled). Labels starting Reject/Decline/Delete/Remove/Revoke/Suspend/Deactivate are drawn as
danger automatically. Number keys 1–9 run header actions in order (§4.5).

## ctx

| | |
|---|---|
| `ctx.can(cap \| [caps])` | capability check (any-of for arrays). Gate every action the server gates. |
| `ctx.me` | `{ id, name, email, role, roleLabel, caps, scoped }` |
| `ctx.phone` | phone tree (< 600 px) |
| `ctx.data`, `ctx.setData(fn)`, `ctx.reload()` | the tab's loaded data; `reload()` refetches quietly |
| `ctx.sub`, `ctx.setSub(s)` | the URL tail `/control/<page>/<tab>/<sub>` — e.g. an open record id. Deep-linkable. |
| `ctx.toast(text, undo?, bad?)` | plain 4 s; with `undo` 6.5 s + Undo button; `bad` = error styling |
| `ctx.confirm({ title, body, cta, danger, cancel })` → `Promise<bool>` | ONLY for irreversible or external acts (README §4.7). Reversible acts apply at once and toast Undo. |
| `ctx.form(spec)` | the form sheet (§4.3); see below |
| `ctx.drawer(spec)`, `ctx.closeDrawer()` | the drawer (§4.2); see below |
| `ctx.go(page, tab, sub?)` | navigate inside the Control Room |
| `ctx.portal("summer-admin" \| "club-admin", panel?)` | open a staff portal |
| `ctx.studio()` | open the ID Card Studio (/club/id-cards) |
| `ctx.palette(scope)` | open ⌘K on a scope |
| `ctx.refreshCounts()`, `ctx.reloadAll()` | inbox pills; reload every tab |

`crErr(e, fallback)` turns any API error into words (server `message` first). `crQueued(res)`
is true when a club admin's act was queued for a second admin — say so ("Sent to a second
admin to approve"), never "done".

## Blocks (cr-blocks.jsx)

Every block: `{ type, span: 6|4|3|2, title?, sub?, action?, onAction? }`. Spans collapse by
themselves (§3). Never set widths.

- `kpis` `{ items: [{ l, v, d?, dn?, tone: "up"|"down"|"flat" }] }` — `v` is a formatted string.
- `attention` `{ rows: [{ n, l, s, tone, go: [page, tab] | onClick, age }], empty }` — sorted by `age` desc, n=0 rows hidden.
- `status` `{ summary, tone, items: [[name, state, tone]], cta, go | onCta }`
- `columns` `{ big, sub, pct?, bars: [{ l, v, tip? }] }`
- `bars` `{ pct?, rows: [[label, value]], empty }`
- `list` `{ rows: [{ icon, t, s, m, onClick? }], empty }`
- `note` `{ icon, tone?, text, sub?, quote?, act?: { l, run } }`
- `cards` `{ cards: [{ icon, title, sub, tag, tone, meta: [[k, v]], onClick? }], empty }`
- `form` `{ key, groups: [{ h, help, rows: [{ id, l, help, c: "toggle"|"input"|"select"|"segmented"|"textarea", opts: [[v, l]], value, type?, ph?, max?, check?(v, all) → msg }] }], save: async (patch, all) => {}, onSaved? }`
  — edits are held in the block; the shell draws the unsaved bar ("N unsaved changes", Discard, Save) and toasts "N changes saved". Send the server only `patch` unless its op needs the whole object; never send back fields the screen did not show (a stale page must not overwrite others' edits).
- `compose` `{ audiences: [{ id, l, n }], defaultAud, channels: [{ id, l, icon }], defaultCh, subject, body, withSubject?, smsCost?, count?(audIds), send: async ({ aud, ch, subject, body }) => ({ text }) }`
- `queue` `{ items: [item], emptyText, onResolved? }` — item and actions: see cr-tab-inbox.jsx.
- `table` — client: `{ cols, rows, search, filters: ["Col label"], bulk, nosel?, emptyText, sortInit }`;
  server: `{ cols, server: { fetch: async ({ q, filters, sort, page, pageSize }) => ({ rows, total }), sortKeys: { [colIndex]: "key" } }, filters: [{ id, l, opts: [{ v, l, n }] }], reloadKey, selectAllMatching?: async ({ q, filters }) => keys }`.
  `cols`: strings (`"#Owed"` = numeric, right-aligned) or `{ l, num?, wrap?, sort?: false }`.
  Row: `{ key, cells: [cell], open?: () => ctx.drawer(…) }`. Cells: `{ k: "person", t, s, photo }`,
  `{ k: "status", t, tone }`, `{ k: "progress", pct, t, tone? }` (tone ok|warn|bad overrides the colour the percentage would give), `{ k: "mono", t }`, `{ k: "num", t, v }`
  (`v` = the number to sort by), `{ k: "strong", t, s }`, `{ k: "text", t, s }`.
  Bulk: `[{ l, run: async (keys, rows) => false|any, max }]` — read the count BEFORE confirming,
  report per-row verdicts (partial ≠ success), use the server's bulk op where one exists.
  25 rows a page. A list over the server's cap MUST page or say it is truncated — never filter the drawn page.
- `custom` `{ render: (ctx, phone) => JSX }` — last resort, for an editor no block can express
  (say why in a comment). Use the `cr-` classes; no new hex; chrome in CSS, not inline.

## Drawer spec
`{ title, sub, name?, photo?, icon? (instead of initials, for a drawer that is not about a person), stats: [[k, v]] (3), fields: [[k, v]], sections: [{ h, rows | text | list, empty }], actions: [{ l, primary?, run, disabled?, why? }] }`

## Form spec
`{ title, intro?, submit, busyLabel?, values: {…}, fields: [field], onSubmit: async values => (throw → stays open with the error | return { fieldErrors }), done: "toast" | (values, result) => "toast" }`
Field: `{ id, l, type: "text"|"email"|"tel"|"date"|"number"|"textarea"|"select"|"chips"|"multi"|"switch"|"file", opts: [[v, l]] | [v], req?, ph?, help?, max?, num?, money?, email?, im?, ac?, rows?, accept?, when?(values) → show, check?(v, values) → msg }`.
Messages are fixed by crValidate ("Enter <label>.", "Enter an amount above ₦0.", "That email looks incomplete.").

## Rules (CLAUDE.md wins; these are the ones that keep breaking)
- Copy: sentence case, no exclamation marks, no emoji, curly quotes ’ “ ”. Vocabulary: member / centre / edition / group / participant (CLAUDE.md §5) — never "cohort" for an edition, never "student" for a participant.
- Money through `fmtMoney(n)` only (one naira formatter). Counts through `crNum`. Dates through `crDate` / `crAgo`.
- Guardian phone numbers masked outside the person's own record (`crMask`). No medical data on lists.
- Every list: loading (skeleton, automatic), empty (say what it means), error with retry (automatic on load failure).
- Server caps and bounds come from the server (e.g. fees `meta.bounds`), never typed into the page.
- Prefer the existing API in api-client.js. A backend change goes through domain/*.php + backend.php op map + capability gate + centre scope + one audit event + PHP tests in api/tests/run.php (add them next to the related section, not at the end of the file).
