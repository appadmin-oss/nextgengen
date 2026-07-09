<?php
/** Admin: mentorship manager — overview, roster/pairing, mentor-app convert. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'overview');
    $op = $view === 'roster' ? 'admin.mentorship.roster' : 'admin.mentorship.overview';
    $res = gs_call($op, ['requesterId' => $s['mid'], 'sessionId' => (string)($_GET['sessionId'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'convert') {
        $res = gs_call('admin.mentor.application.convert', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'ip' => client_ip()]);
    } elseif ($action === 'assign') {
        $res = gs_call('admin.mentor.assign', ['requesterId' => $s['mid'], 'memberId' => $b['memberId'] ?? '', 'mentorId' => $b['mentorId'] ?? '', 'sessionId' => $b['sessionId'] ?? '', 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
