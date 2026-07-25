# ID card print specification

What the ID Card Studio (`/cards`) hands to a printer, and why each part is
there. Give this page to the print shop with the PDF.

Implementation: `vendor/card-export.js` (`CardExport.buildImpositionPDF`),
driven by `CardStudio` in `page-other.jsx`. Verified by
`npm run test:cards` (`tests/card-export.test.js`), which reads the finished
PDF back and checks the properties below rather than trusting the writer.

## The file

| | Imposed (default) | Single-up |
|---|---|---|
| Page | A4 press sheet, cards ganged N-up | One card per page |
| MediaBox | 210 × 297 mm | trim + 2 × 9.5 mm |
| TrimBox | the sheet | the card |
| BleedBox | the sheet | card + 3 mm |
| Cut guidance | crop marks + cut-line layer | crop marks + page boxes |
| Use it when | you are printing and guillotining these sheets as-is | the shop imposes onto their own press sheet |

Both carry the same artwork, marks, layers and colour declaration. Single-up is
the cleaner handoff if the shop has a prepress department; imposed is what you
want for a copy-shop run.

## Trim, bleed and safe area

- **Trim** is admin-set in the studio (default 54 × 75 mm; 50–60 × 64–100 mm).
- **Bleed is 3 mm on all four edges** — the commercial default, and inside the
  3–5 mm range prepress guidance puts between the TrimBox and the BleedBox.
- **Safe area is 3 mm inside trim.** Nothing critical is placed outside it.

The card designs are drawn to trim with no bleed of their own, so the exporter
*generates* the bleed by mirroring the outermost 3 mm of rendered pixels
outward — the same technique prepress tools use to rescue art supplied without
bleed. Mirroring rather than stretching keeps patterned edges (the aso-oke
weave across the card back) from smearing into streaks.

## Marks

- **Crop marks** at every cut line, in **registration colour** (100 % of every
  plate, so they appear on all four separations), 0.25 pt — the
  Illustrator/InDesign default hairline.
- Marks sit **in the sheet margin, 1.5 mm outside the bleed**, never inside it.
  A mark inside the bleed prints on the finished card. On a ganged sheet the
  marks run along the sheet edges in line with every cut, so the guillotine
  operator lines up on the sheet edge and makes through-cuts.
- **Registration targets** on all four sides, wherever the margin can hold one
  whole. A tight single-up page gets crop marks only.
- **A CMYK control strip** on imposed sheets: solids, two- and three-colour
  overprints, and 75/50/25 tints, for reading ink density and trap.
- **A slug line** with job name, sheet number, front/back, trim size, bleed,
  imposition and colour target.

## Gutters

Gutters are **two bleeds wide (6 mm)** so neighbouring cards' bleeds abut
rather than overlap; each cut serves one card and the 6 mm strip between is
waste. A narrower gutter would mean every cut damaged the card beside it.

## Duplex — getting the back on its own front

**This is the setting to confirm with your printer before running.** Back
sheets are **interleaved** (front 1, back 1, front 2, back 2 …) — printing all
fronts then all backs, as an earlier version did, puts card 1's back on card
N's front. But interleaving alone is not enough: where each back has to be
imaged depends on which axis the press turns the sheet about.

| Studio setting | Press term | Sheet turns about | Backs are | Art | Register |
|---|---|---|---|---|---|
| **Long edge** (default) | work-and-turn | vertical axis | column-mirrored | upright | **best** — same gripper edge both passes |
| **Short edge** | work-and-tumble | horizontal axis | row-mirrored | **turned 180°** | looser — gripper edge changes |
| **No flip** | — | — | unchanged | upright | n/a |

Why short edge also turns the art: tumbling the sheet puts the card's head at
the sheet's foot, so a back imaged upright would come out upside-down on the
finished card. Equivalently — take the long-edge back sheet and rotate the
whole page 180°. Getting this wrong is silent: the sheets look fine and every
card is ruined.

**Prefer long edge where you have the choice.** Work-and-turn keeps the same
gripper edge for both passes, which is the single biggest factor in
front-to-back register; work-and-tumble grips the leading edge on pass one and
the tail edge on pass two, so any variation in sheet length shows up as
misregistration.

The chosen flip is **printed in the slug on every sheet**
(`duplex: LONG-edge flip (work-and-turn)`) so the operator can check it against
how the press is actually set up before committing to a run.

Single-up pages are laid out symmetrically — the slug band is mirrored as dead
space at the head — so the card sits dead centre and lands in the same place
under either flip. Only the 180° turn applies there.

