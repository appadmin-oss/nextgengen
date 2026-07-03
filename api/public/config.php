<?php
/**
 * Public client bootstrap config. Safe-to-expose values only — NEVER secrets.
 * The SPA fetches this once on boot to learn whether direct media uploads are
 * available (Cloudinary configured) and which cloud to target.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';

$cld = $CONFIG['cloudinary'] ?? [];
$uploadsEnabled = !empty($cld['cloud_name']) && !empty($cld['api_key']) && !empty($cld['api_secret']);

// This response is identical for everyone and changes rarely — let the CDN
// and browser hold it briefly. (bootstrap.php sets no-store by default via
// the .htaccess header; we override here intentionally.)
header('Cache-Control: public, max-age=300');

json_ok([
    'uploads' => [
        'enabled'   => $uploadsEnabled,
        'cloudName' => $uploadsEnabled ? $cld['cloud_name'] : '',
        'maxBytes'  => (int)($cld['max_bytes'] ?? (25 * 1024 * 1024)),
    ],
]);
