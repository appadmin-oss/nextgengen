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
    } elseif ($view === 'players') {
        // Design turn 6A — the search screen. Names, centres, ratings and a
        // head-to-head line; nothing that could be used to contact anybody.
        $res = gs_call('chess.players', ['playerId' => $s['mid'], 'q' => (string)($_GET['q'] ?? ''),
            'club' => !empty($_GET['club']), 'online' => !empty($_GET['online']),
            'band' => (string)($_GET['band'] ?? ''), 'mentors' => !empty($_GET['mentors'])]);
    } elseif ($view === 'challenges') {
        $res = gs_call('chess.challenges', ['playerId' => $s['mid']]);
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
        $res = gs_call('match.invite', ['playerId' => $s['mid'], 'game' => (string)($b['game'] ?? ''), 'opponentId' => (string)($b['opponentId'] ?? '')]);
    } elseif ($action === 'challenge') {
        rate_limit_check('match.invite');
        $res = gs_call('chess.challenge', ['playerId' => $s['mid'],
            'opponentId' => (string)($b['opponentId'] ?? ''),
            'timeControl' => (string)($b['timeControl'] ?? '1day'),
            'colourPref' => (string)($b['colourPref'] ?? 'random'),
            'rated' => !empty($b['rated']),
            'channelSlug' => (string)($b['channelSlug'] ?? '')]);
    } elseif ($action === 'challengeRespond') {
        $res = gs_call('chess.respond', ['playerId' => $s['mid'],
            'challengeId' => (string)($b['challengeId'] ?? ''),
            'action' => (string)($b['answer'] ?? 'accept')]);
    } elseif ($action === 'respond') {
        $res = gs_call('match.respond', ['playerId' => $s['mid'], 'matchId' => (string)($b['matchId'] ?? ''), 'accept' => !empty($b['accept'])]);
    } elseif ($action === 'move') {
        $res = gs_call('match.move', ['playerId' => $s['mid'], 'matchId' => (string)($b['matchId'] ?? ''), 'move' => (string)($b['move'] ?? '')]);
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
