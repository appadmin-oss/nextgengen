<?php
declare(strict_types=1);

/**
 * After-game review.
 *
 * WHERE THE ANALYSIS HAPPENS, and why it is not here.
 *
 * There is no chess engine on this server and there is not going to be one.
 * Shared hosting gives no persistent worker, a request that thinks for fifteen
 * seconds is a request that gets killed, and every game reviewed by every
 * player would be the most expensive thing the club does — for a number nobody
 * is waiting on. The engine already ships to the browser for offline play, so
 * the analysis runs where the idle CPU is: on the device of whoever opened the
 * game.
 *
 * WHAT THAT MEANS FOR TRUST.
 *
 * A client-computed number is a claim, not a measurement. Two rules follow and
 * both are enforced here rather than written down somewhere:
 *
 *   · The FIRST review of a game wins. A second player opening the same game
 *     reads what the first one produced instead of overwriting it, so two
 *     children discussing a game are discussing the same numbers, and nobody
 *     can improve their accuracy by reviewing again on a faster phone.
 *   · Nothing competitive is downstream of it. It does not touch ratings,
 *     standings, badges or the ladder. It is a coaching record — if a client
 *     lied about it, the only thing that would be wrong is that client's own
 *     coaching record.
 *
 * The row also records the depth and budget the analysis ran at, because a
 * review a phone managed at depth 6 and one a laptop managed at depth 14 are
 * not the same measurement and the screen has to be able to say so.
 */

/** Only somebody who can already open the game may review it or read one. */
function review_may_see(array $r, string $viewer): bool {
    if ($viewer === '') return false;
    if ((string)$r['playerA'] === $viewer || (string)$r['playerB'] === $viewer) return true;
    if (function_exists('mentor_gate')) {
        $g = mentor_gate(['requesterId' => $viewer]);
        if (!empty($g['ok'])) return true;
    }
    /* Games here are public to signed-in members — that is the point of open
     * play — so a spectator may read a review. They may not write one: a
     * review is about the two people who played. */
    return match_person($viewer) !== null;
}

function review_shape(array $r): array {
    $evals = json_decode((string)($r['evals'] ?? ''), true);
    return [
        'matchId' => (string)$r['matchId'],
        'white' => [
            'accuracy' => (int)$r['whiteAccuracy'], 'avgLoss' => (int)$r['whiteAvgLoss'],
            'blunders' => (int)$r['whiteBlunders'], 'mistakes' => (int)$r['whiteMistakes'],
            'inaccuracies' => (int)$r['whiteInaccuracies'],
        ],
        'black' => [
            'accuracy' => (int)$r['blackAccuracy'], 'avgLoss' => (int)$r['blackAvgLoss'],
            'blunders' => (int)$r['blackBlunders'], 'mistakes' => (int)$r['blackMistakes'],
            'inaccuracies' => (int)$r['blackInaccuracies'],
        ],
        'turning' => (int)$r['turningPly'] > 0 ? [
            'ply' => (int)$r['turningPly'], 'san' => (string)$r['turningSan'],
            'best' => (string)$r['turningBest'], 'loss' => (int)$r['turningLoss'],
        ] : null,
        'evals' => is_array($evals) ? $evals : [],
        'engine' => ['depth' => (int)$r['engineDepth'], 'ms' => (int)$r['engineMs']],
        'createdAt' => (string)$r['createdAt'],
    ];
}

/** The review for a game, or null if nobody has run one. */
function match_review_get(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if (!review_may_see($r, $viewer)) return ['ok' => false, 'error' => 'forbidden'];
    $rev = db_row('SELECT * FROM match_reviews WHERE matchId = ? LIMIT 1', [(string)$r['matchId']]);
    return ['ok' => true, 'review' => $rev ? review_shape($rev) : null];
}

/**
 * Store a review. Only a player, only a finished game, only once.
 *
 * A game still in progress has no review to store: the numbers would be about
 * a position, not a game, and the next move would make them wrong.
 */
