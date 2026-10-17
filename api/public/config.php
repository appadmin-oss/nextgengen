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

// Public (unsigned) uploads need a cloud name + an unsigned preset. Used by the
// application form so a prospective member can attach a headshot before they
// have an account. The api_secret is never involved in unsigned uploads.
$publicUpload = !empty($cld['cloud_name']) && !empty($cld['unsigned_preset']);
/* Storage full: neither cloud path is offered, so a photo goes straight to the
   site's own store and other uploads can say why (media-storage.php). The
   unsigned preset matters most here — it is the one path no signer can stop. */
$storageFull = function_exists('media_uploads_allowed') && !media_uploads_allowed();
if ($storageFull) { $uploadsEnabled = false; $publicUpload = false; }

json_ok([
    'uploads' => [
        'enabled'   => $uploadsEnabled,
        'cloudName' => $uploadsEnabled ? $cld['cloud_name'] : '',
        'maxBytes'  => (int)($cld['max_bytes'] ?? (25 * 1024 * 1024)),
    ],
    'storageFull' => $storageFull,
    'publicUpload' => [
        'enabled'   => $publicUpload,
        'cloudName' => $publicUpload ? $cld['cloud_name'] : '',
        'preset'    => $publicUpload ? $cld['unsigned_preset'] : '',
        'folder'    => $publicUpload ? (string)($cld['unsigned_folder'] ?? 'ngg/apply') : '',
    ],
    'afrovanguard' => [
        'orgUrl'        => $CONFIG['afrovanguard']['org_url'] ?? 'https://afrovanguard.org.ng',
        'stsUrl'        => $CONFIG['afrovanguard']['sts_url'] ?? 'https://afrovanguard.org.ng/projects/sts/programs/',
        'volunteerUrl'  => $CONFIG['afrovanguard']['volunteer_url'] ?? 'https://cacentre.afrovanguard.org.ng/volunteer',
        'mentorProgram' => $CONFIG['afrovanguard']['mentor_program'] ?? 'Street-To-Stardom · Next Gen',
        // NGV (18 and over) registers on Afrovanguard; the Club form sends them there.
        'ngvUrl'        => (string)(($CONFIG['afrovanguard']['ngv_url'] ?? '') ?: rtrim((string)($CONFIG['afrovanguard']['org_url'] ?? 'https://afrovanguard.org.ng'), '/') . '/academy/ngv/'),
    ],
]);
