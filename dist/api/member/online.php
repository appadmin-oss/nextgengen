<?php
/** An online member's Saturday session (domain/online.php).
 *  GET: the next session and whether Join is open. POST {action:'join'}: records attendance and returns the
 *  link, only while the session is on — joining through here IS the attendance record. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'join') json_error('unknown_action', 400);
    rate_limit_check_actor('online.join', (string)$s['mid']);
    $res = gs_call('member.online.session.join', ['memberId' => $s['mid']]);
} else {
    $res = gs_call('member.online.session', ['memberId' => $s['mid']]);
}
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'not_online' ? 403 : 400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']); json_ok($res);
