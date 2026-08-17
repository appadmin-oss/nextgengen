<?php
declare(strict_types=1);

/**
 * Tournaments — centre rounds through to a final.
 *
 * The shape is the one the programme already runs in the physical world: every
 * centre plays its own knockout, each centre produces a champion, and the
 * champions meet. That matters beyond tidiness — a child at Ayobo should be
 * able to win something without ever travelling to Egbeda, and a centre with
 * four entrants should not be knocked out in round one by a centre with forty.
 *
 * A tournament match IS a match. It is created in match_games like any other
 * game, carrying a tournamentId, and it is played through the same endpoints
 * with the same rules engine, the same reaction vocabulary and the same staff
 * visibility. A parallel game table would mean two places a child can play and
 * two places a safeguarding review has to look, which is one too many of each.
 *
 * Byes are explicit rather than hidden: an odd entrant advances with no match
 * played, and the bracket says so.
 */

const TOURNAMENT_STATUSES = ['draft', 'open', 'running', 'complete', 'cancelled'];

function tournament_public(array $t): array {
    return [
        'tournamentId' => (string)$t['tournamentId'],
        'name'      => (string)$t['name'],
        'game'      => (string)$t['game'],
        'programme' => (string)($t['programme'] ?? ''),
        'status'    => (string)$t['status'],
        'stage'     => (string)$t['stage'],
        'round'     => (int)($t['round'] ?? 0),
        'winnerId'  => (string)($t['winnerId'] ?? ''),
        'winnerName' => (string)($t['winnerName'] ?? ''),
        'createdAt' => (string)($t['createdAt'] ?? ''),
        'updatedAt' => (string)($t['updatedAt'] ?? ''),
    ];
}

/* ── Setting one up ───────────────────────────────────────────────────── */

function admin_tournament_create(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $name = trim((string)($p['name'] ?? ''));
    if (strlen($name) < 3) return ['ok' => false, 'error' => 'name_required'];
    $game = (string)($p['game'] ?? 'chess');
    if (!function_exists('match_game') || !match_game($game)) return ['ok' => false, 'error' => 'bad_game'];
    $programme = (string)($p['programme'] ?? '');
    if (!in_array($programme, ['summer', 'ngg', ''], true)) return ['ok' => false, 'error' => 'bad_programme'];

    $id = 'TRN-' . strtoupper(rand_hex(6));
    $now = now_iso();
    db_insert('tournaments', [
        'tournamentId' => $id, 'name' => substr($name, 0, 160), 'game' => $game,
        'programme' => $programme, 'status' => 'open', 'stage' => 'centre', 'round' => 0,
        'createdBy' => (string)$g['requester']['memberId'], 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('tournament.create', (string)$g['requester']['memberId'], $id, ['name' => $name, 'game' => $game], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'tournamentId' => $id];
}

/** Add an entrant. Their centre is read from their record, never from the
 *  request — the centre decides which bracket they are in. */
function admin_tournament_enter(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [(string)($p['tournamentId'] ?? '')]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$t['status'] !== 'open') return ['ok' => false, 'error' => 'entries_closed'];

    $person = match_person((string)($p['playerId'] ?? ''));
    if (!$person) return ['ok' => false, 'error' => 'not_a_player'];
    if ((string)$t['programme'] !== '' && (string)$person['programme'] !== (string)$t['programme']) {
        return ['ok' => false, 'error' => 'wrong_programme'];
    }
    /* No centre means no bracket. Letting them in would produce an entrant who
     * can never be paired and never eliminated, which stalls the whole
     * tournament at "waiting for the last centre". */
    if (trim((string)$person['centre']) === '') return ['ok' => false, 'error' => 'player_has_no_centre'];
    if (db_row('SELECT id FROM tournament_entrants WHERE tournamentId = ? AND playerId = ?', [(string)$t['tournamentId'], (string)$person['id']])) {
        return ['ok' => false, 'error' => 'already_entered'];
    }
    db_insert('tournament_entrants', [
        'tournamentId' => (string)$t['tournamentId'], 'playerId' => (string)$person['id'],
        'playerName' => (string)$person['fullName'], 'playerType' => (string)$person['kind'],
        'centre' => (string)$person['centre'], 'stage' => 'centre', 'status' => 'active',
        'createdAt' => now_iso(),
    ]);
    return ['ok' => true, 'playerId' => (string)$person['id'], 'centre' => (string)$person['centre']];
}

function admin_tournament_withdraw(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [(string)($p['tournamentId'] ?? '')]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$t['status'] !== 'open') return ['ok' => false, 'error' => 'entries_closed'];
    $n = db_exec('DELETE FROM tournament_entrants WHERE tournamentId = ? AND playerId = ?',
                 [(string)$t['tournamentId'], (string)($p['playerId'] ?? '')]);
    return $n ? ['ok' => true] : ['ok' => false, 'error' => 'not_entered'];
}

