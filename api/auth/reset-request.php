<?php
/**
 * Self-service password reset — step 1: request an emailed set-password link +
 * 6-digit code. Pre-session → CSRF-exempt, rate-limited at the edge. Never
 * reveals whether the account exists (uniform response).
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
ensure_super_admin();
rate_limit_check('auth.request');

$body = read_json_body();
v_require($body, ['identifier']);
$identifier = trim(v_safe_text($body['identifier'], 120));
if (strlen($identifier) < 3) json_error('identifier_too_short', 422);

$res = gs_call('auth.resetRequest', [
    'identifier' => $identifier,
    'ip'         => client_ip(),
    'userAgent'  => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 256),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
json_ok(['masked' => $res['masked'] ?? '', 'delivery' => $res['delivery'] ?? true]);
