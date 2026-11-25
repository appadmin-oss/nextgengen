#!/usr/bin/env node
/* ================================================================
   NGG — production bundler.

   Compiles every .jsx file in load order into a single minified
   bundle (`dist/app.min.js`), writes a production index.html
   (`dist/index.html`) that ships React + the bundle only — no
   in-browser Babel compile.

   Use `node build.js` locally or in CI. Upload the contents of
   `dist/` plus the existing static assets (api/, assets/, *.css,
   data.js, photos.js, api-client.js, outbox.js, vendor/react*.js, robots.txt,
   sitemap.xml, manifest.webmanifest) to the host.

   Reads:  *.jsx (load order matches index.html script tags)
   Writes: dist/app.min.js, dist/app.min.js.map, dist/index.html

   Why this exists:
   On mobile, in-browser Babel was adding ~1.5s to the
   React-mount time. This bundler removes that cost without
   changing the source layout — every .jsx file remains
   readable and editable as JSX.
   ================================================================ */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// Match the script-tag order in index.html exactly. ESBuild bundles them
// into a single file — globals each script attaches to `window` stay
// available to later scripts.
const ORDER = [
  'chess-engine.jsx',
  'motion.jsx',
  'safety.jsx',
  'formation.jsx',
  'auth.jsx',
  'command.jsx',
  'tweaks-panel.jsx',
  'lesson-blocks.jsx',
  'components.jsx',
  'lesson-editor.jsx',
  'table.jsx',
  'card-photo.jsx',
  'card-template.jsx',
  'page-home.jsx',
  'src/modules/qow/qow.jsx',
  'src/modules/qow/qow-card.jsx',
  'src/modules/idcards/ids-core.jsx',
  'src/modules/idcards/ids-ui.jsx',
  'src/modules/idcards/ids-member-back.jsx',
  'src/modules/idcards/ids-av.jsx',
  'src/modules/idcards/ids-data.jsx',
  'src/modules/idcards/ids-print.jsx',
  'src/modules/idcards/ids-log.jsx',
  'src/modules/idcards/ids-make.jsx',
  'src/modules/idcards/ids-ask.jsx',
  'src/modules/idcards/ids-app.jsx',
  'src/modules/control/cr-core.jsx',
  'src/modules/control/cr-ui.jsx',
  'src/modules/control/cr-blocks.jsx',
  'src/modules/control/cr-layers.jsx',
  'src/modules/control/cr-pages.jsx',
  'src/modules/control/cr-tab-home.jsx',
  'src/modules/control/cr-tab-inbox.jsx',
  'src/modules/control/cr-tab-members.jsx',
  'src/modules/control/cr-tab-registration.jsx',
  'src/modules/control/cr-tab-security.jsx',
  'src/modules/control/cr-tab-programme.jsx',
  'src/modules/control/cr-tab-money.jsx',
  'src/modules/control/cr-tab-conduct.jsx',
  'src/modules/control/cr-tab-shop.jsx',
  'src/modules/learn/assign-desk.jsx',
  'src/modules/gate/face-check.jsx',
  'src/modules/tools/tools-core.jsx',
  'src/modules/tools/tools-more.jsx',
  'src/modules/tools/tools-labs.jsx',
  'src/modules/mathslab/phy-visuals.jsx',
  'src/modules/mathslab/eng-speak.jsx',
  'src/modules/mathslab/mlb-app.jsx',
  'src/modules/control/cr-tab-learning.jsx',
  'src/modules/control/cr-tab-publishing.jsx',
  'src/modules/control/cr-tab-system.jsx',
  'src/modules/control/cr-tab-wifi.jsx',
  'src/modules/control/cr-tab-support.jsx',
  'src/modules/control/cr-tab-analytics.jsx',
  'src/modules/control/cr-tab-mentors.jsx',
  'src/modules/control/cr-tab-mentorship.jsx',
  'src/modules/control/cr-tab-comms.jsx',
  'src/modules/control/cr-shell.jsx',
  'src/modules/control/cr-gate.jsx',
  'src/modules/control/cr-app.jsx',
  'page-about.jsx',
  'page-club.jsx',
  'page-anchor.jsx',
  'page-other.jsx',
  'page-shop.jsx',
  'page-apply.jsx',
  'page-mou.jsx',
  'page-centres.jsx',
  'src/modules/timetable/tt-core.jsx',
  'src/modules/timetable/tt-poster.jsx',
  'src/modules/timetable/tt-ui.jsx',
  'src/modules/timetable/tt-views.jsx',
  'src/modules/timetable/tt-layers.jsx',
  'src/modules/timetable/tt-myweek.jsx',
  'src/modules/timetable/tt-app.jsx',
  'page-blog.jsx',
  'page-dashboard.jsx',
  'src/modules/learn/lrn-exam.jsx',
  'page-learn.jsx',
  'src/modules/portal/member-results.jsx',
  'src/modules/dc/dc-runtime.jsx',
  'src/modules/mentor15/mp15-view.jsx',
  'src/modules/mentor15/mp15-formation.jsx',
  'src/modules/mentor15/mp15-registration.jsx',
  'src/modules/mentor15/mp15-class.jsx',
  'src/modules/mentor15/mp15-app.jsx',
  'src/modules/instructor6/ip6-view.jsx',
  'src/modules/instructor6/ip6-app.jsx',
  'src/modules/guide/guide.jsx',
  'src/modules/auth/mfa.jsx',
  'src/modules/support/support-desk.jsx',
  'src/modules/member9/mp9-view.jsx',
  'src/modules/member9/mp9-app.jsx',
  'src/modules/member9/mp9-more.jsx',
  'src/modules/club3/cp3-view.jsx',
  'src/modules/club3/sd3-view.jsx',
  'src/modules/club3/cp3-wifi.jsx',
  'src/modules/club3/cp3-meta.jsx',
  'src/modules/club3/cp3-directory.jsx',
  'src/modules/club3/cp3-app.jsx',
  'src/modules/summer3/ss3-view.jsx',
  'src/modules/summer3/ss3-app.jsx',
  'src/modules/community3/cm3-view.jsx',
  'src/modules/community3/cm3-app.jsx',
  'src/modules/family3/fp3-view.jsx',
  'src/modules/family3/fp3-data.jsx',
  'src/modules/family3/fp3-app.jsx',
  'page-family.jsx',
  'page-book.jsx',
  'page-analytics.jsx',
  'page-designer.jsx',
  'page-portals.jsx',
  'page-admin.jsx',
  'app.jsx',
];

