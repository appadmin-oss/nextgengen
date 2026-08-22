#!/usr/bin/env node
/* ============================================================================
   The composer — what it does when things go wrong.

   Three of these exist because the audit found the interface quietly failing
   at exactly the moments it mattered most:

     · A CRISIS REPLY was delivered by toast.error() — a red strip headed
       "Heads up", 6.5 seconds, two phone numbers as plain text, gone. It is
       the most important sentence this product ever says to anybody. It now
       gets a dialog that stays, numbers that dial, and the child's own words
       still in the box.

     · The @mention and slash menus were role="listbox" holding buttons, with
       nothing on the input saying a menu had opened. The highlight arrow keys
       move was invisible to anyone who could not see it.

     · The character counter rendered only on the aggregate views, so inside a
       channel maxLength stopped accepting keystrokes with no explanation.

   Run:  node tests/community-composer.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.COMPOSER_PORT || 8226;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_composer_fixture.html');

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

// What the server actually returns when the crisis gate fires, verbatim.
const CRISIS_REPLY =
  "This sounds bigger than anything a journal should hold on its own — and I'm really glad you said it. " +
  "Please talk to a trusted adult right now: a parent, a teacher, or your NGG mentor. If you're in danger, " +
  "call 112, or NGG safeguarding on +234 903 777 6318. You're not in trouble, and you're not alone.";

const CHANNELS = [
  { slug: 'commons', name: 'The Commons', icon: '🏛️', color: '#3b5bdb', unread: 0 },
  { slug: 'studio',  name: 'Studio · Music', icon: '🎵', color: '#2f9e44', unread: 0 },
];

const PEOPLE = [
  { handle: 'ada-n',  name: 'Ada',   centre: 'Egbeda', kind: 'member' },
  { handle: 'adaeze', name: 'Adaeze', centre: 'Ikeja', kind: 'student' },
  { handle: 'adamu',  name: 'Adamu',  centre: 'Egbeda', kind: 'mentor' },
];

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  community composer: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fff;padding-top:220px}</style>
</head><body class="cm-app"><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__mentionCalls = 0;
  window.__lastPost = null;
  window.__toasts = [];
  ['error', 'success', 'info', 'warn'].forEach(k => {
    const orig = toast[k].bind(toast);
    toast[k] = (body, title) => { window.__toasts.push({ kind: k, body: body }); return orig(body, title); };
  });
  // The composer talks to two endpoints. Stub both, so the test is about the
  // screen rather than about a database.
  NGGApi.member.community.mentions = (q) => {
    window.__mentionCalls++;
    const ql = String(q || '').toLowerCase();
    return Promise.resolve({ people: ${JSON.stringify(PEOPLE)}.filter(p => p.handle.indexOf(ql) === 0) });
  };
  NGGApi.member.community.post = (payload) => {
    window.__lastPost = payload;
    if (/kill myself/i.test(payload.body || '')) {
      const e = new Error('crisis'); e.code = 'crisis'; e.detail = ${JSON.stringify(CRISIS_REPLY)};
      return Promise.reject(e);
    }
    if (/boomtown/i.test(payload.body || '')) {
      const e = new Error('nope'); e.code = 'blocked'; e.detail = 'That post can\\'t be shared here.';
      return Promise.reject(e);
    }
    return Promise.resolve({ ok: true, queued: false, post: { postId: 'CP-NEW' } });
  };
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(window.CmComposer, {
      channels: ${JSON.stringify(CHANNELS)}, active: 'commons',
      me: { fullName: 'Test Member' }, onPosted: () => {}, enterToSend: false,
    })
  );
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_composer_fixture.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#cm-input-box', { timeout: 10000 });
    const box = page.locator('#cm-input-box');

    chk('the composer renders without a page error', errors.length === 0);

    /* ── The crisis reply ───────────────────────────────────────────────── */

    await box.fill('i want to kill myself');
    await page.locator('.cm-send-btn').click();
    await page.waitForSelector('.cm-crisis', { timeout: 5000 });

    chk('a crisis reply opens a dialog, not a toast',
        await page.locator('.cm-crisis').count() === 1
        && (await page.evaluate(() => window.__toasts.length)) === 0);
    chk('…announced as an alertdialog so it interrupts',
        await page.locator('.cm-crisis').getAttribute('role') === 'alertdialog');
    chk('…carrying the whole message the server sent',
        (await page.locator('#cm-crisis-b').innerText()).includes('+234 903 777 6318'));

    /* Two numbers, both dialable. Plain text is useless to a child on a phone. */
    const tels = await page.locator('.cm-crisis-call').evaluateAll(
      els => els.map(e => e.getAttribute('href')));
    chk('…and both helplines are tel: links a thumb can reach',
        tels.length === 2 && tels.includes('tel:112') && tels.includes('tel:+2349037776318'));
    chk('…each at least 44px tall', await page.locator('.cm-crisis-call').evaluateAll(
      els => els.every(e => e.getBoundingClientRect().height >= 44)));

    /* It does not go away on its own, and not by accident either. */
    await page.waitForTimeout(7000);   // longer than toast.error's 6.5s ttl
    chk('…it is still there after the toast timeout would have cleared it',
        await page.locator('.cm-crisis').count() === 1);
    await page.keyboard.press('Escape');
    chk('…Escape does not dismiss it', await page.locator('.cm-crisis').count() === 1);

    chk('…and the message is still in the box, not thrown away',
        (await box.inputValue()) === 'i want to kill myself');

    await page.locator('.cm-crisis-x').click();
    chk('…the button does dismiss it', await page.locator('.cm-crisis').count() === 0);

    /* An ordinary refusal is still a toast — the dialog is for the one case. */
    await box.fill('boomtown');
    await page.locator('.cm-send-btn').click();
    await page.waitForFunction(() => window.__toasts.length > 0, null, { timeout: 5000 });
    chk('an ordinary rejection stays a toast, and opens no dialog',
        await page.locator('.cm-crisis').count() === 0
        && (await page.evaluate(() => window.__toasts[0].kind)) === 'error');

    /* ── The mention menu is a real combobox ────────────────────────────── */

    chk('the input reports itself as a combobox',
        await box.getAttribute('role') === 'combobox');
    chk('…and says no popup is open to begin with',
        await box.getAttribute('aria-expanded') === 'false');

    await box.fill('hello @ad');
    await page.waitForSelector('.cm-mention-menu [role="option"]', { timeout: 5000 });
    chk('typing @ opens the menu and the input says so',
        await box.getAttribute('aria-expanded') === 'true');
    chk('…the options are options, not buttons inside a listbox',
        await page.locator('.cm-mention-menu button').count() === 0
        && await page.locator('.cm-mention-menu [role="option"]').count() === 3);
    chk('…and the input names which one is active',
        await box.getAttribute('aria-activedescendant') === 'cm-mention-opt-0');

    await box.press('ArrowDown');
    chk('…arrow keys move that reported position, not just the highlight',
        await box.getAttribute('aria-activedescendant') === 'cm-mention-opt-1');
    chk('…and the option itself is marked selected',
        await page.locator('#cm-mention-opt-1').getAttribute('aria-selected') === 'true');

    await box.press('Enter');
    chk('…Enter inserts the handle it said was active',
        (await box.inputValue()).indexOf('@adaeze ') >= 0);

    /* One request per pause, not one per keystroke, and never out of order. */
    await box.fill('');
    await page.evaluate(() => { window.__mentionCalls = 0; });
    for (const ch of '@adamu'.split('')) { await box.press(ch === '@' ? '@' : ch); await page.waitForTimeout(20); }
    await page.waitForTimeout(400);
    const calls = await page.evaluate(() => window.__mentionCalls);
    chk('the lookup is debounced — six keystrokes are not six requests',
        calls > 0 && calls <= 2);

    await box.press('Escape');
    chk('Escape closes the menu and the input says so',
        await box.getAttribute('aria-expanded') === 'false');

    /* ── The counter, inside a channel ──────────────────────────────────── */

    await box.fill('x'.repeat(1500));
    chk('no counter while there is plenty of room',
        await page.locator('.cm-count').count() === 0);
    await box.fill('x'.repeat(1700));
    chk('the counter appears inside a channel, where it never used to',
        await page.locator('.cm-count').count() === 1
        && (await page.locator('.cm-count').innerText()).indexOf('300') >= 0);
    await box.fill('x'.repeat(2000));
    chk('…and says so out loud when the limit is reached',
        (await page.locator('.cm-count').getAttribute('class')).indexOf('over') >= 0
        && (await page.locator('.cm-count .sr-only').innerText()).indexOf('limit reached') >= 0);

    /* ── Describe this photo ────────────────────────────────────────────── */

    await box.fill('');
    await page.evaluate(() => {
      // Stand in for a finished upload; the picker itself is not under test.
      const btns = Array.from(document.querySelectorAll('.cm-dock-ic'));
      window.__origUpload = NGGApi.uploadFile;
      NGGApi.uploadFile = () => Promise.resolve({ url: '/tests/_fixture-photo.png', format: 'png', resourceType: 'image' });
      return btns.length;
    });
    await page.setInputFiles('input[type=file][accept*="image"]',
      { name: 'robot.png', mimeType: 'image/png', buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    await page.waitForSelector('#cm-alt-box', { timeout: 8000 });
    chk('attaching a photo asks what is in it',
        await page.locator('#cm-alt-box').count() === 1);
    chk('…with a real label, not a placeholder standing in for one',
        (await page.locator('label[for="cm-alt-box"]').innerText()).indexOf('Describe this photo') >= 0);
    chk('…and the field is at least 44px tall',
        (await page.locator('#cm-alt-box').boundingBox()).height >= 44);

    await page.locator('#cm-alt-box').fill('three students holding up a finished robot');
    await box.fill('look what we built');
    await page.locator('.cm-send-btn').click();
    await page.waitForTimeout(400);
    const sent = await page.evaluate(() => window.__lastPost);
    chk('…and the description reaches the server as its own field, not the caption',
        sent && sent.altText === 'three students holding up a finished robot'
        && sent.body === 'look what we built');

    chk('no page errors across the whole run', errors.length === 0);
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log(failed
    ? `\n❌ FAIL: ${passed} passed, ${failed} failed (community composer)`
    : `\n✅ PASS: ${passed} passed, 0 failed (community composer)`);
  process.exit(failed ? 1 : 0);
})();
