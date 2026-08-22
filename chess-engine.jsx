/* ============================================================================
   The chess rules, on the device.

   The server is still the referee for every game between two members: it holds
   the position, decides whose turn it is, and validates each move. Nothing
   here changes that, and nothing here is trusted with a result.

   This exists for the one thing a server cannot do — play chess with a member
   who has no signal. The design is explicit about it ("Works with no signal ·
   nothing to download"), which rules out fetching a WASM engine on demand: a
   computer game has to cost zero bytes after the app is already loaded. So the
   rules travel with the app, and the opponent is a search over them.

   It is a DELIBERATE MIRROR of api/_lib/domain/chess.php — same 0x88 board,
   same move records, same SAN, same draw rules — so that a position reached
   offline and the same position reached on the server are the same position.
   The suite plays the two against each other on perft counts, which is the
   only way to keep two implementations of one rulebook honest.

   Exposed as window.NggChess. No JSX, no React: this is arithmetic.
   ========================================================================== */
(function (root) {
  "use strict";

  var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  var OFFSETS = {
    n: [-33, -31, -18, -14, 14, 18, 31, 33],
    b: [-17, -15, 15, 17],
    r: [-16, -1, 1, 16],
    q: [-17, -16, -15, -1, 1, 15, 16, 17],
    k: [-17, -16, -15, -1, 1, 15, 16, 17],
  };
  var SLIDING = { b: 1, r: 1, q: 1 };

  function sqToIdx(sq) {
    if (!sq || sq.length !== 2) return -1;
    var f = sq.charCodeAt(0) - 97, r = sq.charCodeAt(1) - 49;
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return (7 - r) * 16 + f;
  }
  function idxToSq(i) {
    return String.fromCharCode(97 + (i & 15)) + String.fromCharCode(49 + (7 - (i >> 4)));
  }
  /* A table, not a comparison. `p === p.toUpperCase()` allocates a string for
     every piece on every square of every node, which at 30-odd nodes' worth of
     board scans a second is millions of one-character strings. */
  var WHITE_PIECE = { P: true, N: true, B: true, R: true, Q: true, K: true };
  var COLOUR_OF = { P: "w", N: "w", B: "w", R: "w", Q: "w", K: "w",
                    p: "b", n: "b", b: "b", r: "b", q: "b", k: "b" };
  function isWhite(p) { return WHITE_PIECE[p] === true; }
  function colourOf(p) { return COLOUR_OF[p] || ""; }

  /** FEN → position, or null. Null means REFUSE — never "assume the start". */
  /* ── Position hashing ─────────────────────────────────────────────────────
     ttKey() used to be `pos.board.join("") + turn + castling + ep`: a 128-char
     string built at EVERY node, and the largest single allocation in the
     search. It is now a Zobrist hash carried on the position and updated by
     apply() as pieces move, so reading a node's key costs nothing.

     This reverses an earlier decision, and the reason is worth recording
     because the earlier measurement was not wrong — it was measuring the wrong
     thing. Zobrist was tried with 30-bit integer keys in a plain object and
     came out SLOWER; that was the container, not the hash, because a plain
     object keyed by integers takes V8's dictionary path. The table is a Map
     now, and the hash is incremental rather than recomputed, which is where
     the win actually lives.

     53 bits, assembled from two 32-bit halves, because that is the largest
     integer a double holds exactly. At 120k entries a collision is vanishingly
     unlikely, and it would cost one wrong bound rather than an illegal move:
     the move that comes back is always checked against the legal list. */

  var ZP_A = new Int32Array(12 * 128), ZP_B = new Int32Array(12 * 128);
  var ZC_A = new Int32Array(16), ZC_B = new Int32Array(16);
  var ZE_A = new Int32Array(8),  ZE_B = new Int32Array(8);
  var ZT_A = 0, ZT_B = 0;
  (function seedZobrist() {
    // xorshift32 from a fixed seed: the tables must be identical on every
    // device and every run, or two clients disagree about a cached position.
    var s = 0x2f6e2b1 >>> 0;
    function r() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s | 0; }
    for (var i = 0; i < ZP_A.length; i++) { ZP_A[i] = r(); ZP_B[i] = r(); }
    for (var c = 0; c < 16; c++) { ZC_A[c] = r(); ZC_B[c] = r(); }
    for (var e = 0; e < 8; e++) { ZE_A[e] = r(); ZE_B[e] = r(); }
    ZT_A = r(); ZT_B = r();
  })();

  var PIECE_IDX = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };

  function castMask(c) {
    var m = 0;
    if (!c) return 0;
    if (c.indexOf("K") >= 0) m |= 1;
    if (c.indexOf("Q") >= 0) m |= 2;
    if (c.indexOf("k") >= 0) m |= 4;
    if (c.indexOf("q") >= 0) m |= 8;
    return m;
  }

  /** The two halves combined into one exact integer, for use as a Map key.
   *  32 + 20 bits, not 32 + 21: the wider version tops out just above 2^53,
   *  where a double stops being exact, so the largest keys quietly lost their
   *  low bits and distinct positions collided. */
  function zCombine(a, b) { return (a >>> 0) * 1048576 + (b >>> 12); }

  /** The hash from scratch. Used when a position is parsed, and by the test
   *  that checks the incremental version never drifts from it. */
  function hashOf(pos) {
    var a = 0, b = 0;
    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = pos.board[i];
      if (p === "") continue;
      var k = PIECE_IDX[p] * 128 + i;
      a ^= ZP_A[k]; b ^= ZP_B[k];
    }
    var cm = castMask(pos.castling);
    a ^= ZC_A[cm]; b ^= ZC_B[cm];
    if (pos.ep >= 0) { var f = pos.ep & 15; a ^= ZE_A[f]; b ^= ZE_B[f]; }
    if (pos.turn === "b") { a ^= ZT_A; b ^= ZT_B; }
    return { a: a, b: b, h: zCombine(a, b) };
  }

  function parseFen(fen) {
    var parts = String(fen || "").trim().split(/\s+/);
    if (parts.length < 4) return null;
    var placement = parts[0], turn = parts[1], castling = parts[2], ep = parts[3];
    var half = parts.length > 4 ? parseInt(parts[4], 10) : 0;
    var full = parts.length > 5 ? parseInt(parts[5], 10) : 1;
    if (turn !== "w" && turn !== "b") return null;

    var board = new Array(128).fill("");
    var rows = placement.split("/");
    if (rows.length !== 8) return null;
    for (var r = 0; r < 8; r++) {
      var file = 0, row = rows[r];
      for (var i = 0; i < row.length; i++) {
        var c = row[i];
        if (c >= "1" && c <= "8") { file += parseInt(c, 10); continue; }
        if ("pnbrqkPNBRQK".indexOf(c) < 0) return null;
        if (file > 7) return null;
        board[r * 16 + file] = c;
        file++;
      }
      if (file !== 8) return null;
    }
    var epIdx = (ep === "-" || ep === "") ? -1 : sqToIdx(ep);
    if (ep !== "-" && ep !== "" && epIdx < 0) return null;
    if (!/^(-|K?Q?k?q?)$/.test(castling)) return null;

    var kings = { k: 0, K: 0 };
    for (var j = 0; j < 128; j++) if (board[j] === "k" || board[j] === "K") kings[board[j]]++;
    if (kings.k !== 1 || kings.K !== 1) return null;

    var pos = {
      board: board, turn: turn,
      castling: castling === "-" ? "" : castling,
      ep: epIdx,
      half: Math.max(0, isNaN(half) ? 0 : half),
      full: Math.max(1, isNaN(full) ? 1 : full),
      ha: 0, hb: 0, hash: 0,
    };
    var z = hashOf(pos);
    pos.ha = z.a; pos.hb = z.b; pos.hash = z.h;
    return pos;
  }

  function toFen(pos) {
    var out = "";
    for (var r = 0; r < 8; r++) {
      var empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = pos.board[r * 16 + f];
        if (p === "") { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        out += p;
      }
      if (empty) out += empty;
      if (r < 7) out += "/";
    }
    return out + " " + pos.turn
      + " " + (pos.castling === "" ? "-" : pos.castling)
      + " " + (pos.ep < 0 ? "-" : idxToSq(pos.ep))
      + " " + pos.half + " " + pos.full;
  }

  /* Flat offset arrays and direct character comparisons.
     The previous version walked `for (var key in OFFSETS)` and called
     colourOf() on every square it looked at — a for-in and a string compare,
     inside the function the legality test calls once per candidate move. The
     piece to look for is known before the loop starts, so the loop can just
     compare against it. */
  var KNIGHT_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  var DIAG_OFF = [-17, -15, 15, 17];
  var ORTHO_OFF = [-16, -1, 1, 16];
  var KING_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];

  function squareAttacked(pos, sq, by) {
    var b = pos.board, t, p, i, d;
    var white = by === "w";
    // Pawns attack diagonally and only forwards, so this looks BACK from the
    // square towards where such a pawn would have to stand. The sign is the
    // whole of the rule and the classic place to get it backwards.
    var pDir = white ? 16 : -16;
    var P = white ? "P" : "p";
    t = sq + pDir - 1; if (!(t & 0x88) && b[t] === P) return true;
    t = sq + pDir + 1; if (!(t & 0x88) && b[t] === P) return true;
    var N = white ? "N" : "n";
    for (i = 0; i < 8; i++) { t = sq + KNIGHT_OFF[i]; if (!(t & 0x88) && b[t] === N) return true; }
    var K = white ? "K" : "k";
    for (i = 0; i < 8; i++) { t = sq + KING_OFF[i]; if (!(t & 0x88) && b[t] === K) return true; }
    var B = white ? "B" : "b", Q = white ? "Q" : "q", R = white ? "R" : "r";
    for (i = 0; i < 4; i++) {
      d = DIAG_OFF[i]; t = sq + d;
      while (!(t & 0x88)) { p = b[t]; if (p !== "") { if (p === B || p === Q) return true; break; } t += d; }
    }
    for (i = 0; i < 4; i++) {
      d = ORTHO_OFF[i]; t = sq + d;
      while (!(t & 0x88)) { p = b[t]; if (p !== "") { if (p === R || p === Q) return true; break; } t += d; }
    }
    return false;
  }

  /** The index of the LEAST valuable piece of `by` attacking `sq`, or -1.
   *  The order the squares are looked at is the order of piece value, which is
   *  what makes this the cheapest attacker rather than any attacker. */
  function smallestAttackerIdx(pos, sq, by) {
    var b = pos.board, t, p, i, d;
    var white = by === "w";
    var pDir = white ? 16 : -16;
    var P = white ? "P" : "p";
    t = sq + pDir - 1; if (!(t & 0x88) && b[t] === P) return t;
    t = sq + pDir + 1; if (!(t & 0x88) && b[t] === P) return t;
    var N = white ? "N" : "n";
    for (i = 0; i < 8; i++) { t = sq + KNIGHT_OFF[i]; if (!(t & 0x88) && b[t] === N) return t; }
    var B = white ? "B" : "b", Q = white ? "Q" : "q", R = white ? "R" : "r", K = white ? "K" : "k";
    var bishop = -1, rook = -1, queen = -1;
    for (i = 0; i < 4; i++) {
      d = DIAG_OFF[i]; t = sq + d;
      while (!(t & 0x88)) {
        p = b[t];
        if (p !== "") { if (p === B) { if (bishop < 0) bishop = t; } else if (p === Q && queen < 0) queen = t; break; }
        t += d;
      }
    }
    if (bishop >= 0) return bishop;
    for (i = 0; i < 4; i++) {
      d = ORTHO_OFF[i]; t = sq + d;
      while (!(t & 0x88)) {
        p = b[t];
        if (p !== "") { if (p === R) { if (rook < 0) rook = t; } else if (p === Q && queen < 0) queen = t; break; }
        t += d;
      }
    }
    if (rook >= 0) return rook;
    if (queen >= 0) return queen;
    for (i = 0; i < 8; i++) { t = sq + KING_OFF[i]; if (!(t & 0x88) && b[t] === K) return t; }
    return -1;
  }

  /* ── Static exchange evaluation ───────────────────────────────────────────
     "If I take on this square, and we both keep taking with our cheapest
     piece, do I come out ahead?" This is what stops the engine spending its
     quiescence budget on QxP-defended-by-a-pawn, and what stops it ordering
     that move first because the victim happens to be a pawn worth taking.

     Recursive swap-off on the board itself, restored on every path. X-rays
     fall out for free, because each step re-scans a board that has had the
     previous attacker removed from it. Pins are ignored, which is the standard
     simplification: SEE is an ordering and pruning heuristic, and the search
     behind it is what is allowed to be exactly right. */
  function seeSwap(pos, to, side) {
    var b = pos.board;
    var idx = smallestAttackerIdx(pos, to, side);
    if (idx < 0) return 0;
    var attacker = b[idx], victim = b[to];
    if (victim === "") return 0;
    b[idx] = ""; b[to] = attacker;
    var v = VALUE[victim.toLowerCase()] - seeSwap(pos, to, side === "w" ? "b" : "w");
    b[idx] = attacker; b[to] = victim;
    // A capture nobody has to make is never made: the side to move can stand
    // pat rather than continue a losing exchange.
    return v < 0 ? 0 : v;
  }

  /** Net material after the exchange on m.to, in centipawns, from the mover's
   *  point of view. Negative means the capture loses material. */
  function seeCapture(pos, m) {
    if (m.captured === "") return 0;
    var b = pos.board;
    var us = colourOf(m.piece);
    var saveFrom = b[m.from], saveTo = b[m.to];
    b[m.from] = ""; b[m.to] = m.piece;
    var v = VALUE[m.captured.toLowerCase()] - seeSwap(pos, m.to, us === "w" ? "b" : "w");
    b[m.from] = saveFrom; b[m.to] = saveTo;
    if (m.promotion) v += VALUE[m.promotion] - VALUE.p;
    return v;
  }

  function kingSquare(pos, colour) {
    var want = colour === "w" ? "K" : "k";
    for (var i = 0; i < 128; i++) { if (i & 0x88) continue; if (pos.board[i] === want) return i; }
    return -1;
  }
  function inCheck(pos, colour) {
    var c = colour || pos.turn;
    var k = kingSquare(pos, c);
    return k >= 0 && squareAttacked(pos, k, c === "w" ? "b" : "w");
  }

  function mk(from, to, piece, captured, promotion, flag) {
    return { from: from, to: to, piece: piece, captured: captured, promotion: promotion, flag: flag };
  }

  /**
   * Would this move leave our own king attacked? Mutates the board, asks, and
   * puts it back — so `pos` is byte-for-byte what it was on every return path.
   *
   * `kIdx` is the king's square before the move, passed in because finding it
   * scans the board and it does not move for thirty of the thirty-one moves in
   * a typical list.
   */
  function leavesKingInCheck(pos, m, us, kIdx) {
    var b = pos.board;
    var from = m.from, to = m.to;
    var moved = b[from], captured = b[to];
    var epSq = -1, epPiece = "";
    var rFrom = -1, rTo = -1, rook = "";

    b[from] = "";
    b[to] = m.promotion !== "" ? (us === "w" ? m.promotion.toUpperCase() : m.promotion) : moved;
    if (m.flag === "e") { epSq = to + (us === "w" ? 16 : -16); epPiece = b[epSq]; b[epSq] = ""; }
    else if (m.flag === "k") { rFrom = to + 1; rTo = to - 1; rook = b[rFrom]; b[rTo] = rook; b[rFrom] = ""; }
    else if (m.flag === "q") { rFrom = to - 2; rTo = to + 1; rook = b[rFrom]; b[rTo] = rook; b[rFrom] = ""; }

    var k = (moved === "K" || moved === "k") ? to : kIdx;
    var bad = k >= 0 && squareAttacked(pos, k, us === "w" ? "b" : "w");

    b[from] = moved; b[to] = captured;
    if (epSq >= 0) b[epSq] = epPiece;
    if (rFrom >= 0) { b[rFrom] = rook; b[rTo] = ""; }
    return bad;
  }

  function legalMoves(pos) {
    var moves = [], us = pos.turn, them = us === "w" ? "b" : "w", board = pos.board;
    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = board[i];
      if (p === "" || colourOf(p) !== us) continue;
      var lower = p.toLowerCase();

      if (lower === "p") {
        var dir = us === "w" ? -16 : 16;
        var startRow = us === "w" ? 6 : 1;
        var lastRow = us === "w" ? 0 : 7;
        var one = i + dir;
        if (!(one & 0x88) && board[one] === "") {
          if ((one >> 4) === lastRow) {
            ["q", "r", "b", "n"].forEach(function (pr) { moves.push(mk(i, one, p, "", pr, "")); });
          } else {
            moves.push(mk(i, one, p, "", "", ""));
            var two = i + 2 * dir;
            if ((i >> 4) === startRow && !(two & 0x88) && board[two] === "") {
              moves.push(mk(i, two, p, "", "", "b"));      // b = big (two-square) push
            }
          }
        }
        [dir - 1, dir + 1].forEach(function (d) {
          var t = i + d;
          if (t & 0x88) return;
          var target = board[t];
          if (target !== "" && colourOf(target) === them) {
            if ((t >> 4) === lastRow) {
              ["q", "r", "b", "n"].forEach(function (pr) { moves.push(mk(i, t, p, target, pr, "")); });
            } else {
              moves.push(mk(i, t, p, target, "", ""));
            }
          } else if (target === "" && t === pos.ep) {
            moves.push(mk(i, t, p, us === "w" ? "p" : "P", "", "e"));
          }
        });
        continue;
      }

      var offs = OFFSETS[lower];
      for (var oi = 0; oi < offs.length; oi++) {
        var d2 = offs[oi], t2 = i + d2;
        while (!(t2 & 0x88)) {
          var target2 = board[t2];
          if (target2 === "") {
            moves.push(mk(i, t2, p, "", "", ""));
          } else {
            if (colourOf(target2) === them) moves.push(mk(i, t2, p, target2, "", ""));
            break;
          }
          if (!SLIDING[lower]) break;
          t2 += d2;
        }
      }
    }

    var kIdx = kingSquare(pos, us);
    if (kIdx >= 0 && !squareAttacked(pos, kIdx, them)) {
      var rights = pos.castling;
      var kSide = us === "w" ? "K" : "k";
      var qSide = us === "w" ? "Q" : "q";
      if (rights.indexOf(kSide) >= 0
          && board[kIdx + 1] === "" && board[kIdx + 2] === ""
          && !squareAttacked(pos, kIdx + 1, them)
          && !squareAttacked(pos, kIdx + 2, them)) {
        moves.push(mk(kIdx, kIdx + 2, board[kIdx], "", "", "k"));
      }
      if (rights.indexOf(qSide) >= 0
          && board[kIdx - 1] === "" && board[kIdx - 2] === "" && board[kIdx - 3] === ""
          && !squareAttacked(pos, kIdx - 1, them)
          && !squareAttacked(pos, kIdx - 2, them)) {
        moves.push(mk(kIdx, kIdx - 2, board[kIdx], "", "", "q"));
      }
    }

    /* Legality by make/unmake on the board itself.
     *
     * This used to call apply() per candidate — a fresh 128-element array, a
     * castling-rights rebuild and (since hashing) a Zobrist update, thirty-odd
     * times per node, purely to ask "does this leave my king en prise?". The
     * answer needs four squares changed and changed back. Nothing else about
     * the position is touched, so nothing else has to be built.
     *
     * The board is restored on every path below, including the early one. */
    var legal = [];
    var kIdxNow = kingSquare(pos, us);
    for (var m = 0; m < moves.length; m++) {
      if (!leavesKingInCheck(pos, moves[m], us, kIdxNow)) legal.push(moves[m]);
    }
    return legal;
  }

  /* Hot: called once per node, so every allocation here is multiplied by the
     node count. What used to be in it — a `strip` closure, two `forEach`es
     over literal arrays, and `split().join()` per right — cost more than the
     board copy did. The rights are a four-character string, so they are
     rebuilt directly.

     It also maintains the Zobrist hash incrementally. Every XOR below is
     paired with the board change on the line above it; the invariant that
     `pos.hash === hashOf(pos)` is asserted on every node of a random game by
     the engine test, because a hash that drifts corrupts the table silently
     and shows up as the engine playing a move it never searched. */
  var CASTLE_CHARS = "KQkq";
  function apply(pos, m) {
    var b = pos.board.slice();
    var us = colourOf(m.piece);
    var lower = m.piece.toLowerCase();
    var ha = pos.ha, hb = pos.hb, k;

    // The piece leaves `from`.
    k = PIECE_IDX[m.piece] * 128 + m.from;
    ha ^= ZP_A[k]; hb ^= ZP_B[k];
    b[m.from] = "";

    // Anything captured leaves the board — en passant takes it off a DIFFERENT
    // square from the one the pawn lands on, which is the case to get wrong.
    if (m.captured !== "") {
      var csq = m.flag === "e" ? (m.to + (us === "w" ? 16 : -16)) : m.to;
      k = PIECE_IDX[m.captured] * 128 + csq;
      ha ^= ZP_A[k]; hb ^= ZP_B[k];
    }

    // The piece — or what it promoted into — arrives on `to`.
    var landed = m.promotion !== "" ? (us === "w" ? m.promotion.toUpperCase() : m.promotion) : m.piece;
    b[m.to] = landed;
    k = PIECE_IDX[landed] * 128 + m.to;
    ha ^= ZP_A[k]; hb ^= ZP_B[k];

    if (m.flag === "e") {
      b[m.to + (us === "w" ? 16 : -16)] = "";
    } else if (m.flag === "k" || m.flag === "q") {
      var rFrom = m.flag === "k" ? m.to + 1 : m.to - 2;
      var rTo   = m.flag === "k" ? m.to - 1 : m.to + 1;
      var rook = b[rFrom];
      b[rTo] = rook; b[rFrom] = "";
      k = PIECE_IDX[rook] * 128 + rFrom; ha ^= ZP_A[k]; hb ^= ZP_B[k];
      k = PIECE_IDX[rook] * 128 + rTo;   ha ^= ZP_A[k]; hb ^= ZP_B[k];
    }

    /* Castling rights. Moving the king kills both of its own; moving a rook
       off a corner, or capturing one ON its corner, kills that one. The second
       is the case everybody forgets. */
    var rights = pos.castling;
    if (rights !== "") {
      var drop = 0;
      if (lower === "k") drop |= us === "w" ? 3 : 12;
      if (m.from === 112 || m.to === 112) drop |= 2;   // a1 → Q
      if (m.from === 119 || m.to === 119) drop |= 1;   // h1 → K
      if (m.from === 0   || m.to === 0)   drop |= 8;   // a8 → q
      if (m.from === 7   || m.to === 7)   drop |= 4;   // h8 → k
      if (drop) {
        var keep = castMask(rights) & ~drop;
        var out = "";
        for (var ci = 0; ci < 4; ci++) if (keep & (1 << ci)) out += CASTLE_CHARS[ci];
        rights = out;
      }
    }
    var oldMask = castMask(pos.castling), newMask = castMask(rights);
    if (oldMask !== newMask) {
      ha ^= ZC_A[oldMask] ^ ZC_A[newMask];
      hb ^= ZC_B[oldMask] ^ ZC_B[newMask];
    }

    var newEp = m.flag === "b" ? (m.from + (us === "w" ? -16 : 16)) : -1;
    if (pos.ep >= 0) { var of = pos.ep & 15; ha ^= ZE_A[of]; hb ^= ZE_B[of]; }
    if (newEp >= 0)  { var nf = newEp & 15;  ha ^= ZE_A[nf]; hb ^= ZE_B[nf]; }

    ha ^= ZT_A; hb ^= ZT_B;                 // the side to move always flips

    return {
      board: b,
      turn: us === "w" ? "b" : "w",
      castling: rights,
      ep: newEp,
      half: (lower === "p" || m.captured !== "") ? 0 : pos.half + 1,
      full: pos.full + (us === "b" ? 1 : 0),
      ha: ha, hb: hb, hash: (ha >>> 0) * 1048576 + (hb >>> 12),
    };
  }

  function san(pos, m, legal) {
    var out;
    if (m.flag === "k") out = "O-O";
    else if (m.flag === "q") out = "O-O-O";
    else {
      var lower = m.piece.toLowerCase();
      var to = idxToSq(m.to);
      if (lower === "p") {
        out = m.captured !== "" ? idxToSq(m.from)[0] + "x" + to : to;
        if (m.promotion !== "") out += "=" + m.promotion.toUpperCase();
      } else {
        var same = legal.filter(function (o) {
          return o.to === m.to && o.piece === m.piece && o.from !== m.from;
        });
        var dis = "";
        if (same.length) {
          var fromSq = idxToSq(m.from);
          var sameFile = same.filter(function (o) { return (o.from & 15) === (m.from & 15); });
          var sameRank = same.filter(function (o) { return (o.from >> 4) === (m.from >> 4); });
          if (!sameFile.length) dis = fromSq[0];
          else if (!sameRank.length) dis = fromSq[1];
          else dis = fromSq;
        }
        out = lower.toUpperCase() + dis + (m.captured !== "" ? "x" : "") + to;
      }
    }
    var after = apply(pos, m);
    if (inCheck(after)) out += legalMoves(after).length ? "+" : "#";
    return out;
  }

  function insufficientMaterial(pos) {
    var w = [], b = [];
    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = pos.board[i];
      if (p === "" || p.toLowerCase() === "k") continue;
      var rec = { t: p.toLowerCase(), dark: (((i >> 4) + (i & 15)) % 2) === 1 };
      (colourOf(p) === "w" ? w : b).push(rec);
    }
    var heavy = w.concat(b).some(function (pc) { return pc.t === "p" || pc.t === "r" || pc.t === "q"; });
    if (heavy) return false;
    if (!w.length && !b.length) return true;
    if (w.length + b.length === 1) return true;
    if (w.length === 1 && b.length === 1 && w[0].t === "b" && b[0].t === "b") return w[0].dark === b[0].dark;
    return false;
  }

  function repetitionKey(pos) { return toFen(pos).split(" ").slice(0, 4).join(" "); }

  function status(pos, counts) {
    var legal = legalMoves(pos), check = inCheck(pos);
    if (!legal.length) {
      return check
        ? { state: "checkmate", winner: pos.turn === "w" ? "b" : "w", reason: "checkmate" }
        : { state: "stalemate", winner: "", reason: "stalemate" };
    }
    if (insufficientMaterial(pos)) return { state: "draw", winner: "", reason: "insufficient_material" };
    if (pos.half >= 100) return { state: "draw", winner: "", reason: "fifty_move" };
    if (counts && (counts[repetitionKey(pos)] || 0) >= 3) return { state: "draw", winner: "", reason: "threefold" };
    return { state: check ? "check" : "active", winner: "", reason: "" };
  }

  /** Play one UCI move ("e2e4", "e7e8q") against a FEN. */
  function move(fen, uci, counts) {
    var pos = parseFen(fen);
    if (!pos) return { ok: false, error: "bad_fen" };
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(uci || ""))) return { ok: false, error: "bad_move" };
    var from = sqToIdx(uci.slice(0, 2)), to = sqToIdx(uci.slice(2, 4));
    var promo = uci.length > 4 ? uci[4] : "";
    var legal = legalMoves(pos);
    var chosen = null;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.from === from && m.to === to && (m.promotion || "") === promo) { chosen = m; break; }
    }
    if (!chosen) return { ok: false, error: "illegal_move" };
    var sanText = san(pos, chosen, legal);
    var after = apply(pos, chosen);
    return { ok: true, fen: toFen(after), san: sanText, uci: uci,
             status: status(after, counts), capture: chosen.captured !== "" };
  }

  function uciOf(m) { return idxToSq(m.from) + idxToSq(m.to) + (m.promotion || ""); }

  function perft(fen, depth) {
    var pos = parseFen(fen);
    return pos ? perftPos(pos, depth) : 0;
  }
  function perftPos(pos, depth) {
    if (depth <= 0) return 1;
    var legal = legalMoves(pos), n = 0;
    if (depth === 1) return legal.length;
    for (var i = 0; i < legal.length; i++) n += perftPos(apply(pos, legal[i]), depth - 1);
    return n;
  }

  /* ── The opponent ───────────────────────────────────────────────────────
     Negamax with alpha-beta and a quiescence pass, over a material +
     piece-square evaluation. Not strong; strong is not the goal. The goal is
     eight levels that FEEL like the eight things the design promises them to
     be, from "learning" to one that punishes a hanging piece — reachable in
     under a second on a 2GB Android device, because a bot that thinks for six
     seconds on a phone is a bot children stop playing. */

  var VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  // Piece-square tables, from White's view; Black reads them mirrored. These
  // are the standard "simplified evaluation" tables — enough to make the bot
  // develop pieces and push pawns rather than shuffle a rook.
  var PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
        5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
        5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
        -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
        -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
        -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
        -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
        -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
        -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
        20,20,0,0,0,20,20,20, 20,30,10,0,0,10,30,20],
  };

  /* A SECOND king table, for the endgame.
     With one middlegame table the king hides on g1 forever — which is right
     with queens on and actively losing in a king-and-pawn ending, where the
     king is a strong piece and has to walk to the centre. A bot that will not
     bring its king out in an endgame cannot convert a won pawn ending, and
     that is the ending children reach most. */
  var PST_KING_END = [
    -50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30,
    -30,-10,20,30,30,20,-10,-30,     -30,-10,30,40,40,30,-10,-30,
    -30,-10,30,40,40,30,-10,-30,     -30,-10,20,30,30,20,-10,-30,
    -30,-30,0,0,0,0,-30,-30,         -50,-30,-30,-30,-30,-30,-30,-50,
  ];

  /* How far into the endgame the position is, 0 (opening) to 1 (bare kings).
     Blends the two king tables rather than switching between them at an
     arbitrary line, so the king's preferred square drifts to the centre as
     material comes off instead of teleporting there on one capture.
     evaluate() inlines this into its own pass; kept for callers who want the
     number on its own. */
  function phaseOf(pos) {
    var np = 0;
    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = pos.board[i];
      if (p === "") continue;
      var l = p.toLowerCase();
      if (l === "n" || l === "b") np += 1;
      else if (l === "r") np += 2;
      else if (l === "q") np += 4;
    }
    // 24 is the full complement of non-pawn material at the start.
    return Math.max(0, Math.min(1, (24 - np) / 24));
  }

  /** Score in centipawns from the side-to-move's point of view. */
  function evaluate(pos) {
    var score = 0;
    var b = pos.board;
    /* Per-file pawn counts, and the most advanced pawn on each file. Both fall
       out of the one pass the loop below already makes, and between them they
       answer doubled, isolated and passed without a second scan. Ranks are
       0x88 rows, so 0 is the eighth rank and 7 is the first: "advanced" for
       White means a SMALLER number. */
    var wFile = [0,0,0,0,0,0,0,0], bFile = [0,0,0,0,0,0,0,0];
    var wBest = [8,8,8,8,8,8,8,8], bBest = [-1,-1,-1,-1,-1,-1,-1,-1];
    var wBishops = 0, bBishops = 0;
    var wRooks = [], bRooks = [];
    var np = 0, wKing = -1, bKing = -1;

    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = b[i];
      if (p === "") continue;
      var white = WHITE_PIECE[p] === true;
      var lower = white ? p.toLowerCase() : p;
      var rank = i >> 4, file = i & 15;
      var idx = white ? (rank * 8 + file) : ((7 - rank) * 8 + file);
      if (lower === "k") { if (white) wKing = i; else bKing = i; continue; }
      score += white ? (VALUE[lower] + PST[lower][idx]) : -(VALUE[lower] + PST[lower][idx]);
      if (lower === "n" || lower === "b") np += 1;
      else if (lower === "r") np += 2;
      else if (lower === "q") np += 4;
      if (lower === "p") {
        if (white) { wFile[file]++; if (rank < wBest[file]) wBest[file] = rank; }
        else       { bFile[file]++; if (rank > bBest[file]) bBest[file] = rank; }
      } else if (lower === "b") { if (white) wBishops++; else bBishops++; }
      else if (lower === "r") { if (white) wRooks.push(file); else bRooks.push(file); }
    }

    // 24 is the full complement of non-pawn material at the start.
    var phase = (24 - np) / 24;
    if (phase < 0) phase = 0; else if (phase > 1) phase = 1;

    if (wKing >= 0) {
      var wk = (wKing >> 4) * 8 + (wKing & 15);
      score += VALUE.k + Math.round(PST.k[wk] * (1 - phase) + PST_KING_END[wk] * phase);
    }
    if (bKing >= 0) {
      var bkr = 7 - (bKing >> 4), bk = bkr * 8 + (bKing & 15);
      score -= VALUE.k + Math.round(PST.k[bk] * (1 - phase) + PST_KING_END[bk] * phase);
    }

    /* ── Pawn structure ──────────────────────────────────────────────────
       Each term is here because a child can watch the bot get it wrong
       without it, not because it adds rating on a list somewhere.

       DOUBLED: it trades into them cheerfully.
       ISOLATED: it makes them and then cannot defend them.
       PASSED: without this the engine will not push a pawn that is going to
         queen, because a pawn on the seventh scores the same 100 as a pawn on
         the second and the piece-square table's twenty points do not cover the
         difference. This is the single most visible weakness in a pawn ending,
         and pawn endings are what club children reach. */
    for (var f = 0; f < 8; f++) {
      if (wFile[f] > 1) score -= 16 * (wFile[f] - 1);
      if (bFile[f] > 1) score += 16 * (bFile[f] - 1);
      var wl = f > 0 ? wFile[f - 1] : 0, wr = f < 7 ? wFile[f + 1] : 0;
      var bl = f > 0 ? bFile[f - 1] : 0, br = f < 7 ? bFile[f + 1] : 0;
      if (wFile[f] && !wl && !wr) score -= 14;
      if (bFile[f] && !bl && !br) score += 14;

      if (wFile[f]) {
        // Nothing black on this file or either neighbour, in front of it.
        var wr0 = wBest[f];
        var blocked = (bBest[f] >= 0 && bBest[f] < wr0)
          || (f > 0 && bBest[f - 1] >= 0 && bBest[f - 1] < wr0)
          || (f < 7 && bBest[f + 1] >= 0 && bBest[f + 1] < wr0);
        if (!blocked) score += PASSED[7 - wr0];
      }
      if (bFile[f]) {
        var br0 = bBest[f];
        var blocked2 = (wBest[f] < 8 && wBest[f] > br0)
          || (f > 0 && wBest[f - 1] < 8 && wBest[f - 1] > br0)
          || (f < 7 && wBest[f + 1] < 8 && wBest[f + 1] > br0);
        if (!blocked2) score -= PASSED[br0];
      }
    }

    /* Rooks belong on files pawns have left. Without this the engine leaves a
       rook on b1 for forty moves and cannot say why. */
    for (var ri = 0; ri < wRooks.length; ri++) {
      var rf = wRooks[ri];
      if (!wFile[rf]) score += bFile[rf] ? 12 : 25;
    }
    for (var rj = 0; rj < bRooks.length; rj++) {
      var rf2 = bRooks[rj];
      if (!bFile[rf2]) score -= wFile[rf2] ? 12 : 25;
    }

    if (wBishops >= 2) score += 30;
    if (bBishops >= 2) score -= 30;

    /* The pawns in front of a castled king, while there are pieces to punish
       their absence. Faded out with the phase, because in an endgame those
       same pawns should be marching. */
    if (phase < 0.7) {
      var shield = Math.round((1 - phase / 0.7) * 12);
      if (shield > 0) {
        if (wKing >= 0 && (wKing >> 4) === 7) score += shield * pawnShield(b, wKing, "P", -16);
        if (bKing >= 0 && (bKing >> 4) === 0) score -= shield * pawnShield(b, bKing, "p", 16);
      }
    }

    return pos.turn === "w" ? score : -score;
  }

  /* A passed pawn by the rank it has reached, from its own side's view. The
     jump at the sixth and seventh is the point: a pawn two squares from
     queening is not worth twice a pawn four squares away. */
  var PASSED = [0, 8, 14, 24, 44, 78, 120, 0];

  /** How many of the three squares in front of the king hold one of its own
   *  pawns, 0 to 3. */
  function pawnShield(b, k, pawn, fwd) {
    var n = 0;
    for (var d = -1; d <= 1; d++) {
      var t = k + fwd + d;
      if (!(t & 0x88) && b[t] === pawn) n++;
      else {
        var t2 = k + fwd + fwd + d;
        if (!(t2 & 0x88) && b[t2] === pawn) n++;
      }
    }
    return n;
  }

  // Search order decides how much alpha-beta actually prunes. Captures first,
  // most-valuable-victim first, is the cheapest ordering that works.
  function ordered(pos, moves) {
    return moves.slice().sort(function (a, b) {
      var av = a.captured ? VALUE[a.captured.toLowerCase()] - VALUE[a.piece.toLowerCase()] / 10 : -1;
      var bv = b.captured ? VALUE[b.captured.toLowerCase()] - VALUE[b.piece.toLowerCase()] / 10 : -1;
      if (a.promotion) av += 800;
      if (b.promotion) bv += 800;
      return bv - av;
    });
  }

  /* Quiescence: never evaluate a position in the middle of a trade. Without
     it the bot happily plays QxP one ply before the search horizon and calls
     it winning a pawn — the single most obvious way a weak engine looks
     broken rather than weak. */
  function quiesce(pos, alpha, beta, depth) {
    nodes++;
    var stand = evaluate(pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (depth <= 0) return alpha;
    var all = legalMoves(pos);
    /* Captures only, and only the ones that are not obviously bad.
     *
     * Without the SEE filter the quiescence budget goes on lines like QxP
     * defended by a pawn: the engine plays it, gets recaptured, and has spent
     * a whole sub-tree learning what one subtraction would have told it. The
     * filter is also the ordering key, so the exchange is evaluated once and
     * used twice.
     *
     * A losing capture is skipped rather than searched last, because
     * quiescence has no depth to spare — that is the whole point of it. */
    var caps = [];
    for (var c = 0; c < all.length; c++) {
      var mv = all[c];
      if (mv.captured === "" && mv.promotion === "") continue;
      var gain = mv.promotion !== "" ? 800 : seeCapture(pos, mv);
      if (gain < 0) continue;
      caps.push({ m: mv, g: gain });
    }
    caps.sort(function (a, b) { return b.g - a.g; });
    for (var i = 0; i < caps.length; i++) {
      var score = -quiesce(apply(pos, caps[i].m), -beta, -alpha, depth - 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /* ── What makes the search actually search ────────────────────────────────
     The three things below are worth more than any amount of extra depth,
     because they are what LETS the depth happen: a transposition table so the
     same position is not re-searched down every move order that reaches it,
     and killer/history ordering so alpha-beta cuts on the first move it tries
     rather than the fifteenth.

     All three are per-search and cleared between moves. A table carried
     across moves would be faster still and is not worth the class of bug it
     invites on a device with 2GB of RAM. */

  var TT = new Map();                // hash → { d, score, flag, move }
  var TT_MAX = 200000;               // ~ a few MB of small objects
  var killers = [];                  // [ply] → [uci, uci]
  var history = Object.create(null); // uci → cutoff count
  var nodes = 0, deadline = 0, aborted = false;

  /* The key is the position's Zobrist hash, maintained by apply(). See the
   * hashing block near the top for why this replaced a string key and why the
   * first attempt at it measured slower. */
  function ttReset() { TT = new Map(); killers = []; history = Object.create(null); historyUsed = false; }
  function ttPut(key, d, score, flag, move) {
    /* Never store a mate score. It is measured in plies FROM THE ROOT, so the
       same entry read at a different distance reports the wrong one — the
       engine then believes in a mate that is nearer or further than it is. The
       position is cheap to re-search and being right about mate is not
       optional. */
    if (Math.abs(score) > 90000) return;
    if (TT.size >= TT_MAX) TT.clear();
    var e = TT.get(key);
    if (e && e.d > d) return;         // keep the deeper answer
    if (e) { e.d = d; e.score = score; e.flag = flag; e.move = move; return; }
    TT.set(key, { d: d, score: score, flag: flag, move: move });
  }

  /* Move ordering, best first:
       1. the move the table already liked here
       2. captures, most-valuable-victim first
       3. killers — quiet moves that caused a cutoff at this ply elsewhere
       4. everything else, by how often it has cut off before             */
  function orderedFull(pos, moves, ply, ttMove) {
    /* Decorate, sort, undecorate.
     *
     * Scoring inside the comparator looked tidy and was the single most
     * expensive thing in the search: a comparator runs O(n log n) times and
     * this one called uciOf(), which builds a string. Thirty moves is ~150
     * comparisons, so ~300 string allocations per node, at every node. The
     * key is computed once per move instead, which is n allocations.
     *
     * Measured: this alone took a level-8 middlegame search from reaching
     * depth 4 in 1.8s to reaching it comfortably inside the budget.
     */
    var kk = killers[ply] || [];
    var n = moves.length;
    var dec = new Array(n);
    for (var i = 0; i < n; i++) {
      var m = moves[i];
      var sc;
      if (m.captured) {
        /* Most-valuable-victim first is a guess; the exchange is the answer.
           A capture that loses material is ordered BELOW the quiet moves,
           because a quiet move that does nothing still beats one that hands
           over a rook. */
        var g = seeCapture(pos, m);
        sc = g >= 0 ? 100000 + g : -100000 + g;
      } else if (m.promotion) {
        sc = 90000;
      } else {
        sc = 0;
      }
      /* The three tests that DO need the uci are only asked for quiet moves,
         and only when there is something to compare against. */
      if (sc > -90000 && sc < 90000 && (ttMove || kk.length || historyUsed)) {
        var u = uciOf(m);
        if (ttMove && u === ttMove) sc = 1000000;
        else if (u === kk[0]) sc = 80000;
        else if (u === kk[1]) sc = 79000;
        else sc = history[u] || 0;
      } else if (ttMove && sc >= 90000) {
        if (uciOf(m) === ttMove) sc = 1000000;
      }
      dec[i] = { m: m, s: sc };
    }
    dec.sort(function (a, b) { return b.s - a.s; });
    var out = new Array(n);
    for (var j = 0; j < n; j++) out[j] = dec[j].m;
    return out;
  }
  var historyUsed = false;

  /** A "pass": the same position with the other side to move. Only ever used
   *  by null-move pruning, and never on a real board — passing is not a legal
   *  chess move. The board array is SHARED rather than copied, which is safe
   *  because apply() always builds a new one and never writes into its parent. */
  function applyNull(pos) {
    var ha = pos.ha ^ ZT_A, hb = pos.hb ^ ZT_B;
    if (pos.ep >= 0) { var f = pos.ep & 15; ha ^= ZE_A[f]; hb ^= ZE_B[f]; }
    return { board: pos.board, turn: pos.turn === "w" ? "b" : "w", castling: pos.castling,
             ep: -1, half: pos.half + 1, full: pos.full,
             ha: ha, hb: hb, hash: zCombine(ha, hb) };
  }

  /** Does the side to move have anything but pawns and a king?
   *  Null-move pruning assumes passing is bad for you. In a king-and-pawn
   *  ending it often is not — that is zugzwang, where every move you have
   *  loses and passing would save you — so the pruning has to be switched off
   *  exactly there or the engine hallucinates safety in the endings children
   *  reach most. */
  function hasPieces(pos) {
    var b = pos.board, want = pos.turn === "w";
    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = b[i];
      if (p === "") continue;
      var l = p.toLowerCase();
      if (l === "p" || l === "k") continue;
      if ((p === p.toUpperCase()) === want) return true;
    }
    return false;
  }

  function timeUp() {
    // Checked every few thousand nodes rather than every node: Date.now() is
    // not free, and on a low-end Android it is measurably not free.
    if (deadline && (nodes & 1023) === 0 && Date.now() > deadline) aborted = true;
    return aborted;
  }

  function negamax(pos, depth, alpha, beta, ply) {
    ply = ply || 0;
    nodes++;
    if (timeUp()) return alpha;

    var key = pos.hash;
    var hit = TT.get(key);
    var ttMove = hit ? hit.move : null;
    if (hit && hit.d >= depth) {
      if (hit.flag === 0) return hit.score;                      // exact
      if (hit.flag === 1 && hit.score <= alpha) return alpha;    // upper bound
      if (hit.flag === 2 && hit.score >= beta) return beta;      // lower bound
    }

    /* Mate is checked BEFORE dropping into quiescence.
     *
     * Quiescence has no notion of checkmate — it stands pat on a static
     * evaluation — so a mate sitting exactly on the horizon was scored as
     * ordinary material. With a fixed depth that never showed, because the
     * mate was always at least two plies inside the search. With iterative
     * deepening the first pass IS depth one, the mate node is the horizon, and
     * the engine ranked "mate in one" level with "win a pawn" and then kept
     * that ordering for every deeper pass. It missed a rook mate on an empty
     * board.
     *
     * Generating moves at the leaf costs a move-gen that quiescence was about
     * to do anyway. */
    var moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos) ? -99000 + ply : 0;   // mate sooner is better
    if (depth <= 0) return quiesce(pos, alpha, beta, 4);
    /* A check extension. Searching one ply deeper when in check is the
       cheapest way to stop the engine walking into a forced mate that sits
       one move past its horizon — the failure that looks least like "weak"
       and most like "broken". */
    var checkNow = inCheck(pos);
    if (checkNow) depth++;

    /* ── Null-move pruning ────────────────────────────────────────────────
       Give the opponent a free move. If the position is still good enough to
       beat beta even after handing them a tempo, it is good enough to stop
       looking — nothing they do here is going to hurt. This is the single
       largest saving in the search and it costs fifteen lines.

       Three guards, each for a real failure rather than for form:
         · not in check — passing while in check is not a position at all;
         · only at depth 3 and up — below that the reduced search is the
           whole search, and it prunes the answer;
         · only with pieces on the board — see hasPieces(). */
    if (!checkNow && depth >= 3 && beta < 90000 && hasPieces(pos)) {
      var R = depth >= 6 ? 3 : 2;
      var nullScore = -negamax(applyNull(pos), depth - 1 - R, -beta, -beta + 1, ply + 1);
      if (aborted) return alpha;
      if (nullScore >= beta) return beta;
    }

    moves = orderedFull(pos, moves, ply, ttMove);
    var best = -100000, bestMv = null, origAlpha = alpha;
    for (var i = 0; i < moves.length; i++) {
      var child = apply(pos, moves[i]);
      var score;
      /* ── Late move reductions ──────────────────────────────────────────
         The ordering above is good, so a quiet move sitting fifth or later is
         probably not the best move. Search it shallower first, and only pay
         for the full depth if the cheap search says it might be. Wrong
         occasionally, and the re-search is what makes being wrong cheap. */
      var reduce = 0;
      if (depth >= 3 && i >= 3 && !moves[i].captured && !moves[i].promotion
          && !checkNow && !inCheck(child)) {
        reduce = i >= 6 ? 2 : 1;
        if (reduce >= depth) reduce = depth - 1;
      }
      if (reduce > 0) {
        score = -negamax(child, depth - 1 - reduce, -alpha - 1, -alpha, ply + 1);
        if (!aborted && score > alpha) score = -negamax(child, depth - 1, -beta, -alpha, ply + 1);
      } else {
        score = -negamax(child, depth - 1, -beta, -alpha, ply + 1);
      }
      if (aborted) return alpha;
      if (score > best) { best = score; bestMv = uciOf(moves[i]); }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        // A quiet move that caused a cutoff is worth trying first next time.
        if (!moves[i].captured) {
          killers[ply] = killers[ply] || [];
          if (killers[ply][0] !== bestMv) { killers[ply][1] = killers[ply][0]; killers[ply][0] = bestMv; }
          history[bestMv] = (history[bestMv] || 0) + depth * depth;
          historyUsed = true;
        }
        ttPut(key, depth, beta, 2, bestMv);
        return beta;
      }
    }
    ttPut(key, depth, best, alpha > origAlpha ? 0 : 1, bestMv);
    return alpha;
  }

  /* ── A small opening book ─────────────────────────────────────────────────
     Twelve plies of the openings a club actually plays, keyed by position so
     transpositions hit. Not for strength: an engine that answers 1.e4 with
     1...a6 after four seconds of thought looks broken to a child who has been
     taught to control the centre, and the first three moves are exactly where
     a search this size has least to say. */
  var BOOK = {
    // start position
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w": ["e2e4", "d2d4", "g1f3", "c2c4"],
    // after 1.e4
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b": ["e7e5", "c7c5", "e7e6", "c7c6"],
    // after 1.d4
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b": ["d7d5", "g8f6", "e7e6"],
    // after 1.e4 e5
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w": ["g1f3", "f1c4", "b1c3"],
    // after 1.e4 e5 2.Nf3
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b": ["b8c6", "g8f6"],
    // after 1.e4 c5
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w": ["g1f3", "b1c3"],
    // after 1.d4 d5
    "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w": ["c2c4", "g1f3"],
    // after 1.d4 Nf6
    "rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w": ["c2c4", "g1f3"],
  };
  function bookMove(pos, random) {
    // Placement + side only: the book is about the position, not the counters.
    var fen = pos.board.filter(function (_, i) { return !(i & 0x88); });
    var key = fenPlacement(pos) + " " + pos.turn;
    var list = BOOK[key];
    if (!list || !list.length) return null;
    var legal = legalMoves(pos).map(uciOf);
    var usable = list.filter(function (u) { return legal.indexOf(u) >= 0; });
    if (!usable.length) return null;
    return usable[Math.floor(random() * usable.length)];
  }
  /** The placement field of the FEN, which is the half the book keys on. */
  function fenPlacement(pos) {
    var out = [];
    for (var r = 0; r < 8; r++) {
      var row = "", empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = pos.board[r * 16 + f];
        if (p === "") { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p;
      }
      if (empty) row += empty;
      out.push(row);
    }
    return out.join("/");
  }

  /* The eight levels.
   *
   * `depth` is how far it looks; `slip` is how often it deliberately plays
   * something other than its best move, and `blunder` how far down the list
   * that something may be. A beginner does not want a weaker engine, they want
   * an opponent that sometimes misses — and an engine made weak only by depth
   * plays perfectly right up until it doesn't, which is the least useful
   * teacher of the two. The blurbs are what the level sheet shows. */
  /* `depth` is the CAP; `ms` is the budget. Iterative deepening stops at
     whichever comes first, which is what makes the same level feel the same on
     a desktop and on a 2GB Android: the strong levels think for a fixed slice
     of time rather than for however long that phone needs to reach depth 4.

     `book` is whether the level plays opening theory. The weakest two do not —
     a level-1 bot that answers 1.e4 with a book move and then hangs its queen
     is a confusing teacher. */
  var LEVELS = [
    { level: 1, depth: 1, ms: 60,   slip: 0.60, blunder: 6, book: false, rating: 600,
      blurb: "Plays the first thing it likes. Good for learning how the pieces move." },
    { level: 2, depth: 1, ms: 90,   slip: 0.40, blunder: 4, book: false, rating: 750,
      blurb: "Takes what you leave hanging, and not much else." },
    { level: 3, depth: 2, ms: 150,  slip: 0.28, blunder: 4, book: true,  rating: 950,
      blurb: "Sees one move ahead properly. It will trade if you let it." },
    { level: 4, depth: 3, ms: 250,  slip: 0.15, blunder: 3, book: true,  rating: 1250,
      blurb: "Punishes loose pieces, misses long tactics." },
    { level: 5, depth: 4, ms: 400,  slip: 0.10, blunder: 3, book: true,  rating: 1450,
      blurb: "Two moves ahead and rarely gives anything away." },
    { level: 6, depth: 5, ms: 700,  slip: 0.05, blunder: 2, book: true,  rating: 1600,
      blurb: "Finds short tactics. You will need a plan." },
    { level: 7, depth: 6, ms: 1100, slip: 0.02, blunder: 2, book: true,  rating: 1750,
      blurb: "Calculates. Loose play gets punished immediately." },
    { level: 8, depth: 8, ms: 1800, slip: 0,    blunder: 1, book: true,  rating: 1900,
      blurb: "No mistakes on purpose. Brutal." },
  ];

  function levelInfo(level) {
    return LEVELS[Math.min(LEVELS.length, Math.max(1, level | 0)) - 1];
  }

  /**
   * The computer's move for a position.
   *
   * `rand` is injectable so a test can make the slip deterministic — a bot
   * that is random by design is otherwise untestable, and "sometimes wrong"
   * is exactly the behaviour worth pinning down.
   */
  function bestMove(fen, level, rand, opts) {
    var pos = parseFen(fen);
    if (!pos) return null;
    /* `opts` overrides the level's budget without inventing a new level.
       Analysis and the benchmark both want "level 8's search, but for this
       long and this deep"; a ninth level would be a level a child could
       choose, and this is not a level. */
    var info = levelInfo(level || 4);
    if (opts) {
      info = { level: info.level, depth: opts.depth || info.depth, ms: opts.ms || info.ms,
               slip: opts.slip !== undefined ? opts.slip : info.slip,
               blunder: info.blunder, book: opts.book !== undefined ? opts.book : info.book,
               rating: info.rating, blurb: info.blurb };
    }
    var moves = legalMoves(pos);
    if (!moves.length) return null;
    var random = rand || Math.random;

    /* Book first. Cheap, instant, and it stops the opening looking broken. */
    if (info.book) {
      var bm = bookMove(pos, random);
      if (bm) {
        var bmv = null;
        for (var bi = 0; bi < moves.length; bi++) if (uciOf(moves[bi]) === bm) bmv = moves[bi];
        if (bmv) return { uci: bm, san: san(pos, bmv, moves), score: 0, best: bm, slipped: false, book: true, depth: 0 };
      }
    }

    /* ITERATIVE DEEPENING.
       Search depth 1, then 2, then 3 … keeping the previous iteration's best
       move to try first at the next. That sounds like waste and is the
       opposite: the ordering it produces makes each deeper pass cheaper than
       searching that depth cold, and — the part that matters here — there is
       always a complete answer to hand the moment the time budget runs out.
       A fixed depth on a slow phone means either a bot that is too weak
       everywhere or one that freezes the tab on level 8. */
    ttReset();
    nodes = 0; aborted = false;
    deadline = Date.now() + (info.ms || 250);

    var scored = [];
    var reached = 0;
    for (var d = 1; d <= info.depth; d++) {
      var pass = [];
      var alpha = -100000;
      // Previous iteration's ranking first; the best move from depth d-1 is
      // overwhelmingly the best at depth d, and trying it first is most of
      // where the pruning comes from.
      var order = scored.length
        ? scored.map(function (x) { return x.m; })
        : orderedFull(pos, moves, 0, null);
      /* Principal variation search at the ROOT.
       *
       * The old code searched every root move with beta = -alpha, which is a
       * null window: a move BETTER than the current best fails high and comes
       * back as the bound rather than as its score, so `sc > alpha` is never
       * true and the ranking silently keeps the first move it liked. That is
       * why the engine could not see a mate in one from the root — the mate
       * scored 98999 internally and was reported as alpha.
       *
       * PVS does it properly: the first move gets a full window, the rest get
       * a cheap null-window scout, and any move that beats alpha is
       * RE-SEARCHED with a full window to find out by how much. Same pruning,
       * correct scores. */
      for (var si = 0; si < order.length; si++) {
        var child = apply(pos, order[si]);
        var sc;
        if (si === 0) {
          sc = -negamax(child, d - 1, -100000, 100000, 1);
        } else {
          sc = -negamax(child, d - 1, -alpha - 1, -alpha, 1);
          if (!aborted && sc > alpha) sc = -negamax(child, d - 1, -100000, 100000, 1);
        }
        if (aborted) break;
        if (sc > alpha) alpha = sc;
        pass.push({ m: order[si], score: sc });
      }
      if (aborted) break;                 // keep the last COMPLETE iteration
      pass.sort(function (a, b) { return b.score - a.score; });
      scored = pass;
      reached = d;
      // A forced mate is found; deeper will not improve on it.
      if (Math.abs(scored[0].score) > 90000) break;
    }
    if (!scored.length) {
      // The budget expired inside depth 1 on a very slow device. Something
      // has to be played, and a captures-first ordering is not nothing.
      scored = orderedFull(pos, moves, 0, null).map(function (mv) { return { m: mv, score: 0 }; });
    }

    var pick = 0;
    if (info.slip > 0 && scored.length > 1 && random() < info.slip) {
      // Slip DOWN the ranked list, never into a move it has not looked at:
      // the mistakes are human-shaped (a worse plan), not absurd.
      pick = 1 + Math.floor(random() * Math.min(info.blunder, scored.length - 1));
    }
    var chosen = scored[Math.min(pick, scored.length - 1)];
    return {
      uci: uciOf(chosen.m),
      san: san(pos, chosen.m, moves),
      score: chosen.score,
      best: uciOf(scored[0].m),
      slipped: pick > 0,
      book: false,
      depth: reached,
      nodes: nodes,
    };
  }

  /* ── The line, not just the move ──────────────────────────────────────────
     After a search the table holds the best move for every position on the
     principal variation, so the line can be walked out of it. Capped, and
     stopped on a repeat, because a table entry can point into a cycle and a
     review that prints the same move forty times is worse than one that prints
     three moves. */
  function extractPv(pos, limit) {
    var out = [], seen = Object.create(null), cur = pos;
    for (var i = 0; i < (limit || 6); i++) {
      var e = TT.get(cur.hash);
      if (!e || !e.move) break;
      if (seen[cur.hash]) break;
      seen[cur.hash] = 1;
      var legal = legalMoves(cur), found = null;
      for (var j = 0; j < legal.length; j++) if (uciOf(legal[j]) === e.move) { found = legal[j]; break; }
      if (!found) break;                       // a collision, or a stale entry
      out.push({ uci: e.move, san: san(cur, found, legal) });
      cur = apply(cur, found);
    }
    return out;
  }

  /* ── After-game review ────────────────────────────────────────────────────
     What a child gets after the game is over: what the position was worth
     before their move, what it was worth after, and what the engine would
     have played. Deliberately exposed one POSITION at a time rather than as a
     whole-game call, for two reasons:

       · a sixty-move game at a serious budget is fifteen seconds of solid
         computation, and doing that in one synchronous call freezes the tab on
         the phones this is for;
       · scoring each position once is enough. The value of the move played at
         position i is the value of position i+1 with the sign flipped, so a
         review needs n+1 searches and not 2n.
  */
  function positionScore(fen, opts) {
    var pos = parseFen(fen);
    if (!pos) return null;
    var moves = legalMoves(pos);
    if (!moves.length) {
      return { score: inCheck(pos) ? -99000 : 0, best: null, san: "", pv: [], terminal: true };
    }
    var r = bestMove(fen, 8, function () { return 0.99; },
                     { ms: (opts && opts.ms) || 400, depth: (opts && opts.depth) || 20,
                       slip: 0, book: false });
    if (!r) return null;
    /* The ROOT is never written to the table — negamax stores the nodes below
       it — so the line starts with the move we already know and is walked from
       the position it leads to. */
    var pv = [], head = null;
    for (var i = 0; i < moves.length; i++) if (uciOf(moves[i]) === r.uci) { head = moves[i]; break; }
    if (head) {
      pv.push({ uci: r.uci, san: san(pos, head, moves) });
      pv = pv.concat(extractPv(apply(pos, head), ((opts && opts.pv) || 4) - 1));
    }
    return { score: r.score, best: r.uci, san: r.san, depth: r.depth, pv: pv, terminal: false };
  }

  /* The thresholds. Centipawns, and chosen for a child rather than copied from
     a server that grades masters: a fifty-point slip is not worth a word, and
     calling it one teaches them to ignore the words that matter. */
  var REVIEW_BANDS = [
    { at: 300, tag: "blunder",    label: "Blunder" },
    { at: 120, tag: "mistake",    label: "Mistake" },
    { at: 50,  tag: "inaccuracy", label: "Inaccuracy" },
  ];

  /** What to call a move that cost this much. */
  function classifyLoss(loss, wasBest) {
    if (wasBest) return { tag: "best", label: "Best move" };
    for (var i = 0; i < REVIEW_BANDS.length; i++) {
      if (loss >= REVIEW_BANDS[i].at) return { tag: REVIEW_BANDS[i].tag, label: REVIEW_BANDS[i].label };
    }
    return { tag: "good", label: "Good" };
  }

  /**
   * Accuracy from the average centipawn loss.
   *
   * There is no standard for this and every site computes it differently, so
   * what matters is that it is monotonic, bounded, and explainable in one
   * sentence: an average loss of nothing is 100, and it falls away steeply at
   * first and then slowly, because the difference between losing 10 and 40
   * centipawns a move is far bigger than between 200 and 230.
   *
   * It is NOT comparable with any other site's number, and the screen says so
   * rather than implying a child's 82 means what a 82 means elsewhere.
   */
  function accuracyFrom(avgLoss) {
    if (!(avgLoss >= 0)) return 0;
    var a = 100 * Math.exp(-avgLoss / 90);
    return Math.max(0, Math.min(100, Math.round(a)));
  }

  /**
   * A hint: the best move here, and how much better it is than the average.
   * Used by the practice aids — "highlights one good square" — and by the
   * blunder warning, which asks the same question about a move the member is
   * ABOUT to play rather than about the position.
   */
  function analyse(fen, depth) {
    var pos = parseFen(fen);
    if (!pos) return null;
    var moves = legalMoves(pos);
    if (!moves.length) return null;
    /* A fresh table and a budget of its own. Sharing the search state with
       bestMove() would let a hint inherit a cutoff bound from a different
       window and report a score that is a bound rather than a score — which
       is fine for choosing a move and wrong for telling a child how much
       their move cost them. */
    ttReset();
    nodes = 0; aborted = false;
    deadline = Date.now() + 350;
    /* Full window on every move, no scouting. This is what the blunder
       warning subtracts to tell a child how much their move cost, and a bound
       is not a score — "you lost 300 centipawns" has to be true. There are
       thirty-odd moves in a position; the extra work is affordable and the
       wrong number is not. */
    var order = orderedFull(pos, moves, 0, null);
    var scored = [];
    for (var i2 = 0; i2 < order.length; i2++) {
      var s2 = -negamax(apply(pos, order[i2]), (depth || 2) - 1, -100000, 100000, 1);
      scored.push({ uci: uciOf(order[i2]), san: san(pos, order[i2], moves), score: s2 });
    }
    deadline = 0;
    scored.sort(function (x, y) { return y.score - x.score; });
    return { best: scored[0], moves: scored };
  }

  /**
   * Would this move be a blunder? Compares the member's move against the best
   * one available, in centipawns. The threshold is deliberately generous —
   * warning a child about every inaccuracy teaches them to dismiss the
   * warning, which costs more than the pawn.
   */
  function blunderCheck(fen, uci, depth) {
    var a = analyse(fen, depth || 2);
    if (!a) return null;
    var mine = null;
    for (var i = 0; i < a.moves.length; i++) if (a.moves[i].uci === uci) { mine = a.moves[i]; break; }
    if (!mine) return null;
    var loss = a.best.score - mine.score;
    return { loss: loss, blunder: loss >= 200, best: a.best, mine: mine };
  }

  root.NggChess = {
    START_FEN: START_FEN,
    LEVELS: LEVELS,
    levelInfo: levelInfo,
    parseFen: parseFen, toFen: toFen,
    sqToIdx: sqToIdx, idxToSq: idxToSq, colourOf: colourOf,
    legalMoves: legalMoves, legalUci: function (fen) {
      var pos = parseFen(fen);
      return pos ? legalMoves(pos).map(uciOf) : [];
    },
    apply: apply, san: san, status: status, move: move, uciOf: uciOf,
    inCheck: inCheck, kingSquare: kingSquare, repetitionKey: repetitionKey,
    perft: perft, evaluate: evaluate, hashOf: hashOf,
    bestMove: bestMove, analyse: analyse, blunderCheck: blunderCheck,
    positionScore: positionScore, classifyLoss: classifyLoss,
    accuracyFrom: accuracyFrom, REVIEW_BANDS: REVIEW_BANDS,
  };
})(typeof window !== "undefined" ? window : globalThis);
