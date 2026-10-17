<?php
/**
 * Sign-in gateway — step 1 of the unified door (W1). Given an identifier,
 * returns which sign-in methods apply: always ['code']; plus 'password' when
 * the account has one. A browser that has signed in here before is
 * told `no_account` plainly; to any other, unknown accounts and staff are
 * indistinguishable from ordinary members (see auth_find_member()). The
 * hidden `hp` field turns away scripts. Pre-session →
 * CSRF-exempt, rate-limited per minute and per hour.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
ensure_super_admin();
// The gateway only looks up which methods apply — it sends nothing — so it gets
// its own, more generous bucket. Sharing 'auth.request' meant one code sign-in
// spent TWO hits (gateway + request), locking out classrooms/cybercafés behind
// a single NAT after ~2-3 teens. The tighter 'auth.request' still guards the
// step that actually emails a code.
rate_limit_check('auth.gateway');
rate_limit_check('auth.gateway.hour');

$body = read_json_body();
if (bot_trap_tripped($body)) {
    audit('bot.trap', null, 'gateway', [], client_ip());
    json_error('request_failed', 400);
}
v_require($body, ['identifier']);
$identifier = auth_clean_identifier(v_safe_text($body['identifier'], 160));
if (strlen($identifier) < 3) json_error('identifier_too_short', 422);
// An email, or any ID as printed on an account or a card (auth_identifier_ok).
if (!auth_identifier_ok($identifier)) json_error('bad_identifier_format', 422);

$res = gs_call('auth.gateway', ['identifier' => $identifier, 'ip' => client_ip(), 'device' => device_trust_id()]);
if (empty($res['ok'])) {
    $e = (string)($res['error'] ?? 'failed');
    json_error($e, $e === 'too_many_misses' ? 429 : 400);
}

json_ok(['methods' => $res['methods'], 'uniform' => !empty($res['uniform'])]);
