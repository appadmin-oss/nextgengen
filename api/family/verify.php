<?php
/** Family account sign-in, step 2: the link token, or email + code. Issues the family cookie (never a member session). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('family.verify');
$b = read_json_body();
$token = trim((string)($b['token'] ?? ''));
if ($token !== '' && !preg_match('/^[a-f0-9]{32,128}$/i', $token)) json_error('bad_token_format', 422);
$res = gs_call('family.verify', ['token' => $token, 'email' => (string)($b['email'] ?? ''), 'otp' => (string)($b['otp'] ?? ''), 'ip' => client_ip()]);
if (empty($res['ok'])) { $c = $res['error'] ?? 'invalid'; json_error($c, $c === 'too_many_attempts' ? 429 : 400); }
$mfa = (string)($res['mfa'] ?? '');
/* A family account stays signed in on this device (owner, 26 Nov 2026: the parent and child stay connected on any
   device) unless the parent unticks "keep me signed in" on a shared one. The links are the account's, never the
   device's; a device the account has not used before is told to the account (family_device_seen). */
session_issue_family($res['guardian'], ($b['remember'] ?? true) !== false, ['mfaP' => $mfa]);
$dev = (string)($_COOKIE['ngg_fdev'] ?? '');
if (!preg_match('/^[a-f0-9]{32}$/', $dev)) {
    $dev = rand_hex(16);
    setcookie('ngg_fdev', $dev, ['expires' => time() + 5 * 365 * 86400, 'path' => '/', 'secure' => (bool)($CONFIG['cookie_secure'] ?? true), 'httponly' => true, 'samesite' => 'Lax']);
}
try { family_device_seen($res['guardian'], $dev, (string)($_SERVER['HTTP_USER_AGENT'] ?? ''), client_ip()); } catch (Throwable $e) { error_log('[family] device: ' . $e->getMessage()); }
$csrf = csrf_issue();
json_ok(['guardian' => family_guardian_public($res['guardian']), 'mfa' => $mfa, 'csrf' => $csrf]);
