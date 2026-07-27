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
  } catch (e) {
    fail++; console.error('  ✗ harness error: ' + (e && e.message));
  } finally { cleanup(); }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (build cache-busting)');
  process.exit(fail ? 1 : 0);
})();
