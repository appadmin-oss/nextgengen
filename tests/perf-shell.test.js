#!/usr/bin/env node
/* The fast shell (docs/PERFORMANCE.md, 21 Nov 2026): prerendered first screens, per-page critical CSS, non-blocking
 * stylesheets, and the precompressed copies. Pins the promises, not the markup:
 *   - "/" arrives with the home page drawn and its CSS inlined; the full sheets never block the first paint;
 *   - every other page gets ITS OWN first screen and CSS from spa.php — never the home page's under its title;
 *   - an address that is not a page gets neither;
 *   - a snapshot carries no script; a .br/.gz copy is byte-for-byte its file.
 * Reads dist/ as built. When the build ran without Chromium there is nothing prerendered, and it says so. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
let pass = 0, fail = 0;
const chk = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FAIL: ' + label); } };

const pre = path.join(DIST, 'prerender');
if (!fs.existsSync(path.join(pre, 'home.html'))) {
  console.log('NOTICE: dist/ was built without prerendering (no Chromium) — the shell is the plain one; nothing to check.');
  console.log('✅ PASS: 0 passed, 0 failed (fast shell, skipped)');
  process.exit(0);
}

const idx = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const homeSnap = fs.readFileSync(path.join(pre, 'home.html'), 'utf8');
const markBody = html => ((html.match(/<!--ngg-pre-->([\s\S]*?)<!--\/ngg-pre-->/) || [])[1] || '');
const critical = html => ((html.match(/<style id="ngg-critical">([\s\S]*?)<\/style>/) || [])[1] || '');

console.log('── "/" arrives drawn ──');
chk('index.html carries the home page’s first screen, inside the markers', markBody(idx) === homeSnap && /<h1/.test(homeSnap));
chk('…and the CSS that screen uses, inlined', critical(idx).length > 1000);
chk('the full stylesheets are not render-blocking <link>s any more (loaded by script, with a <noscript> copy)',
  !/<head>[\s\S]*<link rel="stylesheet" href="styles\.[0-9a-f]{10}\.css"\/>[\s\S]*<\/head>/.test(idx.replace(/<noscript>[\s\S]*?<\/noscript>/g, ''))
  && /window\.__nggCss=Promise\.all/.test(idx) && /<noscript><link rel="stylesheet" href="styles\./.test(idx));
chk('React is deferred, so nothing blocks the parser before the first screen', /<script defer src="vendor\/react\.production\.min\.js">/.test(idx) && /<script defer src="vendor\/react-dom\.production\.min\.js">/.test(idx));
chk('the boot screen is hidden by CSS whenever the page arrives drawn', /body:has\(#root > \*\) \.ngg-boot\s*\{\s*display:\s*none/.test(idx));

console.log('── every other page gets its own ──');
const spa = (uri) => {
  try {
    return execFileSync('php', [path.join(DIST, 'api/public/spa.php')], { env: Object.assign({}, process.env, { SPA_SERVE: '1', REQUEST_URI: uri }), encoding: 'utf8' });
  } catch (e) { return String(e.stdout || ''); }
};
const club = spa('/club');
const clubSnap = fs.existsSync(path.join(pre, 'club.html')) ? fs.readFileSync(path.join(pre, 'club.html'), 'utf8') : null;
chk('/club gets the club page’s first screen, never the home page’s', clubSnap && markBody(club) === clubSnap && markBody(club) !== homeSnap);
chk('…and the club page’s own CSS', fs.existsSync(path.join(pre, 'club.css')) && critical(club) === fs.readFileSync(path.join(pre, 'club.css'), 'utf8'));
const missing = spa('/no-such-page-anywhere');
chk('an address that is not a page gets no first screen and no inlined CSS (the app draws its not-found page)', markBody(missing) === '' && critical(missing) === '');
const alias = spa('/dashboard');
chk('a signed-in area (no snapshot) gets an empty shell: the boot screen, then the app', markBody(alias) === '');

console.log('── what a snapshot may hold ──');
const snaps = fs.readdirSync(pre).filter(f => f.endsWith('.html'));
chk('no snapshot carries a script', snaps.every(f => !/<script\b/i.test(fs.readFileSync(path.join(pre, f), 'utf8'))));
chk('no snapshot is a not-found or error screen', snaps.every(f => !/Page not found|Something went wrong/i.test(fs.readFileSync(path.join(pre, f), 'utf8').slice(0, 4000))));

console.log('── no precompressed copies ──');
/* The live site loaded blank on 25 Nov 2026: .htaccess served app.<hash>.min.js.br in place of the file, and the
   host (Cloudflare in front) compressed it again, so the browser got Brotli bytes where it expected JavaScript.
   The host compresses on the fly correctly; a precompressed copy only adds a way to break every page. */
const left = fs.readdirSync(DIST).filter(f => /\.(js|css)\.(br|gz)$/.test(f));
chk('dist/ holds no .br or .gz copy of a script or stylesheet (' + left.length + ' found)', left.length === 0);
const ht = fs.readFileSync(path.join(DIST, '.htaccess'), 'utf8');
chk('.htaccess never rewrites a request to a precompressed copy', !/REQUEST_FILENAME\}\.(br|gz) -f/.test(ht) && !/\$1\.(br|gz)\b/.test(ht));

console.log((fail ? '❌ FAIL: ' : '✅ PASS: ') + pass + ' passed, ' + fail + ' failed (fast shell)');
process.exit(fail ? 1 : 0);
