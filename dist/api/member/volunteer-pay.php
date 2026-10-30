<?php
/** A member's own volunteer wallet, when they are an NGG volunteer: what they
 *  have earned, each day and why, and what has been paid (domain/volunteer-pay.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$res = gs_call('member.volpay', ['memberId' => $s['mid']]);
if (empty($res['ok'])) { http_response_code(400); echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES); exit; }
unset($res['ok']); json_ok($res);
