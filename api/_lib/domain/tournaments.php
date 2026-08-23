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
    $fmt = (string)($t['format'] ?? 'centre');
    $meta = function_exists('tournament_format_meta') ? (tournament_format_meta()[$fmt] ?? null) : null;
    return [
        'tournamentId' => (string)$t['tournamentId'],
        'name'      => (string)$t['name'],
        'game'      => (string)$t['game'],
        // The three things the old list could not show, because there was
        // nowhere to set them: what kind of event it is, how fast, and
        // whether it counts.
        'format'      => $fmt,
        'formatName'  => $meta ? $meta['name'] : ucfirst($fmt),
        'timeControl' => (string)($t['timeControl'] ?? '1day'),
        'variant'     => (string)($t['variant'] ?? 'standard'),
        'rated'       => (int)($t['rated'] ?? 1) === 1,
        'totalRounds' => (int)($t['totalRounds'] ?? 0),
        'description' => (string)($t['description'] ?? ''),
        'programme' => (string)($t['programme'] ?? ''),
        'status'    => (string)$t['status'],
        'stage'     => (string)$t['stage'],
        'round'     => (int)($t['round'] ?? 0),
        'winnerId'  => (string)($t['winnerId'] ?? ''),
        'winnerName' => (string)($t['winnerName'] ?? ''),
        'createdAt' => (string)($t['createdAt'] ?? ''),
        'updatedAt' => (string)($t['updatedAt'] ?? ''),
        // One place computes what the dates MEAN, so the join gate, the
        // member's card and the director's list cannot disagree about whether
        // entries are open.
        'window'    => trn_window($t),
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

    /* Format, time control and who may enter — the three things the creation
     * screen used to have no way to ask, so every tournament was a centre cup
     * with no clock.
     *
     * The DEFAULT stays 'centre', deliberately. Swiss is the better answer for
     * most club events and is what the wizard preselects, but changing what an
     * omitted parameter means would silently re-shape every tournament created
     * by an existing caller. The new interface always sends a format; the old
     * one keeps the behaviour it had. */
    $format = (string)($p['format'] ?? 'centre');
    if (!in_array($format, TOURNAMENT_FORMATS, true)) return ['ok' => false, 'error' => 'bad_format'];
    /* And the default clock follows the default format: a centre cup created
     * without one is the old correspondence-paced event, not a rapid game
     * somebody would flag out of before they knew a clock existed. */
    $tc = (string)($p['timeControl'] ?? ($format === 'centre' ? '1day' : '10+0'));
    if (!isset(CHESS_CLOCK_TABLE[$tc])) return ['ok' => false, 'error' => 'bad_time_control'];
    /* An arena is a window of continuous play; a correspondence control makes
     * no sense in one, because the window would close before a game finished. */
    if ($format === 'arena' && !chess_clock_is_live($tc)) return ['ok' => false, 'error' => 'arena_needs_a_clock'];
    $variant = (string)($p['variant'] ?? 'standard');
    if (!chess_variant_valid($variant)) return ['ok' => false, 'error' => 'bad_variant'];
    // A variant that changes what winning is cannot move a rating built on
    // standard chess. See chess_variant_rateable().
    $rated = !empty($p['rated']) && chess_variant_rateable($variant);

    /* When it runs. These were columns from the beginning, written straight
     * from the request with no validation and read by nothing, so a director
     * could set an event to end before it began and see no symptom at all. */
    $win = trn_check_window((string)($p['startsAt'] ?? ''), (string)($p['endsAt'] ?? ''));
    if (empty($win['ok'])) return ['ok' => false, 'error' => $win['error']];

    $kinds = array_values(array_intersect((array)($p['kinds'] ?? []), DIRECTORY_KINDS));
    $centres = array_values(array_filter(array_map('strval', (array)($p['centres'] ?? []))));
    $rounds = max(0, min(15, (int)($p['totalRounds'] ?? 0)));

    $id = 'TRN-' . strtoupper(rand_hex(6));
    $now = now_iso();
    db_insert('tournaments', [
        'tournamentId' => $id, 'name' => mb_substr($name, 0, 160), 'game' => $game,
        'description' => mb_substr(trim((string)($p['description'] ?? '')), 0, 600),
        'programme' => $programme, 'status' => 'open',
        'format' => $format, 'timeControl' => $tc, 'variant' => $variant,
        'rated' => $rated ? 1 : 0,
        'totalRounds' => $rounds,
        'centres' => $centres ? json_encode($centres, JSON_UNESCAPED_SLASHES) : '',
        'eligibility' => json_encode([
            'kinds' => $kinds ?: DIRECTORY_KINDS,
            'minRating' => max(0, (int)($p['minRating'] ?? 0)),
            'maxRating' => max(0, (int)($p['maxRating'] ?? 0)),
        ], JSON_UNESCAPED_SLASHES),
        'startsAt' => $win['startsAt'], 'endsAt' => $win['endsAt'],
        'stage' => $format === 'centre' ? 'centre' : 'main', 'round' => 0,
        'createdBy' => (string)$g['requester']['memberId'], 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('tournament.create', (string)$g['requester']['memberId'], $id,
          ['name' => $name, 'format' => $format, 'timeControl' => $tc,
           'startsAt' => $win['startsAt'], 'endsAt' => $win['endsAt']], (string)($p['ip'] ?? ''));
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
    // Only the centre cup brackets BY centre; every other format is fine
    // without one, and volunteers legitimately work across centres.
    if ((string)($t['format'] ?? 'centre') === 'centre' && trim((string)$person['centre']) === '') {
        return ['ok' => false, 'error' => 'player_has_no_centre'];
    }
    if (db_row('SELECT id FROM tournament_entrants WHERE tournamentId = ? AND playerId = ?', [(string)$t['tournamentId'], (string)$person['id']])) {
        return ['ok' => false, 'error' => 'already_entered'];
    }
    /* One entry path, so a director adding somebody by hand and a member
     * joining themselves produce the same row — with the rating frozen and the
     * field reseeded, which the old insert did neither of. */
    $r = trn_add_entrant($t, (string)$person['id']);
    if (empty($r['ok'])) return $r;
    trn_invite_mark_joined((string)$t['tournamentId'], (string)$person['id']);
    return ['ok' => true, 'playerId' => (string)$person['id'], 'centre' => (string)$person['centre'],
            'rating' => (int)$r['rating']];
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
 * On the SHARED knockout engine, and recording pairings like every other
 * format. Both of those are changes, and both were defects:
 *
 * · It paired alphabetically — entrants ordered by name, then [0] v [1],
 *   [2] v [3]. That is the exact flaw tournament_pair_knockout's own comment
 *   describes fixing: a draw could put the two strongest children on board one
 *   of round one and settle the centre before it started. It is seeded now:
 *   the field is ordered by rating and the strongest plays the weakest, so the
 *   top two can only meet at the end of their centre.
 *
 * · The bye went to whoever sorted LAST, and the comment here claimed that
 *   meant "the same person cannot draw one every round by virtue of their
 *   name". It meant the opposite — sort by name, take the last, and the child
 *   at the end of the alphabet draws the bye every round they survive. It goes
 *   to the top seed now, which is the knockout standard and is at least a
 *   reason somebody can be told.
 *
 * What it deliberately does NOT do is hand the whole bracket to
 * tournament_pair_knockout. That engine pads the field to a power of two, so
 * five entrants become one game and three byes; this one halves, so five
 * become two games and one bye. Both are real knockout shapes and the halving
 * one is what the programme runs in the hall — replacing it would be changing
 * the tournament, not fixing it.
 *
 * · It wrote no tournament_pairings rows. Four of the five formats record a
 *   fixture the moment a round is drawn — that is what the table is FOR, per
 *   its own schema comment — and the centre cup instead left its fixture list
 *   to be reconstructed from match_games. A bye has no match, so a centre-cup
 *   bye appeared nowhere at all, and tournament_rounds(), which is the fixture
 *   list a member actually opens, returned nothing for a centre cup.
 */
function tournament_pair_bracket(array $t, array $entrants, string $stage, int $round): array {
    $made = []; $byes = [];
    $n = count($entrants);
    if ($n <= 1) return ['matches' => [], 'byes' => $n === 1 ? [$entrants[0]] : []];

    $tid = (string)$t['tournamentId'];

    /* Seeded, strongest against weakest. An odd field gives the bye to the
     * top seed and the rest fold around them, which is the standard bracket:
     * 1 byes, 2 v 5, 3 v 4. */
    usort($entrants, fn($x, $y) => [(int)$y['ratingAtEntry'], (string)$x['playerName']]
                               <=> [(int)$x['ratingAtEntry'], (string)$y['playerName']]);
    $bye = null;
    if ($n % 2 === 1) { $bye = array_shift($entrants); }

    $pairs = [];
    $c = count($entrants);
    for ($i = 0; $i < $c / 2; $i++) $pairs[] = [$entrants[$i], $entrants[$c - 1 - $i]];

    $board = 1;
    foreach ($pairs as [$a, $b]) {
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
            'tournamentId' => $tid,
            'tournamentRound' => $round, 'tournamentStage' => $stage,
            'board' => $board,
            'createdAt' => $now, 'updatedAt' => $now,
        ]);
        trn_record_pairing($tid, $stage, $round, $board, (string)$a['centre'],
                           $a, $b, $matchId, false);
        $board++;
        $made[] = $matchId;
    }
    if ($bye) {
        // A bye is a fixture too — the one the old engine could not show.
        trn_record_pairing($tid, $stage, $round, 0, (string)($bye['centre'] ?? ''),
                           $bye, null, '', true);
        $byes[] = $bye;
    }
    return ['matches' => $made, 'byes' => $byes];
}

/**
 * Write one fixture. Shared by every format, so a fixture list means the same
 * thing whichever engine drew it — and so a bye is a row rather than an
 * absence somebody has to infer.
 */
function trn_record_pairing(string $tid, string $stage, int $round, int $board, string $centre,
                            array $white, ?array $black, string $matchId, bool $isBye): void {
    db_insert('tournament_pairings', [
        'tournamentId' => $tid, 'round' => $round, 'stage' => $stage, 'board' => $board,
        'centre' => $centre,
        'whiteId' => (string)$white['playerId'], 'whiteName' => (string)$white['playerName'],
        'blackId' => $black ? (string)$black['playerId'] : '',
        'blackName' => $black ? (string)$black['playerName'] : '',
        'matchId' => $matchId, 'isBye' => $isBye ? 1 : 0,
        'result' => $isBye ? 'bye' : '', 'scoredAt' => $isBye ? now_iso() : '',
        'createdAt' => now_iso(),
    ]);
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

    /* Advancing a round is many writes and ONE decision: pair the survivors,
     * mark the champions, bump the round. Half of that is not a smaller
     * version of it — it is a bracket where some players have an opponent,
     * others are waiting for a round that already moved on, and no operator
     * can tell by looking which half landed. Rolled back whole, the mentor
     * simply presses Advance again. */
    return db_tx(fn() => tournament_advance_now($t, $p));
}

/** The advance itself. Only called inside the transaction opened above. */
function tournament_advance_now(array $t, array $p): array {

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
    /* Scoring, standings and tiebreaks live in tournaments2.php and handle
     * every format including this one. The elimination below is kept because
     * the centre cup's own advance engine reads `status`. */
    if (function_exists('trn_score_match')) trn_score_match($matchId);
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
            'centres' => $byCentre, 'rounds' => $rounds,
            // Asked, and said yes. Without the first number the second is not
            // a rate, and a director filling a field is working blind.
            'invites' => trn_invite_stats($tid)];
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
