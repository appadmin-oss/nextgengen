#!/usr/bin/env node
/* ============================================================================
   Build id / cache-busting contract.

   The service worker serves vendored libraries, fonts and images cache-first,
   and only ever purges them when CACHE_VERSION changes. build.js derives that
   version from the build id, so the id has to move whenever ANY client-cached
   file moves.

   It used to be a hash of the JS bundle alone. A deploy that changed only CSS,
   an image, a font or a vendored script produced the same id, so
   dist/service-worker.js came out byte-identical, the browser saw nothing to
   update, and every one of those assets kept being served from the previous
   deploy's cache — with no expiry to save it. The bug hid because the JS
   almost always changes too.

   Asserted here rather than by eye because the failure is silent: the build
   succeeds, dist/ looks right, and only a returning visitor sees the stale
   file.

   Run:  node tests/build.test.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
// Distinctive name: if this suite ever dies mid-run, the leftover is obvious
// and greppable rather than looking like a real asset.
const PROBE = path.join(ROOT, 'assets', '__buildhash_probe.tmp');
const DIST_PROBE = path.join(ROOT, 'dist', 'assets', '__buildhash_probe.tmp');

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ ' + l)); };

function buildId() {
  execSync('node build.js', { cwd: ROOT, stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8')).buildId;
}
function swVersion() {
  const sw = fs.readFileSync(path.join(ROOT, 'dist', 'service-worker.js'), 'utf8');
  const m = sw.match(/const CACHE_VERSION = '([^']*)';/);
  return m ? m[1] : '';
}

function cleanup() {
  // Both copies: the build mirrors assets/ into dist/, so a crash between the
  // two would otherwise leave the probe sitting in the deploy folder.
  for (const f of [PROBE, DIST_PROBE]) { try { fs.existsSync(f) && fs.unlinkSync(f); } catch (_) {} }
}
process.on('exit', cleanup);

(() => {
  if (fs.existsSync(PROBE)) { console.error('probe file already present — remove ' + PROBE); process.exit(2); }
  try {
    const base = buildId();
    const baseSw = swVersion();
    ok('the build id is stamped into the service worker (' + baseSw + ')', baseSw === 'ngg-' + base);

    // An asset-only change: no JS, no CSS, just a file under assets/.
    fs.writeFileSync(PROBE, 'cache-busting probe\n');
    const changed = buildId();
    ok('an asset-only change moves the build id (' + base + ' → ' + changed + ')', changed !== base);
    ok('…and the service worker version moves with it', swVersion() === 'ngg-' + changed);

    ok('the asset reached dist/', fs.existsSync(DIST_PROBE));

    // Removing it must move the id too — a deleted asset is as much a change
    // as an edited one, which is why the hash covers paths and not just bytes.
    fs.unlinkSync(PROBE);
    const restored = buildId();
    ok('removing it moves the id back (' + restored + ')', restored !== changed);
    ok('…and the build is deterministic: same tree, same id', restored === base);

    /* dist/ must MIRROR the source, deletions included. It used to only ever
       copy over the top, so dist/ accumulated every file that had ever
       existed in the tree — a renamed image, a dropped vendored library, a
       deleted API endpoint all stayed behind and kept being deployed. */
    ok('deleting the asset removes it from dist/ too', !fs.existsSync(DIST_PROBE));
    // The journal PWA's bundle and shell are GENERATED into dist/journal and
    // have no counterpart in the source tree — pruning must not eat them.
    for (const f of ['journal/app.min.js', 'journal/index.html', 'journal/sw.js']) {
      ok('pruning leaves the generated ' + f + ' alone', fs.existsSync(path.join(ROOT, 'dist', f)));
    }

    /* The service worker must never come between the app and /api/.
     *
     * Every live answer the app has comes through there — who is signed in,
     * which questions the registration form asks today, whether a child's
     * consent has been withdrawn. A cached copy of any of them is not a stale
     * page, it is the wrong answer served confidently, and the reporting
     * symptom is always the same: "I changed it and nothing happened."
     *
     * The API sets `no-store`, which handles the browser's HTTP cache. It does
     * NOT bind the Cache Storage API — a service worker can put a no-store
     * response in a cache and serve it back for as long as it likes. So the
     * guard has to be in the worker, and it has to come BEFORE anything that
     * could respond from a cache.
     */
    const sw = fs.readFileSync(path.join(ROOT, 'dist', 'service-worker.js'), 'utf8');
    const fetchAt = sw.indexOf("addEventListener('fetch'");
    const apiAt = sw.indexOf("'/api/'", fetchAt);
    const cacheAt = sw.search(/caches\.(match|open)|respondWith/);
    ok('the shipped service worker refuses to handle /api/ at all',
      fetchAt > -1 && apiAt > fetchAt && /startsWith\('\/api\/'\)\)\s*return/.test(sw));
    ok('…and bails out before it can answer from any cache',
      apiAt > -1 && cacheAt > -1 && apiAt < sw.indexOf('respondWith', fetchAt));

    /* ── Fingerprinted filenames ──────────────────────────────────────────
     * Freshness now rests on the NAME, not on the worker being trusted to
     * revalidate: a changed file is a URL the browser has never seen, so it
     * must fetch it. Everything below is what makes that true end to end, and
     * every one of them is a silent failure if it regresses — the build
     * succeeds and only a returning visitor sees last month's bundle.
     */
    const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));
    const TAGGED = /^[a-z-]+\.[0-9a-f]{10}\.(min\.)?(js|css)$/;
    const ENTRIES = ['app.min.js', 'styles.css', 'styles-app.css', 'data.js', 'photos.js', 'api-client.js', 'outbox.js'];

    ok('the manifest maps every entry file to a fingerprinted name',
      man.assets && ENTRIES.every(f => TAGGED.test(String(man.assets[f] || ''))));
    ok('…and each hashed file is actually in dist/',
      man.assets && ENTRIES.every(f => fs.existsSync(path.join(ROOT, 'dist', man.assets[f]))));
    // The point of the whole exercise: nothing the browser is TOLD to load has
    // a fixed name, because a fixed name is the thing that can go stale.
    ok('index.html references only the fingerprinted names',
      ENTRIES.every(f => html.includes(man.assets[f]))
      && !/(?:src|href)="(?:\.\/)?(app\.min\.js|styles\.css|styles-app\.css|data\.js|photos\.js|api-client\.js|outbox\.js)"/.test(html));
    ok('the service worker precaches the fingerprinted names, not the plain ones',
      ENTRIES.every(f => sw.includes("'/" + man.assets[f] + "'")));
    // The journal shell is the one other page that loads the shared client. It
    // was the gap: left plain, it would be the single surface still able to run
    // a stale api-client.js.
    const jHtml = fs.readFileSync(path.join(ROOT, 'dist', 'journal', 'index.html'), 'utf8');
    ok('the journal shell loads the fingerprinted api-client too',
      jHtml.includes(man.assets['api-client.js']) && !/src="\/api-client\.js"/.test(jHtml));
    // Plain copies still ship: something out there hard-codes them, and a 404
    // on a script tag is a blank page.
    /* The plain names still ship — and, crucially, are REWRITTEN each build.
       dist/ is a drop-in folder that is not wiped between builds and root files
       are not pruned, so a plain name that stopped being written would freeze at
       whatever the last build produced: a file that looks current and serves an
       old bundle to anything referencing it by name. A missing file 404s loudly;
       a stale one is the exact failure this whole change exists to prevent. */
    ok('the plain names still ship for anything that hard-codes them',
      ENTRIES.every(f => fs.existsSync(path.join(ROOT, 'dist', f))));
    ok('…and the plain bundle is the CURRENT bundle, not a leftover',
      fs.readFileSync(path.join(ROOT, 'dist', 'app.min.js'), 'utf8')
        === fs.readFileSync(path.join(ROOT, 'dist', man.assets['app.min.js']), 'utf8'));
    // …and fingerprinted files from earlier builds are swept, or dist/ grows by
    // ~4MB a deploy and fills with dead files that look like live ones.
    ok('fingerprinted files from earlier builds are swept',
      fs.readdirSync(path.join(ROOT, 'dist'))
        .filter(f => /^app\.[0-9a-f]{10}\.min\.js$/.test(f)).length === 1);
    // A hashed URL must never be caught by the network-first rule — its whole
    // value is that it never needs revalidating.
    ok('a hashed asset is served cache-first, and the plain name network-first',
      /FINGERPRINTED\s*=\s*\/\\\.\[0-9a-f\]\{10\}/.test(sw)
      && sw.indexOf('FINGERPRINTED.test') < sw.indexOf('NETWORK_FIRST.test'));
    // The .htaccess pair: immutable for hashed, revalidate for fixed.
    const ht = fs.readFileSync(path.join(ROOT, 'dist', '.htaccess'), 'utf8');
    ok('.htaccess serves hashed assets immutable, after the fixed-name rule',
      /\[0-9a-f\]\{10\}/.test(ht) && /max-age=31536000, immutable/.test(ht)
      && ht.lastIndexOf('no-cache, must-revalidate') < ht.indexOf('max-age=31536000, immutable')
        + ht.slice(ht.indexOf('max-age=31536000, immutable')).length);

    /* ── The precache must survive one bad entry ───────────────────────────
     * cache.addAll() is a single promise over the whole list, so ONE entry that
     * 404s rejects it and nothing at all is cached — leaving a worker that is
     * installed, active and holding an empty cache. The first offline
     * navigation then had no shell and answered 504 "Offline and not cached"
     * for an ordinary URL. */
    // Comments stripped first: the worker EXPLAINS why addAll is wrong, and
    // grepping the raw source for the name matches the explanation.
    const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('the precache tolerates a single failed entry instead of caching nothing',
      !/\.addAll\s*\(/.test(swCode) && /PRECACHE\.map\(/.test(swCode));
    /* And a navigation ALWAYS gets a document. Falling through to a 504 renders
       the browser's own error page over a working offline app. */
    ok('an offline navigation falls back to the shell, and never to a bare 504',
      /ignoreSearch/.test(sw) && /OFFLINE_HTML/.test(sw)
      && /shellResponse\(\)/.test(sw));
    /* ── vendor/ is identified, not just present ──────────────────────────
     * Eleven of the files in vendor/ are committed minified blobs with no
     * build step — React and Babel among them. Without a manifest there was no
     * recorded version, no integrity hash, and nothing that would notice one
     * being hand-edited: "are we exposed to CVE-X in jspdf?" was unanswerable
     * without reverse-engineering the file. VERSIONS.json pins every byte;
     * this keeps it honest, because a manifest that drifts from the files it
     * describes is worse than none — it reads as verified when it is not. */
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'VERSIONS.json'), 'utf8'));
    const listed = Object.keys(manifest.files || {});
    const walk = (dir, base) => fs.readdirSync(dir).sort().flatMap((n) => {
      const rel = base ? base + '/' + n : n;
      if (rel === 'VERSIONS.json') return [];
      return fs.statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n), rel) : [rel];
    });
    const onDisk = walk(path.join(ROOT, 'vendor'), '');
    ok('every file in vendor/ is listed in VERSIONS.json',
      onDisk.every((f) => listed.includes(f)) && listed.every((f) => onDisk.includes(f)));
    const mismatched = onDisk.filter((rel) => {
      const want = manifest.files[rel];
      if (!want) return true;
      const got = crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(ROOT, 'vendor', rel))).digest('hex');
      return got !== want.sha256;
    });
    ok('…and its recorded sha256 matches the bytes on disk', mismatched.length === 0);
    if (mismatched.length) console.error('    drifted: ' + mismatched.join(', '));
    /* Naming the package is required; naming the VERSION is not yet possible
       for five of them and has deliberately not been guessed. A wrong version
       in a manifest is worse than an absent one — it answers a security
       question confidently and incorrectly. */
    ok('every third-party file at least names its package',
      Object.entries(manifest.files).every(([, e]) => e.package || (e.note || '').includes('first-party')));

    /* ── Custom properties that do not exist ────────────────────────────────
       A `var(--c-line)` where the token is called `--c-border` is not a
       warning, an error, or a lint failure. The declaration is simply dropped
       and the element renders with no border — silently, on one screen, in one
       state, and usually the one nobody screenshots.

       This found ten of them at once: an entire screen's borders were missing
       because a token was invented rather than looked up. A fallback is always
       allowed — `var(--x, 14px)` is a deliberate default, not a typo — so only
       bare uses are checked. */
    const css = ['styles.css', 'styles-app.css']
      .filter(f => fs.existsSync(path.join(ROOT, f)))
      .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    const declared = new Set((css.match(/--[a-z0-9-]+\s*:/g) || []).map(x => x.replace(/\s*:$/, '')));
    /* A property can also be set from an inline style — `style={{ "--ki-i": i }}`
       is how a per-element animation delay is passed, and there is nowhere in
       the stylesheet for it to be declared. Those count as declared. */
    for (const f of fs.readdirSync(ROOT).filter(x => /\.(jsx|js)$/.test(x))) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of src.match(/["'](--[a-z0-9-]+)["']\s*:/g) || []) {
        declared.add(m.replace(/^["']|["']\s*:$/g, ''));
      }
    }
    const bare = [...new Set((css.match(/var\(\s*--[a-z0-9-]+\s*\)/g) || [])
      .map(x => x.replace(/^var\(\s*|\s*\)$/g, '')))].filter(v => !declared.has(v));
    ok('every custom property used without a fallback is actually declared', bare.length === 0);
    if (bare.length) console.error('    undeclared: ' + bare.join(', '));

  } catch (e) {
    fail++; console.error('  ✗ harness error: ' + (e && e.message));
  } finally { cleanup(); }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (build cache-busting)');
  process.exit(fail ? 1 : 0);
})();
