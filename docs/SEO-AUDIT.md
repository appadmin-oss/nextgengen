# Technical SEO audit — next.afrovanguard.org.ng

Date: 8 Nov 2026 · Read-only audit; this report is the only file written.

## How it was measured

- **The built site.** `dist/` (build `e72aefff59`) was copied to a scratch directory and given a throwaway `api/config.php`. It was served with `php -S` behind a router that copies `dist/.htaccess`: real files first, `/status` gets a 301, `/sitemap.xml` goes to `sitemap.php` only when no real file exists, `/study/<x>` goes to `api/public/lab-page.php`, `/timetable/about` is rewritten, and everything else gets `index.html`.
- **What a crawler without JavaScript sees.** Each key URL was fetched with `curl`, recording status, `<title>`, canonical, JSON-LD and the word count of the raw HTML.
- **What Google sees after rendering.** The same URLs were opened in headless Chromium 1243 (`playwright-core`) at a 412×915 mobile viewport, recording the rendered title, canonical, robots tag, `<h1>`, word count, image `alt` and crawlable `<a href>` links.
- **Production.** These were read-only GETs against `https://next.afrovanguard.org.ng`, to confirm the findings on the live host (behind Cloudflare).

## The answer in one paragraph

Apart from the Labs (`/study/lab`, `/study/physics`, `/study/english`) and `/timetable/about`, **every URL on the site gets the same 10 KB shell**. That shell has the home page's title and description, **`<link rel="canonical" href="https://next.afrovanguard.org.ng/">`**, and two words of body text ("Booting · Afrovanguard").

JavaScript corrects the title and canonical later. But Google's rule is that a canonical set by JavaScript must match the one in the raw HTML. So in the first HTML Google reads, `/about`, `/summer`, `/club`, `/anchor`, `/parents`, `/join` and the rest all declare themselves **duplicates of the home page**.

Three other faults make this worse:

- **Nothing to follow.** After rendering, **every public page has exactly one crawlable link** (the logo). The navigation is `<button onClick>` and the footer links are `href="#"`, so Google cannot find pages by following links.
- **The live sitemap is the old static one.** `/sitemap.xml` serves a 15-URL static file. The dynamic sitemap (434 URLs on production, including every Lab topic, centre and post) is never reached, because the static file shadows the rewrite.
- **Unknown URLs are soft 404s.** They return **200, `index, follow`, canonical `/`**.

The Labs are the one part that was built properly (server-rendered head, content and JSON-LD). Even there, production takes **8–12 s to start answering**.

## Measured results

### Raw HTML: what a non-JS crawler, or Google's first pass, receives

| URL | Status | `<title>` | canonical | JSON-LD | words in body |
|---|---|---|---|---|---|
| `/` | 200 | Next Generation Genius · Afrovanguard | `/` | Organization | 2 |
| `/about` | 200 | *same as home* | **`/`** | Organization | 2 |
| `/summer`, `/club`, `/anchor`, `/join`, `/blog`, `/centres`, `/contact`, `/study` | 200 | *same as home* | **`/`** | Organization | 2 |
| `/blog?post=x` | 200 | *same as home* | **`/`** | Organization | 2 |
| `/centres/foo` | 200 | *same as home* | **`/`** | Organization | 2 |
| `/this-does-not-exist` | **200** | *same as home* | `/` | Organization | 2 |
| `/study/nonsense` | **200** | *same as home* | `/` | Organization | 2 |
| `/study/lab` | 200 | Maths Lab — free maths practice… | `/study/lab` | Org + Course + Breadcrumb | 626 |
| `/study/lab/courses` | 200 | Maths Lab courses — … | `/study/lab/courses` | 8 | 175 |
| `/study/lab/guide/3` | 200 | Stage 3: The Number System — … | `/study/lab/guide/3` | 3 | 114 |
| `/study/lab/learn/MC-001` | 200 | One-to-one correspondence… | its own URL | Org + LearningResource + Breadcrumb (all valid JSON) | ~170 |
| `/study/physics` | 200 | Physics Lab — … | its own URL | 3 | 323 |
| `/timetable/about` | 200 | Timetable Maker · NextGen Genius | its own URL | 0 | 421 |
| `/sitemap.xml` | 200 | — | — | — | **15 URLs** |
| `/api/public/sitemap.php` | 200 | — | — | — | **432 URLs** locally, 434 on production |
| `/status` | 301 → `/s-status` | | | | |

