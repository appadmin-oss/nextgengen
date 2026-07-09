<?php
/**
 * Sign-in gateway — step 1 of the unified door (W1). Given an identifier,
 * returns which sign-in methods apply: always ['code']; plus 'password' when
 * the account has one. Unknown accounts and staff are indistinguishable from
 * ordinary members here by design. Pre-session → CSRF-exempt, rate-limited.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
ensure_super_admin();
rate_limit_check('auth.request');

$body = read_json_body();
v_require($body, ['identifier']);
$identifier = trim(v_safe_text($body['identifier'], 120));
if (strlen($identifier) < 3) json_error('identifier_too_short', 422);
if (!filter_var($identifier, FILTER_VALIDATE_EMAIL)
    && !preg_match('/^[A-Z]{2,6}-\d{4}-\d{3,5}$/i', $identifier)) {
    json_error('bad_identifier_format', 422);
}

$res = gs_call('auth.gateway', ['identifier' => $identifier]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);

json_ok(['methods' => $res['methods']]);
