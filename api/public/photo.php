<?php
/**
 * Locally-held image — streams an original captured through an inline intake
 * path (see photo_store_put).
 *
 * This exists because Cloudinary is opt-in. The public self-registration form
 * has no session and cannot use the signed upload path, so it posts its
 * headshot inline; with no cloud configured there was nowhere to put the bytes
 * and the review desk showed an empty frame for the one thing it exists to look
 * at. The store keeps the original and this endpoint serves it.
 *
 * The id is an HMAC of the file's bytes under the app secret, so it is
 * unguessable and unenumerable — the URL is the capability. No session is
 * required for the same reason a Cloudinary delivery URL needs none: the
 * reviewer's page, the ID card, the guardian's email and the printed sheet all
 * render the image from an <img>, and several of those have no session to
 * present. What is NOT public is the id, which only appears on a record a
 * signed-in reviewer or the guardian's own token can read.
 *
 * Served immutable for a year: the id changes when the bytes change, because it
 * IS the bytes. That is what makes it safe to cache forever.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('photo');

$p = (string)($_GET['p'] ?? '');
// Search every candidate store directory, not just the one a fresh write would
// pick: an image written to the cache fallback (api/storage briefly unwritable)
// or before the store's base path last moved is still on disk, and must serve
// rather than 404 while its id is on the record.
$path = function_exists('photo_store_find') ? photo_store_find($p)
      : (function_exists('photo_store_path') ? photo_store_path($p) : '');
// A bad id and a missing file are the same answer on purpose: distinguishing
// them would turn this into an oracle for which photos exist.
if ($path === '' || !is_file($path)) { http_response_code(404); exit; }

$types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Cache-Control: public, max-age=31536000, immutable');
/* A child's headshot must not be indexed or handed to a third party by the
   browser on the way to one. */
header('X-Robots-Tag: noindex, noimageindex');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');

/* Revalidation, so a reviewer paging back through a queue re-renders from the
   browser cache instead of re-downloading every headshot. The tag is the id,
   which is already a content hash. */
$etag = '"' . $p . '"';
header('ETag: ' . $etag);
if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    photo_heal($p, $path);   // migrate off disposable storage even on a cache hit
    exit;
}

header('Content-Length: ' . filesize($path));
readfile($path);

// Self-heal AFTER the bytes are out, so it never delays delivery: if this
// served from the disposable cache fallback while a durable directory is
// writable, copy it there so a cache purge can no longer lose it. Best-effort;
// wrapped so a storage hiccup can never turn a successful read into a 500.
photo_heal($p, $path);

function photo_heal(string $id, string $path): void {
    if (!function_exists('photo_store_heal')) return;
    try { photo_store_heal($id, $path); } catch (Throwable $e) { /* a bonus, never fatal */ }
}