/* ── Running it ───────────────────────────────────────────────────────── */

/** Everyone still standing at a stage, grouped by the bracket they play in. */
function tournament_live_entrants(string $tid, string $stage): array {
    return db_all("SELECT * FROM tournament_entrants WHERE tournamentId = ? AND stage = ? AND status = 'active' ORDER BY centre, playerName",
                  [$tid, $stage]);
}

/**
 * Pair one bracket into matches.
 *
 * Deterministic order (by name) rather than random: a bracket a child cannot
 * predict is a bracket a child cannot check, and "why am I playing him again"
 * is a question staff should be able to answer from the screen.
 *
 * An odd entrant gets a bye and advances untouched. Byes go to whoever is
 * LAST in the order, so the same person cannot draw one every round by virtue
 * of their name.
 */
function tournament_pair_bracket(array $t, array $entrants, string $stage, int $round): array {
    $made = []; $byes = [];
    $n = count($entrants);
    if ($n <= 1) return ['matches' => [], 'byes' => $n === 1 ? [$entrants[0]] : []];

    $pairs = (int)floor($n / 2);
    for ($i = 0; $i < $pairs; $i++) {
        $a = $entrants[$i * 2]; $b = $entrants[$i * 2 + 1];
        $now = now_iso();
        $matchId = 'MT-' . strtoupper(rand_hex(9));
        db_insert('match_games', [
            'matchId' => $matchId, 'game' => (string)$t['game'],
            /* A tournament pairing is not an invitation — nobody chose their
             * opponent and there is nothing to accept. It opens ACTIVE. */
            'status' => 'active',
            'programme' => (string)($t['programme'] ?? ''), 'centre' => (string)$a['centre'],
            'playerA' => (string)$a['playerId'], 'playerAName' => (string)$a['playerName'], 'playerAType' => (string)$a['playerType'],
            'playerB' => (string)$b['playerId'], 'playerBName' => (string)$b['playerName'], 'playerBType' => (string)$b['playerType'],
            'turnPlayer' => (string)$a['playerId'],
            'state' => match_initial_state((string)$t['game']), 'ply' => 0,
            'tournamentId' => (string)$t['tournamentId'],
            'tournamentRound' => $round, 'tournamentStage' => $stage,
            'createdAt' => $now, 'updatedAt' => $now,
        ]);
        $made[] = $matchId;
    }
    if ($n % 2 === 1) $byes[] = $entrants[$n - 1];
    return ['matches' => $made, 'byes' => $byes];
}

/**
 * Start the next round.
 *
 * Refuses while any match of the current round is still being played, because
 * pairing round 2 before round 1 finishes would pair people who have not yet
 * lost. The centre stage advances centre by centre; once every centre is down
 * to one player, the tournament moves to the final and the champions meet.
 */
function admin_tournament_advance(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [(string)($p['tournamentId'] ?? '')]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if (in_array((string)$t['status'], ['complete', 'cancelled'], true)) return ['ok' => false, 'error' => 'already_finished'];

    $tid = (string)$t['tournamentId'];
    $open = (int)(db_row("SELECT COUNT(*) c FROM match_games WHERE tournamentId = ? AND status IN ('invited','active')", [$tid])['c'] ?? 0);
    if ($open > 0) return ['ok' => false, 'error' => 'round_in_progress', 'remaining' => $open];

    $stage = (string)$t['stage'];
    $round = (int)$t['round'] + 1;

    if ($stage === 'centre') {
        $live = tournament_live_entrants($tid, 'centre');
        if (!$live) return ['ok' => false, 'error' => 'no_entrants'];
        $byCentre = [];
        foreach ($live as $e) $byCentre[(string)$e['centre']][] = $e;

        $matches = []; $byes = [];
        $champions = [];
        foreach ($byCentre as $centre => $group) {
            if (count($group) === 1) {
                // This centre is settled; its champion waits for the final.
                $champions[] = $group[0];
                continue;
            }
            $r = tournament_pair_bracket($t, $group, 'centre', $round);
            $matches = array_merge($matches, $r['matches']);
            $byes = array_merge($byes, $r['byes']);
        }
        foreach ($champions as $c) {
            db_update('tournament_entrants', ['centreChampion' => 1], ['id' => $c['id']]);
        }

        /* Every centre down to one — the centre stage is over. Move the
         * champions into the final bracket and pair them there. */
        if (!$matches) {
            $chs = db_all("SELECT * FROM tournament_entrants WHERE tournamentId = ? AND status = 'active' AND stage = 'centre' ORDER BY playerName", [$tid]);
            foreach ($chs as $c) db_update('tournament_entrants', ['stage' => 'final', 'centreChampion' => 1], ['id' => $c['id']]);
            if (count($chs) <= 1) {
                // One centre entered, so its champion is the whole tournament.
                return tournament_finish($t, $chs ? $chs[0] : null);
            }
            $t['stage'] = 'final';
            $fin = tournament_pair_bracket($t, $chs, 'final', 1);
            db_update('tournaments', ['status' => 'running', 'stage' => 'final', 'round' => 1, 'updatedAt' => now_iso()], ['tournamentId' => $tid]);
            return ['ok' => true, 'stage' => 'final', 'round' => 1, 'matches' => count($fin['matches']),
                    'byes' => count($fin['byes']), 'champions' => count($chs)];
        }

        db_update('tournaments', ['status' => 'running', 'round' => $round, 'updatedAt' => now_iso()], ['tournamentId' => $tid]);
        return ['ok' => true, 'stage' => 'centre', 'round' => $round,
                'matches' => count($matches), 'byes' => count($byes)];
    }

    // Final stage.
    $live = tournament_live_entrants($tid, 'final');
    if (count($live) <= 1) return tournament_finish($t, $live ? $live[0] : null);
    $fin = tournament_pair_bracket($t, $live, 'final', $round);
    db_update('tournaments', ['round' => $round, 'updatedAt' => now_iso()], ['tournamentId' => $tid]);
    return ['ok' => true, 'stage' => 'final', 'round' => $round,
            'matches' => count($fin['matches']), 'byes' => count($fin['byes'])];
}

