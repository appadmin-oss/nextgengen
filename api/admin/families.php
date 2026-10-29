<?php
/** Family accounts, from the desk: who is connected to whom, and the requests to connect. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' && isset($_GET['collectors'])) {
    // Who may collect one member — the list a family reads and cannot write.
    $res = gs_call('admin.member.collectors', ['requesterId' => $s['mid'], 'memberId' => (string)$_GET['collectors']]);
} elseif ($method === 'POST' && ($b = read_json_body()) && ($b['action'] ?? '') === 'collectors') {
    $res = gs_call('admin.member.collectors', ['requesterId' => $s['mid'], 'memberId' => (string)($b['memberId'] ?? ''),
        'collectors' => is_array($b['collectors'] ?? null) ? $b['collectors'] : [], 'ip' => client_ip()]);
} elseif ($method === 'GET') {
    $res = gs_call('admin.families.list', ['requesterId' => $s['mid'], 'status' => $_GET['status'] ?? 'pending', 'q' => $_GET['q'] ?? '']);
} elseif ($method === 'POST') {
    $b = $b ?? read_json_body();
    $res = gs_call('admin.families.decide', ['requesterId' => $s['mid'], 'action' => $b['action'] ?? '',
        'linkIds' => is_array($b['linkIds'] ?? null) ? $b['linkIds'] : [], 'note' => $b['note'] ?? '', 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['detail'] ?? null);
unset($res['ok']); json_ok($res);
