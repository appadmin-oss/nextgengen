#!/usr/bin/env node
/* ============================================================================
   Maths Lab, end to end, on the PRODUCTION build against the real backend.

   Owner, 5 Nov 2026: "the site is not working". The fixture-based shots
   (tests/mathlab-shot.js) render components with stubbed data, and they had
   all passed while the real Lab drew its question player OUTSIDE the .mlb
   wrapper — so no token resolved and the options, Check and Leave had no
   borders or colour. This walks what a child does — the placement gate, the
   map, every step of a lesson, practice, the result — on dist/ with a real
   SQLite database and a real session, at desktop and phone widths, and fails
   on any page error, any failed API call, a player drawn without the Lab's
   styling, or a lesson that can be skipped.

   Writes dist/api/config.php for the run and removes it after; refuses to
   run if one exists.   Run:  node build.js && node tests/mathlab-e2e.test.js
   Out: tests/screens/mathlab-e2e/
   ========================================================================== */
'use strict';
const { execFileSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'dist');
const PORT = process.env.MLE2E_PORT || '8331', BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(WEB, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mle2e-'));
const DB = path.join(TMP, 'ngg.db');
const OUT = path.join(ROOT, 'tests', 'screens', 'mathlab-e2e');

let seq = 0, server, browser, pass = 0, fail = 0;
function chk(label, ok, extra) { if (ok) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FAIL: ' + label + (extra ? ' — ' + extra : '')); } }
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(WEB + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`); fs.writeFileSync(f, code);
  return execFileSync('php', [f], { cwd: WEB }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

async function journey(who, W, H, tag) {
  const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${who}'"), false);`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage(), log = [];
  p.on('pageerror', e => log.push('page error: ' + e.message));
  p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) log.push('HTTP ' + r.status() + ' ' + r.url().replace(BASE, '')); });
  const shot = n => p.screenshot({ path: path.join(OUT, tag + '-' + n + '.png') });
  const text = () => p.evaluate(() => document.body.innerText);

  await p.goto(BASE + '/study/lab', { waitUntil: 'domcontentloaded' });
  const homeOk = await p.waitForSelector('.mlb-hero', { timeout: 60000 }).then(() => true, () => false);
  chk(tag + ': the Lab home opens for a member', homeOk);
  await shot('home');

  // The placement gate: skill questions only, never a "why is line N true?" proof question.
  await p.click('.mlb-go');
  await p.waitForSelector('.mlb-q', { timeout: 30000 }).catch(() => {});
  const stems = [];
  for (let k = 0; k < 10; k++) {
    if (!(await p.locator('.mlb-q').count())) break;
    stems.push(await p.locator('.mlb-stem').first().innerText());
    if (k === 0) {
      const st = await p.evaluate(() => { const o = document.querySelector('.mlb-opt, .mlb-in'), b = document.querySelector('.mlb-q .mlb-go');
        const cs = o && getComputedStyle(o), cb = b && getComputedStyle(b);
        return { border: cs ? parseFloat(cs.borderTopWidth) : 0, btnBg: cb ? cb.backgroundColor : '', inMlb: !!(o && o.closest('.mlb')) }; });
      chk(tag + ': the question player is drawn with the Lab\'s styling (inside .mlb, bordered answers, a filled button)',
        st.inMlb && st.border > 0 && st.btnBg && st.btnBg !== 'rgba(0, 0, 0, 0)', JSON.stringify(st));
      await shot('gate');
    }
    if (await p.locator('.mlb-opt').count()) {
      if (k === 0) { await p.locator('.mlb-stem').first().click(); await p.keyboard.press('2');
        chk(tag + ': a number key picks an answer (2 → the second option)', await p.locator('.mlb-opt').nth(1).getAttribute('aria-checked') === 'true'); }
      await p.locator('.mlb-opt').first().click();
    } else { const ins = p.locator('.mlb-in:not([disabled])'); const n = await ins.count(); for (let j = 0; j < n; j++) await ins.nth(j).fill('1'); }
    const b = p.locator('.mlb-q .mlb-actions .mlb-go'); if (await b.count() && await b.isEnabled()) await b.click(); else break;
    await p.waitForTimeout(400);
  }
  chk(tag + ': the placement gate asks skill questions, not proof questions (' + stems.length + ')', stems.length > 0 && !stems.some(s => /Why it works|Why is line/.test(s)), stems.filter(s => /Why/.test(s))[0]);
  chk(tag + ': the gate ends on a result with the score once', await p.locator('.mlb-res-ring').count() === 1);

  // The map: one stage open, the next lesson marked.
  await p.goto(BASE + '/study/lab/map', { waitUntil: 'domcontentloaded' });
  const mapOk = await p.waitForSelector('.mlb-path', { timeout: 60000 }).then(() => true, () => false);
  await p.waitForTimeout(400);
  const mp = { paths: await p.locator('.mlb-path').count(), now: await p.locator('.mlb-path .mlb-node.is-now').count() };
  chk(tag + ': the map opens with exactly one stage\'s path and one current lesson', mapOk && mp.paths === 1 && mp.now === 1, JSON.stringify(mp));
  await shot('map');

  // The map's sections: opening another stage closes yours; closing it brings yours back, in view.
  const other = p.locator('.mlb-unit:not(.is-open) .mlb-unit-tog').nth(1);
  if (await other.count()) {
    await other.click(); await p.waitForTimeout(500);
    const mid = { paths: await p.locator('.mlb-path').count(), back: await p.locator('.mlb-backstage').count(), focusOpen: await p.locator('.mlb-unit.is-focus.is-open').count() };
    await p.locator('.mlb-unit.is-open .mlb-unit-tog').click(); await p.waitForTimeout(600);
    const after = { paths: await p.locator('.mlb-path').count(), focusOpen: await p.locator('.mlb-unit.is-focus.is-open').count(),
      inView: await p.evaluate(() => { const r = document.querySelector('.mlb-unit.is-focus').getBoundingClientRect(); return r.top > -5 && r.top < window.innerHeight; }) };
    chk(tag + ': opening another stage shows it alone with a way back; closing it brings your own stage back, in view',
      mid.paths === 1 && mid.back === 1 && mid.focusOpen === 0 && after.paths === 1 && after.focusOpen === 1 && after.inView, JSON.stringify({ mid, after }));
  }

  // Courses: a course you cannot take yet is locked and says why; enrolling shows that it worked.
  await p.goto(BASE + '/study/lab/courses', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-course', { timeout: 60000 });
  const locked = p.locator('.mlb-course.is-locked');
  chk(tag + ': a course beyond the learner is locked, with the reason and no Enrol button',
    await locked.count() >= 1 && /Opens at Stage \d+/.test(await locked.first().innerText()) && !(await locked.first().locator('.mlb-go').count()));
  const open1 = p.locator('.mlb-course:not(.is-locked):not(.is-enrolled) .mlb-go').first();
  if (await open1.count()) {
    await open1.click();
    const done = await p.waitForSelector('.mlb-course.is-enrolled', { timeout: 15000 }).then(() => true, () => false);
    chk(tag + ': enrolling shows it worked — the course says Enrolled and Continue names the next topic',
      done && /Enrolled/i.test(await p.locator('.mlb-course.is-enrolled').first().innerText()) && /Continue/.test(await p.locator('.mlb-course.is-enrolled .mlb-go').first().innerText()));
  }
  await shot('courses');

  // A lesson: no skip, every step worked, then practice.
  await p.goto(BASE + '/study/lab/learn/MC-001', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-lesson-foot', { timeout: 60000 });
  chk(tag + ': a lesson cannot be skipped (Continue shut, later steps shut, no skip link)',
    await p.locator('.mlb-lesson-foot .mlb-go').isDisabled() && !/skip/i.test(await p.locator('.mlb-learn').innerText()));
  await shot('lesson');
  for (let k = 0; k < 10; k++) {
    if (await p.locator('.mlb-status').count()) break;
    if (await p.locator('.mlb-ex .mlb-sl-in').count()) { await p.locator('.mlb-ex .mlb-sl-in').first().focus(); await p.keyboard.press('ArrowRight'); }
    while (await p.locator('.mlb-why .mlb-actions .stt-btn').count()) await p.locator('.mlb-why .mlb-actions .stt-btn').click();
    while (await p.locator('.mlb-lesson-body .stt-btn:has-text("Show the next line")').count()) await p.locator('.mlb-lesson-body .stt-btn:has-text("Show the next line")').click();
    await p.waitForTimeout(250);
    const c = p.locator('.mlb-lesson-foot .mlb-go'); if (await c.count() && await c.isEnabled()) await c.click();
    await p.waitForTimeout(300);
  }
  const practise = p.locator('.mlb-status .mlb-go');
  await p.waitForFunction(() => { const b = document.querySelector('.mlb-status .mlb-go'); return b && !b.disabled; }, null, { timeout: 15000 }).catch(() => {});
  chk(tag + ': studying every step reaches Practise, and the server lets practice start', await practise.isEnabled());
  await practise.click();
  const playing = await p.waitForSelector('.mlb-q', { timeout: 15000 }).then(() => true, () => false);
  chk(tag + ': practice starts', playing);
  /* Answer whatever kind each question is (random forms): choice, typed, a pair of boxes, or an
     order exercise (already holds a value). Only an enabled box is typed into. */
  const answer = async () => {
    if (await p.locator('.mlb-opt:not([disabled])').count()) return p.locator('.mlb-opt:not([disabled])').nth(1).click();
    const ins = p.locator('.mlb-in:not([disabled])'); const n = await ins.count();
    for (let j = 0; j < n; j++) await ins.nth(j).fill('7');
  };
  for (let k = 0; k < 12; k++) {
    if (!(await p.locator('.mlb-q').count())) break;
    await answer();
    const b = p.locator('.mlb-q .mlb-actions .mlb-go').first(); if (await b.count() && await b.isEnabled()) await b.click(); else break;
    await p.waitForTimeout(500);
    if (k === 0) await shot('feedback');
    const nx = p.locator('.mlb-q .mlb-actions .mlb-go:has-text("Next question"), .mlb-q .mlb-actions .mlb-go:has-text("See how you did")').first();
    if (await nx.count()) { await nx.click(); await p.waitForTimeout(400); }
  }
  const res = await text();
  chk(tag + ': practice ends on a result: the score once, what to do next, the mistakes first',
    await p.locator('.mlb-res-ring').count() === 1 && /right/.test(res) && /(Learn from these|Every answer was right)/.test(res));
  await shot('result');
  // Leaving the result goes back to the topic — on its Practise step, not step 1 again.
  await p.locator('.mlb-result .mlb-actions button').filter({ hasText: /Back to the topic|Continue/ }).first().click();
  const back = await p.waitForSelector('.mlb-status', { timeout: 20000 }).then(() => true, () => false);
  chk(tag + ': after practice, the topic reopens on its Practise step (it has been studied)', back && await p.locator('.mlb-stepbar li.is-on').innerText().then(t => /Practise/.test(t), () => false));
  chk(tag + ': no page error and no failed API call on the whole journey', log.length === 0, log.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  maths lab e2e: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('dist/api/config.php already exists — refusing to overwrite.'); process.exit(2); }
  if (!fs.existsSync(path.join(WEB, 'index.html'))) { console.error('no dist/ — run node build.js first'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CFG, `<?php return ['db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'maths_lab_e2e_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false, 'seed_bundled_curriculum' => false];\n`);
  try {
    php(`db_migrate(db_conn());
      foreach (['NGG-E2E-1' => 'Tobi Adewale', 'NGG-E2E-2' => 'Kemi Bello'] as $id => $n)
        db_insert('members', ['memberId'=>$id,'fullName'=>$n,'email'=>strtolower(explode(' ', $n)[0]).'@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', WEB], { cwd: WEB, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    console.log('Maths Lab, end to end (production build, real backend):');
    await journey('NGG-E2E-1', 1280, 900, 'desktop');
    await journey('NGG-E2E-2', 390, 844, 'phone');
  } catch (e) { fail++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
    try { const pg = browser && browser.contexts()[0] && browser.contexts()[0].pages()[0]; if (pg) await pg.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }); } catch (_) {} }
  finally { if (browser) await browser.close(); cleanup(); }
  console.log((fail ? '\n❌ FAIL: ' : '\n✅ PASS: ') + pass + ' passed, ' + fail + ' failed (maths lab e2e)');
  process.exit(fail ? 1 : 0);
})();
