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
    } else {
        $res = gs_call('tournament.list', ['requesterId' => $s['mid']]);
    }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $base = ['requesterId' => $s['mid'], 'tournamentId' => (string)($b['tournamentId'] ?? ''), 'ip' => $ip];
    if ($action === 'create') {
        $res = gs_call('tournament.create', $base + ['name' => (string)($b['name'] ?? ''), 'game' => (string)($b['game'] ?? 'chess'), 'programme' => (string)($b['programme'] ?? '')]);
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
