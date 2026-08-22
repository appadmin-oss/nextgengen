<?php
declare(strict_types=1);

/**
 * Chess clocks that actually run.
 *
 * `timeControl` used to be a LABEL. '3+2' was stored on the game, shown on the
 * challenge sheet, and then nothing counted down: a blitz game and a
 * correspondence game behaved identically, and a player who walked away held
 * the position forever. Every part of the product said the club plays blitz
 * and no part of it enforced a single second.
 *
 * THE SERVER OWNS THE TIME. That is the whole design. A browser clock is a
 * display: it drifts, it pauses when the tab sleeps, and it belongs to one of
 * the two people with an interest in the answer. So the client renders a
 * countdown for feel, and every number it renders is reconciled against this
 * file on the next poll — and the only thing allowed to decide that somebody
 * flagged is chess_clock_flag_check().
 *
 * The model is Fischer increment, which is what '3+2' means: three minutes
 * each, plus two seconds added to your clock after every move you make. The
 * increment is added on completing a move, not on starting one, so a player
 * cannot bank time by sitting still.
 *
 * Correspondence ('1day') has no ticking clock and is deliberately excluded —
 * there is no realtime here to model, only a per-move deadline, and pretending
 * otherwise would put a spinning countdown on a game people play over a week.
 */

/**
 * The time controls the club plays, in one place.
 *
 * Matches the design's picker exactly: three real-time controls and one
 * correspondence. `ms` is the starting time per player; `inc` the increment.
 */
const CHESS_CLOCK_TABLE = [
    '3+2'   => ['ms' => 180000,  'inc' => 2000, 'label' => 'Blitz',  'live' => true],
    '5+3'   => ['ms' => 300000,  'inc' => 3000, 'label' => 'Blitz',  'live' => true],
    '10+0'  => ['ms' => 600000,  'inc' => 0,    'label' => 'Rapid',  'live' => true],
    '15+10' => ['ms' => 900000,  'inc' => 10000,'label' => 'Rapid',  'live' => true],
    '1day'  => ['ms' => 0,       'inc' => 0,    'label' => 'Daily',  'live' => false],
];

/** How long a correspondence player has to answer a move. */
const CHESS_DAILY_MOVE_MS = 86400000;

/**
 * Grace given to the moving player on every move.
 *
 * The elapsed time this file measures is server-receipt minus server-send, so
 * it includes the round trip: the player is charged for their own network. On
 * a 3G handset at a centre that is a real and unfair cost, and at blitz speeds
 * it decides games. A flat allowance per move is the honest correction — it
 * cannot be gamed (it is the same for both players and does not accumulate)
 * and it stops the network from flagging anybody.
 */
const CHESS_CLOCK_LAG_GRACE_MS = 300;

function chess_clock_spec(string $timeControl): array {
    return CHESS_CLOCK_TABLE[$timeControl] ?? CHESS_CLOCK_TABLE['1day'];
}

/** Is this a control with a running clock, as opposed to correspondence? */
function chess_clock_is_live(string $timeControl): bool {
    return (bool)chess_clock_spec($timeControl)['live'];
}

/** Every control the client may offer, shaped for the picker. */
function chess_clock_options(): array {
    $out = [];
    foreach (CHESS_CLOCK_TABLE as $id => $s) {
        $out[] = ['id' => $id, 'label' => $s['label'], 'live' => $s['live'],
                  'initialMs' => $s['ms'], 'incrementMs' => $s['inc']];
    }
    return $out;
}

/** Milliseconds since the epoch, from the same clock everything else here uses. */
function chess_clock_now_ms(): int {
    return (int)round(microtime(true) * 1000);
}

/** Parse one of our ISO stamps back to milliseconds. '' → 0. */
function chess_clock_ms_of(string $iso): int {
    if (trim($iso) === '') return 0;
    $t = strtotime($iso);
    return $t === false ? 0 : $t * 1000;
}

/**
 * The starting columns for a new game on a given control.
 *
 * Returned as a patch rather than written, so both the invite path and the
 * tournament pairing path build a game the same way.
 */
function chess_clock_init(string $timeControl): array {
    $s = chess_clock_spec($timeControl);
    return [
        'timeControl' => isset(CHESS_CLOCK_TABLE[$timeControl]) ? $timeControl : '1day',
        'initialMs'   => (int)$s['ms'],
        'incrementMs' => (int)$s['inc'],
        'whiteMs'     => (int)$s['ms'],
        'blackMs'     => (int)$s['ms'],
        'clockRunning' => 0,
        'turnStartedAt' => '',
    ];
}

