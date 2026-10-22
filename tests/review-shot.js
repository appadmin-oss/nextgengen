#!/usr/bin/env node
/* The after-game review and the live ladder — render the shipped bundle and
   photograph them. Fails on any page error, so a change that blanks either
   screen fails the build.

   The review shot is not staged: the engine really analyses the game below,
   in the browser, before the picture is taken. */
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const ROOT = path.resolve(__dirname, '..'), PORT = process.env.REVSHOT_PORT || 8235;
const BASE = 'http://127.0.0.1:' + PORT, FIX = path.join(ROOT, 'tests', '_revshot_fixture.html');
const OUT = path.join(ROOT, 'tests', 'screens');
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

/* A game with something to say about it: a Legal's-mate shape where Black
   grabs the queen and gets mated, plus a real piece drop earlier. Chosen so
   the review has a turning point to name — a quiet Italian analysed at a short
   budget produces an honest flat line and a dull picture, which is a fine
   review and a poor screenshot. */
const GAME = {
  matchId: 'MT-SHOT', game: 'chess', status: 'complete', you: 'A', yourColour: 'w',
  yourTurn: false, ply: 13, turnColour: 'b', check: true, checkSquare: 'e7',
  result: 'win', winnerId: 'ME', reason: 'checkmate',
  timeControl: '10+0', rated: true, variant: 'standard', variantData: null, startFen: '',
  /* Derived by replaying the move list through the engine, not typed. A
     hand-written FEN here was wrong twice — a missing pawn and a wrong
     halfmove clock — and a board that disagrees with its own move list is the
     one thing a review screen must never do. */
  state: 'rn1q1bnr/ppp1kB1p/3p2p1/3NN3/4P3/8/PPPP1PPP/R1BbK2R b KQ - 2 7',
  players: { A: { id: 'ME', name: 'You', rating: 1240 },
             B: { id: 'THEM', name: 'Chidinma O.', rating: 1198 } },
  ratingDelta: 8,
  moves: [
    { ply: 1,  move: 'e2e4', san: 'e4',    playerId: 'ME' },
    { ply: 2,  move: 'e7e5', san: 'e5',    playerId: 'THEM' },
    { ply: 3,  move: 'g1f3', san: 'Nf3',   playerId: 'ME' },
    { ply: 4,  move: 'd7d6', san: 'd6',    playerId: 'THEM' },
    { ply: 5,  move: 'f1c4', san: 'Bc4',   playerId: 'ME' },
    { ply: 6,  move: 'c8g4', san: 'Bg4',   playerId: 'THEM' },
    { ply: 7,  move: 'b1c3', san: 'Nc3',   playerId: 'ME' },
    { ply: 8,  move: 'g7g6', san: 'g6',    playerId: 'THEM' },
    { ply: 9,  move: 'f3e5', san: 'Nxe5',  playerId: 'ME' },
    { ply: 10, move: 'g4d1', san: 'Bxd1',  playerId: 'THEM' },
    { ply: 11, move: 'c4f7', san: 'Bxf7+', playerId: 'ME' },
    { ply: 12, move: 'e8e7', san: 'Ke7',   playerId: 'THEM' },
    { ply: 13, move: 'c3d5', san: 'Nd5#',  playerId: 'ME' },
  ],
  reactions: [], legal: [], staffView: false, clock: null,
};

const STORED = {
  matchId: 'MT-SHOT',
  white: { accuracy: 88, avgLoss: 17, blunders: 0, mistakes: 0, inaccuracies: 2 },
  black: { accuracy: 47, avgLoss: 132, blunders: 2, mistakes: 1, inaccuracies: 1 },
  turning: { ply: 10, san: 'Bxd1', best: 'dxe5', loss: 760 },
  evals: [0, 18, 6, 24, 10, 30, 45, 60, 40, 210, 980, 1000, 1000, 1000],
  engine: { depth: 11, ms: 300 },
  createdAt: '2026-08-21T16:20:00Z',
};

