<?php
/** A member's own account — what they have been charged and what has been
 *  received. Read-only: there is no action on this route, by design. Money is
 *  recorded by an admin as it arrives, and a member confirming their own payment
 *  is not a thing this ledger will ever accept. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$res = gs_call('member.fees', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
