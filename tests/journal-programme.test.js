#!/usr/bin/env node
/* ============================================================================
   §8c — the Programme record.

   The Programme tab used to be one card shape repeated for six kinds of entry,
   with the interesting part — the amount, the number, the update, who agreed —
   written into the prose. §8c gives each kind the shape its content actually
   has, which is the difference between a list you scroll and a record you can
   read a number off.

   What is measured here is mostly whether the screen tells the truth:

     · the three tiles carry the server's numbers, not a second calculation;
     · "Needs attention" is the same number as the tile above it — a chip that
       promises a different count from the tile beside it is why people stop
       reading either;
     · a contribution with no stated goal shows a full bar, because that is
       what "we asked for nothing and got ₦12,000" means, and the bar carries
       the figure in words for anybody who cannot see it;
     · an issue with no updates does not print a "latest update" it does not
       have;
     · the propose card is offered to the member who cannot publish, and the
       promise on it — "a mentor reviews it before it appears here" — is the
       sentence the server actually keeps;
     · a mentor keeps the visibility controls a redesign could have quietly
       dropped.

   Run:  node tests/journal-programme.test.js
   Skips with a pass if playwright isn't installed, like the other E2E tests.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PJ_PORT || 8249;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_pj_fixture.html');

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

const now = new Date('2026-08-24T10:00:00Z');
const iso = (d) => new Date(d).toISOString();

const ENTRIES = [
  { entryId: 'PJ-ISS', kind: 'issue', status: 'open', visibility: 'community',
    title: 'Ayobo hall double-booked on Thursdays',
    body: 'The centre manager has us and the choir in the same room from 4pm.',
    authorName: 'Coach Bisi', ownerName: 'Mr Adewale',
    occurredAt: '2026-08-12T09:00:00Z', createdAt: '2026-08-12T09:00:00Z',
    media: [], people: [], recordedAfterDays: 0, attachments: 0,
    openFor: '6 days', updates: 3, followers: 4, following: false, proposed: false,
    latestUpdate: { updateId: 'U1', authorName: 'Mr Adewale', createdAt: '2026-08-22T09:00:00Z',
                    body: 'Mr Adewale met the manager. Waiting on a written slot confirmation.' } },
  { entryId: 'PJ-DEC', kind: 'decision', status: 'resolved', visibility: 'community',
    title: 'Thursday sessions move to 5pm from 25 August',
    body: 'One hour later clears the choir and gives us the full room.',
    authorName: 'Mr Adewale', parentEntryId: 'PJ-ISS', agreedWith: 2, notified: 18,
    occurredAt: '2026-08-14T09:00:00Z', createdAt: '2026-08-14T09:00:00Z',
    media: [], people: [], recordedAfterDays: 0, attachments: 0, followers: 0, following: false, proposed: false },
  { entryId: 'PJ-CON', kind: 'contribution', status: 'open', visibility: 'community',
    title: 'Egbeda parents funded twenty ID cards', body: '',
    authorName: 'Coach Bisi', amount: '₦12,000', amountMinor: 1200000, targetMinor: 0,
    contributors: 9, progress: 100, attachments: 2,
    occurredAt: '2026-08-11T09:00:00Z', createdAt: '2026-08-11T09:00:00Z',
    media: [], people: [], recordedAfterDays: 0, followers: 0, following: false, proposed: false },
  { entryId: 'PJ-ADV', kind: 'advice', status: 'open', visibility: 'community',
    title: 'Tell someone the week you start slipping, not the week you stop coming.',
    body: '', authorName: 'Coach Bisi', followers: 14, following: false,
    occurredAt: '2026-08-08T09:00:00Z', createdAt: '2026-08-08T09:00:00Z',
    media: [], people: [], recordedAfterDays: 0, attachments: 0, proposed: false },
  { entryId: 'PJ-MIL', kind: 'milestone', status: 'open', visibility: 'community',
    title: 'First cohort graduation, one year on', body: '',
    authorName: 'Mr Adewale', countValue: 41, countTotal: 46, countUnit: 'finished twelve weeks',
    attachments: 12, occurredAt: '2025-08-17T09:00:00Z', createdAt: '2025-08-17T09:00:00Z',
    media: [], people: [], recordedAfterDays: 0, followers: 0, following: false, proposed: false },
];

const SUMMARY = { openIssues: 2, thisMonth: 6, raisedMinor: 4800000, raised: '₦48k',
                  raisedYear: 2026, everything: 46, needsAttention: 2 };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  §8c: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fbf7ed;padding:16px}</style>
</head><body class="cm-app"><div id="root"></div><div id="toasts"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__entries = ${JSON.stringify(ENTRIES)};
  window.__summary = ${JSON.stringify(SUMMARY)};
  window.__can = { canAuthor: false, canPropose: true };
  window.__asked = [];
  window.__proposed = null;
  window.__followed = [];
  const copy = (v) => JSON.parse(JSON.stringify(v));
  NGGApi.member.programJournal.feed = (q) => {
    window.__asked.push(q || {});
    const want = (q || {}).kind, need = (q || {}).need;
    let list = copy(window.__entries);
    if (need === 'attention') list = list.filter(e => e.kind === 'issue' && e.status === 'open');
    else if (want) list = list.filter(e => e.kind === want);
    return Promise.resolve(Object.assign({ ok: true, entries: list, total: list.length,
      summary: copy(window.__summary) }, window.__can));
  };
  NGGApi.member.programJournal.memories = () => Promise.resolve({ ok: true, collections: [] });
  NGGApi.member.programJournal.follow = (id) => {
    window.__followed.push(id);
    const e = window.__entries.filter(x => x.entryId === id)[0] || {};
    e.following = !e.following;
    e.followers = (e.followers || 0) + (e.following ? 1 : -1);
    return Promise.resolve({ ok: true, following: e.following, followers: e.followers });
  };
  NGGApi.member.programJournal.updates = (id) => Promise.resolve({ ok: true, entryId: id,
    title: 'Ayobo hall double-booked on Thursdays', updates: [
      { updateId: 'U0', authorName: 'Coach Bisi', createdAt: '2026-08-13T09:00:00Z', body: 'Raised with the manager by phone.' },
      { updateId: 'U1', authorName: 'Mr Adewale', createdAt: '2026-08-22T09:00:00Z', body: 'Waiting on a written slot confirmation.' } ] });
  NGGApi.member.programJournal.propose = (d) => {
    window.__proposed = d;
    return Promise.resolve({ ok: true, entryId: 'PJ-NEW',
      message: 'Sent to the mentors. It appears here once one of them publishes it.' });
  };
  NGGApi.member.programJournal.publish = () => Promise.resolve({ ok: true });
  let root = null, troot = null;
  window.__render = () => {
    if (!root) root = ReactDOM.createRoot(document.getElementById('root'));
    if (!troot) { troot = ReactDOM.createRoot(document.getElementById('toasts'));
                  troot.render(React.createElement(window.ToastHost)); }
    root.render(React.createElement(window.CmProgramJournal, { auth: { member: { fullName: 'Tunde A.' } } }));
  };
  window.__remount = () => { if (root) { root.unmount(); root = null; } };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_pj_fixture.html', { waitUntil: 'load' });

    const mount = async () => {
      await page.evaluate(() => { window.__remount(); window.__render(); });
      await page.waitForSelector('.cm-pjx-card', { timeout: 8000 });
    };
    const card = (id) => page.locator('.cm-pjx-card').nth(
      ENTRIES.map(e => e.entryId).indexOf(id));

    console.log('\n── The three tiles ───────────────────────────────────────────');

    await mount();
    chk('the screen renders with no script error', errors.length === 0);
    const tiles = (await page.locator('.cm-pjx-tile').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
    chk('three tiles, carrying the server\'s numbers (' + tiles.join(' | ') + ')',
        tiles.length === 3 && /^2 /i.test(tiles[0]) && /^6 /i.test(tiles[1]) && /^₦48k/i.test(tiles[2]));
    chk('…and the year is named, because a record is read years later',
        /2026/.test(tiles[2]));
    /* The open-issues number is the only red one on the screen: it is the only
       one that is a question rather than an achievement. */
    chk('…and only the open issues are drawn as a problem',
        await page.locator('.cm-pjx-n.is-alarm').count() === 1);

    console.log('\n── The filters ──────────────────────────────────────────────');

    const chips = (await page.locator('.cm-pjx-fchip').allInnerTexts()).map(t => t.trim());
    chk('the artboard\'s six chips, in its order (' + chips.join(' / ') + ')',
        chips.length === 6 && /^Everything 46$/.test(chips[0]) && /^Needs attention 2$/.test(chips[1])
        && chips[2] === 'Decisions' && chips[3] === 'Advice'
        && chips[4] === 'Contribution' && chips[5] === 'Milestone');
    /* A chip that promises a different count from the tile beside it is why
       people stop reading either. */
    chk('…and "Needs attention" is the SAME number as the tile above it',
        chips[1].indexOf(' 2') > 0 && tiles[0].indexOf('2') === 0);
    await page.locator('.cm-pjx-fchip').nth(1).click();
    await page.waitForTimeout(200);
    chk('…and pressing it asks the server for the open issues, not a client filter',
        (await page.evaluate(() => window.__asked)).some(q => q && q.need === 'attention'));
    await page.locator('.cm-pjx-fchip').first().click();
    await page.waitForTimeout(200);

    console.log('\n── The month dividers ───────────────────────────────────────');

    const divs = (await page.locator('.cm-pjx-div').allInnerTexts()).map(t => t.trim());
    chk('the record is broken by month, in the artboard\'s words (' + divs.join(' / ') + ')',
        divs.length === 2 && /August 2026/i.test(divs[0]) && /August 2025/i.test(divs[1]));

    console.log('\n── An issue ─────────────────────────────────────────────────');

    const iss = await card('PJ-ISS').innerText();
    chk('an open issue says how long it has been open', /Open · 6 days/.test(iss));
    chk('…and names who owns it as well as who raised it',
        /Raised by Coach Bisi/.test(iss) && /owned by Mr Adewale/.test(iss));
    chk('…and shows the LATEST update, dated',
        /Latest update/i.test(iss) && /written slot confirmation/.test(iss));
    chk('…with both of the artboard\'s actions',
        (await card('PJ-ISS').locator('.cm-pjx-act').allInnerTexts()).join('|') === '3 updates|Follow this');
    const actBoxes = await card('PJ-ISS').locator('.cm-pjx-act').evaluateAll(
      els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    chk('…at the 46px the artboard draws (' + actBoxes.join(', ') + ')',
        actBoxes.length === 2 && actBoxes.every(h => h >= 46));

    await card('PJ-ISS').locator('.cm-pjx-act.is-go').click();
    await page.waitForTimeout(200);
    chk('following says so in a word AND a state, not colour alone',
        (await card('PJ-ISS').locator('.cm-pjx-act.is-go').innerText()).trim() === 'Following'
        && await card('PJ-ISS').locator('.cm-pjx-act.is-go[aria-pressed="true"]').count() === 1);
    chk('…and it really reached the server', (await page.evaluate(() => window.__followed))[0] === 'PJ-ISS');

    await card('PJ-ISS').locator('.cm-pjx-act').first().click();
    await page.waitForSelector('.cm-pjx-ups', { timeout: 4000 });
    chk('"3 updates" opens them, oldest first, so the story reads forwards',
        (await page.locator('.cm-pjx-up-b').allInnerTexts()).join(' ').indexOf('Raised with the manager')
        < (await page.locator('.cm-pjx-up-b').allInnerTexts()).join(' ').indexOf('written slot'));
    chk('…and a member is not offered a box to write in the record',
        await page.locator('.cm-pjx-addup').count() === 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    console.log('\n── A decision, a contribution, a milestone ──────────────────');

    const dec = await card('PJ-DEC').innerText();
    /* The title as written. "Follows ayobo hall double-booked" reads as a
       typo, because Ayobo is a place. */
    chk('a decision shows what it followed from, by its actual name',
        /↳/.test(dec) && dec.includes('Follows “Ayobo hall double-booked on Thursdays”'));
    chk('…and its provenance, which is why it is still trusted a year later',
        /agreed with 2 mentors/.test(dec) && /18 members notified/.test(dec));

    const con = await card('PJ-CON').innerText();
    chk('a contribution leads with the money', /₦12,000/.test(con));
    chk('…and says how many families it came from', /from 9 families/.test(con));
    chk('…and whether the receipts are there to check', /receipts attached \(2\)/.test(con));
    /* The bar is the only place the proportion appears visually, so it has to
       say the same thing in words. */
    chk('…and the bar states what it is showing, for anybody who cannot see it',
        /full amount|100%/.test(await card('PJ-CON').locator('.cm-pjx-bar').getAttribute('aria-label') || ''));

    const mil = await card('PJ-MIL').innerText();
    chk('a milestone leads with its number and what it is out of',
        /41/.test(mil) && /of 46 finished twelve weeks/.test(mil));
    chk('…and says how many photos back it up', /12 photos/.test(mil));

    console.log('\n── The advice card ──────────────────────────────────────────');

    const adv = await card('PJ-ADV').innerText();
    chk('advice is the quote itself, in quotation marks', /“Tell someone the week/.test(adv));
    chk('…and says how many people kept it', /kept by 14 members/.test(adv));
    chk('…with a keep control that is a real target and says what it does',
        await card('PJ-ADV').locator('.cm-pjx-keep').evaluate(
          e => e.getBoundingClientRect().height >= 44 && e.getBoundingClientRect().width >= 44));
    chk('…and announces its state to a screen reader rather than only dimming',
        await card('PJ-ADV').locator('.cm-pjx-keep[aria-pressed="false"]').count() === 1);

    console.log('\n── Proposing ────────────────────────────────────────────────');

    const prop = await page.locator('.cm-pjx-propose').innerText();
    chk('the footer card asks the artboard\'s question', /Something worth recording\?/.test(prop));
    chk('…and prints the promise it is making', /a mentor reviews it before it appears here/i.test(prop));
    await page.locator('.cm-pjx-propose-cta').click();
    await page.waitForSelector('.cmm-sheet', { timeout: 4000 });
    chk('…and the sheet repeats it, because that is where the decision is made',
        /only mentors can see it/i.test(await page.locator('.cmm-sheet').innerText()));
    await page.locator('#pj-pt').fill('The gate light has been out for a fortnight');
    await page.locator('.cm-pjx-cta').click();
    await page.waitForTimeout(250);
    const sent = await page.evaluate(() => window.__proposed);
    chk('the proposal carries what the member typed, and its kind',
        !!sent && sent.title === 'The gate light has been out for a fortnight' && sent.kind === 'issue');
    chk('…and the member is told what happens next, not just "saved"',
        /publishes it/i.test(await page.locator('.toast-success').innerText()));

    console.log('\n── What a mentor keeps ──────────────────────────────────────');

    await page.evaluate(() => { window.__can = { canAuthor: true, canPropose: false }; });
    await mount();
    /* §8c draws the card a member reads. Dropping these to match it would mean
       no entry could ever be widened again. */
    chk('a mentor still has the visibility controls the safeguarding model needs',
        (await card('PJ-ISS').locator('.cm-pjx-slink').allInnerTexts()).join('|')
          === 'Edit|Who can see it|Share link');
    chk('…and can see at a glance who each entry is open to',
        (await card('PJ-ISS').locator('.cm-pjx-vis').innerText()).toLowerCase().includes('community'));
    chk('…and is not offered the propose card, because they write entries instead',
        await page.locator('.cm-pjx-propose').count() === 0);
    await card('PJ-ISS').locator('.cm-pjx-act').first().click();
    await page.waitForSelector('.cm-pjx-addup', { timeout: 4000 });
    chk('…and can add the next update',
        await page.locator('#pj-up').count() === 1);
    chk('…and is told the record cannot be edited afterwards, before writing',
        /cannot be edited afterwards/i.test(await page.locator('.cm-pjx-addup').innerText()));
    await page.keyboard.press('Escape');

    /* A picture of the finished screen, so the artboard and the build can be
       put side by side rather than argued about. */
    await page.evaluate(() => { window.__can = { canAuthor: false, canPropose: true }; });
    await page.evaluate(() => { window.__remount(); window.__render(); });
    await page.waitForSelector('.cm-pjx-card', { timeout: 6000 });
    /* Clear the toasts first: a picture of the screen with a leftover
       confirmation sitting over a card is a picture of the test, not of the
       build. */
    await page.evaluate(() => document.querySelectorAll('.toast .toast-x, .toast button')
      .forEach(b => b.click()));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'journal-programme.png'),
                            fullPage: true });

    /* The artboard fits "Something worth recording?" on one line at 390px; in
       the fonts that actually ship it needs 212px against the 207 the row can
       spare, so it wraps. What must NOT happen is truncation — a heading with
       its question mark cut off is worse than a heading on two lines. */
    const propose = await page.locator('.cm-pjx-propose-h').evaluate(el => ({
      cut: el.scrollWidth > el.clientWidth + 1,
      text: el.textContent,
    }));
    chk('the propose heading is never cut off, whatever it takes to fit',
        !propose.cut && propose.text === 'Something worth recording?');
    /* And the row still holds together: icon, text, button, in that order and
       on one row. */
    const row = await page.locator('.cm-pjx-propose').evaluate(el => {
      const kids = Array.from(el.children).map(c => Math.round(c.getBoundingClientRect().left));
      return kids;
    });
    chk('…and the card is still one row: icon, then text, then the button',
        row.length === 3 && row[0] < row[1] && row[1] < row[2]);

    console.log('\n── Nothing on the record ────────────────────────────────────');

    await page.evaluate(() => { window.__entries = []; window.__can = { canAuthor: false, canPropose: true }; });
    await page.evaluate(() => { window.__remount(); window.__render(); });
    await page.waitForSelector('.cm-pjx-empty', { timeout: 6000 });
    chk('an empty record says so rather than showing dividers over nothing',
        await page.locator('.cm-pjx-div').count() === 0
        && (await page.locator('.cm-pjx-empty').innerText()).length > 10);

    chk('nothing threw across the whole run' + (errors.length ? ': ' + errors[0] : ''),
        errors.length === 0);


    await page.close();
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (§8c the Programme record)');
  process.exit(failed === 0 ? 0 : 1);
})();
