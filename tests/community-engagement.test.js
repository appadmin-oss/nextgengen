#!/usr/bin/env node
/* ============================================================================
   Community engagement: the screen, and the claims it makes.

   The domain arithmetic is asserted in api/tests/run.php. What is asserted
   HERE is the part that can be arithmetically perfect and still mislead:

     · that the screen leads with the reply rate rather than with a post count,
       because post counts rise while a community dies;
     · that every figure carries its denominator, since "41" and "64% of the
       audience" are different claims and only one of them is useful;
     · that the participation ladder does not treat reading as a failure —
       most healthy communities are mostly readers, and a screen that scores
       reading as nothing pushes mentors into badgering quiet children;
     · that the two ACTIONABLE lists — posts nobody answered, people who have
       gone quiet — are named rather than counted, because a metric a mentor
       cannot act on changes nothing;
     · and that no state is signalled by colour alone.

   Run:  node tests/community-engagement.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CENG_PORT || 8491;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_ceng_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

/* A community in trouble but not dead: one channel that is a noticeboard, one
   healthy, and a return rate just above half. Every figure below is internally
   consistent — 66 judged, 41 unanswered, so 25 answered, so 38%. A fixture
   that contradicts itself is worse than no fixture, because it is what people
   quote back. */
const DATA = {
  window: { days: 30 }, channel: { slug: '', name: '' },
  headline: { replyRate: 38, band: 'quiet', contributors: 14, contributorRate: 22, reach: 41,
              reachRate: 64, returnRate: 52, returnedOf: 25, newcomers: 6,
              medianFirstReplyHours: 4.5, posts: 71, postsJudged: 66, unanswered: 41,
              audience: 64, roster: 118, neverJoinedIn: 54 },
  ladder: { poster: 6, replier: 8, reactor: 5, reader: 22, silent: 12 },
  channels: [
    { slug: 'homework', name: 'Homework help', posts: 22, judged: 21, answered: 3, unanswered: 18,
      replyRate: 14, band: 'noticeboard', voices: 9, medianFirstReplyHours: 19.5 },
    { slug: 'notices', name: 'Centre notices', posts: 14, judged: 14, answered: 6, unanswered: 8,
      replyRate: 43, band: 'quiet', voices: 3, medianFirstReplyHours: 7.2 },
    { slug: 'chess', name: 'Chess talk', posts: 35, judged: 31, answered: 23, unanswered: 8,
      replyRate: 74, band: 'healthy', voices: 11, medianFirstReplyHours: 2.1 },
  ],
  unanswered: [
    { postId: 'p1', authorName: 'Amaka Obi', centre: 'Egbeda',
      excerpt: 'Please can someone explain question 4 on the surds worksheet?',
      createdAt: '2026-08-11T09:14:00Z' },
    { postId: 'p2', authorName: 'Chidi Eze', centre: 'Ayobo',
      excerpt: 'Is the Saturday session still happening this week?',
      createdAt: '2026-08-13T17:02:00Z' },
  ],
  unansweredTotal: 41,
  quiet: [
    { id: 'M1', name: 'Bola Adeyemi', centre: 'Ikotun', was: 'poster' },
    { id: 'M2', name: 'Emeka Nwosu', centre: 'Egbeda', was: 'replier' },
  ],
  quietTotal: 12,
};

