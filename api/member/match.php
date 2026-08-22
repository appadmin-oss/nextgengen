<?php
/** Member: two-player, turn-based matches (chess).
 *
 *  Signed in with a member account or an ID card, exactly like the Arcade.
 *  Everything that decides a game happens in the domain layer on the server —
 *  whose turn it is, whether a move is legal, and who won. Nothing here trusts
 *  a position, a result or a move list from the client.
 *
 *  There is deliberately no action that sends text. The only thing a player can
 *  send their opponent is one of a fixed set of reactions. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'get') {
        $res = gs_call('match.get', ['playerId' => $s['mid'], 'matchId' => (string)($_GET['matchId'] ?? '')]);
    } elseif ($view === 'poll') {
        // The live tick. Deliberately tiny — see match_poll.
        $res = gs_call('match.poll', ['playerId' => $s['mid'], 'matchId' => (string)($_GET['matchId'] ?? ''),
                                      'since' => (string)($_GET['since'] ?? '-1')]);
    } elseif ($view === 'watch') {
        $res = gs_call('match.watch', ['playerId' => $s['mid']]);
    } elseif ($view === 'tournaments') {
        $res = gs_call('tournament.mine', ['playerId' => $s['mid']]);
    } elseif ($view === 'trnBrowse') {
        // Every tournament a member can see — the endpoint that did not exist,
        // which is why a created tournament reflected nowhere.
        $res = gs_call('tournament.browse', ['playerId' => $s['mid']]);
    } elseif ($view === 'trnStandings') {
        $res = gs_call('tournament.standings', ['playerId' => $s['mid'], 'tournamentId' => (string)($_GET['tournamentId'] ?? '')]);
    } elseif ($view === 'trnRounds') {
        $res = gs_call('tournament.rounds', ['playerId' => $s['mid'], 'tournamentId' => (string)($_GET['tournamentId'] ?? '')]);
    } elseif ($view === 'players') {
        // Design turn 6A — the search screen. Names, centres, ratings and a
        // head-to-head line; nothing that could be used to contact anybody.
        $res = gs_call('chess.players', ['playerId' => $s['mid'], 'q' => (string)($_GET['q'] ?? ''),
            'club' => !empty($_GET['club']), 'online' => !empty($_GET['online']),
            'band' => (string)($_GET['band'] ?? ''), 'mentors' => !empty($_GET['mentors'])]);
    } elseif ($view === 'challenges') {
        $res = gs_call('chess.challenges', ['playerId' => $s['mid']]);
    } elseif ($view === 'promo') {
        // A house promotion for this placement, or none. See promos.php on why
        // this is deliberately first-party only.
        $res = gs_call('promo.for', ['memberId' => $s['mid'], 'placement' => (string)($_GET['placement'] ?? 'chess')]);
    } elseif ($view === 'lobby') {
        // The cheap tick behind the chess screen — see chess_lobby_poll.
        $res = gs_call('chess.lobby', ['playerId' => $s['mid']]);
    } elseif ($view === 'chess') {
        $res = gs_call('chess.profile', ['playerId' => $s['mid']]);
    } elseif ($view === 'staff') {
        // A mentor or admin reviewing the matches at their centre.
        $res = gs_call('match.staff.list', ['requesterId' => $s['mid'], 'flagged' => (string)($_GET['flagged'] ?? '')]);
    } else {
        $res = gs_call('match.list', ['playerId' => $s['mid']]);
    }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'invite') {
        rate_limit_check('match.invite');
        $res = gs_call('match.invite', ['playerId' => $s['mid'], 'game' => (string)($b['game'] ?? ''),
            'opponentId' => (string)($b['opponentId'] ?? ''),
            'timeControl' => (string)($b['timeControl'] ?? '1day'),
            'variant' => (string)($b['variant'] ?? 'standard'),
            'rated' => !empty($b['rated'])]);
    } elseif ($action === 'challenge') {
        rate_limit_check('match.invite');
        $res = gs_call('chess.challenge', ['playerId' => $s['mid'],
            'opponentId' => (string)($b['opponentId'] ?? ''),
            'timeControl' => (string)($b['timeControl'] ?? '1day'),
            'colourPref' => (string)($b['colourPref'] ?? 'random'),
            'variant' => (string)($b['variant'] ?? 'standard'),
            'rated' => !empty($b['rated']),
            'channelSlug' => (string)($b['channelSlug'] ?? '')]);
    } elseif ($action === 'challengeRespond') {
        $res = gs_call('chess.respond', ['playerId' => $s['mid'],
            'challengeId' => (string)($b['challengeId'] ?? ''),
            'action' => (string)($b['answer'] ?? 'accept')]);
    } elseif ($action === 'promoTrack') {
        $res = gs_call('promo.track', ['memberId' => $s['mid'], 'promoId' => (string)($b['promoId'] ?? ''),
                                       'event' => (string)($b['event'] ?? '')]);
    } elseif ($action === 'trnJoin') {
        $res = gs_call('tournament.join', ['playerId' => $s['mid'], 'tournamentId' => (string)($b['tournamentId'] ?? ''), 'ip' => $ip]);
    } elseif ($action === 'trnLeave') {
        $res = gs_call('tournament.leave', ['playerId' => $s['mid'], 'tournamentId' => (string)($b['tournamentId'] ?? '')]);
    } elseif ($action === 'trnCreate' || $action === 'trnDraw' || $action === 'trnEnter' || $action === 'trnDirectory') {
        /* Running a tournament FROM the chess screen.
         *
         * A director is a member with a role, sitting in the club with the
         * players in front of them — asking them to leave the app, open the
         * admin console and come back is how a Saturday event gets set up
         * badly or not at all. The capability check is the same one the console
         * uses (admin_cap_gate on 'people' inside each op); this route only
         * decides WHERE the button lives, never who may press it. */
        if ($action === 'trnCreate') {
            $res = gs_call('tournament.create', [
                'requesterId' => $s['mid'], 'name' => (string)($b['name'] ?? ''),
                'game' => 'chess', 'programme' => (string)($b['programme'] ?? ''),
                'format' => (string)($b['format'] ?? 'swiss'),
                'timeControl' => (string)($b['timeControl'] ?? '10+0'),
                'variant' => (string)($b['variant'] ?? 'standard'),
                'rated' => !empty($b['rated']), 'totalRounds' => (int)($b['totalRounds'] ?? 0),
                'description' => (string)($b['description'] ?? ''),
                'kinds' => (array)($b['kinds'] ?? []), 'centres' => (array)($b['centres'] ?? []),
                'minRating' => (int)($b['minRating'] ?? 0), 'maxRating' => (int)($b['maxRating'] ?? 0),
                'ip' => $ip]);
        } elseif ($action === 'trnDraw') {
            $res = gs_call('tournament.draw', ['requesterId' => $s['mid'], 'tournamentId' => (string)($b['tournamentId'] ?? ''), 'ip' => $ip]);
        } elseif ($action === 'trnEnter') {
            $res = gs_call('tournament.enter', ['requesterId' => $s['mid'], 'tournamentId' => (string)($b['tournamentId'] ?? ''), 'playerId' => (string)($b['playerId'] ?? ''), 'ip' => $ip]);
        } else {
            $res = gs_call('tournament.directory', [
                'q' => (string)($b['q'] ?? ''), 'kinds' => (array)($b['kinds'] ?? []),
                'centre' => (string)($b['centre'] ?? ''), 'band' => (string)($b['band'] ?? ''),
                'exclude' => (array)($b['exclude'] ?? []), 'limit' => (int)($b['limit'] ?? 40)]);
        }
    } elseif ($action === 'respond') {
        $res = gs_call('match.respond', ['playerId' => $s['mid'], 'matchId' => (string)($b['matchId'] ?? ''), 'accept' => !empty($b['accept'])]);
    } elseif ($action === 'move') {
        $res = gs_call('match.move', ['playerId' => $s['mid'], 'matchId' => (string)($b['matchId'] ?? ''),
            'move' => (string)($b['move'] ?? ''),
            // Names this move once, so a retry after a lost response replays
            // the original outcome instead of failing or moving twice.
            'clientMoveId' => mb_substr((string)($b['clientMoveId'] ?? ''), 0, 40)]);
    } elseif ($action === 'resign') {
        $res = gs_call('match.resign', ['playerId' => $s['mid'], 'matchId' => (string)($b['matchId'] ?? '')]);
    } elseif ($action === 'react') {
        $res = gs_call('match.react', ['playerId' => $s['mid'], 'matchId' => (string)($b['matchId'] ?? ''), 'reaction' => (string)($b['reaction'] ?? '')]);
    } elseif ($action === 'report') {
        $res = gs_call('match.report', ['playerId' => $s['mid'], 'matchId' => (string)($b['matchId'] ?? ''), 'ip' => $ip]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['message'] ?? null);
unset($res['ok']);
json_ok($res);
