<?php
/**
 * Afrovanguard asking for NGG's volunteers (domain/ngv-portal.php → av_volunteer_feed).
 *
 * Signed with the secret NGG already shares with Afrovanguard
 * (config.php → afrovanguard.ngv_webhook_secret, the same value as
 * NGG_WEBHOOK_SECRET there), under its own purpose:
 *   X-NGG-Timestamp: unix seconds (±300 s)
 *   X-NGG-Signature: sha256=hex(HMAC_SHA256(secret, "volunteers." + ts + "." + body))
 * Body: {op: "volunteers", after?: cursor, limit?: ≤200}
 *    or {op: "volunteer_sessions", after?: attendance id, limit?: 1..500 (200)}
 *       → every session an NGG volunteer served (av_volunteer_sessions).
 * With no secret configured the endpoint does not exist.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('hook');

$secret = trim((string)($CONFIG['afrovanguard']['ngv_webhook_secret'] ?? ''));
if ($secret === '') json_error('hook_disabled', 404);

$raw = file_get_contents('php://input', false, null, 0, 16 * 1024) ?: '';
if (!av_volunteer_signature_ok($secret, (string)($_SERVER['HTTP_X_NGG_TIMESTAMP'] ?? ''), $raw, (string)($_SERVER['HTTP_X_NGG_SIGNATURE'] ?? ''))) {
    audit('hook.afrovanguard.bad_sig', null, '', ['ip' => client_ip()], client_ip());
    json_error('bad_signature', 401);
}
$body = json_decode($raw, true);
if (!is_array($body)) json_error('bad_json', 422);

if ((string)($body['op'] ?? '') === 'volunteers') {
    $res = av_volunteer_feed($body);
    unset($res['ok']);
    json_ok($res);
}
if ((string)($body['op'] ?? '') === 'volunteer_sessions') {
    $res = av_volunteer_sessions($body);
    unset($res['ok']);
    json_ok($res);
}
json_error('unknown_op', 400);
