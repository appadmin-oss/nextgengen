#!/usr/bin/env node
/* ============================================================================
   The engine benchmark.

   Every claim about engine speed or strength in this repo comes from here
   rather than from a textbook, because the textbook is about C and this runs
   in V8 on a mid-range Android. Two numbers:

     DEPTH   — how deep a fixed budget gets, per position. This is what says
               whether an optimisation was real.
     TACTICS — how many forced mates the engine finds at that budget. Depth
               that does not become strength is not an improvement.

   THE TACTICS SUITE IS SELF-VERIFYING, and it is worth saying why. Twice now a
   hand-written suite in this repo asserted the wrong move: once a queen
   capture that a knight was blocking, once a mate-in-two that was not mate at
   all. A suite whose answers are wrong measures nothing and quietly punishes
   the engine for being right. So the answers are not written down — they are
   computed by mateIn(), a brute-force mate solver with no evaluation, no
   pruning and no table, which is slow and obviously correct. The fast engine
   is then required to agree with it.

   Run:  node tests/_engine-bench.js [ms]
   ========================================================================== */
const path = require('path');
require(path.resolve(__dirname, '..', 'chess-engine.jsx'));
const E = globalThis.NggChess;

const BUDGET = +(process.argv[2] || 1200);

/* ── Ground truth ──────────────────────────────────────────────────────────
   Exhaustive. "Can the side to move force mate within n of their own moves?"
   No evaluation is involved, so there is nothing here to be wrong about. */

function forcesMate(pos, n) {
  const moves = E.legalMoves(pos);
  if (!moves.length) return false;
  for (const m of moves) {
    const after = E.apply(pos, m);
    const reply = E.legalMoves(after);
    if (!reply.length) { if (E.inCheck(after)) return true; continue; }   // mate now
    if (n <= 1) continue;
    // Every reply must still lose.
    let all = true;
    for (const r of reply) {
      if (!forcesMate(E.apply(after, r), n - 1)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

/** Every move that forces mate within n. The set, not one of them: an engine
 *  that finds a different forced mate has not failed. */
function matingMoves(fen, n) {
  const pos = E.parseFen(fen);
  if (!pos) return null;        // an unparseable fixture is a bad fixture, not a miss
  const out = [];
  for (const m of E.legalMoves(pos)) {
    const after = E.apply(pos, m);
    const reply = E.legalMoves(after);
    if (!reply.length) { if (E.inCheck(after)) out.push(E.uciOf(m)); continue; }
    if (n <= 1) continue;
    let all = true;
    for (const r of reply) {
      if (!forcesMate(E.apply(after, r), n - 1)) { all = false; break; }
    }
    if (all) out.push(E.uciOf(m));
  }
  return out;
}

/* ── The positions ─────────────────────────────────────────────────────────
   Chosen for shape, not for a known answer: an open middlegame, a closed one,
   a sharp one, and two endgames where depth is the whole game. */
const POSITIONS = [
  ['opening',    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 3'],
  ['middlegame', 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2Q1RK1 w - - 0 9'],
  ['sharp',      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'],
  ['endgame',    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'],
  ['pawnend',    '8/1p3pp1/7p/5P1P/2k3P1/8/2K2P2/8 w - - 0 1'],
];

/* Mate positions, with the depth of mate to look for. The MOVES are computed,
   not asserted. Anything the solver says is not a forced mate is reported as
   a bad fixture rather than counted as an engine failure. */
const MATES = [
  ['back rank',        '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 1],
  ['queen and rook',   '6k1/5ppp/8/8/8/8/5PPP/R2Q2K1 w - - 0 1', 2],
  ['smothered shape',  '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 2],
  ['two rooks',        '7k/8/8/8/8/8/6R1/K6R w - - 0 1', 2],
  ['queen escort',     '7k/8/6K1/8/8/8/8/7Q w - - 0 1', 1],
  ['rook and king',    '7k/8/6K1/8/8/8/8/R7 w - - 0 1', 1],
  ['anastasia shape',  '5rk1/7p/8/4N3/8/8/8/4R1K1 w - - 0 1', 3],
];

function bench() {
  console.log('budget ' + BUDGET + 'ms per position\n');
  let totalDepth = 0, totalNodes = 0, totalMs = 0;
  for (const [name, fen] of POSITIONS) {
    const t0 = Date.now();
    const r = E.bestMove(fen, 8, () => 0.99, { ms: BUDGET, depth: 40 });
    const ms = Date.now() - t0;
    totalDepth += r.depth; totalNodes += r.nodes || 0; totalMs += ms;
    console.log('  ' + name.padEnd(12) + ' depth ' + String(r.depth).padStart(2)
      + '   ' + String(r.nodes || 0).padStart(9) + ' nodes'
      + '   ' + String(ms).padStart(5) + 'ms'
      + '   ' + String(Math.round((r.nodes || 0) / Math.max(1, ms))).padStart(4) + ' kn/s   ' + r.san);
  }
  console.log('\n  TOTAL DEPTH ' + totalDepth + '   ' + totalNodes + ' nodes   '
    + Math.round(totalNodes / Math.max(1, totalMs)) + ' kn/s');
  return totalDepth;
}

function tactics() {
  console.log('\nforced mates @ ' + BUDGET + 'ms   (answers computed, not asserted)');
  let hit = 0, usable = 0;
  for (const [name, fen, n] of MATES) {
    const truth = matingMoves(fen, n);
    if (!truth) { console.log('  ⚠ ' + name.padEnd(18) + 'BAD FIXTURE — will not parse'); continue; }
    if (!truth.length) { console.log('  ⚠ ' + name.padEnd(18) + 'BAD FIXTURE — no forced mate in ' + n); continue; }
    usable++;
    const r = E.bestMove(fen, 8, () => 0.99, { ms: BUDGET, depth: 40 });
    const ok = truth.indexOf(r.uci) >= 0;
    if (ok) hit++;
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + name.padEnd(18) + 'mate in ' + n
      + '  played ' + (r.san || '?').padEnd(7) + ' score ' + String(r.score).padStart(6)
      + ' depth ' + r.depth + (ok ? '' : '   want one of: ' + truth.join(',')));
  }
  console.log('\n  MATES ' + hit + '/' + usable);
  return [hit, usable];
}

const d = bench();
const [t, n] = tactics();
console.log('\nSCORE  depth=' + d + '  mates=' + t + '/' + n);