Production showed the same thing: `/`, `/about`, `/about/` and `/no-such-page` are all 10,423 bytes with the home title.

### Rendered DOM: what Google indexes after running JavaScript

| URL | Rendered title | canonical | `<h1>` | words | crawlable `<a href>` |
|---|---|---|---|---|---|
| `/` | Next Generation Genius · Afrovanguard | `/` | "Africa's next geniuses are not waiting." | 946 | **1** |
| `/about` | About NGGC · The 2040 formation brief | `/about` | 1 h1, 13 h2 | 2,454 | **1** |
| `/summer` | Summer School · NGG | `/summer` | "Summer School." | 721 | **1** |
| `/club` | NGGC · The Genius Club | `/club` | 1 | 379 | **1** |
| `/anchor` | Anchor 12 · The Flagship · NGG | `/anchor` | 1 | 888 | **1** |
| `/parents` | For parents · Safe room with high ceilings | `/parents` | 1 | 461 | **1** |
| `/blog` | The Journal · NGG | `/blog` | 1 | 643 | **1** |
| `/centres` | NGG member centres · NGG | `/centres` | 1 | 327 | **1** |
| `/study/lab` | **Maths Lab · Study tools · NGG** (the server said something else) | `/study/lab` | **"Study tools"** | 538 | 2 |
| `/study/lab/learn/MC-001` | Topic title | its own | **"Study tools"** | 167 | 2 |
| `/this-does-not-exist` | Page not found · NGG | `/` | "We don't have a room…" | 267 | 1 |

Things that are fine once rendered:

- Every page has exactly one `<h1>`.
- No `<img>` is missing `alt` (0 of 22 on home).
- The viewport meta is correct (`width=device-width, initial-scale=1`).
- `lang="en"` is set.
- No JavaScript errors were thrown during render.

## Findings, worst first

### P0. Every public page's raw-HTML canonical points at the home page

- **Where:** `index.html:22` (`<link rel="canonical" href="https://next.afrovanguard.org.ng/"/>`), served for every SPA route by `.htaccess` (`RewriteRule ^ index.html`). `app.jsx:439–448` rewrites it in JavaScript.
- **Why it matters:** Google says *"The best way to set the canonical URL is to use HTML … make sure that you always set the canonical URL to the same value as the original HTML"*, and that JavaScript may only *add* a canonical when the HTML has none ([JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)). Every raw response says "I am a copy of `/`", and the rendered one says otherwise. That is exactly the conflict Google warns about, and the likely result is that `/about`, `/summer`, `/anchor` and the rest are folded into the home page and never ranked on their own.
- **The same applies to:**
  - Centre pages (`page-centres.jsx:210` sets the canonical in JavaScript only).
  - Blog posts. These are worse: after rendering, `/blog?post=<slug>` gets canonical **`/blog`**, because `app.jsx` derives it from the page id and `page-blog.jsx` never sets one. So every post declares itself a duplicate of the blog index, both before and after rendering.

### P0. No crawlable internal links

- **Where:** `components.jsx:695` `TopNav`, whose menu items are `<button>`s. `components.jsx:1071` `Footer`, whose links are `<a href="#" onClick=…>` or `<button>`. Page CTAs use `onClick={() => setPage(...)}`: 22 in `page-home.jsx`, 7 in `page-about.jsx`.
- **Measured:** 1 crawlable link per rendered page, on every page.
- **Why it matters:** *"Google can only discover your links if they are `<a>` HTML elements with an `href` attribute"* (same doc). With no followable links, Google relies entirely on the sitemap, and that is broken too (next item). Internal links are also how PageRank reaches `/summer`, `/join` and the Labs.

### P0. `/sitemap.xml` serves the stale 15-URL static file; the dynamic one is unreachable

- **Where:** `.htaccess` puts the "real file → stop" rule (`RewriteCond %{REQUEST_FILENAME} -f … [L]`) *before* `RewriteRule ^sitemap\.xml$ api/public/sitemap.php`. `build.js:426` copies `sitemap.xml` into `dist/`, so the file always exists and the dynamic sitemap never runs.
- **Confirmed on production:** `/sitemap.xml` has 15 `<loc>`; `/api/public/sitemap.php` has 434.
- **Also wrong:** `robots.txt` (`Sitemap: …/sitemap.xml`) points at the stale file, and `/api/` is `Disallow`ed, so the working sitemap is both unlinked and blocked.
- **Problems in the static file:**
  - It lists `/s-status` and `/v-status`, which are thin live dashboards.
  - It is missing `/centres`, `/legal`, `/volunteer`, `/join/volunteer`, all 3 Labs and every blog post.
