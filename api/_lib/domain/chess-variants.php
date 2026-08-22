<?php
declare(strict_types=1);

/**
 * Variants.
 *
 * Three, chosen because each teaches something the standard game teaches
 * slowly, and because each is a small delta on rules the engine already has
 * rather than a second engine:
 *
 *   chess960       — the back rank is shuffled. Removes opening memorisation
 *                    entirely, which is the single biggest advantage an older
 *                    or better-coached child has over a beginner. A twelve-
 *                    year-old who has read a book and one who has not start
 *                    the same game.
 *   kingofthehill  — reach the four central squares with your king and you
 *                    win. Teaches centre control by making it the object of
 *                    the game rather than a maxim nobody believes.
 *   threecheck     — check three times and you win. Teaches that a check has
 *                    to do something, because here it visibly does.
 *
 * The rules engine (chess.php) is untouched: every variant here is standard
 * legal-move generation plus a different question asked after each move. That
 * is deliberate — a second move generator is a second place for a legality bug
 * to live, and a legality bug in a children's game is a lost game somebody
 * cannot explain.
 */

const CHESS_VARIANTS = ['standard', 'chess960', 'kingofthehill', 'threecheck'];

function chess_variant_meta(): array {
    return [
        'standard' => [
            'name' => 'Standard', 'short' => 'Standard chess',
            'blurb' => 'The game as it is played everywhere.',
            'teaches' => '',
        ],
        'chess960' => [
            'name' => 'Chess960', 'short' => 'Shuffled back rank',
            'blurb' => 'The back row is shuffled, the same for both players. No openings to memorise.',
            'teaches' => 'Nobody can prepare. You have to think from move one.',
        ],
        'kingofthehill' => [
            'name' => 'King of the Hill', 'short' => 'Walk your king to the middle',
            'blurb' => 'Get your king to one of the four centre squares and you win. Checkmate still wins too.',
            'teaches' => 'Why the centre matters — here it is the actual target.',
        ],
        'threecheck' => [
            'name' => 'Three-check', 'short' => 'Check three times',
            'blurb' => 'Check your opponent three times and you win. Checkmate still wins too.',
            'teaches' => 'That a check should achieve something.',
        ],
    ];
}

function chess_variant_valid(string $v): bool {
    return in_array($v, CHESS_VARIANTS, true);
}

/* ── Chess960 ─────────────────────────────────────────────────────────────
 *
 * 960 legal starting positions. The constraints are the point: the two
 * bishops must sit on opposite colours, and the king must stand between the
 * two rooks so that castling still means something.
 */

/**
 * The back rank for one of the 960 positions.
 *
 * Uses the standard Scharnagl numbering, so position 518 is the ordinary
 * starting position and a position id means the same thing here as it does in
 * every other program — which matters the first time a child asks a coach to
 * set up "the same one we played".
 */
function chess960_backrank(int $id): string {
    $id = (($id % 960) + 960) % 960;
    $rank = array_fill(0, 8, '');

    // Bishops: one on each colour, from the two low digits of the id.
    $n = intdiv($id, 4); $b1 = $id % 4;
    $light = [1, 3, 5, 7]; $dark = [0, 2, 4, 6];
    $rank[$light[$b1]] = 'b';
    $b2 = $n % 4; $n = intdiv($n, 4);
    $rank[$dark[$b2]] = 'b';

    // Queen: the nth remaining empty square.
    $q = $n % 6; $n = intdiv($n, 6);
    $empty = [];
    foreach ($rank as $i => $p) if ($p === '') $empty[] = $i;
    $rank[$empty[$q]] = 'q';

    /* Knights: one of the ten ways to place two among the five squares left.
     * The table is the standard KRN mapping — spelling it out is shorter and
     * clearer than deriving it, and it is the part people get wrong. */
    $knightTable = [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]];
    $empty = [];
    foreach ($rank as $i => $p) if ($p === '') $empty[] = $i;
    [$k1, $k2] = $knightTable[$n % 10];
    $rank[$empty[$k1]] = 'n';
    $rank[$empty[$k2]] = 'n';

    // Rook, king, rook into the last three squares, in that order — which is
    // what guarantees the king is between its rooks.
    $empty = [];
    foreach ($rank as $i => $p) if ($p === '') $empty[] = $i;
    $rank[$empty[0]] = 'r';
    $rank[$empty[1]] = 'k';
    $rank[$empty[2]] = 'r';

    return implode('', $rank);
}

