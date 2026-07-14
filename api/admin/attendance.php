<?php
/** Admin/kiosk: attendance-taker rotation + gamified attendance duty.
 *  GET  ?view=board  → who's on duty across centres for a date (default today)
 *  GET  ?view=admin  → board + eligible volunteer pool (for the override picker)
 *  POST action=set      → pin a volunteer to a centre's duty (admin, summer cap)
 *  POST action=complete → close the day's roll, award points, return response */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'board');
    $date = (string)($_GET['date'] ?? '');
    if ($view === 'admin') $res = gs_call('admin.attendance.duty', ['requesterId' => $mid, 'date' => $date]);
    elseif ($view === 'leaderboard') $res = gs_call('attendance.duty.leaderboard', ['requesterId' => $mid]);
    else                   $res = gs_call('attendance.duty.board', ['requesterId' => $mid, 'date' => $date]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $map = [
        'set'      => 'admin.attendance.duty.set',
        'complete' => 'attendance.duty.complete',
    ];
    if (!isset($map[$action])) json_error('unknown_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
