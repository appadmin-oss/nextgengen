<?php
declare(strict_types=1);

/**
 * Turn-based matches between two players.
 *
 * The Arcade was single-player: you played a round alone and your score went
 * on a board. This is the other half — two children playing each other, a move
 * at a time, over hours or days, the way iMessage games work. Nobody has to be
 * online at the same moment; you move, they get a turn, you come back later.
 *
 * SAFEGUARDING IS THE ARCHITECTURE, NOT A SETTING.
 *
 * These are minors playing minors, so the design removes the risks rather than
 * moderating them after the fact:
 *
 *   No free text. There is no message column in any of the three tables. The
 *   only thing a player can send their opponent is one of MATCH_REACTIONS —
 *   a fixed list. You cannot moderate a chat that cannot be written, and a
 *   grooming risk that has nowhere to be typed does not need detecting.
 *
 *   Public by default. Any signed-in member can watch any game, including the
 *   full move list — and so can staff. A game a hundred people could be
 *   watching is a safer game than a private one: there is no quiet corner to
 *   be in. Watching is strictly read-only.
 *
 *   Anyone plays anyone. Pairing is not restricted by centre or programme.
 *   The protections above do not depend on who is playing whom, which is what
 *   makes opening it up safe: there is no free-text field to type into
 *   whoever the opponent turns out to be.
 *
 *   Reportable by ANY viewer, not only the players and staff. More eyes on a
 *   game is only worth something if any of them can raise a hand.
 *
 * SERVER-AUTHORITATIVE, like the rest of the Arcade. The server holds the
 * position, decides whose turn it is, and validates every move through the
 * rules engine. The client cannot post a result.
 */

/** The whole vocabulary. No free text — this list IS the chat. */
const MATCH_REACTIONS = ['good-game', 'nice-move', 'thinking', 'oops', 'well-played', 'your-turn'];

/** Games playable as a two-player match. */
function match_games(): array {
    return [
        'chess' => [
            'key' => 'chess', 'name' => 'Chess', 'icon' => '♟️',
            'blurb' => 'The full game, properly refereed. Take your time — your opponent has days, not seconds.',
            'minPly' => 2,
        ],
    ];
}

function match_game(string $key): ?array { return match_games()[$key] ?? null; }

/** Opening state for a game. Chess stores a FEN; anything else stores JSON. */
function match_initial_state(string $game): string {
    return $game === 'chess' ? CHESS_START_FEN : '{}';
}

/* ── Who a player is ──────────────────────────────────────────────────────
 * A player is a club member or a summer student. Both are looked up the same
 * way so the rest of the file never has to care which. */
/**
 * Resolve anybody who is allowed to play a game.
 *
 * Four kinds of person hold an account here and all four turn up at a board:
 * NGG members, summer students, the Volunteer Vanguard (instructors, mentors,
 * coordinators) and staff/admins — who are members carrying a role.
 *
 * This used to resolve members and students only. The consequence was quiet
 * and complete: chess_players() offers a "mentors" tab that searches
 * `volunteers`, so a child could find their coach, tap Challenge, and be told
 * `opponent_not_found` — because chess_challenge_create() resolves the target
 * through here. A mentor could be searched for and never played. The same gap
 * kept every volunteer out of every tournament.
 *
 * `kind` is what they are; `role` is what they do. Both are returned, because
 * a tournament's eligibility rules are written in terms of both.
 */
function match_person(string $id): ?array {
    if ($id === '') return null;
    $m = db_row("SELECT memberId id, fullName, centre, role, 'member' kind, type FROM members WHERE memberId = ? AND status = 'active' LIMIT 1", [$id]);
    if ($m) {
        $role = strtolower(trim((string)($m['role'] ?? '')));
        $m['programme'] = ((string)($m['type'] ?? '') === 'Summer') ? 'summer' : 'ngg';
        // Staff are members with a role. Kept as their own kind so a tournament
        // can invite them, or exclude them, without guessing from a job title.
        $m['kind'] = ($role !== '' && $role !== 'member') ? 'staff' : 'member';
        $m['role'] = $role;
        unset($m['type']);
        return $m;
    }
    $s = db_row("SELECT studentId id, fullName, centre, 'student' kind FROM summer_students WHERE studentId = ? AND status = 'active' LIMIT 1", [$id]);
    if ($s) { $s['programme'] = 'summer'; $s['role'] = 'student'; return $s; }
    /* Volunteers have no `centre` column — they work across centres — so their
     * centre is the one they are assigned to, or blank. A blank centre is fine
     * for a Swiss or a knockout; only the centre-bracket format needs one, and
     * that format checks for it separately. */
    $v = db_row("SELECT volunteerId id, fullName, COALESCE(centre, '') centre, COALESCE(role, 'volunteer') role, 'volunteer' kind
                 FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$id]);
    if ($v) { $v['programme'] = 'ngg'; return $v; }
    return null;
}