function log(...a) { console.log('[build]', ...a); }

/* ── Fingerprinted asset names ───────────────────────────────────────────────
 * The entry files used to ship under fixed names — app.min.js, styles.css — and
 * freshness rested entirely on the service worker being network-first for them
 * plus a no-store header from .htaccess. Both are real, and both are things a
 * host, a proxy or a CDN in front of us can quietly override; when one does, a
 * browser serves last month's bundle against this month's API and there is
 * nothing in the response to tell it otherwise.
 *
 * A name that contains a hash of the file's own contents removes the question.
 * A changed file is a different URL the browser has never seen, so it MUST
 * fetch it; an unchanged file keeps its URL and can be cached for a year with
 * `immutable` and never revalidated at all. index.html is the only thing served
 * no-cache, and it is what points at the current names.
 *
 * Per-file hashes, not one build id across all of them: a CSS-only deploy
 * should not make every visitor re-download a 1.3MB bundle that did not change.
 */
/* A CACHE EPOCH mixed into every file's name. Fingerprinted files are served `immutable` for a year, so a
 * browser that once received a broken copy keeps it for as long as the name lasts. On 25 Nov 2026 every script and
 * stylesheet was served double-compressed (the precompressed copies; see .htaccess); a stylesheet whose content did
 * not change kept its name after the fix, and browsers went on using the unreadable copy they had stored — the site
 * drew unstyled. Bumping this renames every file at once, so no browser can reuse anything it holds. Bump it only
 * for that: any other change already renames the files it touches. */
const CACHE_EPOCH = 'e2-2026-11-25';
function fileTag(contents) {
  return crypto.createHash('sha256').update(CACHE_EPOCH).update(contents).digest('hex').slice(0, 10);
}
/** `styles.css` + a tag → `styles.4f2a1b9c33.css`. Multi-part extensions are
 *  kept intact so `app.min.js` becomes `app.<tag>.min.js`, not `app.min.<tag>.js`
 *  — the second would break the `.min.js` suffix matching that tooling and the
 *  .htaccess rules key on. */
function hashedName(name, tag) {
  const i = name.indexOf('.');
  return i === -1 ? `${name}.${tag}` : `${name.slice(0, i)}.${tag}${name.slice(i)}`;
}

/* Every file a browser may hold in a cache, hashed in a stable order.
   Sorted paths and path-plus-content (not content alone) so that renaming or
   removing a file changes the id just as much as editing one does. */
const CACHED_FILES = ['styles.css', 'styles-app.css', 'data.js', 'photos.js',
                      'api-client.js', 'outbox.js', 'manifest.webmanifest'];
const CACHED_DIRS = ['vendor', 'assets'];

function walkFiles(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

function hashClientAssets(bundleCode) {
  const h = crypto.createHash('sha256');
  h.update(CACHE_EPOCH);
  h.update(bundleCode);
  const files = [];
  for (const f of CACHED_FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) files.push(p);
  }
  for (const d of CACHED_DIRS) {
    const p = path.join(ROOT, d);
    if (fs.existsSync(p)) walkFiles(p, files);
  }
  for (const p of files.sort()) {
    h.update(path.relative(ROOT, p).split(path.sep).join('/'));
    h.update(fs.readFileSync(p));
  }
  return h.digest('hex').slice(0, 10);
}

/* ── What a public visitor does NOT download ───────────────────────────────
 * Files loaded only when somebody opens a signed-in area: the Control Room,
 * the ID Card Studio, every portal, analytics and the Design Studio — 57% of
 * the code. They ship as ONE second bundle (app-more), fetched by the router
 * the moment a route needs it (`nggNeedMore` in app.jsx), never on a public
 * page. Before this every visitor, on a phone on metered data, downloaded and
 * parsed the whole 5.7 MB to read the home page.
 *
 * Both bundles are classic scripts in global scope, exactly as dev runs each
 * file, so nothing is rewritten. What keeps it correct: core files may reach
 * a name in here only at RUN time (a route, or a `typeof X === "function"`
 * guard), never while loading — tests/bundle-split.test.js checks that
 * statically, and app.jsx loads the chunk and redraws if anything ever does. */
const MORE = [
  /^src\/modules\/idcards\//, /^src\/modules\/control\//, /^page-admin\.jsx$/,
  /^src\/modules\/mentor15\/(?!mp15-formation\.jsx$)/, /^src\/modules\/instructor6\//,
  /^src\/modules\/member9\//, /^src\/modules\/club3\//, /^src\/modules\/summer3\//,
  /^src\/modules\/community3\//, /^src\/modules\/family3\//, /^page-family\.jsx$/,
  /^page-analytics\.jsx$/, /^page-designer\.jsx$/, /^page-portals\.jsx$/, /^page-mou\.jsx$/,
];
const isMore = (f) => MORE.some((re) => re.test(f));
/* ── The STUDY bundle: public, but heavy and single-purpose ──────────────────
 * The Labs, study tools, timetable maker, Learn, the chess engine and lesson
 * blocks: 935 KB of source that every public visitor parsed to read the home
 * page (owner, 18 Nov 2026: "It is too heavy"). Tiered loading, as a game
 * streams a level: /study, /timetable and /learn fetch it (NGG_STUDY_ROUTES in
 * app.jsx); the signed-in bundle fetches it too. Core may reach a name in here
 * only at run time, behind a route or a typeof guard — tests/bundle-split.test.js
 * checks that, as it does for app-more. */
const STUDY = [
  /^src\/modules\/(mathslab|tools|timetable|learn)\//, /^page-learn\.jsx$/, /^chess-engine\.jsx$/,
  /^lesson-editor\.jsx$/, /^lesson-blocks\.jsx$/,
];
const isStudy = (f) => !isMore(f) && STUDY.some((re) => re.test(f));

