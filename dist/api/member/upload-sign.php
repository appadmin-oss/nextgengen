<?php
/**
 * Cloudinary signed-upload endpoint.
 *
 * Any signed-in member (members + admins) can request a short-lived upload
 * signature. The browser then POSTs the file directly to Cloudinary — the
 * api_secret never leaves this server. Uploads are foldered per-kind and
 * scoped to the requesting member so they're easy to audit and purge.
 *
 * Request  (POST JSON): { "kind": "proof|submission|avatar|cover|headshot|…" }
 *   Configured kinds carry a resource_type/folder spec; any other safe kind
 *   (matching ^[a-z][a-z0-9_-]{1,30}$) falls back to an image upload in a
 *   folder of the same name.
 * Response: { ok, cloudName, apiKey, timestamp, signature, folder,
 *             resourceType, uploadUrl, maxBytes }
 */
require_once __DIR__ . '/../_lib/bootstrap.php';

$s = require_member_session();
require_method('POST');

// Cheap abuse throttle — a member should never need dozens of signatures/min.
rate_limit_check('upload.sign');

$cfg = $CONFIG['cloudinary'] ?? [];
/* A bucket (R2, B2 — api/_lib/object-store.php) wins when one is set: every
   new upload goes there and Cloudinary keeps serving what it already holds. */
$useStore = store_configured();
if (!$useStore && (empty($cfg['cloud_name']) || empty($cfg['api_key']) || empty($cfg['api_secret']))) {
    json_error('uploads_disabled', 503);
}

$body = read_json_body();
$kind = (string)($body['kind'] ?? 'proof');
$kinds = $cfg['kinds'] ?? [];

// Configured kinds win. For any other kind we fall back to a safe image spec
// rather than rejecting it — this keeps the client and server from having to
// move in lockstep every time a new upload surface (e.g. "headshot") ships,
// and means an older config.php on a host without shell access still works.
// The kind is strictly sanitised first so it can never escape the base folder.
if (isset($kinds[$kind])) {
    $spec = $kinds[$kind];
} elseif ($kind === 'post' || $kind === 'assignment') {
    /* Community feed media. FOUR kinds, not two.
     *
     * This used to be image-or-video, and everything that was not a video was
     * signed as an image — which is how a shared PDF came back a PNG. Cloudinary
     * accepts a PDF on the image endpoint (it treats one as a multi-page image),
     * and the `f_auto` incoming transformation below then rasterised page 1 and
     * stored THAT. The original document was never kept, the delivered URL ended
     * `.png`, and the community's PDF viewer — which keys on the extension —
     * correctly concluded there was no PDF to show. One cause, both symptoms.
     *
     *  · pdf   → the image pipeline (so `pg_n` page thumbnails stay available)
     *            but with NO incoming transformation, so the stored asset is the
     *            document the member chose and the URL still ends `.pdf`.
     *  · raw   → everything else a member may attach (docx, xlsx, zip, txt…).
     *            Cloudinary cannot process these at all; `raw` stores the bytes
     *            verbatim, which is exactly what a document attachment wants.
     *  · video → unchanged.
     *  · image → unchanged.
     */
    $mk = upload_media_kind((string)($body['mediaKind'] ?? 'image'));
    $spec = ['resource_type' => $mk === 'raw' ? 'raw' : ($mk === 'video' ? 'video' : 'image'),
             'folder' => $kind === 'assignment' ? 'assignments' : 'community'];
} elseif (preg_match('/^[a-z][a-z0-9_-]{1,30}$/', $kind)) {
    $spec = ['resource_type' => 'image', 'folder' => $kind];
} else {
    json_error('bad_kind', 400);
}

// `cover` uploads are an editorial action — restrict to admins.
if ($kind === 'cover') {
    require_admin();
}

$resourceType = $spec['resource_type'] ?? 'auto';
$sub = $spec['folder'] ?? $kind;

if ($useStore) {
    /* The same kinds and folders as Cloudinary's, and the same media rule: an
       image kind takes only images; a post or a hand-in takes what it is. No
       server-side transformation exists on a bucket, so images arrive already
       shrunk by the browser (api-client.js shrinkForUpload). */
    /* A post or a hand-in is what the file is (Cloudinary files a PDF under
       `image`, which here would refuse it); any other image kind takes images. */
    $mediaAware0 = $kind === 'post' || $kind === 'assignment';
    $mk = !$mediaAware0 && $resourceType === 'image' ? 'image' : upload_media_kind((string)($body['mediaKind'] ?? 'image'));
    $sc = $CONFIG['storage'] ?? [];
    /* Already stored? The same bytes (verified hash and size) are handed back
       and nothing is uploaded — no storage, no data spent (media-objects.php). */
    $dup = media_obj_find_dup(strtolower((string)($body['sha256'] ?? '')), (int)($body['size'] ?? 0), store_formats($mk));
    if ($dup) json_ok(media_obj_reuse_answer($dup));
    $r = store_upload_spec((string)preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$sub)), $mk, (string)($body['name'] ?? ''), (string)($body['contentType'] ?? ''),
                           $body['size'] ?? 0, (int)($sc['max_bytes'] ?? ($cfg['max_bytes'] ?? STORE_MAX_BYTES)), store_owner_segment((string)($s['mid'] ?? '')));
    if (empty($r['ok'])) json_error((string)$r['error'], 400, (string)($r['detail'] ?? ''));
    media_obj_record_signed($r, (string)($s['mid'] ?? ''), (string)$kind);
    json_ok($r);
}
$base = trim((string)($cfg['folder'] ?? 'ngg'), '/');
/* One folder per uploader (a keyed hash, never the id itself), so one
   person's files can be found and purged together. */