/** Public shape of a match for one viewer. `youAre` orients the board. */
function match_public(array $r, string $viewer, bool $staff = false): array {
    $isA = (string)$r['playerA'] === $viewer;
    $isB = (string)$r['playerB'] === $viewer;
    /* A spectator is NEITHER player, so `you` must be empty for them. The old
     * expression fell through to 'B' for anybody who was not player A, which
     * was harmless while only players and staff could open a match and wrong
     * the moment anyone could watch — it would have drawn the board from the
     * black side and captioned it "You vs …" for a stranger. */
    $side = $isA ? 'A' : ($isB ? 'B' : '');
    return [
        'matchId'   => (string)$r['matchId'],
        'game'      => (string)$r['game'],
        'status'    => (string)$r['status'],
        'centre'    => (string)($r['centre'] ?? ''),
        'programme' => (string)($r['programme'] ?? ''),
        'you'       => $side,
        'players'   => [
            'A' => ['id' => (string)$r['playerA'], 'name' => (string)$r['playerAName']],
            'B' => ['id' => (string)$r['playerB'], 'name' => (string)$r['playerBName']],
        ],
        // Chess: A is always white. Stated rather than inferred, because the
        // board has to be drawn from one player's side.
        // A spectator has no colour; the board draws from white's side for them.
        'yourColour' => ($r['game'] === 'chess' && $side !== '') ? ($isA ? 'w' : 'b') : '',
        'turnPlayer' => (string)($r['turnPlayer'] ?? ''),
        'yourTurn'   => (string)($r['turnPlayer'] ?? '') === $viewer,
        'state'      => (string)($r['state'] ?? ''),
        'ply'        => (int)($r['ply'] ?? 0),
        'result'     => (string)($r['result'] ?? ''),
        'winnerId'   => (string)($r['winnerId'] ?? ''),
        'reason'     => (string)($r['reason'] ?? ''),
        'flagged'    => (int)($r['flagged'] ?? 0) === 1,
        // The clock, computed rather than stored: the mover's number is wound
        // down by however long they have been thinking, so what the board
        // renders and what the server would act on cannot disagree.
        'clock'      => function_exists('chess_clock_state') ? chess_clock_state($r) : null,
        'board'      => (int)($r['board'] ?? 0),
        'tournamentId' => (string)($r['tournamentId'] ?? ''),
        // The terms both players agreed before the board existed.
        'timeControl' => (string)($r['timeControl'] ?? '1day'),
        'rated'      => (int)($r['rated'] ?? 1) === 1,
        'channelSlug'=> (string)($r['channelSlug'] ?? ''),
        // The viewer's OWN rating change. `ratingDelta` is stored from white's
        // side on a row two people read, so it is flipped for black rather than
        // shown to both as the same number.
        'ratingDelta'=> $side === '' ? 0 : ($side === 'A' ? (int)($r['ratingDelta'] ?? 0) : -(int)($r['ratingDelta'] ?? 0)),
        'updatedAt'  => (string)($r['updatedAt'] ?? ''),
        'lastMoveAt' => (string)($r['lastMoveAt'] ?? ''),
    ];
}

/* ── Invite ───────────────────────────────────────────────────────────── */

