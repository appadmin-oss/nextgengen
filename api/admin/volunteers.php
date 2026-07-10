<?php
/** Admin: volunteer review desk — pending queue, roster, approve/decline.
 *  Approval mints the ID + QR, creates the profile, and delivers the
 *  digital ID by email/SMS. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.volunteers.list', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'approve')      $res = gs_call('admin.volunteers.approve', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'ip' => $ip]);
    elseif ($action === 'decline')  $res = gs_call('admin.volunteers.decline', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'reason' => $b['reason'] ?? '', 'ip' => $ip]);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
