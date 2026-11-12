#!/usr/bin/env node
/* ============================================================================
   House promotions — the member's card, and the admin screen behind it.

   The audience for the card is 10–17 year olds, so what is worth testing is
   mostly what the feature REFUSES to do. Three properties matter more than any
   layout assertion, and each is easy to break later by accident:

     · It links to a page in this app. There is no anchor with an outside
       address anywhere in the card, and no field in the admin form to type
       one into. That is what keeps a house announcement from quietly becoming
       an ad slot pointed at children.
     · A dismissal is honoured immediately and the card goes. A child who says
       no should not have to say it twice.
     · An impression is counted when the card RENDERS, once — not on fetch, and
       not again on every re-render. A count that inflates makes a promotion
       nobody saw look like one that worked.

   Run:  node tests/promo-ui.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PROMO_PORT || 8229;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_promo_fixture.html');

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

/* What the server sends. Note there is no `ctaUrl` and no counting field —
   the shape the member gets is deliberately smaller than the row. */
const PROMO = {
  promoId: 'PR-ONE', title: 'Summer intake is open', body: 'Eight weeks, five centres, starts 6 July.',
  kind: 'programme', placement: 'chess', ctaLabel: 'See the programme', ctaPage: 'summer',
  ctaRef: '', imageUrl: '', accent: '',
};

