<?php
declare(strict_types=1);

/**
 * Chess rules — complete, server-side, dependency-free.
 *
 * WHY THIS EXISTS AT ALL, rather than trusting the board in the browser:
 *
 * The Arcade's founding constraint is that the server grades the game (see
 * arcade.php). A chess match between two children, on a leaderboard, feeding a
 * tournament that ends in a final, is the single easiest thing on this site to
 * cheat at — the client would only have to post "Qxf7#". So the server owns the
 * position, generates the legal moves, and rejects everything else. The browser
 * is a renderer and nothing more.
 *
 * It also has to be complete, because "mostly legal" chess is unplayable in the
 * ways that matter to a child: castling out of check, en passant, and
 * under-promotion are exactly the moves a keen ten-year-old tries first, and a
 * tournament decided by a rules bug is worse than no tournament.
 *
 * Board representation is 0x88: a 128-square array where a square is off the
 * board iff (index & 0x88) != 0. That single test replaces every row/column
 * bounds check, which is what keeps move generation short enough to read.
 *
 * Everything here is PURE — no database, no session, no clock. State goes in as
 * FEN and comes out as FEN, so it is trivially testable and the match layer can
 * store one string per position.
 */

const CHESS_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/* Offsets. Sliding pieces repeat theirs until they leave the board or hit
 * something; the others step once. */
const CHESS_OFFSETS = [
    'n' => [-33, -31, -18, -14, 14, 18, 31, 33],
    'b' => [-17, -15, 15, 17],
    'r' => [-16, -1, 1, 16],
    'q' => [-17, -16, -15, -1, 1, 15, 16, 17],
    'k' => [-17, -16, -15, -1, 1, 15, 16, 17],
];
const CHESS_SLIDING = ['b' => true, 'r' => true, 'q' => true];

/** Algebraic square name ⇄ 0x88 index. */
function chess_sq_to_idx(string $sq): int {
    if (strlen($sq) !== 2) return -1;
    $f = ord($sq[0]) - 97; $r = ord($sq[1]) - 49;
    if ($f < 0 || $f > 7 || $r < 0 || $r > 7) return -1;
    return (7 - $r) * 16 + $f;
}
function chess_idx_to_sq(int $i): string {
    return chr(97 + ($i & 15)) . chr(49 + (7 - ($i >> 4)));
}

/**
 * Parse FEN into a position array.
 * Returns null on anything malformed — a caller must treat that as "refuse",
 * never as "assume the start position".
 */
function chess_parse_fen(string $fen): ?array {
    $parts = preg_split('/\s+/', trim($fen));
    if (!$parts || count($parts) < 4) return null;
    [$placement, $turn, $castling, $ep] = [$parts[0], $parts[1], $parts[2], $parts[3]];
    $half = isset($parts[4]) ? (int)$parts[4] : 0;
    $full = isset($parts[5]) ? (int)$parts[5] : 1;
    if ($turn !== 'w' && $turn !== 'b') return null;

    $board = array_fill(0, 128, '');
    $rows = explode('/', $placement);
    if (count($rows) !== 8) return null;
    foreach ($rows as $r => $row) {
        $file = 0;
        for ($i = 0, $n = strlen($row); $i < $n; $i++) {
            $c = $row[$i];
            if (ctype_digit($c)) { $file += (int)$c; continue; }
            if (strpos('pnbrqkPNBRQK', $c) === false) return null;
            if ($file > 7) return null;
            $board[$r * 16 + $file] = $c;
            $file++;
        }
        if ($file !== 8) return null;
    }

    $epIdx = ($ep === '-' || $ep === '') ? -1 : chess_sq_to_idx($ep);
    if ($ep !== '-' && $ep !== '' && $epIdx < 0) return null;

    $pos = [
        'board'    => $board,
        'turn'     => $turn,
        'castling' => preg_match('/^(-|K?Q?k?q?)$/', $castling) ? ($castling === '-' ? '' : $castling) : null,
        'ep'       => $epIdx,
        'half'     => max(0, $half),
        'full'     => max(1, $full),
    ];
    if ($pos['castling'] === null) return null;

    // Exactly one king each, or nothing downstream is meaningful.
    $kings = array_count_values(array_filter($board, fn($p) => $p === 'k' || $p === 'K'));
    if (($kings['k'] ?? 0) !== 1 || ($kings['K'] ?? 0) !== 1) return null;
    return $pos;
}

