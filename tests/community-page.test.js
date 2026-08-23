#!/usr/bin/env node
/* ============================================================================
   The community, as a PAGE.

   Every other test in this repo mounts one community component into a bare
   fixture. That is why a screenshot of the real thing was full of defects
   while the whole suite was green: a component rendered on its own never has
   a site nav above it, never has a viewport it can overflow, and is never
   handed the kind of picture a child's phone actually takes.

   So this one boots the REAL page — real bundle, real stylesheet, real
   AuthProvider, real router — and stubs only the network. The three things it
   caught, all measured rather than eyeballed:

     · A post photo had no height ceiling. Children post from phone cameras,
       so the pictures are portrait: a 1200×1600 rendered 892px tall on a
       900px laptop — 99% of the viewport — and a 9:16 phone shot would have
       been 132% of it. One photo was the whole screen.

     · The filter row measured 508px against a 390px phone, hid its scrollbar,
       cut "Saved" off at the edge and put "Yours" past it. A hidden scrollbar
       on a row that overflows is a filter nobody knows exists.

     · The wordmark's ink ran 42px OUTSIDE its own box on a phone, under the
       buttons beside it, while every box measurement said it fitted.

   Run:  node tests/community-page.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CMPAGE_PORT || 8493;
const BASE = 'http://127.0.0.1:' + PORT;

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

const img = (w, h, bg, fg) => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
  + `<rect width="${w}" height="${h}" fill="${bg}"/>`
  + `<circle cx="${w / 2}" cy="${h * 0.35}" r="${w * 0.22}" fill="${fg}"/></svg>`).toString('base64');
/* 3:4 — what a phone camera produces, and what made the feed a slideshow. */
const TALL = img(1200, 1600, '#2f7a45', '#e8f5ec');
/* 16:9 — fits inside the cap untouched, so nothing may claim it is cropped. */
const WIDE = img(1600, 900, '#2f7a45', '#e8f5ec');
const FACE = img(600, 800, '#4a7fd4', '#f2c9a0');

const CHANNELS = [
  { channelId: 'C1', slug: 'commons', name: 'The Commons', icon: '🏛️', color: '#3b5bdb', kind: 'club', unread: 3, description: '' },
  /* A real channel name from the product, and the one that broke the header. */
  { channelId: 'C2', slug: 'ai-tools', name: 'AI Tools Application & Digital Problem Solving', icon: '🔬', color: '#7048e8', kind: 'course', unread: 12, description: '' },
];
const author = (name, centre, photo, staff) => ({ name, centre, photo: photo || '', staff: !!staff, isMe: false, kind: 'member' });
const post = (o) => Object.assign({
  postId: 'p', kind: 'post', channel: CHANNELS[1], author: author('Elizabeth A.', 'Egbe-Idimu', FACE),
  body: '', mediaType: 'none', mediaUrl: '', createdAt: '2026-08-22T09:00:00Z',
  commentCount: 0, reactions: [], myReactions: [], bookmarked: false, stars: 0, starred: false,
  status: 'published', moderationNote: '' }, o);

const ME = { memberId: 'NGG-2025-0007', fullName: 'Amaka Obi', email: 'a@example.com',
             centre: 'Egbeda', role: 'member', type: 'NGG', status: 'active', photoUrl: FACE, track: 'Tech' };

function routesFor(media) {
  const POSTS = [
    post({ postId: 'p1', body: 'Here is the model I trained today.',
           mediaType: 'image', mediaUrl: media, altText: 'A chart', commentCount: 4 }),
    post({ postId: 'p2', author: author('Coach Bisi Adeyemi', 'Egbeda', '', true), channel: CHANNELS[0],
           body: 'Reminder: Saturday session moves to 10am.' }),
  ];
  return {
    'auth/me.php': { ok: true, member: ME, adminOk: false, impersonating: null },
    'member/community.php': (u) => {
      const v = u.searchParams.get('view');
      if (v === 'channels') return { ok: true, channels: CHANNELS };
      if (v === 'today') return { ok: true, unread: 16, mentions: 2, saved: 1 };
      if (v === 'digest') return { ok: true, posts: POSTS, stars: [] };
      if (v === 'feed') return { ok: true, posts: POSTS, hasMore: false, channel: null };
      return { ok: true };
    },
  };
}

