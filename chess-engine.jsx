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
  function isWhite(p) { return p !== "" && p === p.toUpperCase(); }
  function colourOf(p) { return p === "" ? "" : (p === p.toUpperCase() ? "w" : "b"); }

  /** FEN → position, or null. Null means REFUSE — never "assume the start". */
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

    return {
      board: board, turn: turn,
      castling: castling === "-" ? "" : castling,
      ep: epIdx,
      half: Math.max(0, isNaN(half) ? 0 : half),
      full: Math.max(1, isNaN(full) ? 1 : full),
    };
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

  function squareAttacked(pos, sq, by) {
    var board = pos.board, i, d, t, p, lower;
    // Pawns attack diagonally, and only forwards — the direction is the whole
    // of the rule and the classic place to get the sign backwards.
    var pDir = by === "w" ? 16 : -16;      // from `sq` looking BACK at the attacker
    for (var k = -1; k <= 1; k += 2) {
      t = sq + pDir + k;
      if (t & 0x88) continue;
      p = board[t];
      if (p !== "" && colourOf(p) === by && p.toLowerCase() === "p") return true;
    }
    for (var key in OFFSETS) {
      if (key === "b" || key === "r") continue;     // covered by q, plus their own loops below
      var offs = OFFSETS[key];
      for (i = 0; i < offs.length; i++) {
        d = offs[i]; t = sq + d;
        if (key === "n" || key === "k") {
          if (t & 0x88) continue;
          p = board[t];
          if (p !== "" && colourOf(p) === by && p.toLowerCase() === key) return true;
          continue;
        }
        // queen offsets, walked as rays: a bishop or rook on the matching ray
        // attacks too, which is why this loop tests three piece letters.
        while (!(t & 0x88)) {
          p = board[t];
          if (p !== "") {
            if (colourOf(p) === by) {
              lower = p.toLowerCase();
              var diagonal = (d === -17 || d === -15 || d === 15 || d === 17);
              if (lower === "q" || (diagonal ? lower === "b" : lower === "r")) return true;
            }
            break;
          }
          t += d;
        }
      }
    }
    return false;
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

    var legal = [];
    for (var m = 0; m < moves.length; m++) {
      var after = apply(pos, moves[m]);
      if (!inCheck(after, us)) legal.push(moves[m]);
    }
    return legal;
  }

  function apply(pos, m) {
    var b = pos.board.slice();
    var us = colourOf(m.piece);
    var lower = m.piece.toLowerCase();

    b[m.from] = "";
    b[m.to] = m.promotion !== "" ? (us === "w" ? m.promotion.toUpperCase() : m.promotion) : m.piece;

    if (m.flag === "e") b[m.to + (us === "w" ? 16 : -16)] = "";
    else if (m.flag === "k") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = ""; }
    else if (m.flag === "q") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = ""; }

    var rights = pos.castling;
    function strip(chars) { chars.forEach(function (c) { rights = rights.split(c).join(""); }); }
    if (lower === "k") strip(us === "w" ? ["K", "Q"] : ["k", "q"]);
    // A rook captured ON its corner also kills the right — the case everybody forgets.
    [[112, "Q"], [119, "K"], [0, "q"], [7, "k"]].forEach(function (pair) {
      if (m.from === pair[0] || m.to === pair[0]) strip([pair[1]]);
    });

    return {
      board: b,
      turn: us === "w" ? "b" : "w",
      castling: rights,
      ep: m.flag === "b" ? (m.from + (us === "w" ? -16 : 16)) : -1,
      half: (lower === "p" || m.captured !== "") ? 0 : pos.half + 1,
      full: pos.full + (us === "b" ? 1 : 0),
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
    var pawnFiles = { w: [0,0,0,0,0,0,0,0], b: [0,0,0,0,0,0,0,0] };
    var bishops = { w: 0, b: 0 };
    /* One pass, not two. The phase used to be its own 128-square loop called
       from here, so every leaf walked the board twice; the kings are noted and
       scored at the end instead. */
    var np = 0, kingIdx = { w: -1, b: -1 };
    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = pos.board[i];
      if (p === "") continue;
      var lower = p.toLowerCase();
      var white = isWhite(p);
      var rank = i >> 4, file = i & 15;
      var idx = white ? (rank * 8 + file) : ((7 - rank) * 8 + file);
      if (lower === "k") { kingIdx[white ? "w" : "b"] = idx; continue; }
      score += white ? (VALUE[lower] + (PST[lower] ? PST[lower][idx] : 0))
                     : -(VALUE[lower] + (PST[lower] ? PST[lower][idx] : 0));
      if (lower === "n" || lower === "b") np += 1;
      else if (lower === "r") np += 2;
      else if (lower === "q") np += 4;
      if (lower === "p") pawnFiles[white ? "w" : "b"][file]++;
      if (lower === "b") bishops[white ? "w" : "b"]++;
    }
    // 24 is the full complement of non-pawn material at the start.
    var phase = Math.max(0, Math.min(1, (24 - np) / 24));
    if (kingIdx.w >= 0) score += VALUE.k + Math.round(PST.k[kingIdx.w] * (1 - phase) + PST_KING_END[kingIdx.w] * phase);
    if (kingIdx.b >= 0) score -= VALUE.k + Math.round(PST.k[kingIdx.b] * (1 - phase) + PST_KING_END[kingIdx.b] * phase);
    /* Three structural terms, chosen because each one fixes a behaviour a
       child can SEE the bot getting wrong, not because they add rating:
       doubled pawns (it happily trades into them), the bishop pair (it gives
       one away for a knight for nothing), and a bare king in the middle. */
    for (var f = 0; f < 8; f++) {
      if (pawnFiles.w[f] > 1) score -= 18 * (pawnFiles.w[f] - 1);
      if (pawnFiles.b[f] > 1) score += 18 * (pawnFiles.b[f] - 1);
    }
    if (bishops.w >= 2) score += 30;
    if (bishops.b >= 2) score -= 30;
    return pos.turn === "w" ? score : -score;
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
    var stand = evaluate(pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (depth <= 0) return alpha;
    var caps = legalMoves(pos).filter(function (m) { return m.captured !== "" || m.promotion !== ""; });
    caps = ordered(pos, caps);
    for (var i = 0; i < caps.length; i++) {
      var score = -quiesce(apply(pos, caps[i]), -beta, -alpha, depth - 1);
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

  var TT = Object.create(null);      // key → { d, score, flag, move }
  var TT_SIZE = 0;
  var TT_MAX = 120000;               // ~ a few MB of small objects
  var killers = [];                  // [ply] → [uci, uci]
  var history = Object.create(null); // uci → cutoff count
  var nodes = 0, deadline = 0, aborted = false;

  /* The key is a string, and it was measured against the alternative.
   *
   * A Zobrist hash is the textbook answer and was tried here: 30-bit keys,
   * XORed per piece-square, no allocation. It made the search SLOWER —
   * level-8 endgame depth fell from 8 to 5 — because a dictionary object keyed
   * by integers takes a different and slower path in V8 than one keyed by
   * strings. The textbook answer is right about the algorithm and wrong about
   * this runtime, so the measurement wins.
   *
   * The FEN minus the move counters IS the position, and the counters are
   * exactly what must not be part of the key. */
  function ttKey(pos) {
    return pos.board.join("") + pos.turn + (pos.castling || "") + (pos.ep || "-");
  }
  function ttReset() { TT = Object.create(null); TT_SIZE = 0; killers = []; history = Object.create(null); historyUsed = false; }
  function ttPut(key, d, score, flag, move) {
    /* Never store a mate score. It is measured in plies FROM THE ROOT, so the
       same entry read at a different distance reports the wrong one — the
       engine then believes in a mate that is nearer or further than it is. The
       position is cheap to re-search and being right about mate is not
       optional. */
    if (Math.abs(score) > 90000) return;
    if (TT_SIZE >= TT_MAX) { TT = Object.create(null); TT_SIZE = 0; }
    var e = TT[key];
    if (e && e.d > d) return;         // keep the deeper answer
    if (!e) TT_SIZE++;
    TT[key] = { d: d, score: score, flag: flag, move: move };
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
        // Most valuable victim, least valuable attacker. No string needed.
        sc = 100000 + VALUE[m.captured.toLowerCase()] * 10 - VALUE[m.piece.toLowerCase()];
      } else if (m.promotion) {
        sc = 90000;
      } else {
        sc = 0;
      }
      /* The three tests that DO need the uci are only asked for quiet moves,
         and only when there is something to compare against. */
      if (sc < 90000 && (ttMove || kk.length || historyUsed)) {
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

    var key = ttKey(pos);
    var hit = TT[key];
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

    moves = orderedFull(pos, moves, ply, ttMove);
    var best = -100000, bestMv = null, origAlpha = alpha;
    for (var i = 0; i < moves.length; i++) {
      var score = -negamax(apply(pos, moves[i]), depth - 1, -beta, -alpha, ply + 1);
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
  function bestMove(fen, level, rand) {
    var pos = parseFen(fen);
    if (!pos) return null;
    var info = levelInfo(level || 4);
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
    perft: perft, evaluate: evaluate,
    bestMove: bestMove, analyse: analyse, blunderCheck: blunderCheck,
  };
})(typeof window !== "undefined" ? window : globalThis);
