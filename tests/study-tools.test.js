#!/usr/bin/env node
/* ============================================================================
   Study tools (/study), end to end: real PHP server, a real member session,
   every tool driven the way a member would — keyboard included.

     · Flashcards: make a deck, review it with Space and the number keys, and
       the server has the schedule; the overview counts the week.
     · Focus timer, typing (a passage typed in full), calculator (sums, angles,
       an honest error), graph plotter (a curve and its table), dictionary
       (answered by a stand-in, so the test needs no internet).
     · Signed out: the account tools ask to sign in; the others just work.
     · Phone width: no sideways scroll on any tool.

   Run:  node tests/study-tools.test.js
   ========================================================================== */
'use strict';
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.STT_PORT || '8378';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-stt-'));
const DB = path.join(TMP, 'ngg.db');
let _seq = 0;
function php(snippet) {
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() { for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} } return null; }
let passed = 0, failed = 0;
const chk = (m, c, extra) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m + (extra ? ' — ' + extra : '')); } };
let server, browser;
function cleanup() { try { if (server) process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(CFG); } catch (_) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} }

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  study tools: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'stt_e2e_secret_tools_0123456789abcdefg',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`$now = now_iso(); db_insert('members', ['memberId' => 'NGG-STT-1', 'fullName' => 'Chidi Okafor', 'email' => 'chidi@example.org', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || require('./_responsive-probe').chromiumPath(require('fs')) });
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-STT-1'"), false);`);
    await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    // The dictionary, answered by a stand-in: the test needs no internet.
    await ctx.route('https://api.dictionaryapi.dev/**', r => r.request().url().endsWith('/zzzz')
      ? r.fulfill({ status: 404, contentType: 'application/json', body: '{"title":"No Definitions Found"}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ word: 'resilient', phonetic: '/rɪˈzɪliənt/', phonetics: [], meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition: 'Able to recover quickly from difficulty.', example: 'a resilient learner' }], synonyms: ['tough', 'strong'] }] }]) }));
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));

    // ── Flashcards ──
    await p.goto(BASE + '/study/cards', { waitUntil: 'domcontentloaded' }); await waitForBoot(p);
    await p.waitForSelector('.stt-state.is-empty, .stt-decks', { timeout: 30000 });
    chk('flashcards open on an honest empty state', /No decks yet/.test(await p.innerText('.stt-panel')));
    chk('an old address (/study/cards) lands on its new home, Revise → Flashcards', /\/study\/revise$/.test(p.url()) && (await p.getAttribute('#stt-sub-cards', 'aria-selected')) === 'true', p.url());
    await p.click('button:has-text("New deck")');
    await p.fill('#stt-deck-name', 'Biology: cells');
    await p.fill('#stt-f-0', 'Nucleus'); await p.fill('#stt-b-0', 'Holds the DNA');
    await p.click('summary:has-text("Paste many cards")');
    await p.fill('#stt-paste', 'Mitochondria — where the cell makes energy\nRibosome :: makes proteins');
    await p.click('button:has-text("Add these cards")');
    await p.click('button:has-text("Save 3 cards")');
    await p.waitForSelector('.stt-deck', { timeout: 15000 });
    chk('a deck made by hand and by pasting is saved, all three cards due', /Biology: cells/.test(await p.innerText('.stt-deck')) && /3 due/.test(await p.innerText('.stt-due')));
    await p.click('.stt-deck button:has-text("Review")');
    await p.waitForSelector('.stt-flash');
    let seen = 0;
    for (let i = 0; i < 3; i++) {
      await p.keyboard.press('Space');
      await p.waitForSelector('.stt-flash-back');
      await p.keyboard.press('3');
      seen++;
      await p.waitForTimeout(250);
    }
    await p.waitForSelector('text=/Done: 3 cards reviewed/', { timeout: 10000 });
    chk('reviewed with the keyboard alone (Space shows, 3 is "Good"), the session ends with a summary', seen === 3);
    const sched = JSON.parse(php(`echo json_encode(db_all("SELECT intervalDays, reps FROM study_cards WHERE memberId = 'NGG-STT-1'"));`));
    chk('the server scheduled each card for tomorrow', sched.length === 3 && sched.every(c => c.intervalDays === 1 && c.reps === 1));

    // ── Today: the timer and the week together ──
    await p.click('#stt-tab-home');
    await p.waitForSelector('.stt-big', { timeout: 15000 });
    const ov = await p.innerText('.stt-panel');
    chk('Today shows the focus timer and the week together: a streak, 0 due, 3 reviewed', !!(await p.$('.stt-ring')) && /1\s*day/.test(ov) && /0\s*due now/.test(ov) && /3 reviewed this week/.test(ov), ov.slice(0, 300));

    // ── Tabs by arrow key ──
    await p.focus('#stt-tab-home'); await p.keyboard.press('ArrowRight');
    chk('the tabs move with the arrow keys, focus goes with them, and the address follows', /\/study\/labs$/.test(p.url()) && (await p.getAttribute('#stt-tab-labs', 'aria-selected')) === 'true'
      && (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'stt-tab-labs');
    await p.click('#stt-tab-home');

    // ── Focus timer ──
    await p.click('.stt-chip:has-text("15 · 3")');
    chk('a preset sets the block length', (await p.innerText('.stt-ring-t')) === '15:00');
    await p.click('button:has-text("Start")');
    await p.waitForTimeout(2300);
    const tt = await p.innerText('.stt-ring-t');
    chk('the timer runs to the clock', /^14:5\d$/.test(tt) && /Focus/.test(await p.title()), tt);
    await p.click('button:has-text("Pause")');
    const logged = await p.evaluate(() => NGGApi.member.tools.log({ tool: 'focus', minutes: 15, label: 'Test' }).then(() => true, () => false));
    chk('a finished block is logged to the member\'s record', logged && php(`echo (int)db_row("SELECT SUM(minutes) n FROM study_sessions WHERE memberId = 'NGG-STT-1' AND tool = 'focus'")['n'];`) === '15');

    // ── Typing ──
    await p.click('#stt-tab-tools'); await p.click('#stt-sub-typing');
    const passage = await p.evaluate(() => document.querySelector('.stt-type-text').getAttribute('aria-label').replace(/^Type this: /, ''));
    await p.click('#stt-type-in');
    await p.keyboard.type(passage, { delay: 5 });
    await p.waitForSelector('.stt-panel [role="status"]', { timeout: 5000 });
    const ty = await p.innerText('.stt-panel');
    chk('a passage typed in full gives words a minute and 100% accuracy', /100%\s*accuracy/.test(ty) && Number((ty.match(/(\d+)\s*words a minute/) || [])[1]) > 0, ty.slice(0, 200));
    await p.waitForTimeout(500);
    chk('…and the run is saved', Number(php(`echo (int)db_row("SELECT MAX(wpm) n FROM study_sessions WHERE memberId = 'NGG-STT-1' AND tool = 'typing'")['n'];`)) > 0);

    // ── Calculator ──
    await p.click('#stt-tab-tools'); await p.click('#stt-sub-calc');
    await p.fill('#stt-calc-in', '2(3 + 4)^2');
    chk('the calculator works as you type, with implied multiplication and powers', (await p.innerText('#stt-calc-out')) === '= 98');
    await p.press('#stt-calc-in', 'Enter');
    await p.fill('#stt-calc-in', 'sin(30) + ans');
    chk('angles in degrees by default, and the last answer is ans', (await p.innerText('#stt-calc-out')) === '= 98.5');
    await p.click('button[aria-pressed="false"]:has-text("Radians")');
    await p.fill('#stt-calc-in', 'cos(pi)');
    chk('…and in radians when chosen', (await p.innerText('#stt-calc-out')) === '= -1');
    await p.fill('#stt-calc-in', '0.1 + 0.2');
    chk('no floating-point dust (0.1 + 0.2 = 0.3)', (await p.innerText('#stt-calc-out')) === '= 0.3');
    await p.fill('#stt-calc-in', '2 +');
    await p.press('#stt-calc-in', 'Enter');
    chk('an unfinished sum gets a sentence, not NaN', /needs a number/.test(await p.innerText('#stt-calc-out')));
    await p.fill('#stt-calc-in', 'alert(1)');
    await p.press('#stt-calc-in', 'Enter');
    chk('nothing but maths is run: an unknown word is refused by name', /isn’t a function this calculator knows/.test(await p.innerText('#stt-calc-out')));
    await p.fill('#stt-calc-in', '');
    await p.click('.stt-key[aria-label="7"]'); await p.click('.stt-key[aria-label="times"]'); await p.click('.stt-key[aria-label="6"]'); await p.click('.stt-key:has-text("=")');
    chk('the on-screen keys work too, and the answer goes to the history', /7\*6|7×6/.test(await p.innerText('.stt-hist-list')) && /= 42/.test(await p.innerText('.stt-hist-list')));

    // ── A sum with x in it is one press from its graph ──
    await p.fill('#stt-calc-in', 'x^2 - 9');
    await p.click('button:has-text("plot it as a graph")');
    await p.waitForSelector('.stt-graph');
    chk('the calculator hands a sum with x in it to the graph plotter', (await p.inputValue('#stt-fn-0')) === 'x^2 - 9' && /\/study\/tools\/graph$/.test(p.url()));
    // ── Graphs ──
    await p.fill('#stt-fn-0', 'x^2 - 4'); await p.fill('#stt-fn-1', '');
    await p.waitForTimeout(200);
    const coloured = await p.evaluate(() => { const c = document.querySelector('.stt-graph'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] < 110 && d[i + 2] > 140) n++; return n; });
    chk('the curve is drawn in its colour', coloured > 200, String(coloured));
    const tbl = await p.innerText('.stt-table');
    chk('…and the table gives its values, for anyone who cannot see the picture (x = 0 → −4)', /\n0\s+-4\b/.test(tbl), tbl);
    await p.fill('#stt-fn-0', 'x^2 +');
    chk('a broken function says why', /needs a number on each side/.test(await p.innerText('.stt-fn')));
    await p.click('button[aria-label="Zoom in"]');

    // ── Number bases (moved from the Tech lab into Maths) ──
    await p.click('#stt-sub-bases');
    await p.fill('#stt-b-in', '255');
    chk('number bases: 255 is 11111111, FF, and needs 8 bits', /11111111/.test(await p.innerText('.stt-dl')) && /\bFF\b/.test(await p.innerText('.stt-dl')) && /Bits needed\s*8/.test(await p.innerText('.stt-dl')));

    // ── Dictionary ──
    await p.click('#stt-tab-tools'); await p.click('#stt-sub-dict');
    await p.fill('#stt-dict-q', 'resilient'); await p.press('#stt-dict-q', 'Enter');
    await p.waitForSelector('.stt-dict', { timeout: 10000 });
    chk('the dictionary gives meaning, example and synonyms', /Able to recover quickly/.test(await p.innerText('.stt-dict')) && /resilient learner/.test(await p.innerText('.stt-dict')));
    await p.click('button:has-text("Add to My words")');
    await p.waitForSelector('text=/Added to My words/', { timeout: 10000 });
    const mw = JSON.parse(php(`echo json_encode(db_all("SELECT c.front, c.back FROM study_cards c JOIN study_decks d ON d.deckId = c.deckId WHERE d.name = 'My words' AND d.memberId = 'NGG-STT-1'"));`));
    chk('a word looked up becomes a flashcard in "My words"', mw.length === 1 && mw[0].front === 'resilient' && /recover quickly/.test(mw[0].back));
    await p.click('button:has-text("Add to My words")');
    await p.waitForSelector('text=/Already in My words/', { timeout: 10000 });
    chk('…once: the same word twice is not two cards', JSON.parse(php(`echo json_encode(db_all("SELECT c.id FROM study_cards c JOIN study_decks d ON d.deckId = c.deckId WHERE d.name = 'My words'"));`)).length === 1);
    await p.fill('#stt-dict-q', 'zzzz'); await p.press('#stt-dict-q', 'Enter');
    await p.waitForSelector('text=/No entry for/', { timeout: 10000 });
    chk('…and a word it does not know says so', true);
    // ── Labs: one tab, a hub generated from the Lab registry, every subject Lab behind it ──
    await p.click('#stt-tab-labs');
    await p.waitForSelector('.stt-hub-card', { timeout: 15000 });
    const hub = await p.locator('.stt-hub-card b').allInnerTexts();
    chk('the tab row is Today, Labs, Revise, Tools — named for what you came to do', JSON.stringify(await p.locator('.stt-tab').allInnerTexts()) === JSON.stringify(['Today', 'Labs', 'Revise', 'Tools']));
    if (process.env.STT_SHOT) await p.screenshot({ path: process.env.STT_SHOT, fullPage: true });
    chk('the Labs hub lists every subject Lab (' + hub.join(', ') + ')', hub.includes('Maths Lab') && hub.includes('Physics Lab'));
    await p.click('.stt-hub-card:has-text("Physics Lab")');
    await p.waitForTimeout(400);
    chk('inside a subject Lab the Labs tab stays lit, and "All Labs" leads back', /\/study\/physics/.test(p.url()) && (await p.getAttribute('#stt-tab-labs', 'aria-selected')) === 'true' && await p.locator('.stt-back:has-text("All Labs")').count() === 1);
    await p.click('.stt-back');
    chk('…and back on the hub', /\/study\/labs$/.test(p.url()) && await p.locator('.stt-hub-card').count() >= 2);
    for (const [from, to] of [['/study/maths/graph', '/study/tools/graph'], ['/study/words', '/study/tools/dict'], ['/study/maths', '/study/tools']]) {
      await p.goto(BASE + from, { waitUntil: 'domcontentloaded' }); await waitForBoot(p); await p.waitForSelector('.stt-tab.is-on', { timeout: 30000 }); await p.waitForTimeout(200);
      chk('an old address forwards: ' + from + ' → ' + to, new URL(p.url()).pathname === to);
    }
    // ── Course tools ──
    await p.click('#stt-tab-labs'); await p.click('#stt-sub-course');
    await p.click('button:has-text("Code playground")');
    await p.waitForSelector('.stt-preview');
    await p.click('.stt-chip:has-text("JavaScript")');
    await p.fill('#stt-code-ed', "console.log('hello from the sandbox');\ntry { console.log('read ' + parent.document.title); } catch (e) { console.log('parent blocked'); }\ntry { localStorage.setItem('x', '1'); console.log('storage open'); } catch (e) { console.log('storage blocked'); }");
    await p.click('button:has-text("Run")');
    await p.waitForSelector('.stt-con-list li:has-text("hello from the sandbox")', { timeout: 15000 });
    await p.waitForTimeout(300);
    const con = await p.innerText('.stt-con-list');
    chk('the code playground runs the member\'s JavaScript and shows its console', /hello from the sandbox/.test(con));
    chk('…in a sandbox: it cannot reach this page or its storage', /parent blocked/.test(con) && /storage blocked/.test(con) && !/read /.test(con), con);
    await p.click('button:has-text("All course labs")');
    await p.click('button:has-text("Password strength")');
    await p.fill('#stt-pw', 'password123');
    chk('the password checker calls a common password very weak, and says why', /Very weak/.test(await p.innerText('.stt-panel')) && /most common passwords/.test(await p.innerText('.stt-tips')));
    await p.click('button:has-text("All course labs")');
    await p.click('button:has-text("Colour contrast")');
    await p.fill('#stt-fg', '#777777'); await p.fill('#stt-bg', '#ffffff');
    const cc = await p.innerText('.stt-panel');
    chk('colour contrast: #777 on white is 4.48:1 — fails body text, passes large, and offers the closest colour that passes', /4\.48/.test(cc) && /✗ Body text/.test(cc) && /✓ Large text/.test(cc) && /Closest text colour that passes/.test(cc));
    await p.click('button:has-text("All course labs")');
    await p.click('button:has-text("Break-even & profit")');
    const be = await p.innerText('.stt-dl');
    chk('break-even: ₦60,000 fixed at ₦600 a unit is 100 a month, and 150 sold is ₦30,000 profit', /100 a month/.test(be) && /₦30,000/.test(be), be);
    await p.click('button:has-text("All course labs")');
    await p.click('button:has-text("Metronome")');
    await p.click('.stt-chip:has-text("+1")');
    chk('the metronome sets a tempo', /91/.test(await p.innerText('.stt-ring-t')));
    await p.click('button:has-text("All course labs")');
    await p.click('button:has-text("Piano & scales")');
    await p.selectOption('#stt-root', '7');
    chk('the piano names a scale\'s notes (G major has F♯)', /G major:.*F♯/.test(await p.innerText('.stt-panel')));
    chk('no page errors (signed in)', !errs.length, errs.join(' | '));

    // ── Signed out ──
    const anon = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const aerr = []; anon.on('pageerror', e => aerr.push(String(e).slice(0, 200)));
    await anon.goto(BASE + '/study/cards', { waitUntil: 'domcontentloaded' }); await waitForBoot(anon);
    await anon.waitForSelector('.stt-state:not([aria-busy])', { timeout: 30000 }).catch(() => {});
    chk('signed out, Revise asks to sign in — and says what works without one', /Sign in to keep flashcards/.test(await anon.innerText('.stt-panel')) && !!(await anon.$('.stt-state button:has-text("Sign in")')));
    let wide = [];
    for (const t of ['home', 'labs', 'tools']) {
      await anon.click('#stt-tab-' + t); await anon.waitForTimeout(150);
      if (!(await anon.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))) wide.push(t);
    }
    chk('signed out, the other tools work, and none scrolls sideways on a phone', !wide.length && /= 9/.test(await (async () => { await anon.click('#stt-tab-tools'); await anon.fill('#stt-calc-in', '3^2'); return anon.innerText('#stt-calc-out'); })()), wide.join(','));
    chk('no page errors (signed out)', !aerr.length, aerr.join(' | '));
  } catch (e) { failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e)); }
  finally { try { browser && await browser.close(); } catch (_) {} cleanup(); }
  console.log((failed ? '❌' : '✅') + ' study tools: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
