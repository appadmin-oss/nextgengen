<?php
declare(strict_types=1);

/**
 * Tournaments 2.0 — the parts the old file had no shape for.
 *
 * tournaments.php still owns the centre-cup format it was written for. This
 * file owns everything that made the old one one-shape-only: creating an event
 * with a format and a time control, drawing a round through the pairing
 * engines, scoring a result, keeping standings, and letting a member SEE a
 * tournament at all.
 *
 * That last one was the real defect. `tournament.mine` listed events you were
 * already an entrant in, an admin had to add you by hand from the console, and
 * the chess screen had no tournament surface whatsoever — so a tournament, once
 * created, was invisible to every person it was created for.
 */

/* ── Reading ──────────────────────────────────────────────────────────── */

/** The public shape, with everything a card needs and nothing it doesn't. */
function trn_shape(array $t, string $viewer = ''): array {
    $fmt = (string)($t['format'] ?? 'centre');
    $meta = tournament_format_meta()[$fmt] ?? ['name' => ucfirst($fmt), 'blurb' => ''];
    $tid = (string)$t['tournamentId'];

    $entrants = (int)(db_row('SELECT COUNT(*) c FROM tournament_entrants WHERE tournamentId = ?', [$tid])['c'] ?? 0);
    $out = [
        'tournamentId' => $tid,
        'name'        => (string)$t['name'],
        'description' => (string)($t['description'] ?? ''),
        'game'        => (string)$t['game'],
        'format'      => $fmt,
        'formatName'  => $meta['name'],
        'formatBlurb' => $meta['blurb'],
        'programme'   => (string)($t['programme'] ?? ''),
        'timeControl' => (string)($t['timeControl'] ?? '10+0'),
        'variant'     => (string)($t['variant'] ?? 'standard'),
        'variantName' => function_exists('chess_variant_meta')
            ? (chess_variant_meta()[(string)($t['variant'] ?? 'standard')]['name'] ?? 'Standard') : 'Standard',
        'rated'       => (int)($t['rated'] ?? 1) === 1,
        'status'      => (string)$t['status'],
        'stage'       => (string)$t['stage'],
        'round'       => (int)($t['round'] ?? 0),
        'totalRounds' => (int)($t['totalRounds'] ?? 0),
        'startsAt'    => (string)($t['startsAt'] ?? ''),
        'endsAt'      => (string)($t['endsAt'] ?? ''),
        'centres'     => trn_json_list($t['centres'] ?? ''),
        'eligibility' => trn_eligibility($t),
        'winnerId'    => (string)($t['winnerId'] ?? ''),
        'winnerName'  => (string)($t['winnerName'] ?? ''),
        'entrants'    => $entrants,
        'createdAt'   => (string)($t['createdAt'] ?? ''),
    ];
    if ($viewer !== '') {
        $e = db_row('SELECT * FROM tournament_entrants WHERE tournamentId = ? AND playerId = ? LIMIT 1', [$tid, $viewer]);
        $out['you'] = $e ? [
            'entered' => true, 'status' => (string)$e['status'],
            'score' => (float)$e['score'], 'played' => (int)$e['played'],
            'seed' => (int)$e['seed'], 'withdrawn' => (int)$e['withdrawn'] === 1,
        ] : ['entered' => false];
        $out['canJoin'] = trn_can_join($t, $viewer)['ok'];
        $nx = db_row("SELECT matchId FROM match_games WHERE tournamentId = ? AND status = 'active' AND (playerA = ? OR playerB = ?) LIMIT 1", [$tid, $viewer, $viewer]);
        $out['nextMatchId'] = $nx ? (string)$nx['matchId'] : '';
    }
    return $out;
}

function trn_json_list($v): array {
    $j = json_decode((string)$v, true);
    return is_array($j) ? array_values(array_map('strval', $j)) : [];
}

/** Who may enter. Defaults to everybody, which is the right default for a club. */
function trn_eligibility(array $t): array {
    $j = json_decode((string)($t['eligibility'] ?? ''), true);
    $j = is_array($j) ? $j : [];
    return [
        'kinds' => !empty($j['kinds']) ? array_values(array_intersect((array)$j['kinds'], DIRECTORY_KINDS)) : DIRECTORY_KINDS,
        'minRating' => (int)($j['minRating'] ?? 0),
        'maxRating' => (int)($j['maxRating'] ?? 0),
    ];
}

/**
 * Can this person enter?
 *
 * Returns a reason rather than a boolean, because "you cannot join" with no
 * explanation is the shape of a screen people give up on.
 */
