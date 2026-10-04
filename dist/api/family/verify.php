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
session_issue_family($res['guardian'], !empty($b['remember']));
$csrf = csrf_issue();
json_ok(['guardian' => family_guardian_public($res['guardian']), 'csrf' => $csrf]);
