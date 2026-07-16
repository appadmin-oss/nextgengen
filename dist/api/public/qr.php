<?php
/**
 * Public QR image — serves the check-in QR PNG for a real, assigned token so it
 * can be shown inside emails (mail clients strip data: URIs, so the ID email
 * references this hosted image). The PNG is rendered by the browser at
 * resend/approval time and cached under storage/qr; this endpoint streams it.
 * Scoped to tokens that actually exist, and rate-limited.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('qr');

$t = (string)($_GET['t'] ?? '');
if ($t === '' || !preg_match('/^[A-Za-z0-9_-]{4,64}$/', $t)) { http_response_code(404); exit; }

// Only serve a QR for a token bound to a real record (no open QR-for-anything).
$exists = db_row('SELECT 1 FROM qr_codes WHERE token = ? LIMIT 1', [$t])
    || db_row('SELECT 1 FROM summer_students WHERE token = ? LIMIT 1', [$t])
    || db_row('SELECT 1 FROM volunteers WHERE token = ? LIMIT 1', [$t]);
if (!$exists) { http_response_code(404); exit; }

$path = qr_cache_path($t);
if (!is_file($path)) { http_response_code(404); exit; }

header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400');
header('Content-Length: ' . filesize($path));
readfile($path);
