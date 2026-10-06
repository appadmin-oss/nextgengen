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
  'components.jsx',
  'table.jsx',
  'card-template.jsx',
  'page-home.jsx',
  'src/modules/qow/qow.jsx',
  'src/modules/idcards/ids-core.jsx',
  'src/modules/idcards/ids-ui.jsx',
  'src/modules/idcards/ids-member-back.jsx',
  'src/modules/idcards/ids-data.jsx',
  'src/modules/idcards/ids-print.jsx',
  'src/modules/idcards/ids-log.jsx',
  'src/modules/idcards/ids-make.jsx',
  'src/modules/idcards/ids-app.jsx',
  'page-about.jsx',
  'page-club.jsx',
  'page-anchor.jsx',
  'page-other.jsx',
  'page-centres.jsx',
  'src/modules/timetable/tt-core.jsx',
  'src/modules/timetable/tt-poster.jsx',
  'src/modules/timetable/tt-ui.jsx',
  'src/modules/timetable/tt-views.jsx',
  'src/modules/timetable/tt-layers.jsx',
  'src/modules/timetable/tt-app.jsx',
  'page-blog.jsx',
  'page-dashboard.jsx',
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
function fileTag(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex').slice(0, 10);
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

async function build() {
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  // Drift guard: the bundle ORDER and the <script type="text/babel"> tags in
  // index.html MUST list the same files in the same order, or the prod bundle
  // silently diverges from what dev runs. Fail the build if they don't match.
  validateOrderAgainstIndex();

  // The source treats classic-script top-level bindings (e.g.
  // `const { useState, useEffect } = React;` in components.jsx) as
  // globals that every later <script> tag can use. esbuild's bundler
  // wraps each module in a closure, which breaks that pattern. Instead
  // we transform each .jsx file individually (JSX → JS only) and
  // concatenate them in the same order index.html loads them. The
  // result is byte-equivalent to what babel-standalone produces at
  // runtime today, except already compiled and minified.

  const banner = `/* NGG bundle — generated by build.js. Do not edit by hand. */\n`;
  let combined = banner;
  const t0 = Date.now();
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
    combined += `\n;/* ── ${f} ─────────────────────────────────────────────────── */\n` + out.code;
  }

  // Final minification pass over the concatenated source, with a source map.
  const minified = await esbuild.transform(combined, {
    minify: true,
    target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
    legalComments: 'none',
    sourcemap: true,
    sourcefile: 'app.min.js',
  });

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
  const buildId = hashClientAssets(minified.code);

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
  const mapName = assets['app.min.js'] + '.map';
  const code = minified.code + `\n//# sourceMappingURL=${mapName}\n`;
  fs.writeFileSync(path.join(DIST, assets['app.min.js']), code);
  if (minified.map) fs.writeFileSync(path.join(DIST, mapName), minified.map);
  /* The plain name as well, and this one matters more than the other plain
     copies. dist/ is a drop-in deploy folder that is not wiped between builds
     and root files are not pruned, so the moment this stopped being written it
     froze at whatever the last pre-fingerprint build produced — leaving a
     dist/app.min.js that LOOKS current and serves last week's bundle to
     anything referencing it by name (the test fixtures do, and so would any
     bookmark or integration). A missing file 404s loudly; a stale one is the
     exact failure this whole change exists to prevent. */
  fs.writeFileSync(path.join(DIST, 'app.min.js'), code);

  /* The sibling classic scripts and the stylesheets: copied under a hashed
     name. Copied, not moved — the source tree keeps the plain names, which is
     what dev mode (in-browser Babel, no build step) loads. */
  const FINGERPRINTED = ['styles.css', 'styles-app.css', 'data.js', 'photos.js', 'api-client.js', 'outbox.js'];
  for (const f of FINGERPRINTED) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) continue;
    const body = fs.readFileSync(src);
    assets[f] = hashedName(f, fileTag(body));
    fs.writeFileSync(path.join(DIST, assets[f]), body);
  }

  const outSize = Buffer.byteLength(code);
  const gzSize = zlib.gzipSync(code).length;
  log(`compiled ${ORDER.length} files → ${assets['app.min.js']} (${(outSize / 1024).toFixed(1)} KB, ${(gzSize / 1024).toFixed(1)} KB gzip) build ${buildId} in ${Date.now() - t0}ms`);

  // Produce the production index.html: same head as dev (fonts, meta,
  // SEO, boot screen) but with the babel script removed and the .jsx
  // tags replaced by a single <script src="app.<hash>.min.js"> with defer.
  const dev = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let prod = dev;

  // Strip the Babel runtime + every JSX <script type="text/babel"> tag
  prod = prod.replace(/<script src="vendor\/babel\.min\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script type="text\/babel" src="[^"]+"><\/script>\s*/g, '');

  const A = (f) => assets[f] || f;
  // Insert the bundled scripts + a preload right after the React tags
  prod = prod.replace(
    /(<script src="vendor\/react-dom\.production\.min\.js"><\/script>\s*)/,
    `$1<link rel="modulepreload" href="${A('app.min.js')}"/>\n`
    + ['data.js', 'photos.js', 'api-client.js', 'outbox.js', 'app.min.js']
        .map(f => `<script defer src="${A(f)}"></script>`).join('\n') + '\n'
  );
  // Remove the now-duplicated data.js/photos.js/api-client.js script tags
  prod = prod.replace(/<script src="data\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script src="photos\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script src="api-client\.js"><\/script>\s*/g, '');
  prod = prod.replace(/<script src="outbox\.js"><\/script>\s*/g, '');
  // Point the stylesheet links at the fingerprinted copies.
  for (const css of ['styles.css', 'styles-app.css']) {
    prod = prod.split(`href="${css}"`).join(`href="${A(css)}"`);
  }

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
    'manifest.webmanifest', 'sitemap.xml', 'robots.txt',
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
  const cacheDir = path.join(DIST, 'api/_cache');
  if (fs.existsSync(cacheDir)) {
    for (const f of fs.readdirSync(cacheDir)) {
      if (f !== '.htaccess' && f !== '.gitkeep') fs.rmSync(path.join(cacheDir, f), { recursive: true, force: true });
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
  const current = new Set(Object.values(assets).concat(Object.values(assets).map(a => a + '.map')));
  let swept = 0;
  for (const f of fs.readdirSync(DIST)) {
    if (!/\.[0-9a-f]{10}\.(min\.)?(js|css)(\.map)?$/.test(f) || current.has(f)) continue;
    fs.rmSync(path.join(DIST, f), { force: true });
    swept++;
  }
  if (swept) log(`swept ${swept} fingerprinted file(s) from earlier builds`);

  // Build manifest — ops visibility + a machine-readable record of the deploy.
  // `assets` is the plain→fingerprinted map, which is what an operator needs to
  // answer "which bundle is this browser running" from a support report.
  const manifest = {
    buildId,
    builtAt: new Date().toISOString(),
    bundle: { file: assets['app.min.js'], bytes: outSize, gzipBytes: gzSize, files: ORDER.length },
    assets,
    node: process.version,
  };
  fs.writeFileSync(path.join(DIST, 'build-manifest.json'), JSON.stringify(manifest, null, 2));

  log(`dist/ ready (build ${buildId}) — drop the folder onto the host root and serve dist/index.html`);
}

// Ensure the compile ORDER and index.html's JSX <script> tags agree. A
// mismatch means the prod bundle would run different code than dev — a
// class of bug that is invisible until a specific page breaks in prod only.
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
