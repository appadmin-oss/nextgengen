<?php
/**
 * Locally-held image — streams an original captured through an inline intake
 * path (see photo_store_put), or one of its NAMED SIZES (image-sizes.php).
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
 *
 * Sizes:
 *  - `?p=<id>&s=<size>` — the store original at a named size, made once with GD
 *    and kept beside it. An unknown size serves the original; a size the photo
 *    is already within serves the original (never upscaled); a host without GD,
 *    or an image GD cannot read, serves the original. Sizing never breaks a photo.
 *  - `?u=<our bucket URL>&s=<size>` — an image in OUR bucket (store_hosted),
 *    fetched once by its key and sized on local disk. A URL that is not ours is
 *    a 404 before anything is fetched: this is not a fetch-anything proxy. When
 *    the size cannot be made, the visitor is sent to the bucket's own address.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('photo');

$size = (string)($_GET['s'] ?? '');
if (!function_exists('img_size_known') || !img_size_known($size)) $size = '';

$types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];

/* An image in our bucket, at a named size. */
if (isset($_GET['u'])) {
    $u = (string)$_GET['u'];
    // Ours, an image, and a size asked for — or the same 404 as any unknown id.
    if ($size === '' || !function_exists('img_bucket_variant') || !store_hosted($u) || !img_key_is_image(store_key_of($u))) { http_response_code(404); exit; }
    $etag = '"' . img_bucket_stem(store_key_of($u)) . '-' . $size . '"';
    if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) { photo_headers(); header('ETag: ' . $etag); http_response_code(304); exit; }
    try { $v = img_bucket_variant($u, $size); } catch (Throwable $e) { $v = ['skip' => 'failed']; }
    if (empty($v['path'])) {
        // Not made (already small, no GD, the fetch failed): the original, from the bucket itself.
        header('Cache-Control: public, max-age=3600');
        header('Referrer-Policy: no-referrer');
        header('Location: ' . $u, true, 302);
        exit;
    }
    photo_headers();
    header('Content-Type: ' . ($types[strtolower(pathinfo($v['path'], PATHINFO_EXTENSION))] ?? 'image/jpeg'));
    header('ETag: ' . $etag);
    header('Content-Length: ' . filesize($v['path']));
    readfile($v['path']);
    exit;
}

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

photo_headers();

/* Revalidation, so a reviewer paging back through a queue re-renders from the
   browser cache instead of re-downloading every headshot. The tag is the id,
   which is already a content hash — plus the size, for a made size. */
$etag = '"' . $p . ($size !== '' ? '-' . $size : '') . '"';
header('ETag: ' . $etag);
if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    photo_heal($p, $path);   // migrate off disposable storage even on a cache hit
    exit;
}

// The made size, made now if it is not yet. Falls back to the original on any failure.
$serve = $path;
if ($size !== '') { try { $serve = img_store_variant($path, $size); } catch (Throwable $e) { $serve = $path; } }
if ($serve === '' || !is_file($serve)) $serve = $path;

$ext = strtolower(pathinfo($serve, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($serve));
readfile($serve);

// Self-heal AFTER the bytes are out, so it never delays delivery: if this
// served from the disposable cache fallback while a durable directory is
// writable, copy it there so a cache purge can no longer lose it. Best-effort;
// wrapped so a storage hiccup can never turn a successful read into a 500.
photo_heal($p, $path);

function photo_headers(): void {
    header('Cache-Control: public, max-age=31536000, immutable');
    /* A child's headshot must not be indexed or handed to a third party by the
       browser on the way to one. */
    header('X-Robots-Tag: noindex, noimageindex');
    header('Referrer-Policy: no-referrer');
    header('X-Content-Type-Options: nosniff');
}

function photo_heal(string $id, string $path): void {
    if (!function_exists('photo_store_heal')) return;
    try { photo_store_heal($id, $path); } catch (Throwable $e) { /* a bonus, never fatal */ }
}
