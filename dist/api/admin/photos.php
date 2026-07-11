<?php
/** Admin: photo review queue — the editor's console backend.
 *  Claim → edit → approve / request retake / (escalated) reject. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.photo.queue', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    $base = ['requesterId' => $s['mid'], 'assetId' => $b['assetId'] ?? '', 'ip' => $ip];
    if ($action === 'claim')       $res = gs_call('admin.photo.claim', $base);
    elseif ($action === 'approve') $res = gs_call('admin.photo.approve', $base + ['editedUrl' => $b['editedUrl'] ?? '', 'note' => $b['note'] ?? '']);
    elseif ($action === 'retake')  $res = gs_call('admin.photo.retake', $base + ['reason' => $b['reason'] ?? '']);
    elseif ($action === 'reject')  $res = gs_call('admin.photo.reject', $base + ['reason' => $b['reason'] ?? '']);
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
