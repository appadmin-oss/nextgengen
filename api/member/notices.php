<?php
/** A member's notices: the list, one notice (read — and acknowledged with `ack`). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $id = (string)($_GET['noticeId'] ?? '');
    $res = $id !== '' ? gs_call('member.notice', ['memberId' => $s['mid'], 'noticeId' => $id]) : gs_call('member.notices', ['memberId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = gs_call('member.notice', ['memberId' => $s['mid'], 'noticeId' => (string)($b['noticeId'] ?? ''), 'ack' => !empty($b['ack'])]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']); json_ok($res);
