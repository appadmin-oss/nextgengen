<?php
/** A member's own account — what they have been charged and what has been
 *  received. GET reads it. The one action, POST {action:'pay'}, makes (or
 *  reuses) a balance invoice and returns its /pay link: the member pays through
 *  Paystack and Paystack's own verify settles it. A member confirming their own
 *  payment is still not a thing this ledger will ever accept. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'pay') json_error('unknown_action', 400);
    rate_limit_check_actor('membership.pay', (string)$s['mid']);
    $res = gs_call('member.fees.pay', ['memberId' => $s['mid']]);
} else {
    $res = gs_call('member.fees', ['memberId' => $s['mid']]);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
