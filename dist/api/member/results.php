<?php
/**
 * School results and the growth plan — the member's side (Grow → School results).
 *
 * One route for one screen. GET returns the whole state; POST carries one
 * action. The memberId comes from the SESSION on every call: there is no
 * `?memberId=` and there must never be one.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

const RESULTS_ACTIONS = [
    // action => [op, body keys, rate-limit bucket]
    'upload'  => ['member.results.upload', ['term', 'fileUrl', 'mime', 'size'], 'results.write'],
    'read'    => ['member.results.read', ['uploadId'], 'results.read'],
    'confirm' => ['member.results.confirm', ['uploadId', 'subjects'], 'results.write'],
    'draft'   => ['member.results.plan.draft', ['uploadId', 'fresh'], 'results.draft'],
    'save'    => ['member.results.plan.save', ['planId', 'items', 'habit', 'recipients', 'committed'], 'results.write'],
    'send'    => ['member.results.plan.send', ['planId', 'items', 'habit', 'recipients', 'committed'], 'results.write'],
    'tick'    => ['member.results.tick', ['itemId', 'weekStart', 'delta'], 'results.write'],
];

if ($method === 'GET') {
    $res = gs_call('member.results.state', ['memberId' => $s['mid'], 'term' => (string)($_GET['term'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if (!isset(RESULTS_ACTIONS[$action])) json_error('unknown_action', 400);
    [$op, $keys, $bucket] = RESULTS_ACTIONS[$action];
    rate_limit_check($bucket, $s['mid']);
    $res = gs_call($op, ['memberId' => $s['mid'], 'ip' => client_ip()] + array_intersect_key($b, array_flip($keys)));
} else {
    json_error('method_not_allowed', 405);
}

if (empty($res['ok'])) {
    // The extra fields (which subjects, the size limit) are what the screen highlights.
    json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
}
unset($res['ok']); json_ok($res);
