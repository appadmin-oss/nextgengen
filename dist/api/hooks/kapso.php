<?php
/**
 * Kapso webhook: WhatsApp messages received, and the status of the ones we sent (domain/kapso.php).
 *
 * Kapso signs every delivery: X-Webhook-Signature is the hex HMAC-SHA256 of the raw body with the
 * webhook's secret (Control Room → Settings → API keys → WhatsApp (Kapso) → Webhook secret), and the event
 * name is in X-Webhook-Event. Anything unsigned or wrongly signed is refused; with no secret set the
 * endpoint does not exist. A verified delivery is always answered 200, so one bad event is not retried.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('hook');
if (!kapso_on() || kapso_cfg()['webhook_secret'] === '') json_error('hook_disabled', 404);
$raw = file_get_contents('php://input', false, null, 0, 512 * 1024) ?: '';
if (!kapso_signature_ok($raw, (string)($_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? ''))) {
    audit('hook.kapso.bad_sig', null, '', ['ip' => client_ip()], client_ip());
    json_error('bad_signature', 401);
}
$body = json_decode($raw, true);
if (is_array($body)) {
    try { gs_call('hooks.kapso', ['event' => (string)($_SERVER['HTTP_X_WEBHOOK_EVENT'] ?? ''), 'body' => $body]); }
    catch (Throwable $e) { error_log('[kapso] ' . $e->getMessage()); }
}
http_response_code(200); echo 'ok';