async function build() {
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  // Drift guard: the bundle ORDER and the <script type="text/babel"> tags in
  // index.html MUST list the same files in the same order, or the prod bundle
  // silently diverges from what dev runs. Fail the build if they don't match.
  validateOrderAgainstIndex();
  exportRoutes();
  validateCssBraces();

  // The source treats classic-script top-level bindings (e.g.
  // `const { useState, useEffect } = React;` in components.jsx) as
  // globals that every later <script> tag can use. esbuild's bundler
  // wraps each module in a closure, which breaks that pattern. Instead
  // we transform each .jsx file individually (JSX → JS only) and
  // concatenate them in the same order index.html loads them. The
  // result is byte-equivalent to what babel-standalone produces at
  // runtime today, except already compiled and minified.

  const banner = `/* NGG bundle — generated by build.js. Do not edit by hand. */\n`;
  const t0 = Date.now();
  const parts = { core: banner, more: banner, study: banner };
  for (const f of ORDER) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const out = await esbuild.transform(src, {
      loader: 'jsx',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
      sourcefile: f,
    });
    parts[isMore(f) ? 'more' : isStudy(f) ? 'study' : 'core'] += `\n;/* ── ${f} ─────────────────────────────────────────────────── */\n` + out.code;
  }
  /* The chunk says it has arrived; the router waits for that, not for the
     script's load event alone, so a chunk that threw part-way is not taken
     for a loaded one. */
  parts.more += '\n;window.__nggMoreLoaded = true; if (window.__nggMoreReady) window.__nggMoreReady();\n';
  parts.study += '\n;window.__nggStudyLoaded = true; if (window.__nggStudyReady) window.__nggStudyReady();\n';

  // Final minification pass over each bundle, with a source map.
  const min = async (code, name) => esbuild.transform(code, {
    minify: true,
    target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
    legalComments: 'none',
    sourcemap: true,
    sourcefile: name,
  });
  const minified = await min(parts.core, 'app.min.js');
  const minMore = await min(parts.more, 'app-more.min.js');
  const minStudy = await min(parts.study, 'app-study.min.js');

  /* Content hash → the build id that busts the service-worker cache and
     stamps the HTML.
   *
   * Hashed over EVERY client-cacheable file, not just the JS bundle. When
   * this covered `minified.code` alone, a deploy that only touched CSS, an
   * image, a font or a vendored library produced an identical build id — so
   * dist/service-worker.js came out byte-identical, the browser saw no
   * service worker to update, the old caches were never treated as stale,
   * and the fetch handler kept serving those assets cache-first from the
   * previous deploy. Indefinitely. That is the other half of "my updates
   * aren't showing", and it was invisible because the JS almost always
   * changes too — right up until the one deploy where it doesn't.
   *
   * index.html is deliberately excluded: the id is stamped INTO it, so
   * including it would be circular, and it is served no-cache anyway.
   * api/ is excluded too — PHP is never client-cached, and letting a
   * backend-only change invalidate every browser's asset cache would be
   * churn for nothing. */
  const buildId = hashClientAssets(minified.code + minMore.code + minStudy.code);

  /* ── Fingerprint every entry file ────────────────────────────────────────
   * `assets` maps the name the source refers to → the hashed name shipped.
   * The bundle is hashed on its own bytes; the sibling scripts and the two
   * stylesheets on theirs, so a CSS-only deploy does not re-issue a 1.3MB
   * bundle nobody needs to download again.
   */
  const bundleTag = fileTag(minified.code);
  const assets = { 'app.min.js': hashedName('app.min.js', bundleTag) };

  // The map name goes in the bundle's sourceMappingURL, so it has to be
  // decided before the code is written.
  /* The source map does NOT ship. An 8 MB map served from the live site hands
     anyone the whole un-minified client, comments included. It is written
     beside the repo (.build/, ignored by git) for debugging a production stack
     trace, and the bundle carries no sourceMappingURL to go looking for it. */
  const mapName = assets['app.min.js'] + '.map';
  const code = minified.code + '\n';
  fs.writeFileSync(path.join(DIST, assets['app.min.js']), code);
  if (minified.map) {
    fs.mkdirSync(path.join(ROOT, '.build'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.build', mapName), minified.map);
  }
  for (const f of fs.readdirSync(DIST)) if (/\.map$/.test(f)) fs.rmSync(path.join(DIST, f), { force: true });
  /* The plain name as well, and this one matters more than the other plain
     copies. dist/ is a drop-in deploy folder that is not wiped between builds
     and root files are not pruned, so the moment this stopped being written it
     froze at whatever the last pre-fingerprint build produced — leaving a
     dist/app.min.js that LOOKS current and serves last week's bundle to
     anything referencing it by name (the test fixtures do, and so would any
     bookmark or integration). A missing file 404s loudly; a stale one is the
     exact failure this whole change exists to prevent. */
  fs.writeFileSync(path.join(DIST, 'app.min.js'), code);
  const codeMore = minMore.code + '\n';
  assets['app-more.min.js'] = hashedName('app-more.min.js', fileTag(minMore.code));
  fs.writeFileSync(path.join(DIST, assets['app-more.min.js']), codeMore);
  fs.writeFileSync(path.join(DIST, 'app-more.min.js'), codeMore);
  if (minMore.map) fs.writeFileSync(path.join(ROOT, '.build', assets['app-more.min.js'] + '.map'), minMore.map);
  const codeStudy = minStudy.code + '\n';
  assets['app-study.min.js'] = hashedName('app-study.min.js', fileTag(minStudy.code));
  fs.writeFileSync(path.join(DIST, assets['app-study.min.js']), codeStudy);
  fs.writeFileSync(path.join(DIST, 'app-study.min.js'), codeStudy);
  if (minStudy.map) fs.writeFileSync(path.join(ROOT, '.build', assets['app-study.min.js'] + '.map'), minStudy.map);

  /* The sibling classic scripts and the stylesheets: copied under a hashed
     name. Copied, not moved — the source tree keeps the plain names, which is
     what dev mode (in-browser Babel, no build step) loads. */
  const FINGERPRINTED = ['styles.css', 'styles-app.css', 'data.js', 'photos.js', 'api-client.js', 'outbox.js'];
  for (const f of FINGERPRINTED) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) continue;
    let body = fs.readFileSync(src);
    /* Stylesheets ship MINIFIED (owner, 7 Nov 2026: "optimise speed … low-end devices"). 1.9 MB of
       commented CSS was parsed on every first visit; a cheap phone pays for every byte twice, once on
       the wire and once in the style engine. The source keeps its comments for whoever edits it. The
       target matches the scripts', so no modern syntax is lowered or dropped. */
    if (f.endsWith('.css')) body = Buffer.from((await esbuild.transform(body.toString('utf8'), { loader: 'css', minify: true, target: ['chrome90', 'firefox88', 'safari14', 'edge90'], legalComments: 'none' })).code);
    assets[f] = hashedName(f, fileTag(body));
    fs.writeFileSync(path.join(DIST, assets[f]), body);
  }

  /* What a PUBLIC visitor's browser has to hold (owner, 18 Nov 2026: "It is too heavy … must work
     perfectly on low-end devices"). tools/css-split.js keeps every rule whose classes the public
     bundle's sources use (whole word, or a prefix they build names from) and drops rules only the
     signed-in areas use. Public pages link the slim sheet; the router swaps in the FULL sheet when
     the signed-in bundle loads (nggNeedMore), so signed-in screens keep exactly today's cascade.
     The same evidence trims Phosphor to the icons any source names. */
  {
    const { publicVocabulary, splitCss } = require('./tools/css-split.js');
    const coreSrc = ORDER.filter(f => !isMore(f)).concat(['data.js', 'photos.js', 'api-client.js', 'outbox.js', 'index.html'])
      .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
    const vocab = publicVocabulary(coreSrc);
    const full = fs.readFileSync(path.join(DIST, assets['styles-app.css']), 'utf8');
    const pub = Buffer.from(splitCss(full, vocab).pub);
    assets['styles-app-public.css'] = hashedName('styles-app-public.css', fileTag(pub));
    fs.writeFileSync(path.join(DIST, assets['styles-app-public.css']), pub);
    log(`  styles-app: ${(full.length / 1024).toFixed(0)} KB in full (signed-in areas), ${(pub.length / 1024).toFixed(0)} KB for public pages`);
    // Phosphor: only the icons some source names (icon names are often built from data, so every source counts).
    const words = new Set();
    (function walk(d) {
      for (const f of fs.readdirSync(d)) {
        if (/^(node_modules|dist|vendor|\.git|tests|\.build|journal)$/.test(f)) continue;
        const p2 = path.join(d, f), st = fs.statSync(p2);
        if (st.isDirectory()) walk(p2); else if (/\.(jsx|js|php|html|json)$/.test(f)) for (const m of fs.readFileSync(p2, 'utf8').matchAll(/[a-z][a-z0-9-]*/g)) words.add(m[0]);
      }
    })(ROOT);
    const ph = fs.readFileSync(path.join(ROOT, 'vendor/phosphor/phosphor.css'), 'utf8')
      .replace(/^\.ph(?:-fill)?\.ph-([a-z0-9-]+):before\s*\{[^}]*\}\s*/gm, (m, name) => words.has(name) || words.has('ph-' + name) ? m : '');
    // At the root, beside the other fingerprinted sheets (the vendor mirror would prune it); the font path is made absolute.
    /* The FONT, cut to the same icons (tools/phosphor-subset.py): the full Phosphor files are 147 KB and 132 KB and
       carry ~1,500 icons for the ~600 the site names. A subset is keyed by a hash of the font and the icon list, kept
       in vendor/phosphor/subset/ (committed), and made here when Python's fontTools is available — otherwise the
       full font ships and the build says so. The stylesheet and the font can never disagree: a subset is used only
       when one exists for exactly this list. */
    const cps = [...new Set([...ph.matchAll(/content:\s*["']\\([0-9a-f]{4,5})["']/gi)].map(m => m[1].toLowerCase()))].sort();
    const subsetDir = path.join(ROOT, 'vendor/phosphor/subset');
    const subsetFor = (font) => {
      const src = path.join(ROOT, 'vendor/phosphor', font);
      if (!cps.length || !fs.existsSync(src)) return null;
      const key = require('crypto').createHash('sha256').update(fs.readFileSync(src)).update(cps.join(',')).digest('hex').slice(0, 10);
      const base = font.replace(/\.woff2$/, '');
      const out = path.join(subsetDir, base + '.' + key + '.woff2');
      if (!fs.existsSync(out)) {
        fs.mkdirSync(subsetDir, { recursive: true });
        const list = path.join(require('os').tmpdir(), 'ngg-ph-' + key + '.txt');
        fs.writeFileSync(list, cps.join('\n'));
        const r = require('child_process').spawnSync('python3', [path.join(ROOT, 'tools/phosphor-subset.py'), src, out, list],
          { encoding: 'utf8', env: Object.assign({}, process.env, process.env.NGG_PYTHONPATH ? { PYTHONPATH: process.env.NGG_PYTHONPATH } : {}) });
        fs.rmSync(list, { force: true });
        if (r.status !== 0 || !fs.existsSync(out)) { log(`  phosphor: no subset of ${font} (fontTools unavailable) — shipping the full font`); fs.rmSync(out, { force: true }); return null; }
        // The previous subsets of this font are for an icon list nobody ships any more.
        for (const f of fs.readdirSync(subsetDir)) if (f.startsWith(base + '.') && f !== path.basename(out)) fs.rmSync(path.join(subsetDir, f), { force: true });
      }
      log(`  phosphor: ${font} ${(fs.statSync(src).size / 1024).toFixed(0)} KB → ${(fs.statSync(out).size / 1024).toFixed(0)} KB (${cps.length} icons)`);
      return '/vendor/phosphor/subset/' + path.basename(out);
    };
    const fontUrl = {};
    for (const font of ['Phosphor.woff2', 'Phosphor-Fill.woff2']) fontUrl[font] = subsetFor(font) || '/vendor/phosphor/' + font;
    /* vendor/VERSIONS.json records every file in vendor/ (tests/build.test.js): the subsets are recorded here, as they
       are made, and a subset no longer shipped is taken out — a hand-kept entry would go stale with every icon added. */
    {
      const vf = path.join(ROOT, 'vendor/VERSIONS.json');
      const v = JSON.parse(fs.readFileSync(vf, 'utf8'));
      const want = {};
      if (fs.existsSync(subsetDir)) for (const f of fs.readdirSync(subsetDir)) {
        const buf = fs.readFileSync(path.join(subsetDir, f));
        want['phosphor/subset/' + f] = { package: '@phosphor-icons/web', version: (v.files['phosphor/' + f.replace(/\.[0-9a-f]{10}\.woff2$/, '.woff2')] || {}).version || null,
          bytes: buf.length, sha256: require('crypto').createHash('sha256').update(buf).digest('hex'),
          note: 'subset of phosphor/' + f.replace(/\.[0-9a-f]{10}\.woff2$/, '.woff2') + ' to the icons the site names (tools/phosphor-subset.py, made by build.js)' };
      }
      let changed = false;
      for (const k of Object.keys(v.files)) if (k.startsWith('phosphor/subset/') && !want[k]) { delete v.files[k]; changed = true; }
      for (const [k, e] of Object.entries(want)) if (JSON.stringify(v.files[k]) !== JSON.stringify(e)) { v.files[k] = e; changed = true; }
      if (changed) {
        fs.writeFileSync(vf, JSON.stringify(v, null, 2) + '\n');
      }
    }
    const phMin = Buffer.from((await esbuild.transform(ph.replace(/url\(["']?\.\/(Phosphor[\w-]*\.woff2)["']?\)/g, (m, f) => 'url("' + (fontUrl[f] || '/vendor/phosphor/' + f) + '")'), { loader: 'css', minify: true, legalComments: 'none' })).code);
    assets['phosphor.css'] = hashedName('phosphor-used.css', fileTag(phMin));
    fs.writeFileSync(path.join(DIST, assets['phosphor.css']), phMin);
  }

  const outSize = Buffer.byteLength(code);
  const gzSize = zlib.gzipSync(code).length;
  log(`compiled ${ORDER.length} files → ${assets['app.min.js']} (${(outSize / 1024).toFixed(1)} KB, ${(gzSize / 1024).toFixed(1)} KB gzip) build ${buildId} in ${Date.now() - t0}ms`);
  const moreSize = Buffer.byteLength(codeMore), moreGz = zlib.gzipSync(codeMore).length;
  log(`  public visitors stop there; signed-in areas add ${assets['app-more.min.js']} (${(moreSize / 1024).toFixed(1)} KB, ${(moreGz / 1024).toFixed(1)} KB gzip) when opened`);
  const studySize = Buffer.byteLength(codeStudy), studyGz = zlib.gzipSync(codeStudy).length;
  log(`  the Labs, tools, timetable and Learn add ${assets['app-study.min.js']} (${(studySize / 1024).toFixed(1)} KB, ${(studyGz / 1024).toFixed(1)} KB gzip) when opened`);

  // Produce the production index.html: same head as dev (fonts, meta,
  // SEO, boot screen) but with the babel script removed and the .jsx
  // tags replaced by a single <script src="app.<hash>.min.js"> with defer.
  const dev = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let prod = dev;

  // Strip the Babel runtime + every JSX <script type="text/babel"> tag
  prod = prod.replace(/<script src="vendor\/babel\.min\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script type="text\/babel" src="[^"]+"><\/script>\s*/g, '');

  /* React and ReactDOM are DEFERRED like everything after them. They used to be plain blocking scripts in the
     head, so a phone parsed nothing else — not the boot screen, not the stylesheet's first paint — until 140 KB
     had arrived and run. Deferred scripts still run in document order, so React is ready before the bundle. */
  prod = prod.replace(/<script src="vendor\/react\.production\.min\.js"><\/script>/, '<script defer src="vendor/react.production.min.js"></script>');
  prod = prod.replace(/<script src="vendor\/react-dom\.production\.min\.js"><\/script>/, '<script defer src="vendor/react-dom.production.min.js"></script>');
  const A = (f) => assets[f] || f;
  // Insert the bundled scripts + a preload right after the React tags
  prod = prod.replace(
    /(<script defer src="vendor\/react-dom\.production\.min\.js"><\/script>\s*)/,
    /* `preload as="script"`, NOT `modulepreload`.
       The bundle is a classic script (`<script defer>`), and a
       modulepreload is fetched with module semantics — so the browser could
       not reuse it and downloaded the whole bundle a SECOND time. The
       browser's own Resource Timing said so: two entries, 4.97 MB each,
       one initiated by the link and one by the script tag. On a phone on
       metered data that is the single most expensive line in the build. */
    `$1<link rel="preload" as="script" href="${A('app.min.js')}"/>\n`
    /* Where the signed-in bundle is, for the router to fetch when a route needs
       it. A meta tag, not an inline script: the production CSP hashes every
       inline script, and this needs none. */
    + `<meta name="ngg-more" content="/${A('app-more.min.js')}"/>\n`
    + `<meta name="ngg-study" content="/${A('app-study.min.js')}"/>\n`
    + ['data.js', 'photos.js', 'api-client.js', 'outbox.js', 'app.min.js']
        .map(f => `<script defer src="${A(f)}"></script>`).join('\n') + '\n'
  );
  // Remove the now-duplicated data.js/photos.js/api-client.js script tags
  prod = prod.replace(/<script src="data\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script src="photos\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script src="api-client\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script src="outbox\.js"><\/script>\s*/g, '');
  // Point the stylesheet links at the fingerprinted copies.
  prod = prod.split('href="styles.css"').join(`href="${A('styles.css')}"`);
  // Public pages get the slim sheet; the full one is named for the router to swap in with the signed-in bundle.
  prod = prod.split('href="styles-app.css"').join(`href="${A('styles-app-public.css')}" id="ngg-app-css"`);
  prod = prod.replace(/(<meta name="ngg-more" content="[^"]+"\/>\n)/, `$1<meta name="ngg-more-css" content="/${A('styles-app.css')}"/>\n`);
  prod = prod.split('href="/vendor/phosphor/phosphor.css"').join(`href="/${A('phosphor.css')}"`);

  /* Where each page's prerendered first screen goes (tools/prerender.js; api/public/spa.php fills it per page).
     Empty until the prerender step runs; React's createRoot clears it on its first render. */
  prod = prod.replace('<div id="root"></div>', '<div id="root"><!--ngg-pre--><!--/ngg-pre--></div>');

  // Mark the build so we can spot which version a page is running
  prod = prod.replace(/<head>/, `<head>\n<meta name="ngg-build" content="${buildId}"/>`);

  fs.writeFileSync(path.join(DIST, 'index.html'), prod);
  log(`wrote dist/index.html`);

  // Copy through everything the prod HTML references. Keeps `dist/` a
  // self-contained drop-in deploy target.
  //
  // The PLAIN entry names ship as well as the fingerprinted ones. Nothing the
  // browser loads from index.html points at them any more, but a deep link, a
  // bookmarked script URL or an integration that hard-codes /api-client.js
  // would 404 without them, and a 404 there is a blank page. They are served
  // must-revalidate (see .htaccess) rather than immutable, because a fixed name
  // whose contents change is exactly the thing that cannot be cached — which is
  // the whole reason the hashed copies exist.
  const staticAssets = [
    'styles.css', 'styles-app.css',
    'data.js', 'photos.js', 'api-client.js', 'outbox.js',
    /* No static sitemap.xml: a real file is served before the .htaccess rewrite to
       api/public/sitemap.php, so a copied file hid the live 400-URL sitemap behind a
       stale 15-URL one (SEO audit, 8 Nov 2026). */
    'manifest.webmanifest', 'robots.txt', 'routes.json',
    'service-worker.js',
    '.htaccess',
  ];
  for (const f of staticAssets) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST, f));
    }
  }
  // Mirror the directories that contain bundled-but-not-built things.
  // Skip local-only artifacts (SQLite db, cache, rate-limit state, config).
  for (const dir of ['vendor', 'assets', 'api', 'journal', '.well-known', 'db']) {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) copyDir(src, path.join(DIST, dir));
  }

  // The Timetable Maker's landing, prerendered (served at /timetable/about by .htaccess).
  require('./src/modules/timetable/landing/tt-landing-build').buildTimetableLanding({ root: ROOT, dist: DIST, esbuild, log });

  // Second build target: the Anchor Journal PWA (its own bundle + shell).
  await buildJournal(buildId, assets);
  for (const junk of ['api/storage/ngg.db', 'api/storage/ngg.db-wal', 'api/storage/ngg.db-shm', 'api/config.php']) {
    const p = path.join(DIST, junk);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
  /* The PHP test suite is not part of the product. Shipped, api/tests/run.php
     is a script on the live host that builds a throwaway database and prints
     the codebase's internals — not something a web server should hold. */
  fs.rmSync(path.join(DIST, 'api', 'tests'), { recursive: true, force: true });
  /* Runtime data never ships: the cache, the logs, and anything in storage
     (photos, payment evidence, a database) belong to the server they were made
     on. A deploy carries only each folder's .htaccess, so unpacking it over a
     live site adds nothing there and replaces nothing there. */
  for (const d of ['api/_cache', 'api/logs', 'api/storage']) {
    const dir = path.join(DIST, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f !== '.htaccess' && f !== '.gitkeep') fs.rmSync(path.join(dir, f), { recursive: true, force: true });
    }
  }

  /* Stamp the service worker: the cache version, and the precache list rewritten
     to the fingerprinted names.
     The version alone was doing all the work before — it invalidated the old
     cache on the next visit, but the entries inside were fixed paths, so the
     worker still had to be trusted to revalidate them. Precaching the hashed
     names means a cache hit is BY DEFINITION the right file: the name says which
     bytes it is. */
  const swPath = path.join(DIST, 'service-worker.js');
  if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = 'ngg-${buildId}';`);
    for (const [plain, hashed] of Object.entries(assets)) {
      sw = sw.split(`'/${plain}'`).join(`'/${hashed}'`);
    }
    fs.writeFileSync(swPath, sw);
  }

  /* Sweep fingerprinted files from previous builds.
   *
   * dist/ is a drop-in deploy folder and root files are not pruned by the
   * directory mirror, so without this every build leaves another 1.3MB bundle
   * and 3MB map behind — a folder somebody FTPs up, growing by ~4MB a deploy
   * and full of dead files that look like live ones.
   *
   * Nothing references an old hashed name: index.html is served no-cache and
   * names the current set, so a reload always asks for these. The only window
   * where a stale one could be wanted is a deferred script fetch landing in the
   * seconds a deploy is being copied, which the plain names cover. */
  /* NO PRECOMPRESSED COPIES (25 Nov 2026). The build used to write a .br and a .gz beside every fingerprinted
     script and stylesheet, and .htaccess served them. On the live host (Cloudflare in front of the server) each
     copy was compressed a SECOND time on the way out: the browser undid one layer, was left with Brotli bytes
     where it expected JavaScript, and the site loaded blank. The host compresses on the fly, correctly, so the
     copies only ever added risk. The sweep below deletes any left in dist/; tests/perf-shell.test.js holds it. */
  const current = new Set(Object.values(assets).flatMap(a => [a, a + '.map']));   // a .br or .gz is never current
  let swept = 0;
  for (const f of fs.readdirSync(DIST)) {
    if (!/\.[0-9a-f]{10}\.(min\.)?(js|css)(\.map|\.br|\.gz)?$/.test(f) || current.has(f)) continue;
    fs.rmSync(path.join(DIST, f), { force: true });
    swept++;
  }
  if (swept) log(`swept ${swept} fingerprinted file(s) from earlier builds`);

  /* Prerender each public page's first screen into the shell (tools/prerender.js): a phone paints the page from
     HTML and CSS instead of waiting for the bundle to run. Then the CSS that first screen needs is inlined and the
     full sheets stop blocking the first paint (applyCriticalCss). Needs Chromium; without it the step says so and
     the shell ships as before. NGG_PRERENDER=0 skips it (a quick local build). It never fails the build. BEFORE
     the CSP is written, because the CSP hashes the inline script this adds. */
  if (process.env.NGG_PRERENDER !== '0') {
    try {
      const pr = await require('./tools/prerender.js').run();
      if (pr && pr.done && Object.keys(pr.done).length) applyCriticalCss(assets);
    } catch (e) { log('prerender skipped: ' + String(e && e.message || e).split('\n')[0]); fs.rmSync(path.join(DIST, 'prerender'), { recursive: true, force: true }); }
  } else fs.rmSync(path.join(DIST, 'prerender'), { recursive: true, force: true });   // no snapshot of last build's pages under this build's app

  writeProductionCsp();

  // Build manifest — ops visibility + a machine-readable record of the deploy.
  // `assets` is the plain→fingerprinted map, which is what an operator needs to
  // answer "which bundle is this browser running" from a support report.
  const manifest = {
    buildId,
    builtAt: new Date().toISOString(),
    bundle: { file: assets['app.min.js'], bytes: outSize, gzipBytes: gzSize, files: ORDER.filter(f => !isMore(f) && !isStudy(f)).length },
    more: { file: assets['app-more.min.js'], bytes: moreSize, gzipBytes: moreGz, files: ORDER.filter(isMore).length, list: ORDER.filter(isMore) },
    study: { file: assets['app-study.min.js'], bytes: studySize, gzipBytes: studyGz, files: ORDER.filter(isStudy).length, list: ORDER.filter(isStudy) },
    assets,
    node: process.version,
  };
  fs.writeFileSync(path.join(DIST, 'build-manifest.json'), JSON.stringify(manifest, null, 2));

  log(`dist/ ready (build ${buildId}) — drop the folder onto the host root and serve dist/index.html`);
}

// Ensure the compile ORDER and index.html's JSX <script> tags agree. A
// mismatch means the prod bundle would run different code than dev — a
// class of bug that is invisible until a specific page breaks in prod only.
/* A stylesheet with one unclosed brace is not an error to a browser: every
   rule after it is read as nested inside the open block. An `@media (pointer:
   coarse) {` lost its `}` once, and the whole Family Portal (and everything
   after it in styles-app.css) applied on touch screens only — a laptop got an
   unstyled page and nothing failed. Refuse to build a sheet like that. */
function validateCssBraces() {
  for (const f of ['styles.css', 'styles-app.css']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => m.replace(/[{}]/g, ' '));
    let depth = 0, line = 1, openedAt = 0;
    for (const c of src) {
      if (c === '\n') line++;
      if (c === '{') { if (depth === 0) openedAt = line; depth++; }
      if (c === '}') { depth--; if (depth < 0) { console.error(`[build] ${f}:${line} closes a brace that was never opened`); process.exit(1); } }
    }
    if (depth !== 0) { console.error(`[build] ${f}: a block opened at line ${openedAt} is never closed, so every rule after it is nested inside it`); process.exit(1); }
  }
}

/* The ROUTES registry (app.jsx), exported for the server: api/public/spa.php gives
   each public page its own title, description, canonical and robots in the raw HTML
   and answers an unknown address with a real 404. One registry, read twice — never a
   second list. The literal is evaluated as data; it may hold only plain values. */
function exportRoutes() {
  const src = fs.readFileSync(path.join(ROOT, 'app.jsx'), 'utf8');
  const a = src.indexOf('const ROUTES = ['), b = src.indexOf('\n];', a);
  if (a < 0 || b < 0) { console.error('[build] ROUTES registry not found in app.jsx'); process.exit(1); }
  const routes = new Function('return ' + src.slice(a + 'const ROUTES = '.length, b + 2))();
  const out = routes.map(r => ({ id: r.id, title: r.title || '', desc: r.desc || '', index: r.index !== false }));
  fs.writeFileSync(path.join(ROOT, 'routes.json'), JSON.stringify(out, null, 1) + '\n');
}

function validateOrderAgainstIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tags = [];
  const re = /<script type="text\/babel" src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) tags.push(m[1]);
  const a = JSON.stringify(ORDER), b = JSON.stringify(tags);
  if (a !== b) {
    console.error('[build] FATAL: build.js ORDER does not match index.html <script type="text/babel"> tags.');
    console.error('  ORDER     :', ORDER.join(', '));
    console.error('  index.html:', tags.join(', '));
    console.error('  → Update ORDER in build.js (or the tags in index.html) so they list the same files in the same order.');
    process.exit(1);
  }
}

// Compile the standalone Anchor Journal PWA: JSX → minified bundle, a
// Babel-free prod shell, and a build-stamped service worker. Runs as an
// independent target so the marketing bundle and the app never couple.
async function buildJournal(buildId, assets) {
  const srcDir = path.join(ROOT, 'journal');
  const outDir = path.join(DIST, 'journal');
  if (!fs.existsSync(path.join(srcDir, 'app.jsx'))) return;

  const src = fs.readFileSync(path.join(srcDir, 'app.jsx'), 'utf8');
  const jsx = await esbuild.transform(src, {
    loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    target: ['chrome90', 'firefox88', 'safari14', 'edge90'], sourcefile: 'journal/app.jsx',
  });
  const min = await esbuild.transform(jsx.code, {
    minify: true, target: ['chrome90', 'firefox88', 'safari14', 'edge90'], legalComments: 'none',
  });
  fs.writeFileSync(path.join(outDir, 'app.min.js'), min.code);
  const gz = zlib.gzipSync(min.code).length;

  // Prod shell: drop Babel + the JSX source tag, load the compiled bundle.
  let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  html = html.replace(/<script[^>]*src="\/vendor\/babel\.min\.js"[^>]*><\/script>\s*/g, '');
  html = html.replace(/<script type="text\/babel" src="\/journal\/app\.jsx"><\/script>\s*/g, '');
  html = html.replace(/(<script[^>]* src="\/api-client\.js"[^>]*><\/script>\s*)/, `$1<script defer src="/journal/app.min.js"></script>\n`);
  // The journal shell loads the shared API client too — point it at the
  // fingerprinted copy, or this one shell would keep the un-hashed name alive
  // and be the single page that can still run a stale client.
  if (assets && assets['api-client.js']) html = html.split('/api-client.js"').join('/' + assets['api-client.js'] + '"');
  html = html.replace(/<head>/, `<head>\n<meta name="ngg-build" content="${buildId}"/>`);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  // Stamp the app service worker's cache version so each deploy refreshes it.
  const swPath = path.join(outDir, 'sw.js');
  if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = 'aj-${buildId}';`);
    if (assets && assets['api-client.js']) sw = sw.split("'/api-client.js'").join("'/" + assets['api-client.js'] + "'");
    fs.writeFileSync(swPath, sw);
  }
  // The JSX source isn't needed in prod.
  fs.rmSync(path.join(outDir, 'app.jsx'), { force: true });
  log(`compiled journal PWA → journal/app.min.js (${(min.code.length / 1024).toFixed(1)} KB, ${(gz / 1024).toFixed(1)} KB gzip)`);
}

/* Mirror `src` onto `dst`, INCLUDING deletions.
 *
 * This used to copy over the top and never remove anything, so dist/ was a
 * union of every build ever run in the working tree: a renamed image, a
 * dropped vendored library or a deleted endpoint stayed in dist/ and kept
 * being deployed. Nothing failed, which is what made it easy to miss — the
 * site just carried files nobody could find in the repository any more, and
 * a "deleted" API endpoint remained live on the host.
 *
 * `keep` protects paths the build writes into dist/ deliberately and which
 * have no counterpart in the source tree. */
/* The production Content-Security-Policy.
 *
 * The root .htaccess allows 'unsafe-inline' and 'unsafe-eval' for scripts
 * because development compiles JSX in the browser with Babel, which needs
 * both. Production runs no Babel, so dist/.htaccess gets a policy without
 * either: each inline <script> in the shipped HTML is allowed by its SHA-256,
 * and each inline event handler (the font loader's onload, a print button) by
 * its hash under 'unsafe-hashes'. Computed from the built files, so an edit to
 * an inline script changes its hash here in the same build, never by hand.
 *
 * The vendors' own eval sites (pdf.js, jszip, docx, tui) are feature-detects
 * inside try/catch or polyfills only reached with a string argument; they fall
 * back cleanly when eval is refused. style-src keeps 'unsafe-inline': React
 * renders inline style attributes, and a stylesheet cannot run code. */
const CSP_PHP_HANDLERS = ['window.print()'];   // receipt and curriculum-document pages
/**
 * Critical CSS (docs/PERFORMANCE.md). Public pages blocked their first paint on two full stylesheets — 508 KB and
 * 318 KB — although the first screen uses a sliver of either. With every public page prerendered, the rules those
 * screens can use are known: the ones whose classes appear in the snapshots (tools/css-split.js, by evidence —
 * class-less rules, @font-face and @keyframes always kept). They are inlined in the head; the full sheets are added
 * by a small inline script, which a browser never lets block the first paint; app.jsx draws only once they have
 * loaded (window.__nggCss), so the app never renders a screen the inlined subset does not cover. <noscript> keeps
 * the plain links. The shell is shared by every route (spa.php), so the subset is the union of every snapshot.
 */
function applyCriticalCss(assets) {
  const { splitCss } = require('./tools/css-split.js');
  const preDir = path.join(DIST, 'prerender');
  const idxFile = path.join(DIST, 'index.html');
  let html = fs.readFileSync(idxFile, 'utf8');
  const sheets = [assets['styles.css'], assets['styles-app-public.css']].filter(Boolean);
  const sheetCss = sheets.map(f => fs.readFileSync(path.join(DIST, f), 'utf8'));
  const linkA = `<link rel="stylesheet" href="${assets['styles.css']}"/>`;
  const linkB = `<link rel="stylesheet" href="${assets['styles-app-public.css']}" id="ngg-app-css"/>`;
  if (!html.includes(linkA) || !html.includes(linkB)) { log('critical CSS not applied: stylesheet links not found'); return; }
  // The shell's own markup (header, boot screen) counts for every page; the home page's snapshot does not.
  const shellMarkup = html.replace(/<!--ngg-pre-->[\s\S]*?<!--\/ngg-pre-->/, '');
  const per = {}; let total = 0, n = 0;
  for (const f of fs.readdirSync(preDir).filter(x => x.endsWith('.html'))) {
    const vocab = { words: new Set(), prefixes: [] };
    for (const t of [fs.readFileSync(path.join(preDir, f), 'utf8'), shellMarkup])
      for (const m of t.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) vocab.words.add(c);
    const css = sheetCss.map(c => splitCss(c, vocab).pub).join('').replace(/<\/style/gi, '<\\/style');
    if (css.length > 120 * 1024) continue;   // too big to be worth inlining: that page keeps blocking sheets' timing
    const id = f.replace(/\.html$/, '');
    fs.writeFileSync(path.join(preDir, id + '.css'), css);
    per[id] = css; total += css.length; n++;
  }
  if (!per.home) { log('critical CSS not applied: no subset for the home page'); return; }
  const full = sheets.reduce((t, f) => t + fs.statSync(path.join(DIST, f)).size, 0);
  // The two blocking links become one non-blocking loader, in the same order (the cascade is unchanged).
  const loader = `<style id="ngg-critical">${per.home}</style>\n`
    + `<script>window.__nggCss=Promise.all(${JSON.stringify(sheets)}.map(function(h,i){return new Promise(function(r){var l=document.createElement("link");l.rel="stylesheet";l.href=h;if(i)l.id="ngg-app-css";l.onload=l.onerror=function(){r()};document.head.appendChild(l)})}));</script>\n`
    + `<noscript>${linkA}${linkB}</noscript>`;
  html = html.replace(linkA, '').replace(linkB, loader);
  fs.writeFileSync(idxFile, html);
  log(`critical CSS: ${n} page(s), ${(total / n / 1024).toFixed(0)} KB each on average inlined instead of ${(full / 1024).toFixed(0)} KB of blocking stylesheets`);
}

function writeProductionCsp() {
  const crypto = require('crypto');
  const sha = (t) => "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'";
  const scripts = new Set(), handlers = new Set(CSP_PHP_HANDLERS);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['api', 'vendor', 'node_modules'].includes(e.name)) walk(p); continue; }
      if (!/\.html$/.test(e.name)) continue;
      const html = fs.readFileSync(p, 'utf8');
      for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        const attrs = m[1] || '';
        if (/\ssrc=/.test(attrs) || /type="application\/(ld\+)?json"/.test(attrs)) continue;
        scripts.add(m[2]);
      }
      for (const m of html.matchAll(/\son[a-z]+="([^"]*)"/g)) handlers.add(m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    }
  };
  walk(DIST);
  const src = ["'self'"].concat([...scripts].map(sha), handlers.size ? ["'unsafe-hashes'"].concat([...handlers].map(sha)) : []).join(' ');
  const file = path.join(DIST, '.htaccess');
  const ht = fs.readFileSync(file, 'utf8');
  const next = ht.replace(/script-src 'self' 'unsafe-inline' 'unsafe-eval';/, `script-src ${src};`);
  if (next === ht) { console.error("[build] FAILED: dist/.htaccess has no development script-src to tighten"); process.exit(1); }
  fs.writeFileSync(file, next);
  log(`production CSP: ${scripts.size} inline script(s) and ${handlers.size} handler(s) allowed by hash; no unsafe-inline, no unsafe-eval`);
}

function copyDir(src, dst, keep) {
  keep = keep || new Set();
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });

  const wanted = new Set(fs.readdirSync(src, { withFileTypes: true }).map(e => e.name));
  for (const entry of fs.readdirSync(dst, { withFileTypes: true })) {
    if (wanted.has(entry.name)) continue;
    const stale = path.join(dst, entry.name);
    if (keep.has(path.relative(DIST, stale).split(path.sep).join('/'))) continue;
    fs.rmSync(stale, { recursive: true, force: true });
  }

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d, keep);
    else fs.copyFileSync(s, d);
  }
}

build().catch(err => { console.error('[build] FAILED:', err); process.exit(1); });