function tournament_finish(array $t, ?array $winner): array {
    db_update('tournaments', [
        'status' => 'complete', 'stage' => 'done',
        'winnerId' => $winner ? (string)$winner['playerId'] : '',
        'winnerName' => $winner ? (string)$winner['playerName'] : '',
        'updatedAt' => now_iso(),
    ], ['tournamentId' => (string)$t['tournamentId']]);
    return ['ok' => true, 'stage' => 'done', 'complete' => true,
            'winnerId' => $winner ? (string)$winner['playerId'] : '',
            'winnerName' => $winner ? (string)$winner['playerName'] : ''];
}

/**
 * A tournament match finished — eliminate the loser.
 *
 * Called by the match layer on checkmate, draw or resignation. A DRAWN
 * knockout game cannot eliminate anybody, so it is reported to staff and the
 * round simply does not clear until they replay or decide it; silently
 * advancing one player on a coin-flip would be the wrong answer in a
 * children's competition.
 */
function match_tournament_report(string $matchId): void {
    $m = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [$matchId]);
    if (!$m || (string)($m['tournamentId'] ?? '') === '') return;
    $tid = (string)$m['tournamentId'];
    $winner = (string)($m['winnerId'] ?? '');
    if ($winner === '') {
        // A draw leaves both players in. Staff resolve it; see admin_tournament_replay.
        db_update('match_games', ['flagged' => 1], ['matchId' => $matchId]);
        return;
    }
    $loser = (string)$m['playerA'] === $winner ? (string)$m['playerB'] : (string)$m['playerA'];
    db_update('tournament_entrants',
        ['status' => 'eliminated', 'eliminatedRound' => (int)($m['tournamentRound'] ?? 0)],
        ['tournamentId' => $tid, 'playerId' => $loser]);
}

/** Replay a drawn knockout game — the only way a draw resolves. */
function admin_tournament_replay(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $m = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$m || (string)($m['tournamentId'] ?? '') === '') return ['ok' => false, 'error' => 'not_found'];
    if ((string)$m['result'] !== 'draw') return ['ok' => false, 'error' => 'not_a_draw'];
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [(string)$m['tournamentId']]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];

    $now = now_iso();
    $newId = 'MT-' . strtoupper(rand_hex(9));
    db_insert('match_games', [
        'matchId' => $newId, 'game' => (string)$m['game'], 'status' => 'active',
        'programme' => (string)$m['programme'], 'centre' => (string)$m['centre'],
        // Colours swap on a replay, which is the standard courtesy.
        'playerA' => (string)$m['playerB'], 'playerAName' => (string)$m['playerBName'], 'playerAType' => (string)$m['playerBType'],
        'playerB' => (string)$m['playerA'], 'playerBName' => (string)$m['playerAName'], 'playerBType' => (string)$m['playerAType'],
        'turnPlayer' => (string)$m['playerB'],
        'state' => match_initial_state((string)$m['game']), 'ply' => 0,
        'tournamentId' => (string)$m['tournamentId'],
        'tournamentRound' => (int)($m['tournamentRound'] ?? 0), 'tournamentStage' => (string)($m['tournamentStage'] ?? ''),
        'createdAt' => $now, 'updatedAt' => $now,
    ]);
    db_update('match_games', ['flagged' => 0], ['matchId' => (string)$m['matchId']]);
    audit('tournament.replay', (string)$g['requester']['memberId'], (string)$m['tournamentId'], ['from' => (string)$m['matchId'], 'to' => $newId], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'matchId' => $newId];
}

