# Plan — an ID card designer an admin can use

Status: **research + proposal, nothing built** · Branch: `claude/gate-links-staff-desk-4g73f9`
Researched August 2026.

The ask: *"the best libraries for professional graphics design so that the admin
can create new IDs and edit ID design … I need the library to have all of Canva's
features. ALL of it, none excluded."*

This document answers three separate questions, because they have three different
answers:

1. **Can one library give us all of Canva?** No — and roughly two thirds of Canva
   is either irrelevant to an ID card or actively harmful to one. §1.
2. **What are the real options?** Four, with prices. §2, §3.
3. **What should we build?** A recommendation and a staged plan. §4 onwards.

---

## 1. "All of Canva's features" — the honest answer

Canva is not a graphics library. It is a product with a headcount in the
thousands, and its surface breaks into five groups. Only the first is a library
problem.

| Group | Examples | Can a library give us this? |
|---|---|---|
| **A · Canvas editing** | layers, groups, drag/resize/rotate, snapping and smart guides, alignment, z-order, text with web fonts, curved text, outlines, shadows, letter/line spacing, shapes, lines, paths, frames and masks, image crop/flip/filters, gradients, transparency, blend modes, undo/redo, copy/paste, multi-page, rulers, guides, zoom | **Yes.** This is what the libraries in §2 are. |
| **B · Content supply** | 100M+ stock photos, videos, audio, illustrations, icons, 600k+ templates, 3,000+ fonts | **No.** This is licensed inventory, not code. Any library gives you an *empty* editor; the assets are a separate purchase, or your own. |
| **C · AI** | Magic Write, Text-to-Image, Magic Eraser, Magic Edit, Magic Switch, background remover, Magic Design | **Partly.** Background removal we already have via Cloudinary. The rest are third-party API calls (and each has a per-call cost) that you bolt onto whichever editor you pick. |
| **D · Beyond static design** | video timeline, audio tracks, animation, real-time multiplayer, comments, Docs, Whiteboards, Websites, Presentations, mobile apps, print fulfilment | **No, and not wanted.** None of this applies to a 50×78 mm card. |
| **E · Print production** | bleed, crop marks, CMYK, PDF/X, preflight | **Only from the paid SDKs.** The free libraries are all RGB/screen. See §3. |

**The part of the ask that should be pushed back on.** An ID card is not a
creative artefact — it is a *credential*, and the value of a credential is that
every one looks the same. A designer who can freely move the QR, shrink the
photo, or recolour the centre band on card 147 of 300 has been handed a way to
break the gate scanner and the arm's-length centre recognition that the current
card was carefully built around. What an admin actually needs is not Canva; it is
**a constrained template editor**: full freedom over *the design*, then that
design locked and applied to 300 children with only the data varying.

That distinction is the single most important design decision in this document,
and it is also good news: it is a much smaller build than Canva, and every option
in §2 supports it.

---

## 2. The candidates

### 2.1 Fabric.js — the free workhorse

- **What:** an object model over HTML5 canvas: selection, transform handles,
  grouping, on-canvas text editing (with IME and text-on-a-path), WebGL and
  Canvas2D image filters, SVG import *and* SVG export, JSON serialisation.
- **Version:** 7.4.0 (npm, published ~mid-2026). ~30.5k GitHub stars.
- **Licence:** MIT. Free, commercially, forever.
- **Gives us:** essentially all of group A, and SVG export is a genuine route to
  vector print output.
- **Costs us:** the entire editor *UI* — panels, toolbars, layer list, template
  browser, font picker, undo stack, keyboard shortcuts, snapping guides. Fabric
  gives you the canvas; the application around it is yours.

### 2.2 Konva.js (+ react-konva) — the free workhorse, React-shaped

- **What:** a scene graph (Stage → Layer → Shape) over canvas, with a
  `Transformer` for handles, per-shape filters, events, drag/drop and
  serialisation. react-konva 19.2.5 lets you write the canvas as JSX.
- **Licence:** MIT.
- **Versus Fabric:** better React integration and generally better performance
  with many objects; weaker built-in text editing (Konva's own docs route you to
  a DOM `<textarea>` overlay for editing) and no SVG export.
- **Note:** Konva and Polotno are by the same author, Anton Lavrenov — so
  "start on Konva, buy Polotno later" is a genuinely coherent path.

### 2.3 Polotno SDK — the Canva-clone in a box

