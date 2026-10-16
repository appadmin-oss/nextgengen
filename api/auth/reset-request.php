<?php
/**
 * Self-service password reset — step 1: request an emailed set-password link +
 * 6-digit code. Pre-session → CSRF-exempt, rate-limited at the edge. To a
 * browser that has never signed in here, a real and an unknown account look
 * the same; the unknown address is told by email (auth_find_member()).
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
ensure_super_admin();
rate_limit_check('auth.request');
rate_limit_check('auth.request.hour');

$body = read_json_body();
if (bot_trap_tripped($body)) {
    audit('bot.trap', null, 'reset', [], client_ip());
    json_error('request_failed', 400);
}
v_require($body, ['identifier']);
$identifier = trim(v_safe_text($body['identifier'], 120));
if (strlen($identifier) < 3) json_error('identifier_too_short', 422);

$res = gs_call('auth.resetRequest', [
    'identifier' => $identifier,
    'ip'         => client_ip(),
    'device'     => device_trust_id(),
    'userAgent'  => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 256),
]);
if (empty($res['ok'])) {
    $e = (string)($res['error'] ?? 'failed');
    json_error($e, $e === 'too_many_misses' ? 429 : 400);
}
json_ok(['masked' => $res['masked'] ?? '', 'delivery' => $res['delivery'] ?? true]);
