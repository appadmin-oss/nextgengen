<?php
/** Admin: the operations journal — health checks, faults, cron heartbeats. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.ops.status', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') === 'clear') {
        $res = gs_call('admin.ops.clear', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'ip' => client_ip()]);
    } else { json_error('unknown_action', 400); }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
