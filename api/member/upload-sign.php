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

$s = require_session();
require_method('POST');

// Cheap abuse throttle — a member should never need dozens of signatures/min.
rate_limit_check('upload.sign');

$cfg = $CONFIG['cloudinary'] ?? [];
if (empty($cfg['cloud_name']) || empty($cfg['api_key']) || empty($cfg['api_secret'])) {
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
} elseif ($kind === 'post') {
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
             'folder' => 'community'];
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
$base = trim((string)($cfg['folder'] ?? 'ngg'), '/');
$folder = $base . '/' . $sub;

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
if ($kind === 'post') {
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
    'uploadUrl'    => 'https://api.cloudinary.com/v1_1/' . $cfg['cloud_name'] . '/' . $resourceType . '/upload',
    'maxBytes'     => (int)($cfg['max_bytes'] ?? (25 * 1024 * 1024)),
]);
