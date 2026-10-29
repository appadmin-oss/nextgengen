<?php
/**
 * Make.com — the one door back in. Spec: docs/make.md.
 *
 * Signed exactly like the attendance hook and our own outbound webhooks:
 *   X-NGG-Timestamp:  unix seconds (±300s accepted)
 *   X-NGG-Signature:  sha256=hex(HMAC_SHA256(secret, timestamp + "." + rawBody))
 * Body: {"action": "absence.reason", …}. The actions and what each may do are
 * in domain/make.php — this file only checks the signature and hands over.
 * The secret is made in Control Room → Settings → Integrations → Make.com
 * (config.php 'hooks' => ['make_secret'] still works); none = endpoint off,
 * and off answers 404.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('hook');

$secret = make_secret();   // made on screen (Settings → Integrations → Make.com), or config.php
if ($secret === '') json_error('hook_disabled', 404);

$raw = file_get_contents('php://input') ?: '';
$ts = (string)($_SERVER['HTTP_X_NGG_TIMESTAMP'] ?? '');
$sig = (string)($_SERVER['HTTP_X_NGG_SIGNATURE'] ?? '');
if (!hook_verify_signature($secret, $ts, $raw, $sig)) {
    audit('hook.make.bad_sig', null, '', ['ip' => client_ip()], client_ip());
    json_error('bad_signature', 401);
}

$body = json_decode($raw, true);
if (!is_array($body)) json_error('bad_json', 422);
unset($body['requesterId']);   // a hook acts as nobody — never as a staff account

$res = gs_call('hooks.make', ['ip' => client_ip()] + $body);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'not_found' ? 404 : 400);
unset($res['ok']); json_ok($res);
