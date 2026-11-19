<?php
/**
 * Family app: sign in with a code staff made at the desk (Members › Sign-in
 * security → Let in for 10 minutes, on a guardian). {email, code}. No emailed
 * code and no second step: the code, made in person for this one account,
 * for ten minutes and once, is the proof (domain/mfa.php auth_desk).
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('family.verify');
$b = read_json_body();
$ident = trim((string)($b['email'] ?? ''));
$code = trim((string)($b['code'] ?? ''));
if ($ident === '' || $code === '') json_error('missing_credentials', 422);
$res = gs_call('auth.desk', ['identifier' => $ident, 'code' => $code, 'family' => true, 'ip' => client_ip()]);
if (empty($res['ok']) || empty($res['guardian'])) { $c = $res['error'] ?? 'invalid'; json_error($c, $c === 'too_many_attempts' ? 429 : 400); }
session_issue_family($res['guardian'], true, ['mfaP' => '']);
$csrf = csrf_issue();
json_ok(['guardian' => family_guardian_public($res['guardian']), 'mfa' => '', 'replaceUntil' => (int)($res['replaceUntil'] ?? 0), 'csrf' => $csrf]);
