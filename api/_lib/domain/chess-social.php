<?php
declare(strict_types=1);

/**
 * Finding a game — ratings, player search, and challenges.
 *
 * The match layer (matches.php) already plays chess correctly and safely. What
 * it could not do is the part that comes BEFORE a game: help a child find
 * somebody worth playing, agree the terms of the game out loud, and know
 * afterwards whether they are getting better.
 *
 * Design turn 6A. Three routes to a game, not one:
 *   · search a name, filtered by club, recent activity and rating band;
 *   · take an OPEN challenge that anybody posted;
 *   · play the computer, which happens entirely on the device and never
 *     touches anything in this file — a computer game is not rated, is not
 *     recorded here, and costs no data.
 *
 * The safeguarding model is unchanged and is not weakened by any of it: still
 * no free text anywhere, still publicly watchable, still reportable by any
 * viewer. A challenge carries a time control, a colour and a rated flag —
 * every one of them a fixed vocabulary, none of them a message.
 */

/* Elo, not Glicko. A club needs a number members already recognise from every
 * other chess app they have used; the rating-deviation term Glicko adds buys
 * accuracy nobody here is going to read. K falls as a player settles, so a
 * newcomer's first ten games move them quickly to roughly where they belong
 * and a settled player's rating stops jumping around. */
const CHESS_START_RATING = 1200;

function chess_k_factor(int $games, int $rating): int {
    if ($games < 10) return 40;      // provisional: get them near the truth fast
    if ($rating >= 1800) return 16;
    return 24;
}

/** A player's rating row, created at the default on first sight. */
function chess_rating_row(string $playerId): array {
    $r = db_row("SELECT * FROM chess_ratings WHERE playerId = ? LIMIT 1", [$playerId]);
    if ($r) return $r;
    return ['playerId' => $playerId, 'rating' => CHESS_START_RATING, 'games' => 0,
            'wins' => 0, 'losses' => 0, 'draws' => 0, 'peak' => CHESS_START_RATING,
            'lastPlayedAt' => '', 'updatedAt' => ''];
}

function chess_rating_of(string $playerId): int {
    return (int)chess_rating_row($playerId)['rating'];
}

/**
 * Settle a finished game: both ratings, both head-to-head counters.
 *
 * `$winnerId` empty means a draw. Called once per game, from the match layer,
 * and guarded there against being called twice — a rating applied twice is
 * indistinguishable from a rating applied once, until somebody notices their
 * number moved 64 points for one win.
 */
function chess_settle(string $aId, string $bId, string $winnerId, bool $rated = true): array {
    if ($aId === '' || $bId === '' || $aId === $bId) return ['ok' => false, 'error' => 'bad_players'];
    $now = now_iso();

    // Head-to-head is counted whether or not the game was rated: "you lead 3-2"
    // is about who has beaten whom, which a casual game is still an answer to.
    $aWon = $winnerId === $aId;
    $bWon = $winnerId === $bId;
    chess_h2h_bump($aId, $bId, $aWon ? 'w' : ($bWon ? 'l' : 'd'), $now);
    chess_h2h_bump($bId, $aId, $bWon ? 'w' : ($aWon ? 'l' : 'd'), $now);

    $a = chess_rating_row($aId);
    $b = chess_rating_row($bId);
    $ra = (int)$a['rating']; $rb = (int)$b['rating'];
    $deltaA = 0; $deltaB = 0;

    if ($rated) {
        $ea = 1 / (1 + pow(10, ($rb - $ra) / 400));
        $eb = 1 - $ea;
        $sa = $aWon ? 1.0 : ($bWon ? 0.0 : 0.5);
        $sb = 1.0 - $sa;
        $deltaA = (int)round(chess_k_factor((int)$a['games'], $ra) * ($sa - $ea));
        $deltaB = (int)round(chess_k_factor((int)$b['games'], $rb) * ($sb - $eb));
    }

    chess_rating_write($a, $ra + $deltaA, $aWon ? 'w' : ($bWon ? 'l' : 'd'), $now);
    chess_rating_write($b, $rb + $deltaB, $bWon ? 'w' : ($aWon ? 'l' : 'd'), $now);

    return ['ok' => true, 'deltaA' => $deltaA, 'deltaB' => $deltaB,
            'ratingA' => $ra + $deltaA, 'ratingB' => $rb + $deltaB];
}

