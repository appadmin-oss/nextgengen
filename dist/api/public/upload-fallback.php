<?php
/**
 * "A configured media cloud refused an upload, so the image was kept locally."
 *
 * The client falls back to storing an image inline whenever Cloudinary cannot be
 * used, which is correct — a family finishing a registration at 9pm must not be
 * blocked by somebody else's API — but it used to be completely silent. A cloud
 * with rotated keys, an exhausted plan or a firewall in front of it behaved
 * exactly like a healthy one from every screen in the product. The only way to
 * find out was to open the Cloudinary dashboard and notice nothing new had
 * arrived, which is how this was eventually reported.
 *
 * PUBLIC on purpose: the surfaces that upload without a session — the public
 * application form, gate registration, the guardian re-shoot page — are exactly
 * the ones a family uses, and a fault only visible to signed-in staff is a fault
 * nobody sees. Nothing here trusts the caller: the body is two short strings
 * that are clamped and stored as an ops event, there is no read side, and
 * ops_record() collapses repeats into a hit count so a broken deployment cannot
 * fill a table one submission at a time.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';

require_method('POST');
// A page reports at most once, but a broken deployment has many pages.
rate_limit_check('upload.fallback');

$b = read_json_body();
$kind = preg_replace('/[^a-z0-9_-]/i', '', (string)($b['kind'] ?? 'unknown')) ?: 'unknown';
$reason = mb_substr(trim((string)($b['reason'] ?? '')), 0, 200);

/* Only worth recording when a cloud is actually configured. A deployment
 * running deliberately without Cloudinary stores every photograph locally by
 * design, and a warning for the intended behaviour is a warning people learn to
 * ignore — which costs you the one that matters. */
$cfg = $GLOBALS['CONFIG']['cloudinary'] ?? [];
if (!empty($cfg['cloud_name']) && !empty($cfg['api_key']) && !empty($cfg['api_secret'])) {
    ops_record('warn', 'cloudinary.upload', 'Upload fell back to local storage',
        'kind=' . $kind . ($reason !== '' ? ' · ' . $reason : ''));
}

// Always ok: this is telemetry about a failure that has already been handled.
json_ok(['recorded' => true]);
