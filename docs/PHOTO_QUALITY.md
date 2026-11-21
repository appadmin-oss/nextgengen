# Photo quality — "We do not take low-quality photos"

Owner, 18 Nov 2026. Every photo that goes on a record (and so on an ID card) passes one gate:
`api/_lib/domain/photo-quality.php` on the server, and the same rules in the browser (`photoQa*` in
`components.jsx`). The browser tells the family at once; the server measures the pixels again and decides.

## The rules (`PHOTO_QA`; the browser's `PHOTO_QA_RULES` must match — the PHP suite checks it)

| Check | Rule | Refusal |
|---|---|---|
| Size | at least 600 × 800 px. Nothing is enlarged to reach it. | `too_small` |
| Exposure | mean luma 50–215 **over the face zone** (x 18–82 %, y 8–62 %) | `too_dark`, `too_bright` |
| Blown / crushed | ≤ 30 % of the inner face pixels at 0–8 or 247–255 | `clipped` |
| Contrast | luma std-dev ≥ 22 in the face zone | `low_contrast` |
| Sharpness | Crete et al. no-reference blur score of the face zone ≤ 0.58 (server allows +0.02 for decoder rounding) | `blurry` |

Exposure is judged on the face, not the frame, so a passport photo on a white wall passes.

**The blur score** (Crete, Dolmiere, Ladret, Nicolas, 2007, *The blur effect: perception and estimation with a
new no-reference perceptual blur metric*): blur the image again with a 9-px box filter and measure how much
edge detail that removes. A sharp photo loses a lot (score near 0); an already blurred, shaken or enlarged one
loses little (near 1). It does not depend on contrast or on how busy the background is, which is why it was
chosen over Laplacian variance: on the calibration set, Laplacian variance scored a 2.5 px blur of a textured
photo higher than a sharp photo of a plain one.

## Calibration (18 Nov 2026)

Ten real portraits, cropped 3:4 and saved as the form saves them (600 × 800, JPEG q86), and degraded copies:

| Version | Blur score |
|---|---|
| Sharp originals | 0.18 – 0.50 |
| Through WhatsApp-style compression (720 px, q35) | 0.20 – 0.49 — accepted |
| Enlarged from a 300 × 400 thumbnail | 0.34 – 0.58 |
| Enlarged from a 200 × 267 thumbnail | 0.47 – 0.66 |
| 2 px Gaussian blur | 0.64 – 0.76 — all refused |
| 3 px Gaussian blur | 0.72 – 0.82 — all refused |

An enlarged thumbnail that scores under 0.58 is caught by the size rule in the browser, which measures the
ORIGINAL file's pixels before anything is resized.

## Where photos are judged

Public application (teen and volunteer), a guardian's retake, a member's "change my photo", the profile drive,
a volunteer's record and a staff upload to a member record. The server reads the pixels wherever the photo is
kept: an inline `data:` image, the local store, the S3-compatible bucket (a signed GET of its own key), or
Cloudinary. A photo it cannot read is refused ("We could not check the photo just now"), never waved through.

Summer School's desk registration is not gated: its photo is stored after the participant is registered, and
that path must never fail a registration.

## Switches

- `photo_quality_gate` = `off` (setting, super-admin): turn the gate off, e.g. during a storage outage.
- A host without PHP's GD extension enforces the size rule only, and says so once in the error log.