function match_invite(array $p): array {
    $me = match_person((string)($p['playerId'] ?? ''));
    if (!$me) return ['ok' => false, 'error' => 'not_a_player'];
    $game = (string)($p['game'] ?? '');
    if (!match_game($game)) return ['ok' => false, 'error' => 'bad_game'];

    $them = match_person((string)($p['opponentId'] ?? ''));
    if (!$them) return ['ok' => false, 'error' => 'opponent_not_found'];
    if ($them['id'] === $me['id']) return ['ok' => false, 'error' => 'cannot_play_yourself'];

    /* Anyone may play anyone, across centres and across programmes.
     *
     * This was originally restricted to a single centre so that one set of
     * staff already supervised both children. That is no longer the model: a
     * game is public here, watchable by any member, and open watching is a
     * stronger check than a private game with a named supervisor — there is no
     * quiet corner to be in.
     *
     * The protections that actually do the work are unchanged and do not
     * depend on the pairing: there is no free-text field to type into, the
     * vocabulary is six fixed reactions, one per move, and any viewer can
     * report the game. */

    /* One live match per pair per game. Without this, "invite" is a spam
     * button pointed at another child. */
    $open = db_row("SELECT matchId FROM match_games WHERE game = ? AND status IN ('invited','active')
                    AND ((playerA = ? AND playerB = ?) OR (playerA = ? AND playerB = ?)) LIMIT 1",
                   [$game, $me['id'], $them['id'], $them['id'], $me['id']]);
    if ($open) return ['ok' => false, 'error' => 'already_playing', 'matchId' => (string)$open['matchId']];

    $now = now_iso();
    $matchId = 'MT-' . strtoupper(rand_hex(9));
    db_insert('match_games', [
        'matchId' => $matchId, 'game' => $game, 'status' => 'invited',
        'programme' => (string)$me['programme'], 'centre' => (string)$me['centre'],
        'playerA' => (string)$me['id'],   'playerAName' => (string)$me['fullName'],   'playerAType' => (string)$me['kind'],
        'playerB' => (string)$them['id'], 'playerBName' => (string)$them['fullName'], 'playerBType' => (string)$them['kind'],
        // The invited player has not accepted, so nobody is on move yet.
        'turnPlayer' => '', 'state' => match_initial_state($game), 'ply' => 0,
        'tournamentId' => (string)($p['tournamentId'] ?? ''),
        'rated' => !empty($p['rated']) ? 1 : 0,
        /* The clock is set when the game is CREATED and started when it is
         * accepted, so the terms cannot change between agreeing to a blitz
         * game and sitting down to one. */
        'createdAt' => $now, 'updatedAt' => $now,
    ] + (function_exists('chess_clock_init') && $game === 'chess'
            ? chess_clock_init((string)($p['timeControl'] ?? '1day')) : []));
    return ['ok' => true, 'matchId' => $matchId, 'status' => 'invited'];
}

/** Accept or decline an invitation. Only the invited player may answer. */
function match_respond(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['playerB'] !== $viewer) return ['ok' => false, 'error' => 'not_yours'];
    if ((string)$r['status'] !== 'invited') return ['ok' => false, 'error' => 'not_pending'];

    $accept = !empty($p['accept']);
    $now = now_iso();
    if (!$accept) {
        db_update('match_games', ['status' => 'declined', 'updatedAt' => $now], ['matchId' => (string)$r['matchId']]);
        return ['ok' => true, 'status' => 'declined'];
    }
    // A accepted-into-active match puts A on move; in chess A is white.
    db_update('match_games', ['status' => 'active', 'turnPlayer' => (string)$r['playerA'], 'updatedAt' => $now],
              ['matchId' => (string)$r['matchId']]);
    // White's clock starts the moment the game does, not on their first move.
    if (function_exists('chess_clock_start')) chess_clock_start((string)$r['matchId']);
    return ['ok' => true, 'status' => 'active'];
}

/* ── Play ─────────────────────────────────────────────────────────────── */

/**
 * Play one move.
 *
 * Everything that decides the outcome happens here, on the server: whose turn
 * it is, whether the move is legal, and whether the game has ended. A client
 * can post whatever it likes; only a legal move by the player on move changes
 * anything.
 */
