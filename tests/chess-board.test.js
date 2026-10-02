#!/usr/bin/env node
/* ============================================================================
   The board: the clock, and the state a variant adds to it.

   Two things were built server-side and never reached the screen, and both are
   the kind of gap that only shows up in a real game:

     · The CLOCK. chess_clock_state() has been winding the mover's time down
       since tournaments shipped, and the board rendered none of it. A three
       minute game whose clock you cannot see is not a three minute game — it
       is a game you lose without warning.
     · VARIANT STATE. A King-of-the-Hill player could not see which squares
       win; a three-check player could not see the score; a Chess960 player
       could not see which of the 960 positions they were in. Each is
       information the rules make decisive, so leaving it off the board makes
       the board an incomplete statement of the position.

   Run:  node tests/chess-board.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.BOARD_PORT || 8231;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_board_fixture.html');

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

const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 3';
const OPEN    = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

/* The seats are the same in every fixture; only the clock and the variant
   change, which is what keeps each assertion about one thing. */
const BASE_GAME = {
  matchId: 'MT-B', game: 'chess', status: 'active', you: 'A', yourColour: 'w',
  yourTurn: true, ply: 4, state: ITALIAN, turnColour: 'w', check: false, checkSquare: '',
  lastMove: { from: 'f1', to: 'c4' }, timeControl: '3+2', rated: true,
  players: { A: { id: 'ME', name: 'You' }, B: { id: 'THEM', name: 'Emeka N.' } },
  moves: [{ ply: 1, san: 'e4' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'Nf3' }, { ply: 4, san: 'Nc6' }],
  reactions: [], legal: ['e1g1', 'c4f7'], staffView: false,
  variant: 'standard', variantData: null, startFen: '',
};

function clock(o) {
  return Object.assign({ timeControl: '3+2', live: true, running: true, initialMs: 180000,
                         incrementMs: 2000, whiteMs: 154000, blackMs: 161000, turn: 'w',
                         flagged: '', serverNowMs: 0 }, o || {});
}

