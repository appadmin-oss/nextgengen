<?php
/** A member's own discipline standing — their compliance state and the policy
 *  fines they owe. Read-only, and separate from the dues/fees ledger: these are
 *  sanctions, not membership charges. Nothing here is a member-writable action. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('member.compliance', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
