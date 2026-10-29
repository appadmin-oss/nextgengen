<?php
/**
 * "Who's signing in?" — the second step for an email several member accounts
 * share. auth/verify.php (a code or link) or auth/login.php (a password)
 * proved the inbox and returned a pickToken with the accounts it may open;
 * this opens the one chosen and issues the session exactly as verify.php does.
 * Pre-session, so CSRF-exempt: the verified pickToken IS the proof.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('auth.verify');

$body = read_json_body();
$token = trim((string)($body['pickToken'] ?? ''));
$memberId = trim((string)($body['memberId'] ?? ''));
if (!preg_match('/^[a-f0-9]{32,128}$/i', $token) || $memberId === '' || strlen($memberId) > 64) json_error('missing_credentials', 422);

$res = gs_call('auth.pick', ['pickToken' => $token, 'memberId' => $memberId, 'ip' => client_ip()]);
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'invalid';
    json_error($code, $code === 'rate_limited' ? 429 : 400);
}
$member = $res['member'] ?? [];
$mfa = (string)($res['mfa'] ?? '');
session_issue($member, false, '', !empty($body['remember']), ['mfaP' => $mfa]);
$csrf = csrf_issue();
json_ok(['member' => $member, 'mfa' => $mfa, 'csrf' => $csrf]);
