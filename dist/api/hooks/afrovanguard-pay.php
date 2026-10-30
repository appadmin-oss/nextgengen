<?php
/**
 * Afrovanguard asking for one person's NGG volunteer pay, to show on their
 * Afrovanguard wallet (domain/volunteer-pay.php → volpay_for_afrovanguard).
 *
 * Signed with the secret NGG already shares with Afrovanguard
 * (config.php → afrovanguard.ngv_webhook_secret, the same value as
 * NGG_WEBHOOK_SECRET there), under its own purpose:
 *   X-NGG-Timestamp: unix seconds (±300 s)
 *   X-NGG-Signature: sha256=hex(HMAC_SHA256(secret, "volunteer_pay." + ts + "." + body))
 * Body: {op: "wallet", email, volunteerId?}
 *     | {op: "bank_set", email, volunteerId?, bankName, accountNumber, accountName}
 * With no secret configured the endpoint does not exist.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') json_error('method_not_allowed', 405);
rate_limit_check('hook');

$secret = trim((string)($CONFIG['afrovanguard']['ngv_webhook_secret'] ?? ''));
if ($secret === '') json_error('hook_disabled', 404);

$raw = file_get_contents('php://input', false, null, 0, 16 * 1024) ?: '';
if (!volpay_av_signature_ok($secret, (string)($_SERVER['HTTP_X_NGG_TIMESTAMP'] ?? ''), $raw, (string)($_SERVER['HTTP_X_NGG_SIGNATURE'] ?? ''))) {
    audit('hook.afrovanguard_pay.bad_sig', null, '', ['ip' => client_ip()], client_ip());
    json_error('bad_signature', 401);
}
$body = json_decode($raw, true);
if (!is_array($body)) json_error('bad_json', 422);
$op = (string)($body['op'] ?? '');
if ($op === 'wallet') $res = volpay_for_afrovanguard($body);
elseif ($op === 'bank_set') $res = volpay_bank_from_afrovanguard($body);
else json_error('unknown_op', 400);
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), 422, (string)($res['message'] ?? ''));
unset($res['ok']);
json_ok($res);
