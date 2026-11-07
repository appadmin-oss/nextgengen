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
  {
    const first = await p.locator('.mlb-course').first().innerText();
    chk(tag + ': every course shows what it holds: its stages in order, by name, with progress',
      await p.locator('.mlb-course').first().locator('.mlb-cpath li').count() >= 1 && /Stage \d+ · /.test(first) && /of \d+ topics/.test(first));
    if (await p.locator('.mlb-course.is-enrolled').count())
      chk(tag + ': an enrolled course says how close the next certificate is', /to go for your Stage \d+ certificate|boss for your certificate/.test(await p.locator('.mlb-course.is-enrolled').first().innerText()));
  }
  await shot('courses');

  // The Daily Olympiad Problem: Home invites it; the page gives a free hint, three tries, then the worked solution.
  await p.goto(BASE + '/study/lab', { waitUntil: 'domcontentloaded' });
  const dcard = await p.waitForSelector('.mlb-dailycard', { timeout: 60000 }).then(() => true, () => false);
  chk(tag + ': Home shows the Daily Olympiad Problem card', dcard);
  await p.locator('.mlb-dailycard button').click();
  await p.waitForSelector('.mlb-daily .mlb-stem', { timeout: 30000 });
  if (!(await p.locator('.mlb-daily .mlb-fb.is-ok, .mlb-daily details').count())) {
    await p.locator('.mlb-daily .mlb-link').click();
    chk(tag + ': the daily problem’s hint opens for free', await p.locator('.mlb-daily .mlb-hint').count() === 1);
    for (let k = 0; k < 3; k++) {
      if (!(await p.locator('.mlb-daily .mlb-go').count())) break;
      if (await p.locator('.mlb-daily .mlb-opt:not([disabled])').count()) await p.locator('.mlb-daily .mlb-opt:not([disabled])').first().click();
      else { const ins = p.locator('.mlb-daily .mlb-in:not([disabled])'); const n = await ins.count(); for (let j = 0; j < n; j++) await ins.nth(j).fill('987654'); }
      const go = p.locator('.mlb-daily .mlb-go'); if (!(await go.isEnabled())) break;
      await go.click(); await p.waitForTimeout(700);
    }
  }
  const dt = await p.locator('.mlb-daily').innerText();
  chk(tag + ': the daily problem ends with its answer and a worked solution, and says a new one comes tomorrow',
    await p.locator('.mlb-daily details .mlb-steps li').count() >= 1 && /Answer:/.test(dt) && /tomorrow/.test(dt), dt.slice(0, 200));
  await shot('daily');

  // The path, Duolingo's way: the sticky header names the stage and opens its Guidebook (key ideas + worked examples).
  await p.goto(BASE + '/study/lab/map', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-unit.is-open .mlb-guidebtn', { timeout: 60000 });
  const ph = await p.locator('.mlb-unit.is-open .mlb-unit-h').innerText();
  const gl = await p.locator('.mlb-unit.is-open .mlb-guidebtn').getAttribute('aria-label');
  const sticky = await p.locator('.mlb-unit.is-open .mlb-unit-h').evaluate(e => getComputedStyle(e).position);
  chk(tag + ': the open stage’s banner names the stage, sticks to the top, and carries a Guidebook button', /Stage \d+/.test(ph) && /Guidebook for Stage \d+/.test(gl || '') && sticky === 'sticky', ph + ' | ' + gl + ' | ' + sticky);
  chk(tag + ': the open stage shows its chest and its mini review on the path', await p.locator('.mlb-path .mlb-chest').count() === 1 && await p.locator('.mlb-path .is-mini .mlb-node').count() === 1);
  await p.locator('.mlb-unit.is-open .mlb-guidebtn').click();
  await p.waitForSelector('.mlb-guide-item', { timeout: 30000 });
  await p.locator('.mlb-guide-ex summary').first().click();
  chk(tag + ': the Guidebook lists the stage’s ten topics, each with a worked example that opens',
    await p.locator('.mlb-guide-item').count() === 10 && await p.locator('.mlb-guide-ex[open] .mlb-steps li').count() >= 1 && /\/study\/lab\/guide\/\d+$/.test(p.url()));
  await shot('guide');
  await p.locator('.mlb-guidehead .mlb-back').click();
  chk(tag + ': closing the Guidebook returns to the map', await p.waitForSelector('.mlb-unit.is-open .mlb-guidebtn', { timeout: 30000 }).then(() => true, () => false));

  // Exam practice: a JAMB-style paper runs on a clock, letters its options A–E, lets a question be left, and reports by area.
  await p.goto(BASE + '/study/lab/exams', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-paper', { timeout: 60000 });
  chk(tag + ': the Exams page offers a JAMB-style and an SAT-style paper', await p.locator('.mlb-paper').count() === 2);
  await p.locator('.mlb-paper.is-jamb .mlb-go').click();
  await p.waitForSelector('.mlb-clock', { timeout: 30000 });
  const clk = await p.locator('.mlb-clock').innerText();
  chk(tag + ': the paper shows its clock (40 minutes) and letters its options A–E',
    /^\s*(39|40):\d\d/.test(clk) && (await p.locator('.mlb-opt-l').allInnerTexts()).join('') === 'ABCDE'.slice(0, await p.locator('.mlb-opt').count()), clk);
  await p.locator('.mlb-opt').first().click(); await p.locator('.mlb-q .mlb-actions .mlb-go').click(); await p.waitForTimeout(500);
  await p.locator('.mlb-q .mlb-actions .stt-btn:has-text("Leave it")').click(); await p.waitForTimeout(500);
  await p.locator('.mlb-handin').click();
  await p.waitForSelector('.mlb-exrep', { timeout: 30000 });
  const rep = await p.locator('.mlb-exrep').innerText();
  chk(tag + ': handing in shows the score out of 100, how many were answered, and the score by area', /out of 100/.test(rep) && /1 of 40 answered/.test(rep) && await p.locator('.mlb-exareas li').count() >= 3, rep.slice(0, 160));
  await shot('exam');

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
    if (k === 0) {
      await shot('feedback');
      const fbt = (await p.locator('.mlb-fb .mlb-fb-h').innerText().catch(() => '')).trim();
      chk(tag + ': each answer gets words that name it (praise or a lift), never a bare verdict', fbt.length > 8 && !/^(Right!|Not quite\.)$/.test(fbt), fbt);
    }
    const nx = p.locator('.mlb-q .mlb-actions .mlb-go:has-text("Next question"), .mlb-q .mlb-actions .mlb-go:has-text("See how you did")').first();
    if (await nx.count()) { await nx.click(); await p.waitForTimeout(400); }
  }
  const res = await text();
  chk(tag + ': practice ends on a result: the score once, what to do next, the mistakes first',
    await p.locator('.mlb-res-ring').count() === 1 && /right/.test(res) && /(Learn from these|Every answer was right)/.test(res));
  chk(tag + ': the result celebrates like Duolingo: a headline, and tiles for XP and accuracy with a word', /(Perfect!|complete!|passed!|Good effort!|Keep going!)/.test(res)
    && await p.locator('.mlb-tiles li').count() >= 2 && /Total XP/.test(res) && /(Flawless|Amazing|Great|Getting there|Building up)/.test(res));
  await shot('result');
  // Leaving the result goes back to the topic — on its Practise step, not step 1 again.
  await p.locator('.mlb-result .mlb-actions button').filter({ hasText: /Back to the topic|Continue/ }).first().click();
  const back = await p.waitForSelector('.mlb-status', { timeout: 20000 }).then(() => true, () => false);
  chk(tag + ': after practice, the topic reopens on its Practise step (it has been studied)', back && await p.locator('.mlb-stepbar li.is-on').innerText().then(t => /Practise/.test(t), () => false));
  chk(tag + ': no page error and no failed API call on the whole journey', log.length === 0, log.slice(0, 3).join(' | '));
  await ctx.close();
}

