<?php
/** Admin: behaviour monitor — log, list/trends, review. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.behaviour.list', [
        'requesterId' => $s['mid'],
        'subjectId' => (string)($_GET['subjectId'] ?? ''),
        'status' => (string)($_GET['status'] ?? ''),
        'category' => (string)($_GET['category'] ?? ''),
    ]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? 'log');
    $ip = client_ip();
    if ($action === 'log')         $res = gs_call('admin.behaviour.log', ['requesterId' => $s['mid'], 'subjectId' => $b['subjectId'] ?? '', 'note' => $b['note'] ?? '', 'category' => $b['category'] ?? '', 'severity' => $b['severity'] ?? '', 'ip' => $ip]);
    elseif ($action === 'review')  $res = gs_call('admin.behaviour.review', ['requesterId' => $s['mid'], 'logId' => $b['logId'] ?? '', 'ip' => $ip]);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