async function openPage(browser, width, height, media) {
  const routes = routesFor(media);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const h = routes[u.pathname.replace(/^.*\/api\//, '')];
    const body = typeof h === 'function' ? h(u) : (h || { ok: true });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  /* The router reads location.pathname, so the clean URL has to be served the
     app shell — which is what the real host does. */
  await page.route('**/community', r => r.fulfill({
    status: 200, contentType: 'text/html',
    body: fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8') }));
  await page.goto(BASE + '/community', { waitUntil: 'networkidle' });
  await page.waitForSelector('.cmm-msg', { timeout: 10000 });
  await page.waitForTimeout(400);
  return { page, errs };
}

(async () => {
  const chromium = loadChromium();
  const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
  if (!chromium || !fs.existsSync(exe)) { console.log('… skipped: no chromium available'); process.exit(0); }

  /* dist/ IS the site root — index.html resolves every asset from '/'. */
  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', path.join(ROOT, 'dist')], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE + '/index.html');

    for (const [label, W, H] of [['phone 390×844', 390, 844], ['laptop 1280×900', 1280, 900]]) {
      console.log('\n── ' + label + ' ─────────────────────────────────────────');
      const { page, errs } = await openPage(browser, W, H, TALL);

      ok('the community page renders with no script error', errs.length === 0);
      if (errs.length) console.log('    ' + errs.slice(0, 2).join(' | '));

      const m = await page.evaluate(() => {
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; };
        const media = document.querySelector('.cm-msg-media img');
        const chips = document.querySelector('.cmm-chips');
        const brand = document.querySelector('.topnav .brand');
        let ink = 0;
        if (brand) {
          const rng = document.createRange(); rng.selectNodeContents(brand);
          Array.from(rng.getClientRects()).forEach(x => { if (x.right > ink) ink = x.right; });
          brand.querySelectorAll('*').forEach(e => { const x = e.getBoundingClientRect().right; if (x > ink) ink = x; });
        }
        return {
          vh: window.innerHeight,
          media: r(media),
          chipCount: document.querySelectorAll('.cmm-chip').length,
          chipsOver: chips ? chips.scrollWidth - chips.clientWidth : -1,
          chipsRight: chips ? Math.max(...Array.from(document.querySelectorAll('.cmm-chip'))
            .map(c => Math.round(c.getBoundingClientRect().right))) : -1,
          brand: r(brand), brandInk: Math.round(ink),
          docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          badge: !!document.querySelector('.cm-msg-media-more'),
        };
      });

      /* A feed shows more than one thing. 60% is the ceiling the stylesheet
         sets; the assertion is deliberately looser so a tweak to the cap does
         not fail it, but 99% never passes. */
      const pct = Math.round(m.media.h / m.vh * 100);
      ok('a portrait photo cannot take the whole screen (' + m.media.h + 'px = ' + pct + '% of the viewport)',
         pct <= 70);

      /* And the crop is recoverable, or it is just destruction. */
      ok('the photo is a real control that opens it whole',
         await page.evaluate(() => {
           const b = document.querySelector('.cm-msg-media-btn');
           return !!b && b.tagName === 'BUTTON' && (b.getAttribute('aria-label') || '').length > 8;
         }));

      /* Every filter is reachable. "Yours" was off the screen entirely. */
      ok('every filter chip is on the screen (' + m.chipCount + ' chips, ' + m.chipsOver + 'px hidden)',
         m.chipCount === 5 && m.chipsOver <= 0);
      ok('…and none of them is cut off at the edge (' + m.chipsRight + ' ≤ ' + W + ')',
         m.chipsRight <= W);

      /* The wordmark ran outside its own box, under the buttons beside it. */
      ok('the wordmark stays inside its own box (ink ' + m.brandInk + ' ≤ box ' + m.brand.right + ')',
         m.brandInk <= m.brand.right + 1);
      ok('…and the page never scrolls sideways (' + m.docOver + 'px over)', m.docOver <= 0);

      await page.close();
    }

    /* The badge must tell the truth. It says "tap to see it all", so it may
       only appear when there IS more to see. */
    console.log('\n── Does the crop badge tell the truth? ───────────────────────');
    for (const [label, W, H, media, expect] of [
      ['a portrait photo on a laptop is cropped', 1280, 900, TALL, true],
      ['a landscape photo is not', 1280, 900, WIDE, false],
      ['…nor is one that fits on a phone', 390, 844, WIDE, false],
    ]) {
      const { page } = await openPage(browser, W, H, media);
      const badge = await page.evaluate(() => !!document.querySelector('.cm-msg-media-more'));
      ok(label + ' — badge ' + (badge ? 'shown' : 'hidden'), badge === expect);
      await page.close();
    }
  } finally {
    await browser.close();
    srv.kill();
  }

  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ': ' + pass + ' passed, ' + fail + ' failed (community page)');
  process.exit(fail === 0 ? 0 : 1);
})();
