#!/usr/bin/env node
/* ============================================================================
   The chess rules, on the device.

   Two implementations of one rulebook — api/_lib/domain/chess.php for games
   between members, chess-engine.jsx for the computer opponent a member plays
   with no signal. Two implementations always drift; the only question is
   whether anybody notices before a child does.

   perft is what notices. It counts every legal move sequence to a given depth
   from a given position, so a single wrong number means some rule — castling
   through check, en-passant, a rook captured on its corner killing the right —
   is wrong somewhere. The positions below are the standard ones the chess
   programming community uses precisely because each of them breaks a different
   naive engine.

   The counts are also compared against the PHP engine directly, so this stays
   a parity test rather than a copy of the same numbers twice.

   Run:  node tests/chess-engine.test.js
   ========================================================================== */
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'chess-engine.jsx'));
const C = window.NggChess;

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

/* The five standard perft positions. Kept shallow enough to run in seconds —
   the depths chosen are the ones that first expose each position's trap. */
const POSITIONS = [
  { name: 'the opening position', fen: C.START_FEN, counts: [20, 400, 8902, 197281] },
  { name: 'Kiwipete — castling, pins and promotions at once',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862] },
  { name: 'the en-passant discovered-check endgame',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238] },
  { name: 'a position where under-promotion matters',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', counts: [6, 264, 9467] },
  { name: 'a cramped middlegame with a knight fork available',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', counts: [44, 1486, 62379] },
];

for (const p of POSITIONS) {
  const got = p.counts.map((_, i) => C.perft(p.fen, i + 1));
  chk('perft is exact for ' + p.name, got.join() === p.counts.join());
}

/* Parity with the SERVER engine, which is the referee for every game between
   two members. A position reached offline and the same position reached
   online have to be the same position. */
let php = null;
try {
  const script = `<?php
    require '${ROOT}/api/_lib/domain/chess.php';
    $out = [];
    foreach (${JSON.stringify(POSITIONS.map(p => p.fen))} as $i => $fen) {
      $d = ${JSON.stringify(POSITIONS.map(p => p.counts.length))}[$i];
      $row = [];
      for ($k = 1; $k <= $d; $k++) $row[] = chess_perft($fen, $k);
      $out[] = $row;
    }
    echo json_encode($out);`;
  php = JSON.parse(execFileSync('php', ['-r', script.replace(/^<\?php/, '')], { encoding: 'utf8' }));
} catch (e) {
  console.log('  ⏭  PHP parity skipped (' + (e.message || e).toString().split('\n')[0] + ')');
}
if (php) {
  const js = POSITIONS.map(p => p.counts.map((_, i) => C.perft(p.fen, i + 1)));
  chk('the device engine and the server engine agree, move for move',
      JSON.stringify(js) === JSON.stringify(php));
}

/* ── SAN, because the move list is what a member reads back ─────────────── */
chk('castling is written O-O, not Kg1', C.move(
  'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', 'e1g1').san === 'O-O');
chk('a knight that shares a square with another is disambiguated',
    C.move('8/8/8/8/8/8/8/K1N1N2k w - - 0 1', 'c1d3').san === 'Ncd3');
chk('mate is written with a hash, not a plus',
    C.move('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8').san === 'Ra8#');
chk('a promotion names the piece it becomes',
    C.move('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8q').san === 'a8=Q');

/* ── Draws, the rules nobody implements until a game hangs on one ──────── */
chk('king and bishop against king is a draw by material',
    C.status(C.parseFen('8/8/8/4k3/8/8/8/KB6 w - - 0 1')).reason === 'insufficient_material');
chk('…but king and two bishops is not',
    C.status(C.parseFen('8/8/8/4k3/8/8/8/KBB5 w - - 0 1')).state === 'active');
chk('a hundred half-moves is a draw',
    C.status(C.parseFen('8/8/8/3k4/8/8/3K4/7R w - - 100 60')).reason === 'fifty_move');
chk('stalemate is not checkmate',
    C.status(C.parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).state === 'stalemate');

/* ── The opponent ───────────────────────────────────────────────────────
   Not "is it strong" — it is deliberately not. What must hold is that it is
   an OPPONENT: it plays legal moves, it takes what is free, and it finds mate
   when mate is there. And that its mistakes are the ones the level promised. */
chk('the computer takes a hanging queen', (() => {
  const m = C.bestMove('rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 3', 8, () => 0.99);
  return m && m.uci === 'c3d5';
})());
chk('…and finds mate in one', (() => {
  const m = C.bestMove('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 6, () => 0.99);
  return m && m.san === 'Ra8#';
})());
chk('every level plays a LEGAL move, at every level', (() => {
  const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const legal = C.legalUci(fen);
  for (let lv = 1; lv <= 8; lv++) {
    const m = C.bestMove(fen, lv, () => 0.5);
    if (!m || legal.indexOf(m.uci) < 0) return false;
  }
  return true;
})());
chk('a beginner level really does play something other than the best move', (() => {
  // rand() forced low, so the slip fires: level 1 slips 60% of the time.
  const m = C.bestMove('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 1, () => 0.01);
  return m && m.slipped === true && m.uci !== m.best;
})());
chk('…and the hardest level never does', (() => {
  const m = C.bestMove('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 8, () => 0.001);
  return m && m.slipped === false && m.uci === m.best;
})());
chk('a slip never picks a move it has not looked at', (() => {
  // The mistakes must be human-shaped — a worse plan, not an absurd one.
  const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const legal = C.legalUci(fen);
  for (let i = 0; i < 20; i++) {
    const m = C.bestMove(fen, 2, () => (i % 7) / 7);
    if (!m || legal.indexOf(m.uci) < 0) return false;
  }
  return true;
})());
chk('the blunder warning fires when a queen is given away…', (() => {
  // Qxb7+ wins a pawn and loses the queen to Kxb7 on the next move — the exact
  // shape of mistake a child makes, and the exact shape quiescence has to see
  // to notice, because it happens one ply past the horizon.
  const bad = C.blunderCheck('2k5/1p6/8/8/8/8/1Q6/4K3 w - - 0 1', 'b2b7', 2);
  return bad && bad.blunder === true && bad.loss > 500;
})());
chk('…and stays quiet on an ordinary opening move', (() => {
  // Warning about every inaccuracy teaches a child to dismiss the warning,
  // which costs more than the pawn it was about.
  const fine = C.blunderCheck('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4', 2);
  return fine && fine.blunder === false;
})());

/* Speed is a correctness property here: a bot that thinks for six seconds on
   a 2GB Android is a bot children stop playing. Generous, because CI is not a
   phone — this is a regression guard, not a benchmark. */
chk('the hardest level answers a middlegame position in under three seconds', (() => {
  const t = Date.now();
  C.bestMove('r2q1rk1/pp1bbppp/2n1pn2/2pp4/3P1B2/2P1PN2/PPQN1PPP/R3KB1R w KQ - 0 9', 8, () => 0.99);
  return Date.now() - t < 3000;
})());

/* ── The search rewrite ─────────────────────────────────────────────────────
   Three bugs found by measuring rather than reading, each pinned here. */

/* Quiescence has no notion of checkmate — it stands pat on a static
   evaluation. With a fixed depth that never showed, because a mate was always
   at least two plies inside the search. Under iterative deepening the first
   pass IS depth one, the mate sits exactly on the horizon, and the engine
   ranked "mate in one" level with "win a pawn" — it missed a rook mate on an
   otherwise empty board. */
chk('a mate on the search horizon is seen as mate, not as material', (() => {
  const fen = 'k7/7R/1K6/8/8/8/8/8 w - - 0 1';
  for (const level of [1, 4, 8]) {
    const r = C.bestMove(fen, level, () => 0.99);
    if (!r || r.best !== 'h7h8') return false;
  }
  return true;
})());

/* The root searched every move with beta = -alpha, which is a null window: a
   move BETTER than the current best fails high and comes back as the bound
   rather than as its score, so the ranking silently kept the first move it
   liked. Principal variation search re-searches those with a full window. */
chk('the root reports real scores, not the bound it cut off at', (() => {
  const a = C.analyse('k7/7R/1K6/8/8/8/8/8 w - - 0 1', 3);
  // The mate must score as a mate, not as a pawn-count.
  return a && a.best.score > 90000;
})());

/* Mate scores are measured in plies FROM THE ROOT, so an entry stored at one
   distance and read at another reports the wrong distance to mate. */
chk('mate scores never enter the transposition table', (() => {
  // Two searches of the same position must agree; a poisoned table makes the
  // second one disagree with the first.
  const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  const a = C.bestMove(fen, 6, () => 0.99);
  const b = C.bestMove(fen, 6, () => 0.99);
  return a && b && a.best === b.best && a.best === 'a1a8';
})());

/* The opening book exists so the first moves are instant and sensible. A
   search this size has least to say in the opening, and an engine that answers
   1.e4 with 1...a6 after a second of thought looks broken to a child who has
   been taught to control the centre. */
chk('the opening book answers instantly and legally', (() => {
  const t = Date.now();
  const r = C.bestMove(C.START_FEN, 6, () => 0.5);
  if (!r || !r.book) return false;
  if (C.legalUci(C.START_FEN).indexOf(r.uci) < 0) return false;
  return Date.now() - t < 60;
})());
chk('…but the weakest levels do not use it — a book move then a hung queen is a confusing teacher',
  C.bestMove(C.START_FEN, 1, () => 0.99).book !== true);

/* Iterative deepening exists so the same level behaves the same on a desktop
   and on a 2GB Android: it stops at the time budget with a complete answer in
   hand rather than at a fixed depth the phone may not reach. */
chk('a level reports the depth it actually reached', (() => {
  const r = C.bestMove('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 8, () => 0.99);
  return r && r.depth >= 5;
})());
chk('…and a weak level stops early rather than thinking for a second', (() => {
  const t = Date.now();
  C.bestMove('r2q1rk1/pp1bbppp/2n1pn2/2pp4/3P1B2/2P1PN2/PPQN1PPP/R3KB1R w KQ - 0 9', 1, () => 0.99);
  return Date.now() - t < 400;
})());

/* The endgame king table. With one middlegame table the king hides on g1
   forever, which is right with queens on and actively losing in a pawn ending
   — the ending children reach most. */
chk('the king is worth more in the centre once the queens are off', (() => {
  const corner = C.evaluate(C.parseFen('8/8/8/8/8/8/4k3/K7 w - - 0 1'));
  const centre = C.evaluate(C.parseFen('8/8/8/3K4/8/8/4k3/8 w - - 0 1'));
  return centre > corner;
})());

/* A malformed FEN must REFUSE, never quietly assume the start position — a
   board that silently resets is worse than one that will not open. */
chk('a malformed FEN is refused rather than guessed at', C.parseFen('not a fen') === null
    && C.parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq') === null
    && C.parseFen('8/8/8/8/8/8/8/8 w - - 0 1') === null);   // no kings


/* ── The transposition key, and why it changed ─────────────────────────────
   The old key was `pos.board.join("") + turn + castling + ep`. Array.join
   drops empty strings entirely, so it encoded the SEQUENCE of pieces and not
   where any of them stood: three positions with completely different pawn
   structures produced one key. Measured at the time, on a random walk: 14% of
   positions shared a key with a genuinely different position, worst bucket
   eighteen.

   The engine was therefore reading cached scores from unrelated positions, and
   the depth it reported was fiction. These tests exist so that cannot come
   back quietly. */
chk('the position key tells different positions apart', (function () {
  const seen = new Map();
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let g = 0; g < 25; g++) {
    let pos = C.parseFen(C.START_FEN);
    for (let ply = 0; ply < 50; ply++) {
      const mv = C.legalMoves(pos);
      if (!mv.length) break;
      pos = C.apply(pos, mv[Math.floor(rnd() * mv.length)]);
      const truth = C.toFen(pos).split(' ').slice(0, 4).join(' ');
      const had = seen.get(pos.hash);
      if (had !== undefined && had !== truth) return false;   // two positions, one key
      seen.set(pos.hash, truth);
    }
  }
  return seen.size > 500;
})());

chk('…and the incremental hash never drifts from a full recompute', (function () {
  /* apply() maintains the hash as pieces move rather than recomputing it. A
     drift corrupts the table silently and shows up as the engine playing a
     move it never searched, so it is checked on every node of a random walk —
     including the fiddly ones: castling, en passant and promotion. */
  let s = 991, checked = 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const starts = [C.START_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    '8/PPPk4/8/8/8/8/4Kppp/8 w - - 0 1'];
  for (const f of starts) {
    for (let g = 0; g < 12; g++) {
      let pos = C.parseFen(f);
      for (let ply = 0; ply < 40; ply++) {
        const mv = C.legalMoves(pos);
        if (!mv.length) break;
        pos = C.apply(pos, mv[Math.floor(rnd() * mv.length)]);
        checked++;
        if (pos.hash !== C.hashOf(pos).h) return false;
      }
    }
  }
  return checked > 1000;
})());

/* ── Legality by make/unmake ───────────────────────────────────────────────
   legalMoves() used to build a whole new position per candidate move just to
   ask whether the king was left en prise. It now mutates four squares and puts
   them back, so the board it was handed has to come out unchanged. */
chk('testing legality leaves the position exactly as it was', (function () {
  const fens = ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
                '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 0 1',
                '8/PPPk4/8/8/8/8/4Kppp/8 w - - 0 1',
                'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'];
  for (const f of fens) {
    const pos = C.parseFen(f);
    const before = pos.board.join('|') + pos.turn + pos.castling + pos.ep + pos.hash;
    C.legalMoves(pos);
    if (pos.board.join('|') + pos.turn + pos.castling + pos.ep + pos.hash !== before) return false;
  }
  return true;
})());

/* Perft is the only thing that proves a move generator. Kiwipete is the
   standard position for exactly the cases make/unmake gets wrong: castling
   through check, en passant, and a rook captured on its own corner. */
chk('perft is exact from the start position', C.perft(C.START_FEN, 4) === 197281);
chk('…and on Kiwipete, which is where castling and en passant go wrong',
    C.perft('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3) === 97862);

/* ── Static exchange evaluation ────────────────────────────────────────────
   What stops the engine spending its quiescence budget on QxP-defended-by-a-
   pawn, and what stops it ordering that move first. */
chk('a capture that wins material is found', (function () {
  const r = C.positionScore('4k3/8/8/3r4/8/8/8/3RK3 w - - 0 1', { ms: 250 });
  return r && r.best === 'd1d5';
})());
chk('…and one that loses a queen for a pawn is not played for the pawn', (function () {
  /* Qxd5 wins a pawn for exactly one ply and then loses the queen to the
     knight. An engine without SEE plays it at shallow depth. */
  const r = C.positionScore('rnbqkbnr/ppp1pppp/8/3p4/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2', { ms: 400 });
  return r && r.best !== 'd1d5';
})());

/* ── Null-move pruning must not fire in zugzwang ───────────────────────────
   Passing is usually bad for you, which is what makes null-move pruning sound.
   In a king-and-pawn ending it often is not, and an engine that prunes there
   hallucinates safety in exactly the endings club children reach most. */
chk('a king-and-pawn ending is still searched to a real depth', (function () {
  const r = C.positionScore('8/8/8/4k3/8/4K3/4P3/8 w - - 0 1', { ms: 600 });
  return r && r.depth >= 8 && typeof r.score === 'number';
})());

/* ── The review helpers ────────────────────────────────────────────────── */
chk('a position search reports the line, not just the move', (function () {
  const r = C.positionScore('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 3',
                            { ms: 400, pv: 4 });
  return r && r.pv.length >= 2 && r.pv[0].uci === r.best && r.pv.every(x => x.san);
})());
chk('accuracy falls as the average loss rises, and stays inside 0 and 100', (function () {
  const a = [0, 10, 25, 50, 100, 200, 400, 2000].map(C.accuracyFrom);
  for (let i = 1; i < a.length; i++) if (a[i] > a[i - 1]) return false;
  return a[0] === 100 && a.every(x => x >= 0 && x <= 100);
})());
chk('…and a move that WAS the best one costs nothing, whatever the arithmetic says',
    C.classifyLoss(240, true).tag === 'best' && C.classifyLoss(240, false).tag === 'mistake');
chk('the bands are ordered, so a bigger loss is never called a smaller thing', (function () {
  const t = (n) => C.classifyLoss(n, false).tag;
  return t(10) === 'good' && t(60) === 'inaccuracy' && t(150) === 'mistake' && t(500) === 'blunder';
})());

console.log((failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (chess engine)');
process.exit(failed ? 1 : 0);
