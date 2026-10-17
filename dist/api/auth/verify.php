<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
// Guarantee the default Super Admin exists before any sign-in (idempotent).
ensure_super_admin();
rate_limit_check('auth.verify');

$body = read_json_body();
$token = trim((string)($body['token'] ?? ''));
$memberId = trim((string)($body['memberId'] ?? ''));
$otp = trim((string)($body['otp'] ?? ''));

// Either a token (magic link) or memberId+otp must be present.
if ($token === '' && ($memberId === '' || $otp === '')) {
    json_error('missing_credentials', 422);
}
if ($token !== '' && !preg_match('/^[a-f0-9]{32,128}$/i', $token)) {
    json_error('bad_token_format', 422);
}
if ($otp !== '' && !preg_match('/^\d{6}$/', preg_replace('/\s+/', '', $otp))) {
    json_error('bad_otp_format', 422);
}
// A Member ID, or the email the code was sent to (resolved in auth_verify).
if ($memberId !== '' && !auth_identifier_ok($memberId)) json_error('bad_member_id', 422);

$res = gs_call('auth.verify', [
    'token'    => $token,
    'memberId' => $memberId,
    'otp'      => preg_replace('/\s+/', '', $otp),
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'invalid';
    json_error($code, $code === 'rate_limited' ? 429 : 400);
}

$mfa = (string)($res['mfa'] ?? '');
if (!empty($res['volunteer'])) {
    // An instructor, volunteer or mentor signing in with an emailed code: the
    // same card-holder session their ID card gives them.
    $v = $res['volunteer'];
    session_issue_cardholder($v, 'volunteer', !empty($body['remember']), ['mfaP' => $mfa]);
    $csrf = csrf_issue();
    json_ok(['member' => community_member_shape($v, 'volunteer'), 'kind' => 'volunteer', 'mfa' => $mfa, 'csrf' => $csrf]);
}
$member = $res['member'] ?? [];
session_issue($member, false, '', !empty($body['remember']), ['mfaP' => $mfa]);
$csrf = csrf_issue();

json_ok(['member' => $member, 'mfa' => $mfa, 'csrf' => $csrf]);
