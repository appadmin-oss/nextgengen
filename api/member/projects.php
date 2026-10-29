<?php
/**
 * A member's projects (domain/projects.php): GET the ones they are on — their
 * group, who set it and the countdown; POST to mark their own part done, or
 * not done yet.
 *
 * The memberId comes from the SESSION, never the request: a child marks only
 * their own part.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('member.projects', ['memberId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    rate_limit_check_actor('member.project', (string)$s['mid']);
    $res = gs_call('member.project.mark', ['memberId' => $s['mid'], 'projectId' => (string)($b['projectId'] ?? ''),
        'status' => (string)($b['status'] ?? ''), 'note' => (string)($b['note'] ?? ''), 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
