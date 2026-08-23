#!/usr/bin/env node
/* ============================================================================
   The avatar, and the header row it sits in.

   A member who had uploaded a profile photo rendered as a 600×800 oval filling
   the whole feed. .cm-avatar-photo was written for the <img> and applied to
   the <span> wrapping it; being later in the stylesheet at equal specificity
   its `width: 100%` beat .cm-avatar's `width: 40px`, the span grew to the
   width of the row, the img inside had no rule at all and came out at its
   natural size, and .cm-avatar's `overflow: hidden` plus a pill radius clipped
   the result into an ellipse. The name-and-centre column beside it was
   squeezed to ZERO pixels, so "Egbe-Idimu" wrapped one character per line.

   It only ever happened to members WITH a photo — an avatar drawn from
   initials has no img and was always correct — and every fixture in this repo
   used `photo: ''`. So the whole suite was green while the community was
   unusable for exactly the people who had bothered to upload a picture.

   These are measurements, in a real browser, against the real stylesheet, on
   a deliberately extreme photo (600×800) and a deliberately long channel name.

   Run:  node tests/community-avatar.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CMAV_PORT || 8492;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_cmav_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

/* 3:4 portrait — the shape a phone camera produces, and the shape that made
   the bug so violent. Anything square would have hidden half of it. */
const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">'
  + '<rect width="600" height="800" fill="#4a7fd4"/>'
  + '<circle cx="300" cy="300" r="150" fill="#f2c9a0"/></svg>').toString('base64');

/* Every size cmAvatar is asked for, and the box each must end up in. */
const SIZES = [
  ['cm-avatar-sm', 30, 'a reply'],
  ['', 40, 'the roster'],
  ['cmm-msg-av', 40, 'a message in the feed'],
  ['cmm-av', 46, 'the profile row'],
  ['cmm-av-lg', 62, 'the profile header'],
];

const LONG_CHANNEL = 'AI Tools Application &amp; Digital Problem Solving';

(async () => {
  const chromium = loadChromium();
  const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
  if (!chromium || !fs.existsSync(exe)) { console.log('… skipped: no chromium available'); process.exit(0); }

  const avatars = SIZES.map(([cls, , where]) =>
    `<div class="probe" data-cls="${cls}" data-where="${where}">`
    + `<span class="cm-avatar ${cls} cm-avatar-photo" aria-hidden="true"><img src="${PHOTO}" alt=""></span>`
    + `</div>`).join('');

  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;padding:12px}.probe{margin:4px 0}</style>
</head><body class="cm-app">
${avatars}
<div class="cm-stream is-feed">
  <article class="cm-card cmm-msg is-card" id="card">
    <div class="cmm-msg-head">
      <span class="cm-avatar cmm-msg-av cm-avatar-photo" aria-hidden="true"><img src="${PHOTO}" alt=""></span>
      <div class="cmm-msg-meta">
        <span class="cmm-msg-name">Elizabeth A.</span>
        <span class="cmm-msg-time">3d · Egbe-Idimu</span>
      </div>
      <span class="cm-card-chan">🔬 ${LONG_CHANNEL}</span>
    </div>
    <div class="cmm-msg-body"><div class="cm-msg-text"><p>Here is the model I trained today.</p></div></div>
  </article>
</div>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE + '/tests/_cmav_fixture.html');

    for (const width of [360, 900]) {
      const page = await browser.newPage({ viewport: { width, height: 700 } });
      await page.goto(BASE + '/tests/_cmav_fixture.html', { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);

      console.log('\n── ' + width + 'px ──────────────────────────────────────────────────');

      /* The avatar is a fixed box at every size it is asked for, and the photo
         inside FILLS it rather than being clipped by overflow at whatever
         height the aspect ratio produced. */
      const boxes = await page.$$eval('.probe', ps => ps.map(p => {
        const s = p.querySelector('.cm-avatar'), i = p.querySelector('img');
        const r = s.getBoundingClientRect(), ir = i.getBoundingClientRect();
        return { cls: p.dataset.cls, where: p.dataset.where,
                 sw: Math.round(r.width), sh: Math.round(r.height),
                 iw: Math.round(ir.width), ih: Math.round(ir.height),
                 fit: getComputedStyle(i).objectFit };
      }));
      SIZES.forEach(([cls, px, where]) => {
        const b = boxes.find(x => x.cls === cls);
        ok('a photo avatar on ' + where + ' is ' + px + '×' + px
           + ' (' + b.sw + '×' + b.sh + ')', b.sw === px && b.sh === px);
        ok('…and the picture fills that box rather than overflowing it ('
           + b.iw + '×' + b.ih + ')',
           b.iw === px && b.ih === px && b.fit === 'cover');
      });

      /* The consequence that made the feed unreadable. The author's name and
         centre must get real width — this is the assertion that fails on the
         old stylesheet, at 0px. */
      const head = await page.evaluate(() => {
        const meta = document.querySelector('.cmm-msg-meta');
        const name = document.querySelector('.cmm-msg-name');
        const time = document.querySelector('.cmm-msg-time');
        const chan = document.querySelector('.cm-card-chan');
        const card = document.getElementById('card');
        const r = (e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; };
        return { meta: r(meta), name: r(name), time: r(time), chan: r(chan), card: r(card),
                 lineH: parseFloat(getComputedStyle(time).lineHeight) || 16,
                 docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      ok('the author block gets real width beside it (' + head.meta.w + 'px)',
         head.meta.w >= 120);
      /* One character per line is what a 0px column looks like. Measured as
         "the time line is a single line", which is what it must be. */
      ok('…so the time and centre read on one line, not one character per line ('
         + head.time.h + 'px tall, line-height ' + Math.round(head.lineH) + ')',
         head.time.h <= Math.round(head.lineH) + 2);
      ok('…and the name is not squeezed either (' + head.name.w + 'px)',
         head.name.w >= 90);

      /* The channel caption ran 32px off the right edge of a 390px phone with
         nothing to say it had been cut. */
      ok('the channel caption stays inside the card (' + head.chan.right + ' ≤ ' + head.card.right + ')',
         head.chan.right <= head.card.right + 1);
      ok('…and the page never scrolls sideways (' + head.docOverflow + 'px over)',
         head.docOverflow <= 0);

      await page.close();
    }
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ': ' + pass + ' passed, ' + fail + ' failed (community avatar)');
  process.exit(fail === 0 ? 0 : 1);
})();
