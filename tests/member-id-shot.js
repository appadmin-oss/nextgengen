#!/usr/bin/env node
/* ============================================================================
   The NGGC member ID, captured as artwork rather than as a screen.

   The card studio screenshot shows the studio. What anyone reviewing a print
   run needs to see is the CARD — at its real proportion, with a real name in
   the band and a real QR in the foot — because the things that go wrong are
   a name that will not fit, a printed ID that is blank, and disciplines that
   fell back to the track.

   So this mounts NggcMemberCard straight out of the built bundle at both
   physical sizes. No API, no router, no service worker.

     node tests/member-id-shot.js                       # fixture → docs/screens
     node tests/member-id-shot.js --file roster.json --out /tmp/id.png

   The fixture is the default deliberately. Rendering the real roster puts a
   child's name, printed ID and school on a PNG, so --file also wants --out
   pointing somewhere that is not the repository.

   Skips with a pass if playwright isn't installed, like the other E2E shots.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer, writeScreenIndex } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MEMBER_ID_PORT || 8251;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_member_id_fixture.html');
const FACE = path.join(ROOT, 'tests', '_member_id_face.png');

/* A made-up member with the properties that actually exercise the layout: a
   two-word given name, two disciplines, a level, and a printed ID in the
   roster's own format. */
const FIXTURE = [{
  displayId: '024-000', fullName: 'Example Member', level: 'B',
  disciplines: 'TECH,MEDIA', track: 'TECH', centre: 'Egbeda', cohort: '2024',
}];

function parseArgs(argv) {
  const o = { file: '', out: path.join(ROOT, 'docs', 'screens', '26-nggc-member-id.png'), pick: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') o.file = argv[++i];
    else if (argv[i] === '--out') o.out = path.resolve(argv[++i]);
    else if (argv[i] === '--pick') o.pick = argv[++i];   // displayId, else the first complete row
  }
  return o;
}

