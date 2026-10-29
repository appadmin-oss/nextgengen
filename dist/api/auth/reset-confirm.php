<?php
/**
 * Self-service password reset — step 2: set the new password from a reset
 * token (magic link) or memberId + emailed code. Pre-session → CSRF-exempt,
 * rate-limited. On success issues a session + CSRF (like login.php) so the
 * user lands signed in. Admins still pass TOTP 2FA afterwards.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
ensure_super_admin();
rate_limit_check('auth.verify');

$body = read_json_body();
$res = gs_call('auth.resetConfirm', [
    'token'    => (string)($body['token'] ?? ''),
    'memberId' => (string)($body['memberId'] ?? ''),
    'otp'      => (string)($body['otp'] ?? ''),
    'password' => (string)($body['password'] ?? ''),
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'failed';
    json_error($code, $code === 'rate_limited' ? 429 : 400);
}

$member = $res['member'] ?? [];
$mfa = (string)($res['mfa'] ?? '');
session_issue($member, false, '', false, ['mfaP' => $mfa]);
$csrf = csrf_issue();

json_ok(['member' => $member, 'mfa' => $mfa, 'csrf' => $csrf]);
