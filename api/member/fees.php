<?php
/** A member's own account — what they have been charged and what has been
 *  received. GET reads it (?view=family: which parents can be asked, and
 *  what was asked lately). POST {action:'nudge'} asks the parents to pay or
 *  to confirm a payment. POST {action:'pay'}, makes (or
 *  reuses) a balance invoice and returns its /pay link: the member pays through
 *  Paystack and Paystack's own verify settles it. A member confirming their own
 *  payment is still not a thing this ledger will ever accept. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'nudge') {
        // Ask the parents to pay, or to confirm a payment they made (member_family_nudge).
        rate_limit_check_actor('family.nudge', (string)$s['mid']);
        $res = gs_call('member.family.nudge', ['memberId' => $s['mid']]);
    } elseif ($action === 'pay') {
        rate_limit_check_actor('membership.pay', (string)$s['mid']);
        $res = gs_call('member.fees.pay', ['memberId' => $s['mid']] + (array_key_exists('amount', $b ?? []) ? ['amount' => $b['amount']] : []));
    } else json_error('unknown_action', 400);
} elseif ((string)($_GET['view'] ?? '') === 'family') {
    $res = gs_call('member.family.nudges', ['memberId' => $s['mid']]);
} else {
    $res = gs_call('member.fees', ['memberId' => $s['mid']]);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['detail'] ?? null);
unset($res['ok']); json_ok($res);