function match_review_put(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['playerA'] !== $viewer && (string)$r['playerB'] !== $viewer) {
        return ['ok' => false, 'error' => 'not_yours'];
    }
    if ((string)$r['status'] !== 'complete') return ['ok' => false, 'error' => 'not_finished'];

    // First writer wins, so the numbers do not change between two readings.
    $have = db_row('SELECT * FROM match_reviews WHERE matchId = ? LIMIT 1', [(string)$r['matchId']]);
    if ($have) return ['ok' => true, 'review' => review_shape($have), 'kept' => true];

    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $side = function (string $k) use ($d): array {
        $s = is_array($d[$k] ?? null) ? $d[$k] : [];
        return [
            'accuracy' => max(0, min(100, (int)($s['accuracy'] ?? 0))),
            'avgLoss' => max(0, min(9999, (int)($s['avgLoss'] ?? 0))),
            'blunders' => max(0, min(200, (int)($s['blunders'] ?? 0))),
            'mistakes' => max(0, min(200, (int)($s['mistakes'] ?? 0))),
            'inaccuracies' => max(0, min(200, (int)($s['inaccuracies'] ?? 0))),
        ];
    };
    $w = $side('white'); $b = $side('black');

    /* The evaluation list is bounded and clamped before it is stored. It is
     * drawn as a graph, so one absurd number would flatten every real one —
     * and it arrives from a browser, so "it will be sensible" is not a
     * property this code gets to assume. */
    $evals = [];
    foreach ((array)($d['evals'] ?? []) as $e) {
        if (count($evals) >= 400) break;
        $evals[] = max(-2000, min(2000, (int)$e));
    }

    $turn = is_array($d['turning'] ?? null) ? $d['turning'] : [];
    $row = [
        'matchId' => (string)$r['matchId'],
        'whiteAccuracy' => $w['accuracy'], 'blackAccuracy' => $b['accuracy'],
        'whiteAvgLoss' => $w['avgLoss'],   'blackAvgLoss' => $b['avgLoss'],
        'whiteBlunders' => $w['blunders'], 'blackBlunders' => $b['blunders'],
        'whiteMistakes' => $w['mistakes'], 'blackMistakes' => $b['mistakes'],
        'whiteInaccuracies' => $w['inaccuracies'], 'blackInaccuracies' => $b['inaccuracies'],
        'turningPly' => max(0, min(400, (int)($turn['ply'] ?? 0))),
        'turningSan' => mb_substr((string)($turn['san'] ?? ''), 0, 16),
        'turningBest' => mb_substr((string)($turn['best'] ?? ''), 0, 16),
        'turningLoss' => max(0, min(9999, (int)($turn['loss'] ?? 0))),
        'evals' => json_encode($evals, JSON_UNESCAPED_SLASHES),
        'engineDepth' => max(0, min(64, (int)($d['engineDepth'] ?? 0))),
        'engineMs' => max(0, min(60000, (int)($d['engineMs'] ?? 0))),
        'byId' => $viewer,
        'createdAt' => now_iso(),
    ];
    try {
        db_insert('match_reviews', $row);
    } catch (Throwable $e) {
        /* Two devices finishing at the same moment race on the unique index.
         * The loser reads the winner's row, which is the same outcome as
         * arriving second — no error belongs on a member's screen for it. */
        $have = db_row('SELECT * FROM match_reviews WHERE matchId = ? LIMIT 1', [(string)$r['matchId']]);
        if (!$have) return ['ok' => false, 'error' => 'failed'];
        return ['ok' => true, 'review' => review_shape($have), 'kept' => true];
    }
    $saved = db_row('SELECT * FROM match_reviews WHERE matchId = ? LIMIT 1', [(string)$r['matchId']]);
    return ['ok' => true, 'review' => $saved ? review_shape($saved) : null, 'kept' => false];
}

/**
 * A member's own review history: how their accuracy has moved.
 *
 * The point of keeping reviews at all. One game's accuracy says almost
 * nothing — a child who played six good moves and one catastrophe scores worse
 * than one who drifted mildly for forty — but the direction across a term is
 * the thing a mentor can actually use.
 */
function match_review_history(array $p): array {
    $me = match_person((string)($p['playerId'] ?? ''));
    if (!$me) return ['ok' => false, 'error' => 'not_a_player'];
    $id = (string)$me['id'];
    $rows = db_all(
        "SELECT r.*, g.playerA, g.playerB, g.playerAName, g.playerBName, g.result, g.winnerId,
                g.variant, g.timeControl, g.updatedAt gameAt
           FROM match_reviews r JOIN match_games g ON g.matchId = r.matchId
          WHERE g.playerA = ? OR g.playerB = ?
          ORDER BY r.id DESC LIMIT 30", [$id, $id]);
    $out = [];
    foreach ($rows as $r) {
        $mine = (string)$r['playerA'] === $id ? 'white' : 'black';
        $out[] = [
            'matchId' => (string)$r['matchId'],
            'opponent' => $mine === 'white' ? (string)$r['playerBName'] : (string)$r['playerAName'],
            'accuracy' => (int)$r[$mine . 'Accuracy'],
            'avgLoss' => (int)$r[$mine . 'AvgLoss'],
            'blunders' => (int)$r[$mine . 'Blunders'],
            'result' => (string)$r['winnerId'] === '' ? 'draw' : ((string)$r['winnerId'] === $id ? 'win' : 'loss'),
            'variant' => (string)($r['variant'] ?? 'standard'),
            'timeControl' => (string)($r['timeControl'] ?? ''),
            'at' => (string)($r['gameAt'] ?? $r['createdAt']),
        ];
    }
    /* The trend, as one number: the last five against the five before them.
     * Reported only with enough games behind it to mean anything — a "trend"
     * off two games is noise with an arrow drawn on it. */
    $trend = null;
    if (count($out) >= 6) {
        $recent = array_slice($out, 0, 5);
        $before = array_slice($out, 5, 5);
        $avg = fn(array $g) => count($g) ? array_sum(array_column($g, 'accuracy')) / count($g) : 0;
        $trend = (int)round($avg($recent) - $avg($before));
    }
    return ['ok' => true, 'games' => $out, 'trend' => $trend];
}