/** A full starting FEN for a Chess960 position id. */
function chess960_fen(int $id): string {
    $back = chess960_backrank($id);
    $black = $back;
    $white = strtoupper($back);
    /* Castling rights are written KQkq here rather than in Shredder-FEN file
     * letters. The move generator reads the standard letters, and every
     * position this produces has its king between its rooks, so the ordinary
     * notation says the true thing. */
    return $black . '/pppppppp/8/8/8/8/PPPPPPPP/' . $white . ' w KQkq - 0 1';
}

/** A random position id that is not the standard one — picking 518 would make
 *  a Chess960 game that is silently just chess. */
function chess960_random_id(): int {
    do { $id = random_int(0, 959); } while ($id === 518);
    return $id;
}

/* ── Starting a game ──────────────────────────────────────────────────── */

/**
 * The opening position and the bookkeeping a variant needs.
 * Returned as a patch, so every path that creates a game builds it the same way.
 */
function chess_variant_start(string $variant): array {
    if ($variant === 'chess960') {
        $id = chess960_random_id();
        $fen = chess960_fen($id);
        return ['variant' => 'chess960', 'state' => $fen, 'startFen' => $fen,
                'variantData' => json_encode(['positionId' => $id], JSON_UNESCAPED_SLASHES)];
    }
    if ($variant === 'threecheck') {
        return ['variant' => 'threecheck', 'state' => CHESS_START_FEN, 'startFen' => CHESS_START_FEN,
                'variantData' => json_encode(['checks' => ['w' => 0, 'b' => 0]], JSON_UNESCAPED_SLASHES)];
    }
    if ($variant === 'kingofthehill') {
        return ['variant' => 'kingofthehill', 'state' => CHESS_START_FEN, 'startFen' => CHESS_START_FEN,
                'variantData' => ''];
    }
    return ['variant' => 'standard', 'state' => CHESS_START_FEN, 'startFen' => CHESS_START_FEN, 'variantData' => ''];
}

/* ── Deciding the game ────────────────────────────────────────────────── */

/** The four squares that win King of the Hill. */
const KOTH_SQUARES = ['d4', 'd5', 'e4', 'e5'];

/**
 * Has a variant condition ended the game?
 *
 * Called after the standard status check, so checkmate, stalemate and the draw
 * rules always still apply — a variant ADDS a way to win, it does not remove
 * the ordinary ones. `$moverColour` is who just moved.
 *
 * Returns null if the game continues, or a patch describing the end.
 */
function chess_variant_outcome(string $variant, string $fenAfter, string $moverColour, array &$data): ?array {
    if ($variant === 'kingofthehill') {
        $pos = chess_parse_fen($fenAfter);
        if (!$pos) return null;
        $idx = chess_king_square($pos, $moverColour);
        if ($idx < 0) return null;
        if (in_array(chess_idx_to_sq($idx), KOTH_SQUARES, true)) {
            return ['reason' => 'king_of_the_hill'];
        }
        return null;
    }
    if ($variant === 'threecheck') {
        $pos = chess_parse_fen($fenAfter);
        if (!$pos) return null;
        // The side to move is the one who could now be IN check — that is the
        // opponent of whoever just moved.
        if (!chess_in_check($pos)) return null;
        $counts = is_array($data['checks'] ?? null) ? $data['checks'] : ['w' => 0, 'b' => 0];
        $counts[$moverColour] = (int)($counts[$moverColour] ?? 0) + 1;
        $data['checks'] = $counts;
        if ($counts[$moverColour] >= 3) return ['reason' => 'three_checks'];
        return null;
    }
    return null;
}

/** How many checks each side has delivered, for the board to show. */
function chess_variant_checks(array $data): array {
    $c = is_array($data['checks'] ?? null) ? $data['checks'] : ['w' => 0, 'b' => 0];
    return ['w' => (int)($c['w'] ?? 0), 'b' => (int)($c['b'] ?? 0)];
}
