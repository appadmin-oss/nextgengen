#!/usr/bin/env node
/* ============================================================================
   "Online in club · N" — the middle card of the desktop game rail (6A §4).

   The rail answers three questions in order: what am I already playing, is
   there anybody to play right now, and what is going spare. The middle one was
   missing, so a child sitting at a board on a laptop had no way to see that
   four other people were on and no way to ask one of them for a game.

   What is tested here is mostly honesty, because presence is the easiest thing
   in an interface to lie about:

     · the count is the number of people actually offered, not the number the
       server happened to return;
     · somebody you are already playing is not offered as a challenge — you
       have a game with them, it is in the card above;
     · a mentor is shown as a mentor rather than as a rating, because their
       rating is not what you are choosing on;
     · "online" is stated in words in the heading, so the green dot is
       decorative and the meaning survives without colour;
     · with nobody on, the empty state says what "on" means. Fifteen minutes
       is the window, and a green dot that means "was here a quarter of an hour
       ago" needs to say so somewhere.

   Run:  node tests/chess-rail.test.js
   Skips with a pass if playwright isn't installed, like the other E2E tests.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RAIL_PORT || 8243;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_rail_fixture.html');

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

const GAME = {
  matchId: 'MT-RAIL', game: 'chess', status: 'active', you: 'A', yourColour: 'w',
  yourTurn: true, ply: 2, turnPlayer: 'ME',
  state: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  turnColour: 'w', check: false, checkSquare: '', result: '', winnerId: '', reason: '',
  timeControl: '10+0', rated: true, variant: 'standard', variantData: null, startFen: '',
  centre: 'Egbeda', board: 0, tournamentId: '', channelSlug: '', flagged: false,
  players: { A: { id: 'ME', name: 'You', rating: 1240 },
             B: { id: 'THEM', name: 'Emeka N.', rating: 1310 } },
  ratingDelta: 0, clock: null, lastMove: { from: 'e7', to: 'e5' },
  moves: [{ ply: 1, move: 'e2e4', san: 'e4', playerId: 'ME' },
          { ply: 2, move: 'e7e5', san: 'e5', playerId: 'THEM' }],
  reactions: [], legal: [], staffView: false, spectator: false,
  drawPending: false, drawOffered: false,
};

/* Two other games: one live against TUNDE, one finished. Only the live one
   should take its opponent out of the "who can I play" list. */
const OTHERS = [
  { matchId: 'MT-A', game: 'chess', status: 'active', you: 'A', yourTurn: true,
    players: { A: { id: 'ME', name: 'You' }, B: { id: 'TUNDE', name: 'Tunde A.' } } },
  { matchId: 'MT-OLD', game: 'chess', status: 'complete', you: 'B', yourTurn: false,
    players: { A: { id: 'BAYO', name: 'Bayo K.' }, B: { id: 'ME', name: 'You' } } },
];

/* What chess.players answers with online:1 — plus one straggler whose window
   has closed, to prove the count is of who is actually offered. */
