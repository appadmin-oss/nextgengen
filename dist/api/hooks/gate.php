<?php
/**
 * The CACENTRE gate asking NGG who a card belongs to.
 *
 * CACENTRE's front door is a Cloudflare Worker that keeps no copy of NGG's
 * people. When a SUMQR-/VOLQR- card is scanned there it asks here; the
 * check-in itself comes back through hooks/attendance.php, by ref.
 *
 *   POST {op:"resolve", token}          a card this system printed (SUMQR-/VOLQR-/MEMQR-)
 *   POST {op:"resolve", format, value}  an older printed member card, decoded by the gate
 *   POST {op:"resolve", ref}            a person picked from search
 *   POST {op:"search", q, centre}       find by name, active people only
 *   POST {op:"formats"}                 the shapes NGG's printed member cards come in
 *
 * Signed exactly like hooks/attendance.php, with the same secret:
 *   X-NGG-Timestamp: unix seconds (±300 s)
 *   X-NGG-Signature: sha256=hex(HMAC_SHA256(hooks.attendance_secret, ts + "." + body))
 * Empty secret: the endpoint does not exist.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('hook');

$secret = (string)($CONFIG['hooks']['attendance_secret'] ?? '');
if ($secret === '') json_error('hook_disabled', 404);

$raw = file_get_contents('php://input') ?: '';
if (!hook_verify_signature($secret, (string)($_SERVER['HTTP_X_NGG_TIMESTAMP'] ?? ''), $raw, (string)($_SERVER['HTTP_X_NGG_SIGNATURE'] ?? ''))) {
    audit('hook.gate.bad_sig', null, '', ['ip' => client_ip()], client_ip());
    json_error('bad_signature', 401);
}
$body = json_decode($raw, true);
if (!is_array($body)) json_error('bad_json', 422);

$op = (string)($body['op'] ?? '');
if ($op === 'resolve') {
    $res = gs_call('hooks.gate.resolve', ['token' => (string)($body['token'] ?? ''), 'ref' => (string)($body['ref'] ?? ''),
        'format' => (string)($body['format'] ?? ''), 'value' => (string)($body['value'] ?? '')]);
} elseif ($op === 'formats') {
    $res = ['ok' => true, 'formats' => member_card_gate_formats()];
} elseif ($op === 'search') {
    $res = gs_call('hooks.gate.search', ['q' => (string)($body['q'] ?? ''), 'centre' => (string)($body['centre'] ?? '')]);
} else {
    json_error('unknown_op', 400);
}
/* The gate shows `error` to the person at the desk, so a refusal carries a
   sentence as well as a code. */
if (empty($res['ok'])) {
    json_send(['ok' => false, 'code' => (string)($res['code'] ?? 'refused'), 'error' => (string)($res['error'] ?? 'Refused.')],
              ($res['code'] ?? '') === 'unknown' ? 404 : 400);
}
unset($res['ok']); json_ok($res);