function chess_rating_write(array $row, int $rating, string $outcome, string $now): void {
    // A floor, because a rating that can fall forever stops being information
    // and starts being a thing a child hides from.
    $rating = max(400, $rating);
    $patch = [
        'rating' => $rating,
        'games' => (int)$row['games'] + 1,
        'wins' => (int)$row['wins'] + ($outcome === 'w' ? 1 : 0),
        'losses' => (int)$row['losses'] + ($outcome === 'l' ? 1 : 0),
        'draws' => (int)$row['draws'] + ($outcome === 'd' ? 1 : 0),
        'peak' => max((int)$row['peak'], $rating),
        'lastPlayedAt' => $now, 'updatedAt' => $now,
    ];
    if (db_row("SELECT id FROM chess_ratings WHERE playerId = ? LIMIT 1", [(string)$row['playerId']])) {
        db_update('chess_ratings', $patch, ['playerId' => (string)$row['playerId']]);
    } else {
        db_insert('chess_ratings', $patch + ['playerId' => (string)$row['playerId']]);
    }
}

function chess_h2h_bump(string $playerId, string $opponentId, string $outcome, string $now): void {
    $pair = $playerId < $opponentId ? $playerId . '|' . $opponentId : $opponentId . '|' . $playerId;
    $row = db_row("SELECT * FROM chess_head2head WHERE playerId = ? AND opponentId = ? LIMIT 1", [$playerId, $opponentId]);
    $patch = [
        'wins' => (int)($row['wins'] ?? 0) + ($outcome === 'w' ? 1 : 0),
        'losses' => (int)($row['losses'] ?? 0) + ($outcome === 'l' ? 1 : 0),
        'draws' => (int)($row['draws'] ?? 0) + ($outcome === 'd' ? 1 : 0),
        'updatedAt' => $now,
    ];
    if ($row) db_update('chess_head2head', $patch, ['playerId' => $playerId, 'opponentId' => $opponentId]);
    else db_insert('chess_head2head', $patch + ['pairKey' => $pair, 'playerId' => $playerId, 'opponentId' => $opponentId]);
}

/** "You lead 3–2", or '' when they have never played. */
function chess_h2h_text(string $playerId, string $opponentId): string {
    $r = db_row("SELECT wins, losses, draws FROM chess_head2head WHERE playerId = ? AND opponentId = ? LIMIT 1", [$playerId, $opponentId]);
    if (!$r) return '';
    $w = (int)$r['wins']; $l = (int)$r['losses']; $d = (int)$r['draws'];
    if ($w + $l + $d === 0) return '';
    if ($w > $l) return 'You lead ' . $w . '–' . $l;
    if ($l > $w) return 'They lead ' . $l . '–' . $w;
    return 'Level ' . $w . '–' . $l;
}

/* ── Who is around ────────────────────────────────────────────────────────
 * "Online" is not a presence system. Presence would mean a socket, a heartbeat
 * and a green dot that lies whenever the connection drops — and a green dot
 * that lies is worse than no dot. This is LAST SEEN, derived from the member's
 * own recent activity, and the UI says "2h ago" rather than claiming anything
 * about right now. */
const CHESS_ONLINE_WINDOW = 900;   // 15 minutes

