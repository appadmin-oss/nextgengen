<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('default');

$body = read_json_body();
v_require($body, ['kind', 'name', 'email']);

$kind  = v_in($body['kind'], ['teen', 'mentor', 'volunteer']);
$name  = v_safe_text(v_min(v_max(trim((string)$body['name']), 120), 2), 120);
$email = v_email($body['email']);
$why   = v_safe_text($body['why'] ?? '', 2000);

$payload = [
    'kind'  => $kind,
    'name'  => $name,
    'email' => $email,
    'why'   => $why,
    'ip'    => client_ip(),
];

if ($kind === 'teen') {
    v_require($body, ['age']);
    $payload['age']     = v_int($body['age'], 10, 17);
    $payload['centre']  = v_safe_text($body['centre'] ?? '', 60);
    $payload['track']   = v_safe_text($body['track'] ?? '', 60);
    $payload['program'] = v_safe_text($body['program'] ?? '', 16);
    $payload['photoUrl'] = v_safe_text($body['photoUrl'] ?? '', 512);
} elseif ($kind === 'volunteer') {
    v_require($body, ['role']);
    $payload['role']    = v_safe_text($body['role'] ?? '', 24);
    $payload['phone']   = v_safe_text($body['phone'] ?? '', 24);
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