/**
 * Start the clock. Called when a game becomes active, not when it is created.
 *
 * A tournament pairing opens active, so its clock starts the moment the round
 * is drawn — which is correct and is how an over-the-board round works: your
 * clock is running whether or not you have sat down.
 */
function chess_clock_start(string $matchId): void {
    $r = db_row("SELECT timeControl, status FROM match_games WHERE matchId = ? LIMIT 1", [$matchId]);
    if (!$r || (string)$r['status'] !== 'active') return;
    if (!chess_clock_is_live((string)($r['timeControl'] ?? '1day'))) return;
    db_update('match_games', ['clockRunning' => 1, 'turnStartedAt' => now_iso()], ['matchId' => $matchId]);
}

/**
 * How much time each side has RIGHT NOW, with the mover's clock wound down by
 * however long they have been thinking.
 *
 * Pure: it reads a row and returns numbers, and never writes. Both the board
 * poll and the flag check use it, so what a player sees and what the server
 * would act on cannot disagree.
 *
 * Chess: player A is always white (stated in match_public), so the mapping
 * from player to clock is fixed rather than inferred from the FEN.
 */
function chess_clock_state(array $r): array {
    $tc = (string)($r['timeControl'] ?? '1day');
    $live = chess_clock_is_live($tc);
    $whiteMs = (int)($r['whiteMs'] ?? 0);
    $blackMs = (int)($r['blackMs'] ?? 0);
    $running = (int)($r['clockRunning'] ?? 0) === 1 && (string)$r['status'] === 'active';

    $out = [
        'timeControl' => $tc,
        'live' => $live,
        'running' => $running && $live,
        'initialMs' => (int)($r['initialMs'] ?? 0),
        'incrementMs' => (int)($r['incrementMs'] ?? 0),
        'whiteMs' => $whiteMs,
        'blackMs' => $blackMs,
        'turn' => '',
        'flagged' => '',
        // The server's own clock, so a client can measure its offset once and
        // stop its countdown drifting away from the authority.
        'serverNowMs' => chess_clock_now_ms(),
    ];
    if (!$live) {
        /* Correspondence: no countdown, a deadline. Reported in the same shape
         * so the client has one thing to render rather than two. */
        $last = chess_clock_ms_of((string)($r['lastMoveAt'] ?? $r['createdAt'] ?? ''));
        $out['deadlineMs'] = $last > 0 ? $last + CHESS_DAILY_MOVE_MS : 0;
        return $out;
    }

    $turnIsWhite = (string)($r['turnPlayer'] ?? '') === (string)$r['playerA'];
    $out['turn'] = $running ? ($turnIsWhite ? 'w' : 'b') : '';

    if ($running) {
        $started = chess_clock_ms_of((string)($r['turnStartedAt'] ?? ''));
        $elapsed = $started > 0 ? max(0, chess_clock_now_ms() - $started) : 0;
        if ($turnIsWhite) $out['whiteMs'] = max(0, $whiteMs - $elapsed);
        else              $out['blackMs'] = max(0, $blackMs - $elapsed);
        if ($out['whiteMs'] <= 0) $out['flagged'] = 'w';
        elseif ($out['blackMs'] <= 0) $out['flagged'] = 'b';
    }
    return $out;
}

/**
 * Charge the mover for their thinking time and add their increment.
 *
 * Called from match_move() INSIDE the same transaction as the move itself, so
 * a move can never land without its time being charged. Returns the patch to
 * merge, or [] for a control with no clock.
 *
 * `$endsGame` suppresses the increment and stops the clock: nobody is owed two
 * seconds for delivering checkmate, and leaving the clock running on a
 * finished game would flag the winner a few minutes later.
 */
function chess_clock_on_move(array $r, bool $endsGame): array {
    $tc = (string)($r['timeControl'] ?? '1day');
    if (!chess_clock_is_live($tc)) return [];
    if ((int)($r['clockRunning'] ?? 0) !== 1) return [];

    $turnIsWhite = (string)($r['turnPlayer'] ?? '') === (string)$r['playerA'];
    $started = chess_clock_ms_of((string)($r['turnStartedAt'] ?? ''));
    $elapsed = $started > 0 ? max(0, chess_clock_now_ms() - $started) : 0;
    $elapsed = max(0, $elapsed - CHESS_CLOCK_LAG_GRACE_MS);
    $inc = $endsGame ? 0 : (int)($r['incrementMs'] ?? 0);

    $whiteMs = (int)($r['whiteMs'] ?? 0);
    $blackMs = (int)($r['blackMs'] ?? 0);
    if ($turnIsWhite) $whiteMs = max(0, $whiteMs - $elapsed) + $inc;
    else              $blackMs = max(0, $blackMs - $elapsed) + $inc;

    return [
        'whiteMs' => $whiteMs, 'blackMs' => $blackMs,
        'clockRunning' => $endsGame ? 0 : 1,
        'turnStartedAt' => $endsGame ? '' : now_iso(),
    ];
}

