<?php
/**
 * What a member learnt outside NGG (domain/achievements.php).
 *   GET                          their entries, and the providers to pick from
 *   POST action=add, data        log one (a video, pictures, a link or notes)
 *   POST action=remove, entryId  their own, while unconfirmed
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $res = gs_call('member.learning.log', ['memberId' => $s['mid']]);
} else {
    $b = read_json_body();
    rate_limit_check('member.learning', $s['mid']);
    $a = (string)($b['action'] ?? '');
    if ($a === 'add') $res = gs_call('member.learning.add', ['memberId' => $s['mid'], 'data' => (array)($b['data'] ?? []), 'ip' => client_ip()]);
    elseif ($a === 'remove') $res = gs_call('member.learning.remove', ['memberId' => $s['mid'], 'entryId' => (string)($b['entryId'] ?? '')]);
    else $res = ['ok' => false, 'error' => 'unknown_action'];
}
if (empty($res['ok'])) json_send($res + ['ok' => false], 400);
unset($res['ok']); json_ok($res);
