<?php
/**
 * Member security surface — "Me → Security" + the W10 first-run screen.
 * GET: password state, last login, live device sessions (current flagged).
 * POST {action:'revoke', sid} — sign out one device.
 * POST {action:'revoke_others'} — sign out everywhere else.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('member.security', ['requesterId' => $mid, 'sid' => (string)($s['sid'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'revoke') {
        $res = gs_call('member.sessions.revoke', ['requesterId' => $mid, 'sid' => (string)($s['sid'] ?? ''), 'targetSid' => (string)($b['sid'] ?? ''), 'ip' => client_ip()]);
    } elseif ($action === 'revoke_others') {
        $res = gs_call('member.sessions.revoke', ['requesterId' => $mid, 'sid' => (string)($s['sid'] ?? ''), 'others' => true, 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
