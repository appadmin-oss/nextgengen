<?php
/**
 * Telegram webhook: the programme's bot (api/_lib/telegram.php). Telegram
 * sends the secret this site gave it in setWebhook on every call; anything
 * without it is refused. Always answers 200 to Telegram itself, so one bad
 * update is not retried for hours.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$sent = (string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '');
if (!telegram_on() || $sent === '' || !hash_equals(telegram_webhook_secret(), $sent)) { http_response_code(401); echo 'bad_secret'; exit; }
$raw = file_get_contents('php://input') ?: '';
$u = strlen($raw) <= 65536 ? json_decode($raw, true) : null;
if (is_array($u)) { try { gs_call('hooks.telegram', ['update' => $u]); } catch (Throwable $e) { error_log('[telegram] ' . $e->getMessage()); } }
http_response_code(200); echo 'ok';
