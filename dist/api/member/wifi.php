<?php
/**
 * This member's own Wi-Fi (domain/wifi.php).
 *
 * CACENTRE holds every PIN and decides who is on; this asks it, signed, for
 * one person — the member asking — and shows what comes back.
 *   GET                 their card
 *   POST {op:"newPin"}  ask CACENTRE for a new PIN
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('member.wifi.card', ['memberId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    rate_limit_check_actor('member.wifi.pin', (string)$mid);
    $res = gs_call('member.wifi.card', ['memberId' => $mid, 'op' => (string)($b['op'] ?? 'show')]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
