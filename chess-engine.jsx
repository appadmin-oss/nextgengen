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

  /** Score in centipawns from the side-to-move's point of view. */
  function evaluate(pos) {
    var score = 0;
    for (var i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      var p = pos.board[i];
      if (p === "") continue;
      var lower = p.toLowerCase();
      var white = isWhite(p);
      var rank = i >> 4, file = i & 15;
      var idx = white ? (rank * 8 + file) : ((7 - rank) * 8 + file);
      var v = VALUE[lower] + (PST[lower] ? PST[lower][idx] : 0);
      score += white ? v : -v;
    }
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

  function negamax(pos, depth, alpha, beta) {
    if (depth <= 0) return quiesce(pos, alpha, beta, 3);
    var moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos) ? -99000 - depth : 0;   // mate sooner is better
    moves = ordered(pos, moves);
    for (var i = 0; i < moves.length; i++) {
      var score = -negamax(apply(pos, moves[i]), depth - 1, -beta, -alpha);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /* The eight levels.
   *
   * `depth` is how far it looks; `slip` is how often it deliberately plays
   * something other than its best move, and `blunder` how far down the list
   * that something may be. A beginner does not want a weaker engine, they want
   * an opponent that sometimes misses — and an engine made weak only by depth
   * plays perfectly right up until it doesn't, which is the least useful
   * teacher of the two. The blurbs are what the level sheet shows. */
  var LEVELS = [
    { level: 1, depth: 1, slip: 0.60, blunder: 6, rating: 600,
      blurb: "Plays the first thing it likes. Good for learning how the pieces move." },
    { level: 2, depth: 1, slip: 0.40, blunder: 4, rating: 750,
      blurb: "Takes what you leave hanging, and not much else." },
    { level: 3, depth: 2, slip: 0.28, blunder: 4, rating: 950,
      blurb: "Sees one move ahead properly. It will trade if you let it." },
    { level: 4, depth: 2, slip: 0.15, blunder: 3, rating: 1250,
      blurb: "Punishes loose pieces, misses long tactics." },
    { level: 5, depth: 3, slip: 0.10, blunder: 3, rating: 1450,
      blurb: "Two moves ahead and rarely gives anything away." },
    { level: 6, depth: 3, slip: 0.05, blunder: 2, rating: 1600,
      blurb: "Finds short tactics. You will need a plan." },
    { level: 7, depth: 4, slip: 0.02, blunder: 2, rating: 1750,
      blurb: "Calculates. Loose play gets punished immediately." },
    { level: 8, depth: 4, slip: 0, blunder: 1, rating: 1900,
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

    /* Alpha-beta at the ROOT too, not only below it. Searching every root
       move against a full window made level 8 take seconds on a desktop,
       which is a bot nobody finishes a game against on a phone. Moves that
       fail low keep their bound as a score — inexact, and it does not matter:
       the only scores that must be right are the top few, which are exactly
       the ones searched with an open window. */
    var searchOrder = ordered(pos, moves);
    var scored = [];
    var alpha = -100000;
    for (var si = 0; si < searchOrder.length; si++) {
      var sc = -negamax(apply(pos, searchOrder[si]), info.depth - 1, -100000, -alpha);
      if (sc > alpha) alpha = sc;
      scored.push({ m: searchOrder[si], score: sc });
    }
    scored.sort(function (a, b) { return b.score - a.score; });

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
    var order = ordered(pos, moves);
    var scored = [], a = -100000;
    for (var i2 = 0; i2 < order.length; i2++) {
      var s2 = -negamax(apply(pos, order[i2]), (depth || 2) - 1, -100000, -a);
      if (s2 > a) a = s2;
      scored.push({ uci: uciOf(order[i2]), san: san(pos, order[i2], moves), score: s2 });
    }
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
