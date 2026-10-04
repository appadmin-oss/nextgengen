<?php
/** Admin: the timetable (domain/timetable.php). GET list · POST action=save|remove */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.timetable.list', ['requesterId' => $s['mid'], 'centreId' => (string)($_GET['centreId'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'save') $res = gs_call('admin.timetable.save', ['requesterId' => $s['mid'], 'data' => is_array($b['data'] ?? null) ? $b['data'] : [], 'ip' => client_ip()]);
    elseif ($action === 'remove') $res = gs_call('admin.timetable.remove', ['requesterId' => $s['mid'], 'slotIds' => is_array($b['slotIds'] ?? null) ? $b['slotIds'] : [], 'ip' => client_ip()]);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