function chess_to_fen(array $pos): string {
    $out = '';
    for ($r = 0; $r < 8; $r++) {
        $empty = 0;
        for ($f = 0; $f < 8; $f++) {
            $p = $pos['board'][$r * 16 + $f];
            if ($p === '') { $empty++; continue; }
            if ($empty) { $out .= $empty; $empty = 0; }
            $out .= $p;
        }
        if ($empty) $out .= $empty;
        if ($r < 7) $out .= '/';
    }
    return $out . ' ' . $pos['turn']
        . ' ' . ($pos['castling'] === '' ? '-' : $pos['castling'])
        . ' ' . ($pos['ep'] < 0 ? '-' : chess_idx_to_sq($pos['ep']))
        . ' ' . $pos['half'] . ' ' . $pos['full'];
}

function chess_is_white(string $piece): bool { return $piece !== '' && ctype_upper($piece); }
function chess_colour_of(string $piece): string { return $piece === '' ? '' : (ctype_upper($piece) ? 'w' : 'b'); }

/** Is `$sq` attacked by `$by` ('w'|'b')? Used for check and for castling. */
function chess_square_attacked(array $pos, int $sq, string $by): bool {
    $board = $pos['board'];
    for ($i = 0; $i < 128; $i++) {
        if ($i & 0x88) continue;
        $p = $board[$i];
        if ($p === '' || chess_colour_of($p) !== $by) continue;
        $lower = strtolower($p);

        if ($lower === 'p') {
            // Pawns capture diagonally forward; white moves toward lower indices.
            $dir = $by === 'w' ? -16 : 16;
            foreach ([$dir - 1, $dir + 1] as $d) {
                if ($i + $d === $sq && !(($i + $d) & 0x88)) return true;
            }
            continue;
        }
        foreach (CHESS_OFFSETS[$lower] as $d) {
            $t = $i + $d;
            while (!($t & 0x88)) {
                if ($t === $sq) return true;
                if ($board[$t] !== '') break;         // blocked
                if (!isset(CHESS_SLIDING[$lower])) break;
                $t += $d;
            }
        }
    }
    return false;
}

function chess_king_square(array $pos, string $colour): int {
    $want = $colour === 'w' ? 'K' : 'k';
    for ($i = 0; $i < 128; $i++) { if (!($i & 0x88) && $pos['board'][$i] === $want) return $i; }
    return -1;
}

function chess_in_check(array $pos, ?string $colour = null): bool {
    $colour = $colour ?? $pos['turn'];
    $k = chess_king_square($pos, $colour);
    return $k >= 0 && chess_square_attacked($pos, $k, $colour === 'w' ? 'b' : 'w');
}

/**
 * Every legal move in the position.
 *
 * Generated pseudo-legally then filtered by actually making the move and asking
 * whether our own king is attacked. Slower than pin-detection, and correct in
 * all the awkward cases (en-passant discovered check being the classic one)
 * without a second set of rules to keep in step with the first.
 *
 * Each move: from, to, piece, captured, promotion, flags (k/q castle, ep, 2-step).
 */