- **Problems in the dynamic file:**
  - Blog posts are listed as `/blog?post=slug`, and that URL canonicalises to `/blog` (see above), so listing it achieves nothing.
  - The ~420 Lab URLs carry no `<lastmod>`. Only posts and centres have one, and `changefreq`/`priority` are ignored by Google.
  - It lists `/join`, an application form; that is acceptable.

### P0. Soft 404s

- **Where:** any unknown path, any non-Lab `/study/<x>`, `/centres/<missing-slug>` and `/study/lab/learn/<bad-id>` (this one is served as the Lab hub) all return **200**. The raw HTML says `index, follow` with canonical `/`. After rendering, `app.jsx:449` still sets `index, follow` for `_notfound`, while the title becomes "Page not found".
- **Also:** `ErrorDocument 404 /index.html` turns even real 404s into the shell.
- **Google's guidance:** for SPAs, either redirect with JavaScript to a URL the server answers with 404, or add `noindex` with JavaScript on error views ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)). Better still, answer 404 from the server for paths outside `ROUTES`.

### P1. The Labs (the part done right) answer slowly on production, and their rendered page contradicts their server page

- **TTFB on production:** `/study/lab/guide/3` measured **8.5 s and 12.2 s**, and `/study/lab` 8.3 s. The home shell measured 0.24 s, and the same page locally 0.06 s. Probable causes:
  - `lab_seo_shell()` calls `gs_call('public.lab.page')` with no cache argument (`$useCache` is false), so every request rebuilds the page with the generators.
  - Bootstrap runs on every request (DB open, migration check).
  - `Cache-Control: no-store` is sent, so Cloudflare cannot cache the page.

  A 10-second response wastes Google's crawl budget and is a direct LCP failure.
- **Headers on Lab pages:** they get the API's headers (`no-store`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`). `no-store` also stops Chrome's back/forward cache from keeping the page.
- **Rendered content differs from the server content.** After React mounts:
  - `<h1>` becomes "Study tools" on the hub *and* on topic pages.
  - The hub title becomes "Maths Lab · Study tools · NGG". `src/modules/tools/tools-core.jsx:244` sets `document.title` in a parent effect that runs after `mlbSeo()`, so it overwrites it.
  - The server's ~600 words and dozens of topic links shrink to 2 links for a signed-out visitor (`MlbLite`).

  Google indexes the rendered DOM, so the strong server markup is partly undone.
- **Thin topic pages:** ~170 words, and some worked examples refer to a picture that isn't in the HTML ("How many stars are in the picture?").
- **Minor:** "free english practice" is lower-case English. The server title says "Mathematics practice" and the client title says "Maths practice".

### P1. Page weight and render-blocking resources (Core Web Vitals)

The public first load (gzip sizes, from `dist/`):

| Resource | gz | Notes |
|---|---|---|
| `styles.<h>.css` | 88 KB (494 KB raw) | render-blocking |
| **`styles-app.<h>.css`** | **187 KB (1.13 MB raw)** | **render-blocking**: the Control Room/app stylesheet, loaded by every public visitor |
| `vendor/phosphor/phosphor.css` | 24 KB | render-blocking, for icons |
| `vendor/react*.js` | 43 KB | synchronous `<script>` in body |
| `vendor/tanstack-table.min.js` | 16 KB | **synchronous**, a table library on the public site |
| `vendor/jsQR.min.js` | 46 KB | deferred, but a QR decoder on every public page |
| `app.<h>.min.js` | **622 KB** (2.3 MB raw) | the "public" bundle |
| `api-client.<h>.js` | 54 KB | |
| `assets/logo.png` | 97 KB | preloaded for a 64 px boot image |

- That is roughly **1.1 MB gzipped before anything is drawn**.
- All content needs JavaScript to appear, so LCP waits for 600 KB of JavaScript to download, parse and run. On the 3G/4G phones that are most of this audience, that is far past the 2.5 s "good" LCP threshold.
- A 2.3 MB main bundle also risks INP (200 ms is "good"; INP replaced FID in March 2024).
- Images are mostly PNG/JPG (31 PNG, 20 JPG, 5 WebP under `assets/`), and the timetable landing PNGs are each >300 KB.
- Caching is good: fingerprinted files are `immutable`, and Cloudflare compresses responses with gzip.

### P1. Structured data