const ADMIN_LIST = {
  ok: true,
  promos: [
    { promoId: 'PR-ONE', title: 'Summer intake is open', body: '', kind: 'programme', placement: 'chess',
      ctaLabel: 'See the programme', ctaPage: 'summer', ctaRef: '', imageUrl: '', accent: '',
      status: 'live', priority: 10, startsAt: '', endsAt: '',
      audience: { kinds: ['student'], centres: ['Egbeda'], programme: '' },
      impressions: 40, clicks: 6, dismissals: 2, ctr: 15, createdAt: '2026-06-01T09:00:00Z' },
    { promoId: 'PR-TWO', title: 'Saturday arena', body: '', kind: 'tournament', placement: 'community',
      ctaLabel: '', ctaPage: '', ctaRef: '', imageUrl: '', accent: '',
      status: 'draft', priority: 0, startsAt: '', endsAt: '',
      audience: { kinds: [], centres: [], programme: '' },
      // Three views is not a rate. The server withholds it; the table must too.
      impressions: 3, clicks: 1, dismissals: 0, ctr: null, createdAt: '2026-06-02T09:00:00Z' },
  ],
  placements: ['chess', 'community', 'dashboard', 'arcade'],
  kinds: ['programme', 'event', 'tournament', 'notice'],
  pages: ['community', 'club', 'summer', 'events', 'centres', 'blog', 'dashboard', 'anchor', 'contact', 'book'],
  centres: ['Egbeda', 'Ayobo'],
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  promo UI: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fbf7ed;padding:16px}</style>
</head><body class="cm-app"><div id="root" hidden></div><div id="fx"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script src="/dist/${manifest.more.file}"></script>
<script>
  window.__tracked = [];      // every promoTrack call, in order
  window.__went = [];         // every in-app navigation the card asked for
  window.__saved = null;
  window.__deleted = null;
  window.__promo = ${JSON.stringify(PROMO)};
  window.__fetches = 0;

  NGGApi.member.promo = (placement) => {
    window.__fetches++;
    return Promise.resolve({ ok: true, promo: window.__promo });
  };
  NGGApi.member.promoTrack = (promoId, event) => {
    window.__tracked.push(promoId + ':' + event);
    return Promise.resolve({ ok: true });
  };
  NGGApi.admin.promos.list = () => Promise.resolve(${JSON.stringify(ADMIN_LIST)});
  NGGApi.admin.promos.save = (d) => { window.__saved = d; return Promise.resolve({ ok: true, promoId: 'PR-NEW' }); };
  NGGApi.admin.promos.remove = (id) => { window.__deleted = id; return Promise.resolve({ ok: true }); };

  let root = null;
  window.__render = (what, props) => {
    // Its own mount: the bundle always mounts the whole app into #root, and two React roots on one
    // element race; whichever renders last wins (the app's 404 page, for this address).
    if (!root) root = ReactDOM.createRoot(document.getElementById('fx'));
    root.render(React.createElement(window[what], props));
  };
  window.__unmount = () => { if (root) { root.unmount(); root = null; } };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_promo_fixture.html', { waitUntil: 'networkidle' });

    /* ── The card a member sees ──────────────────────────────────────────── */

    await page.evaluate(() => window.__render('CmPromo', {
      placement: 'chess', onGo: (pg, ref) => window.__went.push(pg + (ref ? '#' + ref : '')),
    }));
    await page.waitForSelector('.cm-promo', { timeout: 8000 });

    chk('the card renders without a page error', errors.length === 0);
    chk('it says what it is before it says anything else',
        (await page.locator('.cm-promo-eyebrow').innerText()).toLowerCase().includes('programme'));
    chk('…and carries the headline and the line under it',
        (await page.locator('.cm-promo-h').innerText()) === 'Summer intake is open'
        && (await page.locator('.cm-promo-b').innerText()).includes('Eight weeks'));

    /* The property that keeps this first-party. Not "the URL is validated" —
       there is no URL. */
    chk('nothing in the card links off-site', await page.locator('.cm-promo').evaluate(
      el => Array.from(el.querySelectorAll('a')).every(a => !/^https?:/i.test(a.getAttribute('href') || ''))));

    chk('a screen reader is told this is an announcement, not the page content',
        (await page.locator('.cm-promo').getAttribute('aria-label') || '').toLowerCase().includes('announcement'));

    // ── Counting ──
    await page.waitForFunction(() => window.__tracked.length > 0, null, { timeout: 5000 });
    chk('rendering counts one impression', await page.evaluate(() => window.__tracked.join()) === 'PR-ONE:seen');

    // A re-render with the same promo is the same view, not a second one.
    await page.evaluate(() => window.__render('CmPromo', { placement: 'chess', onGo: (pg) => window.__went.push(pg) }));
    await page.waitForTimeout(300);
    chk('…and re-rendering the screen does not manufacture a second one',
        await page.evaluate(() => window.__tracked.filter(t => t === 'PR-ONE:seen').length) === 1);

    // ── The call to action ──
    const cta = page.locator('.cm-promo-cta');
    chk('the action is a button at a thumb-sized target, not a link to nowhere',
        await cta.evaluate(el => el.getBoundingClientRect().height >= 44));
    await cta.click();
    await page.waitForFunction(() => window.__went.length > 0, null, { timeout: 5000 });
    chk('tapping it goes to a page in this app', await page.evaluate(() => window.__went[0]) === 'summer');
    chk('…and counts the click',
        await page.evaluate(() => window.__tracked.indexOf('PR-ONE:click') >= 0));

    // ── Dismissal ──
    const x = page.locator('.cm-promo-x');
    chk('the dismiss control names what it hides rather than saying "close"',
        (await x.getAttribute('aria-label') || '').includes('Summer intake is open'));
    chk('…at 44px, so it is findable rather than furniture',
        await x.evaluate(el => { const r = el.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; }));
    await x.click();
    chk('a child who says no gets the card gone at once',
        await page.locator('.cm-promo').count() === 0);
    chk('…and the server is told, so they are not asked again tomorrow',
        await page.evaluate(() => window.__tracked.indexOf('PR-ONE:dismiss') >= 0));

    /* ── When there is nothing to say ────────────────────────────────────── */

    await page.evaluate(() => { window.__unmount(); window.__promo = null; });
    await page.evaluate(() => window.__render('CmPromo', { placement: 'chess', onGo: () => {} }));
    await page.waitForTimeout(400);
    chk('no promotion means no empty box on the screen',
        await page.locator('.cm-promo').count() === 0);

    // A promotion with no button is a notice, and must still render.
    await page.evaluate(() => {
      window.__unmount();
      window.__promo = { promoId: 'PR-NOTE', title: 'Centre closed on Monday', body: '',
                         kind: 'notice', ctaLabel: '', ctaPage: '', ctaRef: '', imageUrl: '', accent: '' };
    });
    await page.evaluate(() => window.__render('CmPromo', { placement: 'chess', onGo: () => {} }));
    await page.waitForSelector('.cm-promo', { timeout: 5000 });
    chk('a notice with nowhere to go renders as a notice, with no dead button',
        await page.locator('.cm-promo-cta').count() === 0
        && (await page.locator('.cm-promo-h').innerText()) === 'Centre closed on Monday');

    // A failing endpoint must not take the chess screen down with it.
    await page.evaluate(() => {
      window.__unmount();
      NGGApi.member.promo = () => Promise.reject(new Error('offline'));
    });
    await page.evaluate(() => window.__render('CmPromo', { placement: 'chess', onGo: () => {} }));
    await page.waitForTimeout(400);
    chk('an endpoint that fails leaves the screen it sits on alone',
        await page.locator('.cm-promo').count() === 0 && errors.length === 0);

    /* ── The admin screen ────────────────────────────────────────────────── */

    const wide = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const werrors = [];
    wide.on('pageerror', e => werrors.push(String(e)));
    await wide.goto(BASE + '/tests/_promo_fixture.html', { waitUntil: 'networkidle' });
    await wide.evaluate(() => window.__render('AdminPromos', {}));
    await wide.waitForSelector('.admin-table tbody tr', { timeout: 8000 }).catch(async e => { console.error('DEBUG admin promos:', (await wide.innerText('body')).slice(0, 700), werrors); throw e; });

    chk('the admin screen renders without a page error', werrors.length === 0);
    chk('every promotion is a row', await wide.locator('.admin-table tbody tr').count() === 2);
    chk('…with its counts beside it',
        (await wide.locator('.admin-table tbody tr').first().innerText()).includes('40'));
    chk('…and a click-through rate only where there is enough of it to mean something',
        (await wide.locator('.admin-table tbody tr').first().innerText()).includes('15%')
        && !(await wide.locator('.admin-table tbody tr').nth(1).innerText()).includes('%'));
    chk('a draft says so, rather than looking live',
        (await wide.locator('.admin-table tbody tr').nth(1).innerText()).toLowerCase().includes('draft'));
    chk('…and a draft offers Publish while a live one offers End',
        (await wide.locator('.admin-table tbody tr').nth(1).innerText()).includes('Publish')
        && (await wide.locator('.admin-table tbody tr').first().innerText()).includes('End'));
    chk('an untargeted promotion says "everyone" rather than leaving the column blank',
        (await wide.locator('.admin-table tbody tr').nth(1).innerText()).includes('everyone'));

    // The form.
    await wide.locator('button:has-text("Write a promotion")').click();
    await wide.waitForSelector('.trn-admin-wrap', { timeout: 5000 });
    chk('the form opens', await wide.locator('.trn-admin-wrap').count() === 1);

    /* The hard edge, stated as a property of the form: every destination on
       offer is a page in this app, and there is no free-text field to put an
       address into. */
    const opts = await wide.locator('.trn-admin-wrap select option').evaluateAll(
      els => els.map(e => e.getAttribute('value') || ''));
    chk('every destination on offer is a page in this app',
        opts.length > 1 && opts.every(v => !/[:/]/.test(v)));
    chk('…and there is no field anywhere to type an address into',
        await wide.locator('.trn-admin-wrap input[type="url"]').count() === 0);

    chk('Save is refused until there is a headline worth reading',
        await wide.locator('.cmm-cta').isDisabled());
    await wide.locator('.trn-admin-wrap input').first().fill('Mentor drive');
    chk('…and offered once there is', !(await wide.locator('.cmm-cta').isDisabled()));

    /* A new promotion is a DRAFT. Nothing reaches a child because somebody
       pressed Save while still writing. */
    await wide.locator('.cmm-cta').click();
    await wide.waitForFunction(() => window.__saved, null, { timeout: 5000 });
    const saved = await wide.evaluate(() => window.__saved);
    chk('a new promotion is saved as a draft, not published by pressing Save',
        saved.status === 'draft' && saved.title === 'Mentor drive');
    chk('…and it carries no outside address, because there is nowhere for one to come from',
        !Object.values(saved).some(v => typeof v === 'string' && /https?:\/\//i.test(v)));

    await wide.close();

    if (errors.length) console.log('  page errors: ' + errors.join(' | '));
    if (werrors.length) console.log('  admin page errors: ' + werrors.join(' | '));
    chk('no page errors across the whole run', errors.length === 0 && werrors.length === 0);
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (promo UI)');
  process.exit(failed ? 1 : 0);
})();