function chess_legal_moves(array $pos): array {
    $moves = [];
    $us = $pos['turn'];
    $them = $us === 'w' ? 'b' : 'w';
    $board = $pos['board'];

    for ($i = 0; $i < 128; $i++) {
        if ($i & 0x88) continue;
        $p = $board[$i];
        if ($p === '' || chess_colour_of($p) !== $us) continue;
        $lower = strtolower($p);

        if ($lower === 'p') {
            $dir  = $us === 'w' ? -16 : 16;
            $startRow = $us === 'w' ? 6 : 1;
            $lastRow  = $us === 'w' ? 0 : 7;
            $one = $i + $dir;
            if (!($one & 0x88) && $board[$one] === '') {
                if (($one >> 4) === $lastRow) {
                    foreach (['q', 'r', 'b', 'n'] as $pr) $moves[] = chess_mk($i, $one, $p, '', $pr, '');
                } else {
                    $moves[] = chess_mk($i, $one, $p, '', '', '');
                    $two = $i + 2 * $dir;
                    if (($i >> 4) === $startRow && !($two & 0x88) && $board[$two] === '') {
                        $moves[] = chess_mk($i, $two, $p, '', '', 'b');   // b = big (two-square) push
                    }
                }
            }
            foreach ([$dir - 1, $dir + 1] as $d) {
                $t = $i + $d;
                if ($t & 0x88) continue;
                $target = $board[$t];
                if ($target !== '' && chess_colour_of($target) === $them) {
                    if (($t >> 4) === $lastRow) {
                        foreach (['q', 'r', 'b', 'n'] as $pr) $moves[] = chess_mk($i, $t, $p, $target, $pr, '');
                    } else {
                        $moves[] = chess_mk($i, $t, $p, $target, '', '');
                    }
                } elseif ($target === '' && $t === $pos['ep']) {
                    $moves[] = chess_mk($i, $t, $p, $us === 'w' ? 'p' : 'P', '', 'e');
                }
            }
            continue;
        }

        foreach (CHESS_OFFSETS[$lower] as $d) {
            $t = $i + $d;
            while (!($t & 0x88)) {
                $target = $board[$t];
                if ($target === '') {
                    $moves[] = chess_mk($i, $t, $p, '', '', '');
                } else {
                    if (chess_colour_of($target) === $them) $moves[] = chess_mk($i, $t, $p, $target, '', '');
                    break;
                }
                if (!isset(CHESS_SLIDING[$lower])) break;
                $t += $d;
            }
        }
    }

    /* Castling. Legal only when the king has not moved, the rook has not moved,
     * the squares between are empty, and the king is not in check on its
     * origin, its path, or its destination. */
    $kIdx = chess_king_square($pos, $us);
    if ($kIdx >= 0 && !chess_square_attacked($pos, $kIdx, $them)) {
        $rights = $pos['castling'];
        $kSide = $us === 'w' ? 'K' : 'k';
        $qSide = $us === 'w' ? 'Q' : 'q';
        if (strpos($rights, $kSide) !== false
            && $board[$kIdx + 1] === '' && $board[$kIdx + 2] === ''
            && !chess_square_attacked($pos, $kIdx + 1, $them)
            && !chess_square_attacked($pos, $kIdx + 2, $them)) {
            $moves[] = chess_mk($kIdx, $kIdx + 2, $board[$kIdx], '', '', 'k');
        }
        if (strpos($rights, $qSide) !== false
            && $board[$kIdx - 1] === '' && $board[$kIdx - 2] === '' && $board[$kIdx - 3] === ''
            && !chess_square_attacked($pos, $kIdx - 1, $them)
            && !chess_square_attacked($pos, $kIdx - 2, $them)) {
            $moves[] = chess_mk($kIdx, $kIdx - 2, $board[$kIdx], '', '', 'q');
        }
    }

    // Filter: a move that leaves our own king attacked was never legal.
    $legal = [];
    foreach ($moves as $m) {
        $after = chess_apply($pos, $m);
        if (!chess_in_check($after, $us)) $legal[] = $m;
    }
    return $legal;
}

function chess_mk(int $from, int $to, string $piece, string $captured, string $promotion, string $flag): array {
    return ['from' => $from, 'to' => $to, 'piece' => $piece,
            'captured' => $captured, 'promotion' => $promotion, 'flag' => $flag];
}

/** Apply a generated move. Assumes the move came from chess_legal_moves. */
function chess_apply(array $pos, array $m): array {
    $b = $pos['board'];
    $us = chess_colour_of($m['piece']);
    $lower = strtolower($m['piece']);

    $b[$m['from']] = '';
    $b[$m['to']] = $m['promotion'] !== ''
        ? ($us === 'w' ? strtoupper($m['promotion']) : $m['promotion'])
        : $m['piece'];

    if ($m['flag'] === 'e') {
        // The captured pawn is beside the destination, not on it.
        $b[$m['to'] + ($us === 'w' ? 16 : -16)] = '';
    } elseif ($m['flag'] === 'k') {
        $b[$m['to'] - 1] = $b[$m['to'] + 1]; $b[$m['to'] + 1] = '';
    } elseif ($m['flag'] === 'q') {
        $b[$m['to'] + 1] = $b[$m['to'] - 2]; $b[$m['to'] - 2] = '';
    }

    /* Castling rights die when the king moves, when a rook leaves its corner,
     * and when a rook is captured on its corner — that last one is the case
     * everybody forgets. */
    $rights = $pos['castling'];
    $strip = function (string $r, array $chars): string {
        foreach ($chars as $c) $r = str_replace($c, '', $r);
        return $r;
    };
    if ($lower === 'k') $rights = $strip($rights, $us === 'w' ? ['K', 'Q'] : ['k', 'q']);
    foreach ([[112, 'Q'], [119, 'K'], [0, 'q'], [7, 'k']] as [$corner, $ch]) {
        if ($m['from'] === $corner || $m['to'] === $corner) $rights = $strip($rights, [$ch]);
    }

    return [
        'board'    => $b,
        'turn'     => $us === 'w' ? 'b' : 'w',
        'castling' => $rights,
        'ep'       => $m['flag'] === 'b' ? ($m['from'] + ($us === 'w' ? -16 : 16)) : -1,
        // Reset on a pawn move or a capture; that is the whole of the 50-move rule.
        'half'     => ($lower === 'p' || $m['captured'] !== '') ? 0 : $pos['half'] + 1,
        'full'     => $pos['full'] + ($us === 'b' ? 1 : 0),
    ];
}

