<?php
/**
 * Inbound attendance webhook — the external app POSTs check-ins here.
 * Spec: docs/attendance-webhook.md (ours to publish, theirs to implement).
 *
 * Auth is a signed request (same scheme we use outbound):
 *   X-NGG-Timestamp:  unix seconds (±300s accepted)
 *   X-NGG-Signature:  sha256=hex(HMAC_SHA256(secret, timestamp + "." + rawBody))
 * Secret lives in config.php → 'hooks' => ['attendance_secret' => '…'];
 * empty secret = endpoint disabled. Idempotent by design: the unique
 * (studentId, date) index makes replays and retries harmless.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('hook');

$secret = (string)($CONFIG['hooks']['attendance_secret'] ?? '');
if ($secret === '') json_error('hook_disabled', 404);

$raw = file_get_contents('php://input') ?: '';
$ts = (string)($_SERVER['HTTP_X_NGG_TIMESTAMP'] ?? '');
$sig = (string)($_SERVER['HTTP_X_NGG_SIGNATURE'] ?? '');
if (!hook_verify_signature($secret, $ts, $raw, $sig)) {
    audit('hook.attendance.bad_sig', null, '', ['ip' => client_ip()], client_ip());
    json_error('bad_signature', 401);
}

$body = json_decode($raw, true);
if (!is_array($body)) json_error('bad_json', 422);

$res = gs_call('hooks.attendance', [
    'source' => substr((string)($body['source'] ?? 'external'), 0, 48),
    'events' => is_array($body['events'] ?? null) ? $body['events'] : [],
    'ip' => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