const LADDER = {
  ok: true, hotCount: 2, windowHours: 6,
  ladders: [
    { tournament: { tournamentId: 'TRN-ARENA', name: 'Saturday Arena', formatName: 'Arena',
                    timeControl: '5+3', status: 'running', round: 4, totalRounds: 0 },
      heat: { moves: 128, live: 3, players: 9, score: 486 }, entrants: 14,
      top: [
        { rank: 1, move: 2,  playerId: 'P1', name: 'Adaeze N.',    centre: 'Egbeda', kind: 'member',
          score: 11, played: 9, streak: 4, status: 'active', isMe: false, photo: '' },
        { rank: 2, move: -1, playerId: 'P2', name: 'Bode Adeyemi', centre: 'Ayobo',  kind: 'student',
          score: 9, played: 9, streak: 0, status: 'active', isMe: false, photo: '' },
        { rank: 3, move: 1,  playerId: 'P3', name: 'Chidinma O.',  centre: 'Egbeda', kind: 'member',
          score: 8, played: 8, streak: 2, status: 'active', isMe: false, photo: '' },
        { rank: 4, move: 0,  playerId: 'P4', name: 'Emeka Nwosu',  centre: 'Ikotun', kind: 'volunteer',
          score: 7, played: 9, streak: 0, status: 'active', isMe: false, photo: '' },
        { rank: 5, move: -3, playerId: 'P5', name: 'Fola Six',     centre: 'Ayobo',  kind: 'member',
          score: 6, played: 8, streak: 0, status: 'active', isMe: false, photo: '' },
      ],
      me: { rank: 11, move: 3, playerId: 'ME', name: 'Temiloluwa A.', centre: 'Egbeda', kind: 'member',
            score: 4, played: 8, streak: 1, status: 'active', isMe: true, photo: '' } },
    { tournament: { tournamentId: 'TRN-SWISS', name: 'Egbeda Centre Cup', formatName: 'Swiss',
                    timeControl: '10+0', status: 'running', round: 3, totalRounds: 5 },
      heat: { moves: 46, live: 0, players: 4, score: 112 }, entrants: 18,
      top: [
        { rank: 1, move: 0,  playerId: 'Q1', name: 'Halima Yusuf', centre: 'Egbeda', kind: 'member',
          score: 2.5, played: 3, streak: 0, status: 'active', isMe: false, photo: '' },
        { rank: 2, move: 4,  playerId: 'Q2', name: 'Ibrahim S.',   centre: 'Egbeda', kind: 'student',
          score: 2, played: 3, streak: 0, status: 'active', isMe: false, photo: '' },
        { rank: 3, move: -2, playerId: 'Q3', name: 'Zainab K.',    centre: 'Ikeja',  kind: 'member',
          score: 2, played: 3, streak: 0, status: 'active', isMe: false, photo: '' },
      ],
      me: null },
    { tournament: { tournamentId: 'TRN-OPEN', name: 'Summer Blitz', formatName: 'Knockout',
                    timeControl: '3+2', status: 'open', round: 0, totalRounds: 0 },
      heat: { moves: 0, live: 0, players: 0, score: 20 }, entrants: 6,
      top: [
        { rank: 1, move: 0, playerId: 'R1', name: 'Tunde Okonkwo', centre: 'Egbeda', kind: 'member',
          score: 0, played: 0, streak: 0, status: 'active', isMe: false, photo: '' },
      ],
      me: null },
  ],
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  review shots: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fbf7ed}/* The site's cursor sprite follows the pointer, and the harness's last click leaves it sitting in the middle of whatever it clicked. It photographed as a stray ring inside the Accuracy card for weeks. */.ngg-cursor:not(#_):not(#_){display:none}</style>
</head><body class="cm-app"><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  var Q = new URLSearchParams(location.search);
  window.__stored = Q.get('stored') ? ${JSON.stringify(STORED)} : null;
  NGGApi.member.match.review = () => Promise.resolve({ ok: true, review: window.__stored });
  NGGApi.member.match.reviewSave = () => Promise.resolve({ ok: true, review: null });
  NGGApi.member.tournaments.ladder = () => Promise.resolve(${JSON.stringify(LADDER)});
  var el = Q.get('screen') === 'ladder'
    ? React.createElement(window.CmTrnLadder, { onBack: function () {}, onOpen: function () {} })
    : React.createElement(window.CmGameReview, { m: ${JSON.stringify(GAME)}, onBack: function () {} });
  ReactDOM.createRoot(document.getElementById('root')).render(el);
</script>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  let shots = 0; const problems = [];
  try {
    await waitForServer(BASE + '/tests/_revshot_fixture.html');
    const shoot = async (name, query, viewport, prep) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message)));
      await page.goto(BASE + '/tests/_revshot_fixture.html?' + query, { waitUntil: 'networkidle' });
      if (prep) await prep(page);
      await page.waitForTimeout(400);
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);
      await page.screenshot({ path: path.join(OUT, 'review-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 review-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')'
        + (errs.length ? '  ⚠ ' + errs[0] : ''));
      await page.close();
    };

    // Before it runs: the choice of how long to spend.
    await shoot('start', 'screen=review', { width: 430, height: 900 });

    // After a real analysis. The engine genuinely searches twelve positions
    // here, which is why this one waits.
    const analyse = async (page) => {
      await page.locator('.rev-start .cmc-opt', { hasText: 'Normal' }).click();
      await page.locator('.cmm-cta').click();
      await page.waitForSelector('.rev-tiles', { timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('.rev-run'), null, { timeout: 60000 });
      // The summary is the screen; the replay sits behind it, which is the
      // design's shape. Shot as it lands.
      await page.waitForTimeout(300);
    };
    await shoot('done', 'screen=review', { width: 430, height: 900 }, analyse);
    await shoot('done-wide', 'screen=review', { width: 1180, height: 1000 }, analyse);

    // A game somebody else already reviewed.
    await shoot('stored', 'screen=review&stored=1', { width: 430, height: 900 });

    // The ladder.
    await shoot('ladder', 'screen=ladder', { width: 430, height: 900 });
    await shoot('ladder-wide', 'screen=ladder', { width: 1180, height: 900 });
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }
  if (problems.length) { problems.forEach(p => console.log('  ✗ ' + p)); console.log('\n❌ REVIEW SHOTS: ' + problems.length + ' problem(s)'); process.exit(1); }
  console.log('\n✅ REVIEW SHOTS: ' + shots + ' screens rendered clean into tests/screens/');
})();