function trn_can_join(array $t, string $playerId): array {
    if ((string)$t['status'] !== 'open') return ['ok' => false, 'why' => 'Entries are closed.'];
    $person = match_person($playerId);
    if (!$person) return ['ok' => false, 'why' => 'You need a player account.'];
    if (db_row('SELECT id FROM tournament_entrants WHERE tournamentId = ? AND playerId = ?',
               [(string)$t['tournamentId'], $playerId])) {
        return ['ok' => false, 'why' => 'You are already entered.'];
    }
    $prog = (string)($t['programme'] ?? '');
    if ($prog !== '' && (string)$person['programme'] !== $prog) {
        return ['ok' => false, 'why' => 'This one is for the ' . ($prog === 'summer' ? 'Summer School' : 'NGG Club') . '.'];
    }
    $el = trn_eligibility($t);
    if (!in_array((string)$person['kind'], $el['kinds'], true)) {
        return ['ok' => false, 'why' => 'This one is not open to your group.'];
    }
    $centres = trn_json_list($t['centres'] ?? '');
    if ($centres && !in_array((string)$person['centre'], $centres, true)) {
        return ['ok' => false, 'why' => 'This one is for ' . implode(', ', $centres) . '.'];
    }
    /* The centre-cup format brackets BY centre, so somebody with no centre can
     * never be paired and never eliminated — the event would stall forever at
     * "waiting for the last centre". Every other format is fine without one. */
    if ((string)($t['format'] ?? 'centre') === 'centre' && trim((string)$person['centre']) === '') {
        return ['ok' => false, 'why' => 'This one runs centre by centre, and you are not assigned to one.'];
    }
    $rating = chess_rating_of($playerId);
    if ($el['minRating'] > 0 && $rating < $el['minRating']) {
        return ['ok' => false, 'why' => 'Rated ' . $el['minRating'] . ' and above.'];
    }
    if ($el['maxRating'] > 0 && $rating > $el['maxRating']) {
        return ['ok' => false, 'why' => 'Rated ' . $el['maxRating'] . ' and below.'];
    }
    return ['ok' => true, 'why' => ''];
}

/**
 * Every tournament a member can see.
 *
 * The gap this closes: there was no such endpoint. `tournament.mine` returned
 * events you had already been entered into by an admin, so a newly created
 * tournament appeared to nobody and there was no way to join one. Open events
 * first, then live ones, then the recently finished — which is the order
 * somebody opening the screen cares about them in.
 */