- **What:** a complete, embeddable React design editor built on Konva: the UI,
  a template system, a JSON schema for every element, a programmatic API for
  code-driven and AI-driven generation, and a renderer. It is the closest thing
  on the market to "Canva as an npm install".
- **Licence/price:** commercial. Self-serve **$899/month**, or **$9,990/year**
  for unlimited use on a single domain — flat, no per-seat and no per-render fee
  on self-hosted rendering. Enterprise is a custom quote (reported to start in
  the low five figures). 60-day free trial on a dev server, and a "Grass Roots"
  discount programme for small/bootstrapped teams in lower-purchasing-power
  markets — **which is worth asking about; a Nigerian youth charity is exactly
  the case that programme exists for.**
- **Gives us:** group A complete, plus templates and variable mapping — the
  feature that matters most for us (§1's "one design, 300 children").
- **Costs us:** the licence, a real bundler in the build, and a proprietary JSON
  format that other design tools cannot open.

### 2.4 IMG.LY CreativeEditor SDK (CE.SDK) — the print-grade option

- **What:** an enterprise editor across web, iOS, Android and server, with
  consistent rendering on all of them, headless server rendering, on-premise
  deployment and SLA support.
- **The differentiator:** it is the only candidate that exports **print-ready
  CMYK PDF/X**, with Pantone and custom colour libraries — and it has explicit
  first-class **variable data printing**: tag elements as variables, connect a
  data source, generate a personalised file per record.
- **Price:** not published. Per-platform, per-component subscription; enterprise
  by wire transfer. Expect to be quoted.

### 2.5 Ruled out, and why

- **tldraw** — an infinite-canvas *whiteboard* SDK. Free only with a "made with
  tldraw" watermark; a Business Licence removes it. Wrong shape for a card.
- **Penpot** — an excellent open-source Figma alternative, but it is an
  application to self-host, not a library to embed.
- **PixiJS** — a WebGL renderer for games. No editing model.
- **Toast UI / Pintura / Filerobot** — *photo* editors (crop, filter, annotate),
  not layout editors. No layers, no templates.
- **Forking a GitHub "Canva clone"** (LayerHub, open-design, and the several
  Next.js ones) — tempting and free, but they are demos: unmaintained, no print
  path, and adopting one means owning a codebase nobody on this project wrote.
  Read them for ideas, do not depend on them.

---

## 3. The constraint that decides it

**This app deploys to PHP shared hosting. There is no Node on the server.**
`docs/SETUP.md` is explicit: Node 18+ is needed *on your laptop* to build the
bundle, and is "not needed on the host". The host is PHP 8.1 + Apache on cPanel.

That single fact eliminates a whole class of solution:

- Polotno's self-hosted renderer, IMG.LY's server SDK, and any
  Puppeteer/Playwright PDF service all need a Node process we have nowhere to
  run. Using them means either paying for a cloud render API (per-render cost,
  and every child's photo and name leaves our infrastructure) or standing up a
  second host — a new bill, a new deploy, a new thing to be down at 7am on print
  day.
- **So rendering stays in the browser**, which is where it already is and where
  it already works: `vendor/html2canvas.min.js` + `jspdf.umd.min.js` +
  `jszip.min.js`, driven by `tests/card-export.test.js` (42 assertions) at
  300/350/600 DPI with a true 54×92 mm trim.

Two more constraints from this codebase, both real:

- **There is no module bundler for app code.** `build.js` transforms JSX only
  and concatenates classic scripts in a fixed order (`ORDER` in `build.js`),
  with globals hung on `window`. Fabric/Konva ship as UMD and drop straight into
  `vendor/` like every other library here. Polotno and CE.SDK are ESM React
  packages with substantial dependency trees (mobx, Blueprint) and need a real
  bundled entry point. That is not a blocker — esbuild is already a dependency —
  but it is a genuine change to how this app is built, and it will add on the
  order of a megabyte to what a coordinator on a Lagos 3G connection downloads.
- **Offline matters here.** The service worker precaches the shell and the app
  is used at centres with unreliable connectivity. A cloud-render dependency is
  a feature that stops working exactly when the centre needs it.

---

## 4. Recommendation

**Build a constrained template designer on Fabric.js (MIT), rendering and
exporting in the browser, storing designs as JSON in our own schema.**

Then, if and only if the admin team outgrows it, **buy Polotno** — after asking
for the Grass Roots discount. The Konva lineage means the concepts transfer.

Reasoning, in order of weight:

1. **It fits where we deploy.** No Node on the host, no new bill, no child's
   photograph leaving our infrastructure, and it still works at a centre with
   no internet.
2. **The expensive part of Canva is the part we do not need.** We are not buying
   stock libraries, video, or multiplayer. We need group A on a 590-unit grid.
3. **£0 versus $9,990/year matters to this organisation.** That is roughly the
   cost of a print run of several thousand cards.
4. **We already own the hard parts.** A 300-DPI export pipeline with a tested
   trim size, a QR encoder that is verified by decoding it back (`tests/scanners.test.js`),
   a photo pipeline with face-aware cropping, an ink rule that reads its own
   background, and a card model that reflows to any proportion without
   stretching. A generic editor would *lose* most of that.
5. **SVG export is a real print path.** Fabric exports SVG; that is vector text
   and vector shapes to hand a commercial printer, which is better than the
   raster we produce today.

**Where this recommendation is weakest, stated plainly:** if the programme ever
needs true CMYK PDF/X with preflight for an offset print house, none of the free
options do it and CE.SDK is the honest answer. Today the cards go through a
digital press or an in-house printer where RGB→CMYK conversion at the printer is
normal and acceptable. If that changes, revisit §2.4 — do not try to hand-roll
CMYK.

---

## 5. What gets built

### Phase 0 — Decide the model (no code)

The one decision everything else follows from: **a design is a template, not a
card.** It is a JSON document of elements, where an element is either fixed
artwork or a **bound field** — `{{firstName}}`, `{{surname}}`, `{{photo}}`,
`{{qr}}`, `{{centre.code}}`, `{{centre.color}}`, `{{displayId}}`, `{{expiresAt}}`,
`{{role}}`, `{{faculty}}`.

Rendering a card = template JSON + one student row → one card. This is the
existing `VolunteerCardFront` idea, generalised: today the layout is in JSX and
only the data varies; after this, the layout is data too.

### Phase 1 — The schema and the renderer (no editor yet)

Ship the *renderer* before the editor, because the renderer is what the print run
depends on and it can be tested without a UI.

- `docs/SCHEMAS.md` gains the template schema: page (w/h in design units, bleed,
  safe area), elements (`text | image | shape | qr | line | group`), per-element
  geometry, style, and an optional `bind`.
- A pure function `renderTemplate(template, row) → element list`, plus a React
  component that draws it — the same code path for the on-screen preview, the
  studio sheet, and the PNG/PDF export, so what you see is what prints.
- The three cards we ship today (student front, volunteer front, shared back)
  are re-expressed **as templates in this schema**, seeded into the database as
  read-only "system" designs. This is the acceptance test for the schema: if it
  cannot express the cards we already print, it is the wrong schema.
- Server: `card_templates` table (id, name, kind, schema JSON, status, version,
  createdBy, updatedAt) + CRUD ops behind the existing `admin_cap_gate('summer')`,
  and a `NGG_SCHEMA_TARGET` bump mirrored into `db/schema-mysql.sql`.

**Test gate for phase 1:** the three system templates render byte-identically
(within antialiasing tolerance) to today's cards, and the existing 42
card-export assertions still pass. If they do not, phase 1 is not done.

### Phase 2 — The editor

Fabric.js in `vendor/` (UMD, same as every other library here), an editor screen
in the admin console.

- Canvas with the card's true proportion, bleed and safe-area overlays, rulers,
  snapping and smart guides, zoom.
- Left rail: layers (reorder, lock, hide). Right rail: properties for the
  selection. Top: undo/redo, align/distribute, group/ungroup.
- Element types: text, image, shape (rect/ellipse/line/polygon), and our own
  **QR element** — which is not a generic image, because the QR must stay square,
  above a minimum module size, and inside the quiet zone or it stops scanning.
- **The Bind panel** — the feature that makes this an ID designer rather than a
  drawing app. Select an element, bind it to a field, and the canvas immediately
  shows a real student's data, with a picker to preview any child in the cohort.
  Bound text carries its own fit rule (the `cardFit` / `footBandFit` solve we
  already wrote), so a long name shrinks instead of overflowing.
- Fonts: our own list, self-hosted. Not a 3,000-font picker — a print run in one
  font nobody has licensed is a legal problem, not a feature.

### Phase 3 — Guardrails (the part that makes it safe for a print run)

Canva has no equivalent of this section, and it is the reason a generic Canva
embed would be the wrong purchase.

- **Preflight, run before a template can be published:** every required field is
  bound and appears exactly once; the QR is ≥ its minimum physical size with an
  intact quiet zone; no element crosses the safe area; every text element passes
  the ink-contrast rule against whatever is behind it (`inkOn`, already written);
  the longest name in the actual cohort still fits at the element's floor size;
  images are ≥ 300 DPI at their placed size.
- **Test the template against the real roster, not a sample of one.** "Renders
  correctly for the current cohort's 312 children, including the longest name,
  the child with no photo, and every centre colour" is one button and a report.
- Versioning: publishing mints a new version; a print run records the version it
  used, so a card can always be reproduced exactly.
- The three system templates are duplicable but not editable, so there is always
  a known-good design to fall back to.

### Phase 4 — Output

Reuse what exists: `html2canvas` → PNG at the chosen DPI → `jsPDF` imposition →
`jszip` for the batch. Add:

- **SVG export** via Fabric, for a commercial printer that wants vector.
- Crop marks and bleed in the PDF (`docs/PRINT-SPEC.md` already defines the
  geometry).
- A per-run manifest: template name + version, DPI, trim, count, who pressed it.

### Phase 5 — Optional, only if asked for

Background removal (Cloudinary, already integrated), text-to-image, and a
"suggest a layout" pass. Each is an API call with a per-call cost, bolted onto a
finished editor. None of them belongs in the first release.

---

## 6. Rough sizing

| Phase | What | Size |
|---|---|---|
| 1 | Schema, renderer, three system templates, storage, migration | Medium — the highest-risk phase, because everything downstream depends on the schema being right |
| 2 | Fabric editor, layers, properties, bind panel | Large — the bulk of the work |
| 3 | Preflight, cohort test, versioning | Medium — and the phase most likely to be cut, which would be a mistake |
| 4 | SVG export, crop marks, manifest | Small — mostly reuse |
| 5 | AI extras | Small each, optional |

Deliberately not estimated in days. The number that matters is the ordering:
**phase 1 before phase 2**, because an editor that writes a schema the printer
cannot render is worse than no editor.

---

## 7. What to decide before any code

1. **Buy or build?** This document recommends build-on-Fabric. If the answer is
   buy, ask Polotno for the Grass Roots price first, and note that phases 1, 3
   and 4 are still ours either way — an SDK gives you phase 2 only.
2. **Is CMYK PDF/X ever going to be required?** If yes, that changes the answer
   to CE.SDK and the budget conversation happens now rather than after the build.
3. **Who is allowed to edit a template?** Recommendation: a new capability, not
   `summer` — the people who verify children are not necessarily the people who
   should be able to change what a credential looks like.

---

## Sources

- [Polotno SDK vs Konva.js](https://polotno.com/sdk/product/compare/polotno-sdk-vs-konvajs) · [vs Fabric.js](https://polotno.com/sdk/product/compare/polotno-sdk-vs-fabricjs) · [SDK alternatives](https://polotno.com/sdk/product/compare) · [pricing](https://polotno.com/sdk/pricing) · [features](https://polotno.com/sdk/product/features)
- [IMG.LY CreativeEditor SDK](https://img.ly/products/creative-sdk/) · [print](https://img.ly/industries/print) · [variable data printing](https://img.ly/use-cases/variable-data-printing) · [open-source design SDKs compared](https://img.ly/blog/open-source-design-editor-sdks-a-developers-guide-to-choosing-the-right-solution/) · [7 best design editor SDKs](https://img.ly/blog/compare-best-design-editor-sdks/)
- [Fabric.js](https://fabricjs.com/) · [npm](https://www.npmjs.com/package/fabric) · [SVG parsing and export](https://deepwiki.com/fabricjs/fabric.js/8.2-svg-parsing-and-export) · [GitHub](https://github.com/fabricjs/fabric.js)
- [Konva.js](https://konvajs.org/docs/index.html) · [canvas editor guide](https://konvajs.org/docs/sandbox/Canvas_Editor.html) · [react-konva](https://www.npmjs.com/package/react-konva)
- [tldraw SDK licence](https://tldraw.dev/community/license) · [plans](https://tldraw.dev/get-a-license/plans)
- [Fabric vs Konva vs PixiJS, 2026](https://www.pkgpulse.com/guides/fabricjs-vs-konva-vs-pixijs-canvas-2d-graphics-2026) · [best canvas libraries](https://velt.dev/blog/best-canvas-library-web-mobile-apps)
- [Open-source Canva alternatives](https://openalternative.co/alternatives/canva) · [design-editor topic on GitHub](https://github.com/topics/design-editor)
