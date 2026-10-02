<?php
/** Admin: tournaments — centre rounds through to a final.
 *
 *  Every write is gated on the `people` capability in the domain layer: a
 *  tournament pairs named children against each other, so it is a roster
 *  action, not a content one. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ip = client_ip();

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'bracket') {
        $res = gs_call('tournament.bracket', ['requesterId' => $s['mid'], 'tournamentId' => (string)($_GET['tournamentId'] ?? '')]);
    } elseif ($view === 'standings') {
        $res = gs_call('tournament.standings', ['requesterId' => $s['mid'], 'playerId' => $s['mid'], 'tournamentId' => (string)($_GET['tournamentId'] ?? '')]);
    } elseif ($view === 'rounds') {
        $res = gs_call('tournament.rounds', ['requesterId' => $s['mid'], 'playerId' => $s['mid'], 'tournamentId' => (string)($_GET['tournamentId'] ?? '')]);
    } else {
        $res = gs_call('tournament.list', ['requesterId' => $s['mid']]);
    }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $base = ['requesterId' => $s['mid'], 'tournamentId' => (string)($b['tournamentId'] ?? ''), 'ip' => $ip];
    if ($action === 'create') {
        /* The full specification. The old call took a name, a game and a
         * programme and nothing else, which is why every tournament was a
         * centre cup at correspondence pace: there was nowhere to say
         * otherwise. Absent keys keep the old defaults — see
         * admin_tournament_create on why that matters. */
        $res = gs_call('tournament.create', $base + [
            'name' => (string)($b['name'] ?? ''), 'game' => (string)($b['game'] ?? 'chess'),
            'programme' => (string)($b['programme'] ?? ''),
            'description' => (string)($b['description'] ?? ''),
        ] + array_filter([
            'format' => $b['format'] ?? null, 'timeControl' => $b['timeControl'] ?? null,
            'variant' => $b['variant'] ?? null,
            'rated' => $b['rated'] ?? null, 'totalRounds' => $b['totalRounds'] ?? null,
            'kinds' => $b['kinds'] ?? null, 'centres' => $b['centres'] ?? null,
            'minRating' => $b['minRating'] ?? null, 'maxRating' => $b['maxRating'] ?? null,
            'startsAt' => $b['startsAt'] ?? null, 'endsAt' => $b['endsAt'] ?? null,
        ], fn($v) => $v !== null));
    } elseif ($action === 'draw') {
        $res = gs_call('tournament.draw', $base);
    } elseif ($action === 'directory') {
        $res = gs_call('tournament.directory', [
            'q' => (string)($b['q'] ?? ''), 'kinds' => (array)($b['kinds'] ?? []),
            'centre' => (string)($b['centre'] ?? ''), 'band' => (string)($b['band'] ?? ''),
            'exclude' => (array)($b['exclude'] ?? []), 'limit' => (int)($b['limit'] ?? 40)]);
    } elseif ($action === 'inviteAll') {
        /* dryRun lets the screen say "this will invite 38 people" BEFORE it
           sends 38 notifications, which is the difference between a button
           somebody presses and a button somebody is afraid of. */
        $res = gs_call('tournament.inviteAll', $base + ['dryRun' => !empty($b['dryRun'])]);
    } elseif ($action === 'enter') {
        $res = gs_call('tournament.enter', $base + ['playerId' => (string)($b['playerId'] ?? '')]);
    } elseif ($action === 'withdraw') {
        $res = gs_call('tournament.withdraw', $base + ['playerId' => (string)($b['playerId'] ?? '')]);
    } elseif ($action === 'advance') {
        $res = gs_call('tournament.advance', $base);
    } elseif ($action === 'replay') {
        $res = gs_call('tournament.replay', $base + ['matchId' => (string)($b['matchId'] ?? '')]);
    } elseif ($action === 'cancel') {
        $res = gs_call('tournament.cancel', $base);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['message'] ?? null);
unset($res['ok']);
json_ok($res);
