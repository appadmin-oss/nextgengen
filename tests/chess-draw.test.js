#!/usr/bin/env node
/* ============================================================================
   Offering a draw (6A §4).

   A draw is the only result two children have to agree on, and every rule that
   matters here is about the conversation rather than the position. The server
   owns those rules and they are tested in api/tests/run.php. What is tested
   HERE is the part a child touches:

     · the offer arrives on the opponent's screen at all — it moves no piece,
       so the ply-based poll cannot see it, and without a second signal the
       opponent would find out by making the move that answers it;
     · the button says what pressing it will DO, which is not the same word in
       both directions: against a live offer, "Offer draw" accepts it;
     · a refusal is spoken. The server declines a second offer in the same
       position, and a button that refuses in silence is a broken button;
     · a watcher is asked nothing, because it is not their game.

   Run:  node tests/chess-draw.test.js
   Skips with a pass if playwright isn't installed, like the other E2E tests.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.DRAW_PORT || 8241;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_draw_fixture.html');

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

/* An ordinary live game, four plies in. You are White and it is your move. */
const GAME = {
  matchId: 'MT-DRAW', game: 'chess', status: 'active', you: 'A', yourColour: 'w',
  yourTurn: true, ply: 4, turnPlayer: 'ME',
  state: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  turnColour: 'w', check: false, checkSquare: '', result: '', winnerId: '', reason: '',
  timeControl: '10+0', rated: true, variant: 'standard', variantData: null, startFen: '',
  centre: 'Egbeda', board: 0, tournamentId: '', channelSlug: '', flagged: false,
  players: { A: { id: 'ME', name: 'You', rating: 1240 },
             B: { id: 'THEM', name: 'Emeka N.', rating: 1310 } },
  ratingDelta: 0, clock: null, lastMove: { from: 'g1', to: 'f3' },
  moves: [{ ply: 1, move: 'e2e4', san: 'e4', playerId: 'ME' },
          { ply: 2, move: 'e7e5', san: 'e5', playerId: 'THEM' },
          { ply: 3, move: 'g1f3', san: 'Nf3', playerId: 'ME' }],
  reactions: [], legal: [], staffView: false, spectator: false,
  drawPending: false, drawOffered: false,
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  draw offers: skipped (playwright not installed)'); process.exit(0); }
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
  window.__calls = [];
  window.__drawFails = null;          // set to a message to make the next call reject
  /* The poll answers with whatever the current fixture says, so a test can
     change the fixture and let the app find out the way it really would. */
  window.__pollHits = 0;
  /* A COPY, not the fixture itself. The server hands the board a fresh object
     on every read; handing it the same one the test mutates would make the
     app's state and the test's fixture the same object, and the test would
     prove nothing about whether the poll noticed anything. */
  NGGApi.member.match.get = () => Promise.resolve({ ok: true, match: JSON.parse(JSON.stringify(window.__game)) });
  NGGApi.member.match.poll = () => {
    window.__pollHits++;
    return Promise.resolve({ ok: true, ply: window.__game.ply, status: window.__game.status,
      yourTurn: window.__game.yourTurn, changed: false, clock: null,
      drawPending: !!window.__game.drawPending, drawOffered: !!window.__game.drawOffered });
  };
  NGGApi.member.match.draw = (id, act) => {
    window.__calls.push(act);
    if (window.__drawFails) {
      const msg = window.__drawFails; window.__drawFails = null;
      return Promise.reject(new Error(msg));
    }
    return Promise.resolve({ ok: true, outcome: act === 'offer' ? 'offered' : act + 'd' });
  };
  NGGApi.member.match.react = () => Promise.resolve({ ok: true });
  NGGApi.member.match.resign = () => Promise.resolve({ ok: true });
  NGGApi.member.match.report = () => Promise.resolve({ ok: true });
  NGGApi.member.promo = () => Promise.resolve({ ok: true, promo: null });
  NGGApi.member.promoTrack = () => Promise.resolve({ ok: true });
  let root = null;
  window.__render = (props) => {
    if (!root) root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(window.MatchGame, props));
  };
  window.__remount = () => { if (root) { root.unmount(); root = null; } };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    /* 420px: a phone. Wide enough to be the real board screen, narrow enough
       that the desktop rail does not mount and start asking for other games. */
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_draw_fixture.html', { waitUntil: 'load' });

    const mount = async (patch) => {
      await page.evaluate((p) => {
        Object.assign(window.__game, p);
        window.__remount();
        window.__render({ matchId: 'MT-DRAW', onBack: () => {} });
      }, patch || {});
      await page.waitForSelector('.mtg-acts', { timeout: 8000 });
    };

    /* ── Nothing offered ─────────────────────────────────────────────────── */
    console.log('\n── An ordinary game ──────────────────────────────────────────');

    await mount({ drawPending: false, drawOffered: false });
    chk('the board renders with no script error', errors.length === 0);
    chk('the design\'s three controls are there, in its order: draw, resign, flip',
        (await page.locator('.mtg-acts .mtg-act').evaluateAll(
          els => els.map(e => (e.getAttribute('aria-label') || e.innerText)
            .replace(/\s+/g, ' ').trim().toLowerCase().replace(/[^a-z ]/g, '').trim())).then(a => a.join('|')))
        === 'offer draw|resign|flip the board');
    /* The two labelled buttons have to hold their words on one line. With the
       flip carrying a word too, "Offer draw" wrapped in a 320px panel and the
       row came out ragged. */
    chk('…and no label wraps onto a second line',
        await page.locator('.mtg-acts .mtg-act').evaluateAll(
          els => els.every(e => e.getBoundingClientRect().height < 60)));
    chk('…and no banner, because nobody has offered anything',
        await page.locator('.mtg-draw').count() === 0);
    /* 2.5.8 asks for 24×24; the artboard draws these at 40 and they must at
       least be that, or the row has quietly collapsed. */
    const actBoxes = await page.locator('.mtg-acts .mtg-act').evaluateAll(
      els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    chk('…and every one of them is a real target (' + actBoxes.map(b => b.join('×')).join(', ') + ')',
        actBoxes.length === 3 && actBoxes.every(([w, h]) => w >= 40 && h >= 40));

    await page.locator('.mtg-acts .mtg-act').first().click();
    await page.waitForTimeout(150);
    chk('pressing it offers a draw',
        (await page.evaluate(() => window.__calls)).join(',') === 'offer');

    /* ── Your offer is out ───────────────────────────────────────────────── */
    console.log('\n── Waiting for them ──────────────────────────────────────────');

    await mount({ drawPending: false, drawOffered: true });
    chk('the screen says the offer is with them, by name',
        (await page.locator('.mtg-draw').innerText()).includes('Emeka N.'));
    chk('…and says the game carries on while you wait',
        /play on/i.test(await page.locator('.mtg-draw').innerText()));
    chk('…and asks the offerer to answer nothing',
        await page.locator('.mtg-draw-yes, .mtg-draw-no').count() === 0);

    /* ── They offered ────────────────────────────────────────────────────── */
    console.log('\n── They have offered ─────────────────────────────────────────');

    await mount({ drawPending: true, drawOffered: false });
    chk('the prompt names who offered',
        (await page.locator('.mtg-draw.is-ask').innerText()).includes('Emeka N. offers a draw'));
    chk('…and it is announced rather than only drawn',
        await page.locator('.mtg-draw.is-ask').getAttribute('role') === 'status');
    chk('…with both answers on the screen, not one and a way back',
        await page.locator('.mtg-draw-yes').count() === 1 && await page.locator('.mtg-draw-no').count() === 1);
    const ansBoxes = await page.locator('.mtg-draw-yes, .mtg-draw-no').evaluateAll(
      els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    chk('…and both clear 44px, because one of them ends the game ('
        + ansBoxes.map(b => b.join('×')).join(', ') + ')',
        ansBoxes.length === 2 && ansBoxes.every(([w, h]) => w >= 44 && h >= 44));
    chk('…and Accept says what accepting costs, for somebody who cannot see the board',
        /half a point/i.test(await page.locator('.mtg-draw-yes').innerText()));
    /* The label has to change with the meaning. Pressing "Offer draw" against
       a live offer accepts it, and a button that will not admit that is one
       that lies to a child about what they are about to do. */
    chk('the footer button now reads Accept draw, because that is what it will do',
        (await page.locator('.mtg-acts .mtg-act').first().innerText()).toLowerCase().includes('accept draw'));

    await page.evaluate(() => { window.__calls = []; });
    await page.locator('.mtg-draw-no').click();
    await page.waitForTimeout(150);
    chk('Decline declines',
        (await page.evaluate(() => window.__calls)).join(',') === 'decline');

    await mount({ drawPending: true, drawOffered: false });
    await page.evaluate(() => { window.__calls = []; });
    await page.locator('.mtg-draw-yes').click();
    await page.waitForTimeout(150);
    chk('Accept accepts',
        (await page.evaluate(() => window.__calls)).join(',') === 'accept');

    /* ── A refusal has to be spoken ──────────────────────────────────────── */
    console.log('\n── When the server says no ───────────────────────────────────');

    await mount({ drawPending: false, drawOffered: false });
    await page.evaluate(() => {
      window.__drawFails = 'You have already offered a draw in this position. Make a move first.';
    });
    await page.locator('.mtg-acts .mtg-act').first().click();
    await page.waitForSelector('.mtg-draw.is-note', { timeout: 4000 });
    chk('a refused offer says why, in the server\'s own words',
        (await page.locator('.mtg-draw.is-note').innerText())
          .includes('already offered a draw in this position'));
    await page.locator('.mtg-draw-x').click();
    await page.waitForTimeout(100);
    chk('…and the reader can put it away',
        await page.locator('.mtg-draw.is-note').count() === 0);

    /* ── The poll is the only way this can arrive ────────────────────────── */
    console.log('\n── It has to arrive without a move ───────────────────────────');

    await mount({ drawPending: false, drawOffered: false });
    chk('no prompt yet', await page.locator('.mtg-draw').count() === 0);
    /* No move is played. The ply does not change, so `changed` stays false —
       this is exactly the case the ply-based poll cannot see on its own. */
    await page.evaluate(() => { window.__game.drawPending = true; });
    await page.waitForSelector('.mtg-draw.is-ask', { timeout: 12000 });
    chk('…and it appears on the next poll anyway, with the position untouched',
        await page.locator('.mtg-draw.is-ask').count() === 1
        && await page.evaluate(() => window.__game.ply) === 4);

    /* ── A watcher is not part of the conversation ───────────────────────── */
    console.log('\n── Somebody watching ─────────────────────────────────────────');

    await mount({ you: '', yourColour: '', yourTurn: false, spectator: true,
                  drawPending: false, drawOffered: false });
    chk('a watcher is offered no draw button — it is not their game',
        !(await page.locator('.mtg-acts').innerText()).toLowerCase().includes('draw')
        && await page.locator('.mtg-acts .mtg-act[aria-label*="raw"]').count() === 0);
    chk('…and only Flip is left, which is theirs to press',
        await page.locator('.mtg-acts .mtg-act[aria-label="Flip the board"]').count() === 1
        && await page.locator('.mtg-acts .mtg-act').count() === 1);

    chk('nothing threw across the whole run' + (errors.length ? ': ' + errors[0] : ''),
        errors.length === 0);

    await page.close();
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (draw offers)');
  process.exit(failed === 0 ? 0 : 1);
})();