/** Standard Algebraic Notation for a move, in the position it is played. */
function chess_san(array $pos, array $m, array $legal): string {
    if ($m['flag'] === 'k') $san = 'O-O';
    elseif ($m['flag'] === 'q') $san = 'O-O-O';
    else {
        $lower = strtolower($m['piece']);
        $to = chess_idx_to_sq($m['to']);
        if ($lower === 'p') {
            $san = $m['captured'] !== '' ? chess_idx_to_sq($m['from'])[0] . 'x' . $to : $to;
            if ($m['promotion'] !== '') $san .= '=' . strtoupper($m['promotion']);
        } else {
            /* Disambiguation: only when another piece of the same type could
             * also reach the square. File first, then rank, then both. */
            $same = array_filter($legal, fn($o) =>
                $o['to'] === $m['to'] && $o['piece'] === $m['piece'] && $o['from'] !== $m['from']);
            $dis = '';
            if ($same) {
                $fromSq = chess_idx_to_sq($m['from']);
                $sameFile = array_filter($same, fn($o) => (($o['from'] & 15)) === ($m['from'] & 15));
                $sameRank = array_filter($same, fn($o) => (($o['from'] >> 4)) === ($m['from'] >> 4));
                if (!$sameFile) $dis = $fromSq[0];
                elseif (!$sameRank) $dis = $fromSq[1];
                else $dis = $fromSq;
            }
            $san = strtoupper($lower) . $dis . ($m['captured'] !== '' ? 'x' : '') . $to;
        }
    }
    $after = chess_apply($pos, $m);
    if (chess_in_check($after)) {
        $san .= chess_legal_moves($after) ? '+' : '#';
    }
    return $san;
}

/** Neither side can force mate, so the game is drawn however long it runs. */
function chess_insufficient_material(array $pos): bool {
    $pieces = ['w' => [], 'b' => []];
    for ($i = 0; $i < 128; $i++) {
        if ($i & 0x88) continue;
        $p = $pos['board'][$i];
        if ($p === '' || strtolower($p) === 'k') continue;
        $pieces[chess_colour_of($p)][] = ['t' => strtolower($p), 'dark' => ((($i >> 4) + ($i & 15)) % 2) === 1];
    }
    $w = $pieces['w']; $b = $pieces['b'];
    foreach ([$w, $b] as $side) {
        foreach ($side as $pc) if ($pc['t'] === 'p' || $pc['t'] === 'r' || $pc['t'] === 'q') return false;
    }
    if (!$w && !$b) return true;                                   // K v K
    if (count($w) + count($b) === 1) return true;                  // K+minor v K
    // K+B v K+B is drawn only when both bishops are on the same colour.
    if (count($w) === 1 && count($b) === 1 && $w[0]['t'] === 'b' && $b[0]['t'] === 'b') {
        return $w[0]['dark'] === $b[0]['dark'];
    }
    return false;
}

/**
 * Could this side ever deliver mate, by any legal sequence?
 *
 * The one-sided question FIDE 6.9 asks when a flag falls: your opponent runs
 * out of time, but if YOU could not possibly mate them, the game is drawn
 * rather than won. A child winning on time against a bare king would be the
 * app getting a rule wrong in the most visible place there is.
 *
 * Deliberately the "any possible series of legal moves" test, not the "can
 * force it" test. K+N+N cannot force mate but a helpmate exists, so it counts —
 * that is what 6.9 says, and it is what every other chess app does.
 */
function chess_has_mating_material(string $fen, string $colour): bool {
    $pos = chess_parse_fen($fen);
    if (!$pos) return true;                      // unreadable: never draw on a guess
    $minors = 0;
    for ($i = 0; $i < 128; $i++) {
        if ($i & 0x88) continue;
        $p = $pos['board'][$i];
        if ($p === '') continue;
        if (chess_colour_of($p) !== $colour) continue;
        $t = strtolower($p);
        if ($t === 'k') continue;
        if ($t === 'p' || $t === 'r' || $t === 'q') return true;
        $minors++;                               // bishop or knight
    }
    // King alone, or king and one minor: no mate is reachable.
    return $minors >= 2;
}

