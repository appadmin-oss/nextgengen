<?php
/**
 * Admin: NGG's half of the estate's Wi-Fi (domain/wifi.php).
 *   GET                 what the last roster push did, and our say right now
 *   POST action=push    send the roster to CACENTRE now
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.wifi.status', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = ($b['action'] ?? '') === 'push'
        ? gs_call('admin.wifi.push', ['requesterId' => $mid, 'ip' => client_ip()])
        : ['ok' => false, 'error' => 'unknown_action'];
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
