<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('auth.verify');

$body = read_json_body();

$res = gs_call('auth.verify', [
    'token'    => $body['token']    ?? '',
    'memberId' => $body['memberId'] ?? '',
    'otp'      => $body['otp']      ?? '',
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'invalid';
    json_error($code, $code === 'rate_limited' ? 429 : 400);
}

$member = $res['member'] ?? [];
session_issue($member, false);

json_ok(['member' => $member]);