const PEOPLE = [
  { id: 'BAYO',   name: 'Bayo K.',    rating: 1305, mentor: false, online: true,  centre: 'Egbeda', kind: 'member' },
  { id: 'MARIAM', name: 'Mariam S.',  rating: 1120, mentor: false, online: true,  centre: 'Egbeda', kind: 'member' },
  { id: 'BISI',   name: 'Coach Bisi', rating: 0,    mentor: true,  online: true,  centre: 'Egbeda', kind: 'volunteer' },
  { id: 'TUNDE',  name: 'Tunde A.',   rating: 1190, mentor: false, online: true,  centre: 'Egbeda', kind: 'member' },
  { id: 'GONE',   name: 'Halima N.',  rating: 1240, mentor: false, online: false, centre: 'Egbeda', kind: 'member' },
];

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  game rail: skipped (playwright not installed)'); process.exit(0); }
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
  window.__game   = ${JSON.stringify(GAME)};
  window.__others = ${JSON.stringify(OTHERS)};
  window.__people = ${JSON.stringify(PEOPLE)};
  window.__asked  = [];          // what chess.players was asked for
  window.__sent   = null;        // the challenge that went out
  const copy = (v) => JSON.parse(JSON.stringify(v));
  NGGApi.member.match.get = () => Promise.resolve({ ok: true, match: copy(window.__game) });
  NGGApi.member.match.poll = () => Promise.resolve({ ok: true, ply: window.__game.ply,
    status: 'active', yourTurn: true, changed: false, clock: null,
    drawPending: false, drawOffered: false });
  NGGApi.member.match.list = () => Promise.resolve({ ok: true, matches: copy(window.__others) });
  NGGApi.member.match.challenges = () => Promise.resolve({ ok: true, toYou: [], open: [], fromYou: [] });
  NGGApi.member.match.players = (q) => {
    window.__asked.push(q || {});
    return Promise.resolve({ ok: true, players: copy(window.__people) });
  };
  NGGApi.member.match.challenge = (d) => { window.__sent = d; return Promise.resolve({ ok: true }); };
  NGGApi.member.match.draw = () => Promise.resolve({ ok: true, outcome: 'offered' });
  NGGApi.member.match.react = () => Promise.resolve({ ok: true });
  NGGApi.member.match.resign = () => Promise.resolve({ ok: true });
  NGGApi.member.match.report = () => Promise.resolve({ ok: true });
  NGGApi.member.promo = () => Promise.resolve({ ok: true, promo: null });
  NGGApi.member.promoTrack = () => Promise.resolve({ ok: true });
  let root = null;
  window.__render = () => {
    if (!root) root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(window.MatchGame, { matchId: 'MT-RAIL', onBack: () => {} }));
  };
  window.__remount = () => { if (root) { root.unmount(); root = null; } };
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    /* 1440 wide: the rail only exists on a desktop, which is where the
       artboard draws it. */
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '/tests/_rail_fixture.html', { waitUntil: 'load' });

    const mount = async () => {
      await page.evaluate(() => { window.__remount(); window.__render(); });
      await page.waitForSelector('.mtg-rail-card', { timeout: 8000 });
      await page.waitForFunction(() => document.querySelectorAll('.mtg-rail-skel').length === 0,
                                 null, { timeout: 8000 });
    };

    console.log('\n── The rail the artboard draws ───────────────────────────────');

    await mount();
    chk('the board renders with no script error', errors.length === 0);
    const heads = (await page.locator('.mtg-rail-h').allInnerTexts()).map(t => t.trim());
    chk('three cards, in the artboard\'s order (' + heads.join(' / ') + ')',
        heads.length === 3
        && /^your games/i.test(heads[0])
        && /^online in club/i.test(heads[1])
        && /^open challenges/i.test(heads[2]));

    console.log('\n── Who is actually on ────────────────────────────────────────');

    const card = page.locator('.mtg-rail-card').nth(1);
    const rows = card.locator('.mtg-rail-row');
    const names = (await rows.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
    /* Four came back online, one of them is the opponent in a live game. */
    chk('somebody you are already playing is not offered as a challenge (' + names.join(' | ') + ')',
        !names.join(' ').includes('Tunde A.'));
    chk('…nor is somebody whose window has closed, however the server sorted them',
        !names.join(' ').includes('Halima N.'));
    /* A finished game is not a reason to leave a player out — that game is
       over, and playing them again is the whole point of the card. */
    chk('…but an old, finished game does not take a player out of the list',
        names.join(' ').includes('Bayo K.'));
    chk('the heading counts who is offered, not who came back',
        /^online in club · 3$/i.test(heads[1]));
    chk('a mentor is shown as a mentor, not as a rating',
        names.some(n => /Coach Bisi\s+mentor/.test(n)));
    chk('…and everybody else by their rating',
        names.some(n => /Bayo K\.\s+1305/.test(n)));

    console.log('\n── It does not depend on the dot being green ─────────────────');

    chk('the heading says "online" in words, so the colour is not the signal',
        /online/i.test(heads[1]));
    chk('…and the dot itself is hidden from a screen reader',
        await card.locator('.mtg-rail-dot[aria-hidden="true"]').count() === 3);
    chk('every row says what pressing it does, and to whom',
        (await rows.first().getAttribute('aria-label')) === 'Challenge Bayo K., rated 1305');
    const boxes = await rows.evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)];
    }));
    chk('…and is a real target (' + boxes.map(b => b.join('×')).join(', ') + ')',
        boxes.length === 3 && boxes.every(([w, h]) => w >= 40 && h >= 40));

    console.log('\n── Asking somebody for a game ────────────────────────────────');

    chk('the rail asks the server only for people who are on, at this centre',
        (await page.evaluate(() => window.__asked)).some(q => q && q.online && q.club));

    await rows.first().click();
    await page.waitForSelector('.cmm-sheet', { timeout: 4000 });
    chk('it opens the same sheet the search screen uses, named for the opponent',
        (await page.locator('.cmm-sheet-h').innerText()).trim() === 'Challenge Bayo K.');
    chk('…so the terms are still agreed before the board exists',
        (await page.locator('.cmm-sheet').innerText()).toUpperCase().includes('TIME CONTROL'));
    await page.locator('.cmm-sheet .cmm-cta').last().click();
    await page.waitForTimeout(200);
    const sent = await page.evaluate(() => window.__sent);
    chk('…and the challenge goes to the person whose row was pressed',
        !!sent && sent.opponentId === 'BAYO');
    chk('…and the sheet closes behind it',
        await page.locator('.cmm-sheet').count() === 0);

    console.log('\n── More than fits ────────────────────────────────────────────');

    /* Five rows fit beside a board. The heading counts everybody, so a list
       showing five under a heading reading 8 has quietly lost three people. */
    await page.evaluate(() => {
      window.__people = [];
      for (let i = 0; i < 8; i++) window.__people.push({
        id: 'P' + i, name: 'Player ' + i, rating: 1100 + i, mentor: false,
        online: true, centre: 'Egbeda', kind: 'member' });
    });
    await mount();
    const many = page.locator('.mtg-rail-card').nth(1);
    chk('with more people than fit, the heading still counts all of them',
        /online in club · 8$/i.test((await many.locator('.mtg-rail-h').innerText()).trim()));
    chk('…and the ones it could not draw are said out loud, not dropped',
        /and 3 more/i.test(await many.innerText())
        && await many.locator('.mtg-rail-row').count() === 5);

    console.log('\n── Nobody about ──────────────────────────────────────────────');

    await page.evaluate(() => { window.__people = []; });
    await mount();
    const empty = await page.locator('.mtg-rail-card').nth(1).innerText();
    chk('an empty card says so rather than showing a heading over nothing',
        /nobody has been on/i.test(empty));
    chk('…and says what "on" means, because 15 minutes is not "right now"',
        /15 minutes/.test(empty));
    chk('…and drops the count rather than printing "· 0"',
        !/·\s*0/.test(empty));

    chk('nothing threw across the whole run' + (errors.length ? ': ' + errors[0] : ''),
        errors.length === 0);

    await page.close();
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (game rail)');
  process.exit(failed === 0 ? 0 : 1);
})();
