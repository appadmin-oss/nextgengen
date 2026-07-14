<?php
/** Member account self-service: email change, data export, account deletion. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // GDPR data export bundle.
    $res = gs_call('member.export', ['memberId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'change_email') {
        $res = gs_call('member.email.changeRequest', ['memberId' => $mid, 'email' => $b['email'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'delete') {
        $res = gs_call('member.deleteAccount', ['memberId' => $mid, 'ip' => client_ip()]);
        if (!empty($res['ok'])) session_clear(); // sign out — the account is gone
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
