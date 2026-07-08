<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
// Guarantee the default Super Admin exists before any sign-in (idempotent).
ensure_super_admin();
rate_limit_check('auth.request');

$body = read_json_body();
v_require($body, ['identifier']);
$identifier = v_safe_text($body['identifier'], 120);
$identifier = trim($identifier);
if (strlen($identifier) < 3) json_error('identifier_too_short', 422);
// Either an email or an ID like NGG-2025-0042 — let Apps Script disambiguate.
if (!filter_var($identifier, FILTER_VALIDATE_EMAIL)
    && !preg_match('/^[A-Z]{2,6}-\d{4}-\d{3,5}$/i', $identifier)) {
    json_error('bad_identifier_format', 422);
}

$res = gs_call('auth.request', [
    'identifier' => $identifier,
    'ip'         => client_ip(),
    'userAgent'  => client_ua(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'request_failed', 400);

json_ok([
    'masked' => $res['masked'] ?? '',
]);