function match_move(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['playerA'] !== $viewer && (string)$r['playerB'] !== $viewer) return ['ok' => false, 'error' => 'not_yours'];
    if ((string)$r['status'] !== 'active') return ['ok' => false, 'error' => 'not_active'];

    /* Has this exact move already landed?
     *
     * A move used to be identified only by its ply, so a client that sent one,
     * lost the response and retried had two bad outcomes and no way to tell
     * them apart: the retry collided with UNIQUE(matchId, ply) and surfaced as
     * a failure for a move that HAD been played, or — if the opponent had
     * replied in between — applied a second time at a new ply. On a 3G handset
     * at a centre neither is rare.
     *
     * The client names each move once. Replaying the same id returns the
     * original outcome rather than doing anything, so a retry is free and a
     * double-tap is harmless. Answered BEFORE the turn check, because by the
     * time a retry arrives it is usually the opponent's move — the honest
     * answer is "that already worked", not "not your turn".
     */
    $cmid = trim((string)($p['clientMoveId'] ?? ''));
    if ($cmid !== '') {
        $prev = db_row('SELECT * FROM match_moves WHERE matchId = ? AND clientMoveId = ? LIMIT 1',
                       [(string)$r['matchId'], $cmid]);
        if ($prev) {
            return ['ok' => true, 'replayed' => true,
                    'san' => (string)$prev['san'], 'state' => (string)$prev['stateAfter'],
                    'status' => (string)$r['status'], 'ply' => (int)$prev['ply'],
                    'gameState' => '', 'reason' => (string)($r['reason'] ?? ''),
                    'winnerId' => (string)($r['winnerId'] ?? '')];
        }
    }

    if ((string)$r['turnPlayer'] !== $viewer) return ['ok' => false, 'error' => 'not_your_turn'];
    if ((string)$r['game'] !== 'chess') return ['ok' => false, 'error' => 'bad_game'];

    /* Have they already lost on time? Checked BEFORE the move is validated, so
     * a move that arrives after the flag fell cannot be played. The board polls
     * and would normally have caught this; this is the case where it did not,
     * because the player was offline and came back to a position they could
     * still legally move in. */
    if (function_exists('chess_clock_flag_check') && chess_clock_flag_check((string)$r['matchId'])) {
        return ['ok' => false, 'error' => 'flagged', 'message' => 'Your time ran out.'];
    }

    /* Threefold repetition is a property of the GAME, not of the position, so
     * the counts are rebuilt from the move list rather than stored. */
    $counts = [];
    $startPos = chess_parse_fen(match_initial_state('chess'));
    if ($startPos) $counts[chess_repetition_key($startPos)] = 1;
    foreach (db_all('SELECT stateAfter FROM match_moves WHERE matchId = ? ORDER BY ply', [(string)$r['matchId']]) as $mv) {
        $pos = chess_parse_fen((string)$mv['stateAfter']);
        if ($pos) { $k = chess_repetition_key($pos); $counts[$k] = ($counts[$k] ?? 0) + 1; }
    }

    $res = chess_move((string)$r['state'], (string)($p['move'] ?? ''), $counts);
    if (empty($res['ok'])) return ['ok' => false, 'error' => $res['error']];

    $now = now_iso();
    $ply = (int)$r['ply'] + 1;
    $other = (string)$r['playerA'] === $viewer ? (string)$r['playerB'] : (string)$r['playerA'];
    $status = $res['status'];

    $patch = ['state' => (string)$res['fen'], 'ply' => $ply, 'updatedAt' => $now, 'lastMoveAt' => $now];
    if ($status['state'] === 'checkmate') {
        $patch += ['status' => 'complete', 'result' => 'win', 'winnerId' => $viewer, 'reason' => 'checkmate', 'turnPlayer' => ''];
    } elseif (in_array($status['state'], ['stalemate', 'draw'], true)) {
        $patch += ['status' => 'complete', 'result' => 'draw', 'winnerId' => '', 'reason' => (string)$status['reason'], 'turnPlayer' => ''];
    } else {
        $patch['turnPlayer'] = $other;
    }

    /* Charge the mover for their thinking time and add their increment.
     * Merged into the same patch as the move, so the position and the clock
     * that produced it are written together or not at all. */
    $msSpent = 0;
    if (function_exists('chess_clock_on_move')) {
        $clockPatch = chess_clock_on_move($r, ($patch['status'] ?? '') === 'complete');
        if ($clockPatch) {
            // What this move actually cost them, taken from the clock rather
            // than measured a second time — one answer, not two.
            $wasWhite = (string)$r['turnPlayer'] === (string)$r['playerA'];
            $before = (int)($wasWhite ? $r['whiteMs'] : $r['blackMs']);
            $after  = (int)($wasWhite ? $clockPatch['whiteMs'] : $clockPatch['blackMs']);
            $msSpent = max(0, $before - $after + (int)($r['incrementMs'] ?? 0));
        }
        $patch = array_merge($patch, $clockPatch);
    }

    /* The move and the position it produced are one fact. Recorded apart, an
     * interruption between them leaves a move on the record that the board
     * does not reflect — and the board is what both players are looking at.
     * The UNIQUE (matchId, ply) index already stopped two racing moves from
     * both landing; this makes the losing one leave nothing behind. */
    db_tx(function () use ($r, $ply, $viewer, $res, $now, $patch, $cmid, $msSpent) {
        db_insert('match_moves', ['matchId' => (string)$r['matchId'], 'ply' => $ply, 'playerId' => $viewer,
            'move' => (string)$res['uci'], 'san' => (string)$res['san'], 'stateAfter' => (string)$res['fen'],
            // NULL rather than '', so two moves without an id do not collide.
            'clientMoveId' => $cmid !== '' ? $cmid : null,
            'msSpent' => $msSpent,
            'createdAt' => $now]);
        db_update('match_games', $patch, ['matchId' => (string)$r['matchId']]);
    });

    if (($patch['status'] ?? '') === 'complete') {
        match_settle_chess((string)$r['matchId']);
        if (function_exists('match_tournament_report')) match_tournament_report((string)$r['matchId']);
    }

    return ['ok' => true, 'san' => (string)$res['san'], 'state' => (string)$res['fen'],
            'status' => ($patch['status'] ?? (string)$r['status']),
            'gameState' => (string)$status['state'], 'reason' => (string)$status['reason'],
            'winnerId' => (string)($patch['winnerId'] ?? ''), 'ply' => $ply];
}

