<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('default');

$body  = read_json_body();
v_require($body, ['email']);
$email = v_email($body['email']);

// Sanitized allow-list is authoritative; layered over the raw body so no
// required field can be silently dropped (the domain re-validates every read).
$res = gs_call('public.newsletter', array_merge($body, [
    'email'  => $email,
    'source' => v_safe_text($body['source'] ?? 'site', 64),
    'ip'     => client_ip(),
]));
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'subscribe_failed';
    json_error($code, $code === 'rate_limited' ? 429 : 400);
}
unset($res['ok']);
json_ok($res);
