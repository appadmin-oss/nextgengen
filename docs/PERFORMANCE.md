# Performance on low-end phones

Owner, 18 Nov 2026: "Fix the issue of the NGG site constantly lagging … It must work perfectly on low-end devices …
It is too heavy … Research! How does Canva do? How do games do it?"

## What the research says

- **Tiered loading** (how games ship): load what the first screen needs, then the current "level", then
  everything else only when it is needed. PROXX (Google's feature-phone case study) moved everything not
  needed for interactivity into a lazy chunk and cut time-to-interactive on a 2G feature phone from 11 s to
  5.4 s. — web.dev, *Techniques to make a web app load fast, even on a feature phone*.
- **Adaptive loading** (Facebook): classify the device (RAM via `navigator.deviceMemory`, cores via
  `hardwareConcurrency`, data saver, connection type) and give the low end a cheaper experience. — web.dev,
  *Adaptive loading*. NGG already does this: **Lite mode** turns on automatically before first paint.
- **Don't render what isn't on screen**: `content-visibility: auto` skips layout and paint of off-screen
  sections (web.dev measured 232 ms → 30 ms; independent tests found smaller but real gains).
- **Measure spikes, not averages** (game streaming write-ups): long tasks are what a person feels as lag.
- Canva has published no engineering detail on this; its job adverts name page load, interaction latency,
  jank and memory as the targets — the same four measured here.

## What the build does now

| Bundle | Holds | Loaded |
|---|---|---|
| `app.<hash>.min.js` | the public site | every page |
| `app-study.<hash>.min.js` | Labs, study tools, timetable maker, Learn, chess engine, lesson blocks | `/study`, `/timetable`, `/learn`, and with the signed-in bundle |
| `app-more.<hash>.min.js` | Control Room, studios, every portal | signed-in routes (`NGG_MORE_ROUTES`) |

- `build.js` `STUDY` and `MORE` decide which files go where; `NGG_STUDY_ROUTES` / `NGG_MORE_ROUTES` in
  `app.jsx` decide which routes fetch what; `NggChunkGate` waits (and, on a `ReferenceError`, loads
  everything and redraws). `tests/bundle-split.test.js` fails when the public bundle borrows a name from either
  of the others without a listed reason, or when a route downloads a bundle it does not need.
- **Stylesheets**: public pages get `styles-app-public.<hash>.css` — the rules whose classes the public sources
  use (`tools/css-split.js`, by evidence). The full sheet is swapped in with the signed-in bundle, so signed-in
  screens keep the original cascade.
- **Icons**: only the Phosphor icons some source names (`phosphor-used.<hash>.css`).
- **Libraries on demand**: TanStack Table (when a table first draws) and jsQR (when a camera reader opens) no
  longer load on every page.
- **Logo**: 512 px palette PNG (9.5 KB, was 95 KB); `assets/logo-1080.png` stays for card printing.
- **Service worker**: precaches the slim public sheet, not 1.1 MB of Control Room styles.
- **Lite mode** also skips rendering off-screen sections (`content-visibility`).

## Measured (production build, emulated low-end phone: 6× CPU, 1.6 Mbps, 150 ms RTT)

| | Before | After |
|---|---|---|
| Home page ready | 24.4 s | 16.4 s |
| Home page bytes (uncompressed) | 4.87 MB | 3.0 MB |
| Public JavaScript | 2.33 MB (630 KB gzip) | 1.64 MB (436 KB gzip) |
| Control Room CSS on a public page | 1,106 KB | 318 KB |
| Network requests in 30 s idle | 0 | 0 |

Background work was not the problem: an idle page makes no requests and requests one animation frame.

## Next, in order of value

1. Split `page-club.jsx` (546 KB) and `page-other.jsx` (539 KB) by area into their own bundles — the same
   mechanism, one more entry in `build.js` and `app.jsx` each.
2. Subset the Phosphor font file itself (147 KB) to the icons used (needs fonttools at build time).
3. Prerender the home page's first screen into `index.html` (PROXX's biggest first-paint win).
