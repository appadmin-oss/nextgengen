#!/usr/bin/env node
/* ============================================================================
   Engine vs engine.

   Depth and mate-finding say whether the search got cheaper. They do not say
   whether it got STRONGER — an evaluation change can cost depth and still win
   games, and a depth gain can be spent on searching the wrong things. The only
   honest answer to "is this engine better" is to play it against the one it
   replaces.

   The opponent is the engine as committed, read out of git rather than kept as
   a second copy in the tree — a checked-in duplicate goes stale the first time
   somebody forgets it exists.

   Run:  node tests/_engine-match.js [gamesPerOpening] [msPerMove] [baseRef]
   ========================================================================== */
const fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PAIRS = +(process.argv[2] || 1);        // games per opening, per colour
const MS = +(process.argv[3] || 300);
const BASE_REF = process.argv[4] || 'HEAD';

const vm = require('vm');
function loadEngine(src, name) {
  /* Each engine gets its own realm. The file is an IIFE that assigns to
     globalThis, so two of them loaded normally would be one of them — the
     second would silently overwrite the first and the match would be the new
     engine playing itself to a draw every time. */
  const ctx = vm.createContext({ Date: Date, Math: Math, console: console });
  vm.runInContext(src, ctx);
  const api = ctx.NggChess;
  if (!api) throw new Error('engine ' + name + ' did not export NggChess');
  api.__name = name;
  return api;
}

const NEW = loadEngine(fs.readFileSync(path.join(ROOT, 'chess-engine.jsx'), 'utf8'), 'new');
let OLD;
try {
  OLD = loadEngine(execSync('git show ' + BASE_REF + ':chess-engine.jsx', { cwd: ROOT, encoding: 'utf8' }), BASE_REF);
} catch (e) {
  console.log('Could not read ' + BASE_REF + ':chess-engine.jsx — ' + e.message);
  process.exit(1);
}

/* Openings, not the start position. Twenty games from one position is one
   game played twenty times: the book and the first ordering decision make
   them near-identical, and the result measures nothing. */
const OPENINGS = [
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 3',
  'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq - 2 5',
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP3PPP/R1BQKB1R w KQkq - 2 6',
];

/* A deterministic "random" per game, so a rerun of the same match gives the
   same games and a change in the result is a change in the engine. */
function seeded(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function playGame(white, black, fen, seed) {
  const E = white;                       // rules are identical; either will do
  let cur = fen;
  const counts = Object.create(null);
  const startPos = E.parseFen(fen);
  counts[E.repetitionKey(startPos)] = 1;
  for (let ply = 0; ply < 200; ply++) {
    const pos = E.parseFen(cur);
    const st = E.status(pos, counts);
    // "active" and "check" are both still a game; everything else has ended.
    if (st.state !== 'active' && st.state !== 'check') {
      return st.state === 'checkmate' ? st.winner : 'draw';
    }
    const eng = pos.turn === 'w' ? white : black;
    /* No book and no slip: a book move is not this engine's judgement, and a
       deliberate mistake is noise in a strength measurement. */
    const mv = eng.bestMove(cur, 8, seeded(seed + ply), { ms: MS, depth: 40, slip: 0, book: false });
    if (!mv) return 'draw';
    const res = E.move(cur, mv.uci, counts);
    if (!res.ok) return 'draw';           // cannot happen; a draw is the safe read
    cur = res.fen;
    const k = E.repetitionKey(E.parseFen(cur));
    counts[k] = (counts[k] || 0) + 1;
  }
  return 'draw';                          // 200 plies with no result is a draw
}

let win = 0, loss = 0, draw = 0, n = 0;
const t0 = Date.now();
for (let p = 0; p < PAIRS; p++) {
  for (let i = 0; i < OPENINGS.length; i++) {
    for (const newIsWhite of [true, false]) {
      const seed = 1000 + p * 1000 + i * 10 + (newIsWhite ? 1 : 2);
      const r = playGame(newIsWhite ? NEW : OLD, newIsWhite ? OLD : NEW, OPENINGS[i], seed);
      n++;
      let out;
      if (r === 'draw') { draw++; out = '='; }
      else if ((r === 'w') === newIsWhite) { win++; out = '+'; }
      else { loss++; out = '-'; }
      process.stdout.write(out);
    }
  }
}
const secs = Math.round((Date.now() - t0) / 1000);
const score = win + draw / 2;
const pct = (score / n * 100).toFixed(1);
/* Elo from the score rate. With this few games the interval is wide, and the
   number is a direction rather than a rating — which is what it is used for. */
const elo = score === 0 || score === n ? '±∞'
  : (-400 * Math.log10(1 / (score / n) - 1)).toFixed(0);
console.log('\n\nnew vs ' + BASE_REF + ' @ ' + MS + 'ms   ' + n + ' games in ' + secs + 's');
console.log('  +' + win + ' =' + draw + ' -' + loss + '   score ' + score + '/' + n + ' (' + pct + '%)   ≈ ' + elo + ' Elo');
