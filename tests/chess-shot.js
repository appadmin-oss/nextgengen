#!/usr/bin/env node
/* ============================================================================
   Chess screens — render the real production bundle and photograph it.

   Same trick as ui-smoke.js: mount the built bundle against a stubbed NGGApi
   and render one component into a root div. No API, no router, no service
   worker. That means what comes out is the actual shipped component with the
   actual shipped CSS, not a mock-up of it.

   Run:  node tests/chess-shot.js
   Out:  tests/screens/chess-*.png
   Env:  CHROMIUM_PATH, CHESS_PORT (default 8211).
   Skips with a pass if playwright isn't installed, like the other E2E suites.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CHESS_PORT || 8211;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_chess_fixture.html');
const OUT = path.join(ROOT, 'tests', 'screens');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

/* Positions are real games, so the boards in the shots are positions that can
   actually occur — a screenshot of an impossible position would be a good way
   to ship a broken board and never notice. */
const AFTER_1E4 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq e3 0 1'
  .replace('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
// Italian Game, a natural club position eight plies in.
const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
// Fool's mate — the finished-game screen.
const MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  chess shots: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:var(--cream-50,#fdf9f0);}/* The site's cursor sprite follows the pointer, and the harness's last click leaves it sitting in the middle of whatever it clicked. It photographed as a stray ring inside the Accuracy card for weeks. */.ngg-cursor:not(#_):not(#_){display:none}</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script>
  var Q = new URLSearchParams(location.search);
  var LOBBY = {
    ok: true,
    me: { id: 'NGG-2026-0044', centre: 'Egbeda', programme: 'ngg' },
    reactions: ['good-game','nice-move','thinking','oops','well-played','your-turn'],
    games: [{ key: 'chess', name: 'Chess', icon: '♟️' }],
    matches: [
      /* Ratings, a time control and a clock on every row, because the lobby
         card draws all three. A fixture that leaves them off photographs a
         card with holes in it and calls the screen finished. */
      { matchId: 'MT-1', game: 'chess', status: 'active', you: 'A', yourTurn: true, ply: 11,
        yourColour: 'w', timeControl: '10+0',
        clock: { live: true, running: true, turn: 'w', whiteMs: 252000, blackMs: 301000, flagged: '' },
        players: { A: { id: 'NGG-2026-0044', name: 'You', rating: 1240 },
                   B: { id: 'NGG-2026-0051', name: 'Temiloluwa A.', rating: 1198 } } },
      { matchId: 'MT-2', game: 'chess', status: 'active', you: 'B', yourTurn: true, ply: 3,
        yourColour: 'b', timeControl: '1day',
        clock: { live: false, running: false, deadlineMs: Date.now() + 61200000 },
        players: { A: { id: 'NGG-2026-0062', name: 'Chidinma O.', rating: 1105 },
                   B: { id: 'NGG-2026-0044', name: 'You', rating: 1240 } } },
      { matchId: 'MT-3', game: 'chess', status: 'active', you: 'A', yourTurn: false, ply: 12,
        yourColour: 'w', timeControl: '1day', lastMoveAt: '2026-08-22T06:10:00Z',
        clock: { live: false, running: false, deadlineMs: Date.now() + 40000000 },
        players: { A: { id: 'NGG-2026-0044', name: 'You', rating: 1240 },
                   B: { id: 'NGG-2026-0070', name: 'Ibrahim S.', rating: 1320 } } },
      { matchId: 'MT-4', game: 'chess', status: 'invited', you: 'B', yourTurn: false, ply: 0,
        players: { A: { id: 'NGG-2026-0081', name: 'Folasade B.' }, B: { id: 'NGG-2026-0044', name: 'You' } } },
      { matchId: 'MT-5', game: 'chess', status: 'invited', you: 'A', yourTurn: false, ply: 0,
        players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0093', name: 'Zainab K.' } } },
      { matchId: 'MT-6', game: 'chess', status: 'complete', you: 'A', yourTurn: false, ply: 41,
        result: 'win', winnerId: 'NGG-2026-0102', reason: 'checkmate',
        players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0102', name: 'Emeka N.' } } },
      { matchId: 'MT-7', game: 'chess', status: 'complete', you: 'B', yourTurn: false, ply: 88,
        result: 'draw', reason: 'threefold',
        players: { A: { id: 'NGG-2026-0110', name: 'Aisha M.' }, B: { id: 'NGG-2026-0044', name: 'You' } } }
    ],
    opponents: [
      { id: 'NGG-2026-0051', fullName: 'Temiloluwa Adeyemi', centre: 'Egbeda' },
      { id: 'NGG-2026-0062', fullName: 'Chidinma Okafor', centre: 'Egbeda' },
      { id: 'NGG-2026-0070', fullName: 'Ibrahim Suleiman', centre: 'Ayobo' },
      { id: 'NGG-2026-0081', fullName: 'Folasade Bakare', centre: 'Ikotun' },
      { id: 'NGG-2026-0093', fullName: 'Zainab Kolawole', centre: 'Ayobo' },
      { id: 'NGG-2026-0102', fullName: 'Emeka Nwosu', centre: 'Egbeda' }
    ]
  };
  var GAMES = {
    'MT-2': { matchId: 'MT-2', game: 'chess', status: 'active', you: 'B', yourColour: 'b',
      yourTurn: true, ply: 3, state: ${JSON.stringify(ITALIAN)},
      lastMove: { from: 'f1', to: 'c4' }, turnColour: 'b', check: false, checkSquare: '',
      players: { A: { id: 'NGG-2026-0062', name: 'Chidinma O.' }, B: { id: 'NGG-2026-0044', name: 'You' } },
      moves: [ { ply: 1, san: 'e4' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'Nf3' },
               { ply: 4, san: 'Nc6' }, { ply: 5, san: 'Bc4' } ],
      reactions: [ { ply: 2, playerId: 'NGG-2026-0062', reaction: 'nice-move' },
                   { ply: 4, playerId: 'NGG-2026-0044', reaction: 'thinking' } ],
      legal: ['g8f6','g8e7','f8e7','f8d6','f8c5','f8b4','f8a3','d8e7','d8f6','d8g5','d8h4',
              'e8e7','c6b8','c6d4','c6b4','c6a5','c6e7','a7a6','a7a5','b7b6','b7b5','d7d6','d7d5',
              'f7f6','f7f5','g7g6','g7g5','h7h6','h7h5'],
      staffView: false },
    'MT-CLK': { matchId: 'MT-CLK', game: 'chess', status: 'active', you: 'A', yourColour: 'w',
      yourTurn: true, ply: 5, state: ${JSON.stringify(ITALIAN)}, turnColour: 'w', check: false, checkSquare: '',
      lastMove: { from: 'f1', to: 'c4' }, timeControl: '3+2', rated: false,
      variant: 'threecheck', variantData: { checks: { w: 2, b: 1 } },
      clock: { timeControl: '3+2', live: true, running: true, initialMs: 180000, incrementMs: 2000,
               whiteMs: 27400, blackMs: 143000, turn: 'w', flagged: '', serverNowMs: 0 },
      players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0062', name: 'Chidinma O.' } },
      moves: [ { ply: 1, san: 'e4' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'Nf3' },
               { ply: 4, san: 'Nc6' }, { ply: 5, san: 'Bc4' } ],
      reactions: [], legal: ['e1g1', 'c4f7'], staffView: false },
    'MT-960': { matchId: 'MT-960', game: 'chess', status: 'active', you: 'A', yourColour: 'w',
      yourTurn: true, ply: 0, state: 'nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w KQkq - 0 1',
      turnColour: 'w', check: false, checkSquare: '', timeControl: '10+0', rated: true,
      variant: 'chess960', variantData: { positionId: 137 },
      startFen: 'nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w KQkq - 0 1',
      clock: { timeControl: '10+0', live: true, running: true, initialMs: 600000, incrementMs: 0,
               whiteMs: 600000, blackMs: 600000, turn: 'w', flagged: '', serverNowMs: 0 },
      players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0062', name: 'Chidinma O.' } },
      moves: [], reactions: [], legal: ['b2b4', 'g2g4'], staffView: false },
    'MT-KOTH': { matchId: 'MT-KOTH', game: 'chess', status: 'active', you: 'A', yourColour: 'w',
      yourTurn: true, ply: 5, state: ${JSON.stringify(ITALIAN)}, turnColour: 'w', check: false, checkSquare: '',
      lastMove: { from: 'f1', to: 'c4' }, timeControl: '1day', rated: false,
      variant: 'kingofthehill', variantData: null,
      clock: { timeControl: '1day', live: false, running: false, initialMs: 0, incrementMs: 0,
               whiteMs: 0, blackMs: 0, turn: '', flagged: '', deadlineMs: Date.now() + 3600000 * 19 },
      players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0062', name: 'Chidinma O.' } },
      moves: [ { ply: 1, san: 'e4' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'Nf3' },
               { ply: 4, san: 'Nc6' }, { ply: 5, san: 'Bc4' } ],
      reactions: [], legal: ['e1g1', 'c4f7'], staffView: false },
    'MT-6': { matchId: 'MT-6', game: 'chess', status: 'complete', you: 'A', yourColour: 'w',
      yourTurn: false, ply: 4, state: ${JSON.stringify(MATED)}, result: 'win',
      lastMove: { from: 'd8', to: 'h4' }, turnColour: 'w', check: true, checkSquare: 'e1',
      winnerId: 'NGG-2026-0102', reason: 'checkmate',
      players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0102', name: 'Emeka N.' } },
      moves: [ { ply: 1, san: 'f3' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'g4' }, { ply: 4, san: 'Qh4#' } ],
      reactions: [ { ply: 4, playerId: 'NGG-2026-0102', reaction: 'good-game' } ],
      legal: [], staffView: false },
    'MT-SC': { matchId: 'MT-SC', game: 'chess', status: 'complete', you: '', yourColour: '',
      yourTurn: false, ply: 4, state: ${JSON.stringify(MATED)}, centre: 'Egbeda',
      lastMove: { from: 'd8', to: 'h4' }, turnColour: 'w', check: true, checkSquare: 'e1',
      result: 'win', winnerId: 'NGG-2026-0051', reason: 'checkmate',
      players: { A: { id: 'NGG-2026-0062', name: 'Chidinma O.' }, B: { id: 'NGG-2026-0051', name: 'Temiloluwa A.' } },
      moves: [ { ply: 1, san: 'f3' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'g4' }, { ply: 4, san: 'Qh4#' } ],
      reactions: [], legal: [], staffView: true },
    'MT-SP': { matchId: 'MT-SP', game: 'chess', status: 'active', you: '', yourColour: '',
      yourTurn: false, ply: 5, state: ${JSON.stringify(ITALIAN)}, centre: 'Ayobo',
      lastMove: { from: 'f1', to: 'c4' }, turnColour: 'b', check: false, checkSquare: '',
      players: { A: { id: 'X1', name: 'Halima N.' }, B: { id: 'X2', name: 'Ibrahim S.' } },
      moves: [ { ply: 1, san: 'e4' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'Nf3' },
               { ply: 4, san: 'Nc6' }, { ply: 5, san: 'Bc4' } ],
      reactions: [], legal: [], staffView: false, spectator: true },
    'MT-S': { matchId: 'MT-S', game: 'chess', status: 'active', you: '', yourColour: '',
      yourTurn: false, ply: 5, state: ${JSON.stringify(ITALIAN)}, centre: 'Egbeda',
      lastMove: { from: 'f1', to: 'c4' }, turnColour: 'b', check: false, checkSquare: '',
      players: { A: { id: 'NGG-2026-0062', name: 'Chidinma O.' }, B: { id: 'NGG-2026-0044', name: 'Temiloluwa A.' } },
      moves: [ { ply: 1, san: 'e4' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'Nf3' },
               { ply: 4, san: 'Nc6' }, { ply: 5, san: 'Bc4' } ],
      reactions: [], legal: [], staffView: true, flagged: true }
  };
  function ok(v) { return Promise.resolve(v); }
  window.NGGApi = { member: {
    /* The lobby shot renders the REAL chess hub now, which asks for these. */
    tournaments: { browse: function () { return ok({ ok: true, tournaments: [], formats: {} }); },
                   ladder: function () { return ok({ ok: true, ladders: [], hotCount: 0, windowHours: 6 }); } },
    /* The finished-game screen carries a popup promotion. It is not what these
       shots are of, so it is stubbed to "nothing to show". */
    promo: function () { return ok({ ok: true, promo: null }); },
    promoTrack: function () { return ok({ ok: true }); },
    match: {
    list: function () { return ok(LOBBY); },
    get: function (id) { return ok({ ok: true, match: GAMES[id] }); },
    move: function () { return ok({ ok: true }); },
    react: function () { return ok({ ok: true }); },
    resign: function () { return ok({ ok: true }); },
    /* The desktop rail asks who is online. Two of them, so the card in the
       shot has something in it. */
    players: function () { return ok({ ok: true, players: [
      { id: 'X7', name: 'Bayo K.', rating: 1305, mentor: false, online: true,
        centre: 'Egbeda', kind: 'member', headToHead: '' },
      { id: 'X6', name: 'Coach Bisi', rating: 0, mentor: true, online: true,
        centre: 'Egbeda', kind: 'volunteer', headToHead: '' } ] }); },
    challenge: function () { return ok({ ok: true }); },
    draw: function () { return ok({ ok: true, outcome: 'offered' }); },
    report: function () { return ok({ ok: true }); },
    invite: function () { return ok({ ok: true, matchId: 'MT-1' }); },
    respond: function () { return ok({ ok: true }); },
    poll: function () { return ok({ ok: true, ply: 5, status: 'active', yourTurn: true, changed: false }); },
    lobby: function () { return ok({ ok: true, yourMove: 2, games: 3, challengesToYou: 1,
      openChallenges: 1, accepted: [], tournaments: 2, sig: 'x',
      arena: { tournamentId: 'TRN-1', name: 'Egbeda club arena', format: 'arena',
               status: 'open', startsAt: '2026-08-29T16:00:00Z', timeControl: '5+3',
               players: 14, joined: false } }); },
    challenges: function () { return ok({ ok: true, toYou: [
      { challengeId: 'CH-1', from: { id: 'X9', name: 'Zara I.', rating: 1180 }, timeControl: '5+3',
        rated: true, colourPref: 'random', createdAt: '2026-08-22T09:00:00Z' } ],
      open: [ { challengeId: 'CH-2', from: { id: 'X8', name: 'Mr Adewale', rating: 1400 },
        timeControl: '1day', rated: false, colourPref: 'random', createdAt: '2026-08-22T08:40:00Z' } ],
      fromYou: [] }); },
    /* FLAT, like chess_profile() actually answers. It used to be wrapped in a
       "profile" key here and nowhere else, so the shot photographed a header
       reading "Your rating" with no number in it and nobody noticed. */
    chess: function () { return ok({ ok: true, rating: 1240, games: 18, wins: 9, losses: 6,
      draws: 3, peak: 1263, provisional: false, weekDelta: 32, levels: [] }); },
    review: function () { return ok({ ok: true, review: null }); },
    watch: function () { return ok({ ok: true, live: [
      { matchId: 'MT-W1', game: 'chess', a: { id: 'X1', name: 'Halima N.', centre: 'Ayobo' },
        b: { id: 'X2', name: 'Ibrahim S.' }, ply: 14, mine: false, lastMoveAt: '2026-08-17T10:00:00Z' },
      { matchId: 'MT-W2', game: 'chess', a: { id: 'X3', name: 'Zainab K.', centre: 'Ikotun' },
        b: { id: 'X4', name: 'Emeka N.' }, ply: 6, mine: false, lastMoveAt: '2026-08-17T09:58:00Z' }
    ], recent: [] }); }
  } } };
  window.useAuth = function () { return { isSignedIn: true, isAdmin: false, member: { memberId: 'NGG-2026-0044' } }; };
</script>
<script src="/dist/app.js"></script>
<script>
  var screen = Q.get('screen');
  /* A PLAIN object, not window.useAuth(). The bundle loads after the stub
     above and brings its own real useAuth; calling that outside a component
     is an invalid hook call, which React reports as the cryptic #321. */
  var AUTH = { isSignedIn: true, isAdmin: false, member: { memberId: 'NGG-2026-0044' } };
  /* The community marks the body while it is mounted, and a good half of the
     chess styling is scoped to that class. Without it here the shots lie:
     dark cards render as invisible white-on-cream text. The real app adds it
     in CommunityPage, above every chess screen, so the fixture does too. */
  document.body.classList.add('cm-app');
  var el = screen === 'lobby' ? React.createElement(CmChess, { auth: AUTH, onOpenMatch: function () {}, onBack: function () {} })
         : React.createElement(MatchGame, { matchId: Q.get('id') || 'MT-2', onBack: function () {} });
  ReactDOM.createRoot(document.getElementById('root')).render(el);
</script>
</body></html>`);

  // The bundle is fingerprinted; point the fixture at whatever this build made.
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));
  fs.writeFileSync(FIX, fs.readFileSync(FIX, 'utf8').replace('/dist/app.js', '/dist/' + manifest.bundle.file));

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  let shots = 0, problems = [];
  try {
    await waitForServer(BASE + '/tests/_chess_fixture.html');
    const shoot = async (name, query, viewport) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message)));
      await page.goto(BASE + '/tests/_chess_fixture.html?' + query, { waitUntil: 'networkidle' });
      /* Long enough for the lobby's poll to land. It fires at 1200ms, and the
         tournament count and the arena card only exist once it has — a shot
         taken at 400ms photographed a screen still waiting for its data and
         called that the design. */
      await page.waitForTimeout(name.indexOf('lobby') === 0 ? 2200 : 400);
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);

      /* ── Desktop board mode, 6A §4 ──
         "the live game keeps the board at 560px". It did not. `.arc` caps the
         arcade shell at 980px and the game screen lives inside it, so on a
         1440px screen the dark room stopped at 980 with cream either side and
         the board — the object the screen exists to show — rendered at 318px.
         Checked here rather than in chess-board.test.js because only this
         harness renders the whole game screen, and only at the design's own
         canvas size did either number look wrong. */
      if (name === 'desk-1440') {
        const geo = await page.evaluate(() => {
          const g = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
          const shell = g('.mtg'), board = g('.mtg-board'), rail = g('.mtg-rail'), side = g('.mtg-side');
          return { shell: shell && Math.round(shell.width), board: board && Math.round(board.width),
                   sq: board && Math.abs(board.width - board.height) < 2,
                   rail: rail && Math.round(rail.width), side: side && Math.round(side.width),
                   gapL: board && rail ? Math.round(board.left - rail.right) : null,
                   gapR: board && side ? Math.round(side.left - board.right) : null };
        });
        if (!(geo.shell >= 1400)) problems.push('desk-1440: the room stops at ' + geo.shell + 'px on a 1440px screen');
        if (!(geo.board >= 552 && geo.board <= 568)) problems.push('desk-1440: board is ' + geo.board + 'px, 6A says 560');
        if (geo.sq !== true) problems.push('desk-1440: the board is not square');
        if (geo.rail !== 250 || geo.side !== 320) problems.push('desk-1440: rail/panel are ' + geo.rail + '/' + geo.side + ', not 250/320');
        if (!(geo.gapL > 0 && geo.gapR > 0 && Math.abs(geo.gapL - geo.gapR) < 40)) {
          problems.push('desk-1440: the board sits against one side (' + geo.gapL + ' / ' + geo.gapR + ')');
        }
        console.log('     board ' + geo.board + 'px in a ' + geo.shell + 'px room · rail ' + geo.rail
                    + ' · panel ' + geo.side + ' · gaps ' + geo.gapL + '/' + geo.gapR);
      }
      await page.screenshot({ path: path.join(OUT, 'chess-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 chess-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')' + (errs.length ? '  ⚠ ' + errs[0] : ''));
      await page.close();
    };
    /* The design's own canvas for the live game (6A §4 · 1440×780). */
    await shoot('desk-1440',   'screen=game&id=MT-2',    { width: 1440, height: 780 });
    await shoot('lobby',       'screen=lobby',           { width: 1180, height: 900 });
    await shoot('lobby-phone', 'screen=lobby',           { width: 390,  height: 844 });
    await shoot('game',        'screen=game&id=MT-2',    { width: 1180, height: 980 });
    await shoot('game-phone',  'screen=game&id=MT-2',    { width: 390,  height: 844 });
    // The clock and the variants — the surfaces that used to exist only on the
    // server, recorded here so a change to them shows up in a diff.
    await shoot('game-clock',  'screen=game&id=MT-CLK',  { width: 1180, height: 980 });
    await shoot('game-clock-phone', 'screen=game&id=MT-CLK', { width: 390, height: 844 });
    await shoot('game-960',    'screen=game&id=MT-960',  { width: 1180, height: 980 });
    await shoot('game-hill',   'screen=game&id=MT-KOTH', { width: 1180, height: 980 });
    await shoot('finished',    'screen=game&id=MT-6',    { width: 1180, height: 980 });
    await shoot('staff-view',  'screen=game&id=MT-S',    { width: 1180, height: 980 });
    // Anyone can watch: read-only, with the one control that matters.
    await shoot('spectator',   'screen=game&id=MT-SP',   { width: 1180, height: 980 });
    /* A FINISHED game seen by staff. This is the path that used to blank the
       screen: `you` is empty for a mentor, so the completed-status line
       dereferenced players[""]. */
    await shoot('staff-finished', 'screen=game&id=MT-SC', { width: 1180, height: 980 });
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }
  if (problems.length) { problems.forEach(p => console.log('  ✗ ' + p)); console.log('\n❌ CHESS SHOTS: ' + problems.length + ' problem(s)'); process.exit(1); }
  console.log('\n✅ CHESS SHOTS: ' + shots + ' screens rendered clean into tests/screens/');
})();
