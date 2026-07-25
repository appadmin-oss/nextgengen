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

## Gutters and duplex

- Gutters are **two bleeds wide (6 mm)** so neighbouring cards' bleeds abut
  rather than overlap; each cut serves one card and the 6 mm strip between is
  waste. A narrower gutter would mean every cut damaged the card beside it.
- Back sheets are **interleaved** (front 1, back 1, front 2, back 2 …) and the
  **column order on each back is mirrored**, so a long-edge duplex flip lands
  each back on its own front. Printing all fronts then all backs — as an
  earlier version of this exporter did — puts card 1's back on card N's front.

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
  stops it after the card in flight.

Cards that fail are named in the studio afterwards so they can be retried.
