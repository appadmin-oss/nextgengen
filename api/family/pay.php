<?php
/** A guardian pays a ward's outstanding balance, or an instalment of it: makes (or reuses) a balance
 *  invoice and returns its /pay link. The link must be the guardian's own. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$f = require_family();
rate_limit_check_actor('membership.pay', 'guardian:' . (string)$f['gid']);
$b = read_json_body();
// `amount` (optional) pays an instalment of the balance instead of all of it (membership_part_invoice).
// `charges` (optional) pays those charges, named, before anything older (membership_charges_invoice).
$res = gs_call('family.fees.pay', ['guardianId' => $f['gid'], 'linkId' => (string)($b['link'] ?? '')]
    + (array_key_exists('amount', $b) ? ['amount' => $b['amount']] : []) + (is_array($b['charges'] ?? null) ? ['charges' => array_slice($b['charges'], 0, 50)] : []));
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'not_found' ? 404 : 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
