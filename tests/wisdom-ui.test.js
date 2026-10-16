#!/usr/bin/env node
/* ============================================================================
   Quote of the week — the home-page card and the Control Room screen, end to
   end: real PHP server, real seed, real session.

   What must hold:
     · A fresh deployment seeds the sayings and the home page shows this
       week's (Hausa first, from the rotation anchor).
     · A riddle's answer and a saying's meaning stay hidden until asked for.
     · No listen button when there is neither a stored clip nor a browser
       voice for the language — never an English voice reading Hausa.
     · With a stored clip, the button appears and the clip serves with byte
       ranges (Safari refuses audio without them).
     · The admin screen lists the sayings per language and the schedule.

   Run:  node tests/wisdom-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.WISDOM_PORT || '8277';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-wisdom-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'wisdom');
const ADMIN = 'NGG-WS-ADM';

let _seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
function get(url, headers) {
  return new Promise((res, rej) => http.get(url, { headers }, r => {
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) }));
  }).on('error', rej));
}
/** A real, playable half-second of silence. */
function wav() {
  const n = 4000, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  wisdom UI: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'wisdom_test_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'debug' => false,
  ];\n`);

  try {
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Wisdom Admin','email'=>'ws-adm@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const api = JSON.parse((await get(BASE + '/api/public/wisdom.php')).body.toString());
    const s = api.saying || {};
    chk('the public read seeds and returns a saying with a week', !!s.text && /^\d{4}-\d{2}-\d{2}$/.test(api.week || ''));

    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForSelector('.qow .qow-text', { timeout: 30000 });
    const text = await page.$eval('.qow .qow-text', el => el.textContent);
    chk('the home page shows this week’s saying', text === s.text);
    chk('the translation is shown under it', (await page.$eval('.qow', el => el.innerText)).includes(s.translation));
    chk('no listen button without a clip or a voice for the language', (await page.$('.qow-play')) === null);
    const hidden = await page.$eval('.qow', el => el.innerText);
    chk('the answer and meaning are hidden until asked', !hidden.includes('Deeper meaning') && (!s.answer || !hidden.includes(s.answer)));
    if (s.kind === 'riddle') {
      await page.click('.qow-btn:has-text("Reveal the answer")');
      chk('reveal shows the answer', (await page.$eval('.qow', el => el.innerText)).includes(s.answer));
    }
    await page.click('.qow-btn:has-text("What it means")');
    chk('“What it means” opens the deeper meaning', (await page.$eval('.qow', el => el.innerText)).includes(s.meaning.slice(0, 40)));
    await (await page.$('.qow')).screenshot({ path: path.join(SHOTS, 'home-desktop.png') });

    // A stored clip: the button appears and the clip serves with ranges.
    const bytes = wav();
    const dir = path.join(TMP, 'wisdom'); fs.mkdirSync(dir, { recursive: true });
    const name = require('crypto').createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '.wav';
    fs.writeFileSync(path.join(dir, name), bytes);
    // A second, different clip for the English translation.
    const bytesEn = Buffer.concat([wav(), Buffer.from('en')]);
    const nameEn = require('crypto').createHash('sha256').update(bytesEn).digest('hex').slice(0, 32) + '.wav';
    fs.writeFileSync(path.join(dir, nameEn), bytesEn);
    php(`db_exec("UPDATE wisdom_sayings SET audioFile = ?, audioSource = 'custom', audioFileEn = ? WHERE wisdomId = ?", ['${name}', '${nameEn}', '${s.wisdomId}']);`);
    const full = await get(BASE + '/api/public/wisdom-audio.php?a=' + name);
    const part = await get(BASE + '/api/public/wisdom-audio.php?a=' + name, { Range: 'bytes=0-99' });
    chk('the clip serves as audio', full.status === 200 && full.headers['content-type'] === 'audio/wav' && full.body.length === bytes.length);
    chk('a byte range is honoured (206)', part.status === 206 && part.body.length === 100 && /^bytes 0-99\//.test(part.headers['content-range'] || ''));
    chk('a traversal name is a 404', (await get(BASE + '/api/public/wisdom-audio.php?a=../ngg.db')).status === 404);

    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    await mp.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.qow .qow-play', { timeout: 30000 });
    chk('with a clip, the listen button renders and is labelled', /Listen to the/.test(await mp.$eval('.qow-play', b => b.getAttribute('aria-label'))));
    chk('the listen label promises the English after the saying', /then English/.test(await mp.$eval('.qow-listen', el => el.textContent)));
    chk('“English too” is a pressed toggle, on by default', await mp.$eval('.qow-entoggle', b => b.getAttribute('aria-pressed') === 'true'));
    await mp.click('.qow-play');
    chk('playing reads the saying, then moves on to the English',
        await mp.waitForFunction(() => document.querySelector('.qow-tr.is-speaking'), null, { timeout: 15000 }).then(() => true, () => false));
    await mp.click('.qow-entoggle');
    chk('turning English off updates the promise', !/then English/.test(await mp.$eval('.qow-listen', el => el.textContent)));
    // Speed, for somebody learning the saying by ear.
    await mp.click('.qow-play[aria-pressed=true]').catch(() => {});
    chk('speed is a radio group of three, at 1× until chosen', (await mp.$$eval('.qow-speed [role=radio]', b => b.map(x => x.textContent + ':' + x.getAttribute('aria-checked')).join())) === '1×:true,0.75×:false,0.5×:false');
    await mp.click('.qow-speed [data-rate="0.5"]');
    chk('half speed is said in the promise', /at half speed/i.test(await mp.$eval('.qow-listen', el => el.textContent)));
    await mp.click('.qow-play');
    chk('…and the clip really plays at half speed, pitch kept', await mp.waitForFunction(() => { const a = document.querySelector('.qow audio'); return a && a.playbackRate === 0.5 && a.preservesPitch !== false; }, null, { timeout: 5000 }).then(() => true, () => false));
    await mp.click('.qow-play');
    await mp.focus('.qow-speed [data-rate="0.5"]');
    await mp.keyboard.press('ArrowLeft');
    chk('arrow keys move the speed, and the chosen one is the only tab stop', (await mp.getAttribute('.qow-speed [data-rate="0.75"]', 'aria-checked')) === 'true'
      && (await mp.$$eval('.qow-speed [role=radio]', b => b.map(x => x.tabIndex).join())) === '-1,0,-1');
    await mp.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.qow .qow-play', { timeout: 30000 });
    chk('the chosen speed is remembered', (await mp.getAttribute('.qow-speed [data-rate="0.75"]', 'aria-checked')) === 'true');
    // Loop: the reading starts again after a pause until stopped.
    if (await mp.$eval('.qow-entoggle', b => b.getAttribute('aria-pressed') === 'true')) await mp.click('.qow-entoggle');
    await mp.click('.qow-chip:has-text("Loop")');
    chk('Loop is a pressed toggle', (await mp.getAttribute('.qow-chip:has-text("Loop")', 'aria-pressed')) === 'true');
    await mp.click('.qow-play');
    chk('with Loop on, the end of a reading is followed by another',
        await mp.waitForFunction(() => /Again in a moment/i.test(document.querySelector('.qow-listen').textContent), null, { timeout: 15000 }).then(() => true, () => false)
        && await mp.waitForFunction(() => document.querySelector('.qow-text.is-speaking'), null, { timeout: 8000 }).then(() => true, () => false));
    await mp.click('.qow-play');
    chk('Stop ends the loop', await mp.waitForTimeout(2500).then(() => mp.$eval('.qow-play', b => b.getAttribute('aria-pressed') === 'false')));
    // Share: the phone's sheet where there is one, else the saying copied with its meaning.
    await mp.evaluate(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (_) {} navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
    await mp.click('.qow-share');
    const copied = await mp.evaluate(() => window.__copied || '');
    chk('Share copies the saying, its meaning and where it came from, and says so', copied.includes(s.text) && (!s.translation || copied.includes(s.translation)) && /Copied/.test(await mp.$eval('.qow-listen', el => el.textContent)));
        chk('the card fits a phone with no sideways scroll', await mp.evaluate(() => document.querySelector('.qow').scrollWidth <= window.innerWidth));
    await (await mp.$('.qow')).screenshot({ path: path.join(SHOTS, 'home-phone.png') });

    // The Community: the same quote as a card at the top of Today's feed.
    php(`db_insert('members', ['memberId'=>'NGG-WS-MEM','fullName'=>'Ada Member','email'=>'ws-mem@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Main','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`);
    const memTok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-WS-MEM'"), false);`, ['session']);
    for (const [label, W, H] of [['phone', 390, 844], ['laptop', 1280, 900]]) {
      const cctx = await browser.newContext({ viewport: { width: W, height: H } });
      await cctx.addCookies([{ name: 'ngg_sess', value: memTok, domain: '127.0.0.1', path: '/', httpOnly: true }]);
      const cp = await cctx.newPage();
      cp.on('pageerror', e => errs.push('community: ' + String(e).slice(0, 200)));
      await cp.goto(BASE + '/community', { waitUntil: 'domcontentloaded' });
      await waitForBoot(cp);
      const shown = await cp.waitForSelector('.cmm-feed .qow-cm .qow-text', { timeout: 30000 }).then(() => true, () => false);
      chk('community (' + label + '): the quote of the week leads the Today feed', shown
          && await cp.$eval('.cmm-feed .qow-cm .qow-text', el => el.textContent) === s.text
          && await cp.$eval('.cmm-feed', f => f.firstElementChild && f.firstElementChild.classList.contains('qow-cm')));
      chk('community (' + label + '): it is a card inside the feed, not the home page’s full-bleed band',
          await cp.$eval('.qow-cm', el => { const b = el.getBoundingClientRect(), f = el.parentElement.getBoundingClientRect();
            return b.left >= f.left - 1 && b.right <= f.right + 1 && parseFloat(getComputedStyle(el).borderTopLeftRadius) > 0; }));
      chk('community (' + label + '): no sideways scroll', await cp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      if (s.meaning) {
        await cp.click('.qow-cm .qow-btn:has-text("What it means")');
        chk('community (' + label + '): its controls work — the meaning opens',
            (await cp.$eval('.qow-cm', el => el.innerText)).includes(s.meaning.slice(0, 30)));
      }
      await (await cp.$('.qow-cm')).screenshot({ path: path.join(SHOTS, 'community-' + label + '.png') });
      await cp.click('.cmm-chip:has-text("Mentions"), [role=tab]:has-text("Mentions"), button:has-text("Mentions")').catch(() => {});
      await cp.waitForTimeout(300);
      chk('community (' + label + '): a filtered view (Mentions) does not repeat it', (await cp.$$('.qow-cm')).length === 0);
      await cctx.close();
    }

    // The Control Room screen.
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const actx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await actx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
    const ap = await actx.newPage();
    ap.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await ap.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
    await ap.evaluate(() => window.__adminSection('wisdom'));
    await ap.waitForSelector('.wis-item', { timeout: 30000 });
    const main = await ap.$eval('.admin-main', el => el.innerText);
    chk('admin lists the four Hausa riddles', (await ap.$$('.wis-item')).length === 4 && main.includes('Na tura yaron'));
    chk('admin shows nine weeks of schedule, this week first', (await ap.$$('.wis-sched-cell')).length === 9 && /This week/i.test(main));
    chk('without a TTS key there is no Generate button, and the page says what to set',
        (await ap.$$('.wis-voice button:has-text("Generate")')).length === 0 && /spitch_key/.test(main));
    /* Which language opens the strip depends on today's week, so the promise is
       asserted rather than a date: every cell names a language and its turn, and
       a language's turns count up the strip. */
    const cells = await ap.$$eval('.wis-sched-cell', els => els.map(e => e.innerText));
    const turns = {};
    cells.forEach(t => { const m = t.match(/(Hausa|Igbo|Yorùbá)\s*#(\d+)/); if (m) (turns[m[1]] = turns[m[1]] || []).push(+m[2]); });
    chk('the schedule numbers each language’s turn', Object.values(turns).flat().length === cells.length && Object.keys(turns).length === 3
        && Object.values(turns).every(n => n.every((x, i) => i === 0 || x === n[i - 1] + 1)));
    await ap.click('.wis-tab:has-text("Igbo")');
    chk('the Igbo tab lists the four proverbs', (await ap.$$('.wis-item')).length === 4);
    await ap.click('.wis-tab:has-text("Yorùbá")');
    chk('the Yorùbá tab lists the four proverbs, tone marks intact',
        (await ap.$$('.wis-item')).length === 4 && (await ap.$eval('.admin-main', el => el.innerText)).includes('A kì í fi orí wé orí Mọkírè'));
    chk('the schedule has Yorùbá in the third week', /Yorùbá\s*#1/.test(await ap.$eval('.wis-sched', el => el.innerText)));
    await ap.screenshot({ path: path.join(SHOTS, 'admin.png'), fullPage: false });

    /* ── With a Spitch key. Every saying already has its saved clips and its
       one automatic attempt stamped, so nothing on this screen can reach the
       network: the point is what staff see once voicing is on. ── */
    fs.writeFileSync(CFG, fs.readFileSync(CFG, 'utf8').replace("'debug' => false,", "'debug' => false, 'tts' => ['spitch_key' => 'e2e-never-called'],"));
    php(`db_exec("UPDATE wisdom_sayings SET audioFile = ?, audioFileEn = ?, audioSource = 'tts', voiceEn = 'lucy', ttsScore = 0.96, ttsScoreEn = 0.98, ttsTriedAt = ?", ['${name}', '${nameEn}', now_iso()]);`
      + `db_exec("UPDATE wisdom_sayings SET voice = CASE language WHEN 'hausa' THEN 'amina' WHEN 'igbo' THEN 'ngozi' ELSE 'sade' END");`
      + `db_exec("UPDATE wisdom_sayings SET ttsScore = 0.62 WHERE wisdomId = (SELECT wisdomId FROM wisdom_sayings WHERE language = 'hausa' ORDER BY position, id LIMIT 1)");`);
    await ap.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
    await ap.evaluate(() => window.__adminSection('wisdom'));
    await ap.waitForSelector('.wis-vs-grid', { timeout: 30000 });
    chk('with a key: a default voice per language, and English', (await ap.$$('.wis-vs-grid select')).length === 4);
    chk('with a key: nothing missing, so "voice everything" says so and cannot be pressed',
        await ap.$eval('.wis-vs-head button', b => b.disabled && /Everything is voiced/.test(b.textContent)));
    const badges = await ap.$$eval('.wis-score', els => els.map(e => e.textContent));
    chk('with a key: each clip shows its pronunciation check, and the weak one says to listen',
        badges.some(t => /Pronunciation check 96%/.test(t)) && badges.some(t => /62% match — listen before it goes live/.test(t)));
    chk('with a key: a voice already saved offers nothing to press — "Saved", not "Regenerate"',
        (await ap.$$('.wis-saved')).length >= 8 && (await ap.$$('.wis-voice button:has-text("Regenerate")')).length === 0
        && (await ap.$$('.wis-voice button:has-text("Use this voice")')).length === 0);
    await ap.selectOption('.wis-item:first-child .wis-voice-sel >> nth=0', 'zainab');
    chk('with a key: picking a different voice is what offers "Use this voice"',
        (await ap.$$('.wis-item:first-child button:has-text("Use this voice")')).length === 1);
    await ap.click('button:has-text("Clone a voice from a recording")');
    chk('with a key: cloning asks for a recording, the exact words and consent, and waits for all three',
        (await ap.$$('.wis-clone-form input[type=checkbox]')).length === 1
        && await ap.$eval('.wis-clone-form button:has-text("Create the voice")', b => b.disabled));
    await ap.screenshot({ path: path.join(SHOTS, 'admin-tts.png'), fullPage: false });
    chk('no page errors', errs.length === 0 || (console.error(errs), false));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (quote of the week)');
  process.exit(failed ? 1 : 0);
})();