/** Stop the clock without charging anybody — resignation, a draw agreed, a
 *  tournament cancelled. The remaining times stay on the row as the record. */
function chess_clock_stop(): array {
    return ['clockRunning' => 0, 'turnStartedAt' => ''];
}

/**
 * Has the player to move run out of time?
 *
 * The one place a flag-fall is decided. Ends the game if so, and returns true.
 *
 * A flag only loses if the opponent has material that could ever deliver mate;
 * otherwise FIDE 6.9 makes it a draw, and a child who wins on time against a
 * bare king would be a rule the app got wrong in the most visible way possible.
 */
function chess_clock_flag_check(string $matchId): bool {
    $r = db_row("SELECT * FROM match_games WHERE matchId = ? LIMIT 1", [$matchId]);
    if (!$r || (string)$r['status'] !== 'active') return false;
    $c = chess_clock_state($r);
    if ($c['flagged'] === '') return false;

    $whiteFlagged = $c['flagged'] === 'w';
    $loser  = $whiteFlagged ? (string)$r['playerA'] : (string)$r['playerB'];
    $winner = $whiteFlagged ? (string)$r['playerB'] : (string)$r['playerA'];

    // FIDE 6.9 — a flag falls, but the opponent cannot possibly mate: draw.
    $opponentCanMate = !function_exists('chess_has_mating_material')
        || chess_has_mating_material((string)$r['state'], $whiteFlagged ? 'b' : 'w');

    $patch = array_merge(chess_clock_stop(), [
        'whiteMs' => (int)$c['whiteMs'], 'blackMs' => (int)$c['blackMs'],
        'status' => 'complete', 'turnPlayer' => '', 'updatedAt' => now_iso(),
    ]);
    if ($opponentCanMate) {
        $patch += ['result' => 'win', 'winnerId' => $winner, 'reason' => 'timeout'];
    } else {
        $patch += ['result' => 'draw', 'winnerId' => '', 'reason' => 'timeout_vs_insufficient'];
    }
    db_update('match_games', $patch, ['matchId' => $matchId]);

    if (function_exists('match_settle_chess')) match_settle_chess($matchId);
    if (function_exists('match_tournament_report')) match_tournament_report($matchId);
    audit('match.timeout', $loser, $matchId, ['winner' => $opponentCanMate ? $winner : '', 'reason' => $patch['reason']], '');
    return true;
}

/**
 * Flag everybody who has run out while nobody was watching.
 *
 * Two players close their tabs; neither polls; the loser's clock is at zero and
 * the game sits open forever, holding up a tournament round that cannot close.
 * The board poll catches the common case the instant somebody looks, and this
 * catches the rest. Runs from the webcron tick, bounded per pass so it cannot
 * become the slow thing on a request.
 */
function chess_clock_sweep(int $limit = 40): int {
    $rows = db_all("SELECT matchId FROM match_games
                     WHERE status = 'active' AND clockRunning = 1 AND turnStartedAt <> ''
                     ORDER BY turnStartedAt ASC LIMIT ?", [max(1, min(200, $limit))]);
    $n = 0;
    foreach ($rows as $r) { if (chess_clock_flag_check((string)$r['matchId'])) $n++; }
    return $n;
}

/** mm:ss, or h:mm:ss past an hour. Server-side only for logs and emails; the
 *  board formats its own so it can tick between polls. */
function chess_clock_format(int $ms): string {
    $ms = max(0, $ms);
    $total = (int)floor($ms / 1000);
    $h = intdiv($total, 3600); $m = intdiv($total % 3600, 60); $s = $total % 60;
    if ($h > 0) return sprintf('%d:%02d:%02d', $h, $m, $s);
    // Under ten seconds the tenth matters, and the design shows it.
    if ($total < 10) return sprintf('%d.%d', $s, (int)floor(($ms % 1000) / 100));
    return sprintf('%d:%02d', $m, $s);
}