/**
 * The state of the game after the position is reached.
 *
 * `$positionCounts` maps a repetition key → how many times it has occurred,
 * so threefold repetition can be decided; the match layer keeps it because
 * repetition is a property of the GAME, not of the position.
 */
function chess_status(array $pos, array $positionCounts = []): array {
    $legal = chess_legal_moves($pos);
    $check = chess_in_check($pos);
    if (!$legal) {
        return $check
            ? ['state' => 'checkmate', 'winner' => $pos['turn'] === 'w' ? 'b' : 'w', 'reason' => 'checkmate']
            : ['state' => 'stalemate', 'winner' => '', 'reason' => 'stalemate'];
    }
    if (chess_insufficient_material($pos)) return ['state' => 'draw', 'winner' => '', 'reason' => 'insufficient_material'];
    if ($pos['half'] >= 100) return ['state' => 'draw', 'winner' => '', 'reason' => 'fifty_move'];
    $key = chess_repetition_key($pos);
    if (($positionCounts[$key] ?? 0) >= 3) return ['state' => 'draw', 'winner' => '', 'reason' => 'threefold'];
    return ['state' => $check ? 'check' : 'active', 'winner' => '', 'reason' => ''];
}

/** Repetition compares placement, side to move, castling and en passant —
 *  the clocks are deliberately excluded. */
function chess_repetition_key(array $pos): string {
    $fen = chess_to_fen($pos);
    $parts = explode(' ', $fen);
    return implode(' ', array_slice($parts, 0, 4));
}

/**
 * Play one move given as UCI ("e2e4", "e7e8q").
 *
 * Returns ['ok'=>true, 'fen', 'san', 'status', ...] or ['ok'=>false,'error'].
 * This is the ONLY way the match layer changes a position: an illegal or
 * malformed move is refused here, so nothing downstream has to re-check it.
 */
function chess_move(string $fen, string $uci, array $positionCounts = []): array {
    $pos = chess_parse_fen($fen);
    if (!$pos) return ['ok' => false, 'error' => 'bad_fen'];
    $uci = strtolower(trim($uci));
    if (!preg_match('/^([a-h][1-8])([a-h][1-8])([qrbn]?)$/', $uci, $mm)) return ['ok' => false, 'error' => 'bad_move'];
    $from = chess_sq_to_idx($mm[1]); $to = chess_sq_to_idx($mm[2]); $promo = $mm[3];

    $legal = chess_legal_moves($pos);
    $found = null;
    foreach ($legal as $m) {
        if ($m['from'] !== $from || $m['to'] !== $to) continue;
        // A promotion must name a piece; anything else must not carry one.
        if ($m['promotion'] !== '') { if ($m['promotion'] === $promo) { $found = $m; break; } continue; }
        if ($promo !== '') continue;
        $found = $m; break;
    }
    if (!$found) return ['ok' => false, 'error' => 'illegal_move'];

    $san = chess_san($pos, $found, $legal);
    $after = chess_apply($pos, $found);
    $afterFen = chess_to_fen($after);
    $key = chess_repetition_key($after);
    $counts = $positionCounts;
    $counts[$key] = ($counts[$key] ?? 0) + 1;
    $status = chess_status($after, $counts);

    return ['ok' => true, 'fen' => $afterFen, 'san' => $san, 'uci' => $uci,
            'status' => $status, 'counts' => $counts,
            'capture' => $found['captured'] !== '', 'check' => $status['state'] === 'check'];
}

/** Every legal move as UCI — what the client needs to light up a piece. */
function chess_legal_uci(string $fen): array {
    $pos = chess_parse_fen($fen);
    if (!$pos) return [];
    $out = [];
    foreach (chess_legal_moves($pos) as $m) {
        $out[] = chess_idx_to_sq($m['from']) . chess_idx_to_sq($m['to']) . $m['promotion'];
    }
    return $out;
}

/** Node count at depth N — the standard correctness test for a move
 *  generator, and the only way to know this file is actually right. */
function chess_perft(string $fen, int $depth): int {
    $pos = chess_parse_fen($fen);
    if (!$pos || $depth <= 0) return $pos ? 1 : 0;
    return chess_perft_pos($pos, $depth);
}
function chess_perft_pos(array $pos, int $depth): int {
    $moves = chess_legal_moves($pos);
    if ($depth === 1) return count($moves);
    $n = 0;
    foreach ($moves as $m) $n += chess_perft_pos(chess_apply($pos, $m), $depth - 1);
    return $n;
}
