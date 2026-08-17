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
<style>body{margin:0;background:var(--cream-50,#fdf9f0);}</style>
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
      { matchId: 'MT-1', game: 'chess', status: 'active', you: 'A', yourTurn: true, ply: 7,
        players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0051', name: 'Temiloluwa A.' } } },
      { matchId: 'MT-2', game: 'chess', status: 'active', you: 'B', yourTurn: true, ply: 3,
        players: { A: { id: 'NGG-2026-0062', name: 'Chidinma O.' }, B: { id: 'NGG-2026-0044', name: 'You' } } },
      { matchId: 'MT-3', game: 'chess', status: 'active', you: 'A', yourTurn: false, ply: 12,
        players: { A: { id: 'NGG-2026-0044', name: 'You' }, B: { id: 'NGG-2026-0070', name: 'Ibrahim S.' } } },
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
      { id: 'NGG-2026-0051', fullName: 'Temiloluwa Adeyemi' },
      { id: 'NGG-2026-0062', fullName: 'Chidinma Okafor' },
      { id: 'NGG-2026-0070', fullName: 'Ibrahim Suleiman' },
      { id: 'NGG-2026-0081', fullName: 'Folasade Bakare' },
      { id: 'NGG-2026-0093', fullName: 'Zainab Kolawole' },
      { id: 'NGG-2026-0102', fullName: 'Emeka Nwosu' }
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
    'MT-S': { matchId: 'MT-S', game: 'chess', status: 'active', you: '', yourColour: '',
      yourTurn: false, ply: 5, state: ${JSON.stringify(ITALIAN)}, centre: 'Egbeda',
      lastMove: { from: 'f1', to: 'c4' }, turnColour: 'b', check: false, checkSquare: '',
      players: { A: { id: 'NGG-2026-0062', name: 'Chidinma O.' }, B: { id: 'NGG-2026-0044', name: 'Temiloluwa A.' } },
      moves: [ { ply: 1, san: 'e4' }, { ply: 2, san: 'e5' }, { ply: 3, san: 'Nf3' },
               { ply: 4, san: 'Nc6' }, { ply: 5, san: 'Bc4' } ],
      reactions: [], legal: [], staffView: true, flagged: true }
  };
  function ok(v) { return Promise.resolve(v); }
  window.NGGApi = { member: { match: {
    list: function () { return ok(LOBBY); },
    get: function (id) { return ok({ ok: true, match: GAMES[id] }); },
    move: function () { return ok({ ok: true }); },
    react: function () { return ok({ ok: true }); },
    resign: function () { return ok({ ok: true }); },
    report: function () { return ok({ ok: true }); },
    invite: function () { return ok({ ok: true, matchId: 'MT-1' }); },
    respond: function () { return ok({ ok: true }); }
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
  var el = screen === 'lobby' ? React.createElement(CmMatches, { auth: AUTH })
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
      await page.waitForTimeout(400);
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);
      await page.screenshot({ path: path.join(OUT, 'chess-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 chess-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')' + (errs.length ? '  ⚠ ' + errs[0] : ''));
      await page.close();
    };
    await shoot('lobby',       'screen=lobby',           { width: 1180, height: 900 });
    await shoot('lobby-phone', 'screen=lobby',           { width: 390,  height: 844 });
    await shoot('game',        'screen=game&id=MT-2',    { width: 1180, height: 980 });
    await shoot('game-phone',  'screen=game&id=MT-2',    { width: 390,  height: 844 });
    await shoot('finished',    'screen=game&id=MT-6',    { width: 1180, height: 980 });
    await shoot('staff-view',  'screen=game&id=MT-S',    { width: 1180, height: 980 });
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
