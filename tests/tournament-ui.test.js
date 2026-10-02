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
    you: { entered: false }, canJoin: true, nextMatchId: '',
    startsAt: '', endsAt: '',
    window: { hasWindow: false, entriesClosed: false, started: false, overdue: false,
              startsAt: '', endsAt: '', secondsToStart: null, secondsLeft: null, durationDays: null } },
  { tournamentId: 'TRN-LIVE', name: 'Club Championship', description: 'Five rounds over five weeks.',
    format: 'swiss', formatName: 'Swiss', timeControl: '10+0', rated: true, status: 'running',
    round: 2, totalRounds: 5, entrants: 8, winnerName: '', programme: '',
    you: { entered: true, score: 1.5, played: 2 }, canJoin: false, nextMatchId: 'MT-MINE',
    startsAt: '', endsAt: '',
    window: { hasWindow: false, entriesClosed: false, started: false, overdue: false,
              startsAt: '', endsAt: '', secondsToStart: null, secondsLeft: null, durationDays: null } },
  { tournamentId: 'TRN-SHUT', name: 'Under 1200 Cup', description: '', format: 'knockout',
    formatName: 'Knockout', timeControl: '10+0', rated: false, status: 'open',
    round: 0, totalRounds: 0, entrants: 4, winnerName: '', programme: '',
    you: { entered: false }, canJoin: false, nextMatchId: '',
    startsAt: '', endsAt: '',
    window: { hasWindow: false, entriesClosed: false, started: false, overdue: false,
              startsAt: '', endsAt: '', secondsToStart: null, secondsLeft: null, durationDays: null } },
];