- **Organization** (in `index.html`, so on every page):
  - `sameAs` holds placeholder URLs (`https://instagram.com/`, `https://x.com/` …). They tie the organisation to the platforms' home pages, which is wrong data; remove them or use the real profile URLs.
  - The type should be `EducationalOrganization` (the Labs already use that), with `logo` pointing at a square ≥112 px image.
  - `description` says "twelve-week", which is the Anchor programme, not the organisation.
- **No page-specific JSON-LD** outside the Labs. That means no `BreadcrumbList`, no `Article`/`BlogPosting` for posts, no `Place`/`LocalBusiness` or `EducationalOrganization` with an address for centres, and no `Event` for Summer School editions or sessions.
- **Lab JSON-LD is valid JSON**, but:
  - Course and practice-problem rich results were retired: Course Info was among seven types phased out in June 2025, and Practice Problem was also phased out ([Google, Simplifying search results](https://developers.google.com/search/blog/2025/06/simplifying-search-results); [ppc.land](https://ppc.land/google-phases-out-practice-problem-and-dataset-structured-data/)). So `Course`/`LearningResource` markup earns no rich result. It still helps Google understand the page, so keep it, but don't expect snippets from it.
  - The Course *list* carousel still needs ≥3 courses, an `ItemList` and unique URLs ([Course docs](https://developers.google.com/search/docs/appearance/structured-data/course)). The `/courses` page gives every Course the same `url`, which disqualifies it.
- **FAQ rich results** were withdrawn for ordinary sites (no longer shown as of May 2026), so a FAQ block is not worth adding for snippets.

### P2. Social / Open Graph

- `og:image` is the 512×512 app icon, yet `twitter:card` is `summary_large_image`, so shares show a cropped icon. There is no 1200×630 image, and nothing changes per page (only the centres page swaps in its hero image, and only in JavaScript, which link-preview bots don't run).
- Every share of `/summer` or `/anchor` therefore shows the home title and description, because preview bots read only the raw HTML.

### P2. Host / URL hygiene

- `http://` → 301 → `https://` works (production). There is no `www` host (DNS does not resolve it), which is fine.
- **Trailing slash:** `/about/` returns 200 and the same shell. There is no redirect to `/about`, so there are duplicate URL forms. The shared canonical hides this today; once canonicals are fixed, add a redirect.
- HSTS is commented out. That is not an SEO issue, but it should be turned on.
- `hreflang` is not needed (one language, `en_NG`).
- `<meta name="keywords">` is ignored by Google and is harmless.

## Research summary (Google guidance, with sources)

- **Rendering:** Google renders JavaScript, but *"server-side or pre-rendering is still a great idea"* for users and for bots that can't run JavaScript. Links must be `<a href>`. A canonical must not be changed by JavaScript to differ from the HTML. A `noindex` in the raw HTML may stop rendering altogether. ([JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics))
- **Dynamic rendering** (serving bots a different snapshot) *"is a workaround and not a recommended solution"*. Use server-side rendering, static rendering or hydration instead. ([Dynamic rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)) What this host can do — the same HTML for everyone, emitted by PHP or prerendered at build time — is static rendering, not dynamic rendering.
- **Soft 404s in SPAs:** use a JavaScript redirect to a URL the server answers with 404, or add `noindex` with JavaScript on error views (same doc).
- **Core Web Vitals:** LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile. INP replaced FID on 12 Mar 2024. ([Ahrefs summary](https://ahrefs.com/blog/core-web-vitals/), [corewebvitals.io](https://corewebvitals.io/core-web-vitals); confirm against web.dev.)
- **Education structured data:** Course Info rich results were retired in 2025 and FAQ rich results withdrawn in 2026. The Course-list carousel requires ≥3 courses with unique URLs and an `ItemList`. ([Google blog, June 2025](https://developers.google.com/search/blog/2025/06/simplifying-search-results); [Course docs](https://developers.google.com/search/docs/appearance/structured-data/course); [Search Engine Land](https://searchengineland.com/google-to-drop-support-for-several-rich-result-types-to-simplify-the-search-results-page-456969))

## Fix list, in order

Everything below works on Apache + PHP with no Node on the server. Build-time steps run in the existing `build.js`.

| # | Change | Files | Effort | Impact |
|---|---|---|---|---|
| 1 | **Make `/sitemap.xml` the dynamic sitemap.** Move the sitemap rewrite above the real-file rule, or stop copying `sitemap.xml` into `dist/` (keep it under another name as the no-mod_rewrite fallback). Point `robots.txt` at it. | `.htaccess`, `build.js:426`, `robots.txt` | 15 min | **High.** Google learns about ~430 URLs (Labs, centres, posts) it cannot find today. Submit it in Search Console straight after. |
| 2 | **Per-route head served by PHP for every public route** (generalise `lab-page.php`). Add `api/public/page.php` (logic in a domain file, e.g. `domain/page-seo.php`, registered in `bootstrap.php`) that takes the `index.html` shell and swaps in the route's title, description, canonical, `og:*`, robots and JSON-LD, the way `lab_seo_shell()` already does. Rewrite `.htaccess`'s final `RewriteRule ^ index.html` to it. The route table must come from **one registry**: export `ROUTES` from `app.jsx` to `dist/routes.json` at build time (`build.js` already parses `ORDER`), and have PHP read that — never a second hand-typed list (CLAUDE.md §11). Non-indexable routes get `noindex` and **no canonical** in the raw HTML. | `.htaccess`, `api/public/page.php`, `api/_lib/domain/page-seo.php`, `build.js`, `bootstrap.php` | 1–2 days | **Highest.** Stops every page canonicalising to `/`. Gives correct link previews on WhatsApp, X and Facebook (which never run JavaScript). |
| 3 | **Remove the hard-coded canonical from `index.html`** (or keep it only as `/` for the home page from step 2). In `app.jsx`, never *change* a canonical. Only set one when the server set none, and make it match. | `index.html`, `app.jsx:439–448`, `page-centres.jsx:210` | 1 h | High (part of step 2). |
| 4 | **Real 404s.** In the step-2 router, answer **404** (with the shell, so the SPA still draws its NotFound page, plus `noindex`) for any path whose first segment is not a `ROUTES` id or a known alias. Also 404 for `/centres/<unknown>`, `/study/<not-a-lab>` and `/study/<lab>/learn/<bad-id>` (`lab-seo.php` falls back to the hub today). In `app.jsx`, set `noindex` for `_notfound`. Change `ErrorDocument 404` so it no longer serves the shell as a 200 page. | router, `app.jsx:449`, `lab-seo.php`, `.htaccess` | half a day | High: stops soft 404s and wasted crawl. |
| 5 | **Crawlable links.** Make every navigation control an `<a href={pathForPage(id)} onClick={e => {e.preventDefault(); setPage(id)}}>`, in one shared `NavLink` component in `components.jsx` (the brand logo already does exactly this). Apply it to TopNav mega-menu items, the footer columns (replacing `href="#"`) and page CTAs (`goApply` can render `<a href="/join?program=…">`). | `components.jsx`, `page-*.jsx` | 1 day | **High.** Link discovery and internal PageRank. Also better for accessibility: open in a new tab, copy link. |
| 6 | **Real crawlable content per public page.** Two ways that suit this host: (a) at build time, prerender each indexable public route with the Chromium the tests already use (`playwright-core`, `/opt/pw-browsers`) to `dist/_prerender/<route>.html` (the inner HTML of `#root`), and have step 2's PHP inject that into `#root`, as the Labs do. React then replaces it on mount. (b) For data-driven pages, render server-side from the same ops: blog posts (`posts.php`/`post.php`), centres (`centre.php`), Summer editions. (a) is cheap for the ~15 static marketing pages; (b) is needed for posts and centres, whose content changes without a build. | `build.js`, new `tools/prerender.js`, step-2 router | 2–3 days | High: real text for every crawler and AI answer engine, and a faster first paint for users. |
| 7 | **Blog post URLs.** Give posts a path (`/blog/<slug>`) instead of `?post=` (keep `?post=` as a 301). Set a per-post canonical, title, description, `og:image` and `BlogPosting` JSON-LD, served by PHP (step 2/6). Update the sitemap to list the path URLs. | `page-blog.jsx`, `app.jsx` (blog subtree), `sitemap.php`, router | 1 day | High for the Journal: today every post canonicalises to `/blog`. |
| 8 | **Make Lab pages fast.** Call `gs_call('public.lab.page', …, true)` with a long `cache_ttl` (the content is deterministic, fixed seed). Send `Cache-Control: public, max-age=3600` on `lab-page.php` (not the API's `no-store`) so Cloudflare can cache it. Or prerender all ~430 Lab pages to static files at build time. | `lab-seo.php`, `lab-page.php`, config `cache_ttl`, `gs_cache_topics()` | 2–4 h | High for the Labs: TTFB from 8–12 s to under 200 ms. |
| 9 | **Keep the Lab's rendered page consistent with its server page.** Stop `tools-core.jsx:244` overwriting the Lab's title. Give `MlbLite` the topic title as `<h1>` and keep the topic/stage links visible to signed-out visitors (render them as `<a href>`). | `src/modules/tools/tools-core.jsx`, `src/modules/mathslab/mlb-app.jsx` | half a day | Medium: Google indexes the rendered DOM. |
| 10 | **Cut render-blocking CSS and public JavaScript.** Don't load `styles-app.css` (187 KB gz) on public routes; load it when the app bundle loads, or split public and app rules. Load `tanstack-table` and `jsQR` through `loadVendor` only where they are used. Defer or async `phosphor.css`. Replace the 97 KB `logo.png` boot image with a small SVG/WebP. Move more of `app.min.js` (622 KB gz) behind the `app-more` split. Convert the large PNGs to WebP/AVIF. | `index.html`, `build.js` (`MORE` list), `styles-app.css` split | 2–5 days | Medium–high: LCP/INP on mid-range phones (Core Web Vitals are a ranking signal, and loading speed affects whether people stay on the page). |
| 11 | **Structured data cleanup.** Organization → `EducationalOrganization`: drop the placeholder `sameAs` (or add real profiles), add `address`/`contactPoint`, and fix `description`. Add `BreadcrumbList` on public pages. Add `Event` for Summer School editions with dates and places (from `summer_cohorts` and centres). Add `Place` on centre pages. On `/study/<lab>/courses`, give each Course a unique URL and wrap them in an `ItemList` if the Course-list carousel is wanted. | `index.html`, step-2 domain file, `lab-seo.php` | 1 day | Medium (understanding, knowledge panel, Event rich results). |
| 12 | **Social cards.** A 1200×630 `og:image` per section (home, summer, anchor, club, labs), emitted by step 2 so link-preview bots see it. | `assets/`, page-seo domain | half a day | Medium for sharing over WhatsApp, where much of this audience finds the site. |
| 13 | **Housekeeping.** 301 trailing-slash variants to the canonical form in `.htaccess`. Remove `/s-status` and `/v-status` from the sitemap, or keep them with `noindex` if they are thin. Add `<lastmod>` to the Lab URLs (from the content's version). Enable HSTS after confirming HTTPS. Capitalise "English" in the Lab title. | `.htaccess`, `sitemap.php`, `lab-seo.php` | 2 h | Low–medium. |
| 14 | **Measure.** Verify the domain in Google Search Console. Submit the sitemap. Use URL Inspection on `/about` and `/study/lab/learn/MC-001`. Watch Page indexing ("Duplicate, Google chose different canonical", "Soft 404") and Core Web Vitals. Add a test that fetches each indexable route's raw HTML and asserts: unique title, self canonical, ≥N words, and 404 for an unknown path. Put it in `test:all`. | `tests/seo-raw-html.test.js`, `package.json` | half a day | Stops these faults coming back unnoticed. |

### What should move first

Steps **1, 3 and 4** together are about one day and need no new rendering. Step **2** is the structural fix. Step **5** has to land with it, or Google still has nothing to follow. Steps 6–8 bring the content and speed.

## Files referenced

- `/home/user/nextgengen/index.html` (lines 14–56: shell head, canonical, Organization JSON-LD)
- `/home/user/nextgengen/.htaccess` (rewrite block: real-file rule before the sitemap rule; `ErrorDocument 404`)
- `/home/user/nextgengen/build.js:426` (copies the static `sitemap.xml` into `dist/`)
- `/home/user/nextgengen/robots.txt`, `/home/user/nextgengen/sitemap.xml`
- `/home/user/nextgengen/api/public/sitemap.php`, `/home/user/nextgengen/api/public/lab-page.php`, `/home/user/nextgengen/api/_lib/domain/lab-seo.php`
- `/home/user/nextgengen/app.jsx:42–128` (`ROUTES`), `:299–348` (`pageFromPath`), `:423–450` (client head management)
- `/home/user/nextgengen/components.jsx:695` (`TopNav`), `:1071` (`Footer`)
- `/home/user/nextgengen/page-blog.jsx:31–55`, `/home/user/nextgengen/page-centres.jsx:198–212`
- `/home/user/nextgengen/src/modules/tools/tools-core.jsx:244`, `/home/user/nextgengen/src/modules/mathslab/mlb-app.jsx:504–522`