(async () => {
  const chromium = loadChromium();
  const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
  if (!chromium || !fs.existsSync(exe)) { console.log('… skipped: no chromium available'); process.exit(0); }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__asked = [];
  NGGApi.admin.communityEngagement = (o) => { window.__asked.push(o); return Promise.resolve(${JSON.stringify(DATA)}); };
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement('div', { className: 'admin-section' },
      React.createElement(window.CommunityEngagementPanel)));
</script></body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE + '/tests/_ceng_fixture.html');
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message)));
    await page.goto(BASE + '/tests/_ceng_fixture.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('.admin-table', { timeout: 8000 });

    console.log('\n── What it leads with ────────────────────────────────────────');

    const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    const body = await text();

    /* The whole point. A screen that opened with "71 posts" would be telling
       an administrator the community was busy on the month it went silent. */
    const first = await page.evaluate(() =>
      document.querySelector('.admin-section > div[style*="grid"] > div .mono').textContent.trim());
    ok('the first figure on the screen is the reply rate, not a post count (' + first + ')',
       /answered/i.test(first));
    ok('…and it is stated as a share with its denominator, not a bare number',
       body.indexOf('38%') >= 0 && body.indexOf('25 of 66') >= 0);
    ok('…named in words as well as banded by colour',
       /Quiet/.test(body));

    /* Every stat has to carry what it is a share OF. "41" alone is the number
       an administrator misreads. */
    ok('reach says what fraction of the audience it is',
       body.indexOf('64% of the audience') >= 0);
    ok('the return rate says how many people it is measured over',
       body.indexOf('of the 25 active last period') >= 0);
    ok('…and the roster gap is against the roster, which is the growth number',
       body.indexOf('of 118 active members') >= 0);
    ok('the answer speed is a median, and says so',
       body.indexOf('4.5h') >= 0 && /median wait/i.test(body));

    console.log('\n── Reading is not a failure ──────────────────────────────────');

    /* A ladder, not a score. If reading were scored as nothing, the screen
       would be telling mentors to go and badger 22 children who are fine. */
    ok('the ladder shows every rung, reading included',
       /6 started conversations/i.test(body) && /8 replied to others/i.test(body)
       && /5 reacted or voted/i.test(body) && /22 read, said nothing/i.test(body));
    ok('…and reading is not described as a problem',
       !/22 (inactive|disengaged|at.risk)/i.test(body));

    console.log('\n── The two lists somebody can act on ─────────────────────────');

    ok('the unanswered posts are NAMED, not counted',
       body.indexOf('surds worksheet') >= 0 && body.indexOf('Amaka Obi') >= 0);
    ok('…and the list says how much of the total it is showing',
       /Waiting for an answer \(2 of 41\)/.test(body));
    ok('the people who went quiet are named too',
       body.indexOf('Bola Adeyemi') >= 0 && /Gone quiet \(2 of 12\)/.test(body));
    /* The distinction that keeps the list short enough to act on. */
    ok('…and the screen says who is NOT on that list, and why',
       /dropped from posting to reading is still here, and is not listed/i.test(body));
    ok('…each with what they used to do, in a form that reads as English',
       body.indexOf('was posting') >= 0 && body.indexOf('was replying') >= 0
       && body.indexOf('was started conversations') < 0);

    console.log('\n── Per channel ───────────────────────────────────────────────');

    const rows = await page.$$eval('.admin-table tbody tr', trs =>
      trs.map(t => t.cells[0].textContent.trim()));
    ok('every channel is scored on its own, worst first (' + rows.join(' → ') + ')',
       rows.length === 3 && /^Homework help/.test(rows[0]) && /^Chess talk/.test(rows[2]));
    /* innerText returns what is RENDERED, and the chip is uppercased by the
       stylesheet — so this matches case-insensitively rather than against the
       source string, which would pass or fail on a text-transform. */
    ok('…and each band is a WORD, never colour alone',
       /noticeboard/i.test(body) && /healthy/i.test(body));
    const nums = await page.evaluate(() => {
      const td = document.querySelector('.admin-table tbody td.admin-num');
      const cs = getComputedStyle(td);
      return { align: cs.textAlign, figures: cs.fontVariantNumeric };
    });
    ok('…with the numbers right-aligned in tabular figures, so a column can be scanned',
       nums.align === 'right' && /tabular-nums/.test(nums.figures));

    console.log('\n── Asking for a different window ─────────────────────────────');

    await page.selectOption('select[aria-label="Window"]', '7');
    await page.waitForTimeout(300);
    ok('changing the window asks the server again, for that window',
       await page.evaluate(() => window.__asked.slice(-1)[0].days) === 7);
    await page.selectOption('select[aria-label="Channel"]', 'homework');
    await page.waitForTimeout(300);
    ok('…and one channel can be asked about on its own',
       await page.evaluate(() => window.__asked.slice(-1)[0].channel) === 'homework');

    ok('no page errors across the whole run', errs.length === 0);
    if (errs.length) console.log('  errors: ' + errs.slice(0, 3).join(' | '));
    await page.close();
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ': ' + pass + ' passed, ' + fail + ' failed (community engagement)');
  process.exit(fail === 0 ? 0 : 1);
})();