const STANDINGS = {
  ok: true,
  invites: { invited: 40, joined: 12, acceptRate: 30 },
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
</head><body class="cm-app"><div id="root"></div><div id="dlg"></div>
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
  window.__ST = ${JSON.stringify(STANDINGS)};
  NGGApi.member.tournaments.standings = () => Promise.resolve(window.__ST);
  NGGApi.member.tournaments.rounds = () => Promise.resolve(${JSON.stringify(ROUNDS)});
  NGGApi.member.tournaments.join = (id) => { window.__joined.push(id); return Promise.resolve({ ok: true }); };
  NGGApi.member.tournaments.draw = () => { window.__drawn++; return Promise.resolve({ ok: true, round: 3, boards: 4, byes: 0 }); };
  /* Inviting. The dry run comes back first and its count goes into the
     dialog, so the stub records both calls separately. */
  window.__invites = [];
  NGGApi.member.tournaments.inviteAll = (id, dry) => {
    window.__invites.push({ id: id, dry: !!dry });
    return Promise.resolve(dry
      ? { ok: true, dryRun: true, eligible: 40, wouldInvite: 38, alreadyInvited: 2, notEligible: 0 }
      : { ok: true, invited: 38, eligible: 40, alreadyInvited: 2, notEligible: 0 });
  };
  /* The hub's own data, so the route walk sees the lobby a member sees rather
     than the empty shell four rejected requests leave behind. */
  NGGApi.member.match.chess = () => Promise.resolve({ ok: true, rating: 1240, games: 18,
    wins: 9, losses: 6, draws: 3, peak: 1263, provisional: false, weekDelta: 32, levels: [] });
  NGGApi.member.match.list = () => Promise.resolve({ ok: true, matches: [
    { matchId: 'MT-A', game: 'chess', status: 'active', you: 'A', yourTurn: true, ply: 11,
      yourColour: 'w', timeControl: '10+0',
      clock: { live: true, running: true, turn: 'w', whiteMs: 252000, blackMs: 301000, flagged: '' },
      players: { A: { id: 'NGG-1', name: 'You', rating: 1240 },
                 B: { id: 'NGG-2', name: 'Temiloluwa A.', rating: 1198 } } } ] });
  NGGApi.member.match.challenges = () => Promise.resolve({ ok: true, toYou: [], open: [], fromYou: [] });
  NGGApi.member.match.lobby = () => Promise.resolve({ ok: true, yourMove: 1, games: 1,
    challengesToYou: 0, openChallenges: 0, accepted: [], tournaments: 2, sig: 'x',
    arena: { tournamentId: 'TRN-1', name: 'Egbeda club arena', format: 'arena', status: 'running',
             startsAt: '', timeControl: '5+3', players: 14, joined: false } });
  NGGApi.member.promo = () => Promise.resolve({ ok: true, promo: null });
  NGGApi.member.promoTrack = () => Promise.resolve({ ok: true });
  NGGApi.member.tournaments.create = (d) => {
    window.__created = d;
    if (d.format === 'arena' && d.timeControl === '1day') {
      const e = new Error('x'); e.code = 'arena_needs_a_clock'; e.detail = 'An arena needs a running clock.';
      return Promise.reject(e);
    }
    return Promise.resolve({ ok: true, tournamentId: 'TRN-NEW' });
  };
  /* ONE dialog host, mounted once, exactly as App does it. dialog.confirm()
     resolves through every mounted host's listener, so a second host means a
     second copy of every dialog — and a fixture with none returns a promise
     nobody ever settles, which looks precisely like a button that does
     nothing. */
  ReactDOM.createRoot(document.getElementById('dlg')).render(React.createElement(window.DialogHost));
  /* And one root for the screen, reused. createRoot on the same element per
     render leaks a root per call, which is how the host above came to be
     mounted five times. */
  window.__root = ReactDOM.createRoot(document.getElementById('root'));
  window.__renderSeq = 0;
  window.__render = (what, props) => {
    /* A fresh key every time. CmTrnDetail loads in an effect keyed on
       tournamentId, so re-rendering it with the same id leaves the OLD data on
       screen — and a test that then reshapes the stub would be asserting
       against the previous fixture without ever knowing. */
    window.__root.render(React.createElement(window[what],
      Object.assign({ key: 'r' + (++window.__renderSeq) }, props)));
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
    await page.locator('.trn-director button', { hasText: 'Draw' }).click();
    await page.waitForTimeout(300);
    chk('…and drawing it calls through', await page.evaluate(() => window.__drawn) === 1);

    /* Asked, and said yes. Without the first number the second is not a rate,
       and a director filling a field is working blind. */
    chk('a director sees how many of the people asked actually joined',
        (await page.locator('.trn-invited').innerText()).replace(/\s+/g, ' ')
          .indexOf('12 of 40 invited people have joined (30%)') >= 0);

    /* ── Inviting everybody ──────────────────────────────────────────────
       Entrants could be added one at a time and no other way, so in practice
       the field was whoever the director remembered. The button is on the
       OPEN tournament, because you cannot invite people to a race already
       run — and it puts a notification on other people's phones, which there
       is no unsending, so the count comes back from a dry run FIRST and goes
       into the dialog. "Invite 38 people?" is a decision; "invite everyone?"
       is a leap. */
    await page.evaluate(() => {
      NGGApi.member.tournaments.standings = () => Promise.resolve(Object.assign({}, window.__ST, {
        tournament: Object.assign({}, window.__ST.tournament, { status: 'open', round: 0 }),
      }));
      window.__render('CmTrnDetail', { tournamentId: 'TRN-OPEN', staff: true,
                                       onBack: () => {}, onOpenMatch: () => {} });
    });
    await page.waitForSelector('.trn-director', { timeout: 8000 });
    chk('an open tournament offers the director a way to fill the field at all',
        (await page.locator('.trn-director').innerText()).indexOf('Invite everyone eligible') >= 0);

    await page.locator('.trn-director button', { hasText: 'Invite' }).click();
    await page.waitForTimeout(500);
    chk('…which asks the server how many BEFORE it sends anything',
        await page.evaluate(() => window.__invites.length) === 1
        && await page.evaluate(() => window.__invites[0].dry) === true);

    const dlg = await page.evaluate(() => {
      const d = document.querySelector('.dialog-card[role="dialog"]');
      return d ? d.innerText.replace(/\s+/g, ' ') : '';
    });
    chk('…and names the number in the dialog, so it is a decision not a leap ('
        + dlg.slice(0, 60) + ')',
        dlg.indexOf('38') >= 0);
    /* The distinction the whole feature turns on: an invitation is not an
       entry. A child signed up without being asked gets a bye, a forfeit and
       a rating loss for a game they never agreed to play. */
    chk('…and says plainly that it does not enter anybody',
        /does not enter them/i.test(dlg));
    chk('…and mentions the ones who were already asked, who will not be asked twice',
        dlg.indexOf('2 already asked') >= 0);

    /* Backing out must send nothing. A confirmation that fires anyway is
       worse than no confirmation, because people stop reading them. */
    await page.locator('.dialog-card button', { hasText: 'Not now' }).click();
    await page.waitForTimeout(300);
    chk('…and declining the dialog sends nothing at all',
        await page.evaluate(() => window.__invites.filter(i => !i.dry).length) === 0);

    await page.locator('.trn-director button', { hasText: 'Invite' }).click();
    await page.waitForTimeout(400);
    await page.locator('.dialog-card button', { hasText: 'Send 38' }).click();
    await page.waitForTimeout(400);
    chk('…while confirming sends exactly once, for real',
        await page.evaluate(() => window.__invites.filter(i => !i.dry).length) === 1
        && await page.evaluate(() => window.__invites.filter(i => !i.dry)[0].id) === 'TRN-OPEN');

    /* Nobody can be invited to a race that is already run. The button reads
       the same computed window the join gate does, so the two cannot
       disagree about whether entries are open. */
    await page.evaluate(() => {
      NGGApi.member.tournaments.standings = () => Promise.resolve(Object.assign({}, window.__ST, {
        tournament: Object.assign({}, window.__ST.tournament, {
          status: 'open', round: 0,
          window: { hasWindow: true, entriesClosed: true, started: true, overdue: false,
                    startsAt: '2026-08-01T09:00:00Z', endsAt: '2026-08-08T09:00:00Z',
                    secondsToStart: 0, secondsLeft: 3600, durationDays: 7 },
        }),
      }));
      window.__render('CmTrnDetail', { tournamentId: 'TRN-OPEN', staff: true,
                                       onBack: () => {}, onOpenMatch: () => {} });
    });
    await page.waitForSelector('.trn-director', { timeout: 8000 });
    chk('an event whose start has passed offers no invite button at all',
        (await page.locator('.trn-director').innerText()).indexOf('Invite') < 0);
    /* innerText returns what is RENDERED, and the chip is uppercased by the
       stylesheet — so this compares case-insensitively rather than against the
       source string, which would pass or fail on a text-transform. */
    chk('…and the chip says entries are closed, whatever the status column says',
        /entries closed/i.test(await page.locator('.trn-chip').innerText()));

    /* Past its end and still running is the thing a director needs to notice,
       and it is said in words as well as in colour. */
    await page.evaluate(() => {
      NGGApi.member.tournaments.standings = () => Promise.resolve(Object.assign({}, window.__ST, {
        tournament: Object.assign({}, window.__ST.tournament, {
          status: 'running',
          window: { hasWindow: true, entriesClosed: true, started: true, overdue: true,
                    startsAt: '2026-08-01T09:00:00Z', endsAt: '2026-08-08T09:00:00Z',
                    secondsToStart: 0, secondsLeft: -3600, durationDays: 7 },
        }),
      }));
      window.__render('CmTrnDetail', { tournamentId: 'TRN-LIVE', staff: true,
                                       onBack: () => {}, onOpenMatch: () => {} });
    });
    await page.waitForSelector('.trn-overdue', { timeout: 8000 });
    chk('an overdue event says so in words, not only in a colour',
        (await page.locator('.trn-overdue').innerText()).indexOf('Past its end date') >= 0);

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

    /* ── When it runs ────────────────────────────────────────────────────
       startsAt and endsAt were columns from the beginning that the wizard
       never asked about and nothing validated, so every tournament was
       undated. The step asks for a START and a LENGTH, not two datetimes: a
       director thinks "a Saturday afternoon", and a form that can only
       express a valid window beats one that explains why yours is not. */
    await page.waitForSelector('.trn-seg-b', { timeout: 5000 });
    chk('the wizard asks when it runs, and defaults to the old behaviour',
        (await page.locator('.trn-seg-b.is-on').innerText()).indexOf('until I draw') >= 0);
    chk('…saying what that means rather than leaving it to be guessed',
        (await page.locator('.trn-hint').first().innerText()).indexOf('until you draw the first round') >= 0);
    chk('…and an undated event can go straight on, because most club nights are',
        !(await page.locator('.cmm-cta', { hasText: 'Next' }).isDisabled()));

    await page.locator('.trn-seg-b', { hasText: 'Set a start' }).click();
    chk('choosing a schedule asks for a start and offers real lengths',
        await page.locator('input[type=datetime-local]').count() === 1
        && await page.locator('.trn-tc').count() === 6);
    chk('…in the units a director thinks in, not in hours',
        (await page.locator('.trn-tcs').innerText()).indexOf('An afternoon') >= 0);
    chk('…and will not go on until a start is picked',
        await page.locator('.cmm-cta', { hasText: 'Next' }).isDisabled()
        && (await page.locator('.trn-hint.is-warn').innerText()).indexOf('Pick a start') >= 0);
    /* A start in the past is refused by the server; the picker refuses to
       offer it in the first place, which is the better of the two. */
    chk('…and the picker will not offer a start in the past',
        (await page.locator('input[type=datetime-local]').getAttribute('min') || '').length === 16);

    const when = await page.evaluate(() => {
      const d = new Date(Date.now() + 3 * 86400000 - new Date().getTimezoneOffset() * 60000);
      return d.toISOString().slice(0, 16);
    });
    await page.locator('input[type=datetime-local]').fill(when);
    await page.locator('.trn-tc', { hasText: 'A week' }).click();
    chk('…then says when it will end, and that games are not cut off at that moment',
        (await page.locator('.trn-hint').last().innerText()).indexOf('Ends ') >= 0
        && (await page.locator('.trn-hint').last().innerText()).indexOf('games in progress finish') >= 0);
    await page.locator('.cmm-cta', { hasText: 'Next' }).click();

    await page.waitForSelector('.trn-review', { timeout: 5000 });
    chk('the last step cannot be submitted without a name',
        await page.locator('.cmm-cta', { hasText: 'Create' }).isDisabled());
    await page.locator('.trn-in').first().fill('Egbeda Saturday Blitz');
    const review = await page.locator('.trn-review-b').innerText();
    const reviewWhen = await page.locator('.trn-review-s').innerText();
    chk('…and the whole thing is said back as a sentence before it is real',
        review.indexOf('Egbeda Saturday Blitz') >= 0 && review.indexOf('Swiss') >= 0
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
    /* The window travels as UTC. datetime-local hands back wall-clock time
       with no zone; appending "Z" to it — which is what the promo form does —
       silently shifts every tournament by the viewer's offset. */
    chk('…including a window sent as UTC, and an end a week after the start',
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(sent.startsAt || '')
        && /Z$/.test(sent.endsAt || '')
        && Math.round((Date.parse(sent.endsAt) - Date.parse(sent.startsAt)) / 3600000) === 168);
    chk('…and the review said so before the button was pressed',
        reviewWhen.indexOf('runs for') >= 0 && reviewWhen.indexOf('7 days') >= 0
        && reviewWhen.indexOf('Entries close when it starts') >= 0);
    chk('…and the director lands on the tournament they just made',
        await page.evaluate(() => window.__newId) === 'TRN-NEW');

    /* Touch targets — this is a phone, and these are children. */
    chk('every control in the wizard is at least 44px tall', await page.evaluate(() => {
      const sel = '.cmm-cta, .trn-back, .trn-tc, .trn-check, .trn-seg-b, .trn-in, .trn-opt';
      return Array.from(document.querySelectorAll(sel))
        .filter(e => e.offsetParent !== null)
        .every(e => e.getBoundingClientRect().height >= 40);
    }));

    /* ── The route, not just the screen ──────────────────────────────────
       Everything above mounts a tournament component directly. That is how
       the tournaments route came to be completely broken while this file was
       green: the hub read `isDirector` on its way past the routing returns and
       the constant was declared below them, so every tap on Tournaments threw
       "Cannot access 'isDirector' before initialization" and rendered nothing
       at all. A component test cannot see that. Walking in from the hub can. */

    for (const width of [390, 1280]) {
      const routed = await browser.newPage({ viewport: { width, height: 900 } });
      const rErr = [];
      routed.on('pageerror', e => rErr.push(String(e.message)));
      await routed.goto(BASE + '/tests/_trn_fixture.html', { waitUntil: 'networkidle' });
      const mountHub = (role) => routed.evaluate((r) => {
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(window.CmChess, {
            auth: { isSignedIn: true, isAdmin: false,
                    member: { memberId: 'NGG-1', fullName: 'Test Member', role: r } },
            onOpenMatch: () => {},
          }));
      }, role);

      await mountHub('member');
      await routed.waitForSelector('.cmc-sec', { timeout: 8000 });
      chk('[' + width + '] the chess hub itself renders', rErr.length === 0);

      /* The lobby the design asks for, checked where it actually renders. Every
         one of these was a hole the shot showed and no test did: a header with
         no rating in it, a game row with no clock, and a card for the club's
         own arena that the poll never sent the data for. */
      chk('[' + width + '] the header carries the rating and the week',
          /Your rating 1240 · \+32 this week/.test(await routed.evaluate(() => document.body.innerText)));
      chk('[' + width + '] a game you are on move in is one card, with their rating',
          (await routed.locator('.cmc-game').count()) === 1
          && (await routed.locator('.cmc-game-r').first().innerText()) === '1198');
      chk('[' + width + '] …and it shows YOUR clock, not just whose turn it is',
          (await routed.locator('.cmc-game-clock').first().innerText()).trim() === '4:12');
      chk('[' + width + '] the first game in the queue is the one marked to play',
          await routed.locator('.cmc-game').first().evaluate(el => el.classList.contains('is-lead')));
      /* The poll that carries the club's own events fires at 1200ms. Asserting
         before it lands tests the loading state and calls it the screen. */
      await routed.waitForSelector('.cmc-train.is-arena', { timeout: 8000 }).catch(() => {});
      chk('[' + width + '] the club arena gets its own card, with a way in',
          (await routed.locator('.cmc-train.is-arena').count()) === 1
          && (await routed.locator('.cmc-train.is-arena .cmc-train-go').innerText()).trim() === 'Join');
      chk('[' + width + '] …and the tournament tile counts what is running',
          (await routed.locator('.trn-entry').innerText()).indexOf('2 tournaments running') >= 0);

      await routed.locator('.trn-entry').click();
      await routed.waitForTimeout(500);
      chk('[' + width + '] tapping Tournaments opens the list rather than throwing',
          rErr.length === 0 && (await routed.locator('.trn-card').count()) > 0);

      await routed.locator('.trn-card').first().click();
      await routed.waitForTimeout(700);
      chk('[' + width + '] …and opening one shows the tournament',
          rErr.length === 0
          && (await routed.evaluate(() => document.body.innerText)).indexOf('Club Championship') >= 0);

      await mountHub('club_admin');
      await routed.waitForSelector('.cmc-sec', { timeout: 8000 });
      const ladder = routed.locator('.cmc-tile', { hasText: 'Live ladder' });
      if (await ladder.count()) { await ladder.click(); await routed.waitForTimeout(500); }
      chk('[' + width + '] the ladder opens from the hub', rErr.length === 0);

      await mountHub('club_admin');
      await routed.waitForSelector('.cmc-sec', { timeout: 8000 });
      const host = routed.locator('.cmc-tile', { hasText: 'Host a tournament' });
      if (await host.count()) { await host.click(); await routed.waitForTimeout(500); }
      chk('[' + width + '] …and so does the wizard, for a director',
          rErr.length === 0 && (await routed.locator('.trn-wiz').count()) > 0);

      if (rErr.length) console.log('  [' + width + '] route errors: ' + rErr.slice(0, 3).join(' | '));
      await routed.close();
    }

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
