<?php
/**
 * Standard password sign-in. Pre-session, so CSRF-exempt (see csrf.php) and
 * rate-limited at the edge. On success issues the session cookie + CSRF token,
 * exactly like verify.php. Admins still pass through TOTP 2FA afterwards.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
// Guarantee the default Super Admin exists before any sign-in (idempotent).
ensure_super_admin();
rate_limit_check('auth.verify');

$body = read_json_body();
if (bot_trap_tripped($body)) {
    audit('bot.trap', null, 'login', [], client_ip());
    json_error('request_failed', 400);
}
$identifier = trim((string)($body['identifier'] ?? ''));
$password   = (string)($body['password'] ?? '');
if ($identifier === '' || $password === '') {
    json_error('missing_credentials', 422);
}
if (strlen($identifier) > 200 || strlen($password) > 200) {
    json_error('missing_credentials', 422);
}

$res = gs_call('auth.login', [
    'identifier' => $identifier,
    'password'   => $password,
    'ip'         => client_ip(),
]);
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'invalid_login';
    json_error($code, $code === 'rate_limited' ? 429 : 401);
}

$member = $res['member'] ?? [];
session_issue($member, false, '', !empty($body['remember']));
$csrf = csrf_issue();

json_ok(['member' => $member, 'csrf' => $csrf]);