$owner = store_owner_segment((string)($s['mid'] ?? ''));
$folder = $base . '/' . $sub . ($owner !== '' ? '/' . $owner : '');

$timestamp = time();

// Cloudinary signature = SHA1 of the sorted `key=value` params (excluding
// file, cloud_name, resource_type and api_key) with the api_secret appended.
// We sign folder + timestamp. Adding more params here means adding them to
// the FormData on the client too — keep the two in lockstep.
$signParams = [
    'folder'    => $folder,
    'timestamp' => $timestamp,
];

// Storage-lean community media. Any signed param must be echoed back so the
// client appends it to the FormData — keep the two in lockstep.
//
//  · Images: an INCOMING transformation compresses the asset BEFORE it is
//    stored (Cloudinary keeps the transformed version, not the raw phone photo)
//    — capped to 1600px at q_auto:good. Genuine at-rest storage savings.
//  · Video: an eager, async 720p web-optimized derivative for smooth playback;
//    delivery-time f_auto/q_auto keeps bytes down until the eager job lands.
//  · Documents: NOTHING. A document is not something to re-encode — the point
//    of attaching one is that the person who opens it gets the file that was
//    sent. `use_filename` keeps the member's own filename (and, crucially, its
//    extension) on the delivered URL, so a `.pdf` stays recognisably a `.pdf`
//    to the viewer, the browser and the person downloading it.
$eager = ''; $incoming = ''; $useFilename = false;
// Storage full: refuse before signing, so nothing new tips the plan over (media-storage.php).
if (function_exists('media_uploads_allowed') && !media_uploads_allowed()) { $r = media_full_refusal(); json_error($r['error'], 503, $r['detail']); }
/* Every IMAGE upload is compressed before it is stored, not only community
   posts: headshots, avatars, covers and any image kind. A document, a video
   or an `auto` upload whose client did not say it is an image is left alone. */
$isImage = $resourceType === 'image' || ($resourceType === 'auto' && upload_media_kind((string)($body['mediaKind'] ?? '')) === 'image' && isset($body['mediaKind']));
/* A hand-in is media-aware like a post: a PDF stays a PDF, a recording is
   stored as audio/video, a photo is compressed. */
$mediaAware = $kind === 'post' || $kind === 'assignment';
if (!$mediaAware && $isImage) {
    $incoming = media_incoming_transformation($kind);
    $signParams['transformation'] = $incoming;
}
if ($mediaAware) {
    $mk = upload_media_kind((string)($body['mediaKind'] ?? 'image'));
    if ($mk === 'video') {
        $eager = 'f_auto,q_auto:eco,w_1280,c_limit';
        $signParams['eager'] = $eager;
        $signParams['eager_async'] = 'true';
    } elseif ($mk === 'pdf' || $mk === 'raw') {
        $useFilename = true;
        $signParams['use_filename'] = 'true';
        $signParams['unique_filename'] = 'true';
    } else {
        $incoming = 'c_limit,w_1600,q_auto:good,f_auto';
        $signParams['transformation'] = $incoming;
    }
}

/* Formats are pinned in the signature too: an image kind stores only images,
   a hand-in only the formats its media kind allows. Without it, a signature
   asked for "a photo" could be spent on any file at all. */
$fmtKind = $mediaAware ? upload_media_kind((string)($body['mediaKind'] ?? 'image')) : ($resourceType === 'image' ? 'image' : upload_media_kind((string)($body['mediaKind'] ?? 'image')));
// Cloudinary converts a phone's HEIC on delivery, so it may take one; the bucket cannot.
$allowedFormats = implode(',', array_merge(store_formats($fmtKind), $fmtKind === 'image' ? ['heic', 'heif', 'avif'] : []));
$signParams['allowed_formats'] = $allowedFormats;

ksort($signParams);
$toSign = [];
foreach ($signParams as $k => $v) {
    $toSign[] = $k . '=' . $v;
}
$signature = sha1(implode('&', $toSign) . $cfg['api_secret']);

json_ok([
    'cloudName'    => $cfg['cloud_name'],
    'apiKey'       => (string)$cfg['api_key'],
    'timestamp'    => $timestamp,
    'signature'    => $signature,
    'folder'       => $folder,
    'resourceType' => $resourceType,
    'eager'        => $eager,
    'eagerAsync'   => $eager !== '',
    'transformation' => $incoming,
    'useFilename'  => $useFilename,
    'allowedFormats' => $allowedFormats,
    'uploadUrl'    => 'https://api.cloudinary.com/v1_1/' . $cfg['cloud_name'] . '/' . $resourceType . '/upload',
    'maxBytes'     => (int)($cfg['max_bytes'] ?? (25 * 1024 * 1024)),
]);