/** The member to draw: the one asked for, else the most completely filled in. */
function chooseMembers(opts) {
  if (!opts.file) return FIXTURE;
  const parsed = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
  const rows = (Array.isArray(parsed) ? parsed : parsed.members) || [];
  if (!rows.length) throw new Error('no members in ' + opts.file);
  if (opts.pick) {
    const hit = rows.find((m) => String(m.displayId) === opts.pick);
    if (!hit) throw new Error('no member with displayId ' + opts.pick);
    return [hit];
  }
  const score = (m) => ['fullName', 'displayId', 'level', 'disciplines', 'school', 'dob', 'email']
    .filter((k) => m[k]).length;
  return [rows.slice().sort((a, b) => score(b) - score(a))[0]];
}

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const members = chooseMembers(opts);

  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  member id: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>
  body { margin: 0; background: #eef1f6; font-family: Inter, system-ui, sans-serif; }
  .sheet { padding: 40px; display: inline-block; }
  h1 { font-size: 19px; color: #16223e; margin: 0 0 4px; }
  h1 + p { margin: 0 0 26px; color: #5b6478; font-size: 13px; max-width: 860px; line-height: 1.6; }
  .row { display: flex; gap: 40px; align-items: flex-start; }
  .lane { display: flex; flex-direction: column; }
  /* width:max-content, or the flex column stretches the card's own wrapper to
     the caption's width and the wallet card sits in a white slab. */
  .idcard { box-shadow: 0 18px 44px rgba(22,34,62,.20); border-radius: 4px; width: max-content; align-self: flex-start; }
  .cap { font-size: 12.5px; line-height: 1.5; color: #5b6478; margin-top: 12px; max-width: 360px; }
  .cap b { color: #16223e; display: block; font-size: 13.5px; margin-bottom: 2px; }
  .facts { margin-top: 10px; font-size: 12px; line-height: 1.7; color: #16223e; }
  .facts span { color: #5b6478; display: inline-block; min-width: 96px; }
</style>
</head><body><div id="shot"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/qrcode.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script>window.NGGApi = { admin: {}, public: {} };</script>
<script src="/dist/app.min.js"></script>
<script>
var SHOT_MEMBERS = ${JSON.stringify(members)};
var FACE_URL = ${JSON.stringify('__FACE__')};
var e = React.createElement;

/* A real QR, not a grey square: the foot of the card is half QR and a
   placeholder there hides whether the module size survives the wallet size. */
function qrDataUri(text) {
  try {
    var q = window.qrcode(0, 'M'); q.addData(String(text)); q.make();
    return 'data:image/svg+xml;base64,' + btoa(q.createSvgTag({ cellSize: 4, margin: 1, scalable: false }));
  } catch (err) { return ''; }
}

function Lane(p) {
  var m = p.member;
  return e('div', { className: 'lane' },
    e('div', { className: 'idcard' },
      e(window.NggcMemberCard, { member: m, size: p.size, qrUrl: qrDataUri('https://nextgengenius.org/m/' + (m.displayId || '')) })),
    e('div', { className: 'cap' }, e('b', null, p.title), p.note),
    p.facts ? e('div', { className: 'facts' }, [
      ['Printed ID', m.displayId], ['Level', m.level || '—'], ['Disciplines', m.disciplines || m.track || '—'],
      /* "Intake year", not "Cohort". On a MEMBER row the cohort field is the
         year they joined — where the printed ID's prefix comes from — while
         "cohort" everywhere else in this product means a Summer School
         EDITION. Same word, two meanings; the card spec uses the member's.
         (No backticks in this comment: it lives inside the template literal
         that builds the fixture page.) */
      ['Centre', m.centre || '—'], ['Intake year', m.cohort || '—'],
    ].map(function (r, i) { return e('div', { key: i }, e('span', null, r[0]), r[1]); })) : null);
}

function View() {
  var m = SHOT_MEMBERS[0];
  var withPhoto = Object.assign({}, m, { photoUrl: FACE_URL });
  return e('div', { className: 'sheet' },
    e('h1', null, 'NGGC member ID — ' + (m.displayId || '') + ' · ' + (m.fullName || '')),
    e('p', null, 'The same member row at both physical sizes, and with and without a headshot. '
      + 'The printed ID is the band under the photograph; the disciplines sit under the name with a hairline between them. '
      + 'The photo area is a fixed box, so the card composes the same way whether or not a member has a headshot on file — '
      + 'which matters here, because nobody imported from the members workbook has one.'),
    e('div', { className: 'row' },
      e(Lane, { member: withPhoto, size: 'a5', title: 'A5 · with a headshot',
        note: 'A portrait is cropped to the box, high rather than centred, because a passport-style photograph puts the face in the upper half.' }),
      e(Lane, { member: m, size: 'a5', title: 'A5 · no headshot — as imported', facts: true,
        note: 'The same layout with an empty box. Content measures exactly 210mm either way; it used to measure 223mm here and lose the footer off the bottom of the trim.' }),
      e(Lane, { member: m, size: 'wallet', title: 'Wallet · 54×85mm, no headshot',
        note: 'Lanyard size, where it mattered most: the footer used to overrun 85mm by 11.1mm with no margin to absorb it, and the QR was cut in half.' })));
}

window.nggcEnsureFonts()
  .catch(function () {})
  .then(function () {
    ReactDOM.createRoot(document.getElementById('shot')).render(e(View));
    document.body.setAttribute('data-ready', '1');
  });
</script></body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE);

    /* NggcMemberCard only accepts an http(s) photo (a data: URI is treated as
       "no photo"), so the drawn portrait has to exist as a served file.
       Drawn rather than fetched: the capture then has no network dependency
       and is byte-identical on every run. */
    const scratch = await browser.newPage();
    const dataUri = await scratch.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 708;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 708);
      g.addColorStop(0, 'hsl(210,30%,78%)'); g.addColorStop(1, 'hsl(214,26%,54%)');
      x.fillStyle = g; x.fillRect(0, 0, 900, 708);
      x.fillStyle = 'hsl(214,24%,30%)';
      x.beginPath(); x.ellipse(450, 750, 378, 269, 0, 0, 7); x.fill();
      x.fillStyle = 'hsl(28,42%,52%)';
      x.beginPath(); x.ellipse(450, 368, 180, 184, 0, 0, 7); x.fill();
      x.beginPath(); x.ellipse(450, 566, 108, 113, 0, 0, 7); x.fill();
      return c.toDataURL('image/png');
    });
    await scratch.close();
    fs.writeFileSync(FACE, Buffer.from(dataUri.split(',')[1], 'base64'));
    fs.writeFileSync(FIX, fs.readFileSync(FIX, 'utf8').replace('__FACE__', BASE + '/tests/' + path.basename(FACE)));
    const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 2 });
    page.on('console', (m) => { if (m.type() === 'error') console.log('    [page] ' + m.text()); });
    page.on('pageerror', (e) => console.log('    [page] ' + e.message));
    await page.goto(BASE + '/tests/_member_id_fixture.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-ready="1"]');
    await page.waitForTimeout(400);            // let the webfont swap settle
    const sheet = await page.$('.sheet');
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    await sheet.screenshot({ path: opts.out });
    const kb = Math.round(fs.statSync(opts.out).size / 1024);

    /* THE PHOTOGRAPH IS FULL BLEED, measured rather than eyeballed.
       It was 130mm wide on a 148mm card and 48mm on a 54mm one, leaving 9mm
       and 3mm of white down each side. A photo inset from the trim shows the
       cut, and 0.5mm of drift at the guillotine shows it unevenly — so this is
       a print defect, not a taste. Measured on both physical sizes, because
       they carry different padding and only one of them was ever checked. */
    const bleed = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.idcard')).map((card) => {
        const el = card.querySelector('img[alt=""], img[src^="data:image"]')
          || card.querySelector('div[style*="position: absolute"]');
        const c = card.getBoundingClientRect();
        const wrap = el && el.closest('div[style*="width"]');
        const r = (wrap || el || card).getBoundingClientRect();
        return { cardW: Math.round(c.width), left: Math.round(r.left - c.left),
                 right: Math.round(c.right - r.right) };
      });
    });
    const inset = bleed.filter((b) => b.left > 1 || b.right > 1);
    if (inset.length) {
      throw new Error('the photograph is inset from the card edge on ' + inset.length
        + ' of ' + bleed.length + ' card(s): ' + JSON.stringify(inset)
        + ' — it must bleed to the trim, with no white margin');
    }
    console.log('  ✓ the photograph bleeds to the trim on all '
      + bleed.length + ' card(s) — no white edge');
    console.log('  ✓ ' + path.basename(opts.out) + '  (' + kb + ' KB) — ' + members[0].displayId
      + (opts.file ? ' from ' + path.basename(opts.file) : ' (fixture)'));

    /* Fold into the screens index rather than beside it — but only for the
       fixture run. A capture of a real child does not belong in the repo, so
       it is not indexed and --out is expected to point outside it. */
    if (!opts.file && path.dirname(opts.out) === path.join(ROOT, 'docs', 'screens')) {
      const name = path.basename(opts.out, '.png');
      writeScreenIndex(path.join(ROOT, 'docs', 'screens'), [
        { name, label: 'NGGC member ID · both sizes, with and without a headshot on file', kb },
      ]);
    }
    await page.close();
  } finally {
    await browser.close();
    server.kill();
    if (!process.env.KEEP_FIXTURE) for (const f of [FIX, FACE]) { try { fs.unlinkSync(f); } catch (_) {} }
  }
  console.log('\n✅ PASS: member ID card rendered');
})().catch((e) => { console.error('❌ FAIL: ' + e.message); process.exit(1); });