/**
 * Settle a chess game's ratings, exactly once.
 *
 * Guarded on `settledAt`: a rating applied twice is indistinguishable from one
 * applied once, right up until somebody notices their number moved 64 points
 * for a single win. The delta is stored on the match so "+8" can be shown on
 * the result screen and "+32 this week" summed without a second ledger.
 */
function match_settle_chess(string $matchId): void {
    if (!function_exists('chess_settle')) return;
    $r = db_row("SELECT * FROM match_games WHERE matchId = ? LIMIT 1", [$matchId]);
    if (!$r || (string)$r['game'] !== 'chess' || (string)$r['status'] !== 'complete') return;
    if ((string)($r['settledAt'] ?? '') !== '') return;
    $res = chess_settle((string)$r['playerA'], (string)$r['playerB'], (string)($r['winnerId'] ?? ''),
                        (int)($r['rated'] ?? 1) === 1);
    if (empty($res['ok'])) return;
    // Stored from WHITE's side. Two people read this row, so it is flipped for
    // black in match_public() rather than shown to both as the same number.
    db_update('match_games', ['ratingDelta' => (int)$res['deltaA'], 'settledAt' => now_iso()], ['matchId' => $matchId]);
}

/** Resign. The only way to end a game you are losing, and it must exist —
 *  otherwise abandoned games sit on a tournament forever. */
function match_resign(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['playerA'] !== $viewer && (string)$r['playerB'] !== $viewer) return ['ok' => false, 'error' => 'not_yours'];
    if ((string)$r['status'] !== 'active') return ['ok' => false, 'error' => 'not_active'];
    $other = (string)$r['playerA'] === $viewer ? (string)$r['playerB'] : (string)$r['playerA'];
    $stop = function_exists('chess_clock_stop') ? chess_clock_stop() : [];
    db_update('match_games', array_merge($stop, ['status' => 'complete', 'result' => 'win', 'winnerId' => $other,
        'reason' => 'resignation', 'turnPlayer' => '', 'updatedAt' => now_iso()]), ['matchId' => (string)$r['matchId']]);
    match_settle_chess((string)$r['matchId']);
    if (function_exists('match_tournament_report')) match_tournament_report((string)$r['matchId']);
    return ['ok' => true, 'status' => 'complete', 'winnerId' => $other];
}

