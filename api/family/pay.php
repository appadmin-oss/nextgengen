<?php
/** A guardian pays a ward's outstanding balance: makes (or reuses) a balance
 *  invoice and returns its /pay link. The link must be the guardian's own. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$f = require_family();
rate_limit_check_actor('membership.pay', 'guardian:' . (string)$f['gid']);
$b = read_json_body();
$res = gs_call('family.fees.pay', ['guardianId' => $f['gid'], 'linkId' => (string)($b['link'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'not_found' ? 404 : 400);
unset($res['ok']); json_ok($res);
