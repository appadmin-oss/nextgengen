#!/usr/bin/env node
/* ============================================================================
   The Genius Star allowance (handoff §4: "2 left today").

   A mentor with an unlimited supply of stars gives one to everything, which
   makes them mean nothing, or gives them to the same two children every week,
   which is worse. The daily budget is what turns the action into recognition —
   and the handoff prints the remaining count right on the row, because a
   budget nobody can see is a budget nobody spends deliberately.

   The server owns the rule (api/tests/run.php). What is tested here is the
   part a mentor touches: that the number is on the row, that a spent row says
   it is spent instead of failing on the press, and that a refusal reaches them
   as a sentence rather than as an error code.

   Run:  node tests/community-stars.test.js
   Skips with a pass if playwright isn't installed, like the other E2E tests.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.STARS_PORT || 8247;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_stars_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

const POST = {
  postId: 'CP-1', body: 'I finished the zebra circuit and it actually ran.',
  kind: 'text', status: 'published', createdAt: '2026-08-24T09:12:00Z',
  author: { name: 'Tunde A.', centre: 'Egbeda', photo: '', staff: false, isMe: false, kind: 'member' },
  channel: { slug: 'commons', name: 'Commons' },
  reactions: {}, myReaction: '', commentCount: 2, bookmarked: false,
  stars: 0, starred: false, canStar: true, media: null,
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  Genius Stars: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fbf7ed}</style>
</head><body class="cm-app"><div id="root"></div><div id="toasts"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__post  = ${JSON.stringify(POST)};
  window.__calls = 0;
  window.__left  = null;      // what onStars was last told
  window.__fail  = null;      // { code, detail } to reject the next star with
  NGGApi.member.community.star = () => {
    window.__calls++;
    if (window.__fail) {
      const f = window.__fail; window.__fail = null;
      /* The real shape api-client throws: .message is the CODE, and the
         sentence arrives as .detail. */
      const err = new Error(f.code); err.code = f.code; err.detail = f.detail;
      return Promise.reject(err);
    }
    return Promise.resolve({ ok: true, stars: 1, starred: true, starsLeft: 1 });
  };
  let root = null, troot = null;
  window.__render = (props) => {
    if (!root) root = ReactDOM.createRoot(document.getElementById('root'));
    if (!troot) { troot = ReactDOM.createRoot(document.getElementById('toasts'));
                  troot.render(React.createElement(window.ToastHost)); }
    root.render(React.createElement(window.CmActionsSheetHost, Object.assign({
      post: window.__post, staff: true, starsLeft: 2,
      onStars: (n) => { window.__left = n; },
      onClose: () => {}, onPatch: () => {}, onRemove: () => {}, onOpenThread: () => {},
    }, props || {})));
  };
  window.__remount = () => { if (root) { root.unmount(); root = null; } };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_stars_fixture.html', { waitUntil: 'load' });

    const mount = async (props) => {
      await page.evaluate((p) => { window.__remount(); window.__render(p); }, props || null);
      await page.waitForSelector('.cmm-act-row', { timeout: 8000 });
    };
    const starRow = () => page.locator('.cmm-act-row', { hasText: 'Genius Star' });

    console.log('\n── The allowance is on the row ───────────────────────────────');

    await mount({ starsLeft: 2 });
    chk('the sheet renders with no script error', errors.length === 0);
    chk('the row prints what is left, in the design\'s own words',
        (await starRow().innerText()).replace(/\s+/g, ' ').includes('2 left today'));
    chk('…and it is a live control while there are any',
        await starRow().isEnabled());

    await starRow().click();
    await page.waitForTimeout(200);
    chk('pressing it gives one', await page.evaluate(() => window.__calls) === 1);
    chk('…and hands the new count back to whoever holds it, not into the post',
        await page.evaluate(() => window.__left) === 1);

    console.log('\n── When they are gone ────────────────────────────────────────');

    await page.evaluate(() => { window.__calls = 0; });
    await mount({ starsLeft: 0 });
    chk('a spent row says so rather than showing "0 left today"',
        (await starRow().innerText()).toLowerCase().includes('none left today'));
    /* A control that looks alive and does nothing is worse than one that
       admits it is spent — and a press that reaches the server only to be
       refused spends a round trip to say what the row already knew. */
    chk('…and it is off, so the press cannot fail instead',
        await starRow().isDisabled());
    await starRow().click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
    chk('…and nothing is asked of the server', await page.evaluate(() => window.__calls) === 0);

    console.log('\n── Taking one back ───────────────────────────────────────────');

    await mount({ starsLeft: 0, post: Object.assign({}, POST, { starred: true, stars: 1 }) });
    /* The star is already given, so the row is the way to undo it — and the
       allowance being spent must not lock a mentor out of correcting a
       misplaced tap. That would make never pressing the safe move. */
    chk('an already-starred post offers to take it back, even with none left',
        (await page.locator('.cmm-act-row', { hasText: 'Genius Star' }).innerText()).toLowerCase()
          .includes('take back'));
    chk('…and that row is live', await page.locator('.cmm-act-row', { hasText: 'Genius Star' }).isEnabled());

    console.log('\n── A refusal is a sentence ───────────────────────────────────');

    await mount({ starsLeft: 1 });
    await page.evaluate(() => {
      window.__fail = { code: 'no_stars_left',
        detail: 'You have given all 3 Genius Stars today. They come back tomorrow.' };
    });
    await starRow().click();
    await page.waitForSelector('.toast-error', { timeout: 4000 });
    const t = await page.locator('.toast-error').innerText();
    chk('the mentor is told how many and when they come back',
        /come back tomorrow/i.test(t));
    chk('…and never sees the error code', !/no_stars_left/.test(t));
    chk('…and the count is corrected to nothing left',
        await page.evaluate(() => window.__left) === 0);

    console.log('\n── Somebody who cannot give one ──────────────────────────────');

    await mount({ staff: false, starsLeft: 0 });
    chk('a member is offered no star row at all — it is not theirs to give',
        await page.locator('.cmm-act-row', { hasText: 'Genius Star' }).count() === 0);
    chk('…but the rest of the sheet is still theirs',
        await page.locator('.cmm-act-row', { hasText: 'Reply in thread' }).count() === 1);

    chk('nothing threw across the whole run' + (errors.length ? ': ' + errors[0] : ''),
        errors.length === 0);

    await page.close();
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (Genius Star allowance)');
  process.exit(failed === 0 ? 0 : 1);
})();
