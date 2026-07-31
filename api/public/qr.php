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

/* Encode it now if nothing has cached one.
 *
 * This endpoint used to 404 on a cache miss, and the miss is the common case in
 * exactly the situation that matters: the email is already sent. Every ID message
 * carries an <img> pointing here, so a 404 is a broken-image icon in a message
 * nobody can re-send from — and it is permanent, because the file the email is
 * waiting for was never going to appear on its own.
 *
 * Three ways to arrive at a miss, and all three are ordinary: the message went out
 * before there was a server-side encoder at all; the storage directory was cleared
 * or moved between hosts; or the send happened on a host where the write failed.
 * With an encode here, every one of those self-heals the moment somebody opens the
 * email — including messages sent months ago, because the token is the only input
 * and the token has not changed.
 *
 * The token was already checked against a real record above, so this cannot be
 * used to render an arbitrary QR: it draws the profile URL for a token that
 * exists, which is the only thing it has ever drawn. */
$path = qr_cache_path($t);
if (!is_file($path)) qr_ensure_cached($t);
if (!is_file($path)) {
    /* Still nothing — an unwritable storage directory, most likely. Serve the code
     * anyway rather than a broken image: the bytes are the point, the cache is an
     * optimisation, and a family holding a phone does not care which. */
    $png = qr_encode_png(qr_payload_for($t), 8);
    if ($png === '') { http_response_code(404); exit; }
    header('Content-Type: image/png');
    // Not cached, so not cacheable for as long — but still worth a browser cache.
    header('Cache-Control: public, max-age=3600');
    header('Content-Length: ' . strlen($png));
    echo $png;
    exit;
}

header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400');
header('Content-Length: ' . filesize($path));
readfile($path);
