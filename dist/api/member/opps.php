<?php
/** Member: Opportunities (domain/opportunities.php). GET the open ones that fit me · POST action=save {oppId} toggles my bookmark. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('member.opps', ['memberId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'save') json_error('unknown_action', 400);
    $res = gs_call('member.opps.save', ['memberId' => $s['mid'], 'oppId' => (string)($b['oppId'] ?? '')]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
