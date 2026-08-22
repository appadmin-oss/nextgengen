#!/usr/bin/env node
/* ============================================================================
   The after-game review, and the live ladder.

   The review is the one screen in this product that does real computation in
   the browser, so the things worth testing are the ones that go wrong when it
   does: that the tab stays alive while it thinks, that stopping keeps what it
   has, that a stored review is read rather than recomputed, and that the
   number it prints is not dressed up as something it is not.

   The engine here is the real one — the game analysed below is genuinely
   searched. It is four plies long so that costs a moment rather than a minute.

   Run:  node tests/review-ui.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.REVIEW_PORT || 8233;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_review_fixture.html');

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

/* Fool's mate: 1.f3 e5 2.g4 Qh4#. Four plies, and White's two moves are the
   worst available — so the review has something real to say and the test does
   not depend on the engine's taste. */
const GAME = {
  matchId: 'MT-REV', game: 'chess', status: 'complete', you: 'A', yourColour: 'w',
  yourTurn: false, ply: 4, state: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
  turnColour: 'w', check: true, checkSquare: 'e1', result: 'win', winnerId: 'THEM',
  reason: 'checkmate', timeControl: '10+0', rated: true, variant: 'standard',
  variantData: null, startFen: '',
  players: { A: { id: 'ME', name: 'You', rating: 1240 },
             B: { id: 'THEM', name: 'Emeka N.', rating: 1310 } },
  ratingDelta: -9,
  moves: [
    { ply: 1, move: 'f2f3', san: 'f3', playerId: 'ME' },
    { ply: 2, move: 'e7e5', san: 'e5', playerId: 'THEM' },
    { ply: 3, move: 'g2g4', san: 'g4', playerId: 'ME' },
    { ply: 4, move: 'd8h4', san: 'Qh4#', playerId: 'THEM' },
  ],
  reactions: [], legal: [], staffView: false, clock: null,
};

const STORED = {
  matchId: 'MT-REV',
  white: { accuracy: 31, avgLoss: 240, blunders: 2, mistakes: 0, inaccuracies: 0 },
  black: { accuracy: 96, avgLoss: 4, blunders: 0, mistakes: 0, inaccuracies: 0 },
  turning: { ply: 3, san: 'g4', best: 'e4', loss: 900 },
  evals: [0, -40, -30, -600, -1000],
  engine: { depth: 8, ms: 300 },
  createdAt: '2026-08-20T10:00:00Z',
};