const GAMES = {
  // A running blitz clock, white to move.
  live: Object.assign({}, BASE_GAME, { clock: clock() }),
  // White in real trouble; black comfortable.
  low: Object.assign({}, BASE_GAME, { clock: clock({ whiteMs: 24000, blackMs: 96000 }) }),
  crit: Object.assign({}, BASE_GAME, { clock: clock({ whiteMs: 7400, blackMs: 96000 }) }),
  // Flagged: the server has already decided.
  flagged: Object.assign({}, BASE_GAME, {
    status: 'complete', yourTurn: false, result: 'win', winnerId: 'THEM', reason: 'timeout',
    clock: clock({ running: false, whiteMs: 0, blackMs: 42000, turn: '', flagged: 'w' }) }),
  // Correspondence: a deadline, not a countdown.
  daily: Object.assign({}, BASE_GAME, { timeControl: '1day', clock: {
    timeControl: '1day', live: false, running: false, initialMs: 0, incrementMs: 0,
    whiteMs: 0, blackMs: 0, turn: '', flagged: '', deadlineMs: Date.now() + 3600000 * 30 } }),
  // Chess960 — the position number is how a coach sets the same one up again.
  c960: Object.assign({}, BASE_GAME, {
    variant: 'chess960', variantData: { positionId: 42 }, startFen: OPEN, clock: clock() }),
  // King of the Hill — four squares decide the game.
  koth: Object.assign({}, BASE_GAME, { variant: 'kingofthehill', variantData: null, clock: clock() }),
  // Three-check — white has given two, black one.
  three: Object.assign({}, BASE_GAME, {
    variant: 'threecheck', variantData: { checks: { w: 2, b: 1 } }, clock: clock() }),
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  chess board: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fbf7ed;padding:16px}</style>
</head><body class="cm-app"><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__games = ${JSON.stringify(GAMES)};
  window.__which = 'live';
  window.__sent = null;
  NGGApi.member.match.get = () => Promise.resolve({ ok: true, match: window.__games[window.__which] });
  // Polling would replace the fixture's clock reading mid-assertion. The
  // countdown under test is the LOCAL one between readings, so the poll is
  // pinned to "nothing changed".
  NGGApi.member.match.poll = () => Promise.resolve({ ok: true, changed: false, status: 'active' });
  NGGApi.member.match.move = () => Promise.resolve({ ok: true });
  NGGApi.member.match.challenge = (d) => { window.__sent = d; return Promise.resolve({ ok: true }); };
  // The finished-game screen carries a popup promotion and offers a review.
  // Neither is what this file tests, so both are stubbed to "nothing to show".
  NGGApi.member.promo = () => Promise.resolve({ ok: true, promo: null });
  NGGApi.member.promoTrack = () => Promise.resolve({ ok: true });
  NGGApi.member.match.review = () => Promise.resolve({ ok: true, review: null });

  let root = null;
  window.__render = (what, props) => {
    if (!root) root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(window[what], props));
  };
  window.__unmount = () => { if (root) { root.unmount(); root = null; } };
  window.__board = (which) => {
    window.__unmount(); window.__which = which;
    window.__render('MatchGame', { matchId: 'MT-B', onBack: () => {} });
  };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 1180, height: 980 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_board_fixture.html', { waitUntil: 'networkidle' });

    const show = async (which, sel) => {
      await page.evaluate(w => window.__board(w), which);
      try {
        await page.waitForSelector(sel || '.mtg-board', { timeout: 8000 });
      } catch (e) {
        console.log('  ! could not render "' + which + '": ' + (errors[0] || e.message));
        throw e;
      }
    };
    const clocks = () => page.locator('.mtg-clock');
    const clockText = async () => (await clocks().allInnerTexts()).map(t => t.split('\n')[0].trim());

    /* ── The clock ───────────────────────────────────────────────────────── */

    await show('live', '.mtg-clock');
    chk('the board renders without a page error', errors.length === 0);
    chk('a live game shows a clock for both players', await clocks().count() === 2);
    chk('…and only the side to move is running',
        await page.locator('.mtg-clock.is-running').count() === 1);
    chk('…which is the side the server says is on move', await page.evaluate(() => {
      // The bottom seat is White here (you are White and the board is unflipped).
      const seats = document.querySelectorAll('.mtg-seat');
      return seats[1].querySelector('.mtg-clock').classList.contains('is-running');
    }));

    const before = await clockText();
    await page.waitForTimeout(1400);
    const after = await clockText();
    chk('the running clock counts down between polls',
        before[1] !== after[1] && before[1] > after[1]);
    chk('…and the idle one does not move', before[0] === after[0]);

    /* A live region firing twice a second is unusable with a screen reader.
       The ticking figure is hidden from the accessibility tree; the spoken
       form beside it is readable on demand and never announced. */
    chk('the ticking figure is not announced twice a second',
        await page.locator('.mtg-clock span[aria-hidden="true"]').count() === 2
        && await page.locator('.mtg-clock [aria-live="polite"]').count() === 0
        && await page.locator('.mtg-clock [aria-live="assertive"]').count() <= 1);
    chk('…but the time is still readable as words, not just "2:34"',
        (await page.locator('.mtg-clock .sr-only').first().innerText()).indexOf('second') >= 0
        || (await page.locator('.mtg-clock .sr-only').first().innerText()).indexOf('minute') >= 0);

    await show('low', '.mtg-clock.is-low');
    chk('under thirty seconds the clock changes state', await page.locator('.mtg-clock.is-low').count() === 1);
    chk('…and only for the player it applies to',
        await page.locator('.mtg-clock.is-crit').count() === 0);

    await show('crit', '.mtg-clock.is-crit');
    chk('under ten seconds it changes again', await page.locator('.mtg-clock.is-crit').count() === 1);
    chk('…and shows tenths, because whole seconds are useless at that point',
        /\d\.\d/.test((await clockText())[1]));

    await show('flagged', '.mtg-clock.is-out');
    chk('a player who ran out reads as out of time, not as 0:00 still ticking',
        await page.locator('.mtg-clock.is-out').count() === 1
        && await page.locator('.mtg-clock.is-running').count() === 0);
    chk('…and says so in words too, not by colour alone',
        (await page.locator('.mtg-clock.is-out .sr-only').first().innerText()).toLowerCase().includes('out of time'));

    await show('daily', '.mtg-clock.is-daily');
    /* One deadline, on the seat it belongs to. Showing it on both says the
       player who is waiting is also on a clock, which is not true. */
    chk('a correspondence game shows a deadline, not a countdown',
        await page.locator('.mtg-clock.is-daily').count() === 1
        && !/\d:\d\d/.test((await clockText())[0]));
    chk('…on the seat of whoever has to move', await page.evaluate(() => {
      const seats = document.querySelectorAll('.mtg-seat');
      return !seats[0].querySelector('.mtg-clock') && !!seats[1].querySelector('.mtg-clock');
    }));
    chk('…in a unit a child can act on', /\d+[dhm]/.test((await clockText())[0]));

    /* ── The terms, on the board ─────────────────────────────────────────── */

    /* The terms live in the header now rather than in a chip row under it —
       the design titles a board screen with them, and a chip row repeating the
       title was the same sentence twice. The PROPERTY under test is unchanged:
       a player who opened this from a notification can see what game it is. */
    await show('live', '.mtg-head');
    const terms = await page.locator('.mtg-head').innerText();
    chk('the board states the terms the game was agreed on',
        terms.includes('3+2') && terms.toLowerCase().includes('casual') === false
        && terms.toLowerCase().includes('rated'));
    chk('an ordinary game gets no variant rule to read', await page.locator('.mtg-vrule').count() === 0);
    chk('…and its title names the pace rather than the variant',
        (await page.locator('.mtg-h').innerText()).toLowerCase().includes('blitz'));
    chk('…and no marked squares', await page.locator('.mtg-sq.is-goal').count() === 0);
    chk('…and no check pips', await page.locator('.mtg-checks').count() === 0);

    /* ── Chess960 ────────────────────────────────────────────────────────── */

    await show('c960', '.mtg-vrule');
    chk('a Chess960 game says which of the 960 positions it is',
        (await page.locator('.mtg-head').innerText()).includes('42'));
    chk('…and says what the variant does, on the board rather than only in the challenge',
        (await page.locator('.mtg-vrule').innerText()).toLowerCase().includes('shuffled'));

    /* ── King of the Hill ────────────────────────────────────────────────── */

    await show('koth', '.mtg-sq.is-goal');
    chk('King of the Hill marks the four squares that win it',
        await page.locator('.mtg-sq.is-goal').count() === 4);
    chk('…and they are the right four', await page.evaluate(() => {
      const got = Array.from(document.querySelectorAll('.mtg-sq.is-goal'))
        .map(e => e.getAttribute('data-sq')).sort().join(',');
      return got === 'd4,d5,e4,e5';
    }));
    /* A ring drawn on a board is invisible to a screen reader, so the square
       has to say it. Colour and shape are never the only signal. */
    chk('…and each says so, rather than being a drawing only',
        (await page.locator('.mtg-sq[data-sq="e4"]').getAttribute('aria-label')).includes('hill square'));

    /* ── Three-check ─────────────────────────────────────────────────────── */

    await show('three', '.mtg-checks');
    chk('a three-check game shows a score for each player',
        await page.locator('.mtg-checks').count() === 2);
    chk('…filled to the number each has actually given', await page.evaluate(() => {
      const seats = document.querySelectorAll('.mtg-seat');
      const on = (i) => seats[i].querySelectorAll('.mtg-check-pip.is-on').length;
      // Board unflipped: top seat is Black (1 check), bottom is White (2).
      return on(0) === 1 && on(1) === 2;
    }));
    chk('…and the score follows the player when the board is flipped', await (async () => {
      await page.locator('.mtg-flip').click();
      await page.waitForTimeout(150);
      return await page.evaluate(() => {
        const seats = document.querySelectorAll('.mtg-seat');
        const on = (i) => seats[i].querySelectorAll('.mtg-check-pip.is-on').length;
        return on(0) === 2 && on(1) === 1;    // seats swapped, scores with them
      });
    })());
    /* Painted, not merely present: a span is inline by default, and width and
       height on an inline box are ignored — a pip with no size is a pip nobody
       can see. */
    chk('…and each pip is actually drawn, not a zero-sized span', await page.evaluate(() => {
      const p = document.querySelector('.mtg-check-pip');
      const r = p && p.getBoundingClientRect();
      return !!r && r.width >= 8 && r.height >= 8;
    }));
    chk('…and it is a number to a screen reader, not three unlabelled dots',
        (await page.locator('.mtg-checks').first().getAttribute('aria-label')).indexOf('of 3 checks') >= 0);

    /* ── Choosing a variant when the game is agreed ──────────────────────── */

    await page.evaluate(() => {
      window.__unmount();
      window.__render('CmChessChallengeSheet', {
        player: { id: 'THEM', name: 'Emeka N.', rating: 1240 },
        onClose: () => {}, onSent: () => {},
      });
    });
    await page.waitForSelector('.cmc-opts', { timeout: 8000 });
    const opts = page.locator('.cmc-opt');
    chk('the challenge sheet offers every variant',
        (await opts.allInnerTexts()).join(' ').includes('King of the Hill'));
    chk('…and a standard game is what it starts on',
        (await page.locator('.cmc-opt.is-on').allInnerTexts()).join(' ').includes('Standard'));

    const ratedBox = page.locator('.cmm-check input').first();
    chk('a standard game can be rated', !(await ratedBox.isDisabled()) && await ratedBox.isChecked());

    await page.locator('.cmc-opt', { hasText: 'King of the Hill' }).click();
    chk('picking a variant explains its rule before the game exists',
        (await page.locator('.cmc-vrule').innerText()).indexOf('d4') >= 0);
    /* One rating cannot measure two different games. The server corrects a
       request that disagrees; the sheet says so first, so nobody is surprised
       by a result that did not move their rating. */
    chk('…and a variant that changes what winning is locks the rating off',
        await ratedBox.isDisabled() && !(await ratedBox.isChecked()));
    chk('…saying why, in the label rather than nowhere',
        (await page.locator('.cmm-check').first().innerText()).toLowerCase().includes('casual'));

    await page.locator('.cmm-cta').click();
    await page.waitForFunction(() => window.__sent, null, { timeout: 5000 });
    const sent = await page.evaluate(() => window.__sent);
    chk('the challenge carries the variant', sent.variant === 'kingofthehill');
    chk('…and is sent casual, whatever the box had been ticked to', sent.rated === false);

    if (errors.length) console.log('  page errors: ' + errors.join(' | '));
    chk('no page errors across the whole run', errors.length === 0);

  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (chess board)');
  process.exit(failed ? 1 : 0);
})();
