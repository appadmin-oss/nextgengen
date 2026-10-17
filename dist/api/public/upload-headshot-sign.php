<?php
/**
 * PUBLIC signed-upload endpoint — headshots only.
 *
 * The apply flow, gate registration and the guardian reshoot page are all
 * public (no session), so the session-gated member/upload-sign.php rejected
 * their uploads (401 → "uploads aren't configured"). This endpoint signs an
 * upload for the single, safe `headshot` kind so anyone completing an intake
 * can add a photo. Locked down: kind is fixed, resource_type is image, a tight
 * byte cap applies, and it's rate-limited per IP.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('upload.sign');

$cfg = $CONFIG['cloudinary'] ?? [];
/* A bucket wins when one is set (object-store.php): an image, in the headshot
   folder, at most the headshot cap — the kind is fixed here as it is below. */
if (store_configured()) {
    $body = read_json_body();
    $r = store_upload_spec('headshot', 'image', (string)($body['name'] ?? ''), (string)($body['contentType'] ?? ''), $body['size'] ?? 0,
                           (int)(($CONFIG['storage']['headshot_max_bytes'] ?? null) ?: STORE_HEADSHOT_MAX_BYTES));
    if (empty($r['ok'])) json_error((string)$r['error'], 400, (string)($r['detail'] ?? ''));
    media_obj_record_signed($r, '', 'headshot');   // an abandoned sign-up's photo is swept a week later
    json_ok($r);
}
if (empty($cfg['cloud_name']) || empty($cfg['api_key']) || empty($cfg['api_secret'])) {
    json_error('uploads_disabled', 503);
}

// Fixed spec — never trust a client-supplied kind on the public surface.
$resourceType = 'image';
$base   = trim((string)($cfg['folder'] ?? 'ngg'), '/');
$folder = $base . '/headshot';
$timestamp = time();
if (function_exists('media_uploads_allowed') && !media_uploads_allowed()) { $r = media_full_refusal(); json_error($r['error'], 503, $r['detail']); }

// Sign folder + timestamp + the incoming compression (same scheme as member/upload-sign.php).
$incoming = media_incoming_transformation('headshot');
// Pinned formats: a headshot signature cannot be spent on anything but an image.
$allowedFormats = 'jpg,jpeg,png,webp,heic,heif';
$signParams = ['folder' => $folder, 'timestamp' => $timestamp, 'transformation' => $incoming, 'allowed_formats' => $allowedFormats];
ksort($signParams);
$toSign = [];
foreach ($signParams as $k => $v) $toSign[] = $k . '=' . $v;
$signature = sha1(implode('&', $toSign) . $cfg['api_secret']);

json_ok([
    'cloudName'    => $cfg['cloud_name'],
    'apiKey'       => (string)$cfg['api_key'],
    'timestamp'    => $timestamp,
    'signature'    => $signature,
    'folder'       => $folder,
    'resourceType' => $resourceType,
    'transformation' => $incoming,
    'allowedFormats' => $allowedFormats,
    'uploadUrl'    => 'https://api.cloudinary.com/v1_1/' . $cfg['cloud_name'] . '/' . $resourceType . '/upload',
    // Headshots are small; cap tighter than the authenticated endpoint.
    'maxBytes'     => (int)($cfg['headshot_max_bytes'] ?? (8 * 1024 * 1024)),
]);
