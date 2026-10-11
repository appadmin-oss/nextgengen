<?php
/**
 * The member's chat with their own mentor (domain/mentor-portal.php).
 * GET reads the conversation; POST sends one message. The memberId is the
 * session's — a member can only ever write to, and read, their own thread.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('member.mentor.chat', ['memberId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    rate_limit_check('member.chat', $s['mid']);
    $res = gs_call('member.mentor.chat.send', ['memberId' => $s['mid'], 'body' => $b['body'] ?? '', 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
