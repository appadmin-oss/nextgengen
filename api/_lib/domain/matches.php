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
 *   Staff-visible by default. Every match at a centre is readable by the
 *   mentors and admins who cover that centre, including the full move list.
 *   Nothing here is private between two children.
 *
 *   Same centre, same programme. You can only be matched with someone your
 *   own staff already supervise, which is what makes "staff-visible" mean
 *   anything — there is always a named adult responsible for both players.
 *
 *   Reportable. Either player, or any staff member, can flag a match; a
 *   flagged match surfaces in the console.
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
function match_person(string $id): ?array {
    $m = db_row("SELECT memberId id, fullName, centre, 'member' kind, type FROM members WHERE memberId = ? AND status = 'active' LIMIT 1", [$id]);
    if ($m) { $m['programme'] = ((string)($m['type'] ?? '') === 'Summer') ? 'summer' : 'ngg'; unset($m['type']); return $m; }
    $s = db_row("SELECT studentId id, fullName, centre, 'student' kind FROM summer_students WHERE studentId = ? AND status = 'active' LIMIT 1", [$id]);
    if ($s) { $s['programme'] = 'summer'; return $s; }
    return null;
}

/** Public shape of a match for one viewer. `youAre` orients the board. */
function match_public(array $r, string $viewer, bool $staff = false): array {
    $isA = (string)$r['playerA'] === $viewer;
    return [
        'matchId'   => (string)$r['matchId'],
        'game'      => (string)$r['game'],
        'status'    => (string)$r['status'],
        'centre'    => (string)($r['centre'] ?? ''),
        'programme' => (string)($r['programme'] ?? ''),
        'you'       => $staff && !$isA && (string)$r['playerB'] !== $viewer ? '' : ($isA ? 'A' : 'B'),
        'players'   => [
            'A' => ['id' => (string)$r['playerA'], 'name' => (string)$r['playerAName']],
            'B' => ['id' => (string)$r['playerB'], 'name' => (string)$r['playerBName']],
        ],
        // Chess: A is always white. Stated rather than inferred, because the
        // board has to be drawn from one player's side.
        'yourColour' => $r['game'] === 'chess' ? ($isA ? 'w' : 'b') : '',
        'turnPlayer' => (string)($r['turnPlayer'] ?? ''),
        'yourTurn'   => (string)($r['turnPlayer'] ?? '') === $viewer,
        'state'      => (string)($r['state'] ?? ''),
        'ply'        => (int)($r['ply'] ?? 0),
        'result'     => (string)($r['result'] ?? ''),
        'winnerId'   => (string)($r['winnerId'] ?? ''),
        'reason'     => (string)($r['reason'] ?? ''),
        'flagged'    => (int)($r['flagged'] ?? 0) === 1,
        'tournamentId' => (string)($r['tournamentId'] ?? ''),
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

    /* Same centre and same programme. This is the safeguarding boundary, not a
     * convenience: it guarantees one set of staff already supervises both
     * children, which is what makes every other protection here enforceable. */
    if (trim((string)$me['centre']) === '' || $me['centre'] !== $them['centre']) return ['ok' => false, 'error' => 'different_centre'];
    if ($me['programme'] !== $them['programme']) return ['ok' => false, 'error' => 'different_programme'];

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
        'createdAt' => $now, 'updatedAt' => $now,
    ]);
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
    if ((string)$r['turnPlayer'] !== $viewer) return ['ok' => false, 'error' => 'not_your_turn'];
    if ((string)$r['game'] !== 'chess') return ['ok' => false, 'error' => 'bad_game'];

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

    db_insert('match_moves', ['matchId' => (string)$r['matchId'], 'ply' => $ply, 'playerId' => $viewer,
        'move' => (string)$res['uci'], 'san' => (string)$res['san'], 'stateAfter' => (string)$res['fen'], 'createdAt' => $now]);
    db_update('match_games', $patch, ['matchId' => (string)$r['matchId']]);

    if (($patch['status'] ?? '') === 'complete' && function_exists('match_tournament_report')) {
        match_tournament_report((string)$r['matchId']);
    }

    return ['ok' => true, 'san' => (string)$res['san'], 'state' => (string)$res['fen'],
            'status' => ($patch['status'] ?? (string)$r['status']),
            'gameState' => (string)$status['state'], 'reason' => (string)$status['reason'],
            'winnerId' => (string)($patch['winnerId'] ?? ''), 'ply' => $ply];
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
    db_update('match_games', ['status' => 'complete', 'result' => 'win', 'winnerId' => $other,
        'reason' => 'resignation', 'turnPlayer' => '', 'updatedAt' => now_iso()], ['matchId' => (string)$r['matchId']]);
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
    $isPlayer = (string)$r['playerA'] === $viewer || (string)$r['playerB'] === $viewer;
    $isStaff = function_exists('mentor_gate') && !empty(mentor_gate(['requesterId' => $viewer])['ok']);
    if (!$isPlayer && !$isStaff) return ['ok' => false, 'error' => 'not_yours'];
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

    /* Who you may invite: active people at YOUR centre in YOUR programme.
     * Names only — a child picking an opponent has no business being handed a
     * contact list. */
    $opps = [];
    if ($me['programme'] === 'summer') {
        foreach (db_all("SELECT studentId id, fullName FROM summer_students WHERE status = 'active' AND centre = ? AND studentId <> ? ORDER BY fullName LIMIT 200",
                        [(string)$me['centre'], $id]) as $o) $opps[] = $o;
    } else {
        foreach (db_all("SELECT memberId id, fullName FROM members WHERE status = 'active' AND type = 'NGG' AND centre = ? AND memberId <> ? AND role = 'member' ORDER BY fullName LIMIT 200",
                        [(string)$me['centre'], $id]) as $o) $opps[] = $o;
    }
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
    $isPlayer = (string)$r['playerA'] === $viewer || (string)$r['playerB'] === $viewer;
    $staff = false;
    if (!$isPlayer) {
        $g = function_exists('mentor_gate') ? mentor_gate(['requesterId' => $viewer]) : ['ok' => false];
        // A mentor sees the matches at the centres they cover; null = everywhere.
        $staff = !empty($g['ok']) && (($g['centres'] ?? null) === null || in_array((string)$r['centre'], $g['centres'] ?? [], true));
        if (!$staff) return ['ok' => false, 'error' => 'not_yours'];
    }
    $moves = db_all('SELECT ply, playerId, move, san, createdAt FROM match_moves WHERE matchId = ? ORDER BY ply', [(string)$r['matchId']]);
    $reacts = db_all('SELECT ply, playerId, reaction, createdAt FROM match_reactions WHERE matchId = ? ORDER BY id', [(string)$r['matchId']]);
    $out = match_public($r, $viewer, $staff);
    $out['moves'] = $moves;
    $out['reactions'] = $reacts;
    $out['legal'] = ((string)$r['status'] === 'active' && (string)$r['turnPlayer'] === $viewer)
        ? chess_legal_uci((string)$r['state']) : [];
    $out['staffView'] = $staff;
    return ['ok' => true, 'match' => $out];
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
