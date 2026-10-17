<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
// Guarantee the default Super Admin exists before any sign-in (idempotent).
ensure_super_admin();
rate_limit_check('auth.request');
rate_limit_check('auth.request.hour');

$body = read_json_body();
if (bot_trap_tripped($body)) {
    audit('bot.trap', null, 'request', [], client_ip());
    json_error('request_failed', 400);
}
v_require($body, ['identifier']);
$identifier = v_safe_text($body['identifier'], 120);
$identifier = trim($identifier);
if (strlen($identifier) < 3) json_error('identifier_too_short', 422);
// An email, or any ID as printed on an account or a card (auth_identifier_ok).
if (!auth_identifier_ok($identifier)) json_error('bad_identifier_format', 422);

$res = gs_call('auth.request', [
    'identifier' => $identifier,
    'ip'         => client_ip(),
    'device'     => device_trust_id(),
    'userAgent'  => client_ua(),
]);
if (empty($res['ok'])) {
    $e = (string)($res['error'] ?? 'request_failed');
    json_error($e, $e === 'too_many_misses' ? 429 : 400);
}

json_ok([
    'masked'   => $res['masked'] ?? '',
    'delivery' => $res['delivery'] ?? true,
]);