### Card printers

A desktop duplex card printer (Zebra, Evolis, Fargo and similar) flips the card
itself and expects one card per page, front then back. Use **Single-up** with
**No flip** for those.

## Layers

The PDF uses optional content groups, so a printer can switch the furniture off
and look at the artwork alone:

| Layer | Prints | Processing step (ISO 19593-1:2018) |
|---|---|---|
| Artwork | yes | — |
| Printer marks | yes | — |
| Job info | yes | `Legend` |
| Cut lines | **no** | `Structural` / `Cutting` |
| Bleed guide | **no** | `Structural` / `Bleed` |
| Safe area | **no** | `Dimensions` |

Technical layers carry a `/GTS_Metadata` dictionary with
`/GTS_ProcStepsGroup` and `/GTS_ProcStepsType` per ISO 19593-1:2018,
*Processing steps for packaging and labels*. Guide layers are switched off for
output through the OCG `/Usage` print state **and** an `/AS` auto-state in
`/OCProperties`, so they cannot image even on a RIP that prints all layers.

## Colour

Artwork is RGB raster at **350 DPI** by default (2 × a 175 lpi screen; the
studio also offers 300 for digital presses and 600 for line art). The file
declares its intended printing condition with a `GTS_PDFX` **OutputIntent** —
**FOGRA39** (`Coated FOGRA39, ISO 12647-2:2004`) unless changed — so the RIP
separates against a known target instead of guessing.

**This is not a preflighted PDF/X file, and it does not claim to be.** PDF/X
conformance needs an embedded ICC profile, which is not shipped here, so the
exporter deliberately omits `/GTS_PDFXVersion`. Claiming a conformance level a
preflight check would then reject is worse than not claiming one. If a shop
requires PDF/X-4, ask them to convert against the declared output intent.

## Resolution reference

| Setting | Pixels across a 54 mm card | Use |
|---|---|---|
| 300 DPI | 638 | digital press minimum |
| 350 DPI | 744 | offset standard (default) |
| 600 DPI | 1276 | line art; slow, large files |

Faces are JPEG at quality 0.95 inside the PDF — visually lossless at these
resolutions and the only way a several-hundred-card run stays a sane file size.
The **PNG (.zip)** export is lossless at the same resolution, for a designer
re-laying the cards out by hand.

## Running a full roster

The studio is built to take a thousand cards without falling over, and the
constraint that shapes it is html2canvas: it clones the **whole document** for
every capture, so the price of each face is set by how much is mounted, not by
the card being captured. Measured on this design:

| Cards mounted | DOM nodes | ms per face |
|---|---|---|
| card alone | ~50 | **168** |
| 200 | 14,833 | 4,164 |
| 600 | 44,433 | 11,959 |

Rendering the roster and rasterising out of it — which is what the studio used
to do — is therefore O(n²), and a thousand cards is hours. Three things follow:

- **The preview pages.** 24 cards at a time, with search across name, ID,
  centre and track. Ticks are held by id, so they survive searching and paging:
  filter, *Tick these*, filter again, export the lot.
- **Rendering runs from an isolated host.** One card at a time, and the preview
  grid is unmounted for the duration, so each face costs the same whether the
  roster is 50 or 5,000. Measured flat at ~210–270 ms per face.
- **Output is batched.** 250 cards per file by default. One PDF of a thousand
  cards is ~200 MB and jsPDF holds every image as base64 while it builds —
  enough to end the tab on a phone, and not a file any shop wants. Each batch
  is downloaded and released before the next starts, so peak memory is one
  batch. Expect the browser to ask once for permission to save several files.

Roughly, for 1,000 cards: **7–8 minutes**, four PDFs of ~50 MB, flat memory.
The tab must stay in the foreground — browsers throttle background timers,
which stalls the render.

## Reliability on large runs

Everything renders in the browser; nothing is uploaded. Across hundreds of
cards that means hundreds of image fetches, so every remote read is bounded:

- image fetches abort after 12 s and retry once, then the card renders without
  that image rather than stalling the run;
- failures are cached, so one dead photo URL is not retried for every card;
- vendored script loads time out at 20 s;
- each face gets a 30 s ceiling — a wedged rasteriser costs one card, not the
  export;
- the run yields a frame per card so the tab stays responsive, and **Cancel**
  stops it after the card in flight — batches already downloaded are kept;
- the inlined-image cache is capped, so a full roster of unique photos cannot
  quietly accumulate hundreds of megabytes.

Cards that fail are named in the studio afterwards so they can be retried.