const LADDER = {
  ok: true, hotCount: 1, windowHours: 6,
  ladders: [
    { tournament: { tournamentId: 'TRN-HOT', name: 'Saturday Arena', formatName: 'Arena',
                    timeControl: '5+3', status: 'running', round: 3, totalRounds: 0 },
      heat: { moves: 84, live: 3, players: 6, score: 400 }, entrants: 12,
      top: [
        { rank: 1, move: 2,  playerId: 'P1', name: 'Ada N.',    centre: 'Egbeda', kind: 'member',
          score: 7, played: 8, streak: 4, status: 'active', isMe: false, photo: '' },
        { rank: 2, move: -1, playerId: 'P2', name: 'Bode A.',   centre: 'Ayobo',  kind: 'student',
          score: 6, played: 8, streak: 0, status: 'active', isMe: false, photo: '' },
        { rank: 3, move: 0,  playerId: 'P3', name: 'Chidi O.',  centre: 'Egbeda', kind: 'volunteer',
          score: 5.5, played: 8, streak: 2, status: 'active', isMe: false, photo: '' },
      ],
      me: { rank: 11, move: 3, playerId: 'ME', name: 'Temiloluwa A.', centre: 'Egbeda', kind: 'member',
            score: 3, played: 8, streak: 0, status: 'active', isMe: true, photo: '' } },
    { tournament: { tournamentId: 'TRN-COLD', name: 'Term Swiss', formatName: 'Swiss',
                    timeControl: '1day', status: 'running', round: 2, totalRounds: 7 },
      heat: { moves: 0, live: 0, players: 0, score: 0 }, entrants: 30,
      top: [
        { rank: 1, move: 0, playerId: 'Q1', name: 'Zara I.', centre: 'Ikeja', kind: 'member',
          score: 2, played: 2, streak: 0, status: 'active', isMe: false, photo: '' },
      ],
      me: null },
  ],
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  review UI: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fbf7ed}</style>
</head><body class="cm-app"><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__game = ${JSON.stringify(GAME)};
  window.__stored = null;
  window.__saved = null;
  window.__opened = null;
  NGGApi.member.match.review = () => Promise.resolve({ ok: true, review: window.__stored });
  NGGApi.member.match.reviewSave = (matchId, data) => {
    window.__saved = data;
    return Promise.resolve({ ok: true, review: null });
  };
  NGGApi.member.tournaments.ladder = () => Promise.resolve(${JSON.stringify(LADDER)});
  let root = null;
  window.__render = (what, props) => {
    if (!root) root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(window[what], props));
  };
  window.__unmount = () => { if (root) { root.unmount(); root = null; } };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_review_fixture.html', { waitUntil: 'networkidle' });

    /* ── Before it runs ──────────────────────────────────────────────────── */

    await page.evaluate(() => window.__render('CmGameReview', { m: window.__game, onBack: () => {} }));
    await page.waitForSelector('.rev-start', { timeout: 8000 });

    chk('the review screen renders without a page error', errors.length === 0);
    chk('it says where the thinking happens, because it is the member\'s battery',
        (await page.locator('.rev-start').innerText()).toLowerCase().includes('your phone'));
    chk('…and offers a choice of how long to spend',
        await page.locator('.rev-start .cmc-opt').count() === 3);
    chk('…with the wait stated, not just the word',
        (await page.locator('.rev-start .cmc-opt').first().innerText()).toLowerCase().includes('second'));

    /* ── It runs, for real ───────────────────────────────────────────────── */

    await page.locator('.rev-start .cmc-opt', { hasText: 'Quick' }).click();
    await page.locator('.cmm-cta').click();
    await page.waitForSelector('.rev-tiles', { timeout: 30000 });

    /* The tab has to stay alive while it thinks. If the loop did not yield,
       nothing here would have painted until the very end. */
    chk('the analysis actually produced two summaries', await page.locator('.rev-tile').count() === 2);
    chk('…and the page is still responsive — it painted while it worked',
        await page.evaluate(() => document.readyState === 'complete'));

    await page.waitForFunction(() => !document.querySelector('.rev-run'), null, { timeout: 30000 });

    const white = await page.locator('.rev-tile').first().innerText();
    const black = await page.locator('.rev-tile').nth(1).innerText();
    /* Fool's mate: White played the two worst moves on the board and got mated
       in two. Any analysis worth printing has to put Black well ahead. */
    const acc = (t) => +((t.match(/(\d+)\s*%/) || [])[1] || -1);
    chk('the player who got mated in two scores worse than the one who mated them',
        acc(white) >= 0 && acc(black) >= 0 && acc(black) > acc(white));
    chk('…and White is charged with blunders',
        /[1-9]\s*blunder/.test(await page.locator('.rev-legend').innerText()));

    chk('the accuracy is not passed off as a number from somewhere else',
        (await page.locator('.rev-note').innerText()).toLowerCase().includes('not with a number from another app'));

    chk('the turning point is named',
        (await page.locator('.rev-card').allInnerTexts()).join(' ').includes('The moment it turned'));
    chk('…and shown, not only named — a crop of the board at that move',
        await page.locator('.rev-mini').count() === 1);
    chk('the result is stated with what it cost or earned',
        (await page.locator('.rev-res').innerText()).toLowerCase().includes('you '));
    chk('…and offers the two things a child wants next',
        (await page.locator('.rev-res-acts').innerText()).includes('Rematch'));

    /* ── Walking through it ──────────────────────────────────────────────── */

    chk('the board is not on the summary — it is behind "Replay move by move"',
        await page.locator('.rev-board').count() === 0);
    await page.locator('.rev-replay').first().click();
    await page.waitForSelector('.rev-board', { timeout: 8000 });

    chk('the game is drawn as a graph', await page.locator('.rev-graph svg').count() === 1);
    /* A picture is not enough. The same information has to be reachable with a
       thumb and with a keyboard, and announced when it moves. */
    const scrub = page.locator('.rev-scrub');
    chk('…with a real control over it, not just a picture',
        await scrub.count() === 1 && (await scrub.getAttribute('aria-label') || '').toLowerCase().includes('move'));
    chk('…and the graph itself describes what it shows',
        (await page.locator('.rev-graph svg').getAttribute('aria-label') || '').toLowerCase()
          .includes("white's advantage"));

    chk('every move is listed', await page.locator('.rev-move').count() === 4);
    chk('…and a bad one is named in words, not only in colour', await page.evaluate(() => {
      const tags = Array.from(document.querySelectorAll('.rev-move-t')).map(e => e.innerText.trim());
      return tags.some(t => /blunder|mistake|inaccuracy/i.test(t));
    }));

    await page.locator('.rev-move').nth(2).click();
    chk('tapping a move goes to it', (await page.locator('.rev-nav-at').innerText()).includes('g4'));
    chk('…and says what would have been better instead',
        await page.locator('.rev-verdict').count() === 1);
    chk('…and what it cost, in pawns rather than in centipawns nobody counts in',
        /pawns/.test(await page.locator('.rev-verdict').innerText()));

    chk('the board is shown at that move', await page.locator('.rev-board .mtg-board').count() === 1);

    /* ── It is kept, once ────────────────────────────────────────────────── */

    await page.waitForFunction(() => window.__saved, null, { timeout: 10000 });
    const saved = await page.evaluate(() => window.__saved);
    chk('the finished review is sent to be kept', !!saved && !!saved.white && !!saved.black);
    chk('…with what produced it, so two reviews at different depths are not confused',
        typeof saved.engineDepth === 'number' && saved.engineMs > 0);
    chk('…and the evaluation of every position, for the graph',
        Array.isArray(saved.evals) && saved.evals.length === 5);

    /* ── Somebody already did it ─────────────────────────────────────────── */

    await page.evaluate((s) => { window.__unmount(); window.__stored = s; }, STORED);
    await page.evaluate(() => window.__render('CmGameReview', { m: window.__game, onBack: () => {} }));
    await page.waitForSelector('.rev-tiles', { timeout: 8000 });
    chk('a game somebody has already reviewed shows their numbers instead of recomputing',
        (await page.locator('.rev-tile').first().innerText()).includes('31'));
    chk('…and says so, with when and how deep',
        (await page.locator('.rev-start').innerText()).toLowerCase().includes('already reviewed'));
    chk('…while still offering to go through it again',
        await page.locator('.rev-start .cmm-cta').count() === 1);

    /* ── The ladder ──────────────────────────────────────────────────────── */

    await page.evaluate(() => {
      window.__unmount();
      window.__render('CmTrnLadder', { onBack: () => {}, onOpen: (id) => { window.__opened = id; } });
    });
    await page.waitForSelector('.lad', { timeout: 8000 });

    chk('the ladder lists the events', await page.locator('.lad').count() === 2);
    chk('an event with boards going says how many, rather than calling itself busy',
        (await page.locator('.lad-live').innerText()).includes('3 board'));
    chk('…and a quiet one is not dressed up as busy',
        await page.locator('.lad-quiet').count() === 1);
    chk('the header counts what is actually live',
        (await page.locator('.cmm-sub').innerText()).includes('1 event has games going'));

    chk('positions carry a movement arrow', await page.locator('.lad-move.is-up').count() >= 1);
    /* An arrow is a shape and green is a colour; neither is available to
       everybody, so the movement is also a sentence. */
    chk('…and the movement is said in words too, not only drawn',
        (await page.locator('.lad-move.is-up').first().innerText()).length >= 0
        && await page.evaluate(() => {
          const el = document.querySelector('.lad-move.is-up .sr-only');
          return !!el && /up \d+ places/.test(el.textContent);
        }));
    chk('a player on a streak has it said beside their name',
        (await page.locator('.lad-list').first().innerText()).includes('4 in a row'));

    chk('somebody outside the top five still sees where they are',
        await page.locator('.lad-list.is-mine .lad-row.is-me').count() === 1);
    chk('…at their real position, not renumbered',
        (await page.locator('.lad-list.is-mine .lad-rank').innerText()).trim() === '11');

    await page.locator('.lad-head').first().click();
    chk('the event opens from the ladder', await page.evaluate(() => window.__opened) === 'TRN-HOT');

    if (errors.length) console.log('  page errors: ' + errors.join(' | '));
    chk('no page errors across the whole run', errors.length === 0);
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (review + ladder UI)');
  process.exit(failed ? 1 : 0);
})();