/* ── Reactions — the entire messaging surface ─────────────────────────── */

function match_react(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $reaction = (string)($p['reaction'] ?? '');
    if (!in_array($reaction, MATCH_REACTIONS, true)) return ['ok' => false, 'error' => 'bad_reaction'];
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['playerA'] !== $viewer && (string)$r['playerB'] !== $viewer) return ['ok' => false, 'error' => 'not_yours'];

    /* One reaction per player per ply. A fixed vocabulary still allows
     * flooding if it can be repeated, and being buzzed forty times is the
     * harassment this design is meant to have no room for. */
    $had = db_row('SELECT id FROM match_reactions WHERE matchId = ? AND ply = ? AND playerId = ? LIMIT 1',
                  [(string)$r['matchId'], (int)$r['ply'], $viewer]);
    if ($had) { db_update('match_reactions', ['reaction' => $reaction, 'createdAt' => now_iso()], ['id' => $had['id']]); return ['ok' => true, 'reaction' => $reaction]; }
    db_insert('match_reactions', ['matchId' => (string)$r['matchId'], 'ply' => (int)$r['ply'],
        'playerId' => $viewer, 'reaction' => $reaction, 'createdAt' => now_iso()]);
    return ['ok' => true, 'reaction' => $reaction];
}

/** Flag a match for staff. Either player, or staff themselves. */
function match_report(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    /* ANY signed-in viewer may report, not only the players and staff. Games are
     * public here, so more people can see one going wrong than can act on it —
     * and more eyes on a game is only worth something if any of them can raise
     * a hand. The reporter must be a real person, which is what this checks. */
    if (!match_person($viewer)
        && !(function_exists('mentor_gate') && !empty(mentor_gate(['requesterId' => $viewer])['ok']))) {
        return ['ok' => false, 'error' => 'not_a_player'];
    }
    db_update('match_games', ['flagged' => 1, 'updatedAt' => now_iso()], ['matchId' => (string)$r['matchId']]);
    audit('match.reported', $viewer, (string)$r['matchId'], ['game' => (string)$r['game']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Reading ──────────────────────────────────────────────────────────── */

/** A player's matches, newest activity first, plus who they could invite. */
function match_list(array $p): array {
    $me = match_person((string)($p['playerId'] ?? ''));
    if (!$me) return ['ok' => false, 'error' => 'not_a_player'];
    $id = (string)$me['id'];
    $rows = db_all("SELECT * FROM match_games WHERE playerA = ? OR playerB = ?
                    ORDER BY (status = 'active') DESC, updatedAt DESC LIMIT 60", [$id, $id]);
    $matches = array_map(fn($r) => match_public($r, $id), $rows);

    /* Who you may invite: anybody active, at any centre, in either programme.
     * The centre is carried so the list can be grouped and a child can find the
     * friend they mean — it is no longer a boundary.
     *
     * Names and centres only. A child picking an opponent still has no business
     * being handed a contact list, so nothing else travels. */
    $opps = [];
    foreach (db_all("SELECT memberId id, fullName, centre, 'ngg' programme FROM members
                     WHERE status = 'active' AND type = 'NGG' AND role = 'member' AND memberId <> ?
                     ORDER BY fullName LIMIT 300", [$id]) as $o) $opps[] = $o;
    foreach (db_all("SELECT studentId id, fullName, centre, 'summer' programme FROM summer_students
                     WHERE status = 'active' AND studentId <> ? ORDER BY fullName LIMIT 300", [$id]) as $o) $opps[] = $o;
    return ['ok' => true, 'matches' => $matches, 'opponents' => $opps,
            'games' => array_values(match_games()), 'reactions' => MATCH_REACTIONS,
            'me' => ['id' => $id, 'centre' => (string)$me['centre'], 'programme' => (string)$me['programme']]];
}

/** One match with its full move list. Readable by the two players, and by any
 *  staff member who covers the centre — nothing here is private. */
function match_get(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    /* Every read of a live game is also the flag check. This is where the
     * clock is really enforced: whoever looks first — either player, or a
     * spectator — settles a game whose time has run out, and re-reads the row
     * so nobody is ever shown a board that the server already considers over. */
    if ((string)$r['status'] === 'active' && function_exists('chess_clock_flag_check')
        && chess_clock_flag_check((string)$r['matchId'])) {
        $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)$r['matchId']]) ?: $r;
    }
    /* Anyone signed in may watch. A game here is public — that is the point of
     * open play, and a game a hundred people could be watching is a safer game
     * than a private one, because there is no quiet corner to be in.
     *
     * Watching is READ ONLY, enforced below and in every write op: a spectator
     * cannot move, resign or react. They can report, because more eyes on a
     * game is only useful if any of them can raise a hand. */
    $isPlayer = (string)$r['playerA'] === $viewer || (string)$r['playerB'] === $viewer;
    $staff = false;
    if (!$isPlayer) {
        $g = function_exists('mentor_gate') ? mentor_gate(['requesterId' => $viewer]) : ['ok' => false];
        $staff = !empty($g['ok']);
    }
    $moves = db_all('SELECT ply, playerId, move, san, createdAt FROM match_moves WHERE matchId = ? ORDER BY ply', [(string)$r['matchId']]);
    $reacts = db_all('SELECT ply, playerId, reaction, createdAt FROM match_reactions WHERE matchId = ? ORDER BY id', [(string)$r['matchId']]);
    $out = match_public($r, $viewer, $staff);
    $out['moves'] = $moves;
    $out['reactions'] = $reacts;
    $out['legal'] = ((string)$r['status'] === 'active' && (string)$r['turnPlayer'] === $viewer)
        ? chess_legal_uci((string)$r['state']) : [];
    $out['staffView'] = $staff;
    $out['spectator'] = !$isPlayer;

    /* Three facts the board cannot work out for itself, and which every chess
     * interface people have used shows them:
     *
     *   lastMove — which two squares the opponent just played. Without it you
     *     open the game and have to spot the difference against a position you
     *     saw hours ago. This is the single most-missed convention.
     *   check    — that a king is attacked, and which one. Being in check and
     *     not being told is how a child loses a game they understood.
     *   turnColour — whose move it is in the game's own terms, so the board can
     *     say it without inferring from ids.
     *
     * Derived here rather than in the browser because the server already owns
     * the position, and two implementations of "is this check" is one too many.
     */
    $last = $moves ? $moves[count($moves) - 1] : null;
    $out['lastMove'] = $last ? ['from' => substr((string)$last['move'], 0, 2), 'to' => substr((string)$last['move'], 2, 2)] : null;
    $pos = chess_parse_fen((string)$r['state']);
    $out['turnColour'] = $pos ? (string)$pos['turn'] : '';
    $out['check'] = $pos ? chess_in_check($pos) : false;
    $out['checkSquare'] = ($pos && $out['check']) ? chess_idx_to_sq(chess_king_square($pos, $pos['turn'])) : '';
    return ['ok' => true, 'match' => $out];
}


/* ── Live play ────────────────────────────────────────────────────────────
 *
 * Chess here is played BOTH ways: two children at the same screen-time move a
 * few seconds apart, and two children in different weeks move a day apart. The
 * same match supports both — nothing switches modes, the board just updates
 * faster when the other player is actually there.
 *
 * There are no WebSockets on shared hosting, so this is polling. The cost of
 * polling is what makes it work or not on a Nigerian mobile connection, so the
 * poll is deliberately TINY: no move list, no reactions, no position unless it
 * changed. The client asks "what ply are we on" every couple of seconds and
 * only fetches the real thing when the answer moves.
 */
function match_poll(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];

    /* The poll is also a flag check. It is the most frequent read of a live
     * game by a long way, so it is where a clock running out is normally
     * noticed — waiting for somebody to open the full board would mean a
     * player sat watching their opponent's clock sit at 0:00. */
    if ((string)$r['status'] === 'active' && function_exists('chess_clock_flag_check')
        && chess_clock_flag_check((string)$r['matchId'])) {
        $r = db_row('SELECT * FROM match_games WHERE matchId = ? LIMIT 1', [(string)$r['matchId']]) ?: $r;
    }

    $ply = (int)$r['ply'];
    $since = (int)($p['since'] ?? -1);
    $out = [
        'ok' => true, 'ply' => $ply, 'status' => (string)$r['status'],
        'yourTurn' => (string)$r['turnPlayer'] === $viewer,
        'changed' => $since < 0 || $since !== $ply,
        /* The clock rides on EVERY poll, not only the ones with news. A
         * countdown drawn in the browser drifts, and the tab sleeps; this is
         * the number it re-syncs to, and it is a handful of bytes. */
        'clock' => function_exists('chess_clock_state') ? chess_clock_state($r) : null,
    ];
    /* The position rides along when it changed, which saves the client a second
     * round trip on the one poll in twenty that actually has news. Everything
     * else — the move list, the reactions — is fetched by match.get, and only
     * then. */
    if ($out['changed']) {
        $out['state'] = (string)$r['state'];
        $out['result'] = (string)($r['result'] ?? '');
        $out['winnerId'] = (string)($r['winnerId'] ?? '');
        $out['reason'] = (string)($r['reason'] ?? '');
        $out['lastMoveAt'] = (string)($r['lastMoveAt'] ?? '');
    }
    return $out;
}

/**
 * Games worth watching.
 *
 * Live ones first, most recently moved at the top, because a game that moved
 * ten seconds ago is worth opening and one that moved on Tuesday is not. Any
 * signed-in member sees this — it is the front door to watching.
 */
function match_live_list(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    $rows = db_all("SELECT * FROM match_games
                    WHERE status = 'active'
                    ORDER BY (lastMoveAt <> '') DESC, lastMoveAt DESC, updatedAt DESC LIMIT 40");
    $live = [];
    foreach ($rows as $r) {
        $live[] = [
            'matchId' => (string)$r['matchId'], 'game' => (string)$r['game'],
            'a' => ['id' => (string)$r['playerA'], 'name' => (string)$r['playerAName'], 'centre' => (string)($r['centre'] ?? '')],
            'b' => ['id' => (string)$r['playerB'], 'name' => (string)$r['playerBName']],
            'ply' => (int)$r['ply'],
            'lastMoveAt' => (string)($r['lastMoveAt'] ?? ''),
            'tournamentId' => (string)($r['tournamentId'] ?? ''),
            // So the lobby can mark "this one is yours" without a second pass.
            'mine' => (string)$r['playerA'] === $viewer || (string)$r['playerB'] === $viewer,
        ];
    }
    // Recently finished, so a game that ended mid-watch is still reachable.
    $done = array_map(fn($r) => [
        'matchId' => (string)$r['matchId'],
        'a' => ['name' => (string)$r['playerAName']], 'b' => ['name' => (string)$r['playerBName']],
        'result' => (string)($r['result'] ?? ''), 'winnerId' => (string)($r['winnerId'] ?? ''),
        'reason' => (string)($r['reason'] ?? ''), 'ply' => (int)$r['ply'],
    ], db_all("SELECT * FROM match_games WHERE status = 'complete' ORDER BY updatedAt DESC LIMIT 10"));

    return ['ok' => true, 'live' => $live, 'recent' => $done];
}

/** Staff: every match at the centres this person covers. Flagged first. */
function match_staff_list(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $where = '1 = 1'; $args = [];
    $centres = $g['centres'] ?? null;
    if ($centres !== null) {
        if (!$centres) return ['ok' => true, 'matches' => [], 'total' => 0];
        $where .= ' AND centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')';
        foreach ($centres as $c) $args[] = $c;
    }
    if (!empty($p['flagged'])) $where .= ' AND flagged = 1';
    $rows = db_all("SELECT * FROM match_games WHERE $where ORDER BY flagged DESC, updatedAt DESC LIMIT 200", $args);
    $total = (int)(db_row("SELECT COUNT(*) c FROM match_games WHERE $where", $args)['c'] ?? 0);
    return ['ok' => true, 'total' => $total,
            'matches' => array_map(fn($r) => match_public($r, (string)($p['requesterId'] ?? ''), true), $rows)];
}
