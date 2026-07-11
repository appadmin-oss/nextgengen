<?php
/**
 * The gate — registration desk + attendance check-in behind a shareable,
 * revocable gate link. Two controls, both required: a valid gate token
 * (scopes/revokes the LINK) and a signed-in staff session (authenticates
 * the HUMAN). The page itself lives at /gate?g=…
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('gate');
$s = require_session();
if (!is_admin_role($s['role'] ?? '')) json_error('forbidden', 403);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('gate.context', ['gate' => (string)($_GET['g'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'register') {
        $res = gs_call('gate.register', ['gate' => $b['gate'] ?? '', 'data' => $b['data'] ?? [], 'photoUrl' => $b['photoUrl'] ?? '', 'force' => !empty($b['force']), 'byId' => $s['mid'], 'ip' => $ip]);
    } elseif ($action === 'checkin') {
        // Reuse the summer check-in op (QR token or explicit studentId).
        if (!gate_resolve((string)($b['gate'] ?? ''))) json_error('gate_invalid', 403);
        $res = gs_call('admin.summer.checkin', ['requesterId' => $s['mid'], 'token' => $b['token'] ?? '', 'method' => 'gate', 'device' => 'gate:' . substr((string)($b['gate'] ?? ''), 0, 12), 'ip' => $ip]);
        if (!empty($res['ok']) && empty($res['already'])) {
            event_emit('attendance.marked', ['memberId' => $res['student']['studentId'] ?? '', 'name' => $res['student']['fullName'] ?? '', 'date' => gmdate('Y-m-d'), 'source' => 'gate', 'by' => $s['mid']]);
        }
    } else {
        json_error('unknown_action', 400);
    }
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
