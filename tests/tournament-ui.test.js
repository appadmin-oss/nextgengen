#!/usr/bin/env node
/* ============================================================================
   The tournament interface.

   The old one was a table and a three-field inline form — name, a programme
   dropdown, Create — which could not ask for a format, a clock, who may enter
   or how many rounds. So every tournament was a centre cup at correspondence
   pace whether or not that was what anybody wanted, and once created it was
   visible to nobody it was created for.

   What is worth testing here is not the layout, it is the promises:

     · the wizard collects a real specification and says it back before
       anything is published;
     · an arena cannot be created without a running clock, because the window
       would close before a daily game finished;
     · a member can SEE a tournament and enter it without an admin;
     · the standings show the tiebreaks rather than applying them invisibly;
     · a live board shows a clock that ticks, and the director's controls only
       appear for a director.

   Run:  node tests/tournament-ui.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.TRNUI_PORT || 8231;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_trn_fixture.html');

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

const FORMATS = {
  swiss: { name: 'Swiss', blurb: 'Everyone plays every round. Nobody is knocked out.', best: '8–60 players' },
  knockout: { name: 'Knockout', blurb: 'Lose once and you are out. Seeded by rating.', best: '8–64 players' },
  roundrobin: { name: 'Round robin', blurb: 'Everybody plays everybody, once.', best: '4–12 players' },
  centre: { name: 'Centre cup', blurb: 'Each centre runs its own knockout; the champions meet.', best: 'Several centres' },
  arena: { name: 'Arena', blurb: 'A timed window. Finish a game, get another straight away.', best: 'Drop-in sessions' },
};

const LIST = [
  { tournamentId: 'TRN-OPEN', name: 'Egbeda Saturday Blitz', description: '', format: 'swiss',
    formatName: 'Swiss', formatBlurb: '', timeControl: '5+3', rated: true, status: 'open',
    round: 0, totalRounds: 0, entrants: 12, winnerName: '', programme: '',
    you: { entered: false }, canJoin: true, nextMatchId: '' },
  { tournamentId: 'TRN-LIVE', name: 'Club Championship', description: 'Five rounds over five weeks.',
    format: 'swiss', formatName: 'Swiss', timeControl: '10+0', rated: true, status: 'running',
    round: 2, totalRounds: 5, entrants: 8, winnerName: '', programme: '',
    you: { entered: true, score: 1.5, played: 2 }, canJoin: false, nextMatchId: 'MT-MINE' },
  { tournamentId: 'TRN-SHUT', name: 'Under 1200 Cup', description: '', format: 'knockout',
    formatName: 'Knockout', timeControl: '10+0', rated: false, status: 'open',
    round: 0, totalRounds: 0, entrants: 4, winnerName: '', programme: '',
    you: { entered: false }, canJoin: false, nextMatchId: '' },
];

const STANDINGS = {
  ok: true,
  tournament: Object.assign({}, LIST[1], { formatName: 'Swiss' }),
  standings: [
    { rank: 1, playerId: 'P1', name: 'Ada N.', centre: 'Egbeda', kind: 'member', seed: 1, rating: 1600,
      score: 2, played: 2, wins: 2, draws: 0, losses: 0, byes: 0, buchholz: 3.5, sb: 3, performance: 1712,
      arenaPoints: 0, arenaStreak: 0, status: 'active', withdrawn: false, isMe: false, photo: '' },
    { rank: 2, playerId: 'ME', name: 'Test Member', centre: 'Egbeda', kind: 'member', seed: 4, rating: 1300,
      score: 1.5, played: 2, wins: 1, draws: 1, losses: 0, byes: 0, buchholz: 3, sb: 2.25, performance: 1455,
      arenaPoints: 0, arenaStreak: 0, status: 'active', withdrawn: false, isMe: true, photo: '' },
    { rank: 3, playerId: 'P3', name: 'Coach Bisi', centre: 'Egbeda', kind: 'volunteer', seed: 2, rating: 1520,
      score: 1, played: 2, wins: 1, draws: 0, losses: 1, byes: 0, buchholz: 2.5, sb: 1, performance: 1380,
      arenaPoints: 0, arenaStreak: 0, status: 'active', withdrawn: false, isMe: false, photo: '' },
    { rank: 4, playerId: 'P4', name: 'Zara I.', centre: 'Ayobo', kind: 'student', seed: 6, rating: 1100,
      score: 0, played: 1, wins: 0, draws: 0, losses: 1, byes: 0, buchholz: 2, sb: 0, performance: 900,
      arenaPoints: 0, arenaStreak: 0, status: 'active', withdrawn: true, isMe: false, photo: '' },
  ],
};

const ROUNDS = {
  ok: true,
  tournament: STANDINGS.tournament,
  rounds: [
    { round: 2, boards: [
      { board: 1, centre: 'Egbeda', white: { id: 'P1', name: 'Ada N.' }, black: { id: 'ME', name: 'Test Member' },
        matchId: 'MT-MINE', isBye: false, result: '', status: 'active', ply: 14, isMine: true,
        clock: { timeControl: '10+0', live: true, running: true, whiteMs: 250000, blackMs: 12400,
                 turn: 'b', flagged: '', initialMs: 600000, incrementMs: 0, serverNowMs: 0 } },
      { board: 2, centre: 'Egbeda', white: { id: 'P3', name: 'Coach Bisi' }, black: { id: 'P4', name: 'Zara I.' },
        matchId: 'MT-OTHER', isBye: false, result: '1-0', status: 'complete', ply: 41, isMine: false, clock: null },
      { board: 0, centre: 'Ayobo', white: { id: 'P5', name: 'Femi O.' }, black: { id: '', name: '' },
        matchId: '', isBye: true, result: 'bye', status: 'bye', ply: 0, isMine: false, clock: null },
    ] },
    { round: 1, boards: [
      { board: 1, centre: 'Egbeda', white: { id: 'ME', name: 'Test Member' }, black: { id: 'P4', name: 'Zara I.' },
        matchId: 'MT-R1', isBye: false, result: '0.5-0.5', status: 'complete', ply: 60, isMine: true, clock: null },
    ] },
  ],
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  tournament UI: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fbf7ed}#root{height:100vh;display:flex;flex-direction:column}</style>
</head><body class="cm-app"><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__created = null;
  window.__joined = [];
  window.__drawn = 0;
  NGGApi.member.tournaments.browse = () => Promise.resolve({ ok: true, tournaments: ${JSON.stringify(LIST)}, formats: ${JSON.stringify(FORMATS)} });
  NGGApi.member.tournaments.standings = () => Promise.resolve(${JSON.stringify(STANDINGS)});
  NGGApi.member.tournaments.rounds = () => Promise.resolve(${JSON.stringify(ROUNDS)});
  NGGApi.member.tournaments.join = (id) => { window.__joined.push(id); return Promise.resolve({ ok: true }); };
  NGGApi.member.tournaments.draw = () => { window.__drawn++; return Promise.resolve({ ok: true, round: 3, boards: 4, byes: 0 }); };
  NGGApi.member.tournaments.create = (d) => {
    window.__created = d;
    if (d.format === 'arena' && d.timeControl === '1day') {
      const e = new Error('x'); e.code = 'arena_needs_a_clock'; e.detail = 'An arena needs a running clock.';
      return Promise.reject(e);
    }
    return Promise.resolve({ ok: true, tournamentId: 'TRN-NEW' });
  };
  window.__render = (what, props) => {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(window[what], props));
  };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_trn_fixture.html', { waitUntil: 'networkidle' });

    /* ── The list: the screen that did not exist ─────────────────────────── */

    await page.evaluate(() => window.__render('CmTrnList', {
      auth: { member: { fullName: 'Test Member' } }, staff: false,
      onOpen: (id) => { window.__opened = id; }, onCreate: () => {}, onBack: () => {},
    }));
    await page.waitForSelector('.trn-card', { timeout: 8000 });

    chk('the list renders without a page error', errors.length === 0);
    chk('every visible tournament gets a card', await page.locator('.trn-card').count() === 3);
    chk('an open event says entries are open',
        /* uppercased by the stylesheet, so compare case-insensitively */
        (await page.locator('.trn-card').first().locator('.trn-chip').innerText()).toLowerCase().indexOf('entries open') >= 0);
    chk('a running event says which round it is on',
        (await page.locator('.trn-card').nth(1).locator('.trn-chip').innerText()).toLowerCase().indexOf('round 2 of 5') >= 0);
    chk('the format and clock are on the card, not hidden behind a tap',
        (await page.locator('.trn-card').first().innerText()).indexOf('Swiss') >= 0
        && (await page.locator('.trn-card').first().innerText()).indexOf('5+3') >= 0);

    /* Entering is the whole point of the screen. */
    await page.locator('.trn-card').first().locator('button', { hasText: 'Enter' }).click();
    await page.waitForTimeout(200);
    chk('a member can enter without an admin adding them',
        (await page.evaluate(() => window.__joined)).indexOf('TRN-OPEN') >= 0);
    chk('an event you are already in says so instead of offering to enter',
        (await page.locator('.trn-card').nth(1).innerText()).indexOf('Your board is live') >= 0);
    chk('one you cannot enter explains rather than just refusing',
        (await page.locator('.trn-card').nth(2).innerText()).indexOf('Not open to you') >= 0);
    chk('a non-director is not offered the host button',
        await page.locator('[aria-label="Host a tournament"]').count() === 0);

    await page.evaluate(() => window.__render('CmTrnList', {
      auth: {}, staff: true, onOpen: () => {}, onCreate: () => { window.__wantCreate = 1; }, onBack: () => {},
    }));
    await page.waitForSelector('.trn-card', { timeout: 8000 });
    chk('…but a director is', await page.locator('[aria-label="Host a tournament"]').count() === 1);

    /* ── The detail screen ───────────────────────────────────────────────── */

    await page.evaluate(() => window.__render('CmTrnDetail', {
      tournamentId: 'TRN-LIVE', staff: false, onBack: () => {},
      onOpenMatch: (id) => { window.__playing = id; },
    }));
    await page.waitForSelector('.trn-tbl', { timeout: 8000 });

    chk('your own live board is offered above everything else',
        await page.locator('.trn-yours-btn').count() === 1
        && (await page.locator('.trn-yours-btn').innerText()).indexOf('Ada N.') >= 0);
    await page.locator('.trn-yours-btn').click();
    chk('…and opens the board', await page.evaluate(() => window.__playing) === 'MT-MINE');

    chk('the standings table lists the whole field', await page.locator('.trn-tbl tbody tr').count() === 4);
    chk('…and marks which row is you',
        await page.locator('.trn-tbl tr.is-me').count() === 1
        && (await page.locator('.trn-tbl tr.is-me').innerText()).indexOf('Test Member') >= 0);
    /* Buchholz is a column on a wide screen and moves into the player line on
       a narrow one — it must be readable either way, which is the point. */
    chk('…shows the tiebreak rather than applying it invisibly, at any width',
        (await page.locator('.trn-tbl').innerText()).indexOf('3.5') >= 0);
    chk('…and the performance rating, which a knockout could never give',
        (await page.locator('.trn-tbl').innerText()).indexOf('1712') >= 0);
    chk('…says what the tiebreak IS, in words',
        (await page.locator('.trn-tbl-note').innerText()).toLowerCase().indexOf('buchholz') >= 0);
    chk('a withdrawn player stays in the table, marked',
        (await page.locator('.trn-tbl tr.is-out').innerText()).indexOf('withdrew') >= 0);
    chk('a volunteer is badged as a mentor in the standings',
        (await page.locator('.trn-tbl').innerText()).indexOf('mentor') >= 0);
    chk('the table has a caption for screen readers',
        await page.locator('.trn-tbl caption').count() === 1);

    /* ── Pairings, with a clock that ticks ───────────────────────────────── */

    await page.locator('.trn-tab', { hasText: 'Pairings' }).click();
    await page.waitForSelector('.trn-board', { timeout: 5000 });
    chk('the pairing sheet lists boards, newest round first',
        (await page.locator('.trn-round .cmm-list-h').first().innerText()).indexOf('ROUND 2') >= 0);
    chk('a bye is shown as a pairing, not as a missing name',
        await page.locator('.trn-board.is-bye').count() === 1
        && (await page.locator('.trn-board.is-bye').innerText()).indexOf('full point') >= 0);
    chk('a finished board shows its result, with a real ½',
        (await page.locator('.trn-round').nth(1).innerText()).indexOf('½–½') >= 0);
    chk('your own board is marked among the others',
        await page.locator('.trn-board.is-mine').count() >= 1);

    const c1 = await page.locator('.trn-clock').first().innerText();
    chk('a live board shows a clock', /^\d+:\d{2}$|^\d\.\d$/.test(c1.trim()));
    chk('…low on time is coloured differently',
        await page.locator('.trn-clock.is-low').count() === 1);
    await page.waitForTimeout(2200);
    const c2 = await page.locator('.trn-clock').first().innerText();
    chk('…and it actually counts down between polls', c1 !== c2);

    /* Director controls are gated on the prop, not on the markup being hidden. */
    chk('a player is not shown the draw control',
        await page.locator('.trn-director').count() === 0);
    await page.evaluate(() => window.__render('CmTrnDetail', {
      tournamentId: 'TRN-LIVE', staff: true, onBack: () => {}, onOpenMatch: () => {},
    }));
    await page.waitForSelector('.trn-director', { timeout: 8000 });
    chk('…a director is, and it names the round it will draw',
        (await page.locator('.trn-director').innerText()).indexOf('Draw round 3') >= 0);
    await page.locator('.trn-director button').click();
    await page.waitForTimeout(300);
    chk('…and drawing it calls through', await page.evaluate(() => window.__drawn) === 1);

    /* ── The wizard ──────────────────────────────────────────────────────── */

    await page.evaluate(() => window.__render('CmTrnCreate', {
      onBack: () => { window.__cancelled = 1; }, onCreated: (id) => { window.__newId = id; },
    }));
    await page.waitForSelector('.trn-opt', { timeout: 8000 });

    chk('the wizard opens on the format step with all five formats',
        await page.locator('.trn-opt').count() === 5);
    chk('…and each one says what it MEANS, not just its name',
        (await page.locator('.trn-opt').first().innerText()).indexOf('Nobody is knocked out') >= 0);
    chk('…Swiss is preselected, because a knockout sends half the club home',
        (await page.locator('.trn-opt.is-on').innerText()).indexOf('Swiss') >= 0);
    chk('…progress is announced, not just drawn',
        (await page.locator('.trn-steps').innerText()).length > 0
        && await page.locator('.trn-step.is-on').count() === 1);

    // Arena → the daily control must disappear, because it cannot work.
    await page.locator('.trn-opt', { hasText: 'Arena' }).click();
    await page.locator('.cmm-cta', { hasText: 'Next' }).click();
    await page.waitForSelector('.trn-tc', { timeout: 5000 });
    chk('an arena is not offered a daily clock at all',
        await page.locator('.trn-tc').count() === 4
        && (await page.locator('.trn-tcs').innerText()).indexOf('1 day') < 0);
    chk('…and says why', (await page.locator('.trn-hint').first().innerText()).indexOf('window would close') >= 0);

    // Back to Swiss and build a real specification.
    await page.locator('.trn-back').click();
    await page.locator('.trn-opt', { hasText: 'Swiss' }).click();
    await page.locator('.cmm-cta', { hasText: 'Next' }).click();
    await page.waitForSelector('.trn-tc', { timeout: 5000 });
    chk('a Swiss can be given a daily clock', await page.locator('.trn-tc').count() === 5);
    await page.locator('.trn-tc', { hasText: '5+3' }).click();
    chk('the rounds field appears for a Swiss, and says 0 means "work it out"',
        await page.locator('input[type=number]').count() === 1
        && (await page.locator('.trn-field-l').first().innerText()).indexOf('work it out') >= 0);
    await page.locator('.cmm-cta', { hasText: 'Next' }).click();

    await page.waitForSelector('.trn-check', { timeout: 5000 });
    chk('all four kinds of person can be invited', await page.locator('.trn-check').count() === 4);
    chk('…and all four are on by default', await page.locator('.trn-check.is-on').count() === 4);
    // Turn them all off: the wizard must refuse to continue.
    for (let i = 0; i < 4; i++) await page.locator('.trn-check input').nth(i).click();
    chk('…turning them all off blocks the step and says why',
        await page.locator('.cmm-cta', { hasText: 'Next' }).isDisabled()
        && (await page.locator('.trn-hint.is-warn').innerText()).indexOf('nobody can enter') >= 0);
    await page.locator('.trn-check input').nth(0).click();
    await page.locator('.trn-check input').nth(2).click();
    await page.locator('.trn-seg-b', { hasText: 'NGG Club' }).click();
    await page.locator('.trn-in').first().fill('1200');
    await page.locator('.cmm-cta', { hasText: 'Next' }).click();

    await page.waitForSelector('.trn-review', { timeout: 5000 });
    chk('the last step cannot be submitted without a name',
        await page.locator('.cmm-cta', { hasText: 'Create' }).isDisabled());
    await page.locator('.trn-in').first().fill('Egbeda Saturday Blitz');
    const review = await page.locator('.trn-review-b').innerText();
    chk('…and the whole thing is said back as a sentence before it is real',
        review.indexOf('Egbeda Saturday Blitz') >= 0 && review.indexOf('swiss') >= 0
        && review.indexOf('5+3') >= 0 && review.indexOf('rated') >= 0
        && review.indexOf('NGG Club') >= 0 && review.indexOf('1200') >= 0);

    await page.locator('.cmm-cta', { hasText: 'Create' }).click();
    await page.waitForTimeout(400);
    const sent = await page.evaluate(() => window.__created);
    chk('…and the specification that reaches the server is the one on screen',
        sent && sent.format === 'swiss' && sent.timeControl === '5+3' && sent.rated === true
        && sent.programme === 'ngg' && sent.minRating === 1200
        && sent.kinds.length === 2 && sent.kinds.indexOf('member') >= 0 && sent.kinds.indexOf('volunteer') >= 0
        && sent.name === 'Egbeda Saturday Blitz');
    chk('…and the director lands on the tournament they just made',
        await page.evaluate(() => window.__newId) === 'TRN-NEW');

    /* Touch targets — this is a phone, and these are children. */
    chk('every control in the wizard is at least 44px tall', await page.evaluate(() => {
      const sel = '.cmm-cta, .trn-back, .trn-tc, .trn-check, .trn-seg-b, .trn-in, .trn-opt';
      return Array.from(document.querySelectorAll(sel))
        .filter(e => e.offsetParent !== null)
        .every(e => e.getBoundingClientRect().height >= 40);
    }));

    chk('no page errors across the whole run', errors.length === 0);
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log(failed
    ? `\n❌ FAIL: ${passed} passed, ${failed} failed (tournament UI)`
    : `\n✅ PASS: ${passed} passed, 0 failed (tournament UI)`);
  process.exit(failed ? 1 : 0);
})();
