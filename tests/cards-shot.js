#!/usr/bin/env node
/* Volunteer ID cards, captured as artwork rather than as a screen.
 *
 * The card studio screenshot shows the studio — toolbars, filters, an export
 * panel — and the thing being judged is 200px wide inside it. What a reviewer
 * needs to see is the CARD, at print scale, next to the cases that decide
 * whether the centre identification actually works: a pale centre colour, a
 * centre colour a shade away from the tier frame around it, a name too long
 * for the band, and a volunteer with no single site.
 *
 * So this mounts the card components directly out of the built bundle with a
 * fixture roster, at the real 54×75mm proportion, and writes one PNG per view.
 * No API, no router, no service worker — same approach as the boards fixture.
 */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const PORT = process.env.CARDS_PORT || 8203;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_cards_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

/* Headshots. Real photographs are the point of a ring around a photograph —
 * an empty gradient frame flatters the design and hides whether the colour
 * still reads once there is a face inside it. Drawn rather than fetched so the
 * capture has no network dependency and is byte-identical on every run. */
const FACE = `function face(seed, w, h) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var x = c.getContext('2d');
  var hue = (seed * 47) % 360;
  var g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'hsl(' + hue + ',38%,74%)');
  g.addColorStop(1, 'hsl(' + ((hue + 40) % 360) + ',30%,52%)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // Shoulders, then a head — enough for the eye to read "portrait".
  x.fillStyle = 'hsl(' + ((hue + 200) % 360) + ',22%,32%)';
  x.beginPath(); x.ellipse(w / 2, h * 1.06, w * 0.42, h * 0.38, 0, 0, 7); x.fill();
  x.fillStyle = 'hsl(28,42%,' + (46 + (seed % 4) * 6) + '%)';
  x.beginPath(); x.ellipse(w / 2, h * 0.52, w * 0.20, h * 0.26, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(w / 2, h * 0.80, w * 0.12, h * 0.16, 0, 0, 7); x.fill();
  return c.toDataURL('image/png');
}`;

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  cards: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>
  body { margin: 0; background: #f3f5f9; font-family: Inter, system-ui, sans-serif; }
  .sheet { padding: 34px; display: inline-block; }
  .row { display: flex; gap: 26px; align-items: flex-start; }
  .cap { width: 100%; font-size: 12.5px; line-height: 1.5; color: #5b6478; margin-top: 10px; }
  .cap b { color: #16223e; display: block; font-size: 13.5px; margin-bottom: 2px; }
  .lane { display: flex; flex-direction: column; }
  h1 { font-size: 19px; color: #16223e; margin: 0 0 4px; }
  h1 + p { margin: 0 0 22px; color: #5b6478; font-size: 13px; max-width: 900px; line-height: 1.6; }
  .idcard { box-shadow: 0 18px 44px rgba(22,34,62,.20); border-radius: 6px; }
</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script>window.NGGApi = { admin: {}, public: {} };</script>
<script src="/dist/app.min.js"></script>
<script>
${FACE}
var PROGRAM = { program: 'NGG', year: '2026', motto: 'GROW', website: 'nextgengenius.org', phone: '+234 800 000 0000', widthMm: 54, heightMm: 75 };
/* The four cases that decide whether centre identity survives a print run,
   plus a student card so the two can be compared side by side. */
var VOLS = [
  { volunteerId: 'VOL-LED-26-001', displayId: 'VOL-LED-26-001', firstName: 'TUNDE', surname: 'BAKARE',
    role: 'Lead Mentor', tier: { name: 'Lead Mentor', code: 'LED', color: '#8A1538' }, token: 'V1',
    photoUrl: face(1, 900, 708), centre: { name: 'Egbeda', code: 'EG', color: '#D64545' },
    cap: ['Ordinary case — red centre, maroon tier frame', 'Red inside maroon measures 158 on a redmean scale — not near-identical, but close enough to merge at arm\\'s length, so both take a white keyline. Colour across the room, code and name in the hand.'] },
  { volunteerId: 'VOL-MEN-26-002', displayId: 'VOL-MEN-26-002', firstName: 'NGOZI', surname: 'EZE',
    role: 'Mentor', tier: { name: 'Mentor', code: 'MEN', color: '#00225F' }, token: 'V2',
    photoUrl: face(2, 900, 708), centre: { name: 'Ijaiye', code: 'IJ', color: '#2E7DD1' },
    cap: ['A centre that contrasts with its tier', 'No keyline needed — the gutter of white between band and frame is enough.'] },
  { volunteerId: 'VOL-INS-26-004', displayId: 'VOL-INS-26-004', firstName: 'AMAKA', surname: 'OKONJO',
    role: 'Instructor', faculty: 'Music', tier: { name: 'Instructor', code: 'INS', color: '#00225F' }, token: 'V4',
    photoUrl: face(4, 900, 708), centre: { name: 'Sunshine Annexe', code: 'SA', color: '#F7E36B' },
    cap: ['A pale centre colour', 'Ink is derived from the colour, not assumed white — this used to print white-on-yellow. The chip gains a hairline so it does not vanish into its own white border.'] },
  { volunteerId: 'VOL-MEN-26-005', displayId: 'VOL-MEN-26-005', firstName: 'CHIDI', surname: 'NWANKWO',
    role: 'Mentor', tier: { name: 'Mentor', code: 'MEN', color: '#00225F' }, token: 'V5',
    photoUrl: face(5, 900, 708), centre: { name: 'Ikotun-Egbe Community Hall', code: 'IEC', color: '#0A2A6E' },
    cap: ['A long name, and a centre a shade from its frame', 'The band scales the name to fit instead of running off the edge; the keyline separates two near-identical navies.'] },
  { volunteerId: 'VOL-MEN-26-003', displayId: 'VOL-MEN-26-003', firstName: 'ADAEZE', surname: 'OBI',
    role: 'Mentor', tier: { name: 'Mentor', code: 'MEN', color: '#00225F' }, token: 'V3',
    photoUrl: face(3, 900, 708), centre: null,
    cap: ['Works across every centre', 'Gets the programme mark rather than a hole — two card geometries in one run reads as a misprint, not as "works everywhere".'] },
];
var STUDENT = { studentId: 'SUM-2026-0141', displayId: 'NGG/26/0141', firstName: 'BLESSING', surname: 'ADEYEMI',
  track: 'Arts', token: 'S1', photoUrl: face(9, 900, 708), centre: { name: 'Egbeda', code: 'EG', color: '#D64545' } };

var e = React.createElement;
function Card(p) {
  var S = p.S || 1.0;
  return e('div', { className: 'lane', style: { width: 590 * S } },
    e(window.VolunteerCardFront, { card: p.card, S: S }),
    p.card.cap ? e('div', { className: 'cap' }, e('b', null, p.card.cap[0]), p.card.cap[1]) : null);
}
function View() {
  var q = new URLSearchParams(location.search);
  var v = q.get('v') || 'row';
  var S = Number(q.get('s') || 0.62);
  if (v === 'compare') {
    return e('div', { className: 'sheet' },
      e('h1', null, 'The same centre, on both card types'),
      e('p', null, 'A volunteer and a child from Egbeda. The volunteer card is framed by ROLE — that is what somebody is stopped and asked about — so the centre lives on the photo frame, the code chip and the foot band. The child\\'s card is framed by the centre itself. Both carry the colour, the code and the name, so one glance answers the same question on either.'),
      e('div', { className: 'row' },
        e('div', { className: 'lane', style: { width: 590 * S } },
          e(window.VolunteerCardFront, { card: VOLS[0], S: S }),
          e('div', { className: 'cap' }, e('b', null, 'Volunteer · Lead Mentor at Egbeda'), 'Maroon frame = role. Red frame, chip and band = centre.')),
        e('div', { className: 'lane', style: { width: 590 * S } },
          e(window.CardFront, { card: STUDENT, program: PROGRAM, S: S }),
          e('div', { className: 'cap' }, e('b', null, 'Child · Egbeda'), 'The same red, the same EG code, the same name band.')),
        e('div', { className: 'lane', style: { width: 590 * S } },
          e(window.CardBack, { card: VOLS[2], program: PROGRAM, S: S }),
          e('div', { className: 'cap' }, e('b', null, 'Volunteer card, back'), 'Faculty joins the role: "INSTRUCTOR" is the least identifying thing you can print at a site where every third person is one.'))));
  }
  if (v === 'lineup') {
    // What a lanyard rack looks like — the actual test of "obvious".
    return e('div', { className: 'sheet' },
      e('h1', null, 'Five volunteers, four centres — as they arrive at a gate'),
      e('p', null, 'The question this design has to answer from arm\\'s length: which of these people are mine? Centre colour on the photo frame and the foot band, centre code on the chip, centre name spelled out. Role stays the outer frame.'),
      e('div', { className: 'row' }, VOLS.map(function (c, i) { return e(Card, { key: i, card: c, S: S }); })));
  }
  return e('div', { className: 'sheet' },
    e('div', { className: 'row' }, VOLS.map(function (c, i) { return e(Card, { key: i, card: c, S: S }); })));
}
ReactDOM.createRoot(document.getElementById('root')).render(e(View));
</script></body></html>`);

  /* The studio itself, for the range controls. Same mount-the-bundle approach,
     with only the four calls CardStudio makes on load stubbed. */
  const STUDIO = path.join(ROOT, 'tests', '_studio_fixture.html');
  fs.writeFileSync(STUDIO, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#0b1327}</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script>
${FACE}
var PROGRAM = { program: 'NGG', year: '2026', motto: 'GROW', website: 'nextgengenius.org', phone: '+234', widthMm: 54, heightMm: 75 };
var CENTRES = [{ centreId: 'C1', name: 'Egbeda', code: 'EG', color: '#D64545' },
               { centreId: 'C2', name: 'Ijaiye', code: 'IJ', color: '#2E7DD1' }];
var CARDS = Array.from({ length: 24 }, function (_, i) {
  var n = i + 1;
  return { studentId: 'SUM-' + n, displayId: 'NGG/26/' + ('000' + n).slice(-4),
    firstName: ['ADAEZE','TUNDE','NGOZI','CHIDI','AMAKA','SEGUN','BLESSING','IFEOMA'][i % 8],
    surname: ['OBI','BAKARE','EZE','NWANKWO','OKONJO','ADEYEMI','ADEYEMI','UCHE'][i % 8],
    track: 'Arts', token: 'T' + n, photoUrl: face(n, 900, 900),
    enrolledAt: '2026-07-' + ('0' + (n % 26 + 1)).slice(-2) + 'T09:00:00Z',
    centre: n % 2 ? CENTRES[1] : CENTRES[0] };
});
function P(v) { return function () { return Promise.resolve(v); }; }
window.NGGApi = { admin: { registration: {
  cards: P({ program: PROGRAM, cards: CARDS }),
  centres: P({ centres: CENTRES }),
  volunteerCards: P({ program: PROGRAM, cards: [] }),
  hierarchy: P({ tiers: [{ tierId: 'T1', name: 'Mentor', code: 'MEN', color: '#00225F' }] }),
}, settings: { set: P({ ok: true }) } }, public: {} };
window.useAuth = function () { return { isSignedIn: true }; };
</script>
<script src="/dist/app.min.js"></script>
<script>ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.CardStudio));</script>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const shots = [];
  try {
    await waitForServer(BASE, 20000);
    const ctx = await browser.newContext({ viewport: { width: 2200, height: 1200 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();

    for (const [name, q, label] of [
      ['16-volunteer-id-lineup', 'v=lineup&s=0.60', 'Five volunteers, four centres — the arm\'s-length test'],
      ['17-volunteer-id-vs-student', 'v=compare&s=0.72', 'The same centre on a volunteer card and a child\'s card, plus the back'],
    ]) {
      await page.goto(BASE + '/tests/_cards_fixture.html?' + q, { waitUntil: 'networkidle' });
      await page.waitForSelector('.idcard', { timeout: 20000 });
      // Fonts and the drawn headshots both settle a frame late.
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForTimeout(600);
      const el = await page.$('.sheet');
      const file = path.join(OUT, name + '.png');
      await el.screenshot({ path: file });
      shots.push({ name, label, kb: Math.round(fs.statSync(file).size / 1024) });
      console.log('  ✓ ' + name + '.png  (' + shots[shots.length - 1].kb + ' KB) — ' + label);
    }

    /* One card on its own at full print scale, because the chip hairline and the
       band gutter are a few pixels and a contact sheet hides both. */
    await page.goto(BASE + '/tests/_cards_fixture.html?v=row&s=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('.idcard', { timeout: 20000 });
    await page.waitForTimeout(600);
    const one = await page.$('.lane');
    const f3 = path.join(OUT, '18-volunteer-id-detail.png');
    await one.screenshot({ path: f3 });
    shots.push({ name: '18-volunteer-id-detail', label: 'One card at full scale — keyline, chip and band', kb: Math.round(fs.statSync(f3).size / 1024) });
    console.log('  ✓ 18-volunteer-id-detail.png  (' + shots[shots.length - 1].kb + ' KB)');

    /* The range controls, mid-use: a date window applied, the slice counted
       against the batch, and the sentence about the cards a date range cannot
       speak about. */
    const sp = await ctx.newPage();
    await sp.setViewportSize({ width: 1500, height: 1250 });
    await sp.goto(BASE + '/tests/_studio_fixture.html', { waitUntil: 'networkidle' });
    await sp.waitForSelector('.card-pair', { timeout: 25000 });
    await sp.getByLabel('Print a range of cards').selectOption('date');
    await sp.getByLabel('Registered from').fill('2026-07-04');
    await sp.getByLabel('Registered to').fill('2026-07-10');
    await sp.waitForTimeout(900);
    const f4 = path.join(OUT, '19-cards-print-range.png');
    await sp.screenshot({ path: f4 });
    shots.push({ name: '19-cards-print-range', label: 'Printing a range — by date, by ID number, or card by card', kb: Math.round(fs.statSync(f4).size / 1024) });
    console.log('  ✓ 19-cards-print-range.png  (' + shots[shots.length - 1].kb + ' KB)');

    // Picking individually: every candidate still on screen, two ticked.
    await sp.getByLabel('Print a range of cards').selectOption('pick');
    await sp.waitForTimeout(600);
    await sp.getByLabel('Print NGG/26/0002').check();
    await sp.getByLabel('Print NGG/26/0005').check();
    await sp.waitForTimeout(700);
    const f5 = path.join(OUT, '20-cards-print-pick.png');
    await sp.screenshot({ path: f5 });
    shots.push({ name: '20-cards-print-pick', label: 'A reprint of two — the rest stay visible to pick from, and off the sheet', kb: Math.round(fs.statSync(f5).size / 1024) });
    console.log('  ✓ 20-cards-print-pick.png  (' + shots[shots.length - 1].kb + ' KB)');

    // Fold into the screens index rather than beside it.
    const idxFile = path.join(OUT, 'INDEX.json');
    let idx = [];
    try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch (_) {}
    const keep = Array.isArray(idx) ? idx.filter(s => !shots.some(n => n.name === s.name)) : [];
    fs.writeFileSync(idxFile, JSON.stringify(keep.concat(shots), null, 2) + '\n');
    console.log('\n' + shots.length + ' card view(s) in docs/screens/');
  } catch (e) {
    console.error('✗ ' + (e && e.message));
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_studio_fixture.html')); } catch (_) {}
  }
})();