function admin_tournament_cancel(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $tid = (string)($p['tournamentId'] ?? '');
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    db_update('tournaments', ['status' => 'cancelled', 'updatedAt' => now_iso()], ['tournamentId' => $tid]);
    // Games in progress stop being tournament games; they are not deleted,
    // because a child's game is theirs and the record stays readable.
    db_exec("UPDATE match_games SET status = 'complete', result = 'void', reason = 'tournament_cancelled', turnPlayer = '' WHERE tournamentId = ? AND status IN ('invited','active')", [$tid]);
    audit('tournament.cancel', (string)$g['requester']['memberId'], $tid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Reading ──────────────────────────────────────────────────────────── */

function admin_tournaments_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT * FROM tournaments ORDER BY createdAt DESC LIMIT 60');
    $out = [];
    foreach ($rows as $r) {
        $t = tournament_public($r);
        $t['entrants'] = (int)(db_row('SELECT COUNT(*) c FROM tournament_entrants WHERE tournamentId = ?', [$t['tournamentId']])['c'] ?? 0);
        $t['live'] = (int)(db_row("SELECT COUNT(*) c FROM tournament_entrants WHERE tournamentId = ? AND status = 'active'", [$t['tournamentId']])['c'] ?? 0);
        $t['openMatches'] = (int)(db_row("SELECT COUNT(*) c FROM match_games WHERE tournamentId = ? AND status IN ('invited','active')", [$t['tournamentId']])['c'] ?? 0);
        $out[] = $t;
    }
    return ['ok' => true, 'tournaments' => $out];
}

/**
 * The bracket. Grouped by centre while the centre stage runs, then by round in
 * the final — which is how anybody reading it actually thinks about it.
 */
function tournament_bracket(array $p): array {
    $tid = (string)($p['tournamentId'] ?? '');
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];

    $entrants = db_all('SELECT * FROM tournament_entrants WHERE tournamentId = ? ORDER BY centre, playerName', [$tid]);
    $byCentre = [];
    foreach ($entrants as $e) {
        $byCentre[(string)$e['centre']][] = [
            'playerId' => (string)$e['playerId'], 'name' => (string)$e['playerName'],
            'status' => (string)$e['status'], 'stage' => (string)$e['stage'],
            'centreChampion' => (int)$e['centreChampion'] === 1,
            'eliminatedRound' => (int)$e['eliminatedRound'],
        ];
    }
    $matches = db_all('SELECT * FROM match_games WHERE tournamentId = ? ORDER BY tournamentStage, tournamentRound, createdAt', [$tid]);
    $rounds = [];
    foreach ($matches as $m) {
        $key = (string)$m['tournamentStage'] . '-' . (int)$m['tournamentRound'];
        $rounds[$key][] = [
            'matchId' => (string)$m['matchId'], 'centre' => (string)$m['centre'],
            'stage' => (string)$m['tournamentStage'], 'round' => (int)$m['tournamentRound'],
            'a' => ['id' => (string)$m['playerA'], 'name' => (string)$m['playerAName']],
            'b' => ['id' => (string)$m['playerB'], 'name' => (string)$m['playerBName']],
            'status' => (string)$m['status'], 'result' => (string)($m['result'] ?? ''),
            'winnerId' => (string)($m['winnerId'] ?? ''), 'reason' => (string)($m['reason'] ?? ''),
            'ply' => (int)($m['ply'] ?? 0),
        ];
    }
    return ['ok' => true, 'tournament' => tournament_public($t),
            'centres' => $byCentre, 'rounds' => $rounds];
}

/** A player's own view: the tournaments they are in and their next game. */
function tournament_mine(array $p): array {
    $id = (string)($p['playerId'] ?? '');
    if ($id === '') return ['ok' => false, 'error' => 'not_a_player'];
    $rows = db_all("SELECT t.*, e.status estatus, e.stage estage, e.centre ecentre
                    FROM tournament_entrants e JOIN tournaments t ON t.tournamentId = e.tournamentId
                    WHERE e.playerId = ? ORDER BY t.createdAt DESC LIMIT 20", [$id]);
    $out = [];
    foreach ($rows as $r) {
        $t = tournament_public($r);
        $t['you'] = ['status' => (string)$r['estatus'], 'stage' => (string)$r['estage'], 'centre' => (string)$r['ecentre']];
        $nx = db_row("SELECT matchId FROM match_games WHERE tournamentId = ? AND status = 'active' AND (playerA = ? OR playerB = ?) LIMIT 1",
                     [(string)$r['tournamentId'], $id, $id]);
        $t['nextMatchId'] = $nx ? (string)$nx['matchId'] : '';
        $out[] = $t;
    }
    return ['ok' => true, 'tournaments' => $out];
}