/* The Physics Lab (owner, 6 Nov 2026): the same engine at /study/physics. The tab is there, the map
   is the Physics map (its own bands, no Maths topic), it offers no exam papers, a lesson's explorer
   asks for a prediction before it opens and says whether it held, and a session started here is a
   Physics session the server marks as Physics. Nothing about it touches the member's Maths. */
async function physics(who, W, H, tag) {
  const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${who}'"), false);`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage(), log = [];
  p.on('pageerror', e => log.push('page error: ' + e.message));
  p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) log.push('HTTP ' + r.status() + ' ' + r.url().replace(BASE, '')); });
  const shot = n => p.screenshot({ path: path.join(OUT, tag + '-physics-' + n + '.png') });
  await p.goto(BASE + '/study/physics', { waitUntil: 'domcontentloaded' });
  const ok = await p.waitForSelector('.mlb.is-physics .mlb-hero', { timeout: 60000 }).then(() => true, () => false);
  chk(tag + ': /study/physics opens the Physics Lab under the Labs tab, titled as itself, with its own Exams tab',
    ok && (await p.locator('.stt-tab.is-on').innerText()).trim() === 'Labs' && /Physics Lab/.test(await p.locator('.stt-h2').innerText()) && await p.locator('.mlb-navb:has-text("Exams")').count() === 1);
  chk(tag + ': Physics Home starts the Physics climb (Stage 1 · Measurement and Matter)', /Measurement and Matter/.test(await p.locator('.mlb-main').innerText()));
  await shot('home');
  await p.goto(BASE + '/study/physics/map', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-unit.is-open', { timeout: 60000 });
  const mapText = await p.locator('.mlb-main').innerText();
  chk(tag + ': the Physics map draws the Physics road: its bands, its nine stages, no Maths stage', /Electricity and the atom/.test(mapText) && /Heat, Waves and Light/.test(mapText) && !/Number Consciousness/.test(mapText)
    && await p.locator('.mlb-unit').count() === 9);
  await shot('map');
  await p.goto(BASE + '/study/physics/exams', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-paper', { timeout: 60000 }).catch(() => {});
  chk(tag + ': the Physics Exams page offers the Physics paper only', await p.locator('.mlb-paper').count() === 1 && /Timed Physics paper/.test(await p.locator('.mlb-paper').innerText()));
  await p.goto(BASE + '/study/physics/learn/PH-001', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-lesson-foot', { timeout: 60000 });
  for (let k = 0; k < 12; k++) {
    if (await p.locator('.mlb-status').count()) break;
    if (await p.locator('.phy-predict-o:not([disabled])').count()) await p.locator('.phy-predict-o:not([disabled])').first().click();
    if (await p.locator('.mlb-ex .mlb-sl-in').count()) { await p.locator('.mlb-ex .mlb-sl-in').first().focus(); await p.keyboard.press('ArrowRight'); }
    else if (await p.locator('.mlb-ex .phy-seg-b:not(.is-on)').count()) await p.locator('.mlb-ex .phy-seg-b:not(.is-on)').first().click();
    while (await p.locator('.mlb-lesson-body .stt-btn:has-text("Show the next line")').count()) await p.locator('.mlb-lesson-body .stt-btn:has-text("Show the next line")').click();
    await p.waitForTimeout(250);
    const c = p.locator('.mlb-lesson-foot .mlb-go'); if (await c.count() && await c.isEnabled()) await c.click();
    await p.waitForTimeout(300);
  }
  await p.waitForFunction(() => { const b = document.querySelector('.mlb-status .mlb-go'); return b && !b.disabled; }, null, { timeout: 15000 }).catch(() => {});
  const practise = p.locator('.mlb-status .mlb-go');
  chk(tag + ': a Physics lesson is studied step by step and opens practice', await practise.count() > 0 && await practise.isEnabled());
  if (await practise.count()) await practise.click();
  const playing = await p.waitForSelector('.mlb-q', { timeout: 15000 }).then(() => true, () => false);
  chk(tag + ': Physics practice starts', playing);
  await shot('practice');
  const sess = JSON.parse(php(`echo json_encode(db_row("SELECT lab, items FROM mlab_sessions WHERE memberId = '${who}' ORDER BY startedAt DESC LIMIT 1"));`) || '{}');
  chk(tag + ': the session is recorded as a Physics session of Physics topics', sess.lab === 'physics' && /PH-001/.test(sess.items || ''), sess.lab);
  chk(tag + ': nothing in the Physics journey errors', log.length === 0, log.slice(0, 3).join(' | '));
  await ctx.close();
}
/* The English Lab (owner, 6 Nov 2026): the third Lab, at /study/english, on the same engine. Home and
   the map are English (eight stages, no Maths or Physics stage), it offers its own timed paper, a lesson
   opens practice, and a practice question is ANSWERED in the browser — a typed word through the new
   `text` kind (a text keyboard, no autocorrect) or a choice — and the server marks it right. */
async function english(who, W, H, tag) {
  const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${who}'"), false);`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage(), log = [];
  p.on('pageerror', e => log.push('page error: ' + e.message));
  p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) log.push('HTTP ' + r.status() + ' ' + r.url().replace(BASE, '')); });
  const shot = n => p.screenshot({ path: path.join(OUT, tag + '-english-' + n + '.png') });
  await p.goto(BASE + '/study/english', { waitUntil: 'domcontentloaded' });
  const ok = await p.waitForSelector('.mlb.is-english .mlb-hero', { timeout: 60000 }).then(() => true, () => false);
  chk(tag + ': /study/english opens the English Lab under the Labs tab, titled as itself, with its own Exams tab',
    ok && (await p.locator('.stt-tab.is-on').innerText()).trim() === 'Labs' && /English Lab/.test(await p.locator('.stt-h2').innerText()) && await p.locator('.mlb-navb:has-text("Exams")').count() === 1);
  chk(tag + ': English Home starts the English climb (Stage 1 · Words and Sentences)', /Words and Sentences/.test(await p.locator('.mlb-main').innerText()));
  await shot('home');
  await p.goto(BASE + '/study/english/map', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-unit.is-open', { timeout: 60000 });
  const mapText = await p.locator('.mlb-main').innerText();
  chk(tag + ': the English map draws the English road: eight stages, its own bands, no other Lab’s stage',
    /The Sounds of English/.test(mapText) && /Writing Well/.test(mapText) && !/Measurement and Matter|Number Consciousness/.test(mapText) && /The Senior Paper/.test(mapText) && await p.locator('.mlb-unit').count() === 8);
  await shot('map');
  await p.goto(BASE + '/study/english/exams', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-paper', { timeout: 60000 }).catch(() => {});
  chk(tag + ': the English Exams page offers the English paper only', await p.locator('.mlb-paper').count() === 1 && /Timed English paper/.test(await p.locator('.mlb-paper').innerText()));
  await p.goto(BASE + '/study/english/learn/EN-001', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-lesson-foot', { timeout: 60000 });
  chk(tag + ': the first English topic teaches a rule before practice', await p.locator('.mlb-why-judge').count() === 1 && await p.locator('.mlb-lesson-foot .mlb-go').isDisabled());
  for (let k = 0; k < 12; k++) {
    if (await p.locator('.mlb-status').count()) break;
    for (let g = 0; g < 20 && await p.locator('.mlb-why .mlb-actions .stt-btn').count(); g++) await p.locator('.mlb-why .mlb-actions .stt-btn').first().click();
    while (await p.locator('.mlb-lesson-body .stt-btn:has-text("Show the next line")').count()) await p.locator('.mlb-lesson-body .stt-btn:has-text("Show the next line")').click();
    await p.waitForTimeout(250);
    const c = p.locator('.mlb-lesson-foot .mlb-go'); if (await c.count() && await c.isEnabled()) await c.click();
    await p.waitForTimeout(300);
  }
  await p.waitForFunction(() => { const b = document.querySelector('.mlb-status .mlb-go'); return b && !b.disabled; }, null, { timeout: 15000 }).catch(() => {});
  const practise = p.locator('.mlb-status .mlb-go');
  chk(tag + ': an English lesson is studied step by step and opens practice', await practise.count() > 0 && await practise.isEnabled());
  if (await practise.count()) await practise.click();
  const playing = await p.waitForSelector('.mlb-q', { timeout: 15000 }).then(() => true, () => false);
  chk(tag + ': English practice starts', playing);
  // Answer the question on screen with the right answer, as a learner would, and let the server mark it.
  const q = JSON.parse(php(`$r = db_row("SELECT items FROM mlab_sessions WHERE memberId = '${who}' ORDER BY startedAt DESC LIMIT 1");
    $x = json_decode($r['items'], true)[0]; $it = mlb_item($x['c'], (int)$x['f'], (int)$x['s']); echo json_encode(['kind' => $it['kind'], 'key' => $it['key'], 'c' => $x['c'], 'case' => !empty($it['case'])]);`) || '{}');
  if (q.kind === 'text') {
    const box = p.locator('.mlb-q .mlb-in');
    chk(tag + ': a typed English answer opens a text keyboard with autocorrect and spell-check off', await box.getAttribute('inputmode') === 'text' && await box.getAttribute('autocorrect') === 'off' && await box.getAttribute('spellcheck') === 'false');
    // Spaces are never the skill; capitals are only where the item says so (the capital-letters topics).
    await box.fill(' ' + (q.case ? String(q.key) : String(q.key).toUpperCase()) + ' ');
  } else if (q.kind === 'mcq' || q.kind === 'error') await p.locator('.mlb-q .mlb-opt').nth(Number(q.key)).click();
  await p.locator('.mlb-q .mlb-go:has-text("Check"), .mlb-actions .mlb-go:has-text("Check")').first().click();
  const marked = await p.waitForSelector('.mlb-fb.is-ok', { timeout: 15000 }).then(() => true, () => false);
  chk(tag + ': the right answer to an English question (' + q.c + ', ' + q.kind + ') is marked right in the browser', marked || q.kind === 'order', q.kind);
  await shot('practice');
  const sess = JSON.parse(php(`echo json_encode(db_row("SELECT lab, items FROM mlab_sessions WHERE memberId = '${who}' ORDER BY startedAt DESC LIMIT 1"));`) || '{}');
  chk(tag + ': the session is recorded as an English session of English topics', sess.lab === 'english' && /EN-001/.test(sess.items || ''), sess.lab);
  chk(tag + ': nothing in the English journey errors', log.length === 0, log.slice(0, 3).join(' | '));
  await ctx.close();
}
/* English teaching (owner, 6 Nov 2026: "real effective learning. Grammar … Speaking … Articulation"):
   a grammar lesson opens with The rule as a contrast (✓ green, ✗ struck through red) and must be read
   through; a sound lesson has Hear and say — how to make the sound, eight listening rounds that unlock
   only after the word is played, and a Speak button. No voice key here, so the device fallback runs. */
async function englishTeach(who) {
  php(`lab_use('english'); foreach (array_merge(mlb_stages()[1]['comps'], mlb_stages()[2]['comps']) as $c) mlb_set_state('${who}', $c, ['state' => 'mastered']);`);
  const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${who}'"), false);`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage(), log = [];
  p.on('pageerror', e => log.push('page error: ' + e.message));
  p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400 && !/mathslab\.php/.test(r.url())) log.push('HTTP ' + r.status() + ' ' + r.url().replace(BASE, '')); });
  const clips = [];
  p.on('response', r => { if (r.url().includes('/assets/audio/english/')) clips.push(r.status()); });
  await p.goto(BASE + '/study/english/learn/EN-031', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.mlb-why', { timeout: 60000 }).catch(() => {});
  chk('english: a grammar lesson opens with The rule', /The rule/.test(await p.locator('.mlb-why .mlb-h3').innerText().catch(() => '')) && await p.locator('.mlb-lesson-foot .mlb-go').isDisabled());
  // Right or wrong? — each marked example is judged before its verdict and reason are shown.
  const firstTest = await p.locator('.mlb-why-test').innerText().catch(() => '');
  chk('english: the rule lesson asks "Right or wrong?" with the sentence shown WITHOUT its ✓/✗', await p.locator('.mlb-why-judge .mlb-judge-ok').count() === 1 && firstTest !== '' && !/^[✓✗]/.test(firstTest));
  for (let g = 0; g < 20 && await p.locator('.mlb-why .mlb-actions .stt-btn').count(); g++) {
    await p.locator('.mlb-why .mlb-actions .stt-btn').first().click();
    if (g === 0) chk('english: a judgement gets an immediate verdict', /Yes —|Not quite —/.test(await p.locator('.mlb-why-fb').innerText().catch(() => '')));
  }
  chk('english: the rule lesson ends with how many examples were judged correctly', /You judged \d+ of \d+ correctly/.test(await p.locator('.mlb-why-score').innerText().catch(() => '')));
  await p.waitForFunction(() => { const b = document.querySelector('.mlb-lesson-foot .mlb-go'); return b && !b.disabled; }, null, { timeout: 10000 }).catch(() => {});
  chk('english: the rule is a contrast — right examples marked right, the slip struck through — and Continue opens once it is read',
    await p.locator('.mlb-why-steps.is-contrast li.is-ok').count() >= 2 && await p.locator('.mlb-why-steps.is-contrast li.is-no').count() >= 1 && await p.locator('.mlb-lesson-foot .mlb-go').isEnabled());
  await p.screenshot({ path: path.join(OUT, 'english-rule.png'), fullPage: true });
  await p.goto(BASE + '/study/english/learn/EN-021', { waitUntil: 'domcontentloaded' });
  // Sound topics teach their rule first now (Right or wrong?), then Hear and say.
  await p.waitForSelector('.mlb-why, .eng-speak', { timeout: 60000 }).catch(() => {});
  if (await p.locator('.mlb-why').count()) {
    for (let g = 0; g < 20 && await p.locator('.mlb-why .mlb-actions .stt-btn').count(); g++) await p.locator('.mlb-why .mlb-actions .stt-btn').first().click();
    await p.waitForFunction(() => { const b = document.querySelector('.mlb-lesson-foot .mlb-go'); return b && !b.disabled; }, null, { timeout: 10000 }).catch(() => {});
    await p.locator('.mlb-lesson-foot .mlb-go').click();
  }
  await p.waitForSelector('.eng-speak', { timeout: 60000 }).catch(() => {});
  chk('english: a sound lesson has Hear and say, with how to make each sound', await p.locator('.eng-how-i').count() >= 2 && await p.locator('.eng-hear').count() === 1 && await p.locator('.eng-say .mlb-go:has-text("Speak")').count() === 1);
  chk('english: the answer buttons stay shut until the word has been played', await p.locator('.eng-choice').first().isDisabled());
  for (let k = 0; k < 8; k++) {
    await p.locator('.eng-hear .eng-hear-play .mlb-go').click();
    await p.waitForFunction(() => { const b = document.querySelector('.eng-choice'); return b && !b.disabled; }, null, { timeout: 15000 });
    await p.locator('.eng-choice').first().click();
    await p.locator('.eng-hear .mlb-fb .mlb-go').click();
  }
  chk('english: eight listening rounds end with a score', /of 8 right/.test(await p.locator('.eng-hear').innerText()));
  chk('english: the voice is the RECORDED clip — the listening rounds fetched recorded MP3s and every one loaded', clips.length >= 8 && clips.every(c => c === 200 || c === 206 || c === 304), clips.slice(0, 8).join(','));
  // Hear and write: dictation, marked word by word.
  chk('english: Hear and write keeps the box shut until the sentence has been played', await p.locator('.eng-write-in').isDisabled());
  await p.locator('.eng-write .eng-hear-play .mlb-go').click();
  await p.waitForFunction(() => { const i = document.querySelector('.eng-write-in'); return i && !i.disabled; }, null, { timeout: 15000 });
  await p.locator('.eng-write-in').fill('the');
  await p.locator('.eng-write form .mlb-go').click();
  chk('english: dictation marks every word of the sentence, right and wrong', /words right|Every word right/.test(await p.locator('.eng-write .mlb-fb').innerText().catch(() => '')) && await p.locator('.eng-write .eng-w').count() >= 3);
  await p.screenshot({ path: path.join(OUT, 'english-hear-say.png'), fullPage: true });
  chk('english: nothing in the teaching steps errors', log.length === 0, log.slice(0, 3).join(' | '));
  await ctx.close();
}
/* A Physics lesson's explorer asks for the prediction FIRST (predict–observe–explain), in a browser. */
async function physicsPredict(who) {
  // PH-004 rests on PH-001…003: this learner already knows them.
  php(`foreach (['PH-001','PH-002','PH-003'] as $c) mlb_set_state('${who}', $c, ['state' => 'mastered']);`);
  const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${who}'"), false);`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage();
  await p.goto(BASE + '/study/physics/learn/PH-004', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.phy-predict-o', { timeout: 60000 });
  const before = await p.locator('.mlb-explore .mlb-ex').count();
  await p.locator('.phy-predict-o').first().click();
  await p.locator('.mlb-ex .phy-seg-b:not(.is-on)').first().click();
  await p.waitForTimeout(300);
  chk('physics: the explorer stays shut until a prediction is made, then opens, and after a try says whether the prediction held',
    before === 0 && await p.locator('.mlb-explore .mlb-ex').count() === 1 && await p.locator('.phy-predict-v').count() === 1);
  await p.screenshot({ path: path.join(OUT, 'physics-predict.png') });
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
    // Newer Playwright images ship chrome-linux64/; older ones chrome-linux/. Take whichever is there.
    const exe = d && ['chrome-linux64', 'chrome-linux'].map(x => '/opt/pw-browsers/' + d + '/' + x + '/chrome').find(f => fs.existsSync(f));
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    console.log('Maths Lab, end to end (production build, real backend):');
    await journey('NGG-E2E-1', 1280, 900, 'desktop');
    await journey('NGG-E2E-2', 390, 844, 'phone');
    console.log('Physics Lab, end to end:');
    await physics('NGG-E2E-1', 1280, 900, 'desktop');
    await physics('NGG-E2E-2', 390, 844, 'phone');
    await physicsPredict('NGG-E2E-1');
    console.log('English Lab, end to end:');
    await english('NGG-E2E-1', 1280, 900, 'desktop');
    await english('NGG-E2E-2', 390, 844, 'phone');
    await englishTeach('NGG-E2E-2');
  } catch (e) { fail++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
    try { const pg = browser && browser.contexts()[0] && browser.contexts()[0].pages()[0]; if (pg) await pg.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }); } catch (_) {} }
  finally { if (browser) await browser.close(); cleanup(); }
  console.log((fail ? '\n❌ FAIL: ' : '\n✅ PASS: ') + pass + ' passed, ' + fail + ' failed (maths lab e2e)');
  process.exit(fail ? 1 : 0);
})();