function chess_last_seen(string $playerId): string {
    $r = db_row("SELECT MAX(t) t FROM (
                   SELECT MAX(lastMoveAt) t FROM match_games WHERE playerA = ? OR playerB = ?
                   UNION ALL SELECT MAX(createdAt) t FROM community_posts WHERE authorId = ?
                 ) x", [$playerId, $playerId, $playerId]);
    return (string)($r['t'] ?? '');
}

function chess_is_online(string $lastSeen): bool {
    if ($lastSeen === '') return false;
    $ts = strtotime($lastSeen);
    return $ts > 0 && (time() - $ts) <= CHESS_ONLINE_WINDOW;
}

/**
 * The search screen.
 *
 * Names and centres only, plus a rating and a head-to-head line. A child
 * choosing an opponent has no business being handed a contact list, so nothing
 * else travels — the same rule match_list() already applies.
 */
/**
 * Who can I play?
 *
 * Rebuilt on directory_search(), so the four kinds of person who hold an
 * account here are one list rather than two. The old shape had a `mentors`
 * boolean that swapped the query entirely: asking for mentors hid every
 * member, and not asking hid every mentor — and since role != 'member' was
 * excluded outright, staff were invisible in both directions.
 *
 * `kinds` replaces it. Nothing is hidden by default; a filter narrows.
 */
function chess_players(array $p): array {
    $me = match_person((string)($p['playerId'] ?? ''));
    if (!$me) return ['ok' => false, 'error' => 'not_a_player'];
    $meId = (string)$me['id'];

    // Back-compat: the old boolean still works, and now means "narrow to
    // volunteers and staff" rather than "swap to a different query".
    $kinds = array_values(array_intersect((array)($p['kinds'] ?? []), DIRECTORY_KINDS));
    if (!$kinds && !empty($p['mentors'])) $kinds = ['volunteer', 'staff'];

    $r = directory_search([
        'q' => (string)($p['q'] ?? ''),
        'kinds' => $kinds,
        'centre' => !empty($p['club']) ? (string)$me['centre'] : '',
        'band' => (string)($p['band'] ?? ''),
        'online' => !empty($p['online']),
        'exclude' => [$meId],
        'limit' => 30,
    ]);

    $out = [];
    foreach ($r['people'] as $x) {
        $out[] = [
            'id' => $x['id'], 'name' => $x['name'], 'centre' => $x['centre'],
            'programme' => $x['programme'], 'kind' => $x['kind'], 'role' => $x['role'],
            // Kept for the existing client, which badges a coach.
            'mentor' => in_array($x['kind'], ['volunteer', 'staff'], true),
            'rating' => $x['rating'], 'online' => $x['online'], 'lastSeen' => $x['lastSeen'],
            'photo' => $x['photo'],
            'headToHead' => chess_h2h_text($meId, $x['id']),
        ];
    }
    // Somebody who is around, and near your strength, first — that is the
    // order the question "who can I play right now" is actually asked in.
    $myRating = chess_rating_of($meId);
    usort($out, function ($a, $b) use ($myRating) {
        if ($a['online'] !== $b['online']) return $a['online'] ? -1 : 1;
        return abs($a['rating'] - $myRating) <=> abs($b['rating'] - $myRating);
    });
    return ['ok' => true, 'players' => $out, 'kinds' => DIRECTORY_KINDS,
            'me' => ['id' => $meId, 'rating' => $myRating,
                     'centre' => (string)$me['centre'], 'name' => (string)$me['fullName']]];
}

/* ── Challenges ───────────────────────────────────────────────────────────
 * A challenge is not yet a game. Its terms are agreed BEFORE a board exists,
 * which is the whole point of the sheet in the design: time control, colour,
 * rated or not, and whether the club may watch — all stated, none assumed.
 *
 * Everything expires. An unanswered invitation used to sit in a child's list
 * forever, which turns the list into a place nobody looks. */
/* The vocabulary lives in chess-clock.php now, so the list a challenge sheet
   offers and the list the clock knows how to run cannot drift apart. */