function tournament_browse(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $rows = db_all("SELECT * FROM tournaments WHERE status IN ('open','running','complete')
                    ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,
                             updatedAt DESC LIMIT 40");
    $out = [];
    foreach ($rows as $r) $out[] = trn_shape($r, $viewer);
    return ['ok' => true, 'tournaments' => $out, 'formats' => tournament_format_meta()];
}

/** A member enters themselves. The admin-side entry still exists for a
 *  director adding somebody who cannot do it themselves. */
function tournament_join(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [(string)($p['tournamentId'] ?? '')]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    $can = trn_can_join($t, $viewer);
    if (!$can['ok']) return ['ok' => false, 'error' => 'cannot_join', 'message' => $can['why']];
    $r = trn_add_entrant($t, $viewer);
    if (empty($r['ok'])) return $r;
    audit('tournament.join', $viewer, (string)$t['tournamentId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'tournamentId' => (string)$t['tournamentId']];
}

/** Leave, while entries are still open. */
function tournament_leave(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [(string)($p['tournamentId'] ?? '')]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$t['status'] === 'open') {
        db_exec('DELETE FROM tournament_entrants WHERE tournamentId = ? AND playerId = ?',
                [(string)$t['tournamentId'], $viewer]);
        return ['ok' => true, 'removed' => true];
    }
    /* Once it is running, leaving cannot delete the row: their results are
     * part of everybody else's tiebreaks. They are marked withdrawn, stop
     * being paired, and keep the games they played. */
    $n = db_exec("UPDATE tournament_entrants SET withdrawn = 1, status = 'withdrawn'
                   WHERE tournamentId = ? AND playerId = ?", [(string)$t['tournamentId'], $viewer]);
    return $n ? ['ok' => true, 'withdrawn' => true] : ['ok' => false, 'error' => 'not_entered'];
}

/** Add somebody to the field, with their rating recorded as it is today. */
function trn_add_entrant(array $t, string $playerId): array {
    $person = match_person($playerId);
    if (!$person) return ['ok' => false, 'error' => 'not_a_player'];
    $rating = chess_rating_of($playerId);
    db_insert('tournament_entrants', [
        'tournamentId' => (string)$t['tournamentId'],
        'playerId' => (string)$person['id'], 'playerName' => (string)$person['fullName'],
        'playerType' => (string)$person['kind'], 'centre' => (string)$person['centre'],
        'stage' => (string)($t['format'] ?? 'centre') === 'centre' ? 'centre' : 'main',
        'status' => 'active',
        /* The rating is frozen AT ENTRY. Seeding, the bracket and the
         * performance rating all have to be computed against one number, and
         * a rating that moved during the event would silently re-order a
         * bracket somebody had already read. */
        'ratingAtEntry' => $rating,
        'opponents' => '[]',
        'createdAt' => now_iso(),
    ]);
    trn_reseed((string)$t['tournamentId']);
    return ['ok' => true, 'playerId' => (string)$person['id'], 'rating' => $rating];
}

/** Number the field by strength. Seed 1 is the highest rated. */
function trn_reseed(string $tid): void {
    $rows = db_all("SELECT id, ratingAtEntry, playerName FROM tournament_entrants
                     WHERE tournamentId = ? ORDER BY ratingAtEntry DESC, playerName ASC", [$tid]);
    $i = 1;
    foreach ($rows as $r) db_update('tournament_entrants', ['seed' => $i++], ['id' => (int)$r['id']]);
}

/* ── Drawing a round ──────────────────────────────────────────────────── */

/**
 * Draw the next round.
 *
 * One decision, many writes: pair the field, create the games, record the
 * pairings, credit the byes and bump the round. Half of that is a tournament
 * where some players have an opponent and others are waiting for a round that
 * already moved on — so it is one transaction, and a director who sees an
 * error simply presses Draw again.
 */
function tournament_draw_round(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [(string)($p['tournamentId'] ?? '')]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if (in_array((string)$t['status'], ['complete', 'cancelled'], true)) return ['ok' => false, 'error' => 'already_finished'];

    $fmt = (string)($t['format'] ?? 'centre');
    // The centre cup keeps its own engine, which knows about per-centre brackets.
    if ($fmt === 'centre') return admin_tournament_advance($p);

    $tid = (string)$t['tournamentId'];
    $open = (int)(db_row("SELECT COUNT(*) c FROM match_games WHERE tournamentId = ? AND status IN ('invited','active')", [$tid])['c'] ?? 0);
    if ($open > 0 && $fmt !== 'arena') return ['ok' => false, 'error' => 'round_in_progress', 'remaining' => $open];

    return db_tx(fn() => trn_draw_now($t, (string)($g['requester']['memberId'] ?? ''), (string)($p['ip'] ?? '')));
}

function trn_draw_now(array $t, string $by, string $ip): array {
    $tid = (string)$t['tournamentId'];
    $fmt = (string)($t['format'] ?? 'swiss');
    $round = (int)($t['round'] ?? 0) + 1;

    $entrants = db_all("SELECT * FROM tournament_entrants WHERE tournamentId = ? AND withdrawn = 0", [$tid]);
    if (count($entrants) < 2) return ['ok' => false, 'error' => 'no_entrants'];

    /* Snapshot where everybody stands BEFORE this round is paired, so the
     * ladder can say "up two" against a position that actually existed. A
     * delta computed any other way is an arrow drawn on a guess. */
    trn_snapshot_ranks($tid, $fmt);

    // How many rounds this event runs, decided once on the first draw.
    $total = (int)($t['totalRounds'] ?? 0);
    if ($total <= 0) {
        $total = $fmt === 'roundrobin' ? tournament_roundrobin_rounds(count($entrants))
               : ($fmt === 'swiss' ? tournament_swiss_rounds(count($entrants)) : 0);
        if ($total > 0) db_update('tournaments', ['totalRounds' => $total], ['tournamentId' => $tid]);
    }
    if ($total > 0 && $round > $total && $fmt !== 'arena') return trn_finish($t);

    if ($fmt === 'swiss')          $r = tournament_pair_swiss($entrants, $round);
    elseif ($fmt === 'roundrobin') $r = tournament_pair_roundrobin($entrants, $round);
    elseif ($fmt === 'knockout')   $r = tournament_pair_knockout($entrants, $round);
    elseif ($fmt === 'arena') {
        $busy = array_map(fn($x) => (string)$x['playerA'], db_all("SELECT playerA FROM match_games WHERE tournamentId = ? AND status = 'active'", [$tid]));
        $busy = array_merge($busy, array_map(fn($x) => (string)$x['playerB'], db_all("SELECT playerB FROM match_games WHERE tournamentId = ? AND status = 'active'", [$tid])));
        $r = tournament_pair_arena($entrants, $busy);
    }
    else return ['ok' => false, 'error' => 'bad_format'];

    if (!$r['pairings'] && !($r['byes'] ?? [])) {
        return $fmt === 'arena' ? ['ok' => true, 'paired' => 0, 'waiting' => count($r['waiting'] ?? [])] : trn_finish($t);
    }

    $now = now_iso();
    $stage = $fmt === 'centre' ? 'centre' : 'main';
    $made = 0;
    foreach ($r['pairings'] as $pair) {
        $matchId = 'MT-' . strtoupper(rand_hex(9));
        db_insert('match_games', [
            'matchId' => $matchId, 'game' => (string)$t['game'],
            /* A drawn pairing is not an invitation — nobody chose their
             * opponent and there is nothing to accept. It opens ACTIVE, and
             * the clock starts with it, exactly as a round does over the board. */
            'status' => 'active',
            'programme' => (string)($t['programme'] ?? ''), 'centre' => (string)$pair['centre'],
            'playerA' => (string)$pair['whiteId'], 'playerAName' => (string)$pair['whiteName'], 'playerAType' => '',
            'playerB' => (string)$pair['blackId'], 'playerBName' => (string)$pair['blackName'], 'playerBType' => '',
            'turnPlayer' => (string)$pair['whiteId'], 'ply' => 0,
            'tournamentId' => $tid, 'tournamentRound' => $round, 'tournamentStage' => $stage,
            'board' => (int)$pair['board'],
            'rated' => (int)($t['rated'] ?? 1),
            'createdAt' => $now, 'updatedAt' => $now,
        ] + chess_clock_init((string)($t['timeControl'] ?? '10+0'))
          + ((string)$t['game'] === 'chess'
                ? chess_variant_start((string)($t['variant'] ?? 'standard'))
                : ['state' => match_initial_state((string)$t['game']), 'variant' => 'standard']));
        db_update('match_games', [
            'clockRunning' => chess_clock_is_live((string)($t['timeControl'] ?? '10+0')) ? 1 : 0,
            'turnStartedAt' => $now,
        ], ['matchId' => $matchId]);

        db_insert('tournament_pairings', [
            'tournamentId' => $tid, 'round' => $round, 'stage' => $stage, 'board' => (int)$pair['board'],
            'centre' => (string)$pair['centre'],
            'whiteId' => (string)$pair['whiteId'], 'whiteName' => (string)$pair['whiteName'],
            'blackId' => (string)$pair['blackId'], 'blackName' => (string)$pair['blackName'],
            'matchId' => $matchId, 'isBye' => 0, 'createdAt' => $now,
        ]);
        trn_note_pairing($tid, (string)$pair['whiteId'], (string)$pair['blackId'], 'w');
        trn_note_pairing($tid, (string)$pair['blackId'], (string)$pair['whiteId'], 'b');
        $made++;
    }

    /* A bye is a full point and no game. Recorded as a pairing so the round
     * reads honestly — "Ada, bye" rather than a name quietly missing from the
     * list — and credited immediately, because there is nothing to wait for. */
    foreach (($r['byes'] ?? []) as $b) {
        db_insert('tournament_pairings', [
            'tournamentId' => $tid, 'round' => $round, 'stage' => $stage, 'board' => 0,
            'centre' => (string)($b['centre'] ?? ''),
            'whiteId' => (string)$b['playerId'], 'whiteName' => (string)$b['playerName'],
            'blackId' => '', 'blackName' => '', 'matchId' => '', 'isBye' => 1,
            'result' => 'bye', 'scoredAt' => $now, 'createdAt' => $now,
        ]);
        db_exec("UPDATE tournament_entrants SET score = score + 1, byes = byes + 1 WHERE tournamentId = ? AND playerId = ?",
                [$tid, (string)$b['playerId']]);
    }

    db_insert('tournament_rounds', ['tournamentId' => $tid, 'round' => $round, 'stage' => $stage,
                                    'status' => $made ? 'live' : 'complete', 'pairedAt' => $now]);
    db_update('tournaments', ['status' => 'running', 'round' => $round, 'stage' => $stage, 'updatedAt' => $now],
              ['tournamentId' => $tid]);
    trn_recalc_tiebreaks($tid);
    audit('tournament.draw', $by, $tid, ['round' => $round, 'format' => $fmt, 'boards' => $made], $ip);

    return ['ok' => true, 'round' => $round, 'totalRounds' => $total,
            'boards' => $made, 'byes' => count($r['byes'] ?? []),
            'waiting' => count($r['waiting'] ?? [])];
}

/** Record that these two met, and which colour the first one had. */
function trn_note_pairing(string $tid, string $playerId, string $oppId, string $colour): void {
    $e = db_row('SELECT * FROM tournament_entrants WHERE tournamentId = ? AND playerId = ? LIMIT 1', [$tid, $playerId]);
    if (!$e) return;
    $opps = tournament_opponents_of($e);
    if ($oppId !== '' && !in_array($oppId, $opps, true)) $opps[] = $oppId;
    db_update('tournament_entrants', [
        'opponents' => json_encode(array_values($opps), JSON_UNESCAPED_SLASHES),
        'lastColour' => $colour,
        'whiteCount' => (int)$e['whiteCount'] + ($colour === 'w' ? 1 : 0),
        'blackCount' => (int)$e['blackCount'] + ($colour === 'b' ? 1 : 0),
    ], ['id' => (int)$e['id']]);
}

/* ── Scoring ──────────────────────────────────────────────────────────── */

/**
 * A tournament game finished — score it.
 *
 * Called from the match layer on checkmate, resignation, timeout or an agreed
 * draw. Unlike the knockout-only predecessor this handles a DRAW properly:
 * half a point each, and the round carries on. A knockout still cannot advance
 * on a draw, and says so, because deciding a children's competition on a coin
 * flip would be the wrong answer.
 */
function trn_score_match(string $matchId): void {
    $m = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [$matchId]);
    if (!$m || (string)($m['tournamentId'] ?? '') === '') return;
    $tid = (string)$m['tournamentId'];
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [$tid]);
    if (!$t) return;

    $pair = db_row('SELECT * FROM tournament_pairings WHERE matchId = ? LIMIT 1', [$matchId]);
    if ($pair && (string)$pair['result'] !== '') return;    // already scored

    $white = (string)$m['playerA']; $black = (string)$m['playerB'];
    $winner = (string)($m['winnerId'] ?? '');
    $isDraw = (string)($m['result'] ?? '') === 'draw';
    $res = $isDraw ? '0.5-0.5' : ($winner === $white ? '1-0' : ($winner === $black ? '0-1' : ''));
    if ($res === '') return;                                 // void, cancelled

    $now = now_iso();
    if ($pair) db_update('tournament_pairings', ['result' => $res, 'scoredAt' => $now], ['id' => (int)$pair['id']]);

    $fmt = (string)($t['format'] ?? 'centre');
    foreach ([[$white, $isDraw ? 0.5 : ($winner === $white ? 1.0 : 0.0)],
              [$black, $isDraw ? 0.5 : ($winner === $black ? 1.0 : 0.0)]] as [$pid, $pts]) {
        $e = db_row('SELECT * FROM tournament_entrants WHERE tournamentId = ? AND playerId = ? LIMIT 1', [$tid, $pid]);
        if (!$e) continue;
        $outcome = $pts >= 1.0 ? 'win' : ($pts > 0 ? 'draw' : 'loss');
        $patch = [
            'score'  => (float)$e['score'] + $pts,
            'played' => (int)$e['played'] + 1,
            'wins'   => (int)$e['wins'] + ($outcome === 'win' ? 1 : 0),
            'draws'  => (int)$e['draws'] + ($outcome === 'draw' ? 1 : 0),
            'losses' => (int)$e['losses'] + ($outcome === 'loss' ? 1 : 0),
        ];
        if ($fmt === 'arena') {
            $a = tournament_arena_points($outcome, (int)$e['arenaStreak']);
            $patch['arenaPoints'] = (int)$e['arenaPoints'] + $a['points'];
            $patch['arenaStreak'] = $a['streak'];
        }
        // Knockout and the centre cup eliminate; the rest do not.
        if (in_array($fmt, ['knockout', 'centre'], true) && $outcome === 'loss') {
            $patch['status'] = 'eliminated';
            $patch['eliminatedRound'] = (int)($m['tournamentRound'] ?? 0);
        }
        db_update('tournament_entrants', $patch, ['id' => (int)$e['id']]);
    }

    /* A drawn knockout game eliminates nobody, so the round cannot close.
     * Flagged for staff, who replay it — the same rule the old engine had, and
     * still the right one for a children's competition. */
    if ($isDraw && in_array($fmt, ['knockout', 'centre'], true)) {
        db_update('match_games', ['flagged' => 1], ['matchId' => $matchId]);
    }

    trn_recalc_tiebreaks($tid);
    trn_close_round_if_done($t);
}

/**
 * Buchholz, Sonneborn-Berger and the performance rating, for everybody.
 *
 * Recomputed from the games rather than accumulated, so a corrected result or
 * a replayed game cannot leave a tiebreak that no longer matches the table it
 * is breaking. The field is small — tens, not thousands — so this is cheap and
 * being obviously correct is worth more than being incremental.
 */
/** Write each entrant's current position into `lastRank`, for the ladder's
 *  movement arrows. Called just before a draw, which is the only moment the
 *  table is about to change wholesale. */
function trn_snapshot_ranks(string $tid, string $fmt): void {
    $rows = tournament_standings_sort(
        db_all('SELECT * FROM tournament_entrants WHERE tournamentId = ?', [$tid]), $fmt);
    $rank = 0; $last = null; $i = 0;
    foreach ($rows as $r) {
        $key = [(float)$r['score'], (float)$r['tiebreak1'], (float)$r['tiebreak2']];
        if ($key !== $last) { $rank = $i + 1; $last = $key; }
        $i++;
        db_update('tournament_entrants', ['lastRank' => $rank], ['id' => (int)$r['id']]);
    }
}

function trn_recalc_tiebreaks(string $tid): void {
    $entrants = db_all('SELECT * FROM tournament_entrants WHERE tournamentId = ?', [$tid]);
    if (!$entrants) return;
    $scoreOf = []; $ratingOf = [];
    foreach ($entrants as $e) {
        $scoreOf[(string)$e['playerId']] = (float)$e['score'];
        $ratingOf[(string)$e['playerId']] = (int)$e['ratingAtEntry'];
    }

    /* Results, from the pairings rather than the matches: a bye is a pairing
     * with no match, and it must count toward played games without inventing
     * an opponent whose score could be summed. */
    $pairs = db_all("SELECT * FROM tournament_pairings WHERE tournamentId = ? AND result <> ''", [$tid]);
    $oppOf = []; $wonAgainst = [];
    foreach ($pairs as $p) {
        if ((int)$p['isBye'] === 1) continue;
        $w = (string)$p['whiteId']; $b = (string)$p['blackId'];
        $oppOf[$w][] = $b; $oppOf[$b][] = $w;
        if ((string)$p['result'] === '1-0')       { $wonAgainst[$w][] = [$b, 1.0]; $wonAgainst[$b][] = [$w, 0.0]; }
        elseif ((string)$p['result'] === '0-1')   { $wonAgainst[$b][] = [$w, 1.0]; $wonAgainst[$w][] = [$b, 0.0]; }
        else                                       { $wonAgainst[$w][] = [$b, 0.5]; $wonAgainst[$b][] = [$w, 0.5]; }
    }

    foreach ($entrants as $e) {
        $pid = (string)$e['playerId'];
        $opps = $oppOf[$pid] ?? [];
        // Buchholz: the sum of the scores of everybody you actually played.
        $buchholz = 0.0;
        foreach ($opps as $o) $buchholz += $scoreOf[$o] ?? 0.0;
        // Sonneborn-Berger: the same sum, weighted by how you did against them.
        $sb = 0.0;
        foreach (($wonAgainst[$pid] ?? []) as [$o, $got]) $sb += ($scoreOf[$o] ?? 0.0) * $got;
        // Performance: only over games actually played, byes excluded — a free
        // point against nobody is not evidence of strength.
        $oppRatings = array_values(array_filter(array_map(fn($o) => $ratingOf[$o] ?? 0, $opps)));
        $playedScore = 0.0;
        foreach (($wonAgainst[$pid] ?? []) as [, $got]) $playedScore += $got;
        $perf = tournament_performance($oppRatings, $playedScore, count($opps));

        db_update('tournament_entrants', [
            'tiebreak1' => round($buchholz, 2), 'tiebreak2' => round($sb, 2), 'performance' => $perf,
        ], ['id' => (int)$e['id']]);
    }
}

/** Close the round when every board has a result, and finish the event if the
 *  last round is done. */
function trn_close_round_if_done(array $t): void {
    $tid = (string)$t['tournamentId'];
    $round = (int)($t['round'] ?? 0);
    if ($round < 1) return;
    $openBoards = (int)(db_row("SELECT COUNT(*) c FROM match_games WHERE tournamentId = ? AND tournamentRound = ? AND status IN ('invited','active')",
                               [$tid, $round])['c'] ?? 0);
    if ($openBoards > 0) return;
    db_exec("UPDATE tournament_rounds SET status = 'complete', closedAt = ? WHERE tournamentId = ? AND round = ?",
            [now_iso(), $tid, $round]);

    $fmt = (string)($t['format'] ?? 'centre');
    $total = (int)($t['totalRounds'] ?? 0);
    $live = (int)(db_row("SELECT COUNT(*) c FROM tournament_entrants WHERE tournamentId = ? AND status = 'active' AND withdrawn = 0", [$tid])['c'] ?? 0);
    $done = ($fmt === 'knockout' && $live <= 1) || ($total > 0 && $round >= $total);
    if ($done) trn_finish($t);
}

function trn_finish(array $t): array {
    $tid = (string)$t['tournamentId'];
    $fmt = (string)($t['format'] ?? 'centre');
    trn_recalc_tiebreaks($tid);
    $rows = tournament_standings_sort(
        db_all('SELECT * FROM tournament_entrants WHERE tournamentId = ? AND withdrawn = 0', [$tid]), $fmt);
    $win = $rows ? $rows[0] : null;
    db_update('tournaments', [
        'status' => 'complete', 'stage' => 'done',
        'winnerId' => $win ? (string)$win['playerId'] : '',
        'winnerName' => $win ? (string)$win['playerName'] : '',
        'updatedAt' => now_iso(),
    ], ['tournamentId' => $tid]);
    if ($win && function_exists('community_notify')) {
        foreach ($rows as $r) {
            community_notify((string)$r['playerId'], '', 'tournament.finished',
                (string)$t['name'] . ' has finished',
                ((string)$r['playerId'] === (string)$win['playerId'])
                    ? 'You won it. ' . rtrim(rtrim(number_format((float)$r['score'], 1), '0'), '.') . ' points.'
                    : (string)$win['playerName'] . ' won. You finished on '
                      . rtrim(rtrim(number_format((float)$r['score'], 1), '0'), '.') . '.',
                false, '');
        }
    }
    return ['ok' => true, 'complete' => true,
            'winnerId' => $win ? (string)$win['playerId'] : '',
            'winnerName' => $win ? (string)$win['playerName'] : ''];
}

/* ── The standings table ──────────────────────────────────────────────── */

function tournament_standings(array $p): array {
    $tid = (string)($p['tournamentId'] ?? '');
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    $viewer = (string)($p['playerId'] ?? '');
    $fmt = (string)($t['format'] ?? 'centre');

    $rows = tournament_standings_sort(db_all('SELECT * FROM tournament_entrants WHERE tournamentId = ?', [$tid]), $fmt);
    $table = []; $pos = 0; $lastKey = null;
    foreach ($rows as $r) {
        // Shared rank for a shared score-and-tiebreak, which is how a real
        // cross-table reads: two players on 4/5 are both third.
        $key = [(float)$r['score'], (float)$r['tiebreak1'], (float)$r['tiebreak2']];
        if ($key !== $lastKey) { $pos = count($table) + 1; $lastKey = $key; }
        $table[] = [
            'rank' => $pos,
            'playerId' => (string)$r['playerId'], 'name' => (string)$r['playerName'],
            'centre' => (string)$r['centre'], 'kind' => (string)$r['playerType'],
            'seed' => (int)$r['seed'], 'rating' => (int)$r['ratingAtEntry'],
            'score' => (float)$r['score'], 'played' => (int)$r['played'],
            'wins' => (int)$r['wins'], 'draws' => (int)$r['draws'], 'losses' => (int)$r['losses'],
            'byes' => (int)$r['byes'],
            'buchholz' => (float)$r['tiebreak1'], 'sb' => (float)$r['tiebreak2'],
            'performance' => (int)$r['performance'],
            'arenaPoints' => (int)$r['arenaPoints'], 'arenaStreak' => (int)$r['arenaStreak'],
            'status' => (string)$r['status'], 'withdrawn' => (int)$r['withdrawn'] === 1,
            'isMe' => (string)$r['playerId'] === $viewer,
            'photo' => function_exists('community_photo_for') ? community_photo_for((string)$r['playerId']) : '',
        ];
    }
    return ['ok' => true, 'tournament' => trn_shape($t, $viewer), 'standings' => $table];
}

/** Every round's boards, newest first — the pairing sheet. */
function tournament_rounds(array $p): array {
    $tid = (string)($p['tournamentId'] ?? '');
    $t = db_row('SELECT * FROM tournaments WHERE tournamentId = ? LIMIT 1', [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    $viewer = (string)($p['playerId'] ?? '');

    /* Ordered by STAGE as well as round. A centre cup runs two stages and
       numbers its rounds from one in each, so grouping on the round alone put
       the centre round one and the final round one in the same bucket — two
       different sets of fixtures under one heading. */
    $pairs = db_all('SELECT * FROM tournament_pairings WHERE tournamentId = ? ORDER BY stage ASC, round DESC, board ASC', [$tid]);
    $ids = array_values(array_filter(array_map(fn($x) => (string)$x['matchId'], $pairs)));
    $states = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT matchId, status, result, winnerId, ply, whiteMs, blackMs, clockRunning, turnStartedAt, timeControl, turnPlayer, playerA, status FROM match_games WHERE matchId IN ($in)", $ids) as $m) {
            $states[(string)$m['matchId']] = $m;
        }
    }
    $rounds = [];
    foreach ($pairs as $p2) {
        $stage = (string)($p2['stage'] ?? '');
        $r = ($stage === '' ? '' : $stage . ':') . (int)$p2['round'];
        $m = $states[(string)$p2['matchId']] ?? null;
        $rounds[$r][] = [
            'board' => (int)$p2['board'], 'centre' => (string)$p2['centre'],
            'white' => ['id' => (string)$p2['whiteId'], 'name' => (string)$p2['whiteName']],
            'black' => ['id' => (string)$p2['blackId'], 'name' => (string)$p2['blackName']],
            'matchId' => (string)$p2['matchId'], 'isBye' => (int)$p2['isBye'] === 1,
            'result' => (string)$p2['result'],
            'status' => $m ? (string)$m['status'] : ((int)$p2['isBye'] === 1 ? 'bye' : ''),
            'ply' => $m ? (int)$m['ply'] : 0,
            'clock' => ($m && function_exists('chess_clock_state')) ? chess_clock_state($m) : null,
            'isMine' => $viewer !== '' && ((string)$p2['whiteId'] === $viewer || (string)$p2['blackId'] === $viewer),
        ];
    }
    krsort($rounds);
    $out = [];
    foreach ($rounds as $key => $boards) {
        $bits = explode(':', (string)$key);
        $stage = count($bits) > 1 ? $bits[0] : '';
        $n = (int)end($bits);
        $out[] = [
            'round' => $n,
            'stage' => $stage,
            // What a heading should say. A centre cup needs to name its stage
            // — "Centre round 2" and "Final round 2" are different fixtures.
            'label' => $stage === '' ? 'Round ' . $n : ucfirst($stage) . ' round ' . $n,
            'boards' => $boards,
        ];
    }
    return ['ok' => true, 'tournament' => trn_shape($t, $viewer), 'rounds' => $out];
}

/* ── The ladder ───────────────────────────────────────────────────────────
 *
 * The tournaments list answers "what is on". The ladder answers the question
 * a member actually opens the app with: "what is happening RIGHT NOW, and
 * where am I in it".
 *
 * WHAT MAKES A TOURNAMENT HOT. Not size, and not how recently it was created —
 * either of those makes the same event top the list for a fortnight while
 * nothing happens in it. Hot is measured in moves: boards in play now, and
 * moves played in the last few hours. An arena at a Saturday session outranks
 * a term-long Swiss with sixty entrants and one game a week, which is the
 * right answer for a child deciding where to look.
 *
 * WHY MOVEMENT IS THE POINT. A table of positions is a fact; a table of
 * positions with "up two since this morning" beside them is a reason to come
 * back. The delta is computed against a snapshot rather than guessed: every
 * entrant row already carries the rank it held at the last draw, so the
 * comparison is against something that actually happened.
 */

const LADDER_HOT_WINDOW_HOURS = 6;

/** Moves played in a tournament's games inside the window, and boards live. */
function ladder_heat(string $tid, string $since): array {
    $row = db_row(
        "SELECT COUNT(*) moves FROM match_moves mv
           JOIN match_games g ON g.matchId = mv.matchId
          WHERE g.tournamentId = ? AND mv.createdAt >= ?", [$tid, $since]);
    $live = db_row(
        "SELECT COUNT(*) n FROM match_games WHERE tournamentId = ? AND status = 'active'", [$tid]);
    $players = db_row(
        "SELECT COUNT(DISTINCT mv.playerId) n FROM match_moves mv
           JOIN match_games g ON g.matchId = mv.matchId
          WHERE g.tournamentId = ? AND mv.createdAt >= ?", [$tid, $since]);
    return [
        'moves' => (int)($row['moves'] ?? 0),
        'live' => (int)($live['n'] ?? 0),
        'players' => (int)($players['n'] ?? 0),
    ];
}

/**
 * The ladder: the events with something happening in them, each with its top
 * of the table and where the viewer sits.
 */
function tournament_ladder(array $p): array {
    $me = match_person((string)($p['playerId'] ?? ''));
    if (!$me) return ['ok' => false, 'error' => 'not_a_player'];
    $viewer = (string)$me['id'];
    $since = gmdate('Y-m-d H:i:s', time() - LADDER_HOT_WINDOW_HOURS * 3600);

    /* Running and open events only. A finished tournament has a result page,
     * not a ladder — nothing is going to move on it again. */
    $rows = db_all("SELECT * FROM tournaments WHERE game = 'chess' AND status IN ('running','open')
                    ORDER BY updatedAt DESC LIMIT 24");
    $out = [];
    foreach ($rows as $t) {
        $tid = (string)$t['tournamentId'];
        /* No visibility filter, deliberately: tournament_browse() shows every
         * event to everybody and eligibility is checked when somebody tries to
         * ENTER. Two different answers to "can I see this" would be a bug
         * waiting to happen, and seeing an event you cannot enter is how a
         * child finds out the club runs one for their centre. */
        $heat = ladder_heat($tid, $since);
        /* The score. Live boards dominate deliberately: a game being played
         * this minute is the thing worth showing somebody now, and the move
         * count is what separates two events that both have one board up. */
        $score = $heat['live'] * 100 + $heat['moves'] * 2 + $heat['players'] * 5;
        if ((string)$t['status'] === 'open') $score += 20;   // enterable is worth something

        $ent = tournament_standings_sort(
            db_all('SELECT * FROM tournament_entrants WHERE tournamentId = ?', [$tid]),
            (string)($t['format'] ?? 'centre'));
        if (!$ent) continue;

        $top = []; $mine = null; $rank = 0; $lastKey = null; $i = 0;
        foreach ($ent as $r) {
            $key = [(float)$r['score'], (float)$r['tiebreak1'], (float)$r['tiebreak2']];
            if ($key !== $lastKey) { $rank = $i + 1; $lastKey = $key; }
            $i++;
            /* Movement since the last draw. `lastRank` is written when a round
             * is paired, so this compares against a position that existed
             * rather than against a number invented for the arrow. */
            $was = (int)($r['lastRank'] ?? 0);
            $entry = [
                'rank' => $rank, 'move' => $was > 0 ? $was - $rank : 0,
                'playerId' => (string)$r['playerId'], 'name' => (string)$r['playerName'],
                'centre' => (string)$r['centre'], 'kind' => (string)$r['playerType'],
                'score' => (float)$r['score'], 'played' => (int)$r['played'],
                'streak' => (int)($r['arenaStreak'] ?? 0),
                'status' => (string)$r['status'],
                'isMe' => (string)$r['playerId'] === $viewer,
                'photo' => function_exists('community_photo_for') ? community_photo_for((string)$r['playerId']) : '',
            ];
            if ($i <= 5) $top[] = $entry;
            if ($entry['isMe']) $mine = $entry;
        }

        $out[] = [
            'tournament' => trn_shape($t, $viewer),
            'heat' => $heat + ['score' => $score],
            'top' => $top,
            'me' => $mine,
            'entrants' => count($ent),
        ];
    }

    usort($out, fn($a, $b) => $b['heat']['score'] <=> $a['heat']['score']);
    /* Everything with a pulse first, then everything else — but the whole list
     * is returned, because "nothing is hot today" is a real answer and an
     * empty screen is not. */
    $hot = array_values(array_filter($out, fn($x) => $x['heat']['score'] >= 20));
    return ['ok' => true, 'ladders' => array_slice($out, 0, 8),
            'hotCount' => count($hot), 'windowHours' => LADDER_HOT_WINDOW_HOURS];
}
