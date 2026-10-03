<?php
/**
 * The companion board (domain/companion.php).
 *   GET  ?rating=on_track|watch|at_risk   who needs support this week
 *   POST action=assess, memberIds[]        re-assess now
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.companion.board', ['requesterId' => $mid, 'rating' => (string)($_GET['rating'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = ($b['action'] ?? '') === 'assess'
        ? gs_call('admin.companion.assess', ['requesterId' => $mid, 'memberIds' => is_array($b['memberIds'] ?? null) ? $b['memberIds'] : [], 'ip' => client_ip()])
        : ['ok' => false, 'error' => 'unknown_action'];
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