const CHESS_TIME_CONTROLS = ['3+2', '5+3', '10+0', '15+10', '1day'];
const CHESS_CHALLENGE_TTL = 86400;   // 24 hours, as the sheet promises

function chess_challenge_shape(array $r, string $viewer): array {
    return [
        'challengeId' => (string)$r['challengeId'],
        'from' => ['id' => (string)$r['fromId'], 'name' => (string)$r['fromName'],
                   'rating' => chess_rating_of((string)$r['fromId']),
                   'isMe' => (string)$r['fromId'] === $viewer],
        'to' => ['id' => (string)$r['toId'], 'name' => (string)$r['toName'],
                 'isMe' => (string)$r['toId'] === $viewer],
        'open' => (string)$r['toId'] === '',
        'timeControl' => (string)$r['timeControl'],
        'colourPref' => (string)$r['colourPref'],
        'rated' => (int)$r['rated'] === 1,
        'channelSlug' => (string)$r['channelSlug'],
        'status' => (string)$r['status'],
        'matchId' => (string)($r['matchId'] ?? ''),
        'createdAt' => (string)$r['createdAt'],
        'expiresAt' => (string)$r['expiresAt'],
    ];
}

/** Sweep anything past its 24 hours. Cheap, and runs on every read. */
function chess_challenges_expire(): void {
    db_exec("UPDATE chess_challenges SET status = 'expired'
              WHERE status = 'open' AND expiresAt <> '' AND expiresAt < ?", [now_iso()]);
}

function chess_challenge_create(array $p): array {
    $me = match_person((string)($p['playerId'] ?? ''));
    if (!$me) return ['ok' => false, 'error' => 'not_a_player'];
    $meId = (string)$me['id'];

    $tc = (string)($p['timeControl'] ?? '1day');
    if (!in_array($tc, CHESS_TIME_CONTROLS, true)) return ['ok' => false, 'error' => 'bad_time_control'];
    $colour = (string)($p['colourPref'] ?? 'random');
    if (!in_array($colour, ['white', 'black', 'random'], true)) return ['ok' => false, 'error' => 'bad_colour'];

    $toId = trim((string)($p['opponentId'] ?? ''));
    $toName = '';
    if ($toId !== '') {
        $them = match_person($toId);
        if (!$them) return ['ok' => false, 'error' => 'opponent_not_found'];
        if ($toId === $meId) return ['ok' => false, 'error' => 'cannot_play_yourself'];
        $toName = (string)$them['fullName'];
        // One live challenge per pair, and one live game per pair. Without both,
        // "challenge" is a spam button pointed at another child.
        if (db_row("SELECT challengeId FROM chess_challenges WHERE status = 'open' AND fromId = ? AND toId = ? LIMIT 1", [$meId, $toId])) {
            return ['ok' => false, 'error' => 'already_challenged'];
        }
        if (db_row("SELECT matchId FROM match_games WHERE game = 'chess' AND status IN ('invited','active')
                    AND ((playerA = ? AND playerB = ?) OR (playerA = ? AND playerB = ?)) LIMIT 1",
                   [$meId, $toId, $toId, $meId])) {
            return ['ok' => false, 'error' => 'already_playing'];
        }
    } else {
        // An open challenge is a standing offer, so one at a time per player.
        if (db_row("SELECT challengeId FROM chess_challenges WHERE status = 'open' AND fromId = ? AND toId = '' LIMIT 1", [$meId])) {
            return ['ok' => false, 'error' => 'already_open'];
        }
    }

    $id = 'CH-' . strtoupper(rand_hex(8));
    $now = now_iso();
    db_insert('chess_challenges', [
        'challengeId' => $id, 'fromId' => $meId, 'fromName' => (string)$me['fullName'],
        'toId' => $toId, 'toName' => $toName,
        'timeControl' => $tc, 'colourPref' => $colour,
        'rated' => !empty($p['rated']) ? 1 : 0,
        'channelSlug' => (string)($p['channelSlug'] ?? ''),
        'status' => 'open', 'createdAt' => $now,
        'expiresAt' => date('Y-m-d H:i:s', time() + CHESS_CHALLENGE_TTL),
    ]);

    if ($toId !== '' && function_exists('community_notify')) {
        community_notify($toId, $meId, 'chess.challenge', $me['fullName'] . ' challenged you to chess',
            chess_terms_line($tc, $colour, !empty($p['rated'])), true, '');
    }
    return ['ok' => true, 'challengeId' => $id, 'expiresAt' => date('Y-m-d H:i:s', time() + CHESS_CHALLENGE_TTL)];
}

/** The terms, in one line of plain words. Used in the notification, so a child
 *  can decide without opening anything. */
function chess_terms_line(string $tc, string $colour, bool $rated): string {
    $names = ['3+2' => '3+2 blitz', '5+3' => '5+3 blitz', '10+0' => '10 minute rapid', '1day' => 'a daily game'];
    $col = $colour === 'random' ? 'colours drawn' : ('they play ' . $colour);
    return ($names[$tc] ?? $tc) . ' · ' . $col . ' · ' . ($rated ? 'rated' : 'casual');
}

/** Everything this player could act on: challenges to them, and open ones. */
function chess_challenges_list(array $p): array {
    chess_challenges_expire();
    $viewer = (string)($p['playerId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'not_a_player'];
    $mine = db_all("SELECT * FROM chess_challenges WHERE status = 'open' AND toId = ? ORDER BY createdAt DESC LIMIT 20", [$viewer]);
    $sent = db_all("SELECT * FROM chess_challenges WHERE status = 'open' AND fromId = ? ORDER BY createdAt DESC LIMIT 20", [$viewer]);
    $open = db_all("SELECT * FROM chess_challenges WHERE status = 'open' AND toId = '' AND fromId <> ? ORDER BY createdAt DESC LIMIT 20", [$viewer]);
    return ['ok' => true,
            'toYou' => array_map(fn($r) => chess_challenge_shape($r, $viewer), $mine),
            'fromYou' => array_map(fn($r) => chess_challenge_shape($r, $viewer), $sent),
            'open' => array_map(fn($r) => chess_challenge_shape($r, $viewer), $open),
            'timeControls' => CHESS_TIME_CONTROLS,
            'clockOptions' => chess_clock_options()];
}

/**
 * Accept, decline, or withdraw.
 *
 * Accepting is the moment a challenge becomes a game, and it is the only place
 * the agreed terms are turned into a board: colour decides who is player A
 * (white), and the time control and rated flag ride along on the match so the
 * result can be settled by the same rules both players saw before they started.
 */
function chess_challenge_respond(array $p): array {
    chess_challenges_expire();
    $viewer = (string)($p['playerId'] ?? '');
    $act = (string)($p['action'] ?? 'accept');
    $r = db_row("SELECT * FROM chess_challenges WHERE challengeId = ? LIMIT 1", [(string)($p['challengeId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['status'] !== 'open') return ['ok' => false, 'error' => 'not_open'];

    $now = now_iso();
    if ($act === 'withdraw') {
        if ((string)$r['fromId'] !== $viewer) return ['ok' => false, 'error' => 'not_yours'];
        db_update('chess_challenges', ['status' => 'withdrawn'], ['challengeId' => (string)$r['challengeId']]);
        return ['ok' => true, 'status' => 'withdrawn'];
    }
    // A directed challenge may only be answered by the person it names; an open
    // one by anybody except its author.
    $directed = (string)$r['toId'] !== '';
    if ($directed && (string)$r['toId'] !== $viewer) return ['ok' => false, 'error' => 'not_yours'];
    if (!$directed && (string)$r['fromId'] === $viewer) return ['ok' => false, 'error' => 'cannot_play_yourself'];

    if ($act === 'decline') {
        db_update('chess_challenges', ['status' => 'declined'], ['challengeId' => (string)$r['challengeId']]);
        return ['ok' => true, 'status' => 'declined'];
    }

    $them = match_person($viewer);
    $from = match_person((string)$r['fromId']);
    if (!$them || !$from) return ['ok' => false, 'error' => 'not_a_player'];

    /* Colour. The challenger states a preference and the acceptor gets the
     * other side; "random" is drawn HERE, on the server, because a coin flip
     * the client tosses is a coin flip one player owns. */
    $pref = (string)$r['colourPref'];
    if ($pref === 'random') $pref = random_int(0, 1) ? 'white' : 'black';
    $whiteId = $pref === 'white' ? (string)$r['fromId'] : $viewer;
    $white = $whiteId === (string)$r['fromId'] ? $from : $them;
    $black = $whiteId === (string)$r['fromId'] ? $them : $from;

    $matchId = 'MT-' . strtoupper(rand_hex(9));
    db_tx(function () use ($matchId, $white, $black, $r, $now) {
        db_insert('match_games', [
            'matchId' => $matchId, 'game' => 'chess', 'status' => 'active',
            'programme' => (string)$white['programme'], 'centre' => (string)$white['centre'],
            'playerA' => (string)$white['id'], 'playerAName' => (string)$white['fullName'], 'playerAType' => (string)$white['kind'],
            'playerB' => (string)$black['id'], 'playerBName' => (string)$black['fullName'], 'playerBType' => (string)$black['kind'],
            // Agreed before the board existed, and carried with it so the result
            // is settled by the terms both players actually saw.
            'timeControl' => (string)$r['timeControl'], 'rated' => (int)$r['rated'],
            'channelSlug' => (string)$r['channelSlug'],
            'turnPlayer' => (string)$white['id'], 'state' => CHESS_START_FEN, 'ply' => 0,
            'createdAt' => $now, 'updatedAt' => $now,
        ] + chess_clock_init((string)$r['timeControl']));
        // A challenge game opens ACTIVE, so the clock starts with it.
        db_update('match_games', ['clockRunning' => chess_clock_is_live((string)$r['timeControl']) ? 1 : 0,
                                  'turnStartedAt' => $now], ['matchId' => $matchId]);
        db_update('chess_challenges', ['status' => 'accepted', 'matchId' => $matchId], ['challengeId' => (string)$r['challengeId']]);
    });

    if (function_exists('community_notify')) {
        community_notify((string)$r['fromId'], $viewer, 'chess.accepted',
            $them['fullName'] . ' took your challenge', 'The game is on — it is ' .
            ($whiteId === (string)$r['fromId'] ? 'your move' : 'their move') . '.', true, '');
    }
    return ['ok' => true, 'status' => 'accepted', 'matchId' => $matchId,
            'yourColour' => $whiteId === $viewer ? 'w' : 'b'];
}

/** A player's own chess standing — the header of the lobby. */
function chess_profile(array $p): array {
    $viewer = (string)($p['playerId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'not_a_player'];
    $r = chess_rating_row($viewer);
    /* "+32 this week" is the number that makes a rating worth looking at, and
     * it is derived from the games rather than stored: a stored weekly delta is
     * a second copy of the truth that goes stale the moment a week rolls. */
    $weekAgo = date('Y-m-d H:i:s', time() - 7 * 86400);
    $delta = (int)(db_row("SELECT COALESCE(SUM(ratingDelta), 0) d FROM match_games
                            WHERE game = 'chess' AND status = 'complete' AND rated = 1 AND updatedAt >= ?
                              AND (playerA = ? OR playerB = ?)", [$weekAgo, $viewer, $viewer])['d'] ?? 0);
    return ['ok' => true, 'rating' => (int)$r['rating'], 'games' => (int)$r['games'],
            'wins' => (int)$r['wins'], 'losses' => (int)$r['losses'], 'draws' => (int)$r['draws'],
            'peak' => (int)$r['peak'], 'weekDelta' => $delta,
            'provisional' => (int)$r['games'] < 10,
            'levels' => chess_level_table((int)$r['rating'])];
}

/**
 * The eight computer levels, as the client will show them.
 *
 * Served rather than hardcoded on the client for one reason: the "about your
 * rating" line has to be about THIS member's rating, and the level sheet's
 * whole job is to point them at the right rung of the ladder.
 */
function chess_level_table(int $myRating): array {
    $levels = [
        [1, 600,  'Plays the first thing it likes. Good for learning how the pieces move.'],
        [2, 750,  'Takes what you leave hanging, and not much else.'],
        [3, 950,  'Sees one move ahead properly. It will trade if you let it.'],
        [4, 1250, 'Punishes loose pieces, misses long tactics.'],
        [5, 1450, 'Two moves ahead and rarely gives anything away.'],
        [6, 1600, 'Finds short tactics. You will need a plan.'],
        [7, 1750, 'Calculates. Loose play gets punished immediately.'],
        [8, 1900, 'No mistakes on purpose. Brutal.'],
    ];
    $best = 1; $bestGap = PHP_INT_MAX;
    foreach ($levels as [$n, $rating, $_]) {
        $gap = abs($rating - $myRating);
        if ($gap < $bestGap) { $bestGap = $gap; $best = $n; }
    }
    return array_map(fn($l) => ['level' => $l[0], 'rating' => $l[1], 'blurb' => $l[2],
                                'suggested' => $l[0] === $best], $levels);
}

/* ── The player directory ─────────────────────────────────────────────────
 *
 * One search across everybody who can sit at a board: NGG members, summer
 * students, the Volunteer Vanguard, and staff. Before this there were two
 * half-directories — chess_players() with an either/or "mentors" toggle that
 * hid every member the moment you looked for a coach, and the tournament
 * entry screen which called admin.members.list() and so could only ever see
 * members and students. A volunteer could be found in one and not entered in
 * the other.
 *
 * Everything a caller filters on is a fixed vocabulary. There is no free text
 * in the result beyond a name that was already on file.
 */

const DIRECTORY_KINDS = ['member', 'student', 'volunteer', 'staff'];

/**
 * Search the directory.
 *
 *   q        name fragment
 *   kinds    array of DIRECTORY_KINDS; empty = all four
 *   centre   exact centre name, '' = every centre
 *   band     "1100-1400" rating band, '' = any
 *   online   only people seen in the last few minutes
 *   exclude  playerIds to leave out (already entered, or yourself)
 *
 * Ordered by rating descending, which is the order a tournament director
 * reads a list of possible entrants in.
 */
function directory_search(array $p): array {
    $q       = trim((string)($p['q'] ?? ''));
    $kinds   = array_values(array_intersect((array)($p['kinds'] ?? []), DIRECTORY_KINDS));
    if (!$kinds) $kinds = DIRECTORY_KINDS;
    $centre  = trim((string)($p['centre'] ?? ''));
    $exclude = array_flip(array_map('strval', (array)($p['exclude'] ?? [])));
    $limit   = max(1, min(200, (int)($p['limit'] ?? 40)));

    $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
    $rows = [];

    /* Members and staff come from one table and are split by role, so the two
     * cannot disagree about who is who. */
    if (array_intersect(['member', 'staff'], $kinds)) {
        foreach (db_all("SELECT memberId id, fullName, centre, role, type FROM members
                          WHERE status = 'active' AND fullName LIKE ? ORDER BY fullName LIMIT 400", [$like]) as $r) {
            $role = strtolower(trim((string)($r['role'] ?? '')));
            $kind = ($role !== '' && $role !== 'member') ? 'staff' : 'member';
            if (!in_array($kind, $kinds, true)) continue;
            $rows[] = ['id' => (string)$r['id'], 'name' => (string)$r['fullName'],
                       'centre' => (string)($r['centre'] ?? ''), 'kind' => $kind, 'role' => $role ?: 'member',
                       'programme' => ((string)($r['type'] ?? '') === 'Summer') ? 'summer' : 'ngg'];
        }
    }
    if (in_array('student', $kinds, true)) {
        foreach (db_all("SELECT studentId id, fullName, centre FROM summer_students
                          WHERE status = 'active' AND fullName LIKE ? ORDER BY fullName LIMIT 400", [$like]) as $r) {
            $rows[] = ['id' => (string)$r['id'], 'name' => (string)$r['fullName'],
                       'centre' => (string)($r['centre'] ?? ''), 'kind' => 'student', 'role' => 'student',
                       'programme' => 'summer'];
        }
    }
    if (in_array('volunteer', $kinds, true)) {
        foreach (db_all("SELECT volunteerId id, fullName, COALESCE(centre,'') centre, COALESCE(role,'volunteer') role
                          FROM volunteers WHERE status = 'active' AND fullName LIKE ? ORDER BY fullName LIMIT 400", [$like]) as $r) {
            $rows[] = ['id' => (string)$r['id'], 'name' => (string)$r['fullName'],
                       'centre' => (string)($r['centre'] ?? ''), 'kind' => 'volunteer',
                       'role' => strtolower((string)$r['role']) ?: 'volunteer', 'programme' => 'ngg'];
        }
    }

    [$lo, $hi] = [0, 4000];
    $band = (string)($p['band'] ?? '');
    if (preg_match('/^(\d{3,4})\s*-\s*(\d{3,4})$/', $band, $m)) { $lo = (int)$m[1]; $hi = (int)$m[2]; }
    $onlineOnly = !empty($p['online']);

    $out = [];
    foreach ($rows as $r) {
        if (isset($exclude[$r['id']])) continue;
        if ($centre !== '' && $r['centre'] !== $centre) continue;
        $rating = function_exists('chess_rating_of') ? chess_rating_of($r['id']) : CHESS_START_RATING;
        if ($rating < $lo || $rating > $hi) continue;
        $seen = function_exists('chess_last_seen') ? chess_last_seen($r['id']) : '';
        $online = function_exists('chess_is_online') ? chess_is_online($seen) : false;
        if ($onlineOnly && !$online) continue;
        $r['rating'] = $rating;
        $r['online'] = $online;
        $r['lastSeen'] = $seen;
        $r['photo'] = function_exists('community_photo_for') ? community_photo_for($r['id']) : '';
        $out[] = $r;
    }
    /* De-dupe on id. A person can only be in one table, but an id collision
     * between tables would otherwise show them twice with two ratings. */
    $seenIds = []; $uniq = [];
    foreach ($out as $r) { if (isset($seenIds[$r['id']])) continue; $seenIds[$r['id']] = 1; $uniq[] = $r; }
    usort($uniq, fn($a, $b) => [$b['rating'], $a['name']] <=> [$a['rating'], $b['name']]);

    return ['ok' => true, 'people' => array_slice($uniq, 0, $limit), 'total' => count($uniq),
            'kinds' => DIRECTORY_KINDS];
}

/** Every centre that has at least one person in it — for the filter menus. */
function directory_centres(): array {
    $set = [];
    foreach (["SELECT DISTINCT centre c FROM members WHERE status='active' AND centre <> ''",
              "SELECT DISTINCT centre c FROM summer_students WHERE status='active' AND centre <> ''",
              "SELECT DISTINCT centre c FROM volunteers WHERE status='active' AND centre <> ''"] as $sql) {
        foreach (db_all($sql) as $r) { $c = trim((string)$r['c']); if ($c !== '') $set[$c] = 1; }
    }
    $out = array_keys($set); sort($out);
    return $out;
}
