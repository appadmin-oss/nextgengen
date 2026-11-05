<?php
/**
 * Sign in with a code staff made at the desk (Members › Sign-in security →
 * Let in for 10 minutes): {identifier, code}. No password and no second step;
 * the code, made in person, for one account, for ten minutes, once, is the
 * proof (domain/mfa.php auth_desk). The session it gives is a normal one, and
 * the person is then asked to set a new second step without the old one.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('auth.verify');
$body = read_json_body();
$ident = auth_clean_identifier((string)($body['identifier'] ?? ''));
$code = trim((string)($body['code'] ?? ''));
if ($ident === '' || $code === '') json_error('missing_credentials', 422);
if (!auth_identifier_ok($ident)) json_error('invalid', 400);
$res = gs_call('auth.desk', ['identifier' => $ident, 'code' => $code, 'ip' => client_ip()]);
if (empty($res['ok'])) {
    $e = $res['error'] ?? 'invalid';
    json_error($e, $e === 'too_many_attempts' ? 429 : 400);
}
if (!empty($res['volunteer'])) {
    $v = $res['volunteer'];
    session_issue_cardholder($v, 'volunteer', false, ['mfaP' => '']);
    $csrf = csrf_issue();
    json_ok(['member' => community_member_shape($v, 'volunteer'), 'kind' => 'volunteer', 'mfa' => '', 'replaceUntil' => (int)($res['replaceUntil'] ?? 0), 'csrf' => $csrf]);
}
$member = $res['member'] ?? [];
session_issue($member, false, '', false, ['mfaP' => '']);
$csrf = csrf_issue();
json_ok(['member' => $member, 'mfa' => '', 'replaceUntil' => (int)($res['replaceUntil'] ?? 0), 'csrf' => $csrf]);
