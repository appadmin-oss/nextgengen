<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('default');

$body = read_json_body();
// Standardised intake: structured name, required phone, required DOB.
v_require($body, ['kind', 'firstName', 'lastName', 'email', 'phone', 'dob']);

$kind  = v_in($body['kind'], ['teen', 'mentor', 'volunteer']);
$first = v_safe_text(v_min(v_max(trim((string)$body['firstName']), 60), 1), 60);
$last  = v_safe_text(v_min(v_max(trim((string)$body['lastName']), 60), 1), 60);
$other = v_safe_text(v_max(trim((string)($body['otherName'] ?? '')), 60), 60);
$name  = trim($first . ($other !== '' ? ' ' . $other : '') . ' ' . $last);
$email = v_email($body['email']);
$phone = v_safe_text(v_max(trim((string)$body['phone']), 32), 32);
// Teens are 10–17; mentors/volunteers are adults (16+ minimum).
$dob   = v_dob($body['dob'], $kind === 'teen' ? 10 : 16, $kind === 'teen' ? 17 : 100);
$why   = v_safe_text($body['why'] ?? '', 2000);

$payload = [
    'kind'      => $kind,
    'firstName' => $first,
    'lastName'  => $last,
    'otherName' => $other,
    'name'      => $name,
    'email'     => $email,
    'phone'     => $phone,
    'dob'       => $dob,
    'why'       => $why,
    'ip'        => client_ip(),
];

if ($kind === 'teen') {
    $payload['centre']  = v_safe_text($body['centre'] ?? '', 60);
    $payload['track']   = v_safe_text($body['track'] ?? '', 60);
    $payload['program'] = v_safe_text($body['program'] ?? '', 16);
    $payload['photoUrl'] = v_safe_text($body['photoUrl'] ?? '', 512);
} elseif ($kind === 'volunteer') {
    v_require($body, ['role']);
    $payload['role']    = v_safe_text($body['role'] ?? '', 24);
    $payload['photoUrl'] = v_safe_text($body['photoUrl'] ?? '', 512);
    $payload['courses'] = is_array($body['courses'] ?? null)
        ? array_slice(array_map(fn($c) => v_safe_text((string)$c, 60), $body['courses']), 0, 8)
        : [];
} else {
    $payload['role'] = v_safe_text($body['role'] ?? '', 60);
}

$res = gs_call('public.apply', $payload);
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'apply_failed';
    json_error($code, $code === 'rate_limited' ? 429 : 400);
}
unset($res['ok']);
json_ok($res);
